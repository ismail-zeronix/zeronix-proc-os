import { and, desc, eq } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { db, schema } from "@/db";
import { getLlm } from "@/lib/llm";
import type { OfferDraft } from "@/lib/llm/schema";
import { blockCacheKey, parsePriceList } from "@/lib/parse/pipeline";
import { attachMatches } from "@/lib/products";
import { getSetting } from "@/lib/settings";

export const PARSE_QUEUE = "parse-price-list";

interface ParseJob {
  priceListId: number;
}

const g = globalThis as unknown as { __boss?: Promise<PgBoss>; __workerStarted?: boolean };

export function getBoss(): Promise<PgBoss> {
  g.__boss ??= (async () => {
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
    boss.on("error", (e) => console.error("[pg-boss]", e));
    await boss.start();
    await boss.createQueue(PARSE_QUEUE, {
      retryLimit: 1,
      retryDelay: 10,
      // a long list on a CPU-only server can take several minutes
      expireInSeconds: 60 * 60,
    });
    return boss;
  })();
  return g.__boss;
}

export async function enqueueParse(priceListId: number) {
  const boss = await getBoss();
  await boss.send(PARSE_QUEUE, { priceListId } satisfies ParseJob);
}

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
    await db
      .update(schema.priceLists)
      .set({ status: "failed", error: (e as Error).message.slice(0, 500), parseMs: Date.now() - started })
      .where(eq(schema.priceLists.id, priceListId));
    throw e;
  }
}

export async function startWorker() {
  if (g.__workerStarted) return;
  g.__workerStarted = true;
  const boss = await getBoss();
  // one job at a time: the LLM is the bottleneck and parallel jobs would only multiply RAM use
  await boss.work<ParseJob>(PARSE_QUEUE, { batchSize: 1, pollingIntervalSeconds: 2 }, async ([job]) => {
    console.log(`[worker] parsing price list ${job.data.priceListId}`);
    await runParse(job.data.priceListId);
    console.log(`[worker] done ${job.data.priceListId}`);
  });
  console.log("[worker] listening on", PARSE_QUEUE);
}
