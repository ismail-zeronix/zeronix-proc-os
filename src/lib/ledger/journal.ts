/**
 * Journal rules with no database, shared by the server (postEntry) and the journal form in the browser.
 */
import { fromMinor, sumMinor, toMinor } from "@/lib/money";

export interface LineAmounts {
  debit?: number | null;
  credit?: number | null;
}

/** Why these lines cannot be posted, or null. Debits and credits must match to the fils. */
export function journalProblem(lines: readonly LineAmounts[]): string | null {
  if (lines.length < 2) return "A journal needs at least two lines.";
  for (const [i, l] of lines.entries()) {
    const d = l.debit ?? 0;
    const c = l.credit ?? 0;
    if (!Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0) return `Line ${i + 1}: amounts cannot be below zero.`;
    if ((toMinor(d) > 0) === (toMinor(c) > 0)) return `Line ${i + 1}: enter either a debit or a credit.`;
  }
  const { debit, credit } = journalTotals(lines);
  if (debit !== credit) return `Debits (${amount(debit)}) and credits (${amount(credit)}) must be equal.`;
  return null;
}

export function journalTotals(lines: readonly LineAmounts[]) {
  const debit = fromMinor(sumMinor(lines.map((l) => toMinor(l.debit ?? 0))));
  const credit = fromMinor(sumMinor(lines.map((l) => toMinor(l.credit ?? 0))));
  return { debit, credit, difference: fromMinor(toMinor(debit) - toMinor(credit)) };
}

/** 1,234.50 — accounting amounts always show two decimals. */
export const amount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A balance with its side: "1,200.00 Dr", "350.00 Cr", "0.00". */
export function drCr(balance: number): string {
  if (toMinor(balance) === 0) return "0.00";
  return `${amount(Math.abs(balance))} ${balance > 0 ? "Dr" : "Cr"}`;
}

export const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual journal",
  opening: "Opening balances",
  stock_count: "Closing stock",
  invoice: "Invoice",
  credit_note: "Credit note",
  receipt: "Payment received",
  bill: "Supplier bill",
  expense: "Expense",
  supplier_payment: "Payment made",
  payment_allocation: "Advance applied or taken off",
  supplier_allocation: "Advance applied or taken off",
  bank_transfer: "Transfer",
  vat_settlement: "VAT settlement",
  vat_payment: "VAT paid to the FTA",
  advance_refund: "Advance refunded",
};
export const sourceLabel = (t: string) => SOURCE_LABELS[t] ?? t;

/** Entries a person posted (and may reverse by hand). The rest belong to a document: void or cancel that instead. */
export const MANUAL_SOURCES = new Set(["manual", "opening", "stock_count"]);

/**
 * Accounts that add up what each customer or supplier owes or has paid ahead: a line on one must say who, or statements
 * and ageing stop matching the books.
 */
export function partyNeededFor(systemKey: string | null | undefined): "customer" | "supplier" | null {
  if (systemKey === "ar" || systemKey === "customer_advances") return "customer";
  if (systemKey === "ap" || systemKey === "supplier_advances") return "supplier";
  return null;
}

/** The page of the document that posted an entry. */
export function sourceHref(type: string, id: number | null): string | null {
  if (!id) return null;
  switch (type) {
    case "invoice":
      return `/accounts/invoices/${id}`;
    case "receipt":
      return `/print/receipt/${id}`;
    case "bill":
    case "expense":
      return `/accounts/bills/${id}`;
    case "supplier_payment":
      return `/print/payment-voucher/${id}`;
    default:
      return null;
  }
}
