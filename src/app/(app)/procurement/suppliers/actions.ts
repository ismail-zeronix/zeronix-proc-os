"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { assertApp } from "@/lib/auth/session";
import { CURRENCIES } from "@/lib/fx";
import { normalizeName, normalizePhone } from "@/lib/parse/clean";
import { SUPPLIER_TYPE_KEYS } from "@/lib/supplier-types";
import { parseInput, UserError } from "@/lib/user-error";

const supplierSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2).max(120),
  contactName: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(60).default(""),
  location: z.string().trim().max(120).default(""),
  type: z.enum(SUPPLIER_TYPE_KEYS).default("other"),
  defaultCurrency: z.enum(CURRENCIES).default("AED"),
  notes: z.string().trim().max(2000).default(""),
  isActive: z.boolean().default(true),
});

export async function saveSupplier(input: z.input<typeof supplierSchema>) {
  await assertApp("procurement");
  const { id, ...data } = parseInput(supplierSchema, input);
  try {
    if (id) await db.update(schema.suppliers).set(data).where(eq(schema.suppliers.id, id));
    else await db.insert(schema.suppliers).values(data);
  } catch (e) {
    if (String((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code) === "23505") {
      throw new UserError("A supplier with this name already exists.");
    }
    throw e;
  }
  revalidatePath("/procurement/suppliers");
}

const handleSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  kind: z.enum(["phone", "name"]),
  value: z.string().trim().min(2).max(120),
});

/** A phone number or WhatsApp name this supplier writes from, so Claude's pushes find them. */
export async function addSupplierHandle(input: z.input<typeof handleSchema>) {
  await assertApp("procurement");
  const d = parseInput(handleSchema, input);
  const valueNorm = d.kind === "phone" ? normalizePhone(d.value) : normalizeName(d.value);
  if (!valueNorm || (d.kind === "name" && /^\d+$/.test(valueNorm))) {
    throw new UserError(d.kind === "phone" ? "That does not look like a phone number." : "Enter the name as WhatsApp shows it.");
  }
  const [taken] = await db
    .select({ supplier: schema.suppliers.name, supplierId: schema.supplierHandles.supplierId })
    .from(schema.supplierHandles)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierHandles.supplierId))
    .where(and(eq(schema.supplierHandles.kind, d.kind), eq(schema.supplierHandles.valueNorm, valueNorm)));
  if (taken) {
    if (taken.supplierId === d.supplierId) return;
    throw new UserError(`This ${d.kind === "phone" ? "number" : "name"} already belongs to ${taken.supplier}.`);
  }
  await db.insert(schema.supplierHandles).values({ supplierId: d.supplierId, kind: d.kind, value: d.value, valueNorm });
  revalidatePath(`/procurement/suppliers/${d.supplierId}`);
}

export async function removeSupplierHandle(id: number) {
  await assertApp("procurement");
  const [h] = await db.delete(schema.supplierHandles).where(eq(schema.supplierHandles.id, id)).returning({ supplierId: schema.supplierHandles.supplierId });
  if (h) revalidatePath(`/procurement/suppliers/${h.supplierId}`);
}

/**
 * Two records for the same supplier (made before their WhatsApp number was known): moves the price lists, offers, WhatsApp
 * numbers and names of `fromId` to `intoId` and removes `fromId`. Only when Accounts has nothing on `fromId` (bills,
 * payments, ledger lines), so money records never move.
 */
export async function mergeSupplier(fromId: number, intoId: number) {
  const user = await assertApp("procurement");
  const from = parseInput(z.number().int().positive(), fromId);
  const into = parseInput(z.number().int().positive(), intoId);
  if (from === into) throw new UserError("Choose a different supplier to merge into.");
  const [a] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, from));
  const [b] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, into));
  if (!a || !b) throw new UserError("Supplier not found.");
  const money = await db.execute<{ n: number }>(sql`
    SELECT (SELECT count(*) FROM bills WHERE supplier_id = ${from})
      + (SELECT count(*) FROM supplier_payments WHERE supplier_id = ${from})
      + (SELECT count(*) FROM journal_lines WHERE party_type = 'supplier' AND party_id = ${from}) AS n`);
  if (Number(money.rows[0]?.n ?? 0) > 0) {
    throw new UserError(`${a.name} has bills or payments in Accounts, so it cannot be merged. Merge the other way round, into ${a.name}.`);
  }
  await db.transaction(async (tx) => {
    // the same broadcast filed under both: the moved copy stops counting for repeats (one per supplier)
    await tx.execute(sql`
      UPDATE price_lists SET fingerprint = '' WHERE supplier_id = ${from} AND fingerprint <> ''
        AND fingerprint IN (SELECT fingerprint FROM price_lists WHERE supplier_id = ${into})`);
    await tx.update(schema.priceLists).set({ supplierId: into }).where(eq(schema.priceLists.supplierId, from));
    await tx.update(schema.offers).set({ supplierId: into }).where(eq(schema.offers.supplierId, from));
    // a number or name belongs to one supplier only, so the duplicate's simply move over
    await tx.update(schema.supplierHandles).set({ supplierId: into }).where(eq(schema.supplierHandles.supplierId, from));
    // a live feed moves only when the target has none
    const [feed] = await tx.select({ id: schema.supplierFeeds.id }).from(schema.supplierFeeds).where(eq(schema.supplierFeeds.supplierId, into));
    if (!feed) await tx.update(schema.supplierFeeds).set({ supplierId: into }).where(eq(schema.supplierFeeds.supplierId, from));
    await tx.insert(schema.supplierHandles).values({ supplierId: into, kind: "name", value: a.name, valueNorm: normalizeName(a.name) }).onConflictDoNothing();
    await tx.delete(schema.suppliers).where(eq(schema.suppliers.id, from));
    await audit(tx, { userId: user.id, action: "supplier.merge", entity: "supplier", entityId: into, summary: `Merged supplier "${a.name}" into "${b.name}"`, before: { id: a.id, name: a.name } });
  });
  revalidatePath("/procurement", "layout");
  return { into };
}
