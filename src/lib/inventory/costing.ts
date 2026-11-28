/**
 * Weighted average cost, in saving order. Pure (no database), so every rule is easy to test; lib/inventory/engine.ts
 * keeps the state on the item row and writes one stock_moves row per change.
 *
 * Money is kept in fils (integers) so values never drift: taking the last unit out takes exactly what is left.
 * Selling more than is in stock leaves "uncosted" units: stock goes below zero with no value, and the next units that
 * come in give those sales their cost (settle). So while stock is below zero its value is zero, and the uncosted units
 * of an item always add up to how far below zero it is.
 */
import { fromMinor, toMinor } from "@/lib/money";

export const MOVE_KINDS = ["opening", "purchase", "sale", "sale_return", "purchase_return", "adjust_in", "adjust_out", "settle", "void"] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];

export const moveKindLabel: Record<MoveKind, string> = {
  opening: "Opening stock",
  purchase: "Bought",
  sale: "Sold",
  sale_return: "Returned by customer",
  purchase_return: "Returned to supplier",
  adjust_in: "Count: more",
  adjust_out: "Count: less / written off",
  settle: "Cost of earlier sale",
  void: "Voided",
};

/** An item's stock: units (may be below zero) and their value in AED. */
export interface StockState {
  qty: number;
  value: number;
}

const q2 = (n: number) => Math.round(n * 100) / 100;

/** Average cost per unit, or the last known one when nothing is in stock. */
export const avgCost = (s: StockState, last = 0) => (s.qty > 0 ? Math.round((s.value / s.qty) * 10000) / 10000 : last);

export interface Out {
  /** Units taken out that had a cost. */
  costed: number;
  /** Units sold beyond what was in stock: no cost yet. */
  uncosted: number;
  /** Value taken out of stock (positive). */
  value: number;
  next: StockState;
}

/** Takes `qty` units out at average cost. Beyond what is in stock they are uncosted (stock goes below zero, value 0). */
export function takeOut(s: StockState, qty: number): Out {
  if (!(qty > 0)) throw new Error("takeOut needs a quantity above zero");
  const available = Math.max(s.qty, 0);
  const costed = q2(Math.min(qty, available));
  const uncosted = q2(qty - costed);
  // the last units take exactly what is left, so no fils stay behind
  const value = costed <= 0 ? 0 : costed === q2(s.qty) ? s.value : fromMinor(Math.round((toMinor(s.value) * costed) / s.qty));
  return { costed, uncosted, value, next: { qty: q2(s.qty - qty), value: fromMinor(toMinor(s.value) - toMinor(value)) } };
}

export interface In {
  /** Units that only give earlier uncosted sales their cost (they never stay in stock). */
  settled: number;
  /** Their value: it goes to cost of goods sold, not into stock. */
  settledValue: number;
  next: StockState;
}

/**
 * Puts `qty` units worth `value` in. If stock is below zero, the first units cover the sales made without stock: their
 * share of the value goes to those sales (settledValue), the rest stays in stock.
 */
export function putIn(s: StockState, qty: number, value: number): In {
  if (!(qty > 0)) throw new Error("putIn needs a quantity above zero");
  if (value < 0) throw new Error("putIn needs a value of zero or more");
  const short = s.qty < 0 ? q2(-s.qty) : 0;
  const settled = q2(Math.min(short, qty));
  const settledValue = settled <= 0 ? 0 : settled === q2(qty) ? value : fromMinor(Math.round((toMinor(value) * settled) / qty));
  return { settled, settledValue, next: { qty: q2(s.qty + qty), value: fromMinor(toMinor(s.value) + toMinor(value) - toMinor(settledValue)) } };
}

/** How much of `value` belongs to `part` of `whole` units (fils rounding, the last part takes the rest). */
export function shareOf(value: number, part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  if (part >= whole) return value;
  return fromMinor(Math.round((toMinor(value) * part) / whole));
}

/** Splits `qty` uncosted units over sales oldest first: how many each one gets. */
export function settleOrder(qty: number, sales: readonly { id: number; uncosted: number }[]): { id: number; qty: number }[] {
  const out: { id: number; qty: number }[] = [];
  let left = q2(qty);
  for (const s of sales) {
    if (left <= 0) break;
    const take = q2(Math.min(left, s.uncosted));
    if (take > 0) out.push({ id: s.id, qty: take });
    left = q2(left - take);
  }
  return out;
}

/** Serials as they are matched: upper case, no spaces. */
export const serialNorm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

/** The serials typed on a line, cleaned: blanks dropped, duplicates refused. */
export function cleanSerials(list: readonly string[]): { serials: string[]; problem: string | null } {
  const serials = list.map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const s of serials) {
    const n = serialNorm(s);
    if (seen.has(n)) return { serials, problem: `Serial ${s} is entered twice.` };
    seen.add(n);
  }
  return { serials, problem: null };
}
