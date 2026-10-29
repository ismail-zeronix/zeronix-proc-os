"use server";

import { z } from "zod";
import { assertChat } from "@/lib/chat/access";
import { setSetting } from "@/lib/settings";
import { accept, agentSays, closeChat, markWebRead } from "@/lib/webchat/chats";
import { MAX_WEB_BODY, type WebMessage } from "@/lib/webchat/types";

/** Website chats are answered by people with the CRM app (the sales team). */
async function assertAgent() {
  const access = await assertChat();
  if (!access.apps.includes("crm")) throw new Error("Website chats are for the sales team.");
  return access;
}

const id = z.number().int().positive();

/** Takes a waiting chat (the ringing stops everywhere), or with `takeOver` moves a colleague's chat to me. */
export async function acceptWebChat(chatId: number, takeOver = false): Promise<void> {
  const { user } = await assertAgent();
  await accept(id.parse(chatId), user, takeOver);
}

export async function sendWebMessage(chatId: number, text: string): Promise<WebMessage> {
  const { user } = await assertAgent();
  const body = z.string().trim().min(1, "Write a message first.").max(MAX_WEB_BODY, `Keep a message under ${MAX_WEB_BODY} characters.`).parse(text);
  return agentSays(id.parse(chatId), user.id, body);
}

export async function closeWebChat(chatId: number): Promise<void> {
  const { user } = await assertAgent();
  await closeChat(id.parse(chatId), "agent", user.name);
}

export async function markWebChatRead(chatId: number, upTo: number): Promise<void> {
  const { user } = await assertAgent();
  await markWebRead(id.parse(chatId), user.id, id.parse(upTo));
}

/** Admin: ring for every visitor, or only once they send the lead form. */
export async function setWebRing(mode: "visitors" | "leads"): Promise<void> {
  const { user } = await assertAgent();
  if (user.role !== "admin") throw new Error("Only an admin can change this.");
  await setSetting("webchat_ring", z.enum(["visitors", "leads"]).parse(mode));
}
