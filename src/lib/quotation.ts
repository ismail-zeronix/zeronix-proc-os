/** Quote rules in one place (pure, no database): numbers, prices, totals, statuses and the WhatsApp text. */
import { fromMinor, pctOf, toMinor } from "@/lib/money";

export const QUOTE_STATUSES = [
  { key: "draft", label: "Draft", hint: "Made, not yet sent to the customer" },
  { key: "sent", label: "Sent", hint: "Waiting for their answer" },
  { key: "accepted", label: "Accepted", hint: "The customer said yes" },
  { key: "rejected", label: "Rejected", hint: "The customer said no" },
  { key: "expired", label: "Expired", hint: "Passed its valid-until date" },
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]["key"];

export const isQuoteStatus = (k: string): k is QuoteStatus => QUOTE_STATUSES.some((s) => s.key === k);
export const quoteStatusLabel = (k: string) => QUOTE_STATUSES.find((s) => s.key === k)?.label ?? k;

/** UAE standard VAT, used when nothing else is saved in Admin. */
export const DEFAULT_VAT_PCT = 5;
export const DEFAULT_MARGIN_PCT = 10;
export const DEFAULT_VALID_DAYS = 7;
export const DEFAULT_TERMS = [
  "Prices are in UAE dirhams (AED) and exclude VAT unless shown.",
  "Subject to stock availability at the time of order.",
  "Payment: as agreed on the confirmed order.",
].join("\n");

/**
 * To the fil, half away from zero, through the same minor-unit rounding the ledger and VAT use (lib/money.ts), so a
 * figure rounds the same everywhere: 2.135 → 2.14 (plain float maths gave 2.13 here and 2.14 in the ledger).
 */
export const round2 = (n: number) => (Number.isFinite(n) ? fromMinor(toMinor(n)) : n);

/** ZQ-2026-0001 */
export function quoteNumber(year: number, seq: number): string {
  return `ZQ-${year}-${String(seq).padStart(4, "0")}`;
}

/** Selling price per unit for a cost and a margin added on top of it, rounded to a whole dirham. */
export function sellPrice(cost: number, marginPct: number): number {
  return Math.round(cost * (1 + marginPct / 100));
}

/** The margin (added on top of cost) that a selling price gives, to one decimal. Null when there is no cost to compare with. */
export function marginOf(cost: number | null | undefined, price: number): number | null {
  if (cost == null || cost <= 0) return null;
  return Math.round(((price - cost) / cost) * 1000) / 10;
}

export interface Line {
  qty: number;
  unitPrice: number;
  /** Our cost per unit, when known. */
  cost?: number | null;
}

export const lineTotal = (l: Pick<Line, "qty" | "unitPrice">) => round2(l.qty * l.unitPrice);

export interface Totals {
  subtotal: number;
  vat: number;
  total: number;
  /** Cost of the lines that have one, and the subtotal of those same lines: profit = sold - cost. */
  cost: number | null;
  soldWithCost: number;
  profit: number | null;
  /** Lines without a cost (profit covers only the others). */
  unpriced: number;
}

export function totals(lines: Line[], vatPct: number): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  // the same VAT rule as invoices (lib/tax/doc-tax.ts): the rate on the subtotal in fils, half away from zero
  const vat = fromMinor(pctOf(toMinor(subtotal), vatPct));
  const withCost = lines.filter((l) => l.cost != null);
  const cost = withCost.length ? round2(withCost.reduce((s, l) => s + l.qty * (l.cost as number), 0)) : null;
  const soldWithCost = round2(withCost.reduce((s, l) => s + lineTotal(l), 0));
  return {
    subtotal,
    vat,
    total: round2(subtotal + vat),
    cost,
    soldWithCost,
    profit: cost == null ? null : round2(soldWithCost - cost),
    unpriced: lines.length - withCost.length,
  };
}

/** The cost columns a quote (and the order made from it) saves, so its profit can be worked out honestly later. */
export function costFields(t: Totals) {
  return { costTotal: t.cost, soldWithCost: t.cost == null ? null : t.soldWithCost, uncostedLines: t.unpriced };
}

export interface Profit {
  /** Sale minus cost of the lines that have a cost; null when no line has one. */
  profit: number | null;
  /** What those lines sell for. */
  soldWithCost: number;
  /** Some lines have no cost, so the profit covers only part of the sale. */
  partial: boolean;
  uncostedLines: number;
}

/**
 * Profit of a quote or order from its saved columns. Never subtotal - cost: a AED 10,000 quote with one AED 6,000 line
 * costing 5,000 and one AED 4,000 line with no cost made AED 1,000 on what we know, not 5,000.
 */
export function profitOf(r: { subtotal: number; costTotal: number | null; soldWithCost?: number | null; uncostedLines?: number | null }): Profit {
  const uncostedLines = r.uncostedLines ?? 0;
  if (r.costTotal == null) return { profit: null, soldWithCost: 0, partial: false, uncostedLines };
  const soldWithCost = r.soldWithCost ?? r.subtotal;
  return { profit: round2(soldWithCost - r.costTotal), soldWithCost, partial: uncostedLines > 0, uncostedLines };
}

/** "valid until" day a number of days after a YYYY-MM-DD day. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + days * 86400_000).toISOString().slice(0, 10);
}

/** A sent quote past its date counts as expired (the stored status stays "sent" until someone acts). */
export function effectiveStatus(status: string, validUntil: string, today: string): string {
  return status === "sent" && validUntil < today ? "expired" : status;
}

// whole dirhams stay short (AED 4,525); anything with fils always shows two decimals (AED 6,701.10, not 6,701.1)
const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const money = (n: number) => `AED ${num(n)}`;

function longDay(day: string): string {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export { longDay };

export interface QuoteDoc {
  number: string;
  company: string;
  contact: string;
  validUntil: string;
  vatPct: number;
  items: { description: string; qty: number; unitPrice: number; section?: string; unit?: string }[];
  subtotal: number;
  vatAmount: number;
  total: number;
  preparedBy: string;
  brand: string;
}

/** Plain text for WhatsApp or an email body. */
export function quoteWhatsApp(q: QuoteDoc): string {
  const lines = [`*Quotation ${q.number}* - ${q.brand}`, `For: ${q.company}${q.contact ? ` (${q.contact})` : ""}`, ""];
  q.items.forEach((i, n) => {
    // project quotes: a heading each time the BOQ section changes
    if (i.section && i.section !== q.items[n - 1]?.section) lines.push(`*${i.section}*`);
    lines.push(`${n + 1}. ${i.description}`);
    lines.push(`   ${i.qty}${i.unit ? ` ${i.unit}` : ""} x ${money(i.unitPrice)} = ${money(lineTotal(i))}`);
  });
  lines.push("");
  lines.push(`Subtotal: ${money(q.subtotal)}`);
  lines.push(q.vatPct > 0 ? `VAT ${num(q.vatPct)}%: ${money(q.vatAmount)}` : "VAT 0% (zero-rated)");
  lines.push(`*Total: ${money(q.total)}*`);
  lines.push("");
  lines.push(`Valid until ${longDay(q.validUntil)}. Subject to stock.`);
  if (q.preparedBy) lines.push(`Prepared by ${q.preparedBy}`);
  return lines.join("\n");
}
