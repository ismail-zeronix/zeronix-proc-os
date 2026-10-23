"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { assertDeal } from "@/lib/auth/visibility";
import { cleanSection, isLineType, UNITS } from "@/lib/boq";
import { getFx, toAed } from "@/lib/fx";
import { marginOf, sellPrice } from "@/lib/quotation";
import { quoteDefaults } from "@/lib/quotes-data";

/**
 * The project BOQ (bill of quantities). Its lines are the deal's lines (deal_items) with a section, unit and kind, so the
 * normal quote, order and invoice code works on them unchanged. The section order lives on the project.
 */

const price = z.number().min(0).max(1e9);
const lineSchema = z.object({
  section: z.string().max(200).transform(cleanSection),
  description: z.string().trim().min(1, "Describe the line").max(400),
  lineType: z.string().refine(isLineType, "Unknown kind of line"),
  unit: z.string().refine((u) => u === "" || (UNITS as readonly string[]).includes(u), "Unknown unit"),
  qty: z.number().int().min(1, "Quantity must be at least 1").max(100000),
  costAed: price.nullable(),
  unitPriceAed: price,
  optional: z.boolean(),
});
export type BoqLineInput = z.input<typeof lineSchema>;

function refresh(projectId: number) {
  revalidatePath(`/projects/list/${projectId}`);
  revalidatePath("/projects", "layout");
  revalidatePath("/sales", "layout");
}

/** The project and its deal, after checking the signed-in person may work on it. */
async function projectFor(projectId: number) {
  await assertApp("projects");
  const [p] = await db
    .select({ id: schema.projects.id, dealId: schema.projects.dealId, sections: schema.projects.boqSections })
    .from(schema.projects)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .where(and(eq(schema.projects.id, z.number().int().positive().parse(projectId)), eq(schema.deals.kind, "project")));
  if (!p) throw new Error("That project does not exist or is not assigned to you.");
  await assertDeal(p.dealId);
  return p;
}

/** A BOQ line and its project, checked the same way. */
async function lineFor(lineId: number) {
  const [l] = await db
    .select({ id: schema.dealItems.id, dealId: schema.dealItems.dealId, projectId: schema.projects.id })
    .from(schema.dealItems)
    .innerJoin(schema.projects, eq(schema.projects.dealId, schema.dealItems.dealId))
    .where(eq(schema.dealItems.id, z.number().int().positive().parse(lineId)));
  if (!l) throw new Error("That line no longer exists.");
  await projectFor(l.projectId);
  return l;
}

async function nextPosition(dealId: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`coalesce(max(${schema.dealItems.position}), -1) + 1` }).from(schema.dealItems).where(eq(schema.dealItems.dealId, dealId));
  return r.n;
}

export async function addBoqLine(projectId: number, input: BoqLineInput) {
  const p = await projectFor(projectId);
  const d = lineSchema.parse(input);
  await db.insert(schema.dealItems).values({
    dealId: p.dealId,
    position: await nextPosition(p.dealId),
    section: d.section,
    description: d.description,
    lineType: d.lineType,
    unit: d.unit,
    qty: d.qty,
    costAed: d.costAed,
    marginPct: marginOf(d.costAed, d.unitPriceAed),
    unitPriceAed: d.unitPriceAed,
    optional: d.optional,
  });
  refresh(p.id);
}

export async function updateBoqLine(lineId: number, input: BoqLineInput) {
  const l = await lineFor(lineId);
  const d = lineSchema.parse(input);
  await db
    .update(schema.dealItems)
    .set({
      section: d.section,
      description: d.description,
      lineType: d.lineType,
      unit: d.unit,
      qty: d.qty,
      costAed: d.costAed,
      marginPct: marginOf(d.costAed, d.unitPriceAed),
      unitPriceAed: d.unitPriceAed,
      optional: d.optional,
    })
    .where(eq(schema.dealItems.id, l.id));
  refresh(l.projectId);
}

export async function deleteBoqLine(lineId: number) {
  const l = await lineFor(lineId);
  await db.delete(schema.dealItems).where(eq(schema.dealItems.id, l.id));
  refresh(l.projectId);
}

