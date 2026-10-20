"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { CURRENCIES } from "@/lib/fx";
import { CATEGORIES, offerDraftSchema, type OfferDraft } from "@/lib/llm/schema";
import { attachMatches } from "@/lib/products";
import { SUPPLIER_TYPE_KEYS, supplierType } from "@/lib/supplier-types";
import { searchNormFor, upsertProductFor } from "@/lib/products";
import { getSetting } from "@/lib/settings";

const createSchema = z.object({
  supplierId: z.coerce.number().int().positive().optional(),
  newSupplierName: z.string().trim().max(120).optional(),
  newSupplierType: z.enum(SUPPLIER_TYPE_KEYS).optional(),
  receivedAt: z.string().optional(),
  rawText: z.string().trim().min(10, "Paste the supplier message first.").max(100_000),
});

export async function createPriceList(input: z.input<typeof createSchema>) {
  const user = await assertApp("procurement");
  const data = createSchema.parse(input);

  let supplierId = data.supplierId;
  if (!supplierId) {
    const name = data.newSupplierName?.trim();
    if (!name) throw new Error("Choose a supplier or type a new supplier name.");
    const [existing] = await db
      .select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(sql`lower(${schema.suppliers.name}) = lower(${name})`);
    supplierId =
      existing?.id ??
      (
        await db
          .insert(schema.suppliers)
          .values({
            name,
            type: data.newSupplierType ?? "other",
            defaultCurrency: supplierType(data.newSupplierType).currency,
          })
          .returning({ id: schema.suppliers.id })
      )[0].id;
  }

  const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();
  const [pl] = await db
    .insert(schema.priceLists)
    .values({
      supplierId,
      rawText: data.rawText,
      receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
      createdBy: user.id,
      status: "queued",
    })
    .returning({ id: schema.priceLists.id });

  revalidatePath("/procurement/price-lists");
  // the list waits in the queue until an admin has started AI reading (Admin page)
  return { id: pl.id, aiRunning: (await getSetting("ai_running")) === "true" };
}

export async function reparsePriceList(id: number) {
  await assertApp("procurement");
  await db
    .update(schema.priceLists)
    .set({ status: "queued", error: null, progressDone: 0, drafts: null })
    .where(and(eq(schema.priceLists.id, id), ne(schema.priceLists.status, "saved")));
  revalidatePath("/procurement/price-lists");
}

export async function deletePriceList(id: number) {
  const user = await assertApp("procurement");
  const [pl] = await db.select().from(schema.priceLists).where(eq(schema.priceLists.id, id));
  if (!pl) return;
  if (pl.status === "saved" && user.role !== "admin") throw new Error("Only an admin can delete a saved price list.");
  await db.delete(schema.priceLists).where(eq(schema.priceLists.id, id));
  revalidatePath("/procurement/price-lists");
  revalidatePath("/procurement/compare");
}

const EDITABLE: (keyof OfferDraft)[] = [
  "category", "brand", "modelName", "partNumber", "cpu", "ramGb", "storage", "display", "gpu", "os", "extras", "price",
];

function toFewShotItem(d: OfferDraft) {
  return {
    block: 0, category: d.category, brand: d.brand, model_name: d.modelName, part_number: d.partNumber,
    cpu: d.cpu, ram: d.ramGb ? `${d.ramGb}GB` : "", storage: d.storage, display: d.display, gpu: d.gpu,
    os: d.os, extras: d.extras, price: d.price,
  };
}

/** Blocks the user corrected become few-shot examples for this supplier's next paste. */
function corrections(original: OfferDraft[], edited: OfferDraft[]) {
  const byKey = new Map(original.map((d) => [d.key, d]));
  const changedBlocks = new Set<string>();
  for (const d of edited) {
    const o = byKey.get(d.key);
    if (!o) continue;
    if (!d.include || EDITABLE.some((f) => JSON.stringify(o[f]) !== JSON.stringify(d[f]))) changedBlocks.add(d.rawText);
  }
  return [...changedBlocks]
    .filter((raw) => raw.length > 0 && raw.length < 800)
    .slice(0, 3)
    .map((raw) => ({
      input: `[#0]\n${raw}`,
      output: JSON.stringify({ items: edited.filter((d) => d.include && d.rawText === raw).map(toFewShotItem) }),
    }));
}

export async function savePriceList(id: number, draftsInput: OfferDraft[]) {
  await assertApp("procurement");
  const drafts = z.array(offerDraftSchema).parse(draftsInput);
  const [pl] = await db
    .select({ pl: schema.priceLists, supplierName: schema.suppliers.name })
    .from(schema.priceLists)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.priceLists.supplierId))
    .where(eq(schema.priceLists.id, id));
  if (!pl) throw new Error("Price list not found");
  if (pl.pl.status === "saved") throw new Error("This price list is already saved.");

  const included = drafts.filter((d) => d.include);
  const fewShots = corrections(pl.pl.drafts ?? [], drafts);

  await db.transaction(async (tx) => {
    for (const d of included) {
      const productId = await upsertProductFor(d, tx);
      await tx.insert(schema.offers).values({
        priceListId: id,
        supplierId: pl.pl.supplierId,
        productId,
        category: d.category,
        brand: d.brand,
        modelName: d.modelName,
        partNumber: d.partNumber,
        cpu: d.cpu,
        ramGb: d.ramGb,
        storage: d.storage,
        display: d.display,
        gpu: d.gpu,
        os: d.os,
        extras: d.extras,
        condition: d.condition,
        price: d.price,
        currency: d.currency || "AED",
        priceBasis: d.priceBasis,
        stockNote: d.stockNote,
        rawText: d.rawText,
        confidence: d.confidence,
        searchNorm: searchNormFor(d, pl.supplierName),
        receivedAt: pl.pl.receivedAt,
      });
    }
    if (fewShots.length) {
      await tx.insert(schema.parseCorrections).values(fewShots.map((f) => ({ supplierId: pl.pl.supplierId, ...f })));
    }
    await tx
      .update(schema.priceLists)
      .set({ status: "saved", savedAt: new Date(), drafts })
      .where(eq(schema.priceLists.id, id));
  });

  revalidatePath("/procurement/price-lists");
  revalidatePath("/procurement/compare");
  return { saved: included.length, learned: fewShots.length };
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
  const data = excelSchema.parse(input);
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
  if (!drafts.length) throw new Error("There are no rows to import in the chosen sheets.");
  if (drafts.length > MAX_EXCEL_ROWS) throw new Error(`That is more than ${MAX_EXCEL_ROWS} rows. Split the file.`);

  let supplierId = data.supplierId;
  if (supplierId) {
    const [sup] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
    if (!sup) throw new Error("Supplier not found.");
    // remember the currency this supplier quotes in, so it is pre-selected next time
    if (sup.defaultCurrency !== data.currency) {
      await db.update(schema.suppliers).set({ defaultCurrency: data.currency }).where(eq(schema.suppliers.id, supplierId));
    }
  } else {
    const name = data.newSupplierName?.trim();
    if (!name) throw new Error("Choose a supplier or type a new supplier name.");
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
