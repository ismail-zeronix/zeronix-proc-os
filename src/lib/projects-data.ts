import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { db, schema } from "@/db";
import type { db as Db } from "@/db";
import { dealVisible, type Viewer } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { nextSeq } from "@/lib/doc-numbers";
import { checklistDue, projectNumber, projectPhase, type Phase } from "@/lib/projects";
import type { StageKey } from "@/lib/sales";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

const manager = alias(schema.users, "manager");

/** Project types for pickers, in admin order. `all` includes switched-off ones (for showing old projects' labels). */
export const projectTypes = cache(async (all = false) => {
  const rows = await db.select().from(schema.projectTypes).orderBy(asc(schema.projectTypes.position), asc(schema.projectTypes.label));
  return all ? rows : rows.filter((t) => t.isActive);
});

/**
 * Adds the checklist of a project type to a project as tasks, assigned to `assignee`. With `onlyMissing`, a template whose
 * title is already on the project is skipped (used after the type changes). Returns how many were added.
 */
export async function seedChecklist(
  tx: Tx,
  p: { id: number; typeKey: string; openedDay: string; startDate: string | null },
  assignee: number,
  actorId: number,
  onlyMissing = false,
): Promise<number> {
  const templates = await tx
    .select()
    .from(schema.projectTaskTemplates)
    .where(eq(schema.projectTaskTemplates.typeKey, p.typeKey))
    .orderBy(asc(schema.projectTaskTemplates.checklistGroup), asc(schema.projectTaskTemplates.position), asc(schema.projectTaskTemplates.id));
  const have = onlyMissing
    ? new Set(
        (await tx.select({ title: schema.tasks.title }).from(schema.tasks).where(and(eq(schema.tasks.relatedType, "project"), eq(schema.tasks.relatedId, p.id)))).map((t) =>
          t.title.trim().toLowerCase(),
        ),
      )
    : new Set<string>();
  const [last] = await tx
    .select({ n: sql<number>`coalesce(max(${schema.tasks.position}), -1)::int` })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.relatedType, "project"), eq(schema.tasks.relatedId, p.id)));
  const add = templates.filter((t) => !have.has(t.title.trim().toLowerCase()));
  if (!add.length) return 0;
  await tx.insert(schema.tasks).values(
    add.map((t, i) => ({
      title: t.title,
      dueDate: checklistDue(t.checklistGroup, t.offsetDays, p.openedDay, p.startDate),
      assignedTo: assignee,
      createdBy: actorId,
      relatedType: "project",
      relatedId: p.id,
      checklistGroup: t.checklistGroup,
      position: last.n + 1 + i,
      required: t.required,
      offsetDays: t.offsetDays,
    })),
  );
  return add.length;
}

/**
 * Makes sure a project deal has its project row (numbered ZPJ-YYYY-NNNN, with the type's BOQ sections and checklist), or
 * updates its type. Call inside the transaction that creates the deal or switches it to "project".
 */
export async function ensureProject(tx: Tx, dealId: number, typeKey: string, managerId: number | null, actorId: number): Promise<{ id: number; number: string; created: boolean }> {
  const [type] = await tx
    .select({ key: schema.projectTypes.key, sections: schema.projectTypes.defaultSections })
    .from(schema.projectTypes)
    .where(eq(schema.projectTypes.key, typeKey));
  if (!type) throw new Error("Pick a project type.");
  const [existing] = await tx.select({ id: schema.projects.id, number: schema.projects.number, typeKey: schema.projects.typeKey }).from(schema.projects).where(eq(schema.projects.dealId, dealId));
  if (existing) {
    if (existing.typeKey !== typeKey) {
      // a new type brings its BOQ sections, but only while the BOQ is still empty, so priced work is never regrouped
      const [line] = await tx.select({ id: schema.dealItems.id }).from(schema.dealItems).where(eq(schema.dealItems.dealId, dealId)).limit(1);
      await tx
        .update(schema.projects)
        .set({ typeKey, ...(line ? {} : { boqSections: type.sections }), updatedAt: new Date() })
        .where(eq(schema.projects.id, existing.id));
    }
    return { id: existing.id, number: existing.number, created: false };
  }
  const year = Number(dubaiToday().slice(0, 4));
  const seq = await nextSeq(tx, "project", schema.projects, schema.projects.year, schema.projects.seq, year);
  const number = projectNumber(year, seq);
  const [row] = await tx.insert(schema.projects).values({ year, seq, number, dealId, typeKey, managerId, boqSections: type.sections }).returning({ id: schema.projects.id });
  await seedChecklist(tx, { id: row.id, typeKey, openedDay: dubaiToday(), startDate: null }, managerId ?? actorId, actorId);
  return { id: row.id, number, created: true };
}

