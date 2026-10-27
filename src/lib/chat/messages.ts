import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { publish, setMessageLoader } from "./bus";
import { memberIds } from "./channels";
import { MAX_BODY, parseMentions } from "./text";
import type { ChatCard, ChatMessage, MessageKind, Reaction } from "./types";

const quoted = alias(schema.chatMessages, "quoted");
const quotedUser = alias(schema.users, "quoted_user");

const columns = {
  id: schema.chatMessages.id,
  channelId: schema.chatMessages.channelId,
  userId: schema.chatMessages.userId,
  userName: schema.users.name,
  kind: schema.chatMessages.kind,
  body: schema.chatMessages.body,
  card: schema.chatMessages.card,
  threadId: schema.chatMessages.threadId,
  replyCount: schema.chatMessages.replyCount,
  editedAt: schema.chatMessages.editedAt,
  deletedAt: schema.chatMessages.deletedAt,
  createdAt: schema.chatMessages.createdAt,
  quotedId: quoted.id,
  quotedBody: quoted.body,
  quotedDeletedAt: quoted.deletedAt,
  quotedName: quotedUser.name,
};

const select = (where: SQL | undefined) =>
  db
    .select(columns)
    .from(schema.chatMessages)
    .leftJoin(schema.users, eq(schema.users.id, schema.chatMessages.userId))
    .leftJoin(quoted, eq(quoted.id, schema.chatMessages.replyToId))
    .leftJoin(quotedUser, eq(quotedUser.id, quoted.userId))
    .where(where);
type Row = Awaited<ReturnType<typeof select>>[number];

/** Reactions per message, grouped by emoji in the order they were first used. */
async function reactionsFor(ids: number[]): Promise<Map<number, Reaction[]>> {
  const out = new Map<number, Reaction[]>();
  if (!ids.length) return out;
  const rows = await db
    .select({ messageId: schema.chatReactions.messageId, emoji: schema.chatReactions.emoji, userId: schema.chatReactions.userId })
    .from(schema.chatReactions)
    .where(inArray(schema.chatReactions.messageId, ids));
  for (const r of rows) {
    const list = out.get(r.messageId) ?? [];
    const hit = list.find((x) => x.emoji === r.emoji);
    if (hit) hit.userIds.push(r.userId);
    else list.push({ emoji: r.emoji, userIds: [r.userId] });
    out.set(r.messageId, list);
  }
  return out;
}

async function hydrate(rows: Row[]): Promise<ChatMessage[]> {
  const reactions = await reactionsFor(rows.map((r) => r.id));
  return rows.map((r) => {
    const deleted = !!r.deletedAt;
    return {
      id: r.id,
      channelId: r.channelId,
      userId: r.userId,
      userName: r.userName,
      kind: r.kind,
      body: deleted ? "" : r.body,
      card: deleted ? null : r.card,
      replyTo:
        r.quotedId != null
          ? { id: r.quotedId, userName: r.quotedName, body: r.quotedDeletedAt ? "" : (r.quotedBody ?? "").slice(0, 200), deleted: !!r.quotedDeletedAt }
          : null,
      threadId: r.threadId,
      replyCount: r.replyCount,
      reactions: deleted ? [] : (reactions.get(r.id) ?? []),
      editedAt: r.editedAt?.toISOString() ?? null,
      deletedAt: r.deletedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function getMessage(id: number): Promise<ChatMessage | null> {
  const [m] = await hydrate(await select(eq(schema.chatMessages.id, id)));
  return m ?? null;
}

// the bus reads big messages back by id
setMessageLoader(async (id) => {
  const message = await getMessage(id);
  return message ? { t: "message.new", message } : null;
});

/** Up to `limit` messages before `before`, returned oldest first. Thread replies are left out (they open under their message). */
export async function loadMessages(channelId: number, opts: { before?: number; limit?: number } = {}): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const rows = await select(
    and(eq(schema.chatMessages.channelId, channelId), isNull(schema.chatMessages.threadId), opts.before ? lt(schema.chatMessages.id, opts.before) : undefined),
  )
    .orderBy(desc(schema.chatMessages.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  return { messages: await hydrate(rows.slice(0, limit).reverse()), hasMore };
}

/** A message and its thread replies, oldest first. */
export async function loadThread(rootId: number): Promise<{ root: ChatMessage; replies: ChatMessage[] } | null> {
  const root = await getMessage(rootId);
  if (!root || root.threadId) return null;
  const rows = await select(eq(schema.chatMessages.threadId, rootId)).orderBy(asc(schema.chatMessages.id)).limit(500);
  return { root, replies: await hydrate(rows) };
}

export interface NewMessage {
  channelId: number;
  /** Null = written by the portal. */
  userId: number | null;
  body: string;
  kind?: MessageKind;
  card?: ChatCard | null;
  mentions?: number[];
  replyToId?: number | null;
  threadId?: number | null;
  source?: string;
  sourceId?: number | null;
}

/** Saves a message, moves the conversation to the top and sends it live to everyone in it. */
export async function postMessage(input: NewMessage): Promise<ChatMessage> {
  const body = input.body.trim();
  if (!body && !input.card) throw new Error("Write a message first.");
  if (body.length > MAX_BODY) throw new Error(`Keep a message under ${MAX_BODY} characters.`);
  // a quote or a thread reply must point at a message in the same conversation; threads are one level deep
  for (const ref of [input.replyToId, input.threadId]) {
    if (!ref) continue;
    const [m] = await db
      .select({ channelId: schema.chatMessages.channelId, threadId: schema.chatMessages.threadId })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, ref));
    if (!m || m.channelId !== input.channelId) throw new Error("The message you are answering is gone.");
    if (ref === input.threadId && m.threadId) throw new Error("Reply in the thread of the first message.");
  }
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.chatMessages)
      .values({
        channelId: input.channelId,
        userId: input.userId,
        kind: input.kind ?? (input.card ? "card" : "text"),
        body,
        card: input.card ?? null,
        mentions: input.mentions ?? parseMentions(body),
        replyToId: input.replyToId ?? null,
        threadId: input.threadId ?? null,
        source: input.source ?? "chat",
        sourceId: input.sourceId ?? null,
      })
      .returning({ id: schema.chatMessages.id, createdAt: schema.chatMessages.createdAt });
    if (input.threadId) {
      await tx
        .update(schema.chatMessages)
        .set({ replyCount: sql`${schema.chatMessages.replyCount} + 1` })
        .where(eq(schema.chatMessages.id, input.threadId));
    } else {
      await tx.update(schema.chatChannels).set({ lastMessageAt: row.createdAt }).where(eq(schema.chatChannels.id, input.channelId));
      // your own message is read by you
      if (input.userId)
        await tx
          .update(schema.chatMembers)
          .set({ lastReadId: row.id })
          .where(and(eq(schema.chatMembers.channelId, input.channelId), eq(schema.chatMembers.userId, input.userId)));
    }
    return row.id;
  });
  const message = (await getMessage(id))!;
  const to = await memberIds(input.channelId);
  await publish(to, { t: "message.new", message });
  if (input.threadId) {
    const root = await getMessage(input.threadId);
    if (root) await publish(to, { t: "message.update", message: root });
  }
  return message;
}

