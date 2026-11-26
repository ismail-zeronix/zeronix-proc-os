import "server-only";
import { db, schema } from "@/db";
import type { OfferDraft } from "@/lib/offer-draft";
import { searchNormFor, upsertProductFor } from "@/lib/products";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Saves checked lines as offers on a price list: each line is matched to its product (or a new product is made, and a
 * merge chosen in review is remembered as an alias). Used by the review screen and by Claude's WhatsApp pushes.
 * Returns the product id of each line, in order.
 */
export async function insertOffers(
  tx: Tx,
  list: { priceListId: number; supplierId: number; supplierName: string; receivedAt: Date },
  drafts: OfferDraft[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const d of drafts) {
    const productId = await upsertProductFor(d, tx);
    ids.push(productId);
    await tx.insert(schema.offers).values({
      priceListId: list.priceListId,
      supplierId: list.supplierId,
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
      searchNorm: searchNormFor(d, list.supplierName),
      receivedAt: list.receivedAt,
    });
  }
  return ids;
}
