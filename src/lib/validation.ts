/**
 * Shared input rules for server actions (pure, no database). One place for what a day, an amount and a quantity are, so
 * every form checks them the same way.
 */
import { z } from "zod";
import { round2 } from "@/lib/quotation";

/** True for a real calendar day written YYYY-MM-DD: "2026-02-31" and "2026-13-01" are not. */
export function isDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A YYYY-MM-DD day that exists in the calendar. */
export const dayString = (message = "Pick a valid date") => z.string().refine(isDay, message);

/**
 * An amount in AED, kept to the fil. What the action totals, what it saves and what the document prints are then the same
 * number: 100 × 10.555 can no longer be saved as 1,055.50 and printed as 100 × 10.56 = 1,056.00.
 */
export const toFils = (n: number) => round2(n);

/** A quantity on an invoice, bill or note: numeric(12,2) in the database, so it is kept to two decimals here too. */
export const toQty2 = (n: number) => round2(n);
