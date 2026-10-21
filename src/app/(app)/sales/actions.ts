"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { isEmail } from "@/lib/mail/compose";
import { ACTIVITY_TYPES, CHECKS, isOpen, isStage, normName, stageLabel } from "@/lib/sales";

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
  revalidatePath("/sales", "layout");
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

export async function createCompany(input: CompanyInput) {
  const me = await assertApp("sales");
  const d = companySchema.parse(input);
  const dup = await duplicateCompany(d.name);
  if (dup) throw new Error(`"${dup.name}" is already in the list. Open it instead of adding it twice.`);
  const [row] = await db
    .insert(schema.companies)
    .values({ ...d, nameNorm: normName(d.name), ownerId: d.ownerId ?? me.id })
    .returning({ id: schema.companies.id });
  refresh();
  return row.id;
}

export async function updateCompany(companyId: number, input: CompanyInput) {
  await assertApp("sales");
  const d = companySchema.parse(input);
  const dup = await duplicateCompany(d.name, companyId);
  if (dup) throw new Error(`"${dup.name}" already exists. Two companies cannot have the same name.`);
  await db
    .update(schema.companies)
    .set({ ...d, nameNorm: normName(d.name), ownerId: d.ownerId ?? null })
    .where(eq(schema.companies.id, companyId));
  refresh();
}

/** Removes a company with all its contacts, deals and history. Admin only. */
export async function deleteCompany(companyId: number) {
  const me = await assertApp("sales");
  if (me.role !== "admin") throw new Error("Only an admin can delete a company.");
  await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
  refresh();
}

export async function addCompanyNote(companyId: number, body: string) {
  const me = await assertApp("sales");
  const note = z.string().trim().min(1, "Write the note").max(4000).parse(body);
  await db.insert(schema.activities).values({ type: "note", body: note, companyId, userId: me.id });
  refresh();
}

export async function createContact(companyId: number, input: ContactInput) {
  await assertApp("sales");
  const d = contactSchema.parse(input);
  const [company] = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.id, companyId));
  if (!company) throw new Error("That company no longer exists.");
  const [row] = await db.insert(schema.contacts).values({ ...d, companyId }).returning({ id: schema.contacts.id });
  refresh();
  return row.id;
}

export async function updateContact(contactId: number, input: ContactInput) {
  await assertApp("sales");
  const d = contactSchema.parse(input);
  await db.update(schema.contacts).set(d).where(eq(schema.contacts.id, contactId));
  refresh();
}

export async function deleteContact(contactId: number) {
  await assertApp("sales");
  await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
  refresh();
}

// ---------- deals ----------

const enquirySchema = z.object({
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
  ownerId: id.optional(),
});
export type EnquiryInput = z.input<typeof enquirySchema>;

/** Creates (or reuses) the company and contact, the deal at "New enquiry", its first log entry and a follow-up task for today. */
export async function createEnquiry(input: EnquiryInput) {
  const me = await assertApp("sales");
  const d = enquirySchema.parse(input);
  if (!d.companyId && d.companyName.length < 2) throw new Error("Pick a company or type its name.");
  const ownerId = d.ownerId ?? me.id;

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
    const title = (d.title || `${companyName}${firstLine ? ` - ${firstLine}` : " - enquiry"}`).slice(0, 160);
    const [deal] = await tx
      .insert(schema.deals)
      .values({ title, companyId: companyId!, contactId, source: d.source, requirement: d.requirement, valueAed: d.valueAed ?? null, ownerId })
      .returning({ id: schema.deals.id });

    await tx.insert(schema.activities).values({
      type: "created",
      body: `Enquiry added${d.source ? ` (source: ${d.source})` : ""}.`,
      dealId: deal.id,
      companyId: companyId!,
      userId: me.id,
    });
    await tx.insert(schema.tasks).values({
      title: `Contact ${contactName || companyName} about the enquiry`,
      dueDate: dubaiToday(),
      priority: "high",
      assignedTo: ownerId,
      createdBy: me.id,
      relatedType: "deal",
      relatedId: deal.id,
    });
    return { id: deal.id, reusedCompany: reused };
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
  ownerId: id.nullable().optional(),
  contactId: id.nullable().optional(),
});
export type DealPatch = z.input<typeof dealPatch>;

export async function updateDeal(dealId: number, patch: DealPatch) {
  await assertApp("sales");
  const d = dealPatch.parse(patch);
  const set: Partial<typeof schema.deals.$inferInsert> = {};
  if (d.title !== undefined) set.title = d.title;
  if (d.requirement !== undefined) set.requirement = d.requirement;
  if (d.source !== undefined) set.source = d.source;
  if (d.valueAed !== undefined) set.valueAed = d.valueAed;
  if (d.expectedClose !== undefined) set.expectedClose = d.expectedClose || null;
  if (d.ownerId !== undefined) set.ownerId = d.ownerId;
  if (d.contactId !== undefined) set.contactId = d.contactId;
  if (!Object.keys(set).length) return;
  await db.update(schema.deals).set(set).where(eq(schema.deals.id, dealId));
  refresh();
}

/** Saves the genuine-lead checklist. Only the known tick boxes are kept. */
export async function setChecks(dealId: number, checks: Record<string, boolean>) {
  await assertApp("sales");
  const clean: Record<string, boolean> = {};
  for (const c of CHECKS) if (checks[c.key]) clean[c.key] = true;
  await db.update(schema.deals).set({ checks: clean }).where(eq(schema.deals.id, dealId));
  refresh();
}

/** Moves a deal to another stage and writes it to the timeline. "Lost" needs a reason. */
export async function moveDeal(dealId: number, stage: string, lostReason = "") {
  const me = await assertApp("sales");
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
  const me = await assertApp("sales");
  const d = logSchema.parse(input);
  const [deal] = await db
    .select({ title: schema.deals.title, stage: schema.deals.stage, companyId: schema.deals.companyId, ownerId: schema.deals.ownerId })
    .from(schema.deals)
    .where(eq(schema.deals.id, dealId));
  if (!deal) throw new Error("That deal no longer exists.");
  await db.transaction(async (tx) => {
    await tx.insert(schema.activities).values({ type: d.type, body: d.body, dealId, companyId: deal.companyId, userId: me.id });
    // talking to a customer about a brand-new enquiry means it has been contacted
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
  });
  refresh();
}

export async function deleteDeal(dealId: number) {
  const me = await assertApp("sales");
  const [deal] = await db.select({ ownerId: schema.deals.ownerId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) return;
  if (me.role !== "admin" && deal.ownerId !== me.id) throw new Error("Only the deal owner or an admin can delete a deal.");
  await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "deal"), eq(schema.tasks.relatedId, dealId)));
  await db.delete(schema.deals).where(eq(schema.deals.id, dealId));
  refresh();
}

