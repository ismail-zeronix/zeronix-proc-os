/**
 * Financial statements built from account movements. Pure functions (no database), so the accounting can be tested on
 * its own; lib/ledger/reports/data.ts runs the queries and hands the rows in. Amounts in a statement are shown on their
 * natural side: an income figure is positive when it is income, a liability when it is owed.
 */
import { ageBucket, AGE_BUCKETS } from "@/lib/invoicing";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import type { Cell, Report, ReportTable } from "@/lib/reports";
import { debitNormal, type AccountType } from "../coa-templates";

export interface AccountRow {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  systemKey: string | null;
  parentId: number | null;
  isGroup: boolean;
}

/** One account over a period: debits less credits before it, then the debits and credits inside it. */
export interface Move extends AccountRow {
  opening: number;
  debit: number;
  credit: number;
}

const m = toMinor;
const fm = fromMinor;
const add = (xs: readonly number[]) => fm(sumMinor(xs.map(m)));
const net = (r: Pick<Move, "debit" | "credit">) => fm(m(r.debit) - m(r.credit));

/** Query string of the same period, for a link into the general ledger. */
export type GlHref = (accountId: number) => string;

/** Every account with something on it: opening, movement and closing, each on its side. The two sides must be equal. */
export function buildTrialBalance(moves: readonly Move[], glHref: GlHref): { table: ReportTable; debit: number; credit: number; difference: number } {
  const rows: Cell[][] = [];
  const links: Record<number, string> = {};
  let oD = 0, oC = 0, d = 0, c = 0, cD = 0, cC = 0;
  for (const a of [...moves].sort((x, y) => x.code.localeCompare(y.code))) {
    if (a.isGroup) continue;
    const opening = m(a.opening);
    const closing = opening + m(a.debit) - m(a.credit);
    if (!opening && !m(a.debit) && !m(a.credit)) continue;
    links[rows.length] = glHref(a.id);
    rows.push([a.code, a.name, opening > 0 ? fm(opening) : null, opening < 0 ? fm(-opening) : null, a.debit || null, a.credit || null, closing > 0 ? fm(closing) : null, closing < 0 ? fm(-closing) : null]);
    if (opening > 0) oD += opening;
    else oC -= opening;
    d += m(a.debit);
    c += m(a.credit);
    if (closing > 0) cD += closing;
    else cC -= closing;
  }
  return {
    table: {
      title: "Trial balance",
      columns: [
        { label: "Code" },
        { label: "Account" },
        { label: "Opening Dr", kind: "money" },
        { label: "Opening Cr", kind: "money" },
        { label: "Debit", kind: "money" },
        { label: "Credit", kind: "money" },
        { label: "Closing Dr", kind: "money" },
        { label: "Closing Cr", kind: "money" },
      ],
      rows,
      links,
      total: ["Total", null, fm(oD), fm(oC), fm(d), fm(c), fm(cD), fm(cC)],
    },
    debit: fm(cD),
    credit: fm(cC),
    difference: fm(cD - cC),
  };
}

type PlSection = "sales" | "other" | "cogs" | "opex" | "tax";

/** Where an income or expense account sits in the profit and loss. */
function plSection(a: Pick<AccountRow, "type" | "subtype">): PlSection | null {
  if (a.type === "income") return a.subtype === "other_income" ? "other" : "sales";
  if (a.type === "expense") return a.subtype === "cogs" ? "cogs" : a.subtype === "tax" ? "tax" : "opex";
  return null;
}

/** An income or expense account's amount: income as credits less debits, costs as debits less credits. */
const plAmount = (a: Pick<Move, "type" | "debit" | "credit">) => (a.type === "income" ? fm(m(a.credit) - m(a.debit)) : net(a));

export interface PlTotals {
  sales: number;
  cogs: number;
  gross: number;
  other: number;
  opex: number;
  operating: number;
  tax: number;
  profit: number;
}

export function plTotals(moves: readonly Pick<Move, "type" | "subtype" | "debit" | "credit">[]): PlTotals {
  const of = (s: PlSection) => add(moves.filter((a) => plSection(a) === s).map(plAmount));
  const sales = of("sales"), cogs = of("cogs"), other = of("other"), opex = of("opex"), tax = of("tax");
  const gross = add([sales, -cogs]);
  const operating = add([gross, other, -opex]);
  return { sales, cogs, gross, other, opex, operating, tax, profit: add([operating, -tax]) };
}

