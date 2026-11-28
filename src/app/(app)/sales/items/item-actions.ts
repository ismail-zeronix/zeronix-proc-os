"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { isPunchedIn, loadAccess, NOT_PUNCHED_IN } from "@/lib/auth/session";
import { takeSeriesNumber } from "@/lib/doc-numbers";
import { itemFlags, partNorm, SKU_PREFIX, STARTER_CATEGORIES, type ItemCsvRow } from "@/lib/items";
import { itemUsage } from "@/lib/items-data";
import { addCategories } from "@/lib/industry-apply";
import { itemHasMoves } from "@/lib/inventory/engine";
import { currentOrgId, setTxOrg } from "@/lib/org";
import { round2 } from "@/lib/quotation";
import type { Tx } from "@/lib/tx";
import { parseInput, UserError } from "@/lib/user-error";

const I = schema.items;
const C = schema.itemCategories;

/** Items are kept from Sales, Accounts or Inventory. Purchase prices only by the accounts team (they are costs). */
async function itemAccess() {
  const access = await loadAccess();
  if (!access || !["sales", "accounts", "inventory"].some((k) => access.apps.includes(k as "sales"))) throw new UserError("You do not have access to this");
  if (!(await isPunchedIn(access.user.id))) throw new UserError(NOT_PUNCHED_IN);
  return { user: access.user, finance: access.finance, business: access.businessType, orgId: await currentOrgId() };
}

function refresh(itemId?: number) {
  for (const base of ["/sales/items", "/accounts/items", "/inventory/items"]) revalidatePath(base);
  revalidatePath("/inventory");
  if (itemId) revalidatePath(`/inventory/items/${itemId}`);
}

const money = z.number().min(0, "Prices cannot be below zero").max(99_999_999).nullable();
const TAX = ["SR", "ZR", "EX", "OS"] as const;

const itemSchema = z.object({
  id: z.number().int().positive().optional(),
  sku: z.string().trim().max(40, "Keep the SKU under 40 characters").default(""),
  name: z.string().trim().min(1, "Give the item a name").max(200),
  description: z.string().trim().max(1000).default(""),
  categoryId: z.number().int().positive().nullable().default(null),
  brand: z.string().trim().max(80).default(""),
  partNumber: z.string().trim().max(80).default(""),
  unit: z.string().trim().max(20).default("pcs"),
  kind: z.enum(["goods", "service"]).default("goods"),
  trackStock: z.boolean().default(false),
  trackSerials: z.boolean().default(false),
  salePrice: money.default(null),
  purchasePrice: money.default(null),
  taxCode: z.enum(TAX).default("SR"),
  reorderLevel: z.number().min(0).max(9_999_999).nullable().default(null),
  notes: z.string().trim().max(1000).default(""),
  isActive: z.boolean().default(true),
});
export type ItemInput = z.input<typeof itemSchema>;

/** A SKU nobody uses yet: ITM-00001, ITM-00002… (a number someone typed by hand is skipped). */
async function freeSku(tx: Tx, orgId: number): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const { number } = await takeSeriesNumber(tx, { orgId, key: "item", prefix: SKU_PREFIX, digits: 5 });
    const [taken] = await tx.select({ id: I.id }).from(I).where(and(eq(I.organizationId, orgId), sql`lower(${I.sku}) = lower(${number})`));
    if (!taken) return number;
  }
  throw new UserError("Could not find a free SKU. Type one in.");
}

async function assertSkuFree(tx: Tx, orgId: number, sku: string, id?: number) {
  const [taken] = await tx
    .select({ id: I.id, name: I.name })
    .from(I)
    .where(and(eq(I.organizationId, orgId), sql`lower(${I.sku}) = lower(${sku})`, id ? ne(I.id, id) : sql`true`));
  if (taken) throw new UserError(`SKU ${sku} is already used by "${taken.name}".`);
}

async function assertCategory(tx: Tx, orgId: number, categoryId: number | null) {
  if (!categoryId) return;
  const [c] = await tx.select({ id: C.id }).from(C).where(and(eq(C.id, categoryId), eq(C.organizationId, orgId)));
  if (!c) throw new UserError("That category no longer exists.");
}

