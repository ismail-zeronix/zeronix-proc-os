/**
 * The Accounts report centre, the parts with no database: which reports exist, how they are grouped, and how a report's
 * period and filters travel in the URL (the page, the print page, PDF, Excel and CSV all read the same parameters, so
 * they always show the same numbers).
 */
import { addDays, longDay } from "@/lib/quotation";
import { periodRange } from "@/lib/reports";

export interface ReportDef {
  key: string;
  label: string;
  hint: string;
  /** About one day (what is owed, the balance sheet), not a period. */
  asOf?: boolean;
  /** Can show a second column for an earlier period. */
  compare?: boolean;
  /** Needs an account, customer or supplier picked. */
  pick?: "account" | "customer" | "supplier";
  /** Only with the Accountant switch. */
  accountant?: boolean;
}

export const REPORT_GROUPS: readonly { label: string; reports: readonly ReportDef[] }[] = [
  {
    label: "Financial statements",
    reports: [
      { key: "pl", label: "Profit and loss", hint: "Income, costs and profit for a period", compare: true },
      { key: "bs", label: "Balance sheet", hint: "What the company owns and owes on a day", asOf: true, compare: true },
      { key: "cf", label: "Cash flow", hint: "Where the cash came from and went" },
      { key: "tb", label: "Trial balance", hint: "Every account: opening, movement, closing" },
    ],
  },
  {
    label: "Accounting records",
    reports: [
      { key: "gl", label: "General ledger", hint: "Every line of an account, with a running balance", pick: "account" },
      { key: "daybook", label: "Day book", hint: "Every journal entry in date order" },
    ],
  },
  {
    label: "Sales",
    reports: [
      { key: "aged-ar", label: "Customers owe (ageing)", hint: "Unpaid invoices by how late, on any day", asOf: true },
      { key: "customer-statement", label: "Customer statement", hint: "One customer's invoices and payments", pick: "customer" },
      { key: "invoices", label: "Invoice register", hint: "Every invoice issued" },
      { key: "credit-notes", label: "Credit note register", hint: "Every credit note issued" },
      { key: "receipts", label: "Payments received", hint: "Every receipt" },
      { key: "refunds", label: "Refunds of advances", hint: "Money handed back, to customers and by suppliers" },
      { key: "sales", label: "Sales analysis", hint: "By customer, salesperson and month" },
    ],
  },
  {
    label: "Purchases",
    reports: [
      { key: "aged-ap", label: "We owe suppliers (ageing)", hint: "Unpaid bills by how late, on any day", asOf: true },
      { key: "supplier-statement", label: "Supplier statement", hint: "One supplier's bills and payments", pick: "supplier" },
      { key: "bills", label: "Bill register", hint: "Every bill and expense" },
      { key: "debit-notes", label: "Debit note register", hint: "Every debit note to a supplier" },
      { key: "payments-made", label: "Payments made", hint: "Every payment voucher" },
      { key: "purchases", label: "Purchases analysis", hint: "By supplier and by category" },
    ],
  },
  {
    label: "VAT",
    reports: [
      { key: "vat-return", label: "VAT return (VAT 201)", hint: "Every box of the return, from the ledger" },
      { key: "vat", label: "VAT summary", hint: "VAT charged minus VAT paid, document by document" },
      { key: "vat-check", label: "Tax invoice checks", hint: "Documents the FTA could question" },
    ],
  },
  {
    label: "Cash",
    reports: [{ key: "cash", label: "Cash in and out", hint: "Money received and paid, cash and bank" }],
  },
  {
    label: "Management",
    reports: [
      { key: "profit", label: "Profit per sale", hint: "What each sale really made" },
      { key: "project-profit", label: "Profit per project", hint: "Sales against costs for each project" },
      { key: "expenses", label: "Expenses by category", hint: "Each category, month by month" },
      { key: "uninvoiced", label: "Sold without a cost", hint: "Invoices with no supplier bill yet: a month-end accrual prompt" },
      { key: "pnl", label: "Profit from documents", hint: "Quick profit from invoices and bills, without the ledger" },
    ],
  },
  {
    label: "Audit",
    reports: [
      { key: "audit", label: "Audit trail", hint: "Who did what, with the values before and after", accountant: true },
      { key: "voided", label: "Voided and cancelled", hint: "Everything taken back, with the reason" },
    ],
  },
];

