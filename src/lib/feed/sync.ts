import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OfferDraft } from "@/lib/llm/schema";
import { parseStockSheet } from "@/lib/parse/stocksheet";
import { searchNormFor, upsertProductFor } from "@/lib/products";
import { readFeed } from "./fetch";

/** Marks an offer written because the product vanished from the supplier's sheet (sold out). */
export const REMOVED_NOTE = "Out of stock · removed from feed";

export type FeedStatus = "unchanged" | "updated" | "error";
export interface SyncResult {
  status: FeedStatus;
  message: string;
  priceListId?: number;
}

const hashOf = (csv: string) => createHash("sha256").update(csv.replace(/\r\n?/g, "\n").trim()).digest("hex");

/**
 * The sheet was read again and is identical, so its prices are still current: move the latest snapshot's
 * date forward so it is not shown as old. Skipped when a newer list from this supplier exists.
 */
async function touchLatest(supplierId: number, listId: number | null, at: Date) {
  if (!listId) return;
  const [last] = await db.select({ receivedAt: schema.priceLists.receivedAt }).from(schema.priceLists).where(eq(schema.priceLists.id, listId));
  if (!last) return;
  const [newer] = await db
    .select({ id: schema.priceLists.id })
    .from(schema.priceLists)
    .where(and(eq(schema.priceLists.supplierId, supplierId), gt(schema.priceLists.receivedAt, last.receivedAt)))
    .limit(1);
  if (newer) return;
  await db.update(schema.priceLists).set({ receivedAt: at }).where(eq(schema.priceLists.id, listId));
  await db.update(schema.offers).set({ receivedAt: at }).where(eq(schema.offers.priceListId, listId));
}

async function record(feedId: number, patch: Partial<typeof schema.supplierFeeds.$inferInsert>) {
  await db.update(schema.supplierFeeds).set(patch).where(eq(schema.supplierFeeds.id, feedId));
}

/**
 * Reads the supplier's sheet and, if it changed since the last read, saves it as a new price list
 * (no review step: the sheet is read by rules and is the supplier's own live data). Products that
 * disappeared from the sheet are written as "out of stock" so they stop winning on price.
 */
export async function syncFeed(supplierId: number, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const [feed] = await db.select().from(schema.supplierFeeds).where(eq(schema.supplierFeeds.supplierId, supplierId));
  if (!feed) throw new Error("This supplier has no live feed.");
  const checkedAt = new Date();

  try {
    const { csvUrl, text } = await readFeed(feed.url, feed.resolvedUrl);
    const hash = hashOf(text);
    if (hash === feed.lastHash && !opts.force) {
      await touchLatest(supplierId, feed.lastPriceListId, checkedAt);
      await record(feed.id, {
        resolvedUrl: csvUrl,
        lastCheckedAt: checkedAt,
        lastStatus: "unchanged",
        lastMessage: "No change since the last check.",
      });
      return { status: "unchanged", message: "No change since the last check." };
    }

    const parsed = parseStockSheet(text, { currency: feed.currency });
    if (!parsed.drafts.length) throw new Error("The sheet has no products I can read, so nothing was changed.");

    const previous = feed.lastPriceListId
      ? await db.select().from(schema.offers).where(eq(schema.offers.priceListId, feed.lastPriceListId))
      : [];
    const previousLive = previous.filter((o) => o.stockNote !== REMOVED_NOTE);
    // a sheet that suddenly shrinks to a sliver was most likely cleared or half-edited: keep the old data
    if (previousLive.length >= 10 && parsed.drafts.length < previousLive.length * 0.3 && !opts.force) {
      throw new Error(
        `The sheet now has ${parsed.drafts.length} products, down from ${previousLive.length}. Not applied; use "Sync now" if that is right.`,
      );
    }

    const [supplier] = await db.select({ name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
    const prevPrice = new Map(previousLive.map((o) => [o.productId, o.price]));
    let newProducts = 0;
    let priceChanges = 0;
    let removed = 0;

    const listId = await db.transaction(async (tx) => {
      const [pl] = await tx
        .insert(schema.priceLists)
        .values({
          supplierId,
          rawText: text.slice(0, 200_000),
          source: "feed",
          sourceName: feed.url,
          receivedAt: checkedAt,
          status: "saved",
          savedAt: checkedAt,
          model: "Live feed (rules)",
          progressDone: parsed.drafts.length,
          progressTotal: parsed.drafts.length,
          drafts: [],
        })
        .returning({ id: schema.priceLists.id });

      // one offer per product; if two rows resolve to the same product keep the cheaper
      const byProduct = new Map<number, OfferDraft>();
      for (const d of parsed.drafts) {
        const productId = await upsertProductFor(d, tx);
        const kept = byProduct.get(productId);
        if (!kept || (d.price != null && (kept.price == null || d.price < kept.price))) byProduct.set(productId, { ...d, productId });
      }

      for (const [productId, d] of byProduct) {
        await tx.insert(schema.offers).values({
          priceListId: pl.id,
          supplierId,
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
          currency: d.currency,
          priceBasis: d.priceBasis,
          stockNote: d.stockNote,
          rawText: d.rawText,
          confidence: d.confidence,
          searchNorm: searchNormFor(d, supplier?.name ?? ""),
          receivedAt: checkedAt,
        });
        if (!prevPrice.has(productId)) newProducts++;
        else if (prevPrice.get(productId) !== d.price) priceChanges++;
      }

      for (const o of previousLive) {
        if (byProduct.has(o.productId)) continue;
        removed++;
        await tx.insert(schema.offers).values({
          priceListId: pl.id,
          supplierId,
          productId: o.productId,
          category: o.category,
          brand: o.brand,
          modelName: o.modelName,
          partNumber: o.partNumber,
          cpu: o.cpu,
          ramGb: o.ramGb,
          storage: o.storage,
          display: o.display,
          gpu: o.gpu,
          os: o.os,
          extras: o.extras,
          condition: o.condition,
          price: null,
          currency: o.currency,
          priceBasis: o.priceBasis,
          stockNote: REMOVED_NOTE,
          rawText: `Removed from the live feed (was ${o.price ?? "no price"} ${o.currency})`,
          confidence: 1,
          searchNorm: o.searchNorm,
          receivedAt: checkedAt,
        });
      }

      await tx
        .update(schema.priceLists)
        .set({ drafts: [...byProduct.values()] })
        .where(eq(schema.priceLists.id, pl.id));
      return { id: pl.id, products: byProduct.size };
    });

    const bits = [
      `${listId.products} products`,
      priceChanges ? `${priceChanges} price change${priceChanges === 1 ? "" : "s"}` : "",
      newProducts && previousLive.length ? `${newProducts} new` : "",
      removed ? `${removed} removed` : "",
      ...parsed.warnings,
    ].filter(Boolean);
    const message = bits.join(" · ");
    await record(feed.id, {
      resolvedUrl: csvUrl,
      lastCheckedAt: checkedAt,
      lastChangedAt: checkedAt,
      lastHash: hash,
      lastRows: listId.products,
      lastStatus: "updated",
      lastMessage: message,
      lastPriceListId: listId.id,
    });
    return { status: "updated", message, priceListId: listId.id };
  } catch (e) {
    const message = (e as Error).message.slice(0, 400);
    await record(feed.id, { lastCheckedAt: checkedAt, lastStatus: "error", lastMessage: message });
    return { status: "error", message };
  }
}