/** Adds or changes an item. Blank SKU = the next ITM number. */
export async function saveItem(input: ItemInput) {
  const me = await itemAccess();
  const d = parseInput(itemSchema, input);
  const flags = itemFlags(d, me.business);
  const result = await db.transaction(async (tx) => {
    await setTxOrg(tx, me.orgId);
    await assertCategory(tx, me.orgId, d.categoryId);
    const [before] = d.id ? await tx.select().from(I).where(and(eq(I.id, d.id), eq(I.organizationId, me.orgId))).for("update") : [];
    if (d.id && !before) throw new UserError("That item no longer exists.");
    // stock already moved with these switches: changing them would leave its stock and serials meaning something else
    if (before && (before.kind !== flags.kind || before.trackStock !== flags.trackStock || before.trackSerials !== flags.trackSerials) && (await itemHasMoves(tx, me.orgId, before.id)))
      throw new UserError("This item already has stock moves, so goods/service, Track stock and Serial numbers can no longer change. Make a new item instead.");
    const sku = d.sku || before?.sku || (await freeSku(tx, me.orgId));
    await assertSkuFree(tx, me.orgId, sku, d.id);
    const values = {
      sku,
      name: d.name,
      description: d.description,
      categoryId: d.categoryId,
      brand: d.brand,
      partNumber: d.partNumber,
      partNorm: partNorm(d.partNumber),
      unit: d.unit || (flags.kind === "service" ? "job" : "pcs"),
      ...flags,
      salePrice: d.salePrice == null ? null : round2(d.salePrice),
      // a cost: only the accounts team sets it; others leave it as it was
      purchasePrice: me.finance ? (d.purchasePrice == null ? null : round2(d.purchasePrice)) : (before?.purchasePrice ?? null),
      taxCode: d.taxCode,
      reorderLevel: flags.trackStock ? d.reorderLevel : null,
      notes: d.notes,
      isActive: d.isActive,
      updatedAt: new Date(),
    };
    if (before) {
      await tx.update(I).set(values).where(eq(I.id, before.id));
      await audit(tx, { userId: me.user.id, orgId: me.orgId, action: "item.update", entity: "item", entityId: before.id, summary: `Item ${sku} ${d.name} changed`, before: { sku: before.sku, name: before.name, salePrice: before.salePrice, trackStock: before.trackStock }, after: { sku, name: d.name, salePrice: values.salePrice, trackStock: values.trackStock } });
      return { id: before.id, sku };
    }
    const [row] = await tx.insert(I).values({ ...values, organizationId: me.orgId, createdBy: me.user.id }).returning({ id: I.id });
    await audit(tx, { userId: me.user.id, orgId: me.orgId, action: "item.create", entity: "item", entityId: row.id, summary: `Item ${sku} ${d.name} added`, after: { sku, name: d.name, kind: values.kind, trackStock: values.trackStock } });
    return { id: row.id, sku };
  });
  refresh(result.id);
  return result;
}

/** Switches an item off (it stays on old documents, it is no longer offered on new lines) or back on. */
export async function setItemActive(itemId: number, active: boolean) {
  const me = await itemAccess();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, me.orgId);
    const [it] = await tx.update(I).set({ isActive: active, updatedAt: new Date() }).where(and(eq(I.id, itemId), eq(I.organizationId, me.orgId))).returning({ sku: I.sku, name: I.name });
    if (!it) throw new UserError("That item no longer exists.");
    await audit(tx, { userId: me.user.id, orgId: me.orgId, action: active ? "item.activate" : "item.deactivate", entity: "item", entityId: itemId, summary: `Item ${it.sku} ${active ? "switched back on" : "switched off"}` });
  });
  refresh(itemId);
}

/** Deletes an item that no document uses; one in use can only be switched off. */
export async function deleteItem(itemId: number) {
  const me = await itemAccess();
  const used = await itemUsage(itemId);
  if (used) throw new UserError(`This item is on ${used} document line${used === 1 ? "" : "s"}. Switch it off instead: it then stays on those documents.`);
  await db.transaction(async (tx) => {
    await setTxOrg(tx, me.orgId);
    const [it] = await tx.delete(I).where(and(eq(I.id, itemId), eq(I.organizationId, me.orgId))).returning({ sku: I.sku, name: I.name });
    if (!it) throw new UserError("That item no longer exists.");
    await audit(tx, { userId: me.user.id, orgId: me.orgId, action: "item.delete", entity: "item", entityId: itemId, summary: `Item ${it.sku} ${it.name} deleted` });
  });
  refresh();
}

/* ---------- categories ---------- */

const categorySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "Give the category a name").max(80),
  kind: z.enum(["goods", "service"]).default("goods"),
  unit: z.string().trim().max(20).default(""),
  taxCode: z.enum(TAX).default("SR"),
  trackStock: z.boolean().default(false),
  trackSerials: z.boolean().default(false),
});
export type CategoryInput = z.input<typeof categorySchema>;

