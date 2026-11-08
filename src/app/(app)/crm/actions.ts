"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertAnyApp, assertApp } from "@/lib/auth/session";
import { assertCompany, assertContact, assertDeal, canSeeCompany, canSeeDeal, currentViewer } from "@/lib/auth/visibility";
import { deleteDealThread, syncDealThread } from "@/lib/chat/channels";
import { notifyMentions } from "@/lib/chat/mentions";
import { dealAssigned, quoteDecided } from "@/lib/notifications/events";
import { acceptQuote, liveSaleOfDeal } from "@/lib/quote-accept";
import { audit } from "@/lib/audit";
import { companyOwners, saveCompanyOwners } from "@/lib/company-owners";
import { dubaiToday } from "@/lib/dates";
import { isEmail } from "@/lib/mail/compose";
import { ensureProject } from "@/lib/projects-data";
import { salesUsers } from "@/lib/sales-data";
import { duplicateCompany } from "@/lib/sales-data";
import { ACTIVITY_TYPES, CHECKS, customerGaps, isOpen, isStage, normName, stageLabel, type CustomerGap, type StageKey } from "@/lib/sales";
import { addDays } from "@/lib/quotation";
import { parseInput, UserError } from "@/lib/user-error";

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
  const d = parseInput(companySchema, input);
  const dup = await duplicateCompany(d.name);
  if (dup) {
    if (!(await canSeeCompany(v, dup.id))) throw new UserError(await takenMessage(dup.id, dup.name));
    throw new UserError(`"${dup.name}" is already in the list. Open it instead of adding it twice.`);
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
  // billing details (TRN, address) are also kept up from Sales › Customers
  await assertAnyApp("crm", "sales", "accounts");
  const v = await assertCompany(companyId, true);
  const d = parseInput(companySchema, input);
  const dup = await duplicateCompany(d.name, companyId);
  if (dup) throw new UserError(`"${dup.name}" already exists. Two companies cannot have the same name.`);
  const handOver = v.seesAll && d.ownerId !== undefined;
  await db.transaction(async (tx) => {
    // only admins and "All data" users hand a company to someone else
    // (left out of the form = keep the owner; the edit dialog does not send one)
    await tx.update(schema.companies).set({ ...d, nameNorm: normName(d.name), ownerId: undefined }).where(eq(schema.companies.id, companyId));
    if (handOver) {
      // the new main owner goes first, the other owners stay
      const rest = (await companyOwners(companyId)).map((o) => o.id).filter((i) => i !== d.ownerId);
      await saveCompanyOwners(tx, companyId, d.ownerId ? [d.ownerId, ...rest] : rest);
    }
  });
  refresh();
}

/** Removes a company with all its contacts, deals and history. Admin only. */
export async function deleteCompany(companyId: number) {
  const me = await assertApp("crm");
  if (me.role !== "admin") throw new UserError("Only an admin can delete a company.");
  const [order] = await db.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.companyId, companyId)).limit(1);
  if (order) throw new UserError(`This company has orders (${order.number}) and invoices on record, so it cannot be deleted.`);
  const [invoice] = await db.select({ number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.companyId, companyId)).limit(1);
  if (invoice) throw new UserError(`This company has invoices on record (${invoice.number}), so it cannot be deleted.`);
  const [payment] = await db.select({ number: schema.payments.number }).from(schema.payments).where(eq(schema.payments.companyId, companyId)).limit(1);
  if (payment) throw new UserError(`This company has payments on record (${payment.number}), so it cannot be deleted.`);
  await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
  refresh();
}

export async function addCompanyNote(companyId: number, body: string) {
  const me = await assertApp("crm");
  await assertCompany(companyId);
  const note = parseInput(z.string().trim().min(1, "Write the note").max(4000), body);
  const [row] = await db.insert(schema.activities).values({ type: "note", body: note, companyId, userId: me.id }).returning({ id: schema.activities.id });
  await notifyMentions({ authorId: me.id, body: note, event: "company", record: { type: "company", id: companyId }, source: "activity", sourceId: row.id });
  refresh();
}

