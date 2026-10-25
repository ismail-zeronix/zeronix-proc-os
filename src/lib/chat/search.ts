import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { listChannelsFor } from "./channels";
import { previewOf } from "./text";

export interface SearchHit {
  id: number;
  channelId: number;
  channelName: string;
  channelKind: string;
  threadId: number | null;
  userName: string | null;
  preview: string;
  createdAt: string;
}

/** Up to 30 messages containing the words, from conversations the user is in (thread replies too), newest first. */
export async function searchMessages(userId: number, q: string): Promise<SearchHit[]> {
  const channels = await listChannelsFor(userId);
  const names = new Map(channels.map((c) => [c.id, { name: c.kind === "group" ? `#${c.name}` : c.name, kind: c.kind }]));
  // % and _ typed in the search are meant literally
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const res = await db.execute<{ id: number; channel_id: number; thread_id: number | null; body: string; kind: string; user_name: string | null; created_at: Date }>(sql`
    SELECT m.id, m.channel_id, m.thread_id, m.body, m.kind, u.name AS user_name, m.created_at
    FROM chat_messages m
    JOIN chat_members cm ON cm.channel_id = m.channel_id AND cm.user_id = ${userId}
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.deleted_at IS NULL AND m.body ILIKE ${like}
    ORDER BY m.id DESC
    LIMIT 30
  `);
  return res.rows.map((r) => ({
    id: r.id,
    channelId: r.channel_id,
    channelName: names.get(r.channel_id)?.name ?? "Conversation",
    channelKind: names.get(r.channel_id)?.kind ?? "group",
    threadId: r.thread_id,
    userName: r.user_name,
    preview: previewOf(r.kind, r.body),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
