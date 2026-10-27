import "server-only";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { db, schema } from "@/db";
import { dubaiToday } from "@/lib/dates";

export interface TaskRow {
  id: number;
  title: string;
  notes: string;
  dueDate: string | null;
  priority: "normal" | "high";
  status: "open" | "done";
  assignedTo: number;
  assigneeName: string;
  createdBy: number;
  doneAt: string | null;
  /** "deal" when the task belongs to a deal in Sales, "project" for a project checklist task. */
  relatedType: string | null;
  relatedId: number | null;
  relatedTitle: string | null;
}

const assignee = alias(schema.users, "assignee");
// a checklist task points at a project; its title comes from the project's deal
const projectDeal = alias(schema.deals, "project_deal");

function select() {
  return db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      notes: schema.tasks.notes,
      dueDate: schema.tasks.dueDate,
      priority: schema.tasks.priority,
      status: schema.tasks.status,
      assignedTo: schema.tasks.assignedTo,
      assigneeName: assignee.name,
      createdBy: schema.tasks.createdBy,
      relatedType: schema.tasks.relatedType,
      relatedId: schema.tasks.relatedId,
      relatedTitle: sql<string | null>`coalesce(${schema.deals.title}, ${projectDeal.title})`,
      doneAt: sql<string | null>`to_char(${schema.tasks.doneAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(schema.tasks)
    .innerJoin(assignee, eq(assignee.id, schema.tasks.assignedTo))
    .leftJoin(schema.deals, and(eq(schema.tasks.relatedType, "deal"), eq(schema.deals.id, schema.tasks.relatedId)))
    .leftJoin(schema.projects, and(eq(schema.tasks.relatedType, "project"), eq(schema.projects.id, schema.tasks.relatedId)))
    .leftJoin(projectDeal, eq(projectDeal.id, schema.projects.dealId));
}

/** Open tasks, optionally for one person, plus the ones finished in the last 14 days. */
export async function listTasks(opts: { userId?: number }) {
  const who = opts.userId ? eq(schema.tasks.assignedTo, opts.userId) : undefined;
  const since = new Date(Date.now() - 14 * 86400_000);
  const [open, done] = await Promise.all([
    select()
      .where(and(eq(schema.tasks.status, "open"), who))
      .orderBy(sql`${schema.tasks.dueDate} NULLS LAST`, sql`(${schema.tasks.priority} = 'high') DESC`, asc(schema.tasks.createdAt)),
    select()
      .where(and(eq(schema.tasks.status, "done"), gte(schema.tasks.doneAt, since), who))
      .orderBy(desc(schema.tasks.doneAt))
      .limit(20),
  ]);
  return { open: open as TaskRow[], done: done as TaskRow[] };
}

/** Split open tasks into the sections shown on the Tasks page. */
export function groupOpen(open: TaskRow[], today = dubaiToday()) {
  return {
    overdue: open.filter((t) => t.dueDate && t.dueDate < today),
    today: open.filter((t) => t.dueDate === today),
    upcoming: open.filter((t) => t.dueDate && t.dueDate > today),
    undated: open.filter((t) => !t.dueDate),
  };
}

/** Tasks assigned to this person that are overdue or due today (the home widget and the tile badge). Cached per request. */
export const dueTasksFor = cache(async (userId: number) => {
  const today = dubaiToday();
  const rows = await select()
    .where(and(eq(schema.tasks.assignedTo, userId), eq(schema.tasks.status, "open"), lte(schema.tasks.dueDate, today)))
    .orderBy(sql`${schema.tasks.dueDate}`, sql`(${schema.tasks.priority} = 'high') DESC`);
  const tasks = rows as TaskRow[];
  return { tasks, overdue: tasks.filter((t) => t.dueDate! < today).length };
});
