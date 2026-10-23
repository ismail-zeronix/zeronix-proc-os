import "server-only";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { publish, setMessageLoader } from "./bus";
import { memberIds } from "./channels";
import { MAX_BODY } from "./text";
import type { ChatCard, ChatMessage, MessageKind } from "./types";

const columns = {
  id: schema.chatMessages.id,
  channelId: schema.chatMessages.channelId,
  userId: schema.chatMessages.userId,
  userName: schema.users.name,
  kind: schema.chatMessages.kind,
  body: schema.chatMessages.body,
  card: schema.chatMessages.card,
  replyToId: schema.chatMessages.replyToId,
  editedAt: schema.chatMessages.editedAt,
  deletedAt: schema.chatMessages.deletedAt,
  createdAt: schema.chatMessages.createdAt,
};

const base = () => db.select(columns).from(schema.chatMessages).leftJoin(schema.users, eq(schema.users.id, schema.chatMessages.userId));
type Row = Awaited<ReturnType<typeof base>>[number];

function toMessage(r: Row): ChatMessage {
  const deleted = !!r.deletedAt;
  return {
    id: r.id,
    channelId: r.channelId,
    userId: r.userId,
    userName: r.userName,
    kind: r.kind,
    body: deleted ? "" : r.body,
    card: deleted ? null : r.card,
    replyToId: r.replyToId,
    editedAt: r.editedAt?.toISOString() ?? null,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function getMessage(id: number): Promise<ChatMessage | null> {
  const [r] = await base().where(eq(schema.chatMessages.id, id));
  return r ? toMessage(r) : null;
}

// the bus reads big messages back by id
setMessageLoader(async (id) => {
  const message = await getMessage(id);
  return message ? { t: "message.new", message } : null;
});

/** Up to `limit` messages before `before` (newest first in the query), returned oldest first. Thread replies are left out. */
export async function loadMessages(channelId: number, opts: { before?: number; limit?: number } = {}): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const rows = await base()
    .where(
      and(
        eq(schema.chatMessages.channelId, channelId),
        isNull(schema.chatMessages.threadId),
        opts.before ? lt(schema.chatMessages.id, opts.before) : undefined,
      ),
    )
    .orderBy(desc(schema.chatMessages.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map(toMessage), hasMore };
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
  source?: string;
  sourceId?: number | null;
}

/** Saves a message, moves the conversation to the top and sends it live to everyone in it. */
export async function postMessage(input: NewMessage): Promise<ChatMessage> {
  const body = input.body.trim();
  if (!body && !input.card) throw new Error("Write a message first.");
  if (body.length > MAX_BODY) throw new Error(`Keep a message under ${MAX_BODY} characters.`);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.chatMessages)
      .values({
        channelId: input.channelId,
        userId: input.userId,
        kind: input.kind ?? (input.card ? "card" : "text"),
        body,
        card: input.card ?? null,
        mentions: input.mentions ?? [],
        replyToId: input.replyToId ?? null,
        source: input.source ?? "chat",
        sourceId: input.sourceId ?? null,
      })
      .returning({ id: schema.chatMessages.id, createdAt: schema.chatMessages.createdAt });
    await tx.update(schema.chatChannels).set({ lastMessageAt: row.createdAt }).where(eq(schema.chatChannels.id, input.channelId));
    // your own message is read by you
    if (input.userId)
      await tx
        .update(schema.chatMembers)
        .set({ lastReadId: row.id })
        .where(and(eq(schema.chatMembers.channelId, input.channelId), eq(schema.chatMembers.userId, input.userId)));
    return row.id;
  });
  const message = (await getMessage(id))!;
  await publish(await memberIds(input.channelId), { t: "message.new", message });
  return message;
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
