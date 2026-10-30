import "server-only";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { allowedApps } from "@/lib/apps";
import type { StatusKey } from "./constants";

const owner = alias(schema.users, "owner");
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export interface ProspectFilter {
  q?: string;
  status?: string;
  segment?: string;
  ownerId?: number;
  sourceId?: number;
}

export interface ProspectRow {
  id: number;
  name: string;
  domain: string;
  emirate: string;
  freeZone: string;
  activity: string;
  licenseDate: string | null;
  segmentKey: string | null;
  segmentLabel: string;
  sourceName: string;
  status: StatusKey;
  score: number;
  ownerId: number | null;
  ownerName: string;
  person: string;
  personTitle: string;
  signals: number;
  createdAt: Date;
}

/** The prospect list, best score first. Everyone with the app sees every prospect (it is one shared list). */
export async function listProspects(f: ProspectFilter = {}): Promise<ProspectRow[]> {
  const term = f.q?.trim();
  const rows = await db
    .select({
      id: schema.prospectCompanies.id,
      name: schema.prospectCompanies.name,
      domain: sql<string>`coalesce(${schema.prospectCompanies.domain}, '')`,
      emirate: schema.prospectCompanies.emirate,
      freeZone: schema.prospectCompanies.freeZone,
      activity: schema.prospectCompanies.activity,
      licenseDate: schema.prospectCompanies.licenseDate,
      segmentKey: schema.prospectCompanies.segmentKey,
      segmentLabel: sql<string>`coalesce(${schema.prospectSegments.label}, '')`,
      sourceName: sql<string>`coalesce(${schema.prospectSources.name}, '')`,
      status: schema.prospectCompanies.status,
      score: schema.prospectCompanies.score,
      ownerId: schema.prospectCompanies.ownerId,
      ownerName: sql<string>`coalesce(${owner.name}, '')`,
      person: sql<string>`coalesce((SELECT p.name FROM prospect_people p WHERE p.company_id = ${schema.prospectCompanies.id} ORDER BY p.is_primary DESC, p.id LIMIT 1), '')`,
      personTitle: sql<string>`coalesce((SELECT p.title FROM prospect_people p WHERE p.company_id = ${schema.prospectCompanies.id} ORDER BY p.is_primary DESC, p.id LIMIT 1), '')`,
      signals: sql<number>`(SELECT count(*)::int FROM prospect_signals s WHERE s.company_id = ${schema.prospectCompanies.id})`,
      createdAt: schema.prospectCompanies.createdAt,
    })
    .from(schema.prospectCompanies)
    .leftJoin(schema.prospectSegments, eq(schema.prospectSegments.key, schema.prospectCompanies.segmentKey))
    .leftJoin(schema.prospectSources, eq(schema.prospectSources.id, schema.prospectCompanies.sourceId))
    .leftJoin(owner, eq(owner.id, schema.prospectCompanies.ownerId))
    .where(
      and(
        f.status ? eq(schema.prospectCompanies.status, f.status) : undefined,
        f.segment ? eq(schema.prospectCompanies.segmentKey, f.segment) : undefined,
        f.ownerId ? eq(schema.prospectCompanies.ownerId, f.ownerId) : undefined,
        f.sourceId ? eq(schema.prospectCompanies.sourceId, f.sourceId) : undefined,
        term
          ? or(
              ilike(schema.prospectCompanies.name, like(term)),
              ilike(schema.prospectCompanies.domain, like(term)),
              ilike(schema.prospectCompanies.activity, like(term)),
              ilike(schema.prospectCompanies.phone, like(term)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(schema.prospectCompanies.score), desc(schema.prospectCompanies.createdAt))
    .limit(1000);
  return rows as ProspectRow[];
}

/** One prospect with its people, signals and timeline. Null when it does not exist. */
export async function getProspect(id: number) {
  const [c] = await db
    .select({
      company: schema.prospectCompanies,
      segmentLabel: sql<string>`coalesce(${schema.prospectSegments.label}, '')`,
      segmentOffer: sql<string>`coalesce(${schema.prospectSegments.offer}, '')`,
      segmentRoles: sql<string[]>`coalesce(${schema.prospectSegments.keyRoles}, '{}'::text[])`,
      sourceName: sql<string>`coalesce(${schema.prospectSources.name}, '')`,
      ownerName: sql<string>`coalesce(${owner.name}, '')`,
    })
    .from(schema.prospectCompanies)
    .leftJoin(schema.prospectSegments, eq(schema.prospectSegments.key, schema.prospectCompanies.segmentKey))
    .leftJoin(schema.prospectSources, eq(schema.prospectSources.id, schema.prospectCompanies.sourceId))
    .leftJoin(owner, eq(owner.id, schema.prospectCompanies.ownerId))
    .where(eq(schema.prospectCompanies.id, id));
  if (!c) return null;
  const [people, signals, activities] = await Promise.all([
    db
      .select()
      .from(schema.prospectPeople)
      .where(eq(schema.prospectPeople.companyId, id))
      .orderBy(desc(schema.prospectPeople.isPrimary), asc(schema.prospectPeople.id)),
    db
      .select()
      .from(schema.prospectSignals)
      .where(eq(schema.prospectSignals.companyId, id))
      .orderBy(desc(schema.prospectSignals.observedOn)),
    db
      .select({
        id: schema.prospectActivities.id,
        kind: schema.prospectActivities.kind,
        body: schema.prospectActivities.body,
        createdAt: schema.prospectActivities.createdAt,
        userName: sql<string>`coalesce(${schema.users.name}, '')`,
      })
      .from(schema.prospectActivities)
      .leftJoin(schema.users, eq(schema.users.id, schema.prospectActivities.userId))
      .where(eq(schema.prospectActivities.companyId, id))
      .orderBy(desc(schema.prospectActivities.createdAt))
      .limit(200),
  ]);
  return { ...c.company, segmentLabel: c.segmentLabel, segmentOffer: c.segmentOffer, segmentRoles: c.segmentRoles, sourceName: c.sourceName, ownerName: c.ownerName, people, signals, activities };
}
export type ProspectDetail = NonNullable<Awaited<ReturnType<typeof getProspect>>>;

export async function listSegments() {
  return db.select().from(schema.prospectSegments).orderBy(asc(schema.prospectSegments.position), asc(schema.prospectSegments.label));
}

export async function listSources() {
  return db
    .select({
      id: schema.prospectSources.id,
      key: schema.prospectSources.key,
      name: schema.prospectSources.name,
      url: schema.prospectSources.url,
      access: schema.prospectSources.access,
      segmentKey: schema.prospectSources.segmentKey,
      notes: schema.prospectSources.notes,
      termsCheckedAt: schema.prospectSources.termsCheckedAt,
      enabled: schema.prospectSources.enabled,
      prospects: sql<number>`(SELECT count(*)::int FROM prospect_companies c WHERE c.source_id = ${schema.prospectSources.id})`,
    })
    .from(schema.prospectSources)
    .orderBy(asc(schema.prospectSources.id));
}

export async function listSuppression() {
  return db
    .select({
      id: schema.outreachSuppression.id,
      value: schema.outreachSuppression.value,
      kind: schema.outreachSuppression.kind,
      reason: schema.outreachSuppression.reason,
      note: schema.outreachSuppression.note,
      createdAt: schema.outreachSuppression.createdAt,
      byName: sql<string>`coalesce(${schema.users.name}, '')`,
    })
    .from(schema.outreachSuppression)
    .leftJoin(schema.users, eq(schema.users.id, schema.outreachSuppression.createdBy))
    .orderBy(desc(schema.outreachSuppression.createdAt))
    .limit(2000);
}

/** People who can own a prospect: anyone active with the Prospecting app. */
export async function prospectingUsers() {
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, apps: schema.users.apps })
    .from(schema.users)
    .where(eq(schema.users.isActive, true))
    .orderBy(asc(schema.users.name));
  return rows.filter((u) => allowedApps(u).includes("prospecting")).map((u) => ({ id: u.id, name: u.name }));
}

/** Numbers for the Overview page. */
export async function prospectingOverview() {
  const [byStatus, bySegment, [week], recent] = await Promise.all([
    db
      .select({ status: schema.prospectCompanies.status, n: sql<number>`count(*)::int` })
      .from(schema.prospectCompanies)
      .groupBy(schema.prospectCompanies.status),
    db
      .select({ key: schema.prospectSegments.key, label: schema.prospectSegments.label, n: sql<number>`count(${schema.prospectCompanies.id})::int` })
      .from(schema.prospectSegments)
      .leftJoin(schema.prospectCompanies, eq(schema.prospectCompanies.segmentKey, schema.prospectSegments.key))
      .groupBy(schema.prospectSegments.key, schema.prospectSegments.label, schema.prospectSegments.position)
      .orderBy(asc(schema.prospectSegments.position)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.prospectCompanies)
      .where(sql`${schema.prospectCompanies.createdAt} > now() - interval '7 days'`),
    db
      .select({ id: schema.prospectCompanies.id, name: schema.prospectCompanies.name, status: schema.prospectCompanies.status, score: schema.prospectCompanies.score, createdAt: schema.prospectCompanies.createdAt })
      .from(schema.prospectCompanies)
      .orderBy(desc(schema.prospectCompanies.createdAt))
      .limit(8),
  ]);
  const count = Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Record<string, number>;
  return { count, total: byStatus.reduce((s, r) => s + r.n, 0), addedThisWeek: week?.n ?? 0, bySegment, recent };
}
