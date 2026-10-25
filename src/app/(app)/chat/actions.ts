"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { markDelivered } from "@/app/(app)/accounts/order-actions";
import { setQuoteStatus } from "@/app/(app)/accounts/quote-actions";
import { createTask, setTaskDone } from "@/app/(app)/tasks/actions";
import { db, schema } from "@/db";
import { assertDeal } from "@/lib/auth/visibility";
import { assertChat } from "@/lib/chat/access";
import { publish } from "@/lib/chat/bus";
import { parseRef, resolveCards } from "@/lib/chat/cards";
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
import { savePrefs } from "@/lib/chat/presence";
import { MAX_BODY } from "@/lib/chat/text";
import type { CardView, ChannelSummary, ChatMessage, ChatPrefsView, Reaction } from "@/lib/chat/types";
import { dubaiToday } from "@/lib/dates";
import { quoteStatusLabel } from "@/lib/quotation";

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

// ---------- settings, mute, card buttons ----------

const prefsSchema = z.object({
  status: z.enum(["auto", "away", "dnd"]).optional(),
  /** Minutes of do not disturb; null = until I turn it off. */
  dndMinutes: z.number().int().min(1).max(7 * 24 * 60).nullish(),
  sound: z.boolean().optional(),
  desktop: z.boolean().optional(),
});

/** My status (online, away, do not disturb for a while) and alert settings. */
export async function setChatPrefs(input: z.input<typeof prefsSchema>): Promise<ChatPrefsView> {
  const { user } = await assertChat();
  const { dndMinutes, ...p } = prefsSchema.parse(input);
  const patch: Parameters<typeof savePrefs>[1] = { ...p };
  if (p.status) patch.dndUntil = p.status === "dnd" && dndMinutes ? new Date(Date.now() + dndMinutes * 60_000) : null;
  return savePrefs(user.id, patch);
}

/** Mutes a conversation for some minutes, for good (null), or unmutes it (0): no sound or alert, a grey unread count. */
export async function setChannelMute(channelId: number, minutes: number | null): Promise<void> {
  const access = await assertChat();
  await openChannel(id.parse(channelId), access);
  const until = minutes === 0 ? null : minutes == null ? new Date("2100-01-01T00:00:00Z") : new Date(Date.now() + z.number().int().min(1).max(525_600).parse(minutes) * 60_000);
  await db
    .update(schema.chatMembers)
    .set({ mutedUntil: until })
    .where(and(eq(schema.chatMembers.channelId, channelId), eq(schema.chatMembers.userId, access.user.id)));
  await publish([access.user.id], { t: "channel.update", channelId });
}

/**
 * A button on a card: runs the record's own action (so its rules apply), writes a short line in the conversation the
 * card was in, and tells every open card to re-read the record. Returns the card as it is now.
 */
export async function runCardAction(ref: string, action: string, channelId?: number | null): Promise<CardView | null> {
  const access = await assertChat();
  const r = parseRef(ref);
  if (!r) throw new Error("Unknown card.");
  let line = "";
  if (r.type === "task" && (action === "done" || action === "reopen")) {
    await setTaskDone(r.id, action === "done");
    const [t] = await db.select({ title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, r.id));
    line = `${access.user.name} ${action === "done" ? "marked the task done" : "reopened the task"}: ${t?.title ?? ""}`;
  } else if (r.type === "quote" && ["sent", "accepted", "rejected"].includes(action)) {
    await setQuoteStatus(r.id, action);
    const [q] = await db.select({ number: schema.quotes.number }).from(schema.quotes).where(eq(schema.quotes.id, r.id));
    line = `${access.user.name} marked quote ${q?.number ?? ""} as ${quoteStatusLabel(action)}`;
  } else if (r.type === "order" && action === "delivered") {
    await markDelivered(r.id, { deliveredOn: dubaiToday() });
    const [o] = await db.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.id, r.id));
    line = `${access.user.name} marked order ${o?.number ?? ""} as delivered`;
  } else if (r.type === "deal" && action === "followup") {
    const [d] = await db.select({ title: schema.deals.title }).from(schema.deals).where(eq(schema.deals.id, r.id));
    if (!d) throw new Error("That deal no longer exists.");
    const tomorrow = dubaiToday(new Date(Date.now() + 86_400_000));
    await createTask({ title: `Follow up: ${d.title}`.slice(0, 200), dueDate: tomorrow, related: { type: "deal", id: r.id } });
    line = `${access.user.name} booked a follow-up for tomorrow`;
  } else {
    throw new Error("That button does not work on this card.");
  }
  // the line goes where the card was (not into an Activity feed, which is only its owner's)
  if (channelId) {
    const ch = await openChannel(id.parse(channelId), access).catch(() => null);
    if (ch && ch.kind !== "system" && !ch.archived) await postMessage({ channelId, userId: null, kind: "system", body: line });
  }
  await publish("all", { t: "card.refresh", ref });
  const [card] = await resolveCards(access, [ref]);
  return card ?? null;
}
