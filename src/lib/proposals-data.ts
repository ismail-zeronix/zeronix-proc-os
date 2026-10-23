import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { CoverInfo } from "@/components/proposal/proposal-document";
import type { PriceLine } from "@/components/proposal/price-tables";
import { db, schema } from "@/db";
import type { db as Db } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { type Block, blocksSchema, type RichDoc } from "@/lib/proposal";
import { bankDetails } from "@/lib/quote-view";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/** The BOQ lines as the price block draws them. */
async function priceLines(t: Tx | typeof db, dealId: number): Promise<PriceLine[]> {
  return t
    .select({
      id: schema.dealItems.id,
      section: schema.dealItems.section,
      position: schema.dealItems.position,
      description: schema.dealItems.description,
      qty: schema.dealItems.qty,
      unit: schema.dealItems.unit,
      unitPriceAed: schema.dealItems.unitPriceAed,
      costAed: schema.dealItems.costAed,
      optional: schema.dealItems.optional,
    })
    .from(schema.dealItems)
    .where(eq(schema.dealItems.dealId, dealId))
    .orderBy(asc(schema.dealItems.position), asc(schema.dealItems.id));
}

/**
 * Freezes the project's proposal for a quote that was just made or updated from the same BOQ (call inside that
 * transaction). Does nothing for a deal that is not a project or has no proposal yet. Costs are not kept: the customer
 * never sees them.
 */
export async function snapshotForQuote(tx: Tx, dealId: number, quote: { id: number; number: string; vatPct: number; validUntil: string }, userId: number): Promise<boolean> {
  const [p] = await tx
    .select({
      proposalId: schema.proposals.id,
      blocks: schema.proposals.blocks,
      number: schema.projects.number,
      sections: schema.projects.boqSections,
      site: schema.projects.siteAddress,
      customer: schema.companies.name,
      customerTrn: schema.companies.trn,
      contactId: schema.deals.contactId,
    })
    .from(schema.proposals)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .where(and(eq(schema.deals.id, dealId), eq(schema.deals.kind, "project")));
  if (!p) return false;
  const parsed = blocksSchema.safeParse(p.blocks);
  if (!parsed.success) return false;
  const [contact] = p.contactId ? await tx.select({ name: schema.contacts.name, jobTitle: schema.contacts.jobTitle }).from(schema.contacts).where(eq(schema.contacts.id, p.contactId)) : [];
  const lines = (await priceLines(tx, dealId)).map((l) => ({ ...l, costAed: null }));
  const cover: CoverInfo = {
    customer: p.customer,
    contact: contact?.name ?? "",
    contactTitle: contact?.jobTitle ?? "",
    site: p.site,
    projectNumber: p.number,
    quoteNumber: quote.number,
    date: dubaiToday(),
    validUntil: quote.validUntil,
    customerTrn: p.customerTrn,
    // the account the customer is asked to pay into, as it was on the day
    bank: await bankDetails(),
  };
  const values = { blocks: parsed.data, boq: { lines, sections: p.sections, vatPct: quote.vatPct }, cover, createdBy: userId, createdAt: new Date() };
  await tx
    .insert(schema.proposalSnapshots)
    .values({ proposalId: p.proposalId, quoteId: quote.id, ...values })
    .onConflictDoUpdate({ target: schema.proposalSnapshots.quoteId, set: values });
  return true;
}

export interface Snapshot {
  blocks: Block[];
  boq: { lines: PriceLine[]; sections: string[]; vatPct: number };
  cover: CoverInfo;
  createdAt: Date;
}

/** The frozen proposal of a quote, or null for a product quote (or a project quote made before the proposal existed). */
export async function snapshotOfQuote(quoteId: number): Promise<Snapshot | null> {
  const [r] = await db.select().from(schema.proposalSnapshots).where(eq(schema.proposalSnapshots.quoteId, quoteId));
  if (!r) return null;
  const blocks = blocksSchema.safeParse(r.blocks);
  if (!blocks.success) return null;
  return { blocks: blocks.data, boq: r.boq as Snapshot["boq"], cover: r.cover as CoverInfo, createdAt: r.createdAt };
}

/** The live BOQ of a deal for the price block (editor and draft print). */
export const livePriceLines = (dealId: number) => priceLines(db, dealId);

/** The proposal of a project, or null when it has not been started. Blocks that no longer validate are dropped, never shown broken. */
export async function proposalOf(projectId: number) {
  const [r] = await db
    .select({
      id: schema.proposals.id,
      title: schema.proposals.title,
      blocks: schema.proposals.blocks,
      version: schema.proposals.version,
      updatedAt: schema.proposals.updatedAt,
      updatedBy: sql<string>`coalesce(${schema.users.name}, '')`,
    })
    .from(schema.proposals)
    .leftJoin(schema.users, eq(schema.users.id, schema.proposals.updatedBy))
    .where(eq(schema.proposals.projectId, projectId));
  if (!r) return null;
  const parsed = blocksSchema.safeParse(r.blocks);
  const blocks: Block[] = parsed.success ? parsed.data : [];
  return { ...r, blocks };
}

/** Templates offered for a project type: the ones for that type first, then the ones for every type. */
export async function proposalTemplates(typeKey: string) {
  const rows = await db
    .select({
      id: schema.proposalTemplates.id,
      name: schema.proposalTemplates.name,
      typeKey: schema.proposalTemplates.typeKey,
      createdBy: schema.proposalTemplates.createdBy,
      createdByName: sql<string>`coalesce(${schema.users.name}, '')`,
      blocks: sql<number>`jsonb_array_length(${schema.proposalTemplates.blocks})::int`,
    })
    .from(schema.proposalTemplates)
    .leftJoin(schema.users, eq(schema.users.id, schema.proposalTemplates.createdBy))
    .where(or(eq(schema.proposalTemplates.typeKey, typeKey), isNull(schema.proposalTemplates.typeKey)))
    .orderBy(desc(schema.proposalTemplates.updatedAt));
  return rows.sort((a, b) => Number(b.typeKey === typeKey) - Number(a.typeKey === typeKey));
}

/** Texts people saved from terms blocks. */
export async function termsLibrary() {
  const rows = await db
    .select({ id: schema.termsLibrary.id, title: schema.termsLibrary.title, doc: schema.termsLibrary.doc, createdBy: schema.termsLibrary.createdBy })
    .from(schema.termsLibrary)
    .orderBy(schema.termsLibrary.title);
  return rows.map((r) => ({ ...r, doc: r.doc as RichDoc }));
}
