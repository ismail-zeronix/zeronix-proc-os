/**
 * Order-to-cash rules in one place (pure, no database): document numbers, credit terms, due dates, what an invoice's
 * status is today, and how old an unpaid amount is. Shared by the pages, the server actions and the tests.
 */
import { addDays, round2 } from "@/lib/quotation";

/** ZSO-2026-0001 style numbers for documents numbered per year inside the portal. */
export function yearNumber(prefix: "ZSO" | "ZDN" | "ZCN" | "ZRV", year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/** Invoice numbers follow the Admin series so they can continue the numbers used before (e.g. INV-000124). */
export function invoiceNumber(prefix: string, n: number, digits: number): string {
  return `${prefix}${String(n).padStart(Math.max(1, Math.min(10, digits)), "0")}`;
}

/** Credit terms offered on an order. 0 = cash or payment on delivery. */
export const TERMS_OPTIONS = [0, 7, 15, 30, 45, 60] as const;

export function termsLabel(days: number): string {
  return days === 0 ? "Cash / on delivery" : `${days} days credit`;
}

/** Payment is due this many days after the invoice date. */
export function dueDateFor(issueDate: string, termsDays: number): string {
  return addDays(issueDate, termsDays);
}

/** Whole days from one YYYY-MM-DD day to another (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400_000);
}

export const PAYMENT_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "bank", label: "Bank transfer" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["key"];
export const methodLabel = (k: string) => PAYMENT_METHODS.find((m) => m.key === k)?.label ?? k;

export type InvoiceStateKey = "paid" | "part" | "unpaid" | "overdue" | "cancelled";

export interface InvoiceState {
  key: InvoiceStateKey;
  label: string;
  paid: number;
  balance: number;
  /** Days past the due date (0 when not overdue). */
  daysOverdue: number;
  /** Days left until the due date (negative when overdue). */
  daysToDue: number;
}

/**
 * Where an invoice stands today. Overdue = something is still owed and the due date has passed (a part-paid invoice can
 * be overdue too: the label says both).
 */
export function invoiceState(inv: { status: string; total: number; dueDate: string }, paid: number, today: string): InvoiceState {
  const p = round2(paid);
  const balance = inv.status === "cancelled" ? 0 : round2(Math.max(0, inv.total - p));
  const daysToDue = daysBetween(today, inv.dueDate);
  const base = { paid: p, balance, daysOverdue: 0, daysToDue };
  if (inv.status === "cancelled") return { ...base, key: "cancelled", label: "Cancelled" };
  if (balance <= 0) return { ...base, key: "paid", label: "Paid" };
  if (daysToDue < 0) {
    const d = -daysToDue;
    return { ...base, key: "overdue", daysOverdue: d, label: `${p > 0 ? "Part paid, overdue" : "Overdue"} ${d} day${d === 1 ? "" : "s"}` };
  }
  if (p > 0) return { ...base, key: "part", label: "Part paid" };
  return { ...base, key: "unpaid", label: daysToDue === 0 ? "Due today" : `Due in ${daysToDue} day${daysToDue === 1 ? "" : "s"}` };
}

export const AGE_BUCKETS = [
  { key: "current", label: "Not due yet" },
  { key: "d30", label: "1-30 days late" },
  { key: "d60", label: "31-60 days late" },
  { key: "d90", label: "61-90 days late" },
  { key: "d90plus", label: "Over 90 days late" },
] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number]["key"];

export function ageBucket(daysOverdue: number): AgeBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  if (daysOverdue <= 90) return "d90";
  return "d90plus";
}

/** A payment must be positive and cannot be more than what is still owed. */
export function checkPaymentAmount(amount: number, balance: number): string | null {
  if (!(amount > 0)) return "Enter an amount above zero.";
  if (round2(amount) > round2(balance)) return `That is more than the AED ${balance.toLocaleString("en-US", { maximumFractionDigits: 2 })} still owed.`;
  return null;
}

export const ORDER_STATUSES = [
  { key: "open", label: "Confirmed", hint: "Ordered by the customer, not delivered yet" },
  { key: "delivered", label: "Delivered", hint: "Goods handed over, invoice next" },
  { key: "invoiced", label: "Invoiced", hint: "Tax invoice issued" },
  { key: "cancelled", label: "Cancelled", hint: "Will not go ahead" },
] as const;
export const orderStatusLabel = (k: string) => ORDER_STATUSES.find((s) => s.key === k)?.label ?? k;

/** One line of a statement of account, in date order, with the running balance. */
export interface StatementLine {
  date: string;
  kind: "invoice" | "payment" | "credit";
  number: string;
  /** What it adds to (invoice) or takes off (payment, credit note) the balance. */
  debit: number;
  credit: number;
  balance: number;
  note?: string;
}

/** Puts invoices, credit notes and payments in date order and keeps the running balance. */
export function buildStatement(
  entries: { date: string; kind: StatementLine["kind"]; number: string; amount: number; note?: string }[],
  opening = 0,
): { lines: StatementLine[]; closing: number } {
  const order = { invoice: 0, credit: 1, payment: 2 } as const;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || a.number.localeCompare(b.number));
  let bal = round2(opening);
  const lines = sorted.map((e) => {
    const debit = e.kind === "invoice" ? round2(e.amount) : 0;
    const credit = e.kind === "invoice" ? 0 : round2(e.amount);
    bal = round2(bal + debit - credit);
    return { date: e.date, kind: e.kind, number: e.number, debit, credit, balance: bal, note: e.note };
  });
  return { lines, closing: bal };
}
