import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AE_TRADING, categorySystemKey, debitNormal } from "@/lib/ledger/coa-templates";
import { drCr, journalProblem, journalTotals, sourceHref } from "@/lib/ledger/journal";
import { CATEGORIES } from "@/lib/purchases";
import { aeVat } from "@/lib/tax/ae-vat";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

describe("UAE trading chart of accounts", () => {
  const byCode = new Map(AE_TRADING.accounts.map((a) => [a.code, a]));

  it("has unique codes and system keys, and every parent is an earlier group of the same type", () => {
    expect(byCode.size).toBe(AE_TRADING.accounts.length);
    const keys = AE_TRADING.accounts.map((a) => a.systemKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    AE_TRADING.accounts.forEach((a, i) => {
      if (!a.parent) return;
      const p = byCode.get(a.parent);
      expect(p, `${a.code} parent ${a.parent}`).toBeTruthy();
      expect(p?.group).toBe(true);
      expect(p?.type).toBe(a.type);
      expect(AE_TRADING.accounts.findIndex((x) => x.code === a.parent)).toBeLessThan(i);
    });
    expect(AE_TRADING.accounts.every((a) => !a.group || !a.systemKey)).toBe(true);
  });

  it("has an account for every purchases category and every VAT code", () => {
    const keys = new Set(AE_TRADING.accounts.map((a) => a.systemKey));
    for (const c of CATEGORIES) expect(keys.has(categorySystemKey(c.key)), c.key).toBe(true);
    for (const c of aeVat.codes) {
      const acc = AE_TRADING.taxAccounts[c.code];
      expect(acc, c.code).toBeTruthy();
      for (const k of [acc.sales, acc.purchase].filter(Boolean)) expect(keys.has(k), `${c.code} → ${k}`).toBe(true);
    }
    for (const k of ["ar", "ap", "vat_output", "vat_input", "inventory", "cogs", "cash", "bank", "retained_earnings", "opening_equity", "rounding"]) expect(keys.has(k), k).toBe(true);
  });

  it("knows which side each type grows on", () => {
    expect(debitNormal("asset")).toBe(true);
    expect(debitNormal("expense")).toBe(true);
    expect(debitNormal("income")).toBe(false);
    expect(debitNormal("liability")).toBe(false);
  });
});

describe("journal rules", () => {
  it("accepts balanced entries and explains the rest", () => {
    expect(journalProblem([{ debit: 100 }, { credit: 60 }, { credit: 40 }])).toBeNull();
    expect(journalProblem([{ debit: 0.1 }, { debit: 0.2 }, { credit: 0.3 }])).toBeNull();
    expect(journalProblem([{ debit: 100 }])).toMatch(/two lines/);
    expect(journalProblem([{ debit: 100 }, { credit: 99.99 }])).toMatch(/must be equal/);
    expect(journalProblem([{ debit: 100, credit: 100 }, { credit: 0 }])).toMatch(/either a debit or a credit/);
    expect(journalProblem([{ debit: 0 }, { credit: 0 }])).toMatch(/either/);
    expect(journalProblem([{ debit: -5 }, { credit: -5 }])).toMatch(/below zero/);
  });

  it("totals and shows sides", () => {
    expect(journalTotals([{ debit: 0.1 }, { debit: 0.2 }, { credit: 0.25 }])).toEqual({ debit: 0.3, credit: 0.25, difference: 0.05 });
    expect(drCr(1200)).toBe("1,200.00 Dr");
    expect(drCr(-350.5)).toBe("350.50 Cr");
    expect(drCr(0.001)).toBe("0.00");
    expect(sourceHref("invoice", 7)).toBe("/accounts/invoices/7");
    expect(sourceHref("manual", null)).toBeNull();
  });
});

const live = !!process.env.DATABASE_URL;

describe.skipIf(!live)("ledger in the database (a throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let L: typeof import("@/lib/ledger/post");
  let S: typeof import("@/lib/ledger/setup");
  let O: typeof import("@/lib/org");
  let orgId = 0;
  const year = new Date().getFullYear();
  const day = `${year}-01-15`;

  const inOrg = <T,>(fn: (tx: import("@/lib/tx").Tx) => Promise<T>) => O.withOrg(orgId, fn);
  const raw = async (q: string) => (await db.execute(D.sql.raw(q))).rows as Record<string, unknown>[];
  /** Drizzle wraps database errors ("Failed query: ..."): the trigger's own words are in `cause`. */
  const dbError = async (p: Promise<unknown>) => {
    try {
      await p;
      return "no error";
    } catch (e) {
      const err = e as Error & { cause?: Error };
      return `${err.message} | ${err.cause?.message ?? ""}`;
    }
  };

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    L = await import("@/lib/ledger/post");
    S = await import("@/lib/ledger/setup");
    O = await import("@/lib/org");
    const [o] = await db.insert(schema.organizations).values({ name: `ZZLEDGER${Date.now()}` }).returning({ id: schema.organizations.id });
    orgId = o.id;
  });

  afterAll(async () => {
    if (!orgId) return;
    await db.transaction(async (tx) => {
      await tx.execute(D.sql`SET LOCAL app.ledger_maintenance = 'on'`);
      const o = orgId;
      await tx.execute(D.sql`DELETE FROM journal_lines WHERE organization_id = ${o}`);
      await tx.execute(D.sql`DELETE FROM journal_entries WHERE organization_id = ${o} AND reversal_of_id IS NOT NULL`);
      await tx.execute(D.sql`DELETE FROM journal_entries WHERE organization_id = ${o}`);
      await tx.execute(D.sql`DELETE FROM tax_code_components WHERE organization_id = ${o}`);
      await tx.execute(D.sql`DELETE FROM tax_codes WHERE organization_id = ${o}`);
      await tx.execute(D.sql`DELETE FROM bank_accounts WHERE organization_id = ${o}`);
      await tx.execute(D.sql`DELETE FROM accounts WHERE organization_id = ${o}`);
      await tx.execute(D.sql`DELETE FROM accounting_settings WHERE organization_id = ${o}`);
      await tx.execute(D.sql`DELETE FROM doc_series WHERE organization_id = ${o}`);
      await tx.execute(D.sql`DELETE FROM audit_log WHERE organization_id = ${o}`);
      await tx.execute(D.sql`DELETE FROM organizations WHERE id = ${o}`);
    });
  });

  it("sets up the books once: accounts, tax codes, cash and bank, settings", async () => {
    await S.ledgerReady(orgId);
    await S.ledgerReady(orgId);
    const [acc] = await raw(`SELECT count(*)::int n FROM accounts WHERE organization_id = ${orgId}`);
    const [tax] = await raw(`SELECT count(*)::int n FROM tax_codes WHERE organization_id = ${orgId}`);
    const banks = await raw(`SELECT kind, is_default FROM bank_accounts WHERE organization_id = ${orgId} ORDER BY kind`);
    const [set] = await raw(`SELECT coa_template, coa_version FROM accounting_settings WHERE organization_id = ${orgId}`);
    expect(acc.n).toBe(AE_TRADING.accounts.length);
    expect(tax.n).toBe(aeVat.codes.length);
    expect(banks).toEqual([
      { kind: "bank", is_default: true },
      { kind: "cash", is_default: true },
    ]);
    expect(set).toEqual({ coa_template: "ae-trading", coa_version: AE_TRADING.version });
    const [sr] = await raw(
      `SELECT s.system_key sales, p.system_key purchase FROM tax_code_components c JOIN tax_codes t ON t.id = c.tax_code_id LEFT JOIN accounts s ON s.id = c.sales_account_id LEFT JOIN accounts p ON p.id = c.purchase_account_id WHERE t.organization_id = ${orgId} AND t.code = 'SR'`,
    );
    expect(sr).toEqual({ sales: "vat_output", purchase: "vat_input" });
  });

  it("posts a balanced entry by system keys, numbered in its own organisation's series", async () => {
    const p = await inOrg((tx) =>
      L.postEntry(tx, {
        orgId,
        date: day,
        sourceType: "manual",
        memo: "Owner puts money in",
        lines: [
          { account: "bank", debit: 10000 },
          { account: "share_capital", credit: 10000 },
        ],
      }),
    );
    expect(p.number).toBe(`JV-${year}-0001`);
    const sale = await inOrg((tx) =>
      L.postEntry(tx, {
        orgId,
        date: day,
        sourceType: "invoice",
        sourceId: 999001,
        memo: "test sale",
        lines: [
          { account: "ar", debit: 1050, partyType: "customer", partyId: 1 },
          { account: "sales_products", credit: 1000 },
          { account: "vat_output", credit: 50, taxCode: "SR", taxBase: 1000 },
        ],
      }),
    );
    expect(sale.number).toBe(`JV-${year}-0002`);
    const [vat] = await raw(`SELECT l.tax_base::float base, t.code FROM journal_lines l JOIN tax_codes t ON t.id = l.tax_code_id WHERE l.entry_id = ${sale.id}`);
    expect(vat).toEqual({ base: 1000, code: "SR" });
    // the same document posting again is refused (idempotent source key)
    await expect(
      inOrg((tx) => L.postEntry(tx, { orgId, date: day, sourceType: "invoice", sourceId: 999001, lines: [{ account: "ar", debit: 1 }, { account: "sales_products", credit: 1 }] })),
    ).rejects.toThrow();
  });

  it("rolls balances up the chart", async () => {
    const { chartOfAccounts } = await import("@/lib/ledger/data");
    const chart = await chartOfAccounts(orgId);
    const get = (code: string) => chart.find((r) => r.code === code)!;
    expect(get("1150").natural).toBe(10000);
    expect(get("1100").natural).toBe(10000); // cash and bank group
    expect(get("1000").natural).toBe(11050); // all assets: bank + receivable
    expect(get("2210").natural).toBe(50); // VAT output, a credit-side account
    expect(get("1150").depth).toBe(2);
  });

  it("refuses unbalanced, single-line and group-account entries in the app and in the database", async () => {
    await expect(inOrg((tx) => L.postEntry(tx, { orgId, date: day, sourceType: "manual", lines: [{ account: "bank", debit: 10 }, { account: "share_capital", credit: 9 }] }))).rejects.toThrow(/must be equal/);
    const [group] = await raw(`SELECT id FROM accounts WHERE organization_id = ${orgId} AND code = '1000'`);
    await expect(inOrg((tx) => L.postEntry(tx, { orgId, date: day, sourceType: "manual", lines: [{ account: group.id as number, debit: 10 }, { account: "share_capital", credit: 10 }] }))).rejects.toThrow(/group/);
    const [bank] = await raw(`SELECT id FROM accounts WHERE organization_id = ${orgId} AND system_key = 'bank'`);
    // straight SQL, past the app: the commit-time trigger still refuses
    expect(await dbError(db.transaction(async (tx) => {
        const [e] = (await tx.execute(D.sql`INSERT INTO journal_entries (organization_id, number, date, source_type, total) VALUES (${orgId}, 'ZZ-RAW-1', ${day}, 'manual', 10) RETURNING id`)).rows as { id: number }[];
        await tx.execute(D.sql`INSERT INTO journal_lines (organization_id, entry_id, line_no, account_id, debit) VALUES (${orgId}, ${e.id}, 1, ${bank.id as number}, 10)`);
      }))).toMatch(/at least two lines|balance/);
    expect(await dbError(db.transaction(async (tx) => {
        const [e] = (await tx.execute(D.sql`INSERT INTO journal_entries (organization_id, number, date, source_type, total) VALUES (${orgId}, 'ZZ-RAW-2', ${day}, 'manual', 10) RETURNING id`)).rows as { id: number }[];
        await tx.execute(D.sql`INSERT INTO journal_lines (organization_id, entry_id, line_no, account_id, debit) VALUES (${orgId}, ${e.id}, 1, ${bank.id as number}, 10)`);
        await tx.execute(D.sql`INSERT INTO journal_lines (organization_id, entry_id, line_no, account_id, credit) VALUES (${orgId}, ${e.id}, 2, ${group.id as number}, 10)`);
      }))).toMatch(/group account/);
  });

  it("never lets a posted entry change or disappear", async () => {
    const [line] = await raw(`SELECT id, entry_id FROM journal_lines WHERE organization_id = ${orgId} LIMIT 1`);
    expect(await dbError(db.execute(D.sql`UPDATE journal_lines SET debit = debit + 1 WHERE id = ${line.id as number}`))).toMatch(/cannot be changed/);
    expect(await dbError(db.execute(D.sql`DELETE FROM journal_lines WHERE id = ${line.id as number}`))).toMatch(/cannot be changed/);
    expect(await dbError(db.execute(D.sql`UPDATE journal_entries SET memo = 'x' WHERE id = ${line.entry_id as number}`))).toMatch(/cannot be changed/);
  });

  it("keeps lines inside their own organisation", async () => {
    const [mine] = await raw(`SELECT id FROM accounts WHERE organization_id = ${orgId} AND system_key = 'cash'`);
    const [theirs] = await raw(`SELECT id FROM accounts WHERE organization_id <> ${orgId} AND is_group = false LIMIT 1`);
    if (!theirs) return; // no other organisation has books yet
    expect(await dbError(db.transaction(async (tx) => {
        const [e] = (await tx.execute(D.sql`INSERT INTO journal_entries (organization_id, number, date, source_type, total) VALUES (${orgId}, 'ZZ-RAW-3', ${day}, 'manual', 5) RETURNING id`)).rows as { id: number }[];
        await tx.execute(D.sql`INSERT INTO journal_lines (organization_id, entry_id, line_no, account_id, debit) VALUES (${orgId}, ${e.id}, 1, ${mine.id as number}, 5)`);
        await tx.execute(D.sql`INSERT INTO journal_lines (organization_id, entry_id, line_no, account_id, credit) VALUES (${orgId}, ${e.id}, 2, ${theirs.id as number}, 5)`);
      }))).toMatch(/own organisation/);
  });

  it("reverses once, carries tax codes across, and moves a reversal past the lock date", async () => {
    const [sale] = await raw(`SELECT id FROM journal_entries WHERE organization_id = ${orgId} AND source_type = 'invoice' AND source_id = 999001`);
    await db.update(schema.accountingSettings).set({ lockDate: `${year}-01-31` }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    const rev = await inOrg((tx) => L.reverseEntry(tx, { orgId, entryId: sale.id as number, reason: "test" }));
    const [e] = await raw(`SELECT date::text, purpose, memo FROM journal_entries WHERE id = ${rev.id}`);
    expect(e).toMatchObject({ date: `${year}-02-01`, purpose: "post:rev" });
    const [vat] = await raw(`SELECT l.debit::float debit, l.tax_base::float base, t.code FROM journal_lines l JOIN tax_codes t ON t.id = l.tax_code_id WHERE l.entry_id = ${rev.id}`);
    expect(vat).toEqual({ debit: 50, base: -1000, code: "SR" });
    await expect(inOrg((tx) => L.reverseEntry(tx, { orgId, entryId: sale.id as number, reason: "again" }))).rejects.toThrow(/already reversed/);
    await expect(inOrg((tx) => L.reverseEntry(tx, { orgId, entryId: rev.id, reason: "undo the undo" }))).rejects.toThrow(/itself a reversal/);
  });

  it("refuses anything dated on or before the lock date, in the app and in the database", async () => {
    await expect(
      inOrg((tx) => L.postEntry(tx, { orgId, date: `${year}-01-31`, sourceType: "manual", lines: [{ account: "bank", debit: 1 }, { account: "share_capital", credit: 1 }] })),
    ).rejects.toThrow(/locked up to/);
    expect(await dbError(db.execute(D.sql`INSERT INTO journal_entries (organization_id, number, date, source_type, total) VALUES (${orgId}, 'ZZ-RAW-4', ${`${year}-01-10`}, 'manual', 1)`))).toMatch(/locked up to/);
    const ok = await inOrg((tx) => L.postEntry(tx, { orgId, date: `${year}-02-02`, sourceType: "manual", lines: [{ account: "bank", debit: 1 }, { account: "share_capital", credit: 1 }] }));
    expect(ok.number).toMatch(new RegExp(`^JV-${year}-\\d{4}$`));
  });
});
