import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLlm } from "@/lib/llm";
import type { OfferDraft } from "@/lib/llm/schema";
import { blockCacheKey, parsePriceList } from "@/lib/parse/pipeline";
import { attachMatches } from "@/lib/products";
import { getSetting } from "@/lib/settings";

/** Thrown inside a running parse when an admin pressed Stop: the list goes back to the queue, not to "failed". */
export class StopRequested extends Error {
  constructor() {
    super("Stopped by an admin");
  }
}

/** Reads one queued price list with the local model. Called by the AI scheduler, never directly on paste. */
export async function runParse(priceListId: number) {
  const [pl] = await db.select().from(schema.priceLists).where(eq(schema.priceLists.id, priceListId));
  if (!pl || pl.status === "saved") return;

  const model = await getSetting("llm_model");
  const llm = getLlm(model);
  const fewShots = (
    await db
      .select()
      .from(schema.parseCorrections)
      .where(eq(schema.parseCorrections.supplierId, pl.supplierId))
      .orderBy(desc(schema.parseCorrections.createdAt))
      .limit(2)
  ).map((c) => ({ input: c.input, output: c.output }));

  // rows a person already reviewed on this supplier's earlier lists, newest list wins
  const known = new Map<string, OfferDraft[]>();
  const earlier = await db
    .select({ drafts: schema.priceLists.drafts })
    .from(schema.priceLists)
    .where(and(eq(schema.priceLists.supplierId, pl.supplierId), eq(schema.priceLists.status, "saved")))
    .orderBy(desc(schema.priceLists.receivedAt))
    .limit(10);
  for (const row of earlier) {
    const byBlock = new Map<string, OfferDraft[]>();
    for (const d of row.drafts ?? []) {
      const k = blockCacheKey(d.rawText);
      byBlock.set(k, [...(byBlock.get(k) ?? []), d]);
    }
    for (const [k, v] of byBlock) if (!known.has(k)) known.set(k, v);
  }

  const started = Date.now();
  await db
    .update(schema.priceLists)
    .set({ status: "parsing", error: null, model, progressDone: 0, reusedBlocks: 0 })
    .where(eq(schema.priceLists.id, priceListId));

  try {
    const drafts = await parsePriceList(pl.rawText, {
      llm,
      fewShots,
      known,
      onReused: async (n) => {
        await db.update(schema.priceLists).set({ reusedBlocks: n }).where(eq(schema.priceLists.id, priceListId));
      },
      onProgress: async ({ done, total }) => {
        const stopAt = Date.parse(await getSetting("ai_stop_at"));
        if (stopAt > started) throw new StopRequested();
        await db
          .update(schema.priceLists)
          .set({ progressDone: done, progressTotal: total })
          .where(eq(schema.priceLists.id, priceListId));
      },
    });
    const matched = await attachMatches(drafts);
    await db
      .update(schema.priceLists)
      .set({ status: "review", drafts: matched, parseMs: Date.now() - started })
      .where(eq(schema.priceLists.id, priceListId));
  } catch (e) {
    if (e instanceof StopRequested) {
      await db
        .update(schema.priceLists)
        .set({ status: "queued", error: null, progressDone: 0, reusedBlocks: 0 })
        .where(eq(schema.priceLists.id, priceListId));
      throw e;
    }
    await db
      .update(schema.priceLists)
      .set({ status: "failed", error: (e as Error).message.slice(0, 500), parseMs: Date.now() - started })
      .where(eq(schema.priceLists.id, priceListId));
    throw e;
  }
}
