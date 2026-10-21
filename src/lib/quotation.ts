/** Quote rules in one place (pure, no database): numbers, prices, totals, statuses and the WhatsApp text. */

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

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
  const vat = round2((subtotal * vatPct) / 100);
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

/** "valid until" day a number of days after a YYYY-MM-DD day. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + days * 86400_000).toISOString().slice(0, 10);
}

/** A sent quote past its date counts as expired (the stored status stays "sent" until someone acts). */
export function effectiveStatus(status: string, validUntil: string, today: string): string {
  return status === "sent" && validUntil < today ? "expired" : status;
}

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
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
  items: { description: string; qty: number; unitPrice: number }[];
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
    lines.push(`${n + 1}. ${i.description}`);
    lines.push(`   ${i.qty} x ${money(i.unitPrice)} = ${money(lineTotal(i))}`);
  });
  lines.push("");
  lines.push(`Subtotal: ${money(q.subtotal)}`);
  if (q.vatPct > 0) lines.push(`VAT ${num(q.vatPct)}%: ${money(q.vatAmount)}`);
  lines.push(`*Total: ${money(q.total)}*`);
  lines.push("");
  lines.push(`Valid until ${longDay(q.validUntil)}. Subject to stock.`);
  if (q.preparedBy) lines.push(`Prepared by ${q.preparedBy}`);
  return lines.join("\n");
}