export interface ProjectRow {
  id: number;
  number: string;
  dealId: number;
  title: string;
  stage: StageKey;
  status: string;
  phase: Phase;
  typeKey: string;
  typeLabel: string;
  companyId: number;
  companyName: string;
  contactName: string;
  valueAed: number | null;
  managerId: number | null;
  managerName: string;
  assignees: { id: number; name: string }[];
  startDate: string | null;
  targetDate: string | null;
  completedOn: string | null;
  tasksOpen: number;
  tasksDone: number;
  /** Earliest open task due date (YYYY-MM-DD). */
  nextDue: string | null;
  closedAt: Date | null;
  createdAt: Date;
}

// the checklist (tasks of the project) drives the progress bar; follow-ups on the deal also count for "next due"
const taskCount = (status: "open" | "done") =>
  sql<number>`(SELECT count(*)::int FROM tasks t WHERE t.related_type = 'project' AND t.related_id = ${schema.projects.id} AND t.status = ${status})`;

const columns = {
  id: schema.projects.id,
  number: schema.projects.number,
  dealId: schema.projects.dealId,
  title: schema.deals.title,
  stage: schema.deals.stage,
  status: schema.projects.status,
  typeKey: schema.projects.typeKey,
  typeLabel: schema.projectTypes.label,
  companyId: schema.deals.companyId,
  companyName: schema.companies.name,
  contactName: sql<string>`coalesce(${schema.contacts.name}, '')`,
  valueAed: schema.deals.valueAed,
  managerId: schema.projects.managerId,
  managerName: sql<string>`coalesce(${manager.name}, '')`,
  assignees: sql<{ id: number; name: string }[]>`(SELECT coalesce(json_agg(json_build_object('id', u.id, 'name', u.name) ORDER BY a.position, u.name), '[]'::json) FROM deal_assignees a JOIN users u ON u.id = a.user_id WHERE a.deal_id = ${schema.projects.dealId})`,
  startDate: schema.projects.startDate,
  targetDate: schema.projects.targetDate,
  completedOn: schema.projects.completedOn,
  tasksOpen: taskCount("open"),
  tasksDone: taskCount("done"),
  nextDue: sql<string | null>`(SELECT min(t.due_date)::text FROM tasks t WHERE t.status = 'open'
    AND ((t.related_type = 'deal' AND t.related_id = ${schema.projects.dealId}) OR (t.related_type = 'project' AND t.related_id = ${schema.projects.id})))`,
  closedAt: schema.deals.closedAt,
  createdAt: schema.projects.createdAt,
};

function query() {
  return db
    .select(columns)
    .from(schema.projects)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .innerJoin(schema.projectTypes, eq(schema.projectTypes.key, schema.projects.typeKey))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.deals.contactId))
    .leftJoin(manager, eq(manager.id, schema.projects.managerId));
}

