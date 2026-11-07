"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { createDeal } from "@/app/(app)/crm/actions";
import { db, schema } from "@/db";
import { assertChat } from "@/lib/chat/access";
import { setSetting } from "@/lib/settings";
import { accept, agentSays, chatById, closeChat, markWebRead, messagesOf, notifyAgents } from "@/lib/webchat/chats";
import { looksLikeEmail } from "@/lib/webchat/qualify";
import { MAX_WEB_BODY, type WebMessage } from "@/lib/webchat/types";
import { parseInput, UserError } from "@/lib/user-error";

/** Website chats are answered by people with the CRM app (the sales team). */
async function assertAgent() {
  const access = await assertChat();
  if (!access.apps.includes("crm")) throw new UserError("Website chats are for the sales team.");
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
  const body = parseInput(z.string().trim().min(1, "Write a message first.").max(MAX_WEB_BODY, `Keep a message under ${MAX_WEB_BODY} characters.`), text);
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
  if (!c) throw new UserError("That chat is gone.");
  if (c.dealId) return { dealId: c.dealId, reusedCompany: null };
  // a partial lead (left before sending the form) can be saved once there is an email or phone to follow up on
  if (!c.leadAt && !c.phone && !looksLikeEmail(c.email)) throw new UserError("The visitor has not left an email or phone number yet.");
  const lines = await messagesOf(c.id, true);
  // the question they sent, or the one they typed and never sent
  const question = lines.find((m) => m.sender === "visitor")?.body ?? (c.draft ? `(typed, not sent) ${c.draft}` : "");
  // what they were looking at when a site's "Get B2B pricing" opened the chat
  const asked = c.context ? Object.entries(c.context).map(([k, v]) => `${k}: ${v}`).join(", ") : "";
  const name = c.name || c.email.split("@")[0] || `Website visitor #${c.id}`;
  const { id: dealId, reusedCompany } = await createDeal({
    companyName: c.company || name,
    contactName: name,
    contactEmail: looksLikeEmail(c.email) ? c.email : "",
    contactPhone: c.phone,
    source: "Website",
    requirement: [question, asked && `(Asked from ${c.site || "the website"}: ${asked})`, !c.leadAt && "(Left the site before sending the chat form.)"]
      .filter(Boolean)
      .join("\n\n"),
  });
  const transcript = lines
    .filter((m) => m.sender !== "system")
    .map((m) => `${m.sender === "visitor" ? c.name || "Visitor" : (m.name ?? "Sales")}: ${m.body}`)
    .join("\n");
  const [deal] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  await db.insert(schema.activities).values({
    type: "note",
    body: `Website chat #${c.id}${c.site ? ` on ${c.site}` : ""}${c.pageUrl ? ` (from ${c.pageUrl})` : ""}\n\n${transcript}`.slice(0, 8000),
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
  if (user.role !== "admin") throw new UserError("Only an admin can change this.");
  await setSetting("webchat_ring", z.enum(["visitors", "leads"]).parse(mode));
}
