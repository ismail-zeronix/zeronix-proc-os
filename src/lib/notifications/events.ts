import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { canSeeDeal } from "@/lib/auth/visibility";
import { dayLabel } from "@/lib/dates";
import { notify, resolveFor } from "./index";

/**
 * Bell lines written the moment something is given to someone: a deal, a task, a project, a quote answer.
 * The person who did it is never told. Failures are logged and never break the action that called them.
 */

const safe = async (what: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    console.error(`[notify] ${what} failed`, e);
  }
};

async function dealInfo(dealId: number) {
  const [d] = await db
    .select({ title: schema.deals.title, company: schema.companies.name })
    .from(schema.deals)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .where(eq(schema.deals.id, dealId));
  return d ?? null;
}

/** Who sees all sales records (admins and "All data" users), for the restricted-link check. */
async function seesAllOf(userIds: number[]): Promise<Map<number, boolean>> {
  if (!userIds.length) return new Map();
  const rows = await db.select({ id: schema.users.id, role: schema.users.role, scope: schema.users.dataScope }).from(schema.users).where(inArray(schema.users.id, userIds));
  return new Map(rows.map((r) => [r.id, r.role === "admin" || r.scope === "all"]));
}

/** People newly put on a deal get "Deal assigned to you"; people taken off it lose that line. */
export function dealAssigned(dealId: number, added: number[], removed: number[], actorId: number) {
  return safe("deal assigned", async () => {
    if (removed.length) await resolveFor(removed, "deal_assigned", { type: "deal", id: dealId });
    if (!added.length) return;
    const d = await dealInfo(dealId);
    if (!d) return;
    await notify({
      userIds: added,
      kind: "assign",
      rule: "deal_assigned",
      priority: "high",
      title: `Deal assigned to you: ${d.title}`,
      body: d.company,
      link: `/crm/deals/${dealId}`,
      record: { type: "deal", id: dealId },
      actorId,
      key: `deal_assigned:${dealId}`,
    });
  });
}

/** A task was given to someone other than the person saving it. */
export function taskAssigned(taskId: number, actorId: number) {
  return safe("task assigned", async () => {
    const [t] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!t || t.status !== "open" || t.assignedTo === actorId) return;
    let link = "/tasks";
    let about = "";
    if (t.relatedType === "deal" && t.relatedId) {
      const seesAll = (await seesAllOf([t.assignedTo])).get(t.assignedTo) ?? false;
      if (await canSeeDeal({ id: t.assignedTo, seesAll }, t.relatedId)) {
        link = `/crm/deals/${t.relatedId}`;
        about = (await dealInfo(t.relatedId))?.title ?? "";
      }
    } else if (t.relatedType === "project" && t.relatedId) {
      link = `/projects/list/${t.relatedId}`;
      const [p] = await db.select({ number: schema.projects.number }).from(schema.projects).where(eq(schema.projects.id, t.relatedId));
      about = p ? `Project ${p.number}` : "";
    }
    await notify({
      userIds: [t.assignedTo],
      kind: "assign",
      rule: "task_assigned",
      priority: t.priority === "high" ? "high" : "normal",
      title: `Task for you: ${t.title}`,
      body: [t.dueDate ? `Due ${dayLabel(t.dueDate).toLowerCase()}` : "", about].filter(Boolean).join(" · "),
      link,
      record: { type: "task", id: taskId },
      actorId,
      key: `task_assigned:${taskId}`,
    });
  });
}

/** Someone was made the manager of a project. */
export function projectManagerSet(projectId: number, managerId: number, actorId: number) {
  return safe("project manager", async () => {
    const [p] = await db
      .select({ number: schema.projects.number, title: schema.deals.title })
      .from(schema.projects)
      .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
      .where(eq(schema.projects.id, projectId));
    if (!p) return;
    await notify({
      userIds: [managerId],
      kind: "assign",
      rule: "project_manager",
      priority: "normal",
      title: `You manage project ${p.number}`,
      body: p.title,
      link: `/projects/list/${projectId}`,
      record: { type: "project", id: projectId },
      actorId,
      key: `project_manager:${projectId}`,
    });
  });
}

/** A quote was accepted or rejected: tell the deal team (and the quote's owner). */
export function quoteDecided(quoteId: number, status: "accepted" | "rejected", actorId: number) {
  return safe("quote decided", async () => {
    const [q] = await db
      .select({ number: schema.quotes.number, dealId: schema.quotes.dealId, ownerId: schema.quotes.ownerId, company: schema.companies.name })
      .from(schema.quotes)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.quotes.companyId))
      .where(eq(schema.quotes.id, quoteId));
    if (!q) return;
    const team = q.dealId ? (await db.select({ id: schema.dealAssignees.userId }).from(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, q.dealId))).map((r) => r.id) : [];
    const userIds = [...team, ...(q.ownerId ? [q.ownerId] : [])];
    await notify({
      userIds,
      kind: "assign",
      rule: `quote_${status}`,
      priority: status === "accepted" ? "high" : "normal",
      title: status === "accepted" ? `Quote ${q.number} accepted: make the order` : `Quote ${q.number} rejected`,
      body: q.company,
      link: `/sales/quotes/${quoteId}`,
      record: { type: "quote", id: quoteId },
      actorId,
      key: `quote_decided:${quoteId}`,
    });
  });
}