const ALL = REPORT_GROUPS.flatMap((g) => g.reports);
export const reportDef = (key: string) => ALL.find((r) => r.key === key);

/** Older links to the reports these replaced keep working. */
const RENAMED: Record<string, string> = { receivables: "aged-ar", payables: "aged-ap" };
/** A report name we know, old or new. */
export const isKnownReport = (key: string) => !!reportDef(key) || key in RENAMED;

export type CompareMode = "none" | "prev" | "year";

export interface ReportParams {
  key: string;
  /** "this-month"..., or "custom" when dates were typed. */
  periodKey: string;
  from: string;
  to: string;
  label: string;
  compare: CompareMode;
  account: number | null;
  party: number | null;
  /** A file for download (Excel, CSV): everything, not only what fits on a screen or paper. */
  full?: boolean;
}

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const posInt = (s: string | null | undefined) => {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Reads a report's parameters from a query string. Anything unknown falls back to a sensible default. */
export function parseReportParams(get: (k: string) => string | null | undefined, today: string, fallback = "pl"): ReportParams {
  const asked = get("r") ?? fallback;
  const key = RENAMED[asked] ?? (reportDef(asked) ? asked : fallback);
  const def = reportDef(key);
  const compareAsked = get("compare");
  const compare: CompareMode = def?.compare && (compareAsked === "prev" || compareAsked === "year") ? compareAsked : "none";
  const base = { key, compare, account: posInt(get("account")), party: posInt(get("party")) };
  if (def?.asOf) {
    const to = isDay(get("to")) ? (get("to") as string) : today;
    return { ...base, periodKey: "custom", from: `${to.slice(0, 4)}-01-01`, to, label: `As of ${longDay(to)}` };
  }
  const p = periodRange(get("period") ?? "this-month", today, get("from"), get("to"));
  return { ...base, periodKey: p.key, from: p.from, to: p.to, label: p.key === "custom" ? `${longDay(p.from)} to ${longDay(p.to)}` : `${p.label}: ${longDay(p.from)} to ${longDay(p.to)}` };
}

/** The query string for these parameters (other pages, exports, print), with changes on top. */
export function reportQuery(p: ReportParams, over: Partial<Record<"r" | "compare" | "account" | "party", string>> = {}): string {
  const q = new URLSearchParams({ r: p.key });
  if (reportDef(p.key)?.asOf) q.set("to", p.to);
  else if (p.periodKey === "custom") {
    q.set("from", p.from);
    q.set("to", p.to);
  } else q.set("period", p.periodKey);
  if (p.compare !== "none") q.set("compare", p.compare);
  if (p.account) q.set("account", String(p.account));
  if (p.party) q.set("party", String(p.party));
  for (const [k, v] of Object.entries(over)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  return q.toString();
}

const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const parts = (d: string) => [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))] as const;
const day = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The same day n months earlier (31 March, one month back → 28 February; a month's end stays a month's end). */
function monthsBack(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) - n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  const last = lastDayOfMonth(ny, nm);
  return day(ny, nm, d >= lastDayOfMonth(y, m) ? last : Math.min(d, last));
}

/**
 * The period to compare with. "year": the same dates last year. "prev": the period just before; whole months stay whole
 * months (Q3 compares with Q2), any other range compares with as many days before it.
 */
export function compareRange(from: string, to: string, mode: Exclude<CompareMode, "none">): { from: string; to: string } {
  if (mode === "year") return { from: monthsBack(from, 12), to: monthsBack(to, 12) };
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  if (fd === 1 && td === lastDayOfMonth(ty, tm)) {
    const months = (ty - fy) * 12 + (tm - fm) + 1;
    const start = monthsBack(from, months);
    return { from: start, to: addDays(from, -1) };
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/** The first day of the fiscal year a day falls in. */
export function fiscalYearStart(date: string, startMonth: number): string {
  const [y, m] = parts(date);
  return day(m >= startMonth ? y : y - 1, startMonth, 1);
}

export const compareLabel = (mode: CompareMode) => (mode === "year" ? "Last year" : mode === "prev" ? "Previous period" : "");
