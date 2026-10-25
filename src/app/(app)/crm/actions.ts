"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertAnyApp, assertApp } from "@/lib/auth/session";
import { assertCompany, assertContact, assertDeal, canSeeCompany, currentViewer } from "@/lib/auth/visibility";
import { deleteDealThread, syncDealThread } from "@/lib/chat/channels";
import { notifyMentions } from "@/lib/chat/mentions";
import { dubaiToday } from "@/lib/dates";
import { isEmail } from "@/lib/mail/compose";
import { ensureProject } from "@/lib/projects-data";
import { salesUsers } from "@/lib/sales-data";
import { ACTIVITY_TYPES, CHECKS, isOpen, isStage, normName, stageLabel, type StageKey } from "@/lib/sales";

const text = (max: number) => z.string().trim().max(max).default("");
const id = z.number().int().positive();
const day = z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date").default("");
const emailField = z
  .string()
  .trim()
  .max(254)
  .default("")
  .refine((v) => v === "" || isEmail(v), "That email address does not look right");

function refresh() {
  revalidatePath("/crm", "layout");
  revalidatePath("/projects", "layout");
  revalidatePath("/tasks");
  revalidatePath("/");
}

// ---------- companies and contacts ----------

const companySchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(160),
  industry: text(60),
  emirate: text(40),
  website: text(200),
  phone: text(40),
  tradeLicenseNo: text(60),
  trn: text(30),
  address: text(300),
  source: text(60),
  notes: text(4000),
  ownerId: id.nullable().optional(),
});
export type CompanyInput = z.input<typeof companySchema>;

const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter the person's name").max(120),
  jobTitle: text(80),
  email: emailField,
  phone: text(40),
  whatsapp: text(40),
  isDecisionMaker: z.boolean().default(false),
});
export type ContactInput = z.input<typeof contactSchema>;

async function duplicateCompany(name: string, exceptId?: number) {
  const norm = normName(name);
  if (!norm) return null;
  const [dup] = await db
    .select({ id: schema.companies.id, name: schema.companies.name })
    .from(schema.companies)
    .where(and(eq(schema.companies.nameNorm, norm), exceptId ? ne(schema.companies.id, exceptId) : undefined));
  return dup ?? null;
}

/** For a company that exists but is not yours: say who has it, without showing anything else about it. */
async function takenMessage(companyId: number, name: string) {
  const [o] = await db
    .select({ owner: schema.users.name })
    .from(schema.companies)
    .leftJoin(schema.users, eq(schema.users.id, schema.companies.ownerId))
    .where(eq(schema.companies.id, companyId));
  return `"${name}" is already a customer${o?.owner ? `, handled by ${o.owner}` : ""}. Ask an admin to add you to it.`;
}

export async function createCompany(input: CompanyInput) {
  const me = await assertApp("crm");
  const v = await currentViewer();
  const d = companySchema.parse(input);
  const dup = await duplicateCompany(d.name);
  if (dup) {
    if (!(await canSeeCompany(v, dup.id))) throw new Error(await takenMessage(dup.id, dup.name));
    throw new Error(`"${dup.name}" is already in the list. Open it instead of adding it twice.`);
  }
  const [row] = await db
    .insert(schema.companies)
    // only admins and "All data" users create a company for someone else
    .values({ ...d, nameNorm: normName(d.name), ownerId: v.seesAll ? (d.ownerId ?? me.id) : me.id })
    .returning({ id: schema.companies.id });
  refresh();
  return row.id;
}

export async function updateCompany(companyId: number, input: CompanyInput) {
  // billing details (TRN, address) are also kept up from Accounts › Customers
  await assertAnyApp("crm", "accounts");
  const v = await assertCompany(companyId, true);
  const d = companySchema.parse(input);
  const dup = await duplicateCompany(d.name, companyId);
  if (dup) throw new Error(`"${dup.name}" already exists. Two companies cannot have the same name.`);
  await db
    .update(schema.companies)
    // only admins and "All data" users hand a company to someone else
    // (left out of the form = keep the owner; the edit dialog does not send one)
    .set({ ...d, nameNorm: normName(d.name), ownerId: v.seesAll && d.ownerId !== undefined ? d.ownerId : undefined })
    .where(eq(schema.companies.id, companyId));
  refresh();
}