export async function createContact(companyId: number, input: ContactInput) {
  await assertApp("crm");
  await assertCompany(companyId);
  const d = parseInput(contactSchema, input);
  const [company] = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.id, companyId));
  if (!company) throw new UserError("That company no longer exists.");
  const [row] = await db.insert(schema.contacts).values({ ...d, companyId }).returning({ id: schema.contacts.id });
  refresh();
  return row.id;
}

export async function updateContact(contactId: number, input: ContactInput) {
  await assertApp("crm");
  await assertContact(contactId);
  const d = parseInput(contactSchema, input);
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
  if (bad.length) throw new UserError("One of the people you picked cannot work on Sales deals.");
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
  const d = parseInput(dealSchema, input);
  if (!d.companyId && d.companyName.length < 2) throw new UserError("Pick a company or type its name.");
  if (d.kind === "project" && !d.projectType) throw new UserError("Pick the project type.");
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
      if (!c) throw new UserError("That company no longer exists.");
      companyName = c.name;
    } else {
      const norm = normName(d.companyName);
      const [dup] = norm ? await tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.nameNorm, norm)) : [];
      if (dup) {
        if (!(await canSeeCompany(v, dup.id))) throw new UserError(await takenMessage(dup.id, dup.name));
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
      if (!c || c.companyId !== companyId) throw new UserError("That contact does not belong to this company.");
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
  // a deal made for other people tells them (never the person who made it)
  await dealAssigned(result.id, ownerIds, [], me.id);
  refresh();
  return result;
}

const dealPatch = z.object({
  title: z.string().trim().min(1, "The deal needs a title").max(160).optional(),
  requirement: text(4000).optional(),
  source: text(60).optional(),
  valueAed: z.number().min(0).max(1e10).nullable().optional(),
  expectedClose: day.optional(),
  /** Next follow-up as an ISO date-time; "" clears it. */
  followUpAt: z
    .string()
    .trim()
    .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Pick a valid date and time")
    .optional(),
  contactId: id.nullable().optional(),
});
export type DealPatch = z.input<typeof dealPatch>;

