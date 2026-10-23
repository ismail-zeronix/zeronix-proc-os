"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { cleanSection } from "@/lib/boq";
import { isChecklistGroup } from "@/lib/projects";

/**
 * Admin settings for the Projects app: project types, the BOQ sections a new project of each type starts with, and its
 * starting checklist. Changes only affect projects opened afterwards (and "Add missing tasks" on a project).
 */

function refresh() {
  revalidatePath("/admin/settings");
  revalidatePath("/projects", "layout");
  revalidatePath("/sales", "layout");
}

const label = z.string().trim().min(2, "Give the type a name").max(60);

/** A new project type; its key is made from the name (it never changes, so renaming is safe). */
export async function addProjectType(name: string) {
  await requireAdmin();
  const l = label.parse(name);
  const base = l.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "type";
  const taken = new Set((await db.select({ key: schema.projectTypes.key }).from(schema.projectTypes)).map((t) => t.key));
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  const [last] = await db.select({ n: sql<number>`coalesce(max(${schema.projectTypes.position}), 0)::int` }).from(schema.projectTypes);
  await db.insert(schema.projectTypes).values({ key, label: l, position: last.n + 1, defaultSections: ["Materials", "Installation", "Testing & commissioning"] });
  refresh();
  return key;
}

const typeSchema = z.object({
  label,
  isActive: z.boolean(),
  /** One heading per line in the form; empty lines and repeats are dropped. */
  defaultSections: z.array(z.string()).max(40),
});

export async function saveProjectType(key: string, input: z.input<typeof typeSchema>) {
  await requireAdmin();
  const d = typeSchema.parse(input);
  const seen = new Set<string>();
  const sections = d.defaultSections.map(cleanSection).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  const [row] = await db
    .update(schema.projectTypes)
    .set({ label: d.label, isActive: d.isActive, defaultSections: sections })
    .where(eq(schema.projectTypes.key, key))
    .returning({ key: schema.projectTypes.key });
  if (!row) throw new Error("That project type no longer exists.");
  refresh();
}

// ---------- checklist templates ----------

const templateSchema = z.object({
  title: z.string().trim().min(1, "Write what needs doing").max(200),
  /** Days after the project was opened (survey) or started (work, handover); null = no due date. */
  offsetDays: z.number().int().min(0).max(365).nullable(),
  required: z.boolean(),
});

export async function addTemplate(typeKey: string, group: string, title: string) {
  await requireAdmin();
  if (!isChecklistGroup(group)) throw new Error("Unknown group.");
  const t = templateSchema.shape.title.parse(title);
  const [type] = await db.select({ key: schema.projectTypes.key }).from(schema.projectTypes).where(eq(schema.projectTypes.key, typeKey));
  if (!type) throw new Error("That project type no longer exists.");
  const [last] = await db
    .select({ n: sql<number>`coalesce(max(${schema.projectTaskTemplates.position}), -1)::int` })
    .from(schema.projectTaskTemplates)
    .where(and(eq(schema.projectTaskTemplates.typeKey, typeKey), eq(schema.projectTaskTemplates.checklistGroup, group)));
  await db.insert(schema.projectTaskTemplates).values({ typeKey, checklistGroup: group, title: t, position: last.n + 1 });
  refresh();
}

export async function updateTemplate(id: number, input: z.input<typeof templateSchema>) {
  await requireAdmin();
  const d = templateSchema.parse(input);
  await db.update(schema.projectTaskTemplates).set(d).where(eq(schema.projectTaskTemplates.id, id));
  refresh();
}

export async function deleteTemplate(id: number) {
  await requireAdmin();
  await db.delete(schema.projectTaskTemplates).where(eq(schema.projectTaskTemplates.id, id));
  refresh();
}

export async function moveTemplate(id: number, dir: "up" | "down") {
  await requireAdmin();
  const [t] = await db.select().from(schema.projectTaskTemplates).where(eq(schema.projectTaskTemplates.id, id));
  if (!t) return;
  const rows = await db
    .select({ id: schema.projectTaskTemplates.id })
    .from(schema.projectTaskTemplates)
    .where(and(eq(schema.projectTaskTemplates.typeKey, t.typeKey), eq(schema.projectTaskTemplates.checklistGroup, t.checklistGroup)))
    .orderBy(schema.projectTaskTemplates.position, schema.projectTaskTemplates.id);
  const i = rows.findIndex((r) => r.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await db.transaction(async (tx) => {
    for (const [position, r] of rows.entries()) await tx.update(schema.projectTaskTemplates).set({ position }).where(eq(schema.projectTaskTemplates.id, r.id));
  });
  refresh();
}
