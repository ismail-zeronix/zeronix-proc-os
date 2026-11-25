import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { mineOrPool } from "./access";

/**
 * Outreach day-to-day lists (Phase 5): replies waiting for someone, and the cold-call queue. A salesman sees their own
 * prospects and the unassigned pool (scopeUserId); admins and "All data" users see everything.
 */

export interface ProspectPersonLite {
  id: number;
  name: string;
  title: string;
  email: string;
  phone: string;
}

export interface ReplyRow {
  id: number;
  name: string;
  ownerName: string;
  at: string;
  /** "Replied: someone@x.com · Re: …" */
  headline: string;
  /** What they wrote (above the quoted email), when it was kept. */
  said: string;
  campaign: string;
  phone: string;
  emirate: string;
  industry: string;
  people: ProspectPersonLite[];
}

const scope = (userId?: number) => (userId ? mineOrPool(userId) : undefined);

async function peopleOf(ids: number[]): Promise<Map<number, ProspectPersonLite[]>> {
  const out = new Map<number, ProspectPersonLite[]>();
  if (!ids.length) return out;
  const rows = await db
    .select({ companyId: schema.prospectPeople.companyId, id: schema.prospectPeople.id, name: schema.prospectPeople.name, title: schema.prospectPeople.title, email: schema.prospectPeople.email, phone: schema.prospectPeople.phone })
    .from(schema.prospectPeople)
    .where(inArray(schema.prospectPeople.companyId, ids))
    .orderBy(desc(schema.prospectPeople.isPrimary), schema.prospectPeople.id);
  for (const r of rows) {
    const list = out.get(r.companyId) ?? [];
    list.push({ id: r.id, name: r.name, title: r.title ?? "", email: r.email ?? "", phone: r.phone ?? "" });
    out.set(r.companyId, list);
  }
  return out;
}

/** Prospects that answered a cold email and nobody has dealt with yet, newest first. */
export async function listReplies(scopeUserId?: number): Promise<ReplyRow[]> {
  const rows = await db
    .select({
      id: schema.prospectCompanies.id,
      name: schema.prospectCompanies.name,
      ownerName: sql<string>`coalesce((SELECT u.name FROM users u WHERE u.id = prospect_companies.owner_id), '')`,
      at: schema.prospectCompanies.statusChangedAt,
      phone: schema.prospectCompanies.phone,
      emirate: schema.prospectCompanies.emirate,
      industry: schema.prospectCompanies.industry,
      reply: sql<string>`coalesce((SELECT a.body FROM prospect_activities a WHERE a.company_id = prospect_companies.id AND a.kind = 'email' AND a.body LIKE 'Replied:%' ORDER BY a.created_at DESC LIMIT 1), '')`,
      campaign: sql<string>`coalesce((SELECT c.name FROM outreach_enrollments e JOIN outreach_campaigns c ON c.id = e.campaign_id WHERE e.company_id = prospect_companies.id ORDER BY e.updated_at DESC LIMIT 1), '')`,
    })
    .from(schema.prospectCompanies)
    .where(and(eq(schema.prospectCompanies.status, "replied"), scope(scopeUserId)))
    .orderBy(desc(schema.prospectCompanies.statusChangedAt))
    .limit(200);
  const people = await peopleOf(rows.map((r) => r.id));
  return rows.map((r) => {
    const [headline, ...rest] = r.reply.split("\n\n");
    return {
      id: r.id,
      name: r.name,
      ownerName: r.ownerName,
      at: r.at.toISOString(),
      headline: headline ?? "",
      said: rest.join("\n\n").trim(),
      campaign: r.campaign,
      phone: r.phone ?? "",
      emirate: r.emirate ?? "",
      industry: r.industry ?? "",
      people: people.get(r.id) ?? [],
    };
  });
}

export async function repliesWaiting(scopeUserId?: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.prospectCompanies)
    .where(and(eq(schema.prospectCompanies.status, "replied"), scope(scopeUserId)));
  return r?.n ?? 0;
}

/** Recently turned into CRM leads, for the bottom of the Replies page. */
export async function recentlyConverted(scopeUserId?: number) {
  return db
    .select({ id: schema.prospectCompanies.id, name: schema.prospectCompanies.name, dealId: schema.prospectCompanies.crmDealId, at: schema.prospectCompanies.statusChangedAt })
    .from(schema.prospectCompanies)
    .where(and(eq(schema.prospectCompanies.status, "converted"), scope(scopeUserId)))
    .orderBy(desc(schema.prospectCompanies.statusChangedAt))
    .limit(10);
}

export interface CallItem {
  id: number;
  name: string;
  activity: string;
  emirate: string;
  industry: string;
  website: string;
  score: number;
  status: string;
  ownerId: number | null;
  personalLine: string;
  phone: string;
  people: ProspectPersonLite[];
  lastCall: string | null;
  lastNote: string;
}

/**
 * The cold-call queue: prospects with a phone (company or a person), still open (sourced, researching, ready, or a
 * "not now" whose date has passed), not called in the last 14 days. Own prospects first, then the unassigned pool,
 * hottest first.
 */
export async function callQueue(userId: number, limit = 25): Promise<CallItem[]> {
  const rows = await db.execute<{
    id: number;
    name: string;
    activity: string;
    emirate: string;
    industry: string;
    website: string;
    score: number;
    status: string;
    owner_id: number | null;
    personal_line: string;
    phone: string;
    last_call: Date | null;
    last_note: string | null;
  }>(sql`
    SELECT c.id, c.name, c.activity, c.emirate, c.industry, c.website, c.score, c.status, c.owner_id, c.personal_line, coalesce(c.phone, '') AS phone,
      (SELECT max(a.created_at) FROM prospect_activities a WHERE a.company_id = c.id AND a.kind = 'call') AS last_call,
      (SELECT a.body FROM prospect_activities a WHERE a.company_id = c.id AND a.kind IN ('note', 'call') ORDER BY a.created_at DESC LIMIT 1) AS last_note
    FROM prospect_companies c
    WHERE (c.status IN ('sourced', 'researching', 'ready') OR (c.status = 'not_now' AND (c.snooze_until IS NULL OR c.snooze_until <= current_date)))
      AND (c.owner_id = ${userId} OR c.owner_id IS NULL)
      AND (coalesce(c.phone, '') <> '' OR EXISTS (SELECT 1 FROM prospect_people p WHERE p.company_id = c.id AND coalesce(p.phone, '') <> ''))
      AND NOT EXISTS (SELECT 1 FROM prospect_activities a WHERE a.company_id = c.id AND a.kind = 'call' AND a.created_at > now() - interval '14 days')
    ORDER BY (c.owner_id = ${userId}) DESC NULLS LAST, c.score DESC, c.id
    LIMIT ${limit}`);
  const people = await peopleOf(rows.rows.map((r) => Number(r.id)));
  return rows.rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    activity: r.activity ?? "",
    emirate: r.emirate ?? "",
    industry: r.industry ?? "",
    website: r.website ?? "",
    score: Number(r.score),
    status: r.status,
    ownerId: r.owner_id == null ? null : Number(r.owner_id),
    personalLine: r.personal_line ?? "",
    phone: r.phone,
    people: (people.get(Number(r.id)) ?? []).filter((p) => p.phone || p.email),
    lastCall: r.last_call ? new Date(r.last_call).toISOString() : null,
    lastNote: r.last_note ?? "",
  }));
}
