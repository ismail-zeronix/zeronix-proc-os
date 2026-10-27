import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { allowedApps } from "@/lib/apps";
import { companyVisible, dealVisible, type Viewer } from "@/lib/auth/visibility";
import { temperature, type Checks, type StageKey, type Temperature } from "@/lib/sales";

const owner = alias(schema.users, "owner");

export interface DealRow {
  id: number;
  title: string;
  stage: StageKey;
  /** "project" deals also have a project in the Projects app. */
  kind: "product" | "project";
  companyId: number;
  companyName: string;
  contactId: number | null;
  contactName: string;
  ownerId: number | null;
  ownerName: string;
  /** Everyone working on the deal, main owner first. */
  assignees: { id: number; name: string }[];
  valueAed: number | null;
  expectedClose: string | null;
  checks: Checks;
  temp: Temperature;
  stageChangedAt: Date;
  createdAt: Date;
  closedAt: Date | null;
  /** Earliest open follow-up task due date for this deal (YYYY-MM-DD). */
  nextDue: string | null;
  lastActivityAt: Date | null;
}

const dealColumns = {
  id: schema.deals.id,
  title: schema.deals.title,
  stage: schema.deals.stage,
  kind: schema.deals.kind,
  companyId: schema.deals.companyId,
  companyName: schema.companies.name,
  contactId: schema.deals.contactId,
  contactName: sql<string>`coalesce(${schema.contacts.name}, '')`,
  ownerId: schema.deals.ownerId,
  ownerName: sql<string>`coalesce(${owner.name}, '')`,
  assignees: sql<{ id: number; name: string }[]>`(SELECT coalesce(json_agg(json_build_object('id', u.id, 'name', u.name) ORDER BY a.position, u.name), '[]'::json) FROM deal_assignees a JOIN users u ON u.id = a.user_id WHERE a.deal_id = ${schema.deals.id})`,
  valueAed: schema.deals.valueAed,
  expectedClose: schema.deals.expectedClose,
  checks: schema.deals.checks,
  stageChangedAt: schema.deals.stageChangedAt,
  createdAt: schema.deals.createdAt,
  closedAt: schema.deals.closedAt,
  nextDue: sql<string | null>`(SELECT min(t.due_date)::text FROM tasks t WHERE t.related_type = 'deal' AND t.related_id = ${schema.deals.id} AND t.status = 'open')`,
  lastActivityAt: sql<string | null>`(SELECT max(a.at) FROM activities a WHERE a.deal_id = ${schema.deals.id})`,
};

function dealQuery() {
  return db
    .select(dealColumns)
    .from(schema.deals)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.deals.contactId))
    .leftJoin(owner, eq(owner.id, schema.deals.ownerId));
}

