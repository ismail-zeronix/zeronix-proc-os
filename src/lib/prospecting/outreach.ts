import "server-only";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isFreeMail } from "./constants";
import { firstName, offerLine, render, shortCompany, whyNot, type MergeVars } from "./outreach-rules";
import { MIN_SCORE } from "./score";

// ---------- sequences ----------

export async function listSequences() {
  return db
    .select({
      id: schema.outreachSequences.id,
      name: schema.outreachSequences.name,
      segmentKey: schema.outreachSequences.segmentKey,
      steps: sql<number>`(SELECT count(*)::int FROM outreach_sequence_steps s WHERE s.sequence_id = ${schema.outreachSequences.id})`,
      days: sql<number>`(SELECT coalesce(sum(s.delay_days), 0)::int FROM outreach_sequence_steps s WHERE s.sequence_id = ${schema.outreachSequences.id})`,
      campaigns: sql<number>`(SELECT count(*)::int FROM outreach_campaigns c WHERE c.sequence_id = ${schema.outreachSequences.id})`,
      updatedAt: schema.outreachSequences.updatedAt,
    })
    .from(schema.outreachSequences)
    .orderBy(asc(schema.outreachSequences.id));
}

export async function getSequence(id: number) {
  const [s] = await db.select().from(schema.outreachSequences).where(eq(schema.outreachSequences.id, id));
  if (!s) return null;
  const steps = await db.select().from(schema.outreachSequenceSteps).where(eq(schema.outreachSequenceSteps.sequenceId, id)).orderBy(asc(schema.outreachSequenceSteps.position));
  return { ...s, steps };
}

// ---------- campaigns ----------

const STATUS_COUNTS = sql<Record<string, number>>`coalesce((SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM outreach_enrollments e WHERE e.campaign_id = ${schema.outreachCampaigns.id} GROUP BY status) x), '{}'::jsonb)`;

export async function listCampaigns(page = 1, pageSize = 50) {
  const [{ total }] = await db.select({ total: count() }).from(schema.outreachCampaigns);
  const rows = await db
    .select({
      id: schema.outreachCampaigns.id,
      name: schema.outreachCampaigns.name,
      status: schema.outreachCampaigns.status,
      mailboxIds: schema.outreachCampaigns.mailboxIds,
      sequenceId: schema.outreachCampaigns.sequenceId,
      sequenceName: schema.outreachSequences.name,
      ownerName: sql<string>`coalesce(${schema.users.name}, '')`,
      counts: STATUS_COUNTS,
      createdAt: schema.outreachCampaigns.createdAt,
    })
    .from(schema.outreachCampaigns)
    .innerJoin(schema.outreachSequences, eq(schema.outreachSequences.id, schema.outreachCampaigns.sequenceId))
    .leftJoin(schema.users, eq(schema.users.id, schema.outreachCampaigns.ownerId))
    .orderBy(desc(schema.outreachCampaigns.id))
    .limit(pageSize)
    .offset((Math.max(1, page) - 1) * pageSize);
  return { rows, total };
}
export type CampaignRow = Awaited<ReturnType<typeof listCampaigns>>["rows"][number];

export async function getCampaign(id: number) {
  const [c] = await db
    .select({ campaign: schema.outreachCampaigns, sequenceName: schema.outreachSequences.name, counts: STATUS_COUNTS })
    .from(schema.outreachCampaigns)
    .innerJoin(schema.outreachSequences, eq(schema.outreachSequences.id, schema.outreachCampaigns.sequenceId))
    .where(eq(schema.outreachCampaigns.id, id));
  return c ? { ...c.campaign, sequenceName: c.sequenceName, counts: c.counts } : null;
}

const enrollmentCols = {
  id: schema.outreachEnrollments.id,
  status: schema.outreachEnrollments.status,
  subject: schema.outreachEnrollments.subject,
  body: schema.outreachEnrollments.body,
  currentStep: schema.outreachEnrollments.currentStep,
  nextSendAt: schema.outreachEnrollments.nextSendAt,
  stopReason: schema.outreachEnrollments.stopReason,
  createdAt: schema.outreachEnrollments.createdAt,
  campaignId: schema.outreachEnrollments.campaignId,
  campaignName: schema.outreachCampaigns.name,
  companyId: schema.outreachEnrollments.companyId,
  companyName: schema.prospectCompanies.name,
  personalLine: schema.prospectCompanies.personalLine,
  personName: schema.prospectPeople.name,
  personTitle: schema.prospectPeople.title,
  personEmail: schema.prospectPeople.email,
  emailStatus: schema.prospectPeople.emailStatus,
};

function enrollmentQuery() {
  return db
    .select(enrollmentCols)
    .from(schema.outreachEnrollments)
    .innerJoin(schema.outreachCampaigns, eq(schema.outreachCampaigns.id, schema.outreachEnrollments.campaignId))
    .innerJoin(schema.prospectCompanies, eq(schema.prospectCompanies.id, schema.outreachEnrollments.companyId))
    .innerJoin(schema.prospectPeople, eq(schema.prospectPeople.id, schema.outreachEnrollments.personId));
}