/** Removes a company with all its contacts, deals and history. Admin only. */
export async function deleteCompany(companyId: number) {
  const me = await assertApp("crm");
  if (me.role !== "admin") throw new Error("Only an admin can delete a company.");
  const [order] = await db.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.companyId, companyId)).limit(1);
  if (order) throw new Error(`This company has orders (${order.number}) and invoices on record, so it cannot be deleted.`);
  await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
  refresh();
}

export async function addCompanyNote(companyId: number, body: string) {
  const me = await assertApp("crm");
  await assertCompany(companyId);
  const note = z.string().trim().min(1, "Write the note").max(4000).parse(body);
  const [row] = await db.insert(schema.activities).values({ type: "note", body: note, companyId, userId: me.id }).returning({ id: schema.activities.id });
  await notifyMentions({ authorId: me.id, body: note, event: "company", record: { type: "company", id: companyId }, source: "activity", sourceId: row.id });
  refresh();
}

export async function createContact(companyId: number, input: ContactInput) {
  await assertApp("crm");
  await assertCompany(companyId);
  const d = contactSchema.parse(input);
  const [company] = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.id, companyId));
  if (!company) throw new Error("That company no longer exists.");
  const [row] = await db.insert(schema.contacts).values({ ...d, companyId }).returning({ id: schema.contacts.id });
  refresh();
  return row.id;
}

export async function updateContact(contactId: number, input: ContactInput) {
  await assertApp("crm");
  await assertContact(contactId);
  const d = contactSchema.parse(input);
  await db.update(schema.contacts).set(d).where(eq(schema.contacts.id, contactId));
  refresh();
}

export async function deleteContact(contactId: number) {
  await assertApp("crm");
  await assertContact(contactId);
  await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
  refresh();
}

// ---------- deals ----------

/** Keeps only people who exist, are active and can open Sales (so a deal is never given to someone who cannot see it). */
async function checkedAssignees(ids: number[]): Promise<number[]> {
  const unique = [...new Set(ids)];
  const ok = new Set((await salesUsers()).map((u) => u.id));
  const bad = unique.filter((i) => !ok.has(i));
  if (bad.length) throw new Error("One of the people you picked cannot work on Sales deals.");
  return unique;
}

const dealSchema = z.object({
  /** An existing company, or leave out and give `companyName` to create one. */
  companyId: id.optional(),
  companyName: text(160),
  emirate: text(40),
  industry: text(60),
  /** An existing contact, or give a name to create one. */
  contactId: id.optional(),
  contactName: text(120),
  contactJobTitle: text(80),
  contactEmail: emailField,
  contactPhone: text(40),
  title: text(160),
  source: text(60),
  requirement: text(4000),
  valueAed: z.number().min(0).max(1e10).nullable().optional(),
  /** Everyone who works on it; the first is the main owner. Leave out for yourself. */
  ownerIds: z.array(id).max(10).optional(),
  /** Starting stage (an open one); "New" when left out. */
  stage: z.string().optional(),
  /** "project" also opens a project (Projects app) of `projectType`. */
  kind: z.enum(["product", "project"]).default("product"),
  projectType: text(40),
});
export type DealInput = z.input<typeof dealSchema>;