function toRow(r: Awaited<ReturnType<typeof dealQuery>>[number]): DealRow {
  return {
    ...r,
    stage: r.stage as StageKey,
    checks: r.checks as Checks,
    temp: temperature(r.checks as Checks),
    lastActivityAt: r.lastActivityAt ? new Date(r.lastActivityAt) : null,
  };
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Deals for the board and list, as far as the viewer may see them. `memberId` limits to the deals one person is assigned to. */
export async function listDeals(v: Viewer, opts: { memberId?: number; q?: string; kind?: "product" | "project" } = {}): Promise<DealRow[]> {
  const where: (SQL | undefined)[] = [dealVisible(v, schema.deals.id)];
  if (opts.kind) where.push(eq(schema.deals.kind, opts.kind));
  if (opts.memberId) {
    where.push(sql`EXISTS (SELECT 1 FROM deal_assignees a WHERE a.deal_id = ${schema.deals.id} AND a.user_id = ${opts.memberId})`);
  }
  const q = opts.q?.trim();
  if (q) {
    where.push(
      or(
        ilike(schema.deals.title, like(q)),
        ilike(schema.companies.name, like(q)),
        ilike(schema.contacts.name, like(q)),
        ilike(schema.deals.requirement, like(q)),
      ),
    );
  }
  const rows = await dealQuery()
    .where(and(...where))
    .orderBy(desc(schema.deals.stageChangedAt))
    .limit(500);
  return rows.map(toRow);
}

/** One deal, or null when it does not exist or the viewer may not see it. */
export async function getDeal(id: number, v: Viewer) {
  const [row] = await dealQuery().where(and(eq(schema.deals.id, id), dealVisible(v, schema.deals.id)));
  if (!row) return null;
  const [full] = await db
    .select({ requirement: schema.deals.requirement, source: schema.deals.source, lostReason: schema.deals.lostReason })
    .from(schema.deals)
    .where(eq(schema.deals.id, id));
  return { ...toRow(row), ...full };
}

export async function dealActivities(dealId: number) {
  return db
    .select({
      id: schema.activities.id,
      type: schema.activities.type,
      body: schema.activities.body,
      at: schema.activities.at,
      userName: sql<string>`coalesce(${schema.users.name}, '')`,
    })
    .from(schema.activities)
    .leftJoin(schema.users, eq(schema.users.id, schema.activities.userId))
    .where(eq(schema.activities.dealId, dealId))
    .orderBy(desc(schema.activities.at), desc(schema.activities.id))
    .limit(200);
}

export interface CompanyRow {
  id: number;
  name: string;
  industry: string;
  emirate: string;
  website: string;
  phone: string;
  source: string;
  ownerName: string;
  contacts: number;
  openDeals: number;
  createdAt: Date;
}

export async function listCompanies(v: Viewer, q?: string): Promise<CompanyRow[]> {
  const term = q?.trim();
  const mine = dealVisible(v, sql`d.id`);
  const rows = await db
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      industry: schema.companies.industry,
      emirate: schema.companies.emirate,
      website: schema.companies.website,
      phone: schema.companies.phone,
      source: schema.companies.source,
      ownerName: sql<string>`coalesce(${owner.name}, '')`,
      createdAt: schema.companies.createdAt,
      contacts: sql<number>`(SELECT count(*)::int FROM contacts c WHERE c.company_id = ${schema.companies.id})`,
      openDeals: sql<number>`(SELECT count(*)::int FROM deals d WHERE d.company_id = ${schema.companies.id} AND d.stage NOT IN ('won','lost') AND ${mine})`,
    })
    .from(schema.companies)
    .leftJoin(owner, eq(owner.id, schema.companies.ownerId))
    .where(
      and(
        companyVisible(v, schema.companies.id),
        term ? or(ilike(schema.companies.name, like(term)), ilike(schema.companies.website, like(term)), ilike(schema.companies.phone, like(term))) : undefined,
      ),
    )
    .orderBy(asc(schema.companies.name))
    .limit(500);
  return rows;
}

/** One company with its contacts, the deals the viewer may see and their history. Null when hidden from the viewer. */
export async function getCompany(id: number, v: Viewer) {
  const [company] = await db
    .select({ c: schema.companies, ownerName: sql<string>`coalesce(${owner.name}, '')` })
    .from(schema.companies)
    .leftJoin(owner, eq(owner.id, schema.companies.ownerId))
    .where(and(eq(schema.companies.id, id), companyVisible(v, schema.companies.id)));
  if (!company) return null;
  const [contacts, deals, activities] = await Promise.all([
    db.select().from(schema.contacts).where(eq(schema.contacts.companyId, id)).orderBy(desc(schema.contacts.isDecisionMaker), asc(schema.contacts.name)),
    dealQuery().where(and(eq(schema.deals.companyId, id), dealVisible(v, schema.deals.id))).orderBy(desc(schema.deals.createdAt)),
    db
      .select({
        id: schema.activities.id,
        type: schema.activities.type,
        body: schema.activities.body,
        at: schema.activities.at,
        dealId: schema.activities.dealId,
        dealTitle: schema.deals.title,
        userName: sql<string>`coalesce(${schema.users.name}, '')`,
      })
      .from(schema.activities)
      .leftJoin(schema.users, eq(schema.users.id, schema.activities.userId))
      .leftJoin(schema.deals, eq(schema.deals.id, schema.activities.dealId))
      // company notes, plus the history of the deals the viewer is on
      .where(
        and(
          eq(schema.activities.companyId, id),
          v.seesAll ? undefined : or(sql`${schema.activities.dealId} IS NULL`, dealVisible(v, schema.activities.dealId)),
        ),
      )
      .orderBy(desc(schema.activities.at))
      .limit(50),
  ]);
  return { ...company.c, ownerName: company.ownerName, contacts, deals: deals.map(toRow), activities };
}

