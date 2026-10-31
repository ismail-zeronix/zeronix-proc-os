import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { pickRecipients } from "./outreach-rules";
import { capOn } from "./sending";

/** What the campaign chat calls a prospect without an industry yet. */
export const UNSORTED = "Not sorted yet";

/**
 * Qualified for a campaign: at least one confirmed email (company inbox or a person's, never a guess), not already
 * being emailed, and not converted, disqualified, replied or snoozed. The do-not-contact list and the CRM are checked
 * again when they are added.
 */
const QUALIFIED = sql`c.status NOT IN ('converted','disqualified','replied','not_now','in_sequence')
  AND NOT EXISTS (SELECT 1 FROM outreach_enrollments e WHERE e.company_id = c.id AND e.status IN ('writing','draft','active','paused'))
  AND (c.email <> '' OR EXISTS (SELECT 1 FROM prospect_people p WHERE p.company_id = c.id AND p.email <> '' AND p.email_status <> 'guess'))`;

/** Qualified prospects per industry, most first. */
export async function industryCounts() {
  const rows = await db.execute<{ industry: string; total: number; ready: number }>(sql`
    SELECT coalesce(nullif(c.industry, ''), ${UNSORTED}) AS industry, count(*)::int AS total, count(*) FILTER (WHERE c.status = 'ready')::int AS ready
    FROM prospect_companies c WHERE ${QUALIFIED}
    GROUP BY 1 ORDER BY 2 DESC`);
  return rows.rows.map((r) => ({ industry: r.industry, total: Number(r.total), ready: Number(r.ready) }));
}

export interface Pick {
  industry: string;
  /** How many, best first (Ready ones, then by score); 0 = all. */
  take: number;
  onlyReady: boolean;
}

/** The prospects a pick covers, best first. */
export async function pickedIds(p: Pick, limit = 500): Promise<number[]> {
  const industry = p.industry === UNSORTED ? "" : p.industry;
  const rows = await db.execute<{ id: number }>(sql`
    SELECT c.id FROM prospect_companies c
    WHERE ${QUALIFIED} AND c.industry = ${industry} ${p.onlyReady ? sql`AND c.status = 'ready'` : sql``}
    ORDER BY (c.status = 'ready') DESC, c.score DESC, c.id
    LIMIT ${Math.min(limit, p.take > 0 ? p.take : limit)}`);
  return rows.rows.map((r) => Number(r.id));
}

/** Who each picked prospect would be emailed at (To and Cc), for the chat to show before anything is created. */
export async function recipientsFor(ids: number[]) {
  if (!ids.length) return [];
  const [companies, people] = await Promise.all([
    db.select({ id: schema.prospectCompanies.id, name: schema.prospectCompanies.name, email: schema.prospectCompanies.email, status: schema.prospectCompanies.status }).from(schema.prospectCompanies).where(inArray(schema.prospectCompanies.id, ids)),
    db.select().from(schema.prospectPeople).where(inArray(schema.prospectPeople.companyId, ids)),
  ]);
  const order = new Map(ids.map((id, i) => [id, i]));
  return companies
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((c) => {
      const r = pickRecipients(c.email, people.filter((p) => p.companyId === c.id));
      return { companyId: c.id, name: c.name, ready: c.status === "ready", to: r?.to ?? "", cc: r?.cc ?? [], personId: r?.personId ?? null, personName: r?.personName ?? "" };
    });
}

/** The sending mailboxes and how many emails a day they can send now (warm-up limits), for the chat's time estimate. */
export async function sendingCapacity() {
  const rows = await db.select().from(schema.outreachMailboxes).where(eq(schema.outreachMailboxes.enabled, true));
  const today = dubaiToday();
  const ready = rows.filter((m) => m.lastTestOk);
  return {
    mailboxes: ready.map((m) => ({ email: m.email, perDay: capOn(m, today), window: `${m.windowStart}-${m.windowEnd}`, days: m.sendDays })),
    perDay: ready.reduce((n, m) => n + capOn(m, today), 0),
    notTested: rows.length - ready.length,
    windowStart: ready[0]?.windowStart ?? "09:00",
  };
}

/** Prospects already waiting for AI to write (shown so people know the queue is shared). */
export async function writingBacklog(): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outreachEnrollments)
    .innerJoin(schema.outreachCampaigns, eq(schema.outreachCampaigns.id, schema.outreachEnrollments.campaignId))
    .where(and(eq(schema.outreachEnrollments.status, "writing"), eq(schema.outreachCampaigns.status, "active")));
  return n;
}
