import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CardType } from "./cards";
import { postMessage } from "./messages";
import { parseMentions } from "./text";

/** A person's Activity feed: where cards land when someone mentions them. Created the first time it is needed. */
export async function activityFeedOf(userId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const [made] = await tx
      .insert(schema.chatChannels)
      .values({ kind: "system", name: "Activity", ownerId: userId, isPrivate: true })
      .onConflictDoNothing({ target: schema.chatChannels.ownerId })
      .returning({ id: schema.chatChannels.id });
    const id = made?.id ?? (await tx.select({ id: schema.chatChannels.id }).from(schema.chatChannels).where(eq(schema.chatChannels.ownerId, userId)))[0].id;
    await tx.insert(schema.chatMembers).values({ channelId: id, userId }).onConflictDoNothing();
    return id;
  });
}

/**
 * Sends a card to the Activity feed of everyone mentioned in `body` (not the author, only active users, at most 20).
 * The card shows the record (deal, task, company, chat message...) live for each of them, or says they cannot see it.
 * Returns who was told.
 */
export async function notifyMentions(opts: {
  authorId: number;
  body: string;
  /** What the text was: call, note, task, company, mention (a chat message)... */
  event: string;
  record: { type: CardType; id: number };
  source: string;
  sourceId: number;
  /** Only these people may be told (e.g. the members of a channel); default everyone. */
  allowed?: number[];
}): Promise<number[]> {
  let ids = parseMentions(opts.body).filter((id) => id !== opts.authorId && (!opts.allowed || opts.allowed.includes(id)));
  if (!ids.length) return [];
  const active = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(inArray(schema.users.id, ids.slice(0, 20)), eq(schema.users.isActive, true)));
  ids = ids.filter((id) => active.some((a) => a.id === id));
  for (const userId of ids) {
    await postMessage({
      channelId: await activityFeedOf(userId),
      userId: opts.authorId,
      kind: "card",
      body: opts.body,
      card: { type: opts.record.type, id: opts.record.id, event: opts.event },
      mentions: [userId],
      source: opts.source,
      sourceId: opts.sourceId,
    });
  }
  return ids;
}
