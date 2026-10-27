"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { assertDeal } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { checklistDue, isProjectStatus, projectStatusLabel } from "@/lib/projects";
import { salesUsers } from "@/lib/sales-data";

const text = (max: number) => z.string().trim().max(max).default("");
const day = z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date").default("");

function refresh() {
  revalidatePath("/projects", "layout");
  revalidatePath("/tasks");
  revalidatePath("/crm", "layout");
  revalidatePath("/");
}

/** Loads the project and checks the signed-in person may work on its deal. */
async function projectFor(projectId: number) {
  const me = await assertApp("projects");
  const [p] = await db
    .select({
      id: schema.projects.id,
      dealId: schema.projects.dealId,
      status: schema.projects.status,
      number: schema.projects.number,
      completedOn: schema.projects.completedOn,
      startDate: schema.projects.startDate,
      stage: schema.deals.stage,
      companyId: schema.deals.companyId,
    })
    .from(schema.projects)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .where(eq(schema.projects.id, z.number().int().positive().parse(projectId)));
  if (!p) throw new Error("That project does not exist or is not assigned to you.");
  await assertDeal(p.dealId);
  return { me, p };
}

const detailsSchema = z.object({
  siteAddress: text(500),
  siteMapUrl: text(500).refine((v) => v === "" || /^https?:\/\//i.test(v), "The map link must start with http:// or https://"),
  startDate: day,
  targetDate: day,
  notes: text(4000),
  managerId: z.number().int().positive().nullable(),
});
export type ProjectDetails = z.input<typeof detailsSchema>;

export async function updateProjectDetails(projectId: number, input: ProjectDetails) {
  const { p } = await projectFor(projectId);
  const d = detailsSchema.parse(input);
  if (d.startDate && d.targetDate && d.targetDate < d.startDate) throw new Error("The target date is before the start date.");
  if (d.managerId != null && !(await salesUsers()).some((u) => u.id === d.managerId)) throw new Error("That person cannot run projects.");
  const start = d.startDate || null;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.projects)
      .set({
        siteAddress: d.siteAddress,
        siteMapUrl: d.siteMapUrl,
        startDate: start,
        targetDate: d.targetDate || null,
        notes: d.notes,
        managerId: d.managerId,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, p.id));
    if (start === p.startDate) return;
    // the work and handover tasks follow the start date (unless someone picked their date by hand, which clears the offset)
    const moving = await tx
      .select({ id: schema.tasks.id, group: schema.tasks.checklistGroup, offset: schema.tasks.offsetDays })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.relatedType, "project"),
          eq(schema.tasks.relatedId, p.id),
          eq(schema.tasks.status, "open"),
          inArray(schema.tasks.checklistGroup, ["work", "handover"]),
          isNotNull(schema.tasks.offsetDays),
        ),
      );
    for (const t of moving) await tx.update(schema.tasks).set({ dueDate: checklistDue(t.group ?? "", t.offset, dubaiToday(), start) }).where(eq(schema.tasks.id, t.id));
  });
  refresh();
}

/**
 * Moves the work status of a won project and writes it to the deal timeline. Before the deal is won the project
 * follows the deal's stage instead, so the status cannot be changed then.
 *
 * "Completed" (and "Closed") need every required checklist task done. When some are open nothing changes and the
 * answer says which; an admin may then repeat the call with `override`, which is written to the timeline.
 */
export async function setProjectStatus(projectId: number, status: string, override = false): Promise<{ openRequired?: string[] }> {
  const { me, p } = await projectFor(projectId);
  if (!isProjectStatus(status)) throw new Error("Unknown status.");
  if (p.stage !== "won") throw new Error("The work status can be set once the deal is won. Until then, move the deal's stage.");
  if (p.status === status) return {};
  const today = dubaiToday();
  let overridden: string[] = [];
  if ((status === "completed" || status === "closed") && p.status !== "completed" && p.status !== "closed") {
    const open = await db
      .select({ title: schema.tasks.title })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.relatedType, "project"), eq(schema.tasks.relatedId, p.id), eq(schema.tasks.required, true), eq(schema.tasks.status, "open")));
    if (open.length) {
      if (!override) return { openRequired: open.map((t) => t.title) };
      if (me.role !== "admin") throw new Error("Only an admin can complete a project with required tasks still open.");
      overridden = open.map((t) => t.title);
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .update(schema.projects)
      .set({
        status,
        // closing keeps the day the work was completed
        completedOn: status === "completed" || status === "closed" ? (p.completedOn ?? today) : null,
        closedAt: status === "closed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, p.id));
    await tx.insert(schema.activities).values({
      type: "stage",
      body: `Project ${p.number}: ${projectStatusLabel(p.status)} → ${projectStatusLabel(status)}.${overridden.length ? ` Completed by an admin with ${overridden.length} required task${overridden.length === 1 ? "" : "s"} still open: ${overridden.join("; ")}.` : ""}`,
      dealId: p.dealId,
      companyId: p.companyId,
      userId: me.id,
    });
  });
  refresh();
  return {};
}
