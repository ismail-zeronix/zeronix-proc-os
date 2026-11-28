import "server-only";
import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { partNorm } from "@/lib/items";

const I = schema.items;
const C = schema.itemCategories;

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export type ItemRow = Awaited<ReturnType<typeof listItems>>[number];

/** Every item with its category name, A to Z. The page filters and pages them (a company has hundreds, not millions). */
export async function listItems() {
  return db
    .select({
      id: I.id,
      sku: I.sku,
      name: I.name,
      description: I.description,
      categoryId: I.categoryId,
      categoryName: C.name,
      brand: I.brand,
      partNumber: I.partNumber,
      unit: I.unit,
      kind: I.kind,
      trackStock: I.trackStock,
      trackSerials: I.trackSerials,
      salePrice: I.salePrice,
      purchasePrice: I.purchasePrice,
      taxCode: I.taxCode,
      reorderLevel: I.reorderLevel,
      onHand: I.onHand,
      stockValue: I.stockValue,
      avgCost: I.avgCost,
      productId: I.productId,
      isActive: I.isActive,
      notes: I.notes,
      updatedAt: I.updatedAt,
    })
    .from(I)
    .leftJoin(C, eq(C.id, I.categoryId))
    .orderBy(asc(sql`lower(${I.name})`), asc(I.id));
}

export type CategoryRow = Awaited<ReturnType<typeof listCategories>>[number];

/** Categories in their order, with how many items each has. */
export async function listCategories() {
  return db
    .select({
      id: C.id,
      name: C.name,
      sort: C.sort,
      kind: C.kind,
      unit: C.unit,
      taxCode: C.taxCode,
      trackStock: C.trackStock,
      trackSerials: C.trackSerials,
      isActive: C.isActive,
      items: sql<number>`(SELECT count(*)::int FROM ${I} WHERE ${I.categoryId} = ${C.id})`,
    })
    .from(C)
    .orderBy(asc(C.sort), asc(sql`lower(${C.name})`));
}

/** What the line pickers get for one item. Costs only go to people who may see them (`costs`). */
export interface PickedItem {
  id: number;
  sku: string;
  name: string;
  description: string;
  unit: string;
  kind: "goods" | "service";
  brand: string;
  partNumber: string;
  salePrice: number | null;
  purchasePrice: number | null;
  taxCode: string;
  trackStock: boolean;
  trackSerials: boolean;
  onHand: number;
}

/**
 * Items for a line picker: the SKU, part number, name or brand typed (an exact SKU or part number first). Active items
 * only. Purchase prices only with `costs`.
 */
export async function searchItems(q: string, opts: { costs: boolean; limit?: number }): Promise<PickedItem[]> {
  const t = q.trim();
  if (!t) return [];
  const pn = partNorm(t);
  const rows = await db
    .select({
      id: I.id,
      sku: I.sku,
      name: I.name,
      description: I.description,
      unit: I.unit,
      kind: I.kind,
      brand: I.brand,
      partNumber: I.partNumber,
      salePrice: I.salePrice,
      purchasePrice: I.purchasePrice,
      taxCode: I.taxCode,
      trackStock: I.trackStock,
      trackSerials: I.trackSerials,
      onHand: I.onHand,
    })
    .from(I)
    .where(and(eq(I.isActive, true), or(ilike(I.sku, like(t)), ilike(I.name, like(t)), ilike(I.brand, like(t)), pn.length >= 3 ? sql`${I.partNorm} LIKE ${`%${pn}%`}` : sql`false`)))
    .orderBy(sql`CASE WHEN lower(${I.sku}) = lower(${t}) OR (${pn} <> '' AND ${I.partNorm} = ${pn}) THEN 0 ELSE 1 END`, asc(sql`lower(${I.name})`))
    .limit(opts.limit ?? 12);
  return rows.map((r) => ({ ...r, purchasePrice: opts.costs ? r.purchasePrice : null }));
}

/** How many document lines use an item (an item in use can be switched off, never deleted). */
export async function itemUsage(itemId: number): Promise<number> {
  const tables = [schema.dealItems, schema.quoteItems, schema.salesOrderItems, schema.invoiceItems, schema.creditNoteItems, schema.billItems, schema.debitNoteItems];
  const counts = await Promise.all(tables.map((t) => db.select({ n: count() }).from(t).where(eq(t.itemId, itemId))));
  return counts.reduce((s, [r]) => s + Number(r?.n ?? 0), 0);
}

/** The company's business type (organizations.business_type), read for forms and actions. */
export async function businessTypeOf(orgId: number) {
  const [o] = await db.select({ t: schema.organizations.businessType }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
  return o?.t ?? null;
}
