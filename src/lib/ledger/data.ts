import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema } from "@/db";
import { withOrg } from "@/lib/org";
import type { Tx } from "@/lib/tx";
import { debitNormal, type AccountType } from "./coa-templates";
import { ensureLedger } from "./setup";

export interface ChartRow {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  parentId: number | null;
  isGroup: boolean;
  systemKey: string | null;
  isActive: boolean;
  description: string;
  /** Debits minus credits; for groups, of everything under them. */
  balance: number;
  /** The balance on the account's natural side (assets and expenses: debits; the rest: credits). */
  natural: number;
  lines: number;
  depth: number;
}

/** The chart of accounts as a tree in code order, with balances (groups add up their children). */
export function chartOfAccounts(orgId: number): Promise<ChartRow[]> {
  return withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const a = schema.ledgerAccounts;
    const l = schema.journalLines;
    const rows = await tx
      .select({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        parentId: a.parentId,
        isGroup: a.isGroup,
        systemKey: a.systemKey,
        isActive: a.isActive,
        description: a.description,
        balance: sql<number>`coalesce(sum(${l.debit} - ${l.credit}), 0)::float`,
        lines: sql<number>`count(${l.id})::int`,
      })
      .from(a)
      .leftJoin(l, eq(l.accountId, a.id))
      .where(eq(a.organizationId, orgId))
      .groupBy(a.id)
      .orderBy(asc(a.code));

    const kids = new Map<number | null, typeof rows>();
    for (const r of rows) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r]);
    const out: ChartRow[] = [];
    const walk = (parent: number | null, depth: number): number => {
      let sum = 0;
      for (const r of kids.get(parent) ?? []) {
        const at = out.length;
        out.push({ ...r, depth, natural: 0 });
        const under = walk(r.id, depth + 1);
        const balance = Math.round((r.balance + under) * 100) / 100;
        out[at].balance = balance;
        out[at].natural = debitNormal(r.type) ? balance : -balance;
        sum += balance;
      }
      return sum;
    };
    walk(null, 0);
    // accounts whose parent was removed from view (should not happen) still show, at the top level
    const seen = new Set(out.map((r) => r.id));
    for (const r of rows) if (!seen.has(r.id)) out.push({ ...r, depth: 0, natural: debitNormal(r.type) ? r.balance : -r.balance });
    return out;
  });
}

export interface AccountOption {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  systemKey: string | null;
}

/** Accounts people may post to by hand: leaf and switched on. */
export function postableAccounts(orgId: number): Promise<AccountOption[]> {
  return withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const a = schema.ledgerAccounts;
    return tx
      .select({ id: a.id, code: a.code, name: a.name, type: a.type, systemKey: a.systemKey })
      .from(a)
      .where(and(eq(a.organizationId, orgId), eq(a.isGroup, false), eq(a.isActive, true)))
      .orderBy(asc(a.code));
  });
}

/** Who a journal line can name: every customer and supplier. */
export function partyOptions(orgId: number) {
  return withOrg(orgId, async (tx) => {
    const [customers, suppliers] = await Promise.all([
      tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).orderBy(asc(schema.companies.name)),
      tx.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
    ]);
    return { customers, suppliers };
  });
}

export interface StockCountRow {
  id: number;
  number: string;
  date: string;
  memo: string;
  total: number;
  reversedBy: string | null;
  isReversal: boolean;
}

/** The closing stock screen: what Inventory shows on a day, and the counts posted so far. */
export function stockPosition(orgId: number, day: string): Promise<{ book: number; start: string | null; counts: StockCountRow[] }> {
  return withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const e = schema.journalEntries;
    const rev = alias(schema.journalEntries, "rev");
    const [settings] = await tx.select({ start: schema.accountingSettings.cutoverDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
    const counts = await tx
      .select({ id: e.id, number: e.number, date: e.date, memo: e.memo, total: e.total, reversedBy: rev.number, isReversal: sql<boolean>`${e.reversalOfId} IS NOT NULL` })
      .from(e)
      .leftJoin(rev, eq(rev.reversalOfId, e.id))
      .where(and(eq(e.organizationId, orgId), eq(e.sourceType, "stock_count")))
      .orderBy(desc(e.date), desc(e.id));
    return { book: await inventoryBalance(tx, orgId, day), start: settings?.start ?? null, counts };
  });
}

/** What Inventory shows at the end of a day. */
export async function inventoryBalance(tx: Tx, orgId: number, day: string): Promise<number> {
  const res = await tx.execute<{ b: number }>(sql`
    SELECT coalesce(sum(l.debit - l.credit), 0)::float AS b
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND a.system_key = 'inventory' AND e.date <= ${day}`);
  return Math.round(Number(res.rows[0].b) * 100) / 100;
}

export const JOURNALS_PAGE = 50;

export interface JournalListRow {
  id: number;
  number: string;
  date: string;
  sourceType: string;
  sourceId: number | null;
  memo: string;
  total: number;
  reversalOfNumber: string | null;
  reversedByNumber: string | null;
  createdByName: string | null;
}