export async function updateDeal(dealId: number, patch: DealPatch) {
  await assertApp("crm");
  await assertDeal(dealId);
  const d = parseInput(dealPatch, patch);
  const set: Partial<typeof schema.deals.$inferInsert> = {};
  if (d.title !== undefined) set.title = d.title;
  if (d.requirement !== undefined) set.requirement = d.requirement;
  if (d.source !== undefined) set.source = d.source;
  if (d.valueAed !== undefined) set.valueAed = d.valueAed;
  if (d.expectedClose !== undefined) set.expectedClose = d.expectedClose || null;
  if (d.followUpAt !== undefined) set.followUpAt = d.followUpAt ? new Date(d.followUpAt) : null;
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
  const k = parseInput(z.enum(["product", "project"]), kind);
  const type = parseInput(z.string().trim().max(40), projectType);
  const [deal] = await db.select({ kind: schema.deals.kind, companyId: schema.deals.companyId, ownerId: schema.deals.ownerId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) throw new UserError("That deal no longer exists.");
  const result = await db.transaction(async (tx) => {
    if (k === "project") {
      if (!type) throw new UserError("Pick the project type.");
      const p = await ensureProject(tx, dealId, type, deal.ownerId, me.id);
      if (deal.kind !== "project") {
        await tx.update(schema.deals).set({ kind: "project" }).where(eq(schema.deals.id, dealId));
        await tx.insert(schema.activities).values({ type: "note", body: `Marked as a project (${p.number}).`, dealId, companyId: deal.companyId, userId: me.id });
      }
      return { projectId: p.id as number | null };
    }
    if (deal.kind === "product") return { projectId: null };
    const [p] = await tx.select({ status: schema.projects.status }).from(schema.projects).where(eq(schema.projects.dealId, dealId));
    if (p && p.status !== "not_started") throw new UserError("The project work has started, so this deal stays a project.");
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
  if (!v.seesAll) throw new UserError("Only an admin can change who works on a deal.");
  const ids = await checkedAssignees(z.array(id).max(10).parse(userIds));
  const [deal] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) throw new UserError("That deal no longer exists.");
  const names = ids.length
    ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, ids))
    : [];
  const before = (await db.select({ id: schema.dealAssignees.userId }).from(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, dealId))).map((r) => r.id);
  await db.transaction(async (tx) => {
    await tx.delete(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, dealId));
    if (ids.length) await tx.insert(schema.dealAssignees).values(ids.map((userId, position) => ({ dealId, userId, position })));
    await tx.update(schema.deals).set({ ownerId: ids[0] ?? null }).where(eq(schema.deals.id, dealId));
    await tx.insert(schema.activities).values({
      type: "owner",
      body: ids.length ? `Assigned to ${ids.map((i) => names.find((n) => n.id === i)?.name ?? "?").join(", ")}.` : "Unassigned.",
      dealId,
      companyId: deal.companyId,
      userId: me.id,
    });
  });
  // the deal's chat thread follows its team
  await syncDealThread(dealId);
  await dealAssigned(
    dealId,
    ids.filter((i) => !before.includes(i)),
    before.filter((i) => !ids.includes(i)),
    me.id,
  );
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
  if (!isStage(stage)) throw new UserError("Unknown stage.");
  const reason = lostReason.trim().slice(0, 200);
  if (stage === "lost" && !reason) throw new UserError("Pick the reason this deal was lost.");
  const [deal] = await db.select({ stage: schema.deals.stage, companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) throw new UserError("That deal no longer exists.");
  if (deal.stage === stage) return;
  // the deal page asks through Mark as won (markDealWon); a plain move to Won still flags missing customer details
  // a deal with a live order or invoice stays Won: cancel those first (moving it to Lost would leave a sale nobody counts)
  if (deal.stage === "won" || stage === "lost") {
    const sale = await liveSaleOfDeal(db, dealId);
    if (sale) throw new UserError(`This deal has ${sale}. Cancel it first, then move the deal.`);
  }
  const won = stage === "won" ? await customerOf(dealId) : null;
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
    if (won) await followUpGaps(tx, dealId, won.company.name, won.gaps, won.deal.ownerId, me.id);
    // no longer won: the quote that won it is open again (Sent), so the deal and its quote never disagree
    if (deal.stage === "won") {
      const reopened = await tx
        .update(schema.quotes)
        .set({ status: stage === "lost" ? "rejected" : "sent", decidedAt: stage === "lost" ? new Date() : null })
        .where(and(eq(schema.quotes.dealId, dealId), eq(schema.quotes.status, "accepted")))
        .returning({ number: schema.quotes.number });
      if (reopened.length) {
        await tx.insert(schema.activities).values({ type: "note", body: `Quote ${reopened.map((r) => r.number).join(", ")} marked ${stage === "lost" ? "rejected" : "sent"}: the deal is no longer won.`, dealId, companyId: deal.companyId, userId: me.id });
      }
    }
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
  const d = parseInput(logSchema, input);
  const [deal] = await db
    .select({ title: schema.deals.title, stage: schema.deals.stage, companyId: schema.deals.companyId, ownerId: schema.deals.ownerId, followUpAt: schema.deals.followUpAt })
    .from(schema.deals)
    .where(eq(schema.deals.id, dealId));
  if (!deal) throw new UserError("That deal no longer exists.");
  const activityId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.activities)
      .values({ type: d.type, body: d.body, dealId, companyId: deal.companyId, userId: me.id })
      .returning({ id: schema.activities.id });
    // talking to the customer on (or after) the planned follow-up day counts as the follow-up done
    if (d.type !== "note" && deal.followUpAt && deal.followUpAt.getTime() <= Date.now() + 12 * 3600_000) {
      await tx.update(schema.deals).set({ followUpAt: null }).where(eq(schema.deals.id, dealId));
    }
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
  const [deal] = await db.select({ id: schema.deals.id, title: schema.deals.title, stage: schema.deals.stage, companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) return;
  const [member] = await db
    .select({ userId: schema.dealAssignees.userId })
    .from(schema.dealAssignees)
    .where(and(eq(schema.dealAssignees.dealId, dealId), eq(schema.dealAssignees.userId, me.id)));
  if (me.role !== "admin" && !member) throw new UserError("Only the people on the deal or an admin can delete it.");
  const [order] = await db.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.dealId, dealId)).limit(1);
  if (order) throw new UserError(`This deal has order ${order.number}, so it cannot be deleted. Cancel the order instead.`);
  // a tax invoice is never deleted, so neither is the deal it belongs to (it would fail on the database link anyway)
  const [invoice] = await db.select({ number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.dealId, dealId)).limit(1);
  if (invoice) throw new UserError(`This deal has invoice ${invoice.number}, so it cannot be deleted. Mark it lost instead.`);
  const quotes = await db.select({ number: schema.quotes.number, status: schema.quotes.status }).from(schema.quotes).where(eq(schema.quotes.dealId, dealId));
  await audit(db, { userId: me.id, action: "deal.delete", entity: "deal", entityId: dealId, summary: `Deal "${deal.title}" deleted${quotes.length ? ` with quotes ${quotes.map((q) => q.number).join(", ")}` : ""}`, before: { ...deal, quotes } });
  await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "deal"), eq(schema.tasks.relatedId, dealId)));
  // the project goes with the deal (cascade); its checklist is linked loosely, so remove it here
  const [project] = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.dealId, dealId));
  if (project) await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "project"), eq(schema.tasks.relatedId, project.id)));
  await db.delete(schema.deals).where(eq(schema.deals.id, dealId));
  await deleteDealThread(dealId);
  refresh();
}