/** Creates (or reuses) the company and contact, the deal at "New", its first log entry and a follow-up task for today. */
export async function createDeal(input: DealInput) {
  const me = await assertApp("crm");
  const d = dealSchema.parse(input);
  if (!d.companyId && d.companyName.length < 2) throw new Error("Pick a company or type its name.");
  if (d.kind === "project" && !d.projectType) throw new Error("Pick the project type.");
  const v = await currentViewer();
  // only admins and "All data" users give a new deal to other people; everyone else gets it themselves
  const ownerIds = v.seesAll ? await checkedAssignees(d.ownerIds?.length ? d.ownerIds : [me.id]) : [me.id];
  if (d.companyId) await assertCompany(d.companyId);
  const ownerId = ownerIds[0] ?? me.id;
  const startStage: StageKey = d.stage && isStage(d.stage) && isOpen(d.stage) ? d.stage : "new";

  const result = await db.transaction(async (tx) => {
    let companyId = d.companyId;
    let reused: string | null = null;
    let companyName = "";
    if (companyId) {
      const [c] = await tx.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId));
      if (!c) throw new Error("That company no longer exists.");
      companyName = c.name;
    } else {
      const norm = normName(d.companyName);
      const [dup] = norm ? await tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.nameNorm, norm)) : [];
      if (dup) {
        if (!(await canSeeCompany(v, dup.id))) throw new Error(await takenMessage(dup.id, dup.name));
        companyId = dup.id;
        companyName = dup.name;
        reused = dup.name;
      } else {
        const [c] = await tx
          .insert(schema.companies)
          .values({ name: d.companyName, nameNorm: norm, emirate: d.emirate, industry: d.industry, source: d.source, ownerId })
          .returning({ id: schema.companies.id });
        companyId = c.id;
        companyName = d.companyName;
      }
    }

    let contactId = d.contactId ?? null;
    let contactName = "";
    if (contactId) {
      const [c] = await tx.select({ name: schema.contacts.name, companyId: schema.contacts.companyId }).from(schema.contacts).where(eq(schema.contacts.id, contactId));
      if (!c || c.companyId !== companyId) throw new Error("That contact does not belong to this company.");
      contactName = c.name;
    } else if (d.contactName) {
      const [c] = await tx
        .insert(schema.contacts)
        .values({ companyId: companyId!, name: d.contactName, jobTitle: d.contactJobTitle, email: d.contactEmail, phone: d.contactPhone, whatsapp: d.contactPhone })
        .returning({ id: schema.contacts.id });
      contactId = c.id;
      contactName = d.contactName;
    }

    const firstLine = d.requirement.split(/\r?\n/)[0].slice(0, 70);
    const title = (d.title || `${companyName}${firstLine ? ` - ${firstLine}` : " - new deal"}`).slice(0, 160);
    const [deal] = await tx
      .insert(schema.deals)
      .values({ title, companyId: companyId!, contactId, stage: startStage, kind: d.kind, source: d.source, requirement: d.requirement, valueAed: d.valueAed ?? null, ownerId })
      .returning({ id: schema.deals.id });
    await tx.insert(schema.dealAssignees).values(ownerIds.map((userId, position) => ({ dealId: deal.id, userId, position })));
    const project = d.kind === "project" ? await ensureProject(tx, deal.id, d.projectType, ownerId, me.id) : null;

    await tx.insert(schema.activities).values({
      type: "created",
      body: `${project ? `Project deal added (${project.number})` : "Deal added"}${startStage !== "new" ? ` at ${stageLabel(startStage)}` : ""}${d.source ? ` (source: ${d.source})` : ""}.`,
      dealId: deal.id,
      companyId: companyId!,
      userId: me.id,
    });
    if (startStage === "new") {
      await tx.insert(schema.tasks).values({
        title: `Contact ${contactName || companyName} about the deal`,
        dueDate: dubaiToday(),
        priority: "high",
        assignedTo: ownerId,
        createdBy: me.id,
        relatedType: "deal",
        relatedId: deal.id,
      });
    }
    return { id: deal.id, reusedCompany: reused, projectId: project?.id ?? null };
  });
  refresh();
  return result;
}

const dealPatch = z.object({
  title: z.string().trim().min(1, "The deal needs a title").max(160).optional(),
  requirement: text(4000).optional(),
  source: text(60).optional(),
  valueAed: z.number().min(0).max(1e10).nullable().optional(),
  expectedClose: day.optional(),
  contactId: id.nullable().optional(),
});
export type DealPatch = z.input<typeof dealPatch>;

export async function updateDeal(dealId: number, patch: DealPatch) {
  await assertApp("crm");
  await assertDeal(dealId);
  const d = dealPatch.parse(patch);
  const set: Partial<typeof schema.deals.$inferInsert> = {};
  if (d.title !== undefined) set.title = d.title;
  if (d.requirement !== undefined) set.requirement = d.requirement;
  if (d.source !== undefined) set.source = d.source;
  if (d.valueAed !== undefined) set.valueAed = d.valueAed;
  if (d.expectedClose !== undefined) set.expectedClose = d.expectedClose || null;
  if (d.contactId !== undefined) set.contactId = d.contactId;
  if (!Object.keys(set).length) return;
  await db.update(schema.deals).set(set).where(eq(schema.deals.id, dealId));
  refresh();
}

