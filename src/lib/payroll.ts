import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import type { PostLine } from "@/lib/ledger/post";

/**
 * Accounts › Payroll: the money rules, with no database, so every one is easy to test. A payslip is a month's pay for
 * one person: the base salary, then lines of any type the accountant has set up (earnings such as a bonus, deductions
 * such as absence). A deduction whose type has the system key `advance_recovery` pays back an advance.
 */

export type PayKind = "earning" | "deduction";

export interface PayLine {
  label: string;
  kind: PayKind;
  amount: number;
  /** "advance_recovery" and "absence" are known to the portal; other types have none. */
  systemKey: string | null;
}

/** The types every organisation starts with. More can be added in Payroll › Pay items. */
export const DEFAULT_PAY_ITEMS: { name: string; kind: PayKind; systemKey: string | null }[] = [
  { name: "Bonus", kind: "earning", systemKey: null },
  { name: "Overtime", kind: "earning", systemKey: null },
  { name: "Commission", kind: "earning", systemKey: null },
  { name: "Allowance", kind: "earning", systemKey: null },
  { name: "Absence", kind: "deduction", systemKey: "absence" },
  { name: "Advance recovery", kind: "deduction", systemKey: "advance_recovery" },
  { name: "Fine", kind: "deduction", systemKey: null },
  { name: "Other deduction", kind: "deduction", systemKey: null },
];

export const ADVANCE_RECOVERY = "advance_recovery";
export const ABSENCE = "absence";

// ---------- months ----------

export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function monthLabelOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "2026-10" → "2026-10-31". */
export function monthLastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

// ---------- attendance → deduction ----------

/** One day's pay: a month counts as 30 days (UAE practice for monthly salaries). */
export const dailyRate = (base: number): number => fromMinor(Math.round(toMinor(base) / 30));

/** What the days someone was away without a reason cost, never more than the whole salary. */
export function absenceDeduction(base: number, days: number): number {
  if (days <= 0) return 0;
  return fromMinor(Math.min(toMinor(base), Math.round((toMinor(base) / 30) * days)));
}

// ---------- totals ----------

export interface PayTotals {
  /** Base salary plus every earning. */
  gross: number;
  advanceRecovery: number;
  /** Deductions that are not an advance recovery (absence, fines): they reduce what the salary costs us. */
  otherDeductions: number;
  deductions: number;
  net: number;
}

export function payslipTotals(base: number, lines: readonly PayLine[]): PayTotals {
  const earnings = sumMinor(lines.filter((l) => l.kind === "earning").map((l) => toMinor(l.amount)));
  const recovery = sumMinor(lines.filter((l) => l.kind === "deduction" && l.systemKey === ADVANCE_RECOVERY).map((l) => toMinor(l.amount)));
  const other = sumMinor(lines.filter((l) => l.kind === "deduction" && l.systemKey !== ADVANCE_RECOVERY).map((l) => toMinor(l.amount)));
  const gross = toMinor(base) + earnings;
  return { gross: fromMinor(gross), advanceRecovery: fromMinor(recovery), otherDeductions: fromMinor(other), deductions: fromMinor(recovery + other), net: fromMinor(gross - recovery - other) };
}

// ---------- advances ----------

export const advanceBalance = (paid: number, recovered: number): number => fromMinor(toMinor(paid) - toMinor(recovered));

/** What to take back this month: the whole balance if the pay can carry it, otherwise what the pay can carry. */
export function suggestRecovery(balance: number, payAvailable: number): number {
  if (balance <= 0 || payAvailable <= 0) return 0;
  return fromMinor(Math.min(toMinor(balance), toMinor(payAvailable)));
}

// ---------- ledger lines ----------

/**
 * Salary paid: the pay (less what is held back for absence or fines) is the cost, an advance taken back lowers
 * Employee advances, and what is left leaves the bank or cash box.
 */
export function payslipPostLines(p: { number: string; employee: string; bankLedgerAccountId: number; base: number; lines: readonly PayLine[] }): PostLine[] {
  const t = payslipTotals(p.base, p.lines);
  const description = `${p.number} ${p.employee}`;
  const cost = toMinor(t.gross) - toMinor(t.otherDeductions);
  const out: PostLine[] = [];
  if (cost > 0) out.push({ account: "exp_salaries", debit: fromMinor(cost), description });
  if (toMinor(t.advanceRecovery) > 0) out.push({ account: "employee_advances", credit: t.advanceRecovery, description });
  if (toMinor(t.net) > 0) out.push({ account: p.bankLedgerAccountId, credit: t.net, description });
  return out;
}

/** An advance paid out: money leaves the bank, and the employee owes it until it is taken off a salary. */
export function advancePostLines(a: { number: string; employee: string; bankLedgerAccountId: number; amount: number }): PostLine[] {
  const description = `${a.number} ${a.employee}`;
  return [
    { account: "employee_advances", debit: a.amount, description },
    { account: a.bankLedgerAccountId, credit: a.amount, description },
  ];
}