// ---------- winning a deal ----------

/** The deal's company and primary contact, and what the customer record still lacks. */
async function customerOf(dealId: number) {
  const [d] = await db
    .select({ id: schema.deals.id, title: schema.deals.title, stage: schema.deals.stage, companyId: schema.deals.companyId, contactId: schema.deals.contactId, ownerId: schema.deals.ownerId })
    .from(schema.deals)
    .where(eq(schema.deals.id, dealId));
  if (!d) throw new UserError("That deal no longer exists.");
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, d.companyId));
  if (!company) throw new UserError("This deal has no company. Pick the customer on the deal first.");
  const [contact] = d.contactId ? await db.select().from(schema.contacts).where(eq(schema.contacts.id, d.contactId)) : [];
  return { deal: d, company, contact: contact ?? null, gaps: customerGaps(company, contact ?? null) };
}

/** What the "Mark as won" dialog shows before anything changes: the customer (the existing company), quotes, and gaps. */
export async function wonCheck(dealId: number) {
  await assertApp("crm");
  await assertDeal(dealId);
  const { deal, company, contact, gaps } = await customerOf(dealId);
  const quotes = await db
    .select({ id: schema.quotes.id, number: schema.quotes.number, status: schema.quotes.status, total: schema.quotes.total })
    .from(schema.quotes)
    .where(and(eq(schema.quotes.dealId, dealId), ne(schema.quotes.status, "rejected")));
  return { stage: deal.stage, company: { id: company.id, name: company.name }, contactName: contact?.name ?? "", quotes, gaps };
}

