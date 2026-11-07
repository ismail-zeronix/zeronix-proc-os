import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { currentOrgId, orgProfile, withOrg } from "@/lib/org";
import { longDay } from "@/lib/quotation";
import { compareLabel, compareRange, fiscalYearStart, reportQuery, type ReportParams } from "@/lib/report-centre";
import { monthLabel, monthsBetween, pct, type Report, type ReportTable } from "@/lib/reports";
import type { Tx } from "@/lib/tx";
import { ledgerStart } from "../documents";
import { amount } from "../journal";
import { ensureLedger } from "../setup";
import { buildAccountLedger, buildBalanceSheet, buildCashFlow, buildPlByMonth, buildProfitLoss, buildTrialBalance, type AccountRow, type LedgerLine, type Move } from "./build";

/** Long ledgers are cut here: on screen and on paper a report this size is a sign the period is too wide. */
export const LEDGER_ROW_LIMIT = 5000;
/** A file for download carries far more than a screen or paper. */
const EXPORT_ROW_LIMIT = 200_000;
const capOf = (p: ReportParams) => (p.full ? EXPORT_ROW_LIMIT : LEDGER_ROW_LIMIT);

const NOT_ON = "The ledger is not switched on yet, so this report is empty. An accountant can set the cut-over date and bring in the opening balances from Zoho in Settings › Opening balances.";

async function accountsOf(tx: Tx, orgId: number): Promise<AccountRow[]> {
  const a = schema.ledgerAccounts;
  return tx
    .select({ id: a.id, code: a.code, name: a.name, type: a.type, subtype: a.subtype, systemKey: a.systemKey, parentId: a.parentId, isGroup: a.isGroup })
    .from(a)
    .where(eq(a.organizationId, orgId))
    .orderBy(asc(a.code));
}

/** Every leaf account: debits less credits before `from`, then the debits and credits from `from` to `to`. */
async function movesBetween(tx: Tx, orgId: number, from: string, to: string, opts: { skipOpening?: boolean } = {}): Promise<Move[]> {
  const inPeriod = opts.skipOpening ? sql`e.date BETWEEN ${from} AND ${to} AND e.source_type <> 'opening'` : sql`e.date BETWEEN ${from} AND ${to}`;
  const res = await tx.execute<{ id: number; opening: number; debit: number; credit: number }>(sql`
    SELECT l.account_id AS id,
      coalesce(sum(l.debit - l.credit) FILTER (WHERE e.date < ${from}), 0)::float AS opening,
      coalesce(sum(l.debit) FILTER (WHERE ${inPeriod}), 0)::float AS debit,
      coalesce(sum(l.credit) FILTER (WHERE ${inPeriod}), 0)::float AS credit
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
    WHERE l.organization_id = ${orgId}
    GROUP BY l.account_id`);
  const byId = new Map(res.rows.map((r) => [Number(r.id), r]));
  return (await accountsOf(tx, orgId))
    .filter((a) => !a.isGroup)
    .map((a) => {
      const r = byId.get(a.id);
      return { ...a, opening: Number(r?.opening ?? 0), debit: Number(r?.debit ?? 0), credit: Number(r?.credit ?? 0) };
    });
}

/** Each account's balance at the end of a day (debits less credits). */
async function balancesAt(tx: Tx, orgId: number, day: string): Promise<Map<number, number>> {
  const res = await tx.execute<{ id: number; b: number }>(sql`
    SELECT l.account_id AS id, sum(l.debit - l.credit)::float AS b
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
    WHERE l.organization_id = ${orgId} AND e.date <= ${day}
    GROUP BY l.account_id`);
  return new Map(res.rows.map((r) => [Number(r.id), Number(r.b)]));
}

const glLink = (p: ReportParams) => (accountId: number) => `/accounts/reports?${reportQuery({ ...p, key: "gl", compare: "none", periodKey: "custom", account: null, party: null }, { account: String(accountId) })}`;

