"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertDeal } from "@/lib/auth/visibility";
import { assertChat } from "@/lib/chat/access";
import {
  addMembers as addToChannel,
  channelSummary,
  createGroup as makeGroup,
  getOrCreateDealThread,
  getOrCreateDm,
  joinGroup as join,
  memberIds,
  openChannel,
  removeMember,
  updateGroup as saveGroup,
} from "@/lib/chat/channels";
import { notifyMentions } from "@/lib/chat/mentions";
import { channelOf, deleteMessage as removeMessage, editMessage as saveEdit, markRead, postMessage, toggleReaction as toggle } from "@/lib/chat/messages";
import { MAX_BODY } from "@/lib/chat/text";
import type { ChannelSummary, ChatMessage, Reaction } from "@/lib/chat/types";

const id = z.number().int().positive();
const body = z.string().trim().min(1, "Write a message first.").max(MAX_BODY, `Keep a message under ${MAX_BODY} characters.`);

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

/** The chat thread of a deal (or of the project on that deal), for its Chat tab. */
export async function openDealThread(dealId: number): Promise<ChannelSummary> {
  const access = await assertChat();
  id.parse(dealId);
  await assertDeal(dealId);
  const channelId = await getOrCreateDealThread(dealId);
  await openChannel(channelId, access); // joins admins / "All data" users who are not on the deal
  const summary = await channelSummary(channelId, access.user.id);
  if (!summary) throw new Error("Could not open the deal's chat.");
  return summary;
}

const sendSchema = z.object({
  channelId: id,
  body,
  replyToId: id.nullish(),
  threadId: id.nullish(),
});

export async function sendMessage(input: z.input<typeof sendSchema>): Promise<ChatMessage> {
  const access = await assertChat();
  const { channelId, body, replyToId, threadId } = sendSchema.parse(input);
  const ch = await openChannel(channelId, access);
  if (ch.archived) throw new Error("This channel is archived.");
  if (ch.kind === "system") throw new Error("Reply where you were mentioned: open the card.");
  const message = await postMessage({ channelId, userId: access.user.id, body, replyToId, threadId });
  // in a DM the message itself is the notice; in a channel or deal thread the people mentioned also get a card
  if (ch.kind !== "dm")
    await notifyMentions({
      authorId: access.user.id,
      body,
      event: "mention",
      record: { type: "chat", id: message.id },
      source: "chat",
      sourceId: message.id,
      allowed: await memberIds(channelId),
    });
  return message;
}

export async function editMessage(messageId: number, text: string): Promise<ChatMessage> {
  const { user } = await assertChat();
  return saveEdit(id.parse(messageId), user.id, body.parse(text));
}

export async function deleteMessage(messageId: number): Promise<void> {
  const access = await assertChat();
  await removeMessage(id.parse(messageId), access.user.id, access.user.role === "admin");
}

/** One emoji (with its skin tone or joiner sequence), nothing else. */
const emoji = z
  .string()
  .max(16)
  .regex(/^\p{Extended_Pictographic}[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]*$/u, "Pick an emoji.");

export async function toggleReaction(messageId: number, e: string): Promise<Reaction[]> {
  const access = await assertChat();
  const channelId = await channelOf(id.parse(messageId));
  if (!channelId) throw new Error("That message is gone.");
  await openChannel(channelId, access);
  return toggle(messageId, access.user.id, emoji.parse(e));
}

/** Everything up to this message has been seen. */
export async function markChannelRead(channelId: number, upTo: number): Promise<void> {
  const access = await assertChat();
  id.parse(channelId);
  id.parse(upTo);
  await openChannel(channelId, access);
  await markRead(channelId, access.user.id, upTo);
}

// ---------- groups ----------

const groupSchema = z.object({
  name: z.string().trim().min(1, "Give the channel a name.").max(60, "Keep the name under 60 characters."),
  topic: z.string().trim().max(200).default(""),
  isPrivate: z.boolean().default(false),
  memberIds: z.array(id).max(100).default([]),
});

export async function createGroup(input: z.input<typeof groupSchema>): Promise<number> {
  const { user } = await assertChat();
  return makeGroup(user.id, groupSchema.parse(input));
}

export async function joinGroup(channelId: number): Promise<void> {
  const { user } = await assertChat();
  await join(id.parse(channelId), user.id);
}

/** Owner or admin only. */
async function managed(channelId: number) {
  const access = await assertChat();
  const ch = await openChannel(id.parse(channelId), access);
  if (!ch.canManage) throw new Error("Only the channel owner or an admin can change this.");
  return { access, ch };
}

const patchSchema = groupSchema.pick({ name: true, topic: true, isPrivate: true }).partial().extend({ archived: z.boolean().optional() });

export async function updateGroup(channelId: number, patch: z.input<typeof patchSchema>): Promise<void> {
  await managed(channelId);
  await saveGroup(channelId, patchSchema.parse(patch));
}

/** Anyone in a public group can bring people in; in a private one only the owner or an admin. */
export async function addMembers(channelId: number, userIds: number[]): Promise<void> {
  const access = await assertChat();
  const ch = await openChannel(id.parse(channelId), access);
  if (ch.kind !== "group") throw new Error("People can only be added to a channel.");
  if (ch.isPrivate && !ch.canManage) throw new Error("Only the owner or an admin can add people to a private channel.");
  await addToChannel(channelId, z.array(id).max(100).parse(userIds));
}

export async function removeFromGroup(channelId: number, userId: number): Promise<void> {
  await managed(channelId);
  await removeMember(channelId, id.parse(userId));
}

export async function leaveGroup(channelId: number): Promise<void> {
  const access = await assertChat();
  const ch = await openChannel(id.parse(channelId), access);
  if (ch.kind !== "group") throw new Error("You can only leave a channel.");
  await removeMember(channelId, access.user.id);
}