/** After a win: one follow-up task for the deal owner listing what the customer record still lacks (none if complete). */
async function followUpGaps(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], dealId: number, companyName: string, gaps: CustomerGap[], ownerId: number | null, me: number) {
  if (!gaps.length) return;
  const blocking = gaps.filter((g) => g.blocksInvoice);
  await tx.insert(schema.tasks).values({
    title: `Complete customer details: ${companyName}`,
    notes: `Missing: ${gaps.map((g) => g.label).join(", ")}.${blocking.length ? ` The tax invoice cannot be issued until ${blocking.map((g) => g.label.toLowerCase()).join(" and ")} ${blocking.length === 1 ? "is" : "are"} fixed.` : ""} Fix them in Sales › Customers › Billing details, or on the CRM company page.`,
    dueDate: addDays(dubaiToday(), 1),
    priority: blocking.length ? "high" : "normal",
    assignedTo: ownerId ?? me,
    createdBy: me,
    relatedType: "deal",
    relatedId: dealId,
  });
}

const wonSchema = z.object({
  quoteId: id.nullable().optional(),
  /** When nothing was quoted in the portal: what was agreed (amount, PO, terms). */
  terms: z.string().trim().max(500).default(""),
});

/**
 * Marks a deal Won, safely: the customer is the deal's existing company (never a new one, so it shows in Sales at
 * once); the winning quote is accepted (or the agreed terms are written down); missing customer details do not block
 * the win but are listed on the timeline and given to the owner as a task. Orders and invoices check their own fields.
 */
export async function markDealWon(dealId: number, input: z.input<typeof wonSchema>) {
  const me = await assertApp("crm");
  await assertDeal(dealId);
  const d = parseInput(wonSchema, input);
  const { deal, company, gaps } = await customerOf(dealId);
  if (deal.stage === "won") throw new UserError("This deal is already won.");
  const [quote] = d.quoteId
    ? await db.select({ id: schema.quotes.id, number: schema.quotes.number, status: schema.quotes.status, total: schema.quotes.total, dealId: schema.quotes.dealId }).from(schema.quotes).where(eq(schema.quotes.id, d.quoteId))
    : [];
  if (d.quoteId && (!quote || quote.dealId !== dealId)) throw new UserError("That quote is not on this deal.");
  if (quote?.status === "rejected") throw new UserError(`${quote.number} was rejected. Pick the quote the customer accepted.`);
  if (!quote && d.terms.length < 3) throw new UserError("Pick the winning quote, or write down what was agreed.");

  const gapNote = gaps.length ? `Customer details missing: ${gaps.map((g) => g.label).join(", ")}.` : "";
  const accepted = await db.transaction(async (tx) => {
    let changed = false;
    if (quote) {
      // the same acceptance rule as the quote page (lib/quote-accept.ts): other open quotes rejected, deal Won at the quoted amount
      changed = (await acceptQuote(tx, { quoteId: quote.id, userId: me.id, note: gapNote })).changed;
    } else {
      await tx.update(schema.deals).set({ stage: "won", stageChangedAt: new Date(), closedAt: new Date(), lostReason: "" }).where(eq(schema.deals.id, dealId));
      await tx.insert(schema.activities).values({ type: "stage", body: `Moved from ${stageLabel(deal.stage)} to Won. Agreed: ${d.terms}${gapNote ? ` ${gapNote}` : ""}`, dealId, companyId: company.id, userId: me.id });
    }
    await followUpGaps(tx, dealId, company.name, gaps, deal.ownerId, me.id);
    return changed;
  });
  if (accepted && quote) await quoteDecided(quote.id, "accepted", me.id);
  refresh();
  revalidatePath("/sales", "layout");
  return { gaps };
}

// ---------- bulk actions (the list's bottom bar) ----------

/**
 * What a bulk action did: how many records changed and why the others were left alone, or `error` when nothing was
 * tried. Returned rather than thrown, because production builds hide the message of a thrown server-action error.
 */
export interface BulkResult {
  done: number;
  skipped: string[];
  error?: string;
}

const bulkIds = z.array(id).min(1, "Tick at least one row.").max(100, "Pick at most 100 at a time.");

/**
 * Runs a single-record action for each id, so every check, timeline entry and notification of that action still
 * applies. One record failing (no access, has an order) never stops the others; its reason is returned instead.
 */
