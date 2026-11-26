import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseContacts } from "./import";

export type ContactStatus = "active" | "unsubscribed" | "bounced";

/**
 * Addresses that must not get a newsletter: anything on Prospecting's do-not-contact list (an address, or a whole
 * domain) except the "customer" reason, which only keeps cold email away from people who already buy from us.
 * Returns the status such an address gets in a list: bounces stay "bounced", everything else is "unsubscribed".
 */
export async function blockedMap(emails: string[]): Promise<Map<string, ContactStatus>> {
  const out = new Map<string, ContactStatus>();
  if (!emails.length) return out;
  const keys = [...new Set([...emails, ...emails.map((e) => e.split("@")[1] ?? "")].filter(Boolean))];
  const rows: { value: string; reason: string }[] = [];
  for (let i = 0; i < keys.length; i += 1000) {
    rows.push(
      ...(await db
        .select({ value: schema.outreachSuppression.value, reason: schema.outreachSuppression.reason })
        .from(schema.outreachSuppression)
        .where(and(inArray(schema.outreachSuppression.value, keys.slice(i, i + 1000)), sql`${schema.outreachSuppression.reason} <> 'customer'`))),
    );
  }
  const by = new Map(rows.map((r) => [r.value, r.reason]));
  for (const e of emails) {
    const reason = by.get(e) ?? by.get(e.split("@")[1] ?? "");
    if (reason) out.set(e, reason === "bounce" ? "bounced" : "unsubscribed");
  }
  return out;
}

/**
 * Puts an address on the do-not-contact list. An address already there for the "customer" reason (which newsletters
 * ignore) is changed to this reason, so an unsubscribe from a customer is never lost; other reasons are kept.
 */
export async function suppress(email: string, reason: "unsubscribe" | "bounce", note: string): Promise<void> {
  const t = schema.outreachSuppression;
  await db
    .insert(t)
    .values({ value: email, kind: "email", reason, note: note.slice(0, 200) })
    // the do-not-contact list is per organisation (unique organization_id + value)
    .onConflictDoUpdate({ target: [t.organizationId, t.value], set: { reason, note: note.slice(0, 200) }, setWhere: sql`${t.reason} = 'customer'` });
}

export interface ListRow {
  id: number;
  name: string;
  consentNote: string;
  createdAt: Date;
  active: number;
  unsubscribed: number;
  bounced: number;
}

export async function listLists(): Promise<ListRow[]> {
  const rows = await db.execute<{ id: number; name: string; consent_note: string; created_at: Date; active: number; unsub: number; bounced: number }>(sql`
    SELECT l.id, l.name, l.consent_note, l.created_at,
      count(c.id) FILTER (WHERE c.status = 'active')::int AS active,
      count(c.id) FILTER (WHERE c.status = 'unsubscribed')::int AS unsub,
      count(c.id) FILTER (WHERE c.status = 'bounced')::int AS bounced
    FROM newsletter_lists l LEFT JOIN newsletter_contacts c ON c.list_id = l.id
    GROUP BY l.id ORDER BY l.created_at DESC, l.id DESC`);
  return rows.rows.map((r) => ({ id: r.id, name: r.name, consentNote: r.consent_note, createdAt: new Date(r.created_at), active: r.active, unsubscribed: r.unsub, bounced: r.bounced }));
}

export async function getList(id: number) {
  const [l] = await db.select().from(schema.newsletterLists).where(eq(schema.newsletterLists.id, id));
  return l ?? null;
}

export async function listContacts(listId: number, status: ContactStatus | "all", page: number, size: number) {
  const where = and(eq(schema.newsletterContacts.listId, listId), status === "all" ? undefined : eq(schema.newsletterContacts.status, status));
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(schema.newsletterContacts).where(where).orderBy(desc(schema.newsletterContacts.id)).limit(size).offset((page - 1) * size),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.newsletterContacts).where(where),
  ]);
  return { rows, total: n };
}