async function profitLoss(tx: Tx, orgId: number, p: ReportParams, start: string | null): Promise<Report> {
  const moves = await movesBetween(tx, orgId, p.from, p.to);
  const range = p.compare === "none" ? null : compareRange(p.from, p.to, p.compare);
  const compare = range ? await movesBetween(tx, orgId, range.from, range.to) : undefined;
  const { table, totals, compareTotals } = buildProfitLoss({ moves, compare, compareTitle: compareLabel(p.compare), glHref: glLink(p) });
  const monthly = await tx.execute<{ month: string; type: "income" | "expense"; subtype: string; debit: number; credit: number }>(sql`
    SELECT to_char(e.date, 'YYYY-MM') AS month, a.type, a.subtype, sum(l.debit)::float AS debit, sum(l.credit)::float AS credit
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND e.date BETWEEN ${p.from} AND ${p.to} AND a.type IN ('income', 'expense')
    GROUP BY 1, 2, 3`);
  const months = monthsBetween(p.from, p.to);
  const tables: ReportTable[] = [table];
  if (months.length > 1) tables.push(buildPlByMonth(monthly.rows.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit) })), months, monthLabel));
  const openingNote = start && p.from < start && p.to >= start ? ` Zoho's figures up to ${longDay(start)} are included as the opening entry, all on one day.` : "";
  if (range) table.note = `${compareLabel(p.compare)}: ${longDay(range.from)} to ${longDay(range.to)}.${openingNote}`;
  else if (openingNote) table.note = openingNote.trim();
  const expenses = Math.round((totals.opex + totals.tax) * 100) / 100;
  return {
    title: "Profit and loss",
    period: p.label,
    notice: start ? undefined : NOT_ON,
    kpis: [
      { label: "Sales", value: totals.sales, kind: "money", hint: compareTotals ? `${compareLabel(p.compare)}: ${compareTotals.sales.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : undefined },
      { label: "Gross profit", value: totals.gross, kind: "money", hint: totals.sales ? `${pct(totals.gross, totals.sales)}% of sales` : undefined },
      { label: "Expenses", value: expenses, kind: "money" },
      { label: "Net profit", value: totals.profit, kind: "money", hint: totals.sales ? `${pct(totals.profit, totals.sales)}% of sales` : undefined },
    ],
    tables,
  };
}

async function bsInput(tx: Tx, orgId: number, day: string, startMonth: number, accounts: AccountRow[]) {
  const balances = await balancesAt(tx, orgId, day);
  const fy = fiscalYearStart(day, startMonth);
  const pl = await tx.execute<{ earlier: number; year: number }>(sql`
    SELECT
      coalesce(sum(l.credit - l.debit) FILTER (WHERE e.date < ${fy}), 0)::float AS earlier,
      coalesce(sum(l.credit - l.debit) FILTER (WHERE e.date >= ${fy}), 0)::float AS year
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND e.date <= ${day} AND a.type IN ('income', 'expense')`);
  return { accounts, balances, earlierProfit: Number(pl.rows[0].earlier), yearProfit: Number(pl.rows[0].year) };
}

async function balanceSheet(tx: Tx, orgId: number, p: ReportParams, start: string | null): Promise<Report> {
  const org = await orgProfile(orgId);
  const accounts = await accountsOf(tx, orgId);
  const now = await bsInput(tx, orgId, p.to, org.fiscalYearStartMonth, accounts);
  // "previous" on a balance sheet means the end of the month before; "last year" the same day a year ago
  const thenDay = p.compare === "prev" ? endOfPreviousMonth(p.to) : p.compare === "year" ? compareRange(p.to, p.to, "year").to : null;
  const then = thenDay ? await bsInput(tx, orgId, thenDay, org.fiscalYearStartMonth, accounts) : undefined;
  const glFrom = fiscalYearStart(p.to, org.fiscalYearStartMonth);
  const b = buildBalanceSheet({
    now,
    then,
    thenTitle: thenDay ? longDay(thenDay) : undefined,
    glHref: (id) => `/accounts/reports?r=gl&account=${id}&from=${glFrom}&to=${p.to}`,
  });
  const notes = [b.difference ? `Assets and liabilities plus equity differ by ${amount(b.difference)}: please tell whoever looks after the system.` : "", b.openingEquity ? `Opening balance equity still holds ${amount(b.openingEquity)}: the opening balances are not fully matched.` : ""].filter(Boolean);
  if (notes.length) b.table.note = notes.join(" ");
  return {
    title: "Balance sheet",
    period: p.label,
    notice: start ? undefined : NOT_ON,
    kpis: [
      { label: "Assets", value: b.assets, kind: "money" },
      { label: "Liabilities", value: b.liabilities, kind: "money" },
      { label: "Equity", value: b.equity, kind: "money" },
      { label: "Difference", value: b.difference, kind: "money", hint: b.difference ? "Should be zero" : "Balanced" },
    ],
    tables: [b.table],
  };
}

function endOfPreviousMonth(day: string): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

async function cashFlow(tx: Tx, orgId: number, p: ReportParams, start: string | null): Promise<Report> {
  const moves = await movesBetween(tx, orgId, p.from, p.to, { skipOpening: true });
  const cash = await tx.execute<{ opening: number; closing: number }>(sql`
    SELECT
      coalesce(sum(l.debit - l.credit) FILTER (WHERE e.date < ${p.from} OR (e.source_type = 'opening' AND e.date <= ${p.to})), 0)::float AS opening,
      coalesce(sum(l.debit - l.credit) FILTER (WHERE e.date <= ${p.to}), 0)::float AS closing
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND a.subtype IN ('cash', 'bank')`);
  const c = buildCashFlow({ moves, openingCash: Number(cash.rows[0].opening), closingCash: Number(cash.rows[0].closing), glHref: glLink(p) });
  if (c.difference) c.table.note = `The statement differs from the cash accounts by ${amount(c.difference)}: please tell whoever looks after the system.`;
  return {
    title: "Cash flow",
    period: p.label,
    notice: start ? undefined : NOT_ON,
    kpis: [
      { label: "From operations", value: c.operating, kind: "money" },
      { label: "From investing", value: c.investing, kind: "money" },
      { label: "From financing", value: c.financing, kind: "money" },
      { label: "Net change", value: c.change, kind: "money" },
    ],
    tables: [c.table],
  };
}

async function trialBalance(tx: Tx, orgId: number, p: ReportParams, start: string | null): Promise<Report> {
  const t = buildTrialBalance(await movesBetween(tx, orgId, p.from, p.to), glLink(p));
  return {
    title: "Trial balance",
    period: p.label,
    notice: start ? undefined : NOT_ON,
    landscape: true,
    kpis: [
      { label: "Closing debits", value: t.debit, kind: "money" },
      { label: "Closing credits", value: t.credit, kind: "money" },
      { label: "Difference", value: t.difference, kind: "money", hint: t.difference ? "Should be zero" : "Balanced" },
    ],
    tables: [t.table],
  };
}

async function linesOf(tx: Tx, orgId: number, from: string, to: string, accountId: number | null, limit: number) {
  const res = await tx.execute<LedgerLine & { accountId: number }>(sql`
    SELECT l.account_id AS "accountId", e.id AS "entryId", e.number, e.date::text AS date, e.memo, l.description,
      CASE l.party_type WHEN 'customer' THEN c.name WHEN 'supplier' THEN s.name END AS party,
      l.debit::float AS debit, l.credit::float AS credit
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    LEFT JOIN companies c ON l.party_type = 'customer' AND c.id = l.party_id
    LEFT JOIN suppliers s ON l.party_type = 'supplier' AND s.id = l.party_id
    WHERE l.organization_id = ${orgId} AND e.date BETWEEN ${from} AND ${to}
      ${accountId ? sql`AND l.account_id = ${accountId}` : sql``}
    ORDER BY e.date, e.id, l.line_no
    LIMIT ${limit + 1}`);
  return res.rows;
}

async function generalLedger(tx: Tx, orgId: number, p: ReportParams, start: string | null): Promise<Report> {
  const moves = await movesBetween(tx, orgId, p.from, p.to);
  const chosen = p.account ? moves.filter((a) => a.id === p.account) : moves.filter((a) => a.opening || a.debit || a.credit);
  const limit = capOf(p);
  const lines = await linesOf(tx, orgId, p.from, p.to, p.account, limit);
  const cut = lines.length > limit;
  const kept = cut ? lines.slice(0, limit) : lines;
  const tables = chosen.map((a) => buildAccountLedger(a, a.opening, kept.filter((l) => Number(l.accountId) === a.id)));
  if (cut && tables.length) tables[tables.length - 1].note = `Only the first ${limit.toLocaleString("en-US")} lines are shown: pick one account or a shorter period.`;
  const debit = chosen.reduce((s, a) => s + a.debit, 0);
  const credit = chosen.reduce((s, a) => s + a.credit, 0);
  return {
    title: p.account && chosen[0] ? `General ledger: ${chosen[0].code} ${chosen[0].name}` : "General ledger",
    period: p.label,
    notice: start ? undefined : NOT_ON,
    landscape: true,
    kpis: [
      { label: "Accounts", value: chosen.length, kind: "int" },
      { label: "Lines", value: kept.length, kind: "int" },
      { label: "Debits", value: Math.round(debit * 100) / 100, kind: "money" },
      { label: "Credits", value: Math.round(credit * 100) / 100, kind: "money" },
    ],
    tables: tables.length ? tables : [{ title: "General ledger", columns: [{ label: "Date", kind: "date" }, { label: "Entry" }, { label: "Details" }, { label: "Debit", kind: "money" }, { label: "Credit", kind: "money" }, { label: "Balance", kind: "money" }], rows: [] }],
  };
}

async function dayBook(tx: Tx, orgId: number, p: ReportParams, start: string | null): Promise<Report> {
  const res = await tx.execute<{ entryId: number; number: string; date: string; memo: string; sourceType: string; code: string; name: string; description: string; debit: number; credit: number }>(sql`
    SELECT e.id AS "entryId", e.number, e.date::text AS date, e.memo, e.source_type AS "sourceType", a.code, a.name, l.description, l.debit::float AS debit, l.credit::float AS credit
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND e.date BETWEEN ${p.from} AND ${p.to}
    ORDER BY e.date, e.id, l.line_no
    LIMIT ${capOf(p) + 1}`);
  const cut = res.rows.length > capOf(p);
  const rows = cut ? res.rows.slice(0, capOf(p)) : res.rows;
  const links: Record<number, string> = {};
  const strong: number[] = [];
  rows.forEach((r, i) => {
    links[i] = `/accounts/journals/${r.entryId}`;
    if (i === 0 || rows[i - 1].entryId !== r.entryId) strong.push(i);
  });
  const debit = rows.reduce((s, r) => s + r.debit, 0);
  const credit = rows.reduce((s, r) => s + r.credit, 0);
  const entries = new Set(rows.map((r) => r.entryId)).size;
  return {
    title: "Day book",
    period: p.label,
    notice: start ? undefined : NOT_ON,
    landscape: true,
    kpis: [
      { label: "Entries", value: entries, kind: "int" },
      { label: "Debits", value: Math.round(debit * 100) / 100, kind: "money" },
      { label: "Credits", value: Math.round(credit * 100) / 100, kind: "money" },
    ],
    tables: [
      {
        title: "Journal entries",
        columns: [{ label: "Date", kind: "date" }, { label: "Entry" }, { label: "Account" }, { label: "Details" }, { label: "Debit", kind: "money" }, { label: "Credit", kind: "money" }],
        rows: rows.map((r) => [r.date, r.number, `${r.code} ${r.name}`, r.description || r.memo, r.debit || null, r.credit || null]),
        links,
        total: ["Total", null, null, null, Math.round(debit * 100) / 100, Math.round(credit * 100) / 100],
        note: cut ? `Only the first ${capOf(p).toLocaleString("en-US")} lines are shown: pick a shorter period.` : undefined,
      },
    ],
  };
}

export const LEDGER_REPORTS = new Set(["pl", "bs", "cf", "tb", "gl", "daybook"]);

/** A report that reads the ledger (financial statements, general ledger, day book). */
export async function runLedgerReport(p: ReportParams): Promise<Report> {
  const orgId = await currentOrgId();
  return withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const start = await ledgerStart(tx, orgId);
    switch (p.key) {
      case "pl":
        return profitLoss(tx, orgId, p, start);
      case "bs":
        return balanceSheet(tx, orgId, p, start);
      case "cf":
        return cashFlow(tx, orgId, p, start);
      case "tb":
        return trialBalance(tx, orgId, p, start);
      case "gl":
        return generalLedger(tx, orgId, p, start);
      case "daybook":
        return dayBook(tx, orgId, p, start);
      default:
        throw new Error(`Unknown ledger report ${p.key}`);
    }
  });
}

/** Is the ledger switched on (a cut-over date is set)? */
export async function ledgerIsOn(): Promise<boolean> {
  const orgId = await currentOrgId();
  return withOrg(orgId, async (tx) => !!(await ledgerStart(tx, orgId)));
}

/** A system account's balance on a day on its natural side, or null while the ledger is off (for the ageing reports). */
export async function ledgerBalanceOf(systemKey: string, side: 1 | -1, day: string): Promise<number | null> {
  const orgId = await currentOrgId();
  return withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    if (!(await ledgerStart(tx, orgId))) return null;
    const r = await tx.execute<{ b: number }>(sql`
      SELECT coalesce(sum(l.debit - l.credit), 0)::float AS b
      FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
      WHERE l.organization_id = ${orgId} AND a.system_key = ${systemKey} AND e.date <= ${day}`);
    return Math.round(Number(r.rows[0].b) * side * 100) / 100 || 0;
  });
}

/** Options for the report toolbar's pickers. */
export async function reportPickOptions(kind: "account" | "customer" | "supplier"): Promise<{ id: number; label: string }[]> {
  const orgId = await currentOrgId();
  return withOrg(orgId, async (tx) => {
    if (kind === "account") {
      await ensureLedger(tx, orgId);
      return (await accountsOf(tx, orgId)).filter((a) => !a.isGroup).map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }));
    }
    if (kind === "customer") {
      const res = await tx.execute<{ id: number; name: string }>(sql`SELECT DISTINCT c.id, c.name FROM companies c JOIN invoices i ON i.company_id = c.id ORDER BY c.name`);
      return res.rows.map((r) => ({ id: Number(r.id), label: r.name }));
    }
    const res = await tx.execute<{ id: number; name: string }>(sql`SELECT DISTINCT s.id, s.name FROM suppliers s JOIN bills b ON b.supplier_id = s.id ORDER BY s.name`);
    return res.rows.map((r) => ({ id: Number(r.id), label: r.name }));
  });
}