export async function listContacts(v: Viewer, q?: string) {
  const term = q?.trim();
  return db
    .select({
      id: schema.contacts.id,
      name: schema.contacts.name,
      jobTitle: schema.contacts.jobTitle,
      email: schema.contacts.email,
      phone: schema.contacts.phone,
      whatsapp: schema.contacts.whatsapp,
      isDecisionMaker: schema.contacts.isDecisionMaker,
      companyId: schema.contacts.companyId,
      companyName: schema.companies.name,
    })
    .from(schema.contacts)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
    .where(
      and(
        companyVisible(v, schema.companies.id),
        term
          ? or(
              ilike(schema.contacts.name, like(term)),
              ilike(schema.contacts.email, like(term)),
              ilike(schema.contacts.phone, like(term)),
              ilike(schema.companies.name, like(term)),
            )
          : undefined,
      ),
    )
    .orderBy(asc(schema.contacts.name))
    .limit(500);
}

/** Companies for the "pick a company" box, best matches first. */
export async function searchCompanies(v: Viewer, q: string, limit = 8) {
  const term = q.trim();
  if (!term) return [];
  return db
    .select({ id: schema.companies.id, name: schema.companies.name, emirate: schema.companies.emirate, industry: schema.companies.industry })
    .from(schema.companies)
    .where(and(ilike(schema.companies.name, like(term)), companyVisible(v, schema.companies.id)))
    .orderBy(asc(schema.companies.name))
    .limit(limit);
}

export async function contactsOfCompany(companyId: number) {
  return db
    .select({ id: schema.contacts.id, name: schema.contacts.name, jobTitle: schema.contacts.jobTitle, email: schema.contacts.email, phone: schema.contacts.phone })
    .from(schema.contacts)
    .where(eq(schema.contacts.companyId, companyId))
    .orderBy(desc(schema.contacts.isDecisionMaker), asc(schema.contacts.name));
}