/**
 * Makes a deal a project (opening its project, numbered ZPJ-…) or a product deal again. Turning it back is refused once
 * the work has started, so a project's site history is never lost; the project row is kept and only hidden.
 */
export async function setDealKind(dealId: number, kind: "product" | "project", projectType = "") {
  const me = await assertApp("crm");
  await assertDeal(dealId);
  const k = z.enum(["product", "project"]).parse(kind);
  const type = z.string().trim().max(40).parse(projectType);
  const [deal] = await db.select({ kind: schema.deals.kind, companyId: schema.deals.companyId, ownerId: schema.deals.ownerId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) throw new Error("That deal no longer exists.");
  const result = await db.transaction(async (tx) => {
    if (k === "project") {
      if (!type) throw new Error("Pick the project type.");
      const p = await ensureProject(tx, dealId, type, deal.ownerId, me.id);
      if (deal.kind !== "project") {
        await tx.update(schema.deals).set({ kind: "project" }).where(eq(schema.deals.id, dealId));
        await tx.insert(schema.activities).values({ type: "note", body: `Marked as a project (${p.number}).`, dealId, companyId: deal.companyId, userId: me.id });
      }
      return { projectId: p.id as number | null };
    }
    if (deal.kind === "product") return { projectId: null };
    const [p] = await tx.select({ status: schema.projects.status }).from(schema.projects).where(eq(schema.projects.dealId, dealId));
    if (p && p.status !== "not_started") throw new Error("The project work has started, so this deal stays a project.");
    await tx.update(schema.deals).set({ kind: "product" }).where(eq(schema.deals.id, dealId));
    await tx.insert(schema.activities).values({ type: "note", body: "Changed to a product deal.", dealId, companyId: deal.companyId, userId: me.id });
    return { projectId: null };
  });
  refresh();
  return result;
}

/** Sets who works on a deal. The first person is the main owner. Writes the change to the timeline. */
export async function setAssignees(dealId: number, userIds: number[]) {
  const me = await assertApp("crm");
  const v = await currentViewer();
  if (!v.seesAll) throw new Error("Only an admin can change who works on a deal.");
  const ids = await checkedAssignees(z.array(id).max(10).parse(userIds));
  const [deal] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) throw new Error("That deal no longer exists.");
  const names = ids.length
    ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, ids))
    : [];
  await db.transaction(async (tx) => {
    await tx.delete(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, dealId));
    if (ids.length) await tx.insert(schema.dealAssignees).values(ids.map((userId, position) => ({ dealId, userId, position })));
    await tx.update(schema.deals).set({ ownerId: ids[0] ?? null }).where(eq(schema.deals.id, dealId));
    await tx.insert(schema.activities).values({
      type: "note",
      body: ids.length ? `Assigned to ${ids.map((i) => names.find((n) => n.id === i)?.name ?? "?").join(", ")}.` : "Unassigned.",
      dealId,
      companyId: deal.companyId,
      userId: me.id,
    });
  });
  // the deal's chat thread follows its team
  await syncDealThread(dealId);
  refresh();
}

/** Saves the genuine-lead checklist. Only the known tick boxes are kept. */
export async function setChecks(dealId: number, checks: Record<string, boolean>) {
  await assertApp("crm");
  await assertDeal(dealId);
  const clean: Record<string, boolean> = {};
  for (const c of CHECKS) if (checks[c.key]) clean[c.key] = true;
  await db.update(schema.deals).set({ checks: clean }).where(eq(schema.deals.id, dealId));
  refresh();
}