function toRow(r: Awaited<ReturnType<typeof query>>[number]): ProjectRow {
  return { ...r, stage: r.stage as StageKey, phase: projectPhase(r.stage, r.status) };
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Projects the viewer may see (they follow their deal). `memberId` limits to one person's deals. */
export async function listProjects(v: Viewer, opts: { memberId?: number; q?: string; typeKey?: string } = {}): Promise<ProjectRow[]> {
  const where: (SQL | undefined)[] = [eq(schema.deals.kind, "project"), dealVisible(v, schema.projects.dealId)];
  if (opts.memberId) where.push(sql`EXISTS (SELECT 1 FROM deal_assignees a WHERE a.deal_id = ${schema.projects.dealId} AND a.user_id = ${opts.memberId})`);
  if (opts.typeKey) where.push(eq(schema.projects.typeKey, opts.typeKey));
  const q = opts.q?.trim();
  if (q) where.push(or(ilike(schema.deals.title, like(q)), ilike(schema.companies.name, like(q)), ilike(schema.projects.number, like(q)), ilike(schema.projects.siteAddress, like(q))));
  const rows = await query()
    .where(and(...where))
    .orderBy(desc(schema.projects.updatedAt), desc(schema.projects.id))
    .limit(500);
  return rows.map(toRow);
}

/** One project with its site details, or null when it does not exist or the viewer may not see its deal. */
export async function getProject(id: number, v: Viewer) {
  const [row] = await query().where(and(eq(schema.projects.id, id), eq(schema.deals.kind, "project"), dealVisible(v, schema.projects.dealId)));
  if (!row) return null;
  const [extra] = await db
    .select({
      siteAddress: schema.projects.siteAddress,
      siteMapUrl: schema.projects.siteMapUrl,
      boqSections: schema.projects.boqSections,
      notes: schema.projects.notes,
      requirement: schema.deals.requirement,
      lostReason: schema.deals.lostReason,
      contactId: schema.deals.contactId,
    })
    .from(schema.projects)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .where(eq(schema.projects.id, id));
  return { ...toRow(row), ...extra };
}

export interface BoqLineRow {
  id: number;
  position: number;
  section: string;
  description: string;
  lineType: string;
  unit: string;
  qty: number;
  supplierName: string;
  costAed: number | null;
  marginPct: number | null;
  unitPriceAed: number;
  optional: boolean;
}

/** The BOQ lines of a project (its deal's lines). Group them with groupBoq() in lib/boq.ts. */
export async function boqLines(dealId: number): Promise<BoqLineRow[]> {
  return db
    .select({
      id: schema.dealItems.id,
      position: schema.dealItems.position,
      section: schema.dealItems.section,
      description: schema.dealItems.description,
      lineType: schema.dealItems.lineType,
      unit: schema.dealItems.unit,
      qty: schema.dealItems.qty,
      supplierName: schema.dealItems.supplierName,
      costAed: schema.dealItems.costAed,
      marginPct: schema.dealItems.marginPct,
      unitPriceAed: schema.dealItems.unitPriceAed,
      optional: schema.dealItems.optional,
    })
    .from(schema.dealItems)
    .where(eq(schema.dealItems.dealId, dealId))
    .orderBy(asc(schema.dealItems.position), asc(schema.dealItems.id));
}

export interface ChecklistTask {
  id: number;
  group: string;
  position: number;
  title: string;
  dueDate: string | null;
  status: "open" | "done";
  required: boolean;
  assignedTo: number;
  assigneeName: string;
  doneAt: Date | null;
}

/** The checklist of a project, in group and list order. */
export async function checklistOf(projectId: number): Promise<ChecklistTask[]> {
  const rows = await db
    .select({
      id: schema.tasks.id,
      group: sql<string>`coalesce(${schema.tasks.checklistGroup}, 'work')`,
      position: sql<number>`coalesce(${schema.tasks.position}, 0)`,
      title: schema.tasks.title,
      dueDate: schema.tasks.dueDate,
      status: schema.tasks.status,
      required: schema.tasks.required,
      assignedTo: schema.tasks.assignedTo,
      assigneeName: schema.users.name,
      doneAt: schema.tasks.doneAt,
    })
    .from(schema.tasks)
    .innerJoin(schema.users, eq(schema.users.id, schema.tasks.assignedTo))
    .where(and(eq(schema.tasks.relatedType, "project"), eq(schema.tasks.relatedId, projectId)))
    .orderBy(asc(schema.tasks.position), asc(schema.tasks.id));
  return rows;
}

/** The project of a deal (for the link on the deal page), or null. */
export async function projectOfDeal(dealId: number) {
  const [row] = await db
    .select({ id: schema.projects.id, number: schema.projects.number, typeKey: schema.projects.typeKey })
    .from(schema.projects)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .where(and(eq(schema.projects.dealId, dealId), eq(schema.deals.kind, "project")));
  return row ?? null;
}

export interface ProjectsOverview {
  kpi: {
    leads: number;
    leadsValue: number;
    quoted: number;
    quotedValue: number;
    wonCount: number;
    wonValue: number;
    wonPrevValue: number;
    active: number;
    activeValue: number;
    completedCount: number;
    completedPrev: number;
  };
  phases: { phase: Phase; count: number; value: number }[];
  types: { label: string; count: number; value: number }[];
  months: { start: string; won: number; completed: number }[];
  attention: { id: number; number: string; title: string; company: string; reason: string; due: string | null }[];
}

/**
 * Numbers for the Projects overview, from the projects the viewer may see. "This month" is the calendar month in Dubai,
 * compared with the month before.
 */
export async function projectsOverview(v: Viewer, memberId?: number): Promise<ProjectsOverview> {
  const rows = await listProjects(v, { memberId });
  const today = dubaiToday();
  const month = today.slice(0, 7);
  const prevDate = new Date(`${month}-01T00:00:00Z`);
  prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);
  const monthOf = (d: Date | null) => (d ? new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 7) : "");
  const value = (list: ProjectRow[]) => list.reduce((n, r) => n + (r.valueAed ?? 0), 0);

  const leads = rows.filter((r) => r.phase === "lead");
  const quoted = rows.filter((r) => r.phase === "quoted");
  const won = rows.filter((r) => r.stage === "won");
  const wonNow = won.filter((r) => monthOf(r.closedAt) === month);
  const wonPrev = won.filter((r) => monthOf(r.closedAt) === prevMonth);
  const active = rows.filter((r) => r.phase === "active" || r.phase === "won");
  const doneNow = rows.filter((r) => r.completedOn?.slice(0, 7) === month);
  const donePrev = rows.filter((r) => r.completedOn?.slice(0, 7) === prevMonth);
  const live = rows.filter((r) => r.phase !== "dropped" && r.phase !== "done");

  const phases = (["lead", "quoted", "won", "active", "done"] as Phase[]).map((phase) => {
    const list = rows.filter((r) => r.phase === phase);
    return { phase, count: list.length, value: value(list) };
  });

  const byType = new Map<string, { count: number; value: number }>();
  for (const r of live) {
    const t = byType.get(r.typeLabel) ?? { count: 0, value: 0 };
    t.count++;
    t.value += r.valueAed ?? 0;
    byType.set(r.typeLabel, t);
  }

  const months: ProjectsOverview["months"] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    const m = d.toISOString().slice(0, 7);
    months.push({ start: `${m}-01`, won: won.filter((r) => monthOf(r.closedAt) === m).length, completed: rows.filter((r) => r.completedOn?.slice(0, 7) === m).length });
  }

  const attention: ProjectsOverview["attention"] = [];
  for (const r of live) {
    if (r.nextDue && r.nextDue < today) attention.push({ id: r.id, number: r.number, title: r.title, company: r.companyName, reason: "Task overdue", due: r.nextDue });
    else if (r.targetDate && r.targetDate < today && r.stage === "won") attention.push({ id: r.id, number: r.number, title: r.title, company: r.companyName, reason: "Past target date", due: r.targetDate });
    else if (r.stage === "won" && r.status === "not_started" && !r.startDate) attention.push({ id: r.id, number: r.number, title: r.title, company: r.companyName, reason: "Won, no start date", due: null });
  }

  return {
    kpi: {
      leads: leads.length,
      leadsValue: value(leads),
      quoted: quoted.length,
      quotedValue: value(quoted),
      wonCount: wonNow.length,
      wonValue: value(wonNow),
      wonPrevValue: value(wonPrev),
      active: active.length,
      activeValue: value(active),
      completedCount: doneNow.length,
      completedPrev: donePrev.length,
    },
    phases,
    types: [...byType.entries()].map(([label, t]) => ({ label, ...t })).sort((a, b) => b.value - a.value),
    months,
    attention: attention.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")),
  };
}

/** Sidebar badge: projects with an overdue task, for the viewer. */
export async function projectsBadges(v: Viewer): Promise<Record<string, number>> {
  const r = await db.execute<{ n: number }>(sql`
    SELECT count(DISTINCT p.id)::int AS n FROM projects p JOIN deals d ON d.id = p.deal_id
    WHERE d.kind = 'project' AND ${dealVisible(v, sql`p.deal_id`)}
      AND EXISTS (SELECT 1 FROM tasks t WHERE t.status = 'open' AND t.due_date < ${dubaiToday()}
        AND ((t.related_type = 'deal' AND t.related_id = p.deal_id) OR (t.related_type = 'project' AND t.related_id = p.id)))`);
  return { projOverdue: r.rows[0]?.n ?? 0 };
}
