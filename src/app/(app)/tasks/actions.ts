"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { assertDeal } from "@/lib/auth/visibility";
import { notifyMentions } from "@/lib/chat/mentions";
import { parseMentions } from "@/lib/chat/text";

const taskSchema = z.object({
  title: z.string().trim().min(1, "Write what needs doing").max(200),
  notes: z.string().trim().max(2000).default(""),
  /** YYYY-MM-DD, or empty for no date */
  dueDate: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date")
    .default(""),
  priority: z.enum(["normal", "high"]).default("normal"),
  /** Only admins can give a task to someone else. */
  assignedTo: z.number().int().positive().optional(),
  /** Attach the task to a deal (needs the Sales app). */
  related: z.object({ type: z.literal("deal"), id: z.number().int().positive() }).optional(),
});

export type TaskInput = z.input<typeof taskSchema>;

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/crm", "layout");
  revalidatePath("/projects", "layout");
  revalidatePath("/");
}

export async function createTask(input: TaskInput) {
  const me = await assertApp("tasks");
  const d = taskSchema.parse(input);
  if (d.assignedTo && d.assignedTo !== me.id && me.role !== "admin") {
    throw new Error("Only an admin can give a task to someone else.");
  }
  if (d.related) {
    await assertApp("crm");
    await assertDeal(d.related.id);
    const [deal] = await db.select({ id: schema.deals.id }).from(schema.deals).where(eq(schema.deals.id, d.related.id));
    if (!deal) throw new Error("That deal no longer exists.");
  }
  const [row] = await db
    .insert(schema.tasks)
    .values({
      title: d.title,
      notes: d.notes,
      dueDate: d.dueDate || null,
      priority: d.priority,
      assignedTo: d.assignedTo ?? me.id,
      createdBy: me.id,
      relatedType: d.related?.type ?? null,
      relatedId: d.related?.id ?? null,
    })
    .returning({ id: schema.tasks.id });
  // people @mentioned in the notes get a card for the task in their chat Activity
  await notifyMentions({ authorId: me.id, body: d.notes, event: "task", record: { type: "task", id: row.id }, source: "task", sourceId: row.id });
  refresh();
}

/** Loads a task and checks the signed-in user may change it (assignee, creator or admin). */
async function ownTask(id: number) {
  const me = await assertApp("tasks");
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!task) throw new Error("That task no longer exists.");
  if (me.role !== "admin" && task.assignedTo !== me.id && task.createdBy !== me.id) {
    throw new Error("This task belongs to someone else.");
  }
  return { me, task };
}

export async function updateTask(id: number, input: TaskInput) {
  const { me, task } = await ownTask(id);
  const d = taskSchema.parse(input);
  const set: Partial<typeof schema.tasks.$inferInsert> = {
    title: d.title,
    notes: d.notes,
    dueDate: d.dueDate || null,
    priority: d.priority,
  };
  if (d.assignedTo) {
    if (me.role !== "admin" && d.assignedTo !== me.id) throw new Error("Only an admin can give a task to someone else.");
    set.assignedTo = d.assignedTo;
  }
  await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, id));
  // only people newly @mentioned in the notes are told
  const before = new Set(parseMentions(task.notes));
  const added = parseMentions(d.notes).filter((u) => !before.has(u));
  if (added.length)
    await notifyMentions({ authorId: me.id, body: d.notes, event: "task", record: { type: "task", id }, source: "task", sourceId: id, allowed: added });
  refresh();
}

export async function setTaskDone(id: number, done: boolean) {
  const { me, task } = await ownTask(id);
  await db
    .update(schema.tasks)
    .set({ status: done ? "done" : "open", doneAt: done ? new Date() : null })
    .where(eq(schema.tasks.id, id));
  // a deal's follow-up being done (or reopened) shows on the deal's activity
  if (task.relatedType === "deal" && task.relatedId && (task.status === "done") !== done) {
    await db.insert(schema.activities).values({ type: "task", body: `${done ? "Follow-up done" : "Follow-up reopened"}: ${task.title}`, dealId: task.relatedId, userId: me.id });
  }
  refresh();
}

export async function deleteTask(id: number) {
  await ownTask(id);
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  refresh();
}
