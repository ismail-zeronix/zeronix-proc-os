/**
 * Opening balances from Zoho, with no database: read a trial balance export, suggest our account for each line, and
 * build the one opening entry. lib/ledger/opening-data.ts feeds it the customer and supplier balances at cut-over.
 */
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import type { PostLine } from "./post";

export type Cell = string | number | null;

export interface TbRow {
  name: string;
  code: string;
  debit: number;
  credit: number;
}

/** "1,234.56", "(1,234.56)", "AED 1,234", "-50" → number; empty → 0. */
export function parseAmount(v: Cell): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = v.trim();
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()\s,]|AED|INR|USD|Dr|Cr/gi, "").replace(/^-/, ""));
  return Number.isFinite(n) ? (negative ? -n : n) : 0;
}

const text = (v: Cell) => (v == null ? "" : String(v).trim());

/**
 * Reads a trial balance grid (Zoho's export, or any sheet with Account / Debit / Credit columns). Net Debit / Net
 * Credit columns win over plain Debit / Credit; heading and total rows are skipped; each row comes back on one side.
 */
export function parseTrialBalance(grid: Cell[][]): { rows: TbRow[]; problem: string | null } {
  const headerAt = grid.findIndex((r) => r.some((c) => /account/i.test(text(c))) && r.some((c) => /debit/i.test(text(c))) && r.some((c) => /credit/i.test(text(c))));
  if (headerAt < 0) return { rows: [], problem: "No header row with Account, Debit and Credit columns was found. Export the trial balance from Zoho as XLSX or CSV." };
  const h = grid[headerAt].map(text);
  const col = (...res: RegExp[]) => {
    for (const re of res) {
      const i = h.findIndex((x) => re.test(x));
      if (i >= 0) return i;
    }
    return -1;
  };
  const nameCol = col(/^account( name)?$/i, /account(?! code| no| number)/i);
  const codeCol = col(/account (code|no|number)/i, /^code$/i);
  const debitCol = col(/net debit/i, /closing.*debit/i, /debit/i);
  const creditCol = col(/net credit/i, /closing.*credit/i, /credit/i);
  const rows: TbRow[] = [];
  for (const r of grid.slice(headerAt + 1)) {
    const name = text(r[nameCol]);
    if (!name || /^(grand )?total\b/i.test(name)) continue;
    const net = toMinor(parseAmount(r[debitCol])) - toMinor(parseAmount(r[creditCol]));
    if (net === 0) continue;
    rows.push({ name, code: codeCol >= 0 ? text(r[codeCol]) : "", debit: net > 0 ? fromMinor(net) : 0, credit: net < 0 ? fromMinor(-net) : 0 });
  }
  if (!rows.length) return { rows, problem: "The sheet has the right columns but no balances in them." };
  return { rows, problem: null };
}

export interface AccountLite {
  id: number;
  code: string;
  name: string;
  systemKey: string | null;
}