/**
 * The profit and loss: sales, cost of sales, gross profit, other income, expenses, operating profit, tax, net profit.
 * With `compare`, a column for the earlier period and the change. Accounts with nothing in either period are left out.
 */
export function buildProfitLoss(p: { moves: readonly Move[]; compare?: readonly Move[]; compareTitle?: string; glHref: GlHref }): { table: ReportTable; totals: PlTotals; compareTotals: PlTotals | null } {
  const { moves, compare } = p;
  const before = new Map((compare ?? []).map((a) => [a.id, plAmount(a)]));
  const current = new Map(moves.map((a) => [a.id, a]));
  const totals = plTotals(moves);
  const old = compare ? plTotals(compare) : null;
  const rows: Cell[][] = [];
  const strong: number[] = [];
  const levels: Record<number, number> = {};
  const links: Record<number, string> = {};
  const row = (label: string, now: number | null, then: number | null, opts: { bold?: boolean; level?: number; link?: string } = {}) => {
    const i = rows.length;
    const change = now != null && compare ? add([now, -(then ?? 0)]) : null;
    rows.push(compare ? [label, now, then, change] : [label, now]);
    if (opts.bold) strong.push(i);
    if (opts.level) levels[i] = opts.level;
    if (opts.link) links[i] = opts.link;
  };
  const section = (title: string, s: PlSection, total: (t: PlTotals) => number) => {
    // an account with something in either period, even when it is missing from the other
    const accounts = [...new Map([...(compare ?? []), ...moves].map((a) => [a.id, a])).values()].filter((a) => plSection(a) === s && !a.isGroup).sort((x, y) => x.code.localeCompare(y.code));
    const nowOf = (a: Move) => (current.has(a.id) ? plAmount(current.get(a.id) as Move) : 0);
    const shown = accounts.filter((a) => m(nowOf(a)) || m(before.get(a.id) ?? 0));
    if (!shown.length) return;
    row(title, null, null, { bold: true });
    for (const a of shown) row(`${a.code} ${a.name}`, nowOf(a), compare ? (before.get(a.id) ?? 0) : null, { level: 1, link: p.glHref(a.id) });
    row(`Total ${title.toLowerCase()}`, total(totals), old ? total(old) : null, { bold: true });
  };
  section("Sales", "sales", (t) => t.sales);
  section("Cost of sales", "cogs", (t) => t.cogs);
  row("Gross profit", totals.gross, old?.gross ?? null, { bold: true });
  section("Other income", "other", (t) => t.other);
  section("Operating expenses", "opex", (t) => t.opex);
  row("Operating profit", totals.operating, old?.operating ?? null, { bold: true });
  section("Tax on profit", "tax", (t) => t.tax);
  return {
    table: {
      title: "Profit and loss",
      columns: compare ? [{ label: "" }, { label: "This period", kind: "money" }, { label: p.compareTitle ?? "Compared", kind: "money" }, { label: "Change", kind: "money" }] : [{ label: "" }, { label: "AED", kind: "money" }],
      rows,
      strong,
      levels,
      links,
      total: compare ? ["Net profit", totals.profit, old?.profit ?? 0, add([totals.profit, -(old?.profit ?? 0)])] : ["Net profit", totals.profit],
    },
    totals,
    compareTotals: old,
  };
}

/** Month by month: the headline lines of the profit and loss. */
export function buildPlByMonth(rows: readonly (Pick<Move, "type" | "subtype" | "debit" | "credit"> & { month: string })[], months: readonly string[], label: (m: string) => string): ReportTable {
  const lines = months.map((mo) => ({ mo, t: plTotals(rows.filter((r) => r.month === mo)) }));
  const all = plTotals(rows);
  return {
    title: "Month by month",
    columns: [{ label: "Month" }, { label: "Sales", kind: "money" }, { label: "Cost of sales", kind: "money" }, { label: "Gross profit", kind: "money" }, { label: "Expenses", kind: "money" }, { label: "Net profit", kind: "money" }],
    rows: lines.map(({ mo, t }) => [label(mo), t.sales, t.cogs, t.gross, add([t.opex, -t.other, t.tax]), t.profit]),
    total: ["Total", all.sales, all.cogs, all.gross, add([all.opex, -all.other, all.tax]), all.profit],
  };
}

export interface BsInput {
  accounts: readonly AccountRow[];
  /** Debits less credits of each account up to the day. */
  balances: ReadonlyMap<number, number>;
  /** Profit of earlier fiscal years not yet moved to retained earnings, and of this one (positive = profit). */
  earlierProfit: number;
  yearProfit: number;
}

