"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { assertDeal } from "@/lib/auth/visibility";
import { groupBoq } from "@/lib/boq";
import { getBrand } from "@/lib/brand";
import { type Block, blocksSchema, cloneBlock, defaultProposal, displayCompany } from "@/lib/proposal";

/**
 * The proposal of a project. The editor saves the whole document a second after the last change (autosave). Each save
 * names the version it was based on; if someone saved in between, nothing is overwritten and the editor says so.
 */

const pid = z.number().int().positive();

async function projectFor(projectId: number) {
  const me = await assertApp("projects");
  const [p] = await db
    .select({
      id: schema.projects.id,
      dealId: schema.projects.dealId,
      typeKey: schema.projects.typeKey,
      typeLabel: schema.projectTypes.label,
      dealTitle: schema.deals.title,
      requirement: schema.deals.requirement,
      customer: schema.companies.name,
      site: schema.projects.siteAddress,
      sections: schema.projects.boqSections,
    })
    .from(schema.projects)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .innerJoin(schema.projectTypes, eq(schema.projectTypes.key, schema.projects.typeKey))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .where(and(eq(schema.projects.id, pid.parse(projectId)), eq(schema.deals.kind, "project")));
  if (!p) throw new Error("That project does not exist or is not assigned to you.");
  await assertDeal(p.dealId);
  return { me, p };
}

async function proposalFor(proposalId: number) {
  const [r] = await db.select({ id: schema.proposals.id, projectId: schema.proposals.projectId }).from(schema.proposals).where(eq(schema.proposals.id, pid.parse(proposalId)));
  if (!r) throw new Error("That proposal no longer exists.");
  return { ...(await projectFor(r.projectId)), proposalId: r.id };
}

function refresh(projectId: number) {
  revalidatePath(`/projects/list/${projectId}`);
  revalidatePath(`/projects/list/${projectId}/proposal`);
}

/** The standard proposal for a project, filled from its customer, site and BOQ. */
async function standardFor(p: Awaited<ReturnType<typeof projectFor>>["p"]): Promise<Block[]> {
  const [brand, lines] = await Promise.all([
    getBrand(),
    db
      .select({ id: schema.dealItems.id, section: schema.dealItems.section, position: schema.dealItems.position, qty: schema.dealItems.qty, unit: schema.dealItems.unit, description: schema.dealItems.description, optional: schema.dealItems.optional, unitPriceAed: schema.dealItems.unitPriceAed, costAed: schema.dealItems.costAed })
      .from(schema.dealItems)
      .where(eq(schema.dealItems.dealId, p.dealId)),
  ]);
  const company = displayCompany(brand.company);
  return defaultProposal({
    typeKey: p.typeKey,
    typeLabel: p.typeLabel,
    dealTitle: p.dealTitle,
    requirement: p.requirement,
    customer: p.customer,
    site: p.site,
    company,
    boq: groupBoq(lines, p.sections),
  });
}

/** Template blocks get fresh ids, so two proposals never share block ids. */
const fresh = (blocks: unknown[]): Block[] =>
  blocksSchema
    .parse(blocks)
    .map(cloneBlock);

/**
 * Starts the proposal of a project: from a saved template, or (templateId null) from the standard proposal. A project
 * has one proposal; starting again when it exists just returns it.
 */
export async function startProposal(projectId: number, templateId: number | null) {
  const { me, p } = await projectFor(projectId);
  const [existing] = await db.select({ id: schema.proposals.id }).from(schema.proposals).where(eq(schema.proposals.projectId, p.id));
  if (existing) return { id: existing.id };
  let blocks: Block[];
  if (templateId != null) {
    const [t] = await db.select({ blocks: schema.proposalTemplates.blocks }).from(schema.proposalTemplates).where(eq(schema.proposalTemplates.id, pid.parse(templateId)));
    if (!t) throw new Error("That template no longer exists.");
    blocks = fresh(t.blocks);
  } else {
    blocks = await standardFor(p);
  }
  const [row] = await db
    .insert(schema.proposals)
    .values({ projectId: p.id, title: p.dealTitle.slice(0, 200), blocks, updatedBy: me.id })
    .onConflictDoNothing({ target: schema.proposals.projectId })
    .returning({ id: schema.proposals.id });
  // two people starting at the same moment: the second one gets the first one's proposal
  const id = row?.id ?? (await db.select({ id: schema.proposals.id }).from(schema.proposals).where(eq(schema.proposals.projectId, p.id)))[0].id;
  refresh(p.id);
  return { id };
}

const saveSchema = z.object({ title: z.string().trim().max(200), blocks: blocksSchema });

export type SaveResult = { ok: true; version: number; savedAt: string } | { ok: false; conflict: true; by: string; at: string };