/** Open follow-up tasks of one deal. */
export async function dealTasks(dealId: number) {
  return db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      notes: schema.tasks.notes,
      dueDate: schema.tasks.dueDate,
      priority: schema.tasks.priority,
      status: schema.tasks.status,
      assignedTo: schema.tasks.assignedTo,
      createdBy: schema.tasks.createdBy,
      assigneeName: schema.users.name,
      relatedType: schema.tasks.relatedType,
      relatedId: schema.tasks.relatedId,
      relatedTitle: sql<string | null>`null`,
      doneAt: sql<string | null>`to_char(${schema.tasks.doneAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(schema.tasks)
    .innerJoin(schema.users, eq(schema.users.id, schema.tasks.assignedTo))
    .where(and(eq(schema.tasks.relatedType, "deal"), eq(schema.tasks.relatedId, dealId)))
    .orderBy(asc(schema.tasks.status), sql`${schema.tasks.dueDate} NULLS LAST`);
}

/** Active people who can use the Sales app, so a deal is only ever given to someone who can open it. */
export async function salesUsers() {
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, apps: schema.users.apps })
    .from(schema.users)
    .where(eq(schema.users.isActive, true))
    .orderBy(asc(schema.users.name));
  return rows.filter((u) => allowedApps(u).includes("crm")).map((u) => ({ id: u.id, name: u.name }));
}

/** People who can look after a customer: anyone active with CRM or Sales. */
export async function customerOwnerUsers() {
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, apps: schema.users.apps })
    .from(schema.users)
    .where(eq(schema.users.isActive, true))
    .orderBy(asc(schema.users.name));
  return rows.filter((u) => allowedApps(u).some((a) => a === "crm" || a === "sales")).map((u) => ({ id: u.id, name: u.name }));
}


export interface StageTotal {
  stage: StageKey;
  count: number;
  value: number;
}

export interface Attention {
  id: number;
  title: string;
  companyName: string;
  reason: string;
}

/**
 * Sales numbers for the home screen. Admins (and "All data" users) see the whole team, everybody else their own deals.
 * Cached per request so the tiles and the widgets share one set of queries.
 */
export const salesPulse = cache(async (userId: number, seesAll: boolean) => {
  const mine = dealVisible({ id: userId, seesAll }, sql`d.id`);
  const week = sql`now() - interval '7 days'`;
  const [totals, byStage, stale] = await Promise.all([
    db.execute<{ new_week: number; open_n: number; open_value: number; won_n: number; won_value: number; quoted_n: number; new_n: number }>(sql`
      SELECT
        count(*) FILTER (WHERE d.created_at >= ${week})::int AS new_week,
        count(*) FILTER (WHERE d.stage NOT IN ('won','lost'))::int AS open_n,
        coalesce(sum(d.value_aed) FILTER (WHERE d.stage NOT IN ('won','lost')), 0)::float AS open_value,
        count(*) FILTER (WHERE d.stage = 'won' AND d.closed_at >= ${week})::int AS won_n,
        coalesce(sum(d.value_aed) FILTER (WHERE d.stage = 'won' AND d.closed_at >= ${week}), 0)::float AS won_value,
        count(*) FILTER (WHERE d.stage = 'quoted')::int AS quoted_n,
        count(*) FILTER (WHERE d.stage = 'new')::int AS new_n
      FROM deals d WHERE ${mine}`),
    db.execute<{ stage: string; n: number; v: number }>(sql`
      SELECT d.stage, count(*)::int AS n, coalesce(sum(d.value_aed), 0)::float AS v
      FROM deals d WHERE d.stage NOT IN ('won','lost') AND ${mine} GROUP BY d.stage`),
    db.execute<{ id: number; title: string; company_name: string; stage: string; idle_days: number }>(sql`
      SELECT d.id, d.title, c.name AS company_name, d.stage,
             floor(extract(epoch FROM (now() - greatest(d.created_at, coalesce((SELECT max(a.at) FROM activities a WHERE a.deal_id = d.id), d.created_at)))) / 86400)::int AS idle_days
      FROM deals d JOIN companies c ON c.id = d.company_id
      WHERE d.stage NOT IN ('won','lost') AND ${mine}
        AND greatest(d.created_at, coalesce((SELECT max(a.at) FROM activities a WHERE a.deal_id = d.id), d.created_at)) < now() - interval '3 days'
      ORDER BY idle_days DESC LIMIT 6`),
  ]);
  const t = totals.rows[0];
  const stages = byStage.rows.map((r) => ({ stage: r.stage as StageKey, count: r.n, value: r.v }));
  const attention: Attention[] = stale.rows.map((r) => ({
    id: r.id,
    title: r.title,
    companyName: r.company_name,
    reason: r.stage === "new" ? `New deal, nobody has contacted them for ${r.idle_days} days` : `No activity for ${r.idle_days} days`,
  }));
  return {
    newThisWeek: t.new_week,
    openCount: t.open_n,
    openValue: t.open_value,
    wonCount: t.won_n,
    wonValue: t.won_value,
    quotedCount: t.quoted_n,
    newCount: t.new_n,
    stages,
    attention,
    scope: seesAll ? "whole team" : "your deals",
  };
});

/** Active people who use Sales: who a quote can be in the name of. */
export async function salesPeople() {
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, apps: schema.users.apps })
    .from(schema.users)
    .where(eq(schema.users.isActive, true))
    .orderBy(asc(schema.users.name));
  return rows.filter((u) => allowedApps(u).includes("sales")).map((u) => ({ id: u.id, name: u.name }));
}