/** Moves a deal to another stage and writes it to the timeline. "Lost" needs a reason. */
export async function moveDeal(dealId: number, stage: string, lostReason = "") {
  const me = await assertApp("crm");
  await assertDeal(dealId);
  if (!isStage(stage)) throw new Error("Unknown stage.");
  const reason = lostReason.trim().slice(0, 200);
  if (stage === "lost" && !reason) throw new Error("Pick the reason this deal was lost.");
  const [deal] = await db.select({ stage: schema.deals.stage, companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) throw new Error("That deal no longer exists.");
  if (deal.stage === stage) return;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.deals)
      .set({
        stage,
        stageChangedAt: new Date(),
        closedAt: isOpen(stage) ? null : new Date(),
        lostReason: stage === "lost" ? reason : "",
      })
      .where(eq(schema.deals.id, dealId));
    await tx.insert(schema.activities).values({
      type: "stage",
      body: `Moved from ${stageLabel(deal.stage)} to ${stageLabel(stage)}${stage === "lost" ? `. Reason: ${reason}` : ""}.`,
      dealId,
      companyId: deal.companyId,
      userId: me.id,
    });
  });
  refresh();
}

const logSchema = z.object({
  type: z.enum(ACTIVITY_TYPES.map((t) => t.key) as [string, ...string[]]),
  body: z.string().trim().min(1, "Write what happened").max(4000),
  followUp: day.optional(),
});

/** Adds a call / message / email / meeting / note to the timeline; optionally books a follow-up task. */
export async function logActivity(dealId: number, input: z.input<typeof logSchema>) {
  const me = await assertApp("crm");
  await assertDeal(dealId);
  const d = logSchema.parse(input);
  const [deal] = await db
    .select({ title: schema.deals.title, stage: schema.deals.stage, companyId: schema.deals.companyId, ownerId: schema.deals.ownerId })
    .from(schema.deals)
    .where(eq(schema.deals.id, dealId));
  if (!deal) throw new Error("That deal no longer exists.");
  const activityId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.activities)
      .values({ type: d.type, body: d.body, dealId, companyId: deal.companyId, userId: me.id })
      .returning({ id: schema.activities.id });
    // talking to a customer about a brand-new deal means it has been contacted
    if (deal.stage === "new" && d.type !== "note") {
      await tx.update(schema.deals).set({ stage: "contacted", stageChangedAt: new Date() }).where(eq(schema.deals.id, dealId));
      await tx.insert(schema.activities).values({
        type: "stage",
        body: `Moved from ${stageLabel("new")} to ${stageLabel("contacted")}.`,
        dealId,
        companyId: deal.companyId,
        userId: me.id,
      });
    }
    if (d.followUp) {
      await tx.insert(schema.tasks).values({
        title: `Follow up: ${deal.title}`.slice(0, 200),
        dueDate: d.followUp,
        assignedTo: deal.ownerId ?? me.id,
        createdBy: me.id,
        relatedType: "deal",
        relatedId: dealId,
      });
    }
    return row.id;
  });
  // people @mentioned in the entry get a card for the deal in their chat Activity
  await notifyMentions({ authorId: me.id, body: d.body, event: d.type, record: { type: "deal", id: dealId }, source: "activity", sourceId: activityId });
  refresh();
}

export async function deleteDeal(dealId: number) {
  const me = await assertApp("crm");
  await assertDeal(dealId);
  const [deal] = await db.select({ id: schema.deals.id }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) return;
  const [member] = await db
    .select({ userId: schema.dealAssignees.userId })
    .from(schema.dealAssignees)
    .where(and(eq(schema.dealAssignees.dealId, dealId), eq(schema.dealAssignees.userId, me.id)));
  if (me.role !== "admin" && !member) throw new Error("Only the people on the deal or an admin can delete it.");
  const [order] = await db.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.dealId, dealId)).limit(1);
  if (order) throw new Error(`This deal has order ${order.number}, so it cannot be deleted. Cancel the order instead.`);
  await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "deal"), eq(schema.tasks.relatedId, dealId)));
  // the project goes with the deal (cascade); its checklist is linked loosely, so remove it here
  const [project] = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.dealId, dealId));
  if (project) await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "project"), eq(schema.tasks.relatedId, project.id)));
  await db.delete(schema.deals).where(eq(schema.deals.id, dealId));
  await deleteDealThread(dealId);
  refresh();
}

