import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dmKey, previewOf } from "./text";
import type { ChannelKind, ChannelSummary, ChatUser } from "./types";

/** The one DM between two people, created the first time either of them opens it. */
export async function getOrCreateDm(me: number, peer: number): Promise<number> {
  const key = dmKey(me, peer);
  return db.transaction(async (tx) => {
    const [made] = await tx
      .insert(schema.chatChannels)
      .values({ kind: "dm", dmKey: key, createdBy: me })
      .onConflictDoNothing({ target: schema.chatChannels.dmKey })
      .returning({ id: schema.chatChannels.id });
    const id = made?.id ?? (await tx.select({ id: schema.chatChannels.id }).from(schema.chatChannels).where(eq(schema.chatChannels.dmKey, key)))[0].id;
    await tx
      .insert(schema.chatMembers)
      .values([me, peer].filter((u, i, all) => all.indexOf(u) === i).map((userId) => ({ channelId: id, userId })))
      .onConflictDoNothing();
    return id;
  });
}

/** Throws unless the user is in this conversation. Returns its kind. */
export async function assertMember(channelId: number, userId: number): Promise<ChannelKind> {
  const [row] = await db
    .select({ kind: schema.chatChannels.kind })
    .from(schema.chatMembers)
    .innerJoin(schema.chatChannels, eq(schema.chatChannels.id, schema.chatMembers.channelId))
    .where(and(eq(schema.chatMembers.channelId, channelId), eq(schema.chatMembers.userId, userId)));
  if (!row) throw new Error("That conversation does not exist or you are not in it.");
  return row.kind;
}

export async function memberIds(channelId: number): Promise<number[]> {
  const rows = await db.select({ userId: schema.chatMembers.userId }).from(schema.chatMembers).where(eq(schema.chatMembers.channelId, channelId));
  return rows.map((r) => r.userId);
}

/** Everyone in a conversation with how far they have read (for "Seen"). */
export async function membersOf(channelId: number): Promise<(ChatUser & { lastReadId: number })[]> {
  return db
    .select({ id: schema.users.id, name: schema.users.name, lastReadId: schema.chatMembers.lastReadId })
    .from(schema.chatMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatMembers.userId))
    .where(eq(schema.chatMembers.channelId, channelId))
    .orderBy(schema.users.name);
}

/** The user's conversations, most recent first, with unread counts and the last message. */
export async function listChannelsFor(userId: number): Promise<ChannelSummary[]> {
  const res = await db.execute<{
    id: number;
    kind: ChannelKind;
    name: string;
    last_message_at: Date | null;
    muted_until: Date | null;
    unread: number;
    last_body: string | null;
    last_kind: string | null;
    last_from: string | null;
    last_from_id: number | null;
  }>(sql`
    SELECT c.id, c.kind, c.name, c.last_message_at, m.muted_until,
      (SELECT count(*)::int FROM chat_messages x
        WHERE x.channel_id = c.id AND x.id > m.last_read_id AND x.thread_id IS NULL AND x.deleted_at IS NULL
          AND (x.user_id IS NULL OR x.user_id <> ${userId})) AS unread,
      lm.body AS last_body, lm.kind AS last_kind, lu.name AS last_from, lm.user_id AS last_from_id
    FROM chat_members m
    JOIN chat_channels c ON c.id = m.channel_id
    LEFT JOIN LATERAL (
      SELECT body, kind, user_id FROM chat_messages
      WHERE channel_id = c.id AND thread_id IS NULL AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 1
    ) lm ON TRUE
    LEFT JOIN users lu ON lu.id = lm.user_id
    WHERE m.user_id = ${userId} AND c.archived_at IS NULL
    ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
  `);
  const ids = res.rows.map((r) => r.id);
  const members = ids.length
    ? await db
        .select({ channelId: schema.chatMembers.channelId, id: schema.users.id, name: schema.users.name })
        .from(schema.chatMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.chatMembers.userId))
        .where(inArray(schema.chatMembers.channelId, ids))
        .orderBy(schema.users.name)
    : [];
  const byChannel = new Map<number, ChatUser[]>();
  for (const m of members) {
    const list = byChannel.get(m.channelId) ?? [];
    list.push({ id: m.id, name: m.name });
    byChannel.set(m.channelId, list);
  }
  const now = Date.now();
  return res.rows.map((r) => {
    const all = byChannel.get(r.id) ?? [];
    const peer = r.kind === "dm" ? (all.find((u) => u.id !== userId) ?? all[0] ?? null) : null;
    return {
      id: r.id,
      kind: r.kind,
      name: r.kind === "dm" ? (peer?.name ?? "Direct message") : r.name,
      peer,
      members: all,
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
      lastPreview: r.last_body != null ? previewOf(r.last_kind ?? "text", r.last_body) : "",
      lastFrom: r.last_from,
      lastFromId: r.last_from_id,
      unread: r.unread,
      muted: !!r.muted_until && new Date(r.muted_until).getTime() > now,
    };
  });
}
