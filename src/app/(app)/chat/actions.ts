"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertChat } from "@/lib/chat/access";
import { assertMember, getOrCreateDm } from "@/lib/chat/channels";
import { markRead, postMessage } from "@/lib/chat/messages";
import { MAX_BODY } from "@/lib/chat/text";
import type { ChatMessage } from "@/lib/chat/types";

const id = z.number().int().positive();

/** Opens (or creates) the direct message with a teammate. Returns the conversation id. */
export async function startDm(peerId: number): Promise<number> {
  const { user } = await assertChat();
  id.parse(peerId);
  const [peer] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, peerId), eq(schema.users.isActive, true)));
  if (!peer) throw new Error("That person is not in the portal any more.");
  return getOrCreateDm(user.id, peerId);
}

const sendSchema = z.object({
  channelId: id,
  body: z.string().trim().min(1, "Write a message first.").max(MAX_BODY, `Keep a message under ${MAX_BODY} characters.`),
  replyToId: id.nullish(),
});

export async function sendMessage(input: z.input<typeof sendSchema>): Promise<ChatMessage> {
  const { user } = await assertChat();
  const { channelId, body, replyToId } = sendSchema.parse(input);
  await assertMember(channelId, user.id);
  return postMessage({ channelId, userId: user.id, body, replyToId });
}

/** Everything up to this message has been seen. */
export async function markChannelRead(channelId: number, upTo: number): Promise<void> {
  const { user } = await assertChat();
  id.parse(channelId);
  id.parse(upTo);
  await assertMember(channelId, user.id);
  await markRead(channelId, user.id, upTo);
}
