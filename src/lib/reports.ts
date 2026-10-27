/**
 * Accounts reports, the parts that need no database: periods, the one table shape every report is drawn and exported
 * with, and CSV. Profit is on the accrual basis: sales by invoice date, costs by bill date. Opening balances carried
 * from Zoho are left out of profit and VAT (they belong to Zoho's periods).
 */
import { round2 } from "@/lib/quotation";

export const REPORTS = [
  { key: "pnl", label: "Profit and loss", hint: "Sales, cost of goods, expenses, profit" },
  { key: "vat", label: "VAT summary", hint: "VAT charged minus VAT paid, for the VAT return" },
  { key: "receivables", label: "Customers owe", hint: "Unpaid invoices by how late" },
  { key: "payables", label: "We owe suppliers", hint: "Unpaid bills by how late" },
  { key: "sales", label: "Sales", hint: "By customer, salesperson and month" },
  { key: "profit", label: "Profit per order", hint: "What each order really made" },
  { key: "cash", label: "Cash in and out", hint: "Money received and paid, cash and bank" },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];
export const isReport = (k: string): k is ReportKey => REPORTS.some((r) => r.key === k);
/** Reports about today (what is owed), not about a period. */
export const AS_OF_TODAY: ReportKey[] = ["receivables", "payables"];

export const PERIODS = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "this-quarter", label: "This quarter" },
  { key: "last-quarter", label: "Last quarter" },
  { key: "this-year", label: "This year" },
  { key: "last-year", label: "Last year" },
] as const;

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** First and last day of a preset period (or of `from`..`to` when both are given), with a label. */
export function periodRange(key: string, today: string, from?: unknown, to?: unknown): { key: string; from: string; to: string; label: string } {
  if (isDay(from) && isDay(to) && from <= to) return { key: "custom", from, to, label: `${from} to ${to}` };
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const q = Math.floor(m / 3) * 3;
  const r: Record<string, [string, string]> = {
    "this-month": [iso(y, m, 1), iso(y, m + 1, 0)],
    "last-month": [iso(y, m - 1, 1), iso(y, m, 0)],
    "this-quarter": [iso(y, q, 1), iso(y, q + 3, 0)],
    "last-quarter": [iso(y, q - 3, 1), iso(y, q, 0)],
    "this-year": [iso(y, 0, 1), iso(y, 11, 31)],
    "last-year": [iso(y - 1, 0, 1), iso(y - 1, 11, 31)],
  };
  const k = key in r ? key : "this-month";
  return { key: k, from: r[k][0], to: r[k][1], label: PERIODS.find((p) => p.key === k)!.label };
}

/** Every month (YYYY-MM) a period touches. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (let guard = 0; guard < 240; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= end) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export type Cell = string | number | null;
export interface Column {
  label: string;
  /** money: AED with 2 decimals; pct: a percentage; int: a count; text otherwise. */
  kind?: "money" | "pct" | "int" | "text";
}
export interface ReportTable {
  title: string;
  columns: Column[];
  rows: Cell[][];
  /** A bold last row (totals). */
  total?: Cell[];
  /** Rows to draw bold (sub-totals such as gross profit). */
  strong?: number[];
  note?: string;
}
export interface Report {
  title: string;
  period: string;
  kpis: { label: string; value: number; kind: "money" | "pct" | "int"; hint?: string }[];
  tables: ReportTable[];
}

export const pct = (part: number, whole: number) => (whole ? round2((part / whole) * 100) : null);

export interface PnlInput {
  /** Months in order, each with what was invoiced, credited and spent (by category key). */
  months: { month: string; sales: number; credits: number; costs: Record<string, number> }[];
  categoryLabel: (k: string) => string;
}

/** Profit and loss for a period: totals, and the same lines month by month. Cost of goods sold ("cogs") is above gross profit. */
export function buildPnl({ months, categoryLabel }: PnlInput) {
  const sum = (f: (m: PnlInput["months"][number]) => number) => round2(months.reduce((s, m) => s + f(m), 0));
  const cats = [...new Set(months.flatMap((m) => Object.keys(m.costs)))].filter((k) => k !== "cogs").sort((a, b) => sum((m) => m.costs[b] ?? 0) - sum((m) => m.costs[a] ?? 0));
  const line = (m: PnlInput["months"][number]) => {
    const net = round2(m.sales - m.credits);
    const cogs = round2(m.costs.cogs ?? 0);
    const gross = round2(net - cogs);
    const exp = round2(cats.reduce((s, c) => s + (m.costs[c] ?? 0), 0));
    return { net, cogs, gross, exp, profit: round2(gross - exp) };
  };
  const all = { month: "all", sales: sum((m) => m.sales), credits: sum((m) => m.credits), costs: Object.fromEntries(["cogs", ...cats].map((c) => [c, sum((m) => m.costs[c] ?? 0)])) };
  const t = line(all);
  return { totals: { ...t, sales: all.sales, credits: all.credits }, categories: cats.map((c) => ({ key: c, label: categoryLabel(c), amount: all.costs[c] })), byMonth: months.map((m) => ({ month: m.month, ...line(m) })) };
}

const csvCell = (v: Cell) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The whole report as one CSV (a block per table), UTF-8 with BOM so Excel opens it correctly. */
export function reportToCsv(r: Report): string {
  const lines: Cell[][] = [[r.title], [r.period], []];
  if (r.kpis.length) {
    for (const k of r.kpis) lines.push([k.label, k.value]);
    lines.push([]);
  }
  for (const t of r.tables) {
    lines.push([t.title]);
    lines.push(t.columns.map((c) => c.label));
    for (const row of t.rows) lines.push(row);
    if (t.total) lines.push(t.total);
    if (t.note) lines.push([t.note]);
    lines.push([]);
  }
  return "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