/** The message, if this user wrote it (or is an admin, who may remove anything). */
async function ownMessage(id: number, userId: number, isAdmin: boolean) {
  const [m] = await db
    .select({ channelId: schema.chatMessages.channelId, userId: schema.chatMessages.userId, deletedAt: schema.chatMessages.deletedAt })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.id, id));
  if (!m || m.deletedAt) throw new Error("That message is gone.");
  if (m.userId !== userId && !isAdmin) throw new Error("You can only change your own messages.");
  return m;
}

export async function editMessage(id: number, userId: number, body: string): Promise<ChatMessage> {
  const text = body.trim();
  if (!text) throw new Error("Write something, or delete the message.");
  if (text.length > MAX_BODY) throw new Error(`Keep a message under ${MAX_BODY} characters.`);
  const m = await ownMessage(id, userId, false);
  await db.update(schema.chatMessages).set({ body: text, editedAt: new Date() }).where(eq(schema.chatMessages.id, id));
  const message = (await getMessage(id))!;
  await publish(await memberIds(m.channelId), { t: "message.update", message });
  return message;
}

/** Deletes softly: the message stays as "Message deleted" so replies still make sense. */
export async function deleteMessage(id: number, userId: number, isAdmin: boolean): Promise<void> {
  const m = await ownMessage(id, userId, isAdmin);
  await db.update(schema.chatMessages).set({ deletedAt: new Date() }).where(eq(schema.chatMessages.id, id));
  await db.delete(schema.chatReactions).where(eq(schema.chatReactions.messageId, id));
  const message = (await getMessage(id))!;
  await publish(await memberIds(m.channelId), { t: "message.update", message });
}

/** Adds the reaction, or takes it away if this person already gave it. */
export async function toggleReaction(messageId: number, userId: number, emoji: string): Promise<Reaction[]> {
  const [m] = await db
    .select({ channelId: schema.chatMessages.channelId, threadId: schema.chatMessages.threadId, deletedAt: schema.chatMessages.deletedAt })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.id, messageId));
  if (!m || m.deletedAt) throw new Error("That message is gone.");
  const removed = await db
    .delete(schema.chatReactions)
    .where(and(eq(schema.chatReactions.messageId, messageId), eq(schema.chatReactions.userId, userId), eq(schema.chatReactions.emoji, emoji)))
    .returning({ emoji: schema.chatReactions.emoji });
  if (!removed.length) await db.insert(schema.chatReactions).values({ messageId, userId, emoji }).onConflictDoNothing();
  const reactions = (await reactionsFor([messageId])).get(messageId) ?? [];
  await publish(await memberIds(m.channelId), { t: "reaction", channelId: m.channelId, messageId, threadId: m.threadId, reactions });
  return reactions;
}

/** Which conversation a message is in (to check the user may act on it). */
export async function channelOf(messageId: number): Promise<number | null> {
  const [m] = await db.select({ channelId: schema.chatMessages.channelId }).from(schema.chatMessages).where(eq(schema.chatMessages.id, messageId));
  return m?.channelId ?? null;
}

/** Marks everything up to `upTo` as read for this user, and tells their other tabs and the others in the conversation. */
export async function markRead(channelId: number, userId: number, upTo: number): Promise<void> {
  const [row] = await db
    .update(schema.chatMembers)
    .set({ lastReadId: sql`GREATEST(${schema.chatMembers.lastReadId}, ${upTo})` })
    .where(and(eq(schema.chatMembers.channelId, channelId), eq(schema.chatMembers.userId, userId)))
    .returning({ lastReadId: schema.chatMembers.lastReadId });
  if (row) await publish(await memberIds(channelId), { t: "read", channelId, userId, lastReadId: row.lastReadId });
}
