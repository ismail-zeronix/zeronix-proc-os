"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { createDeal } from "@/app/(app)/crm/actions";
import { db, schema } from "@/db";
import { assertChat } from "@/lib/chat/access";
import { setSetting } from "@/lib/settings";
import { accept, agentSays, chatById, closeChat, markWebRead, messagesOf, notifyAgents } from "@/lib/webchat/chats";
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

/**
 * "Save to leads": a CRM lead (deal at New, source Website) from the visitor's form, with the chat on its timeline and
 * a follow-up task for today. Saving twice opens the same lead.
 */
export async function saveWebLead(chatId: number): Promise<{ dealId: number; reusedCompany: string | null }> {
  const { user } = await assertAgent();
  const c = await chatById(id.parse(chatId));
  if (!c) throw new Error("That chat is gone.");
  if (c.dealId) return { dealId: c.dealId, reusedCompany: null };
  if (!c.leadAt) throw new Error("The visitor has not sent their details yet.");
  const lines = await messagesOf(c.id, true);
  const question = lines.find((m) => m.sender === "visitor")?.body ?? "";
  const { id: dealId, reusedCompany } = await createDeal({
    companyName: c.company || c.name,
    contactName: c.name,
    contactEmail: c.email,
    contactPhone: c.phone,
    source: "Website",
    requirement: question,
  });
  const transcript = lines
    .filter((m) => m.sender !== "system")
    .map((m) => `${m.sender === "visitor" ? c.name || "Visitor" : (m.name ?? "Sales")}: ${m.body}`)
    .join("\n");
  const [deal] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  await db.insert(schema.activities).values({
    type: "note",
    body: `Website chat #${c.id}${c.pageUrl ? ` (from ${c.pageUrl})` : ""}\n\n${transcript}`.slice(0, 8000),
    dealId,
    companyId: deal?.companyId,
    userId: user.id,
  });
  await db.update(schema.webChats).set({ dealId }).where(eq(schema.webChats.id, c.id));
  await notifyAgents(c.id);
  return { dealId, reusedCompany };
}

/** Admin: ring for every visitor, or only once they send the lead form. */
export async function setWebRing(mode: "visitors" | "leads"): Promise<void> {
  const { user } = await assertAgent();
  if (user.role !== "admin") throw new Error("Only an admin can change this.");
  await setSetting("webchat_ring", z.enum(["visitors", "leads"]).parse(mode));
}
