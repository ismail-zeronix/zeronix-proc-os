import { preclean } from "./preclean";

export interface Block {
  index: number;
  text: string;
  /** Category hint from the nearest heading above, e.g. "Desktops". */
  section: string | null;
}

export interface Batch {
  blocks: Block[];
}

const MAX_BLOCK_LINES = 10;
const MAX_BLOCK_CHARS = 600;
const MAX_BATCH_BLOCKS = 8;
const MAX_BATCH_CHARS = 1600;

/** A price somewhere on the line: "@2850/-", "AED 1,500", "1500/-", "Price: 2,100", "$450". */
export const PRICE_LINE_RE =
  /(@\s*\d|\d[\d,]*(?:\.\d+)?\s*\/-|\b(?:aed|usd|dhs?|price|rate)\b\s*[:\-]?\s*\d|\$\s*\d|\d\s*(?:aed|usd|dhs?)\b)/i;

const SECTION_WORDS =
  /(laptop|notebook|desktop|workstation|all[- ]?in[- ]?one|aio|monitor|accessor|printer|network|storage|component|server|tablet|gaming)/i;

function isHeading(lines: string[]): boolean {
  if (lines.length !== 1) return false;
  const l = lines[0];
  if (l.length > 60) return false;
  if (PRICE_LINE_RE.test(l)) return false;
  // a heading has no spec-like digits (dates such as "19th Oct" are fine)
  const digits = l.replace(/\b\d{1,2}(st|nd|rd|th)\b/gi, "").match(/\d/g);
  return !digits;
}

/** Splits an oversized block (a supplier that never uses blank lines) after price lines. */
function splitOversized(lines: string[]): string[][] {
  if (lines.length <= MAX_BLOCK_LINES && lines.join("\n").length <= MAX_BLOCK_CHARS) {
    return [lines];
  }
  const parts: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    cur.push(line);
    const big = cur.length >= MAX_BLOCK_LINES || cur.join("\n").length >= MAX_BLOCK_CHARS;
    if (PRICE_LINE_RE.test(line) && (cur.length >= 2 || big)) {
      parts.push(cur);
      cur = [];
    } else if (cur.length >= MAX_BLOCK_LINES * 2) {
      // no price lines at all: hard split
      parts.push(cur);
      cur = [];
    }
  }
  if (cur.length) parts.push(cur);
  return parts;
}

export function toBlocks(raw: string): Block[] {
  const text = preclean(raw);
  const groups = text.split(/\n\s*\n/).map((g) => g.split("\n").filter(Boolean));
  const blocks: Block[] = [];
  let section: string | null = null;
  for (const g of groups) {
    if (!g.length) continue;
    if (isHeading(g)) {
      if (SECTION_WORDS.test(g[0]) && !/offer|deal|brand new|stock/i.test(g[0])) {
        section = g[0];
      }
      continue;
    }
    for (const part of splitOversized(g)) {
      blocks.push({ index: blocks.length, text: part.join("\n"), section });
    }
  }
  return blocks;
}

export function toBatches(blocks: Block[]): Batch[] {
  const batches: Batch[] = [];
  let cur: Block[] = [];
  let chars = 0;
  for (const b of blocks) {
    if (cur.length && (cur.length >= MAX_BATCH_BLOCKS || chars + b.text.length > MAX_BATCH_CHARS)) {
      batches.push({ blocks: cur });
      cur = [];
      chars = 0;
    }
    cur.push(b);
    chars += b.text.length;
  }
  if (cur.length) batches.push({ blocks: cur });
  return batches;
}
