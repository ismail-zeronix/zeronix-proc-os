"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { CURRENCIES } from "@/lib/fx";
import { CATEGORIES, offerDraftSchema, type OfferDraft } from "@/lib/offer-draft";
import { attachMatches } from "@/lib/products";
import { SUPPLIER_TYPE_KEYS } from "@/lib/supplier-types";
import { insertOffers } from "@/lib/procurement/offers";
import { parseInput, UserError } from "@/lib/user-error";

export async function deletePriceList(id: number) {
  const user = await assertApp("procurement");
  const [pl] = await db.select().from(schema.priceLists).where(eq(schema.priceLists.id, id));
  if (!pl) return;
  if (pl.status === "saved" && user.role !== "admin") throw new UserError("Only an admin can delete a saved price list.");
  await db.delete(schema.priceLists).where(eq(schema.priceLists.id, id));
  revalidatePath("/procurement/price-lists");
  revalidatePath("/procurement");
}

export async function savePriceList(id: number, draftsInput: OfferDraft[]) {
  await assertApp("procurement");
  const drafts = parseInput(z.array(offerDraftSchema), draftsInput);
  const [pl] = await db
    .select({ pl: schema.priceLists, supplierName: schema.suppliers.name })
    .from(schema.priceLists)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.priceLists.supplierId))
    .where(eq(schema.priceLists.id, id));
  if (!pl) throw new UserError("Price list not found");
  if (pl.pl.status === "saved") throw new UserError("This price list is already saved.");

  const included = drafts.filter((d) => d.include);

  await db.transaction(async (tx) => {
    await insertOffers(tx, { priceListId: id, supplierId: pl.pl.supplierId, supplierName: pl.supplierName, receivedAt: pl.pl.receivedAt }, included);
    await tx
      .update(schema.priceLists)
      .set({ status: "saved", savedAt: new Date(), drafts })
      .where(eq(schema.priceLists.id, id));
  });

  revalidatePath("/procurement", "layout");
  return { saved: included.length };
}

const MAX_EXCEL_ROWS = 5000;

const excelSchema = z.object({
  supplierId: z.coerce.number().int().positive().optional(),
  newSupplierName: z.string().trim().max(120).optional(),
  newSupplierType: z.enum(SUPPLIER_TYPE_KEYS).default("distributor"),
  receivedAt: z.string().optional(),
  currency: z.enum(CURRENCIES),
  /** What the price is quoted on, e.g. "FOB JA". Applied to every row. */
  basis: z.string().trim().max(40).default(""),
  fileName: z.string().trim().max(200),
  sheets: z
    .array(
      z.object({
        name: z.string().max(100),
        category: z.enum(CATEGORIES),
        drafts: z.array(offerDraftSchema).max(MAX_EXCEL_ROWS),
      }),
    )
    .min(1, "Choose at least one sheet.")
    .max(40),
});

/**
 * Stores the rows of a confirmed Excel upload as a price list that is ready to review (no AI step:
 * the sheet was read by rules). The person still checks and saves it like any other list.
 */
export async function createExcelPriceList(input: z.input<typeof excelSchema>) {
  const user = await assertApp("procurement");
  const data = parseInput(excelSchema, input);
  const started = Date.now();

  const drafts: OfferDraft[] = data.sheets.flatMap((s) =>
    s.drafts.map((d) => ({
      ...d,
      // "other" means the sheet name told us nothing: keep the per-row guess
      category: s.category === "other" ? d.category : s.category,
      currency: data.currency,
      priceBasis: data.basis,
      include: true,
    })),
  );
  if (!drafts.length) throw new UserError("There are no rows to import in the chosen sheets.");
  if (drafts.length > MAX_EXCEL_ROWS) throw new UserError(`That is more than ${MAX_EXCEL_ROWS} rows. Split the file.`);

  let supplierId = data.supplierId;
  if (supplierId) {
    const [sup] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
    if (!sup) throw new UserError("Supplier not found.");
    // remember the currency this supplier quotes in, so it is pre-selected next time
    if (sup.defaultCurrency !== data.currency) {
      await db.update(schema.suppliers).set({ defaultCurrency: data.currency }).where(eq(schema.suppliers.id, supplierId));
    }
  } else {
    const name = data.newSupplierName?.trim();
    if (!name) throw new UserError("Choose a supplier or type a new supplier name.");
    const [existing] = await db
      .select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(sql`lower(${schema.suppliers.name}) = lower(${name})`);
    supplierId =
      existing?.id ??
      (
        await db
          .insert(schema.suppliers)
          .values({ name, type: data.newSupplierType, defaultCurrency: data.currency })
          .returning({ id: schema.suppliers.id })
      )[0].id;
  }

  const matched = await attachMatches(drafts);
  const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();
  const [pl] = await db
    .insert(schema.priceLists)
    .values({
      supplierId,
      rawText: [`Excel: ${data.fileName}`, ...drafts.map((d) => d.rawText)].join("\n"),
      source: "excel",
      sourceName: data.fileName,
      receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
      status: "review",
      drafts: matched,
      model: "Excel import (rules)",
      parseMs: Date.now() - started,
      progressDone: drafts.length,
      progressTotal: drafts.length,
      createdBy: user.id,
    })
    .returning({ id: schema.priceLists.id });

  revalidatePath("/procurement/price-lists");
  revalidatePath("/procurement/suppliers");
  return { id: pl.id, rows: drafts.length };
}