export async function saveCategory(input: CategoryInput) {
  const me = await itemAccess();
  const d = parseInput(categorySchema, input);
  const flags = itemFlags(d, me.business);
  const id = await db.transaction(async (tx) => {
    await setTxOrg(tx, me.orgId);
    const [taken] = await tx
      .select({ id: C.id })
      .from(C)
      .where(and(eq(C.organizationId, me.orgId), sql`lower(${C.name}) = lower(${d.name})`, d.id ? ne(C.id, d.id) : sql`true`));
    if (taken) throw new UserError(`There is already a category called ${d.name}.`);
    const values = { name: d.name, unit: d.unit, taxCode: d.taxCode, ...flags };
    if (d.id) {
      const [c] = await tx.update(C).set(values).where(and(eq(C.id, d.id), eq(C.organizationId, me.orgId))).returning({ id: C.id });
      if (!c) throw new UserError("That category no longer exists.");
      return c.id;
    }
    const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${C.sort}), 0)::int` }).from(C).where(eq(C.organizationId, me.orgId));
    const [c] = await tx.insert(C).values({ ...values, organizationId: me.orgId, sort: n + 1 }).returning({ id: C.id });
    await audit(tx, { userId: me.user.id, orgId: me.orgId, action: "item_category.create", entity: "item_category", entityId: c.id, summary: `Item category ${d.name} added` });
    return c.id;
  });
  refresh();
  return { id };
}

/** Deletes a category; its items stay, without a category. */
export async function deleteCategory(categoryId: number) {
  const me = await itemAccess();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, me.orgId);
    const [c] = await tx.delete(C).where(and(eq(C.id, categoryId), eq(C.organizationId, me.orgId))).returning({ name: C.name });
    if (!c) throw new UserError("That category no longer exists.");
    await audit(tx, { userId: me.user.id, orgId: me.orgId, action: "item_category.delete", entity: "item_category", entityId: categoryId, summary: `Item category ${c.name} deleted` });
  });
  refresh();
}

/** The starter set for what the company does; names that already exist are skipped. */
export async function addStarterCategories() {
  const me = await itemAccess();
  const set = STARTER_CATEGORIES[me.business ?? "services"];
  const added = await db.transaction(async (tx) => {
    await setTxOrg(tx, me.orgId);
    return addCategories(tx, me.orgId, set, me.business);
  });
  refresh();
  return { added };
}

/* ---------- CSV import ---------- */

const importRow = z.object({
  sku: z.string().trim().max(40),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80),
  brand: z.string().trim().max(80),
  partNumber: z.string().trim().max(80),
  unit: z.string().trim().max(20),
  kind: z.enum(["goods", "service"]),
  salePrice: money,
  purchasePrice: money,
  taxCode: z.enum(TAX),
  trackStock: z.boolean(),
  trackSerials: z.boolean(),
  reorderLevel: z.number().min(0).nullable(),
  description: z.string().trim().max(1000),
});

/**
 * Items from a CSV the browser has already read (lib/items.ts parseItemsCsv). A known SKU is updated, a new one added;
 * categories named in the file are made when missing. All or nothing.
 */
export async function importItems(rows: ItemCsvRow[]) {
  const me = await itemAccess();
  const list = parseInput(z.array(importRow).min(1, "Nothing to import").max(1000, "Import at most 1,000 items at a time"), rows);
  const result = await db.transaction(async (tx) => {
    await setTxOrg(tx, me.orgId);
    // categories by name, made when missing
    const cats = new Map((await tx.select({ id: C.id, name: C.name }).from(C).where(eq(C.organizationId, me.orgId))).map((c) => [c.name.toLowerCase(), c.id]));
    for (const name of [...new Set(list.map((r) => r.category).filter(Boolean))]) {
      if (cats.has(name.toLowerCase())) continue;
      const [c] = await tx.insert(C).values({ organizationId: me.orgId, name, sort: cats.size + 1 }).returning({ id: C.id });
      cats.set(name.toLowerCase(), c.id);
    }
    const skus = list.map((r) => r.sku.toLowerCase()).filter(Boolean);
    const existing = skus.length
      ? new Map((await tx.select({ id: I.id, sku: I.sku, purchasePrice: I.purchasePrice }).from(I).where(and(eq(I.organizationId, me.orgId), inArray(sql`lower(${I.sku})`, skus)))).map((i) => [i.sku.toLowerCase(), i]))
      : new Map<string, { id: number; sku: string; purchasePrice: number | null }>();
    let created = 0;
    let updated = 0;
    for (const r of list) {
      const flags = itemFlags(r, me.business);
      const found = r.sku ? existing.get(r.sku.toLowerCase()) : undefined;
      const values = {
        name: r.name,
        description: r.description,
        categoryId: r.category ? (cats.get(r.category.toLowerCase()) ?? null) : null,
        brand: r.brand,
        partNumber: r.partNumber,
        partNorm: partNorm(r.partNumber),
        unit: r.unit || (flags.kind === "service" ? "job" : "pcs"),
        ...flags,
        salePrice: r.salePrice,
        purchasePrice: me.finance ? r.purchasePrice : (found?.purchasePrice ?? null),
        taxCode: r.taxCode,
        reorderLevel: flags.trackStock ? r.reorderLevel : null,
        updatedAt: new Date(),
      };
      if (found) {
        await tx.update(I).set(values).where(eq(I.id, found.id));
        updated++;
      } else {
        const sku = r.sku || (await freeSku(tx, me.orgId));
        await tx.insert(I).values({ ...values, sku, organizationId: me.orgId, createdBy: me.user.id });
        created++;
      }
    }
    await audit(tx, { userId: me.user.id, orgId: me.orgId, action: "item.import", entity: "item", summary: `Items imported: ${created} added, ${updated} updated` });
    return { created, updated };
  });
  refresh();
  return result;
}
