/** Purchases rules in one place: what money goes out on (categories), bill states and line totals. No database here. */
import { invoiceState, type InvoiceState } from "@/lib/invoicing";
import { round2 } from "@/lib/quotation";

/**
 * Where money goes. "cogs" is the cost of what we sold (a supplier bill for goods or work on a customer order), so it
 * counts against gross profit; the rest are running costs of the business (net profit).
 */
export const CATEGORIES = [
  { key: "cogs", label: "Cost of goods sold", hint: "Goods and work bought for a customer order" },
  { key: "rent", label: "Rent", hint: "Office, warehouse, parking" },
  { key: "salaries", label: "Salaries and wages", hint: "Pay, commission, end-of-service" },
  { key: "visa", label: "Visa and labour", hint: "Visas, Emirates ID, insurance, labour card" },
  { key: "utilities", label: "Utilities", hint: "DEWA / SEWA / ADDC, chiller" },
  { key: "telecom", label: "Telephone and internet", hint: "Mobiles, internet, phone lines" },
  { key: "transport", label: "Fuel and transport", hint: "Fuel, Salik, parking, delivery, taxis" },
  { key: "marketing", label: "Marketing", hint: "Ads, website, printing, events" },
  { key: "office", label: "Office supplies", hint: "Stationery, small tools, pantry" },
  { key: "software", label: "Software and subscriptions", hint: "Licences, cloud, email" },
  { key: "bank", label: "Bank charges", hint: "Fees, transfer charges" },
  { key: "fees", label: "Professional fees", hint: "Accountant, legal, trade licence, government fees" },
  { key: "repairs", label: "Repairs and maintenance", hint: "Office, vehicles, equipment" },
  { key: "other", label: "Other", hint: "Anything else" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];
export const isCategory = (k: string): k is CategoryKey => CATEGORIES.some((c) => c.key === k);
export const categoryLabel = (k: string) => CATEGORIES.find((c) => c.key === k)?.label ?? k;

export const BILL_KINDS = [
  { key: "bill", label: "Bill" },
  { key: "expense", label: "Expense" },
  { key: "opening", label: "Opening balance" },
] as const;
export const billKindLabel = (k: string) => BILL_KINDS.find((b) => b.key === k)?.label ?? k;

/** Paid, part paid, due, overdue or void: the same rules as a customer invoice. */
export function billState(b: { status: string; total: number; dueDate: string }, paid: number, today: string): InvoiceState {
  const s = invoiceState({ ...b, status: b.status === "void" ? "cancelled" : b.status }, paid, today);
  return s.key === "cancelled" ? { ...s, label: "Void" } : s;
}

export interface BillLine {
  description: string;
  qty: number;
  unitCost: number;
}

export const lineCost = (l: Pick<BillLine, "qty" | "unitCost">) => round2(l.qty * l.unitCost);

/**
 * Subtotal, VAT and total of a bill. VAT is worked out at `vatPct` unless the supplier's invoice shows another amount
 * (`vatAmount`, e.g. a few fils of rounding): then theirs is used, since that is what we pay and can reclaim.
 */
export function billTotals(lines: Pick<BillLine, "qty" | "unitCost">[], vatPct: number, vatAmount?: number | null) {
  const subtotal = round2(lines.reduce((s, l) => s + lineCost(l), 0));
  const vat = vatAmount != null ? round2(vatAmount) : round2((subtotal * vatPct) / 100);
  return { subtotal, vatAmount: vat, total: round2(subtotal + vat) };
}
