/**
 * Money in minor units (fils, paise): whole numbers, so sums never drift the way floats do (0.1 + 0.2). The database
 * stores numeric(…,2); convert at the edges with toMinor / fromMinor and do all adding, splitting and tax inside.
 * Rounding is half away from zero, the same as round2 in lib/quotation.ts, so ledger amounts match the documents.
 */

/** 12.345 → 1235, "-1.005" → -101. Accepts the strings Postgres returns for numeric columns. */
export function toMinor(amount: number | string): number {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) throw new Error(`Not an amount: ${amount}`);
  const sign = n < 0 ? -1 : 1;
  // the tiny nudge lifts values like 1.005 (stored as 1.00499999…) to where people expect them
  return sign * Math.round(Math.abs(n) * 100 + 1e-7);
}

/** 1235 → 12.35 (and never -0, which would print as -0.00) */
export const fromMinor = (minor: number): number => {
  if (!Number.isInteger(minor)) throw new Error(`Minor units must be whole: ${minor}`);
  return minor / 100 || 0;
};

export const sumMinor = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0);

/** Percentage of an amount in minor units, rounded half away from zero: 5% of 1999 fils → 100. */
export function pctOf(minor: number, ratePct: number): number {
  const exact = (minor * ratePct) / 100;
  const sign = exact < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(exact) + 1e-9);
}

/**
 * Splits an amount over weights so the parts add up exactly (largest remainder). Used to spread a document-level
 * figure (VAT, a discount, a foreign-exchange difference) over its lines. All-zero weights split evenly.
 */
export function allocate(minor: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(minor)) throw new Error(`Minor units must be whole: ${minor}`);
  if (weights.length === 0) return [];
  const w = weights.some((x) => x !== 0) ? weights.map((x) => Math.abs(x)) : weights.map(() => 1);
  const total = sumMinor(w);
  const sign = minor < 0 ? -1 : 1;
  const abs = Math.abs(minor);
  const raw = w.map((x) => (abs * x) / total);
  const parts = raw.map(Math.floor);
  let left = abs - sumMinor(parts);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts.map((p) => p * sign);
}