/** People in one campaign, newest first, optionally one status. */
export async function campaignEnrollments(campaignId: number, status: string | undefined, page = 1, pageSize = 50) {
  const where = and(eq(schema.outreachEnrollments.campaignId, campaignId), status ? eq(schema.outreachEnrollments.status, status) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(schema.outreachEnrollments).where(where);
  const rows = await enrollmentQuery()
    .where(where)
    .orderBy(desc(schema.outreachEnrollments.id))
    .limit(pageSize)
    .offset((Math.max(1, page) - 1) * pageSize);
  return { rows, total };
}
export type EnrollmentRow = Awaited<ReturnType<typeof campaignEnrollments>>["rows"][number];

/** First emails waiting for approval, oldest first (so nobody waits long). */
export async function reviewQueue(page = 1, pageSize = 50) {
  const where = eq(schema.outreachEnrollments.status, "draft");
  const [{ total }] = await db.select({ total: count() }).from(schema.outreachEnrollments).where(where);
  const rows = await enrollmentQuery()
    .where(where)
    .orderBy(asc(schema.outreachEnrollments.id))
    .limit(pageSize)
    .offset((Math.max(1, page) - 1) * pageSize);
  return { rows, total };
}

export async function reviewCount(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(schema.outreachEnrollments).where(eq(schema.outreachEnrollments.status, "draft"));
  return n;
}

// ---------- adding people to a campaign ----------

/**
 * Prospects that are already customers or contacts in the CRM, by website domain, company name or contact email.
 * Returns company id -> what matched (shown as the reason). Read-only: Prospecting never changes the CRM here.
 */
export async function crmMatches(items: { companyId: number; domain: string; nameNorm: string; emails: string[] }[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!items.length) return out;
  const domains = [...new Set(items.map((i) => i.domain).filter((d) => d && !isFreeMail(d)))];
  const names = [...new Set(items.map((i) => i.nameNorm).filter(Boolean))];
  const emails = [...new Set(items.flatMap((i) => i.emails).filter(Boolean))];
  // String.raw: a "\3" written straight into sql`` is an invalid escape, so drizzle would get undefined for that piece.
  const host = sql.raw(String.raw`regexp_replace(lower(website), '^(https?://)?(www[0-9]?\.)?([^/:?#]+).*$', '\3')`);
  const companies = await db.execute<{ name: string; name_norm: string; domain: string }>(sql`
    SELECT name, name_norm, ${host} AS domain
    FROM companies
    WHERE name_norm = ANY(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(names)}::jsonb)))
       OR (website <> '' AND ${host} = ANY(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(domains)}::jsonb))))`);
  const contacts = await db.execute<{ email: string; company: string }>(sql`
    SELECT lower(c.email) AS email, co.name AS company FROM contacts c JOIN companies co ON co.id = c.company_id
    WHERE c.email <> '' AND (lower(c.email) = ANY(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(emails)}::jsonb))) OR split_part(lower(c.email), '@', 2) = ANY(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(domains)}::jsonb))))`);
  for (const i of items) {
    const byName = companies.rows.find((c) => c.name_norm === i.nameNorm);
    const byDomain = i.domain ? companies.rows.find((c) => c.domain === i.domain) : undefined;
    const byContact = contacts.rows.find((c) => i.emails.includes(c.email) || (i.domain && c.email.endsWith(`@${i.domain}`)));
    const hit = byDomain ?? byName;
    if (hit) out.set(i.companyId, hit.name);
    else if (byContact) out.set(i.companyId, `contact at ${byContact.company}`);
  }
  return out;
}

/** The merge values for one person in one campaign. */
async function mergeVars(companyId: number, personName: string, mailboxIds: number[]): Promise<MergeVars> {
  const [c] = await db
    .select({ name: schema.prospectCompanies.name, line: schema.prospectCompanies.personalLine, offer: sql<string>`coalesce(${schema.prospectSegments.offer}, '')` })
    .from(schema.prospectCompanies)
    .leftJoin(schema.prospectSegments, eq(schema.prospectSegments.key, schema.prospectCompanies.segmentKey))
    .where(eq(schema.prospectCompanies.id, companyId));
  const [signal] = await db.select({ detail: schema.prospectSignals.detail }).from(schema.prospectSignals).where(eq(schema.prospectSignals.companyId, companyId)).orderBy(desc(schema.prospectSignals.observedOn)).limit(1);
  const [mailbox] = await db
    .select({ fromName: schema.outreachMailboxes.fromName })
    .from(schema.outreachMailboxes)
    .where(mailboxIds.length ? inArray(schema.outreachMailboxes.id, mailboxIds) : eq(schema.outreachMailboxes.enabled, true))
    .orderBy(asc(schema.outreachMailboxes.id))
    .limit(1);
  return {
    first_name: firstName(personName),
    company: shortCompany(c?.name ?? ""),
    personal_line: c?.line ?? "",
    offer_line: offerLine(c?.offer ?? ""),
    signal: signal?.detail ?? "",
    sender_first_name: firstName(mailbox?.fromName ?? ""),
  };
}

export interface EnrollResult {
  added: number;
  skipped: { name: string; reason: string }[];
}

/**
 * Adds each prospect's main contact to a campaign as a draft first email for the review queue. Every rule that keeps
 * cold email safe is checked here (and again before sending): a real email, not blocked, not a CRM customer, not
 * already being emailed, 90 days since the last campaign, at most 2 people per company, a good enough score.
 */
export async function enroll(campaignId: number, companyIds: number[], userId: number): Promise<EnrollResult> {
  const [campaign] = await db.select().from(schema.outreachCampaigns).where(eq(schema.outreachCampaigns.id, campaignId));
  if (!campaign) throw new Error("That campaign no longer exists");
  const [step1] = await db
    .select()
    .from(schema.outreachSequenceSteps)
    .where(and(eq(schema.outreachSequenceSteps.sequenceId, campaign.sequenceId), eq(schema.outreachSequenceSteps.position, 1)));
  if (!step1) throw new Error("The campaign's sequence has no first email");

  const companies = await db.select().from(schema.prospectCompanies).where(inArray(schema.prospectCompanies.id, companyIds));
  const people = await db.select().from(schema.prospectPeople).where(inArray(schema.prospectPeople.companyId, companyIds));
  const main = new Map<number, (typeof people)[number]>();
  for (const p of [...people].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.id - b.id)) if (!main.has(p.companyId)) main.set(p.companyId, p);

  const emails = [...main.values()].map((p) => p.email.toLowerCase()).filter(Boolean);
  const domains = companies.map((c) => c.domain ?? "").filter(Boolean);
  const keys = [...new Set([...emails, ...domains, ...emails.map((e) => e.split("@")[1] ?? "")].filter(Boolean))];
  const blocked = keys.length ? await db.select({ value: schema.outreachSuppression.value }).from(schema.outreachSuppression).where(inArray(schema.outreachSuppression.value, keys)) : [];
  const blockedSet = new Set(blocked.map((b) => b.value));
  const crm = await crmMatches(companies.map((c) => ({ companyId: c.id, domain: c.domain ?? "", nameNorm: c.nameNorm, emails: main.get(c.id)?.email ? [main.get(c.id)!.email.toLowerCase()] : [] })));
  const history = await db
    .select({ personId: schema.outreachEnrollments.personId, companyId: schema.outreachEnrollments.companyId, status: schema.outreachEnrollments.status, updatedAt: schema.outreachEnrollments.updatedAt })
    .from(schema.outreachEnrollments)
    .where(inArray(schema.outreachEnrollments.companyId, companyIds));

  const res: EnrollResult = { added: 0, skipped: [] };
  const now = Date.now();
  for (const c of companies) {
    const p = main.get(c.id);
    const email = p?.email.toLowerCase() ?? "";
    const mine = history.filter((h) => h.personId === p?.id);
    const ended = mine.filter((h) => !["draft", "active", "paused"].includes(h.status) && h.status !== "skipped");
    const last = ended.length ? Math.max(...ended.map((h) => h.updatedAt.getTime())) : null;
    const reason = whyNot({
      personEmail: email,
      emailStatus: p?.emailStatus ?? "guess",
      companyStatus: c.status,
      score: c.score,
      minScore: MIN_SCORE,
      suppressed: blockedSet.has(email) || blockedSet.has(email.split("@")[1] ?? "-") || (!!c.domain && blockedSet.has(c.domain)),
      inCrm: crm.get(c.id) ?? "",
      openEnrollment: mine.some((h) => ["draft", "active", "paused"].includes(h.status)),
      daysSinceLast: last === null ? null : Math.floor((now - last) / 86400_000),
      companyOpen: history.filter((h) => h.companyId === c.id && h.personId !== p?.id && ["draft", "active", "paused"].includes(h.status)).length,
    });
    if (!p || reason) {
      res.skipped.push({ name: c.name, reason: p ? reason! : "no contact person yet" });
      continue;
    }
    const vars = await mergeVars(c.id, p.name, campaign.mailboxIds);
    await db
      .insert(schema.outreachEnrollments)
      .values({ campaignId, companyId: c.id, personId: p.id, subject: render(step1.subject, vars).text, body: render(step1.body, vars).text, createdBy: userId })
      .onConflictDoNothing();
    res.added++;
  }
  return res;
}

/** Campaigns people can still add prospects to. */
export async function openCampaigns() {
  return db
    .select({ id: schema.outreachCampaigns.id, name: schema.outreachCampaigns.name })
    .from(schema.outreachCampaigns)
    .where(sql`${schema.outreachCampaigns.status} <> 'finished'`)
    .orderBy(desc(schema.outreachCampaigns.id));
}