/** Saves the whole document if nobody saved a newer version since \`expectedVersion\`. */
export async function saveProposal(proposalId: number, expectedVersion: number, input: z.input<typeof saveSchema>): Promise<SaveResult> {
  const { me, proposalId: id } = await proposalFor(proposalId);
  const d = saveSchema.parse(input);
  const [row] = await db
    .update(schema.proposals)
    .set({ title: d.title, blocks: d.blocks, version: sql`${schema.proposals.version} + 1`, updatedBy: me.id, updatedAt: new Date() })
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.version, z.number().int().parse(expectedVersion))))
    .returning({ version: schema.proposals.version, updatedAt: schema.proposals.updatedAt });
  // no page refresh here: the editor already shows what was saved, and refreshing would reload it under the cursor
  if (row) return { ok: true, version: row.version, savedAt: row.updatedAt.toISOString() };
  const [now] = await db
    .select({ at: schema.proposals.updatedAt, by: sql<string>`coalesce(${schema.users.name}, 'someone')` })
    .from(schema.proposals)
    .leftJoin(schema.users, eq(schema.users.id, schema.proposals.updatedBy))
    .where(eq(schema.proposals.id, id));
  return { ok: false, conflict: true, by: now?.by ?? "someone", at: now?.at.toISOString() ?? "" };
}

/** Replaces the whole proposal with a template (or the standard proposal). Based on a version, like a save. */
export async function applyTemplate(proposalId: number, expectedVersion: number, templateId: number | null) {
  const { me, p, proposalId: id } = await proposalFor(proposalId);
  let blocks: Block[];
  if (templateId != null) {
    const [t] = await db.select({ blocks: schema.proposalTemplates.blocks }).from(schema.proposalTemplates).where(eq(schema.proposalTemplates.id, pid.parse(templateId)));
    if (!t) throw new Error("That template no longer exists.");
    blocks = fresh(t.blocks);
  } else {
    blocks = await standardFor(p);
  }
  const [row] = await db
    .update(schema.proposals)
    .set({ blocks, version: sql`${schema.proposals.version} + 1`, updatedBy: me.id, updatedAt: new Date() })
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.version, expectedVersion)))
    .returning({ version: schema.proposals.version });
  if (!row) throw new Error("Someone changed this proposal in the meantime. Reload the page, then try again.");
  refresh(p.id);
  return { version: row.version, blocks };
}

/** Saves the proposal as it is now as a template, for this project's type or for every type. */
export async function saveAsTemplate(proposalId: number, name: string, forType: boolean) {
  const { me, p, proposalId: id } = await proposalFor(proposalId);
  const n = z.string().trim().min(2, "Give the template a name").max(100).parse(name);
  const [prop] = await db.select({ blocks: schema.proposals.blocks }).from(schema.proposals).where(eq(schema.proposals.id, id));
  const blocks = blocksSchema.parse(prop.blocks);
  await db.insert(schema.proposalTemplates).values({ name: n, typeKey: forType ? p.typeKey : null, blocks, createdBy: me.id });
  revalidatePath("/projects", "layout");
}

/** Removes a template: the person who saved it, or an admin. */
export async function deleteProposalTemplate(templateId: number) {
  const me = await assertApp("projects");
  const [t] = await db.select({ createdBy: schema.proposalTemplates.createdBy }).from(schema.proposalTemplates).where(eq(schema.proposalTemplates.id, pid.parse(templateId)));
  if (!t) return;
  if (me.role !== "admin" && t.createdBy !== me.id) throw new Error("Only the person who saved this template, or an admin, can remove it.");
  await db.delete(schema.proposalTemplates).where(eq(schema.proposalTemplates.id, templateId));
  revalidatePath("/projects", "layout");
}

const termsSchema = z.object({
  title: z.string().trim().min(2, "Give the text a title").max(200),
  doc: z.looseObject({ type: z.literal("doc"), content: z.array(z.unknown()).max(2000).optional() }),
});

/** Keeps a terms block's text in the library, so every proposal can insert it. */
export async function saveTermsText(input: z.input<typeof termsSchema>) {
  const me = await assertApp("projects");
  const d = termsSchema.parse(input);
  if (JSON.stringify(d.doc).length > 100_000) throw new Error("This text is too long for the library.");
  const [row] = await db.insert(schema.termsLibrary).values({ title: d.title, doc: d.doc, createdBy: me.id }).returning({ id: schema.termsLibrary.id });
  revalidatePath("/projects", "layout");
  return { id: row.id };
}

export async function deleteTermsText(id: number) {
  const me = await assertApp("projects");
  const [t] = await db.select({ createdBy: schema.termsLibrary.createdBy }).from(schema.termsLibrary).where(eq(schema.termsLibrary.id, pid.parse(id)));
  if (!t) return;
  if (me.role !== "admin" && t.createdBy !== me.id) throw new Error("Only the person who saved this text, or an admin, can remove it.");
  await db.delete(schema.termsLibrary).where(eq(schema.termsLibrary.id, id));
  revalidatePath("/projects", "layout");
}