/** Natural-side balances of a tree of accounts, parents included, in chart order. */
function walkTree(accounts: readonly AccountRow[], balances: ReadonlyMap<number, number>, type: AccountType) {
  const of = accounts.filter((a) => a.type === type);
  const ids = new Set(of.map((a) => a.id));
  const kids = new Map<number | null, AccountRow[]>();
  for (const a of of) {
    const parent = a.parentId && ids.has(a.parentId) ? a.parentId : null;
    kids.set(parent, [...(kids.get(parent) ?? []), a]);
  }
  for (const list of kids.values()) list.sort((x, y) => x.code.localeCompare(y.code));
  const out: { a: AccountRow; depth: number; amount: number }[] = [];
  const walk = (parent: number | null, depth: number): number => {
    let sum = 0;
    for (const a of kids.get(parent) ?? []) {
      const at = out.length;
      out.push({ a, depth, amount: 0 });
      const own = m(balances.get(a.id) ?? 0) * (debitNormal(type) ? 1 : -1);
      const total = own + walk(a.id, depth + 1);
      out[at].amount = fm(total);
      sum += total;
    }
    return sum;
  };
  const total = walk(null, 0);
  return { rows: out, total: fm(total) };
}

/**
 * The balance sheet on a day. Assets = liabilities + equity always holds when the ledger balances, because the profit
 * still sitting in income and expense accounts is shown under equity (earlier years, and this year).
 */
export function buildBalanceSheet(p: { now: BsInput; then?: BsInput; thenTitle?: string; glHref: GlHref }): {
  table: ReportTable;
  assets: number;
  liabilities: number;
  equity: number;
  difference: number;
  openingEquity: number;
} {
  const rows: Cell[][] = [];
  const strong: number[] = [];
  const levels: Record<number, number> = {};
  const links: Record<number, string> = {};
  const compare = !!p.then;
  const push = (label: string, now: number | null, then: number | null, opts: { bold?: boolean; level?: number; link?: string } = {}) => {
    const i = rows.length;
    rows.push(compare ? [label, now, then] : [label, now]);
    if (opts.bold) strong.push(i);
    if (opts.level) levels[i] = opts.level;
    if (opts.link) links[i] = opts.link;
  };
  const section = (type: AccountType, extra: { label: string; now: number; then: number }[] = []) => {
    const a = walkTree(p.now.accounts, p.now.balances, type);
    const b = p.then ? walkTree(p.then.accounts, p.then.balances, type) : null;
    const thenOf = new Map((b?.rows ?? []).map((r) => [r.a.id, r.amount]));
    for (const r of a.rows) {
      const then = thenOf.get(r.a.id) ?? 0;
      if (!m(r.amount) && !m(then)) continue;
      push(r.a.isGroup ? r.a.name : `${r.a.code} ${r.a.name}`, r.amount, compare ? then : null, { bold: r.a.isGroup && r.depth === 0, level: r.depth, link: r.a.isGroup ? undefined : p.glHref(r.a.id) });
    }
    for (const e of extra) if (m(e.now) || m(e.then)) push(e.label, e.now, compare ? e.then : null, { level: 1 });
    return { now: add([a.total, ...extra.map((e) => e.now)]), then: add([b?.total ?? 0, ...extra.map((e) => e.then)]) };
  };
  const assets = section("asset");
  push("Total assets", assets.now, compare ? assets.then : null, { bold: true });
  const liab = section("liability");
  push("Total liabilities", liab.now, compare ? liab.then : null, { bold: true });
  const equity = section("equity", [
    { label: "Profit of earlier years", now: p.now.earlierProfit, then: p.then?.earlierProfit ?? 0 },
    { label: "Profit this year", now: p.now.yearProfit, then: p.then?.yearProfit ?? 0 },
  ]);
  push("Total equity", equity.now, compare ? equity.then : null, { bold: true });
  const le = add([liab.now, equity.now]);
  const leThen = add([liab.then, equity.then]);
  const openingKey = p.now.accounts.find((a) => a.systemKey === "opening_equity");
  return {
    table: {
      title: "Balance sheet",
      columns: compare ? [{ label: "" }, { label: "AED", kind: "money" }, { label: p.thenTitle ?? "Compared", kind: "money" }] : [{ label: "" }, { label: "AED", kind: "money" }],
      rows,
      strong,
      levels,
      links,
      total: compare ? ["Total liabilities and equity", le, leThen] : ["Total liabilities and equity", le],
    },
    assets: assets.now,
    liabilities: liab.now,
    equity: equity.now,
    difference: add([assets.now, -le]),
    openingEquity: openingKey ? -(p.now.balances.get(openingKey.id) ?? 0) || 0 : 0,
  };
}

