"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { assertDeal, type Viewer } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { isChecklistGroup } from "@/lib/projects";
import { seedChecklist } from "@/lib/projects-data";
import { salesUsers } from "@/lib/sales-data";

/**
 * The project checklist: tasks with related_type "project". Unlike personal tasks, everyone on the project team may tick,
 * add and edit them, because site work is shared. They still show in each assignee's Tasks and on Home.
 */

const day = z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date");

function refresh(projectId: number) {
  revalidatePath(`/projects/list/${projectId}`);
  revalidatePath("/projects", "layout");
  revalidatePath("/tasks");
  revalidatePath("/");
}

async function projectFor(projectId: number) {
  const me = await assertApp("projects");
  const [p] = await db
    .select({
      id: schema.projects.id,
      dealId: schema.projects.dealId,
      typeKey: schema.projects.typeKey,
      managerId: schema.projects.managerId,
      startDate: schema.projects.startDate,
    })
    .from(schema.projects)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .where(and(eq(schema.projects.id, z.number().int().positive().parse(projectId)), eq(schema.deals.kind, "project")));
  if (!p) throw new Error("That project does not exist or is not assigned to you.");
  const v = await assertDeal(p.dealId);
  return { me, v, p };
}

async function taskFor(taskId: number) {
  const [t] = await db
    .select({ id: schema.tasks.id, projectId: schema.tasks.relatedId, group: schema.tasks.checklistGroup, title: schema.tasks.title })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, z.number().int().positive().parse(taskId)), eq(schema.tasks.relatedType, "project")));
  if (!t || t.projectId == null) throw new Error("That task no longer exists.");
  const ctx = await projectFor(t.projectId);
  return { ...ctx, t };
}

/** People a project task may be given to: the deal team, or anyone in Sales for admins and "All data" users. */
async function checkAssignee(v: Viewer, dealId: number, userId: number) {
  if (v.seesAll) {
    if (!(await salesUsers()).some((u) => u.id === userId)) throw new Error("That person cannot work on projects.");
    return;
  }
  const [member] = await db
    .select({ userId: schema.dealAssignees.userId })
    .from(schema.dealAssignees)
    .where(and(eq(schema.dealAssignees.dealId, dealId), eq(schema.dealAssignees.userId, userId)));
  if (!member) throw new Error("Give project tasks to someone on the project team.");
}

const addSchema = z.object({
  group: z.string().refine(isChecklistGroup, "Unknown group"),
  title: z.string().trim().min(1, "Write what needs doing").max(200),
  dueDate: day.default(""),
  assignedTo: z.number().int().positive().optional(),
  required: z.boolean().default(false),
});

export async function addChecklistTask(projectId: number, input: z.input<typeof addSchema>) {
  const { me, v, p } = await projectFor(projectId);
  const d = addSchema.parse(input);
  const assignee = d.assignedTo ?? p.managerId ?? me.id;
  if (assignee !== me.id) await checkAssignee(v, p.dealId, assignee);
  const [last] = await db
    .select({ n: sql<number>`coalesce(max(${schema.tasks.position}), -1)::int` })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.relatedType, "project"), eq(schema.tasks.relatedId, p.id)));
  await db.insert(schema.tasks).values({
    title: d.title,
    dueDate: d.dueDate || null,
    assignedTo: assignee,
    createdBy: me.id,
    relatedType: "project",
    relatedId: p.id,
    checklistGroup: d.group,
    position: last.n + 1,
    required: d.required,
  });
  refresh(p.id);
}

const patchSchema = z.object({
  title: z.string().trim().min(1, "Write what needs doing").max(200).optional(),
  dueDate: day.optional(),
  assignedTo: z.number().int().positive().optional(),
  required: z.boolean().optional(),
});

export async function updateChecklistTask(taskId: number, patch: z.input<typeof patchSchema>) {
  const { v, p, t } = await taskFor(taskId);
  const d = patchSchema.parse(patch);
  const set: Partial<typeof schema.tasks.$inferInsert> = {};
  if (d.title !== undefined) set.title = d.title;
  if (d.required !== undefined) set.required = d.required;
  if (d.dueDate !== undefined) {
    set.dueDate = d.dueDate || null;
    // a date picked by hand no longer moves when the project start date changes
    set.offsetDays = null;
  }
  if (d.assignedTo !== undefined) {
    await checkAssignee(v, p.dealId, d.assignedTo);
    set.assignedTo = d.assignedTo;
  }
  if (!Object.keys(set).length) return;
  await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, t.id));
  refresh(p.id);
}

export async function setChecklistDone(taskId: number, done: boolean) {
  const { p, t } = await taskFor(taskId);
  await db
    .update(schema.tasks)
    .set({ status: done ? "done" : "open", doneAt: done ? new Date() : null })
    .where(eq(schema.tasks.id, t.id));
  refresh(p.id);
}

export async function deleteChecklistTask(taskId: number) {
  const { p, t } = await taskFor(taskId);
  await db.delete(schema.tasks).where(eq(schema.tasks.id, t.id));
  refresh(p.id);
}

/** Moves a task one place up or down inside its group. */
export async function moveChecklistTask(taskId: number, dir: "up" | "down") {
  const { p, t } = await taskFor(taskId);
  const rows = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.relatedType, "project"), eq(schema.tasks.relatedId, p.id), eq(schema.tasks.checklistGroup, t.group ?? "")))
    .orderBy(schema.tasks.position, schema.tasks.id);
  const i = rows.findIndex((r) => r.id === t.id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await db.transaction(async (tx) => {
    for (const [position, r] of rows.entries()) await tx.update(schema.tasks).set({ position }).where(eq(schema.tasks.id, r.id));
  });
  refresh(p.id);
}

/**
 * Adds the checklist of the project's current type (tasks it does not have yet, by title). For projects opened before the
 * checklist existed, and after the type was changed. Never removes anything.
 */
export async function addTypeChecklist(projectId: number) {
  const { me, p } = await projectFor(projectId);
  // survey dates count from today, not from when the project was opened, so an older project does not start out overdue
  const n = await db.transaction((tx) => seedChecklist(tx, { id: p.id, typeKey: p.typeKey, openedDay: dubaiToday(), startDate: p.startDate }, p.managerId ?? me.id, me.id, true));
  refresh(p.id);
  return n;
}