/** Journal entries, newest first, a page at a time. `source` = "manual" for hand-posted only, "auto" for documents. */
export function listJournals(orgId: number, opts: { page?: number; size?: number; source?: "manual" | "auto" | "all"; sort?: "date" | "number" | "total"; dir?: "asc" | "desc" } = {}): Promise<{ rows: JournalListRow[]; total: number }> {
  return withOrg(orgId, async (tx) => {
    const e = schema.journalEntries;
    const orig = alias(schema.journalEntries, "orig");
    const rev = alias(schema.journalEntries, "rev");
    const manual = sql`${e.sourceType} IN ('manual', 'opening', 'stock_count')`;
    const where = and(eq(e.organizationId, orgId), opts.source === "manual" ? manual : opts.source === "auto" ? sql`NOT (${manual})` : undefined);
    const page = Math.max(1, opts.page ?? 1);
    const size = opts.size ?? JOURNALS_PAGE;
    const by = { date: e.date, number: e.number, total: e.total }[opts.sort ?? "date"];
    const [rows, [{ n }]] = await Promise.all([
      tx
        .select({
          id: e.id,
          number: e.number,
          date: e.date,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          memo: e.memo,
          total: e.total,
          reversalOfNumber: orig.number,
          reversedByNumber: rev.number,
          createdByName: schema.users.name,
        })
        .from(e)
        .leftJoin(orig, eq(orig.id, e.reversalOfId))
        .leftJoin(rev, eq(rev.reversalOfId, e.id))
        .leftJoin(schema.users, eq(schema.users.id, e.createdBy))
        .where(where)
        .orderBy(opts.dir === "asc" ? asc(by) : desc(by), desc(e.id))
        .limit(size)
        .offset((page - 1) * size),
      tx.select({ n: count() }).from(e).where(where),
    ]);
    return { rows, total: n };
  });
}

/** Bank and cash accounts in use, for the picker on payment forms. */
export async function bankAccountOptions(orgId: number) {
  return withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const b = schema.bankAccounts;
    return tx.select({ id: b.id, name: b.name, kind: b.kind, isDefault: b.isDefault }).from(b).where(and(eq(b.organizationId, orgId), eq(b.isActive, true))).orderBy(desc(b.isDefault), asc(b.name));
  });
}

export interface JournalLineView {
  lineNo: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
  partyType: "customer" | "supplier" | null;
  partyId: number | null;
  partyName: string | null;
  taxCode: string | null;
  taxBase: number | null;
}

/** One entry with its lines, who posted it, and what reversed it (or what it reverses). */
export function getJournal(orgId: number, id: number) {
  return withOrg(orgId, async (tx) => {
    const e = schema.journalEntries;
    const orig = alias(schema.journalEntries, "orig");
    const rev = alias(schema.journalEntries, "rev");
    const [entry] = await tx
      .select({
        id: e.id,
        number: e.number,
        date: e.date,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        purpose: e.purpose,
        memo: e.memo,
        total: e.total,
        currency: e.currency,
        createdAt: e.createdAt,
        createdByName: schema.users.name,
        reversalOf: { id: orig.id, number: orig.number },
        reversedBy: { id: rev.id, number: rev.number },
      })
      .from(e)
      .leftJoin(orig, eq(orig.id, e.reversalOfId))
      .leftJoin(rev, eq(rev.reversalOfId, e.id))
      .leftJoin(schema.users, eq(schema.users.id, e.createdBy))
      .where(and(eq(e.id, id), eq(e.organizationId, orgId)));
    if (!entry) return null;
    const l = schema.journalLines;
    const lines: JournalLineView[] = await tx
      .select({
        lineNo: l.lineNo,
        accountId: l.accountId,
        accountCode: schema.ledgerAccounts.code,
        accountName: schema.ledgerAccounts.name,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
        partyType: l.partyType,
        partyId: l.partyId,
        partyName: sql<string | null>`CASE ${l.partyType} WHEN 'customer' THEN ${schema.companies.name} WHEN 'supplier' THEN ${schema.suppliers.name} END`,
        taxCode: schema.taxCodes.code,
        taxBase: l.taxBase,
      })
      .from(l)
      .innerJoin(schema.ledgerAccounts, eq(schema.ledgerAccounts.id, l.accountId))
      .leftJoin(schema.companies, and(eq(l.partyType, "customer"), eq(schema.companies.id, l.partyId)))
      .leftJoin(schema.suppliers, and(eq(l.partyType, "supplier"), eq(schema.suppliers.id, l.partyId)))
      .leftJoin(schema.taxCodes, eq(schema.taxCodes.id, l.taxCodeId))
      .where(eq(l.entryId, id))
      .orderBy(asc(l.lineNo));
    return {
      ...entry,
      reversalOf: entry.reversalOf?.id ? entry.reversalOf : null,
      reversedBy: entry.reversedBy?.id ? entry.reversedBy : null,
      lines,
    };
  });
}

export interface TaxCodeRow {
  id: number;
  code: string;
  label: string;
  ratePct: number;
  selfAssessed: boolean;
  saleBoxes: string[];
  purchaseBoxes: string[];
  isActive: boolean;
  salesAccount: string | null;
  purchaseAccount: string | null;
}

/** The organisation's tax codes with the accounts their tax posts to. */
export function listTaxCodes(orgId: number): Promise<TaxCodeRow[]> {
  return withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const sa = alias(schema.ledgerAccounts, "sa");
    const pa = alias(schema.ledgerAccounts, "pa");
    const t = schema.taxCodes;
    const c = schema.taxCodeComponents;
    return tx
      .select({
        id: t.id,
        code: t.code,
        label: t.label,
        ratePct: t.ratePct,
        selfAssessed: t.selfAssessed,
        saleBoxes: t.saleBoxes,
        purchaseBoxes: t.purchaseBoxes,
        isActive: t.isActive,
        salesAccount: sql<string | null>`${sa.code} || ' ' || ${sa.name}`,
        purchaseAccount: sql<string | null>`${pa.code} || ' ' || ${pa.name}`,
      })
      .from(t)
      .leftJoin(c, eq(c.taxCodeId, t.id))
      .leftJoin(sa, eq(sa.id, c.salesAccountId))
      .leftJoin(pa, eq(pa.id, c.purchaseAccountId))
      .where(eq(t.organizationId, orgId))
      .orderBy(asc(t.id));
  });
}