async function eachOf(ids: number[], name: (id: number) => Promise<string>, fn: (id: number) => Promise<unknown>): Promise<BulkResult> {
  await assertApp("crm");
  const parsed = bulkIds.safeParse(ids);
  if (!parsed.success) return { done: 0, skipped: [], error: parsed.error.issues[0]?.message ?? "Tick at least one row." };
  const list = [...new Set(parsed.data)];
  const out: BulkResult = { done: 0, skipped: [] };
  for (const one of list) {
    try {
      await fn(one);
      out.done++;
    } catch (e) {
      out.skipped.push(`${await name(one).catch(() => `#${one}`)}: ${e instanceof Error ? e.message : "could not be changed"}`);
    }
  }
  refresh();
  return out;
}

// names for the "skipped" list, only of records the person may see (a hidden one reads as a number, as if it did not exist)
const dealName = async (dealId: number) =>
  ((await canSeeDeal(await currentViewer(), dealId)) && (await db.select({ t: schema.deals.title }).from(schema.deals).where(eq(schema.deals.id, dealId)))[0]?.t) || `Deal #${dealId}`;
const companyName = async (companyId: number) =>
  ((await canSeeCompany(await currentViewer(), companyId)) && (await db.select({ n: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId)))[0]?.n) || `Company #${companyId}`;

/** Moves the ticked deals to one stage. Won is left out: each win asks for its quote and customer details. */
export async function bulkMoveDeals(ids: number[], stage: string, lostReason = ""): Promise<BulkResult> {
  if (!isStage(stage) || stage === "won") return { done: 0, skipped: [], error: "Pick a stage." };
  if (stage === "lost" && !lostReason.trim()) return { done: 0, skipped: [], error: "Pick the reason these deals were lost." };
  return eachOf(ids, dealName, (dealId) => moveDeal(dealId, stage, lostReason));
}

/** Adds one person to the team of each ticked deal (admins and "All data" users, as on a single deal). */
export async function bulkAddAssignee(ids: number[], userId: number): Promise<BulkResult> {
  const person = id.safeParse(userId);
  if (!person.success) return { done: 0, skipped: [], error: "Pick a person." };
  if (!(await currentViewer()).seesAll) return { done: 0, skipped: [], error: "Only an admin can change who works on a deal." };
  return eachOf(ids, dealName, async (dealId) => {
    await assertDeal(dealId);
    const team = (await db.select({ id: schema.dealAssignees.userId }).from(schema.dealAssignees).where(eq(schema.dealAssignees.dealId, dealId)).orderBy(schema.dealAssignees.position)).map((r) => r.id);
    if (team.includes(person.data)) return;
    if (team.length >= 10) throw new UserError("the team already has 10 people");
    await setAssignees(dealId, [...team, person.data]);
  });
}

export async function bulkDeleteDeals(ids: number[]): Promise<BulkResult> {
  return eachOf(ids, dealName, (dealId) => deleteDeal(dealId));
}

export async function bulkDeleteContacts(ids: number[]): Promise<BulkResult> {
  const name = async (contactId: number) => {
    const [c] = await db.select({ n: schema.contacts.name, companyId: schema.contacts.companyId }).from(schema.contacts).where(eq(schema.contacts.id, contactId));
    return (c && (await canSeeCompany(await currentViewer(), c.companyId)) && c.n) || `Contact #${contactId}`;
  };
  return eachOf(ids, name, (contactId) => deleteContact(contactId));
}

/** Admin only, like deleting one company: removes each with its contacts, deals and history; companies with orders stay. */
export async function bulkDeleteCompanies(ids: number[]): Promise<BulkResult> {
  const me = await assertApp("crm");
  if (me.role !== "admin") return { done: 0, skipped: [], error: "Only an admin can delete a company." };
  return eachOf(ids, companyName, async (companyId) => {
    await assertCompany(companyId);
    await deleteCompany(companyId);
  });
}
