import { buildMessages, type FewShot } from "@/lib/llm/prompt";
import type { LlmProvider } from "@/lib/llm/provider";
import { completeItem, llmOutJsonSchema, llmOutLenientSchema, type LlmItem, type OfferDraft } from "@/lib/llm/schema";
import { toBatches, toBlocks, type Block } from "./chunk";
import { fallbackDraft, toDraft } from "./postfix";

export interface ParseProgress {
  done: number;
  total: number;
}

export interface ParseOptions {
  llm: LlmProvider;
  fewShots?: FewShot[];
  /**
   * Reviewed rows from this supplier's earlier lists, keyed by `blockCacheKey`. A block whose text
   * is identical needs no AI: the person already checked it. Suppliers re-post mostly the same list.
   */
  known?: Map<string, OfferDraft[]>;
  onProgress?: (p: ParseProgress) => void | Promise<void>;
  /** Called once with how many blocks were taken from `known`. */
  onReused?: (blocks: number) => void | Promise<void>;
}

/** Same text, ignoring case and spacing. */
export function blockCacheKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** A reviewed row copied onto a new list: new key, product match redone, nothing left to check. */
export function reuseDraft(d: OfferDraft, blockIndex: number, i: number): OfferDraft {
  return {
    ...d,
    key: `${blockIndex}-${i}-known`,
    flags: [],
    confidence: 1,
    productId: null,
    productLabel: "",
    suggestedProductId: null,
    suggestedLabel: "",
  };
}

async function extractBatch(llm: LlmProvider, blocks: Block[], fewShots: FewShot[]): Promise<LlmItem[]> {
  const messages = buildMessages({ blocks }, fewShots);
  const textOf = new Map(blocks.map((b) => [b.index, b.text]));
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = await llm.extractJson({
        messages,
        jsonSchema: llmOutJsonSchema,
        // ~120 output tokens per product; a block rarely holds more than 3. Stops runaway generations.
        maxTokens: 150 + blocks.length * 360,
      });
      return llmOutLenientSchema
        .parse(json)
        .items.map((it) => completeItem(it, textOf.get(it.block) ?? blocks[0].text));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Pre-clean -> blocks -> small batches -> LLM (one batch at a time to keep RAM flat)
 * -> validated, post-fixed drafts. A failed batch is retried block-by-block; a failed block
 * becomes a manual "fallback" row instead of disappearing.
 */
export async function parsePriceList(raw: string, opts: ParseOptions): Promise<OfferDraft[]> {
  const allBlocks = toBlocks(raw);
  const fewShots = opts.fewShots ?? [];
  const byIndex = new Map(allBlocks.map((b) => [b.index, b]));
  const drafts: OfferDraft[] = [];

  const fresh: Block[] = [];
  let reused = 0;
  for (const b of allBlocks) {
    const hit = opts.known?.get(blockCacheKey(b.text));
    if (hit?.length) {
      hit.forEach((d, i) => drafts.push(reuseDraft(d, b.index, i)));
      reused++;
    } else fresh.push(b);
  }
  await opts.onReused?.(reused);

  const blocks = fresh;
  const batches = toBatches(blocks);
  let done = 0;
  await opts.onProgress?.({ done, total: blocks.length });

  const emit = (items: Awaited<ReturnType<typeof extractBatch>>, allowed: Block[]) => {
    const allowedIdx = new Set(allowed.map((b) => b.index));
    const seen = new Set<number>();
    items.forEach((it, i) => {
      // Small models sometimes mis-number blocks; snap unknown numbers to the batch's blocks in order.
      const idx = allowedIdx.has(it.block) ? it.block : allowed[Math.min(i, allowed.length - 1)].index;
      seen.add(idx);
      drafts.push(toDraft(it, byIndex.get(idx), drafts.length));
    });
    return seen;
  };

  for (const batch of batches) {
    try {
      const items = await extractBatch(opts.llm, batch.blocks, fewShots);
      const seen = emit(items, batch.blocks);
      // Blocks with a price that produced no item are re-tried alone (cheap, catches skips).
      for (const b of batch.blocks) {
        if (seen.has(b.index) || !/\d/.test(b.text)) continue;
        try {
          emit(await extractBatch(opts.llm, [b], fewShots), [b]);
        } catch {
          /* model says not a product */
        }
      }
    } catch {
      for (const b of batch.blocks) {
        try {
          emit(await extractBatch(opts.llm, [b], fewShots), [b]);
        } catch (e) {
          drafts.push(fallbackDraft(b, (e as Error).message.slice(0, 80)));
        }
      }
    }
    done += batch.blocks.length;
    await opts.onProgress?.({ done, total: blocks.length });
  }
  // reused rows were added first: put every row back in the order the supplier wrote it
  const at = (d: OfferDraft) => parseInt(d.key, 10);
  return drafts
    .map((d, i) => [d, i] as const)
    .sort(([a, i], [b, j]) => (at(a) || 0) - (at(b) || 0) || i - j)
    .map(([d]) => d);
}