/**
 * The cash flow statement, indirect method: profit, adjusted for what did not move cash and for the change in working
 * capital; then fixed assets; then loans and owners' money. Opening balances from Zoho are not movements, so `moves`
 * must leave them out and `openingCash` must include them. The last line checks the result against the cash accounts.
 */
export function buildCashFlow(p: { moves: readonly Move[]; openingCash: number; closingCash: number; glHref: GlHref }): { table: ReportTable; operating: number; investing: number; financing: number; change: number; difference: number } {
  const { moves } = p;
  const profit = plTotals(moves).profit;
  const isCash = (a: AccountRow) => a.subtype === "cash" || a.subtype === "bank";
  /** Cash effect of a balance sheet account: an asset going up uses cash, a liability going up brings it in. */
  const effect = (a: Move) => fm(-m(net(a)));
  const bs = moves.filter((a) => !a.isGroup && !isCash(a) && (a.type === "asset" || a.type === "liability" || a.type === "equity"));
  const depreciation = bs.filter((a) => a.systemKey === "accum_depreciation");
  const investing = bs.filter((a) => a.subtype === "fixed_asset" && a.systemKey !== "accum_depreciation");
  const financing = bs.filter((a) => a.type === "equity" || a.subtype === "loan" || a.subtype === "credit_card");
  const skip = new Set([...depreciation, ...investing, ...financing].map((a) => a.id));
  const working = bs.filter((a) => !skip.has(a.id));

  const rows: Cell[][] = [];
  const strong: number[] = [];
  const levels: Record<number, number> = {};
  const links: Record<number, string> = {};
  const push = (label: string, v: number | null, o: { bold?: boolean; level?: number; link?: string } = {}) => {
    const i = rows.length;
    rows.push([label, v]);
    if (o.bold) strong.push(i);
    if (o.level) levels[i] = o.level;
    if (o.link) links[i] = o.link;
  };
  const lines = (list: Move[]) => {
    for (const a of [...list].sort((x, y) => x.code.localeCompare(y.code))) if (m(effect(a))) push(`${a.code} ${a.name}`, effect(a), { level: 1, link: p.glHref(a.id) });
    return add(list.map(effect));
  };
  push("From operations", null, { bold: true });
  push("Net profit", profit, { level: 1 });
  const dep = lines(depreciation);
  const wc = lines(working);
  const operating = add([profit, dep, wc]);
  push("Cash from operations", operating, { bold: true });
  push("From investing (fixed assets)", null, { bold: true });
  const inv = lines(investing);
  push("Cash from investing", inv, { bold: true });
  push("From financing (loans and owners)", null, { bold: true });
  const fin = lines(financing);
  push("Cash from financing", fin, { bold: true });
  const change = add([operating, inv, fin]);
  push("Net change in cash", change, { bold: true });
  push("Cash at the start", p.openingCash);
  return {
    table: { title: "Cash flow", columns: [{ label: "" }, { label: "AED", kind: "money" }], rows, strong, levels, links, total: ["Cash at the end", p.closingCash] },
    operating,
    investing: inv,
    financing: fin,
    change,
    difference: add([p.openingCash, change, -p.closingCash]),
  };
}

export type LedgerLine = {
  entryId: number;
  number: string;
  date: string;
  memo: string;
  description: string;
  party: string | null;
  debit: number;
  credit: number;
};

/** One account's lines with a running balance on its natural side. */
export function buildAccountLedger(a: Pick<AccountRow, "code" | "name" | "type">, opening: number, lines: readonly LedgerLine[]): ReportTable {
  const side = debitNormal(a.type) ? 1 : -1;
  let bal = m(opening) * side;
  const rows: Cell[][] = [[null, null, "Balance brought forward", null, null, fm(bal)]];
  const links: Record<number, string> = {};
  let d = 0, c = 0;
  for (const l of lines) {
    bal += (m(l.debit) - m(l.credit)) * side;
    d += m(l.debit);
    c += m(l.credit);
    links[rows.length] = `/accounts/journals/${l.entryId}`;
    rows.push([l.date, l.number, [l.memo, l.description && !(l.memo ?? "").includes(l.description) ? l.description : "", l.party ?? ""].filter(Boolean).join(" · "), l.debit || null, l.credit || null, fm(bal)]);
  }
  return {
    title: `${a.code} ${a.name}`,
    columns: [{ label: "Date", kind: "date" }, { label: "Entry" }, { label: "Details" }, { label: "Debit", kind: "money" }, { label: "Credit", kind: "money" }, { label: "Balance", kind: "money" }],
    rows,
    links,
    total: ["Closing balance", null, null, fm(d), fm(c), fm(bal)],
  };
}