/** Zoho names that mean one of our system accounts. First match wins. */
const HINTS: [RegExp, string][] = [
  [/accounts? receivable|debtors|trade receivable/i, "ar"],
  [/accounts? payable|creditors|trade payable/i, "ap"],
  [/input vat|vat (input|receivable|recoverable)|tax receivable/i, "vat_input"],
  [/output vat|vat output/i, "vat_output"],
  [/vat payable|tax payable|vat control/i, "vat_payable"],
  [/inventory|stock/i, "inventory"],
  [/petty cash/i, "petty_cash"],
  [/undeposited|cash in hand|^cash$/i, "cash"],
  [/retained earnings/i, "retained_earnings"],
  [/opening balance (offset|adjustment|equity)/i, "opening_equity"],
  [/drawings|owner'?s? (equity|current|drawing)/i, "owner_current"],
  [/capital/i, "share_capital"],
  [/cost of goods sold|cost of sales|cogs/i, "cogs"],
  [/advance from customer|customer advance|unearned/i, "customer_advances"],
  [/prepaid/i, "prepaid"],
  [/deposit/i, "deposits"],
  [/salar(y|ies) payable/i, "salaries_payable"],
  [/end of service|gratuity/i, "eosb"],
  [/bank charge/i, "exp_bank"],
  [/rent/i, "exp_rent"],
  [/salar|wage/i, "exp_salaries"],
  [/discount/i, "sales_returns"],
  [/sales|revenue|income from/i, "sales_products"],
  [/bank|current account|enbd|adcb|mashreq|fab\b|rakbank|cbd\b|adib|dib\b/i, "bank"],
];

/** Our account for a Zoho line: what was picked last time, then the same code or name, then a known name. */
export function suggestAccount(row: Pick<TbRow, "name" | "code">, accounts: AccountLite[], saved: Record<string, number> = {}): number | null {
  const remembered = saved[row.name];
  if (remembered && accounts.some((a) => a.id === remembered)) return remembered;
  const lower = row.name.toLowerCase();
  const byName = accounts.find((a) => a.name.toLowerCase() === lower);
  if (byName) return byName.id;
  if (row.code) {
    const byCode = accounts.find((a) => a.code === row.code);
    if (byCode) return byCode.id;
  }
  for (const [re, key] of HINTS) {
    if (re.test(row.name)) {
      const a = accounts.find((x) => x.systemKey === key);
      if (a) return a.id;
    }
  }
  return null;
}

export interface PartyBalance {
  id: number;
  name: string;
  /** Customers: what they owe (positive). Suppliers: what we owe them (positive). */
  amount: number;
}

export interface OpeningPlan {
  lines: PostLine[];
  /** Zoho's receivables minus what the portal's open invoices add up to (put on receivables without a customer). */
  arUnmatched: number;
  apUnmatched: number;
  /** Debits minus credits of the trial balance itself (put on Opening balance equity). */
  imbalance: number;
}

/**
 * The opening entry. Mapped rows become lines; the receivables and payables rows are split per customer and supplier
 * (so statements and ageing work from day one), with any difference to Zoho kept visible as an unmatched line; if the
 * trial balance does not balance, the difference goes to Opening balance equity.
 */
export function buildOpening(p: {
  rows: { accountId: number; debit: number; credit: number; name: string }[];
  arAccountId: number;
  apAccountId: number;
  equityAccountId: number;
  customers: PartyBalance[];
  suppliers: PartyBalance[];
}): OpeningPlan {
  const lines: PostLine[] = [];
  const side = (minor: number) => (minor > 0 ? { debit: fromMinor(minor) } : { credit: fromMinor(-minor) });
  const net = (r: { debit: number; credit: number }) => toMinor(r.debit) - toMinor(r.credit);
  const byAccount = new Map<number, { minor: number; names: string[] }>();
  for (const r of p.rows) {
    const cur = byAccount.get(r.accountId) ?? { minor: 0, names: [] };
    cur.minor += net(r);
    cur.names.push(r.name);
    byAccount.set(r.accountId, cur);
  }

  const split = (accountId: number, parties: PartyBalance[], partyType: "customer" | "supplier", sign: 1 | -1) => {
    const total = byAccount.get(accountId)?.minor ?? 0;
    let assigned = 0;
    for (const c of parties) {
      const m = toMinor(c.amount) * sign;
      if (m === 0) continue;
      assigned += m;
      lines.push({ account: accountId, ...side(m), partyType, partyId: c.id, description: `Opening balance: ${c.name}` });
    }
    const rest = total - assigned;
    if (rest !== 0) lines.push({ account: accountId, ...side(rest), description: `Opening balance not matched to a ${partyType} in the portal` });
    byAccount.delete(accountId);
    return fromMinor(rest * sign);
  };
  const arUnmatched = split(p.arAccountId, p.customers, "customer", 1);
  const apUnmatched = split(p.apAccountId, p.suppliers, "supplier", -1);

  for (const [accountId, { minor, names }] of byAccount) {
    if (minor !== 0) lines.push({ account: accountId, ...side(minor), description: `Opening balance (Zoho: ${names.join(", ").slice(0, 200)})` });
  }
  const imbalance = sumMinor(lines.map((l) => toMinor(l.debit ?? 0) - toMinor(l.credit ?? 0)));
  if (imbalance !== 0) lines.push({ account: p.equityAccountId, ...side(-imbalance), description: "Trial balance did not balance: difference to opening balance equity" });
  return { lines, arUnmatched, apUnmatched, imbalance: fromMinor(imbalance) };
}
