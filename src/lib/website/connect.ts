import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { readConnectToken } from "@/lib/connect-token";
import { blockedMap } from "@/lib/newsletter/data";

/**
 * What happens after a website form (quote, contact, /connect) besides landing in Website › Leads (Phase 6):
 * - the weekly-news box ticked: the address joins the "Website subscribers" newsletter list, with when and where they
 *   said yes (an address on the do-not-contact list stays blocked);
 * - it came from a cold email's /connect link (signed `ref`): the prospect moves to Replied with what they wrote, so the
 *   salesman sees it in Outreach › Replies and makes it a lead.
 */

export const SUBSCRIBERS_LIST = "Website subscribers";

export interface FormExtras {
  name: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
  sourcePage: string;
  newsletter: boolean;
  ref: string;
}

async function subscribersList(): Promise<number> {
  const [found] = await db.select({ id: schema.newsletterLists.id }).from(schema.newsletterLists).where(eq(schema.newsletterLists.name, SUBSCRIBERS_LIST));
  if (found) return found.id;
  const [row] = await db
    .insert(schema.newsletterLists)
    .values({ name: SUBSCRIBERS_LIST, consentNote: "You are receiving this because you asked for our weekly product news on zeronixtech.com." })
    .returning({ id: schema.newsletterLists.id });
  return row.id;
}

/** Adds (or re-activates) an opted-in address. Returns the status it got. */
export async function subscribe(f: Pick<FormExtras, "email" | "name" | "company" | "sourcePage">, site: string, ip: string, now = new Date()) {
  const email = f.email.trim().toLowerCase();
  const listId = await subscribersList();
  const blocked = (await blockedMap([email])).get(email);
  const status = blocked ?? "active";
  const source = `Ticked "weekly news" on ${site || "the website"}${f.sourcePage ? ` (${f.sourcePage.slice(0, 120)})` : ""}, ${now.toISOString()}, IP ${ip}`.slice(0, 400);
  await db
    .insert(schema.newsletterContacts)
    .values({ listId, email, name: f.name.slice(0, 120), company: f.company.slice(0, 160), status, source })
    .onConflictDoUpdate({
      target: [schema.newsletterContacts.listId, schema.newsletterContacts.email],
      // a fresh "yes" brings back someone who had left this list, unless the address is blocked
      set: { name: f.name.slice(0, 120), company: f.company.slice(0, 160), source, ...(blocked ? {} : { status: "active" as const }) },
    });
  return status;
}

/** The prospect behind a /connect link answered on the website: Replied, with what they wrote. */
export async function markProspectReplied(ref: string, f: FormExtras): Promise<number | null> {
  const id = readConnectToken(ref);
  if (!id) return null;
  const [p] = await db.select({ id: schema.prospectCompanies.id, status: schema.prospectCompanies.status }).from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, id));
  if (!p) return null;
  const said = [f.notes.trim(), [f.name, f.company, f.email, f.phone].filter(Boolean).join(" · ")].filter(Boolean).join("\n\n").slice(0, 900);
  await db.transaction(async (tx) => {
    // a converted prospect keeps its status; the new note still shows on its timeline
    if (p.status !== "converted") {
      await tx.update(schema.prospectCompanies).set({ status: "replied", statusChangedAt: new Date() }).where(eq(schema.prospectCompanies.id, id));
    }
    await tx.insert(schema.prospectActivities).values({ companyId: id, userId: null, kind: "email", body: `Replied: ${f.email} · filled the zeronixtech.com form\n\n${said}` });
    // their emails stop: they answered
    await tx
      .update(schema.outreachEnrollments)
      .set({ status: "replied", stopReason: "Filled the website form", nextSendAt: null, updatedAt: new Date() })
      .where(and(eq(schema.outreachEnrollments.companyId, id), sql`${schema.outreachEnrollments.status} IN ('active', 'paused')`));
  });
  return id;
}

/** Pre-fill for the /connect page: the company and its main person. Empty when the link is not ours. */
export async function connectPrefill(ref: string): Promise<{ name: string; company: string; email: string; phone: string }> {
  const empty = { name: "", company: "", email: "", phone: "" };
  const id = readConnectToken(ref);
  if (!id) return empty;
  const [p] = await db.select({ name: schema.prospectCompanies.name, phone: schema.prospectCompanies.phone }).from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, id));
  if (!p) return empty;
  const [person] = await db
    .select({ name: schema.prospectPeople.name, email: schema.prospectPeople.email, phone: schema.prospectPeople.phone })
    .from(schema.prospectPeople)
    .where(eq(schema.prospectPeople.companyId, id))
    .orderBy(sql`${schema.prospectPeople.isPrimary} DESC`, schema.prospectPeople.id)
    .limit(1);
  return { name: person?.name ?? "", company: p.name, email: person?.email ?? "", phone: person?.phone || p.phone || "" };
}
