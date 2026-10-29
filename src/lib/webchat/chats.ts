import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { allowedApps } from "@/lib/apps";
import { publish, publishToVisitor } from "@/lib/chat/bus";
import { presenceMap } from "@/lib/chat/presence";
import { webPreview, type VisitorState, type WebChatSummary, type WebMessage } from "./types";

/**
 * The website chat (the widget on www.zeronix.ae). A visitor's chat is created the moment they land, so the sales team
 * hears them arrive; they must send the lead form before they can write. Events reach the portal through the same live
 * stream as the team chat (lib/chat/bus.ts), and the visitor's widget through its own stream (/api/widget/stream).
 */

type Chat = typeof schema.webChats.$inferSelect;

/** A visitor counts as on the site while their widget has checked in within this long (it pings every 20 s). */
const ONLINE_MS = 60_000;

export const isOnline = (c: Pick<Chat, "visitorSeenAt">) => Date.now() - c.visitorSeenAt.getTime() < ONLINE_MS;

/** People who answer website chats: active users with the CRM app. */
export async function agentIds(): Promise<number[]> {
  const rows = await db
    .select({ id: schema.users.id, role: schema.users.role, apps: schema.users.apps })
    .from(schema.users)
    .where(eq(schema.users.isActive, true));
  return rows.filter((u) => allowedApps(u).includes("crm")).map((u) => u.id);
}

/** Tells every agent's portal to re-read the Website list. */
async function notifyAgents(chatId: number) {
  await publish(await agentIds(), { t: "web.update", chatId });
}