/** Moves a line one place up or down inside its section. */
export async function moveBoqLine(lineId: number, dir: "up" | "down") {
  const l = await lineFor(lineId);
  const [me] = await db.select({ section: schema.dealItems.section }).from(schema.dealItems).where(eq(schema.dealItems.id, l.id));
  const rows = await db
    .select({ id: schema.dealItems.id })
    .from(schema.dealItems)
    .where(and(eq(schema.dealItems.dealId, l.dealId), eq(schema.dealItems.section, me.section)))
    .orderBy(schema.dealItems.position, schema.dealItems.id);
  const i = rows.findIndex((r) => r.id === l.id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  // renumber the whole deal so positions stay unique and in order
  const all = await db.select({ id: schema.dealItems.id, section: schema.dealItems.section }).from(schema.dealItems).where(eq(schema.dealItems.dealId, l.dealId)).orderBy(schema.dealItems.position, schema.dealItems.id);
  const others = all.filter((r) => r.section !== me.section).map((r) => r.id);
  const order = [...others, ...rows.map((r) => r.id)];
  await db.transaction(async (tx) => {
    for (const [position, id] of order.entries()) await tx.update(schema.dealItems).set({ position }).where(eq(schema.dealItems.id, id));
  });
  refresh(l.projectId);
}

/**
 * Adds a supplier offer to a section as a material line. The cost and supplier are read from the database here, not taken
 * from the browser. Needs Procurement, because it shows what we pay.
 */
export async function addBoqLineFromOffer(projectId: number, section: string, offerId: number, qty = 1, marginPct?: number) {
  const p = await projectFor(projectId);
  await assertApp("procurement");
  const q = z.number().int().min(1).max(100000).parse(qty);
  const [o] = await db
    .select({
      id: schema.offers.id,
      productId: schema.offers.productId,
      price: schema.offers.price,
      currency: schema.offers.currency,
      supplierName: schema.suppliers.name,
      brand: schema.products.brand,
      modelName: schema.products.modelName,
      partNumber: schema.products.partNumber,
      specSummary: schema.products.specSummary,
    })
    .from(schema.offers)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.offers.supplierId))
    .innerJoin(schema.products, eq(schema.products.id, schema.offers.productId))
    .where(eq(schema.offers.id, offerId));
  if (!o) throw new Error("That offer no longer exists.");
  if (o.price == null) throw new Error("This offer has no price (price on request). Add the line by hand with the price you are given.");
  const cost = toAed(o.price, o.currency, await getFx());
  if (cost == null) throw new Error(`There is no AED rate for ${o.currency}. Add the line by hand with the cost in AED.`);
  const margin = marginPct == null ? (await quoteDefaults()).marginPct : z.number().min(0).max(300).parse(marginPct);
  const unit = sellPrice(cost, margin);
  const label = [o.brand, o.modelName, o.partNumber].filter(Boolean).join(" ");
  await db.insert(schema.dealItems).values({
    dealId: p.dealId,
    position: await nextPosition(p.dealId),
    section: cleanSection(section),
    description: (o.specSummary ? `${label}, ${o.specSummary}` : label).slice(0, 400),
    lineType: "material",
    unit: "nos",
    qty: q,
    productId: o.productId,
    offerId: o.id,
    supplierName: o.supplierName,
    costAed: cost,
    marginPct: marginOf(cost, unit),
    unitPriceAed: unit,
  });
  refresh(p.id);
}

// ---------- sections ----------

async function saveSections(projectId: number, sections: string[]) {
  await db.update(schema.projects).set({ boqSections: sections, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
}

export async function addBoqSection(projectId: number, name: string) {
  const p = await projectFor(projectId);
  const s = cleanSection(name);
  if (!s) throw new Error("Give the section a name.");
  if (p.sections.some((x) => x.toLowerCase() === s.toLowerCase())) throw new Error(`There is already a section "${s}".`);
  if (p.sections.length >= 40) throw new Error("A BOQ can have up to 40 sections.");
  await saveSections(p.id, [...p.sections, s]);
  refresh(p.id);
}

/** Renames a section and moves its lines with it. Renaming to an existing section's name merges the two. */
export async function renameBoqSection(projectId: number, from: string, to: string) {
  const p = await projectFor(projectId);
  const s = cleanSection(to);
  if (!s) throw new Error("Give the section a name.");
  if (s === from) return;
  const existing = p.sections.find((x) => x.toLowerCase() === s.toLowerCase() && x !== from);
  const target = existing ?? s;
  await db.transaction(async (tx) => {
    await tx.update(schema.dealItems).set({ section: target }).where(and(eq(schema.dealItems.dealId, p.dealId), eq(schema.dealItems.section, from)));
    const next = existing ? p.sections.filter((x) => x !== from) : p.sections.includes(from) ? p.sections.map((x) => (x === from ? s : x)) : [...p.sections, s];
    await tx.update(schema.projects).set({ boqSections: next, updatedAt: new Date() }).where(eq(schema.projects.id, p.id));
  });
  refresh(p.id);
}

export async function moveBoqSection(projectId: number, name: string, dir: "up" | "down") {
  const p = await projectFor(projectId);
  const i = p.sections.indexOf(name);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= p.sections.length) return;
  const next = [...p.sections];
  [next[i], next[j]] = [next[j], next[i]];
  await saveSections(p.id, next);
  refresh(p.id);
}

/** Removes an empty section. A section with lines must be emptied (or renamed into another) first, so no price is lost by accident. */
export async function deleteBoqSection(projectId: number, name: string) {
  const p = await projectFor(projectId);
  const [line] = await db
    .select({ id: schema.dealItems.id })
    .from(schema.dealItems)
    .where(and(eq(schema.dealItems.dealId, p.dealId), eq(schema.dealItems.section, name)))
    .limit(1);
  if (line) throw new Error("This section still has lines. Delete them or move them to another section first.");
  await saveSections(p.id, p.sections.filter((x) => x !== name));
  refresh(p.id);
}

/** Sets the same margin on every line in a section that has a cost (price = cost plus margin). Lines without a cost keep their price. */
export async function applySectionMargin(projectId: number, section: string, marginPct: number) {
  const p = await projectFor(projectId);
  const m = z.number().min(0).max(300).parse(marginPct);
  const lines = await db
    .select({ id: schema.dealItems.id, cost: schema.dealItems.costAed })
    .from(schema.dealItems)
    .where(and(eq(schema.dealItems.dealId, p.dealId), eq(schema.dealItems.section, section)));
  const priced = lines.filter((l) => l.cost != null);
  if (!priced.length) throw new Error("No line in this section has a cost yet, so there is nothing to put a margin on.");
  await db.transaction(async (tx) => {
    for (const l of priced) {
      const unit = sellPrice(l.cost as number, m);
      await tx.update(schema.dealItems).set({ unitPriceAed: unit, marginPct: marginOf(l.cost, unit) }).where(eq(schema.dealItems.id, l.id));
    }
  });
  refresh(p.id);
  return { changed: priced.length, skipped: lines.length - priced.length };
}