export type AgedDoc = {
  number: string;
  partyId: number | null;
  party: string;
  issueDate: string;
  dueDate: string;
  total: number;
  balance: number;
  href: string;
};

/** Whole days a due date is behind a day (0 or less: not late). */
export const daysLate = (due: string, asOf: string) => Math.round((Date.parse(asOf) - Date.parse(due)) / 86400_000);

/**
 * What is owed on a day, by how late: one row per customer or supplier, then the documents themselves. Open items come
 * from the documents, because a ledger balance cannot say which invoice is late; `ledger` shows they agree.
 */
export function buildAgeing(p: { title: string; partyLabel: string; docs: readonly AgedDoc[]; asOf: string; period: string; ledger: number | null; ledgerName: string; partyHref: (id: number) => string }): Report {
  const open = p.docs.filter((d) => m(d.balance) !== 0);
  const keys = AGE_BUCKETS.map((b) => b.key);
  const byParty = new Map<string, { id: number | null; name: string; cells: number[] }>();
  for (const d of open) {
    const k = String(d.partyId ?? d.party);
    const cur = byParty.get(k) ?? { id: d.partyId, name: d.party, cells: keys.map(() => 0) };
    cur.cells[keys.indexOf(ageBucket(daysLate(d.dueDate, p.asOf)))] += m(d.balance);
    byParty.set(k, cur);
  }
  const parties = [...byParty.values()].sort((a, b) => sumMinor(b.cells) - sumMinor(a.cells) || a.name.localeCompare(b.name));
  const bucketTotals = keys.map((_, i) => sumMinor(parties.map((x) => x.cells[i])));
  const owed = sumMinor(bucketTotals);
  const overdue = owed - bucketTotals[0];
  const summaryLinks: Record<number, string> = {};
  parties.forEach((x, i) => {
    if (x.id) summaryLinks[i] = p.partyHref(x.id);
  });
  const detail = [...open].sort((a, b) => daysLate(b.dueDate, p.asOf) - daysLate(a.dueDate, p.asOf) || a.number.localeCompare(b.number));
  const detailLinks: Record<number, string> = {};
  detail.forEach((d, i) => {
    detailLinks[i] = d.href;
  });
  const diff = p.ledger == null ? null : fm(m(p.ledger) - owed);
  return {
    title: p.title,
    period: p.period,
    landscape: true,
    kpis: [
      { label: "Total", value: fm(owed), kind: "money" },
      { label: "Overdue", value: fm(overdue), kind: "money" },
      { label: "Documents", value: open.length, kind: "int" },
      ...(p.ledger == null ? [] : [{ label: `In the ledger (${p.ledgerName})`, value: p.ledger, kind: "money" as const, hint: diff ? `Differs by ${diff}` : "Agrees" }]),
    ],
    tables: [
      {
        title: `By ${p.partyLabel.toLowerCase()}`,
        columns: [{ label: p.partyLabel }, ...AGE_BUCKETS.map((b) => ({ label: b.label, kind: "money" as const })), { label: "Total", kind: "money" }],
        rows: parties.map((x) => [x.name, ...x.cells.map(fm), fm(sumMinor(x.cells))]),
        links: summaryLinks,
        total: ["Total", ...bucketTotals.map(fm), fm(owed)],
      },
      {
        title: "Documents",
        columns: [{ label: "Document" }, { label: p.partyLabel }, { label: "Date", kind: "date" }, { label: "Due", kind: "date" }, { label: "Days late", kind: "int" }, { label: "Total", kind: "money" }, { label: "Still owed", kind: "money" }],
        rows: detail.map((d) => {
          const late = daysLate(d.dueDate, p.asOf);
          return [d.number, d.party, d.issueDate, d.dueDate, late > 0 ? late : null, d.total, d.balance];
        }),
        links: detailLinks,
        total: ["Total", null, null, null, null, null, fm(owed)],
      },
    ],
  };
}