/** Sales people the visitor sees as "online now": agents with the portal open, not on do not disturb. First name only. */
export async function onlineTeam(): Promise<VisitorState["team"]> {
  const presence = await presenceMap();
  const ids = (await agentIds()).filter((id) => presence[id] === "online" || presence[id] === "away");
  if (!ids.length) return [];
  const rows = await db
    .select({ name: schema.users.name, title: schema.users.jobTitle })
    .from(schema.users)
    .where(inArray(schema.users.id, ids))
    .orderBy(asc(schema.users.name));
  return rows.map((r) => ({ name: firstName(r.name), title: r.title || "Sales" }));
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function toMessage(row: typeof schema.webChatMessages.$inferSelect, agentName: string | null): WebMessage {
  return {
    id: row.id,
    chatId: row.chatId,
    sender: row.sender,
    name: row.sender === "agent" ? agentName : null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function chatByToken(token: string): Promise<Chat | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db.select().from(schema.webChats).where(eq(schema.webChats.token, token));
  return row ?? null;
}

export async function chatById(id: number): Promise<Chat | null> {
  const [row] = await db.select().from(schema.webChats).where(eq(schema.webChats.id, id));
  return row ?? null;
}

async function agentOf(c: Chat): Promise<{ id: number; name: string; title: string } | null> {
  if (!c.agentId) return null;
  const [u] = await db.select({ id: schema.users.id, name: schema.users.name, title: schema.users.jobTitle }).from(schema.users).where(eq(schema.users.id, c.agentId));
  return u ?? null;
}

/** Every line of a chat, oldest first. Agent lines carry the agent's first name for the visitor. */
export async function messagesOf(chatId: number, full = false): Promise<WebMessage[]> {
  const rows = await db
    .select({ m: schema.webChatMessages, agent: schema.users.name })
    .from(schema.webChatMessages)
    .leftJoin(schema.users, eq(schema.users.id, schema.webChatMessages.userId))
    .where(eq(schema.webChatMessages.chatId, chatId))
    .orderBy(asc(schema.webChatMessages.id));
  return rows.map((r) => toMessage(r.m, r.agent ? (full ? r.agent : firstName(r.agent)) : null));
}

export async function visitorState(c: Chat): Promise<VisitorState> {
  const agent = await agentOf(c);
  return {
    status: c.status,
    leadDone: !!c.leadAt,
    agent: agent && { name: firstName(agent.name), title: agent.title || "Sales" },
    messages: await messagesOf(c.id),
    team: await onlineTeam(),
  };
}

interface Arrival {
  token?: string;
  pageUrl: string;
  pageTitle: string;
  referrer: string;
  userAgent: string;
  ip: string;
}

/**
 * The widget loaded on a page. Picks up the visitor's open chat (they moved to another page) or starts a new one. A new
 * chat from a browser that sent the lead form before keeps those details, so the visitor need not type them again.
 */
export async function arrive(a: Arrival): Promise<Chat> {
  const known = a.token ? await chatByToken(a.token) : null;
  const page = { pageUrl: a.pageUrl.slice(0, 1000), pageTitle: a.pageTitle.slice(0, 300) };
  if (known && known.status !== "closed") {
    const wasOnline = isOnline(known);
    const [row] = await db
      .update(schema.webChats)
      .set({ ...page, visitorSeenAt: new Date(), ip: a.ip || known.ip })
      .where(eq(schema.webChats.id, known.id))
      .returning();
    // the list shows the page they are on; a visitor coming back makes the portals ring again
    if (!wasOnline || known.pageUrl !== page.pageUrl) await notifyAgents(known.id);
    return row;
  }
  // tidy up: visitors who left without sending the lead form are of no use after a week
  await db
    .delete(schema.webChats)
    .where(and(sql`${schema.webChats.leadAt} IS NULL`, lt(schema.webChats.visitorSeenAt, new Date(Date.now() - 7 * 86400_000))));
  const lead = known?.leadAt ? { name: known.name, email: known.email, phone: known.phone, company: known.company, leadAt: new Date() } : {};
  const [row] = await db
    .insert(schema.webChats)
    .values({
      token: randomBytes(24).toString("base64url"),
      ...page,
      ...lead,
      referrer: a.referrer.slice(0, 1000),
      userAgent: a.userAgent.slice(0, 400),
      ip: a.ip,
    })
    .returning();
  await notifyAgents(row.id);
  return row;
}

/** The widget is still open (its stream pings every 20 s). */
export async function touch(chatId: number): Promise<void> {
  await db.update(schema.webChats).set({ visitorSeenAt: new Date() }).where(eq(schema.webChats.id, chatId));
}

/** The visitor's widget closed and did not come back: the portals stop ringing for them. */
export async function visitorLeft(chatId: number): Promise<void> {
  await db
    .update(schema.webChats)
    .set({ visitorSeenAt: new Date(Date.now() - ONLINE_MS) })
    .where(eq(schema.webChats.id, chatId));
  await notifyAgents(chatId);
}

async function addLine(chatId: number, sender: WebMessage["sender"], body: string, userId: number | null = null): Promise<WebMessage> {
  const [row] = await db.insert(schema.webChatMessages).values({ chatId, sender, userId, body }).returning();
  await db.update(schema.webChats).set({ lastMessageAt: row.createdAt }).where(eq(schema.webChats.id, chatId));
  let name: string | null = null;
  if (userId) {
    const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
    name = u?.name ?? null;
  }
  const full = toMessage(row, name);
  await publish(await agentIds(), { t: "web.message", message: full });
  await publishToVisitor(chatId, { t: "message", message: { ...full, name: name && firstName(name) } });
  return full;
}

export interface LeadInput {
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
}

/** The visitor sent the lead form; their first question becomes the first line of the chat. */
export async function saveLead(c: Chat, lead: LeadInput): Promise<void> {
  if (c.status === "closed") throw new Error("This chat has ended.");
  await db
    .update(schema.webChats)
    .set({ name: lead.name, email: lead.email, phone: lead.phone, company: lead.company, leadAt: new Date(), visitorSeenAt: new Date() })
    .where(eq(schema.webChats.id, c.id));
  if (lead.message) await addLine(c.id, "visitor", lead.message);
  await notifyAgents(c.id);
}

export async function visitorSays(c: Chat, body: string): Promise<WebMessage> {
  if (c.status === "closed") throw new Error("This chat has ended.");
  if (!c.leadAt) throw new Error("Please fill in your details first.");
  await touch(c.id);
  return addLine(c.id, "visitor", body);
}

export async function agentSays(chatId: number, userId: number, body: string): Promise<WebMessage> {
  const c = await chatById(chatId);
  if (!c) throw new Error("That chat is gone.");
  if (c.status === "closed") throw new Error("This chat has ended.");
  if (c.agentId !== userId) throw new Error(c.agentId ? "Another agent is on this chat. Take it over to reply." : "Accept the chat first.");
  const m = await addLine(chatId, "agent", body, userId);
  await markWebRead(chatId, userId, m.id);
  return m;
}

/**
 * Takes the chat. Only one agent wins a waiting chat (the others' portals stop ringing); `takeOver` moves an active chat
 * to me, for when a colleague is busy or away.
 */
export async function accept(chatId: number, user: { id: number; name: string }, takeOver = false): Promise<void> {
  const [row] = await db
    .update(schema.webChats)
    .set({ status: "active", agentId: user.id, acceptedAt: new Date() })
    .where(and(eq(schema.webChats.id, chatId), takeOver ? and(eq(schema.webChats.status, "active"), ne(schema.webChats.agentId, user.id)) : eq(schema.webChats.status, "waiting")))
    .returning();
  if (!row) {
    const c = await chatById(chatId);
    if (!c) throw new Error("That chat is gone.");
    if (c.agentId === user.id) return;
    if (c.status === "closed") throw new Error("This chat has ended.");
    throw new Error("Someone else has just accepted this chat.");
  }
  const [me] = await db.select({ title: schema.users.jobTitle }).from(schema.users).where(eq(schema.users.id, user.id));
  await addLine(chatId, "system", `${firstName(user.name)} ${takeOver ? "took over" : "joined"} the chat`);
  await publishToVisitor(chatId, { t: "state", status: "active", agent: { name: firstName(user.name), title: me?.title || "Sales" } });
  await notifyAgents(chatId);
}

export async function closeChat(chatId: number, by: "visitor" | "agent", agentName?: string): Promise<void> {
  const [row] = await db
    .update(schema.webChats)
    .set({ status: "closed", closedAt: new Date(), closedBy: by })
    .where(and(eq(schema.webChats.id, chatId), ne(schema.webChats.status, "closed")))
    .returning();
  if (!row) return;
  await addLine(chatId, "system", by === "visitor" ? "The visitor ended the chat" : `${agentName ? firstName(agentName) : "Sales"} ended the chat`);
  await publishToVisitor(chatId, { t: "state", status: "closed", agent: null });
  await notifyAgents(chatId);
}

export async function markWebRead(chatId: number, userId: number, upTo: number): Promise<void> {
  await db
    .update(schema.webChats)
    .set({ agentLastReadId: sql`GREATEST(${schema.webChats.agentLastReadId}, ${upTo})` })
    .where(and(eq(schema.webChats.id, chatId), eq(schema.webChats.agentId, userId)));
}

/**
 * The Website tab: visitors on the site now, chats waiting or going on, and the last week's ended chats with a lead.
 * Visitors who left without the lead form drop off the list.
 */
export async function listChats(userId: number): Promise<WebChatSummary[]> {
  const since = new Date(Date.now() - 7 * 86400_000);
  const onlineSince = new Date(Date.now() - ONLINE_MS);
  const c = schema.webChats;
  const rows = await db
    .select({ c, agentName: schema.users.name })
    .from(c)
    .leftJoin(schema.users, eq(schema.users.id, c.agentId))
    .where(
      or(
        eq(c.status, "active"),
        and(eq(c.status, "waiting"), or(isNotNull(c.leadAt), gt(c.visitorSeenAt, onlineSince))),
        and(eq(c.status, "closed"), isNotNull(c.leadAt), gt(c.closedAt, since)),
      ),
    )
    .orderBy(desc(sql`COALESCE(${c.lastMessageAt}, ${c.createdAt})`))
    .limit(150);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.c.id);
  // the last line of each, and my unread count on the chats I am on
  const last = await db.execute<{ chat_id: number; sender: WebMessage["sender"]; body: string }>(sql`
    SELECT DISTINCT ON (chat_id) chat_id, sender, body FROM web_chat_messages
    WHERE chat_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) AND sender <> 'system'
    ORDER BY chat_id, id DESC`);
  const unread = await db
    .select({ chatId: schema.webChatMessages.chatId, n: sql<number>`count(*)::int` })
    .from(schema.webChatMessages)
    .innerJoin(c, eq(c.id, schema.webChatMessages.chatId))
    .where(and(eq(c.agentId, userId), ne(c.status, "closed"), eq(schema.webChatMessages.sender, "visitor"), gt(schema.webChatMessages.id, c.agentLastReadId)))
    .groupBy(schema.webChatMessages.chatId);
  const lastOf = new Map(last.rows.map((r) => [r.chat_id, r]));
  const unreadOf = new Map(unread.map((r) => [r.chatId, r.n]));
  return rows.map(({ c: row, agentName }) => {
    const l = lastOf.get(row.id);
    return {
      id: row.id,
      status: row.status,
      lead: row.leadAt ? { name: row.name, email: row.email, phone: row.phone, company: row.company } : null,
      pageUrl: row.pageUrl,
      pageTitle: row.pageTitle,
      referrer: row.referrer,
      online: isOnline(row),
      agent: row.agentId && agentName ? { id: row.agentId, name: agentName } : null,
      lastPreview: l ? webPreview(l) : "",
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      unread: unreadOf.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
    };
  });
}