export interface CampaignRow {
  id: number;
  name: string;
  templateKey: string;
  subject: string;
  status: "draft" | "sending" | "paused" | "done";
  listName: string | null;
  createdAt: Date;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
}

/** Newsletters, newest first, each with how many emails are waiting, sent, failed or skipped. */
export async function listCampaigns(page: number, size: number): Promise<{ rows: CampaignRow[]; total: number }> {
  const [rows, [{ n }]] = await Promise.all([
    db.execute<{ id: number; name: string; template_key: string; subject: string; status: CampaignRow["status"]; list_name: string | null; created_at: Date; queued: number; sent: number; failed: number; skipped: number }>(sql`
      SELECT c.id, c.name, c.template_key, c.subject, c.status, l.name AS list_name, c.created_at,
        count(s.id) FILTER (WHERE s.status = 'queued')::int AS queued,
        count(s.id) FILTER (WHERE s.status = 'sent')::int AS sent,
        count(s.id) FILTER (WHERE s.status = 'failed')::int AS failed,
        count(s.id) FILTER (WHERE s.status = 'skipped')::int AS skipped
      FROM newsletter_campaigns c
      LEFT JOIN newsletter_lists l ON l.id = c.list_id
      LEFT JOIN newsletter_sends s ON s.campaign_id = c.id
      GROUP BY c.id, l.name ORDER BY c.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.newsletterCampaigns),
  ]);
  return {
    total: n,
    rows: rows.rows.map((r) => ({ id: r.id, name: r.name, templateKey: r.template_key, subject: r.subject, status: r.status, listName: r.list_name, createdAt: new Date(r.created_at), queued: r.queued, sent: r.sent, failed: r.failed, skipped: r.skipped })),
  };
}

export async function getCampaign(id: number) {
  const [c] = await db.select().from(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.id, id));
  return c ?? null;
}

export async function campaignCounts(id: number): Promise<Record<"queued" | "sent" | "failed" | "skipped", number>> {
  const rows = await db.select({ status: schema.newsletterSends.status, n: sql<number>`count(*)::int` }).from(schema.newsletterSends).where(eq(schema.newsletterSends.campaignId, id)).groupBy(schema.newsletterSends.status);
  const out = { queued: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export async function campaignSends(id: number, status: "queued" | "sent" | "failed" | "skipped" | "all", page: number, size: number) {
  const where = and(eq(schema.newsletterSends.campaignId, id), status === "all" ? undefined : eq(schema.newsletterSends.status, status));
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(schema.newsletterSends).where(where).orderBy(desc(schema.newsletterSends.id)).limit(size).offset((page - 1) * size),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.newsletterSends).where(where),
  ]);
  return { rows, total: n };
}

export interface ImportResult {
  added: number;
  /** Already in the list, or repeated in the pasted text. */
  duplicates: number;
  /** Added but marked unsubscribed or bounced because the address is on the do-not-contact list. */
  blocked: number;
  invalid: string[];
}

/** Adds pasted contacts to a list. Blocked addresses are kept (so you can see why) but never sent to. */
export async function addContacts(listId: number, text: string, source: string): Promise<ImportResult> {
  const parsed = parseContacts(text);
  const blocked = await blockedMap(parsed.contacts.map((c) => c.email));
  let added = 0;
  let blockedAdded = 0;
  for (let i = 0; i < parsed.contacts.length; i += 500) {
    const chunk = parsed.contacts.slice(i, i + 500);
    const rows = await db
      .insert(schema.newsletterContacts)
      .values(chunk.map((c) => ({ listId, email: c.email, name: c.name, company: c.company, source, status: blocked.get(c.email) ?? ("active" as const) })))
      .onConflictDoNothing()
      .returning({ email: schema.newsletterContacts.email });
    added += rows.length;
    blockedAdded += rows.filter((r) => blocked.has(r.email)).length;
  }
  return { added, duplicates: parsed.duplicates + (parsed.contacts.length - added), blocked: blockedAdded, invalid: parsed.invalid };
}
