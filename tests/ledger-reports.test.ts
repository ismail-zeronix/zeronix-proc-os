import "dotenv/config";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccountType } from "@/lib/ledger/coa-templates";
import { buildAccountLedger, buildAgeing, buildBalanceSheet, buildCashFlow, buildProfitLoss, buildTrialBalance, daysLate, plTotals, type AccountRow, type Move } from "@/lib/ledger/reports/build";
import { compareRange, fiscalYearStart, parseReportParams, REPORT_GROUPS, reportDef, reportQuery } from "@/lib/report-centre";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
/** Reports in this file read a throwaway organisation, so Zeronix's books are never touched. */
const mockOrg = vi.hoisted(() => ({ id: 0 }));
vi.mock("@/lib/org", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/org")>();
  return { ...real, currentOrgId: async () => mockOrg.id || real.DEFAULT_ORG_ID };
});

let nextId = 1;
const acc = (code: string, name: string, type: AccountType, subtype = "other", systemKey: string | null = null, parentId: number | null = null, isGroup = false): AccountRow => ({ id: nextId++, code, name, type, subtype, systemKey, parentId, isGroup });
const mv = (a: AccountRow, debit = 0, credit = 0, opening = 0): Move => ({ ...a, debit, credit, opening });
const noLink = () => "/x";

const bank = acc("1150", "Bank", "asset", "bank", "bank");
const ar = acc("1210", "Receivable", "asset", "receivable", "ar");
const equipment = acc("1710", "IT equipment", "asset", "fixed_asset");
const depAcc = acc("1790", "Accumulated depreciation", "asset", "fixed_asset", "accum_depreciation");
const ap = acc("2110", "Payable", "liability", "payable", "ap");
const loan = acc("2410", "Owner loan", "liability", "loan", "owner_loan");
const capital = acc("3100", "Share capital", "equity", "other", "share_capital");
const sales = acc("4100", "Sales", "income", "sales", "sales_products");
const fx = acc("4900", "FX gain", "income", "other_income", "fx_gain");
const cogs = acc("5100", "COGS", "expense", "cogs", "cogs");
const rent = acc("6100", "Rent", "expense", "other", "exp_rent");
const depExp = acc("6950", "Depreciation", "expense", "other", "depreciation");
const ct = acc("7100", "Corporate tax", "expense", "tax", "ct_expense");

describe("report periods", () => {
  it("compares whole months with whole months, and other ranges day for day", () => {
    expect(compareRange("2026-07-01", "2026-09-30", "prev")).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(compareRange("2026-03-01", "2026-03-31", "prev")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(compareRange("2026-01-01", "2026-01-31", "prev")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(compareRange("2026-01-10", "2026-01-19", "prev")).toEqual({ from: "2025-12-31", to: "2026-01-09" });
    expect(compareRange("2026-07-01", "2026-09-30", "year")).toEqual({ from: "2025-07-01", to: "2025-09-30" });
    // a month's end stays a month's end across a leap year
    expect(compareRange("2024-02-01", "2024-02-29", "year")).toEqual({ from: "2023-02-01", to: "2023-02-28" });
    expect(compareRange("2025-02-01", "2025-02-28", "year")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("finds the start of a fiscal year (UAE January, India April)", () => {
    expect(fiscalYearStart("2026-11-05", 1)).toBe("2026-01-01");
    expect(fiscalYearStart("2026-11-05", 4)).toBe("2026-04-01");
    expect(fiscalYearStart("2026-02-05", 4)).toBe("2025-04-01");
  });

  it("carries a report's settings in the URL and back, and ignores nonsense", () => {
    const get = (q: string) => {
      const u = new URLSearchParams(q);
      return (k: string) => u.get(k);
    };
    const today = "2026-11-05";
    const a = parseReportParams(get("r=pl&period=last-quarter&compare=year"), today);
    expect(a).toMatchObject({ key: "pl", periodKey: "last-quarter", from: "2026-07-01", to: "2026-09-30", compare: "year" });
    expect(parseReportParams(get(reportQuery(a)), today)).toEqual(a);
    const b = parseReportParams(get("r=bs&to=2026-06-30"), today);
    expect(b).toMatchObject({ key: "bs", to: "2026-06-30", label: expect.stringContaining("As of") });
    expect(parseReportParams(get(reportQuery(b)), today)).toEqual(b);
    const c = parseReportParams(get("r=gl&from=2026-01-01&to=2026-01-31&account=7"), today);
    expect(c).toMatchObject({ periodKey: "custom", account: 7 });
    expect(parseReportParams(get(reportQuery(c)), today)).toEqual(c);
    expect(parseReportParams(get("r=nonsense"), today).key).toBe("pl");
    expect(parseReportParams(get("r=gl&account=abc&compare=year"), today)).toMatchObject({ account: null, compare: "none" });
    expect(parseReportParams(get("r=receivables"), today).key).toBe("aged-ar");
    expect(parseReportParams(get("r=bs"), today).to).toBe(today);
  });

  it("gives every report a unique key made of letters and dashes (it goes in print paths)", () => {
    const keys = REPORT_GROUPS.flatMap((g) => g.reports.map((r) => r.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z-]+$/);
    expect(reportDef("audit")?.accountant).toBe(true);
  });
});

describe("financial statements", () => {
  it("keeps the trial balance on its two sides and flags a difference", () => {
    const { table, debit, credit, difference } = buildTrialBalance([mv(bank, 500, 100, 1000), mv(capital, 0, 0, -1000), mv(sales, 0, 400), mv(rent, 0, 0)], noLink);
    expect(table.rows.map((r) => r[0])).toEqual(["1150", "3100", "4100"]); // rent has nothing on it
    expect(table.rows[0]).toEqual(["1150", "Bank", 1000, null, 500, 100, 1400, null]);
    expect(table.rows[1]).toEqual(["3100", "Share capital", null, 1000, null, null, null, 1000]);
    expect(table.total).toEqual(["Total", null, 1000, 1000, 500, 500, 1400, 1400]);
    expect({ debit, credit, difference }).toEqual({ debit: 1400, credit: 1400, difference: 0 });
    expect(buildTrialBalance([mv(bank, 10)], noLink).difference).toBe(10);
  });

  const period = [mv(sales, 100, 10100), mv(fx, 0, 50), mv(cogs, 6000), mv(rent, 1500), mv(depExp, 250), mv(ct, 200)];

  it("adds up the profit and loss in the usual layout, returns taking sales down", () => {
    expect(plTotals(period)).toEqual({ sales: 10000, cogs: 6000, gross: 4000, other: 50, opex: 1750, operating: 2300, tax: 200, profit: 2100 });
    const { table } = buildProfitLoss({ moves: period, glHref: noLink });
    const labels = table.rows.map((r) => r[0]);
    expect(labels).toEqual(["Sales", "4100 Sales", "Total sales", "Cost of sales", "5100 COGS", "Total cost of sales", "Gross profit", "Other income", "4900 FX gain", "Total other income", "Operating expenses", "6100 Rent", "6950 Depreciation", "Total operating expenses", "Operating profit", "Tax on profit", "7100 Corporate tax", "Total tax on profit"]);
    expect(table.total).toEqual(["Net profit", 2100]);
    expect(table.levels?.[1]).toBe(1);
    expect(table.links?.[1]).toBe("/x");
  });

  it("compares two periods, showing accounts in either", () => {
    const { table, compareTotals } = buildProfitLoss({ moves: [mv(sales, 0, 1000)], compare: [mv(sales, 0, 800), mv(rent, 100)], compareTitle: "Last year", glHref: noLink });
    expect(table.columns.map((c) => c.label)).toEqual(["", "This period", "Last year", "Change"]);
    expect(table.rows.find((r) => r[0] === "4100 Sales")).toEqual(["4100 Sales", 1000, 800, 200]);
    expect(table.rows.find((r) => r[0] === "6100 Rent")).toEqual(["6100 Rent", 0, 100, -100]);
    expect(compareTotals?.profit).toBe(700);
    expect(table.total).toEqual(["Net profit", 1000, 700, 300]);
  });

  it("balances the balance sheet, with undistributed profit under equity", () => {
    const groupA = acc("1000", "Assets", "asset", "group", null, null, true);
    const cash = { ...bank, parentId: groupA.id };
    const recv = { ...ar, parentId: groupA.id };
    const accounts = [groupA, cash, recv, ap, capital, sales, rent];
    const balances = new Map<number, number>([
      [cash.id, 3000],
      [recv.id, 1500],
      [ap.id, -500],
      [capital.id, -1000],
      [sales.id, -5000], // not on the sheet directly: it is the profit below
      [rent.id, 2000],
    ]);
    const b = buildBalanceSheet({ now: { accounts, balances, earlierProfit: 1000, yearProfit: 2000 }, glHref: noLink });
    expect(b).toMatchObject({ assets: 4500, liabilities: 500, equity: 4000, difference: 0 });
    const labels = b.table.rows.map((r) => r[0]);
    expect(labels).toEqual(["Assets", "1150 Bank", "1210 Receivable", "Total assets", "2110 Payable", "Total liabilities", "3100 Share capital", "Profit of earlier years", "Profit this year", "Total equity"]);
    expect(b.table.rows[0][1]).toBe(4500); // the group adds up its accounts
    expect(b.table.levels?.[1]).toBe(1);
    expect(b.table.total).toEqual(["Total liabilities and equity", 4500]);
    // an unbalanced ledger cannot hide
    expect(buildBalanceSheet({ now: { accounts, balances, earlierProfit: 0, yearProfit: 2000 }, glHref: noLink }).difference).toBe(1000);
  });

  it("shows contra assets as negatives and a comparison column", () => {
    const b = buildBalanceSheet({
      now: { accounts: [equipment, depAcc, capital], balances: new Map([[equipment.id, 1000], [depAcc.id, -200], [capital.id, -800]]), earlierProfit: 0, yearProfit: 0 },
      then: { accounts: [equipment, depAcc, capital], balances: new Map([[equipment.id, 1000], [capital.id, -1000]]), earlierProfit: 0, yearProfit: 0 },
      thenTitle: "Before",
      glHref: noLink,
    });
    expect(b.table.rows.find((r) => r[0] === "1790 Accumulated depreciation")).toEqual(["1790 Accumulated depreciation", -200, 0]);
    expect(b.assets).toBe(800);
    expect(b.table.columns[2].label).toBe("Before");
  });

  it("ties the cash flow to the cash accounts, sorting movements into the three activities", () => {
    // profit 1,000 (sales 3,000, rent 1,750, depreciation 250); owed by customers up 800; owed to suppliers up 300;
    // bought equipment 1,200; owner lent 500. Cash: 1,000 + 250 - 800 + 300 - 1,200 + 500 = 50
    const moves = [mv(sales, 0, 3000), mv(rent, 1750), mv(depExp, 250), mv(depAcc, 0, 250), mv(ar, 800), mv(ap, 0, 300), mv(equipment, 1200), mv(loan, 0, 500), mv(bank, 50)];
    const c = buildCashFlow({ moves, openingCash: 2000, closingCash: 2050, glHref: noLink });
    expect(c).toMatchObject({ operating: 750, investing: -1200, financing: 500, change: 50, difference: 0 });
    expect(c.table.total).toEqual(["Cash at the end", 2050]);
    expect(buildCashFlow({ moves, openingCash: 2000, closingCash: 2100, glHref: noLink }).difference).toBe(-50);
  });

  it("runs an account's balance on its natural side", () => {
    const line = (debit: number, credit: number, number: string) => ({ entryId: 9, number, date: "2026-01-02", memo: "m", description: "m", party: null, debit, credit });
    const asset = buildAccountLedger(bank, 100, [line(50, 0, "JV-1"), line(0, 30, "JV-2")]);
    expect(asset.rows.map((r) => r[5])).toEqual([100, 150, 120]);
    expect(asset.total).toEqual(["Closing balance", null, null, 50, 30, 120]);
    expect(asset.links?.[1]).toBe("/accounts/journals/9");
    const liability = buildAccountLedger(ap, -100, [line(0, 50, "JV-3")]);
    expect(liability.rows.map((r) => r[5])).toEqual([100, 150]);
  });

  it("ages what is owed on the day asked, and shows whether the ledger agrees", () => {
    const doc = (number: string, party: string, partyId: number, dueDate: string, balance: number) => ({ number, party, partyId, issueDate: "2026-01-01", dueDate, total: balance, balance, href: `/d/${number}` });
    const r = buildAgeing({
      title: "Customers owe",
      partyLabel: "Customer",
      docs: [doc("A", "Acme", 1, "2026-03-20", 100), doc("B", "Acme", 1, "2026-02-15", 200), doc("C", "Globex", 2, "2025-11-01", 300), doc("D", "Paid", 3, "2026-01-01", 0)],
      asOf: "2026-03-01",
      period: "p",
      ledger: 650,
      ledgerName: "Accounts receivable",
      partyHref: (id) => `/p/${id}`,
    });
    expect(daysLate("2026-02-15", "2026-03-01")).toBe(14);
    expect(r.kpis.slice(0, 3).map((k) => k.value)).toEqual([600, 500, 3]);
    expect(r.kpis[3]).toMatchObject({ value: 650, hint: "Differs by 50" });
    expect(r.tables[0].rows).toEqual([
      ["Acme", 100, 200, 0, 0, 0, 300],
      ["Globex", 0, 0, 0, 0, 300, 300],
    ]);
    expect(r.tables[0].total).toEqual(["Total", 100, 200, 0, 0, 300, 600]);
    expect(r.tables[1].rows.map((x) => x[0])).toEqual(["C", "B", "A"]); // latest first, paid ones gone
    expect(r.tables[1].rows[2][4]).toBeNull(); // not late
    expect(r.tables[1].links?.[0]).toBe("/d/C");
  });
});

describe("Excel export", () => {
  it("writes numbers as numbers, dates as dates, and text as text even when it looks like a formula", async () => {
    const { reportToXlsx } = await import("@/lib/export/xlsx");
    const buf = await reportToXlsx(
      {
        title: "Test: report/one",
        period: "January",
        landscape: true,
        kpis: [{ label: "Total", value: 12.5, kind: "money" }],
        tables: [
          {
            title: "Lines",
            columns: [{ label: "Name" }, { label: "When", kind: "date" }, { label: "AED", kind: "money" }],
            rows: [
              ["=cmd()", "2026-01-15", 1234.5],
              ["Sub", null, -2],
            ],
            strong: [1],
            levels: { 0: 1 },
            total: ["Total", null, 1232.5],
            note: "A note",
          },
        ],
      },
      "Zeronix",
      "Downloaded",
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("Test  report one");
    const find = (text: string) => {
      let at = 0;
      ws.eachRow((row, n) => {
        if (row.getCell(1).value === text) at = n;
      });
      return ws.getRow(at);
    };
    const row = find("=cmd()");
    expect(row.getCell(1).type).toBe(ExcelJS.ValueType.String);
    expect(row.getCell(1).formula).toBeFalsy();
    expect(row.getCell(1).alignment?.indent).toBe(1);
    expect(row.getCell(2).type).toBe(ExcelJS.ValueType.Date);
    expect(row.getCell(3).value).toBe(1234.5);
    expect(row.getCell(3).numFmt).toContain("#,##0.00");
    expect(find("Sub").getCell(1).font?.bold).toBe(true);
    expect(find("Total").getCell(1).value).toBe("Total");
    expect(ws.pageSetup.orientation).toBe("landscape");
  });
});

describe("PDF allow-list", () => {
  it("takes our print pages and reports, and nothing else", async () => {
    const { printPageToPdf } = await import("@/lib/pdf");
    for (const bad of ["/admin/users", "/print/invoice/abc", "/print/invoice/1/../../admin", "/print/report/pl?x=<script>", "/print/report/PL", "//evil.test/print/invoice/1", "/print/report/pl?next=https://evil.test"]) {
      expect(() => printPageToPdf(bad, "s"), bad).toThrow(/Only print pages/);
    }
  });
});

const live = !!process.env.DATABASE_URL;

describe.skipIf(!live)("reports on a real ledger (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let L: typeof import("@/lib/ledger/post");
  let O: typeof import("@/lib/org");
  let R: typeof import("@/lib/report-run");
  const tag = `ZZLR${Date.now()}`;
  let orgId = 0;
  let companyId = 0;
  let supplierId = 0;
  const today = "2099-06-15";
  const params = (q: string) => {
    const u = new URLSearchParams(q);
    return parseReportParams((k) => u.get(k), today);
  };
  const post = (date: string, lines: import("@/lib/ledger/post").PostLine[], sourceType = "manual") => O.withOrg(orgId, (tx) => L.postEntry(tx, { orgId, date, sourceType, memo: `${tag} ${date}`, lines }));

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    L = await import("@/lib/ledger/post");
    O = await import("@/lib/org");
    R = await import("@/lib/report-run");
    const S = await import("@/lib/ledger/setup");
    orgId = (await db.insert(schema.organizations).values({ name: tag }).returning({ id: schema.organizations.id }))[0].id;
    await S.ledgerReady(orgId);
    await db.update(schema.accountingSettings).set({ cutoverDate: "2099-01-01" }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    mockOrg.id = orgId;
    companyId = (await db.insert(schema.companies).values({ name: `${tag} Customer`, nameNorm: `${tag.toLowerCase()} customer` }).returning({ id: schema.companies.id }))[0].id;
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier` }).returning({ id: schema.suppliers.id }))[0].id;

    // opening balances from "Zoho": cash, a customer's balance, capital
    await post(
      "2098-12-31",
      [
        { account: "bank", debit: 50000 },
        { account: "ar", debit: 10000, partyType: "customer", partyId: companyId },
        { account: "share_capital", credit: 60000 },
      ],
      "opening",
    );
    // January: a sale, its cost, rent; March: the customer pays, equipment bought, owner lends
    await post("2099-01-10", [{ account: "ar", debit: 10500, partyType: "customer", partyId: companyId }, { account: "sales_products", credit: 10000, taxCode: "SR", taxBase: 10000 }, { account: "vat_output", credit: 500, taxCode: "SR" }]);
    await post("2099-01-10", [{ account: "cogs", debit: 6000 }, { account: "inventory", credit: 6000 }]);
    await post("2099-01-05", [{ account: "inventory", debit: 6000 }, { account: "ap", credit: 6000, partyType: "supplier", partyId: supplierId }]);
    await post("2099-01-31", [{ account: "exp_rent", debit: 1500 }, { account: "bank", credit: 1500 }]);
    await post("2099-03-02", [{ account: "bank", debit: 5000 }, { account: "ar", credit: 5000, partyType: "customer", partyId: companyId }]);
    const [itAcc] = (await db.execute<{ id: number }>(D.sql`SELECT id FROM accounts WHERE organization_id = ${orgId} AND code = '1710'`)).rows;
    await post("2099-03-03", [{ account: Number(itAcc.id), debit: 2000 }, { account: "bank", credit: 2000 }]);
    await post("2099-03-04", [{ account: "bank", debit: 3000 }, { account: "owner_loan", credit: 3000 }]);
  });

  afterAll(async () => {
    mockOrg.id = 0;
    if (!orgId) return;
    const { sql } = D;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.ledger_maintenance = 'on'`);
      await tx.execute(sql`DELETE FROM journal_lines WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM journal_entries WHERE organization_id = ${orgId} AND reversal_of_id IS NOT NULL`);
      await tx.execute(sql`DELETE FROM journal_entries WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE number LIKE ${tag + "%"})`);
      await tx.execute(sql`DELETE FROM payments WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM invoices WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM bills WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM companies WHERE id = ${companyId}`);
      await tx.execute(sql`DELETE FROM suppliers WHERE id = ${supplierId}`);
      for (const t of ["tax_code_components", "tax_codes", "bank_accounts", "accounts", "accounting_settings", "doc_series", "audit_log"]) await tx.execute(sql.raw(`DELETE FROM ${t} WHERE organization_id = ${orgId}`));
      await tx.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    });
  });

  const kpi = (r: import("@/lib/reports").Report, label: string) => r.kpis.find((k) => k.label === label)?.value;

  it("trial balance balances, with opening balances brought forward", async () => {
    const r = await R.runCentreReport(params("r=tb&from=2099-01-01&to=2099-03-31"));
    expect(kpi(r, "Difference")).toBe(0);
    const bankRow = r.tables[0].rows.find((x) => x[0] === "1150")!;
    expect(bankRow.slice(2)).toEqual([50000, null, 8000, 3500, 54500, null]);
    expect(r.notice).toBeUndefined();
  });

  it("profit and loss, with a comparison that sees the earlier period", async () => {
    const r = await R.runCentreReport(params("r=pl&from=2099-01-01&to=2099-03-31"));
    expect(kpi(r, "Sales")).toBe(10000);
    expect(kpi(r, "Gross profit")).toBe(4000);
    expect(kpi(r, "Expenses")).toBe(1500);
    expect(kpi(r, "Net profit")).toBe(2500);
    expect(r.tables[1].rows.map((x) => x[0])).toHaveLength(3); // month by month
    expect(r.tables[1].total?.[5]).toBe(2500);
    const q2 = await R.runCentreReport(params("r=pl&from=2099-04-01&to=2099-06-30&compare=prev"));
    expect(q2.tables[0].total).toEqual(["Net profit", 0, 2500, -2500]);
  });

  it("balance sheet balances on any day, with this year's profit under equity", async () => {
    const r = await R.runCentreReport(params("r=bs&to=2099-03-31"));
    expect(kpi(r, "Difference")).toBe(0);
    expect(kpi(r, "Assets")).toBe(54500 + 15500 + 2000); // bank, receivable (10,000 + 10,500 - 5,000), equipment
    expect(kpi(r, "Liabilities")).toBe(6000 + 500 + 3000); // payable, VAT, loan
    expect(kpi(r, "Equity")).toBe(60000 + 2500);
    expect(r.tables[0].rows.find((x) => x[0] === "Profit this year")?.[1]).toBe(2500);
    const before = await R.runCentreReport(params("r=bs&to=2099-01-07"));
    expect(kpi(before, "Difference")).toBe(0);
    expect(kpi(before, "Assets")).toBe(50000 + 10000 + 6000);
    const compared = await R.runCentreReport(params("r=bs&to=2099-03-31&compare=prev"));
    expect(compared.tables[0].columns).toHaveLength(3);
    expect(compared.tables[0].total?.[2]).toBe(kpi(await R.runCentreReport(params("r=bs&to=2099-02-28")), "Assets"));
  });

  it("cash flow ties to the bank, leaving the opening entry out of the movements", async () => {
    const r = await R.runCentreReport(params("r=cf&from=2098-12-01&to=2099-03-31"));
    expect(r.tables[0].note).toBeUndefined();
    expect(kpi(r, "Net change")).toBe(4500); // -1,500 rent + 5,000 received - 2,000 equipment + 3,000 loan
    expect(kpi(r, "From investing")).toBe(-2000);
    expect(kpi(r, "From financing")).toBe(3000);
    expect(r.tables[0].rows.find((x) => x[0] === "Cash at the start")?.[1]).toBe(50000);
    expect(r.tables[0].total).toEqual(["Cash at the end", 54500]);
  });

  it("general ledger and day book show the lines, and link to their entries", async () => {
    const [bankAcc] = (await db.execute<{ id: number }>(D.sql`SELECT id FROM accounts WHERE organization_id = ${orgId} AND system_key = 'bank'`)).rows;
    const gl = await R.runCentreReport(params(`r=gl&from=2099-01-01&to=2099-03-31&account=${bankAcc.id}`));
    expect(gl.title).toContain("1150");
    expect(gl.tables).toHaveLength(1);
    expect(gl.tables[0].rows[0][5]).toBe(50000);
    expect(gl.tables[0].total?.[5]).toBe(54500);
    expect(gl.tables[0].links?.[1]).toMatch(/^\/accounts\/journals\/\d+$/);
    const all = await R.runCentreReport(params("r=gl&from=2099-01-01&to=2099-03-31"));
    expect(all.tables.length).toBeGreaterThan(5);
    const book = await R.runCentreReport(params("r=daybook&from=2099-01-01&to=2099-03-31"));
    expect(kpi(book, "Entries")).toBe(7);
    expect(book.tables[0].total?.[4]).toBe(book.tables[0].total?.[5]);
  });

  it("ageing compares open documents with the ledger, on the day asked", async () => {
    const [inv] = await db
      .insert(schema.invoices)
      .values({ number: `${tag}-I1`, kind: "opening", companyId, issueDate: "2098-11-01", supplyDate: "2098-11-01", termsDays: 30, dueDate: "2098-12-01", customerName: `${tag} Customer`, vatPct: 0, subtotal: 10000, vatAmount: 0, total: 10000 })
      .returning({ id: schema.invoices.id });
    const [p1] = await db.insert(schema.payments).values({ year: 2099, seq: 99000 + (Date.now() % 900), number: `${tag}-P1`, companyId, paidOn: "2099-03-02", amount: 5000, method: "bank" }).returning({ id: schema.payments.id });
    await db.insert(schema.paymentAllocations).values({ paymentId: p1.id, invoiceId: inv.id, amount: 5000, appliedOn: "2099-03-02" });
    const before = await R.runCentreReport(params("r=aged-ar&to=2099-02-01"));
    const row = (r: import("@/lib/reports").Report) => r.tables[1].rows.find((x) => x[0] === `${tag}-I1`);
    expect(row(before)?.[6]).toBe(10000);
    expect(row(before)?.[4]).toBe(62);
    const after = await R.runCentreReport(params("r=aged-ar&to=2099-03-31"));
    expect(row(after)?.[6]).toBe(5000); // the payment counts from its date on
    expect(after.kpis.find((k) => k.label.startsWith("In the ledger"))?.value).toBe(15500);
    const st = await R.runCentreReport(params(`r=customer-statement&party=${companyId}&from=2099-01-01&to=2099-12-31`));
    expect(st.tables[0].total?.[5]).toBe(5000);
  });

  it("runs every report in the catalogue, in every shape, on an empty and a busy period", async () => {
    for (const r of REPORT_GROUPS.flatMap((g) => g.reports)) {
      for (const q of [`r=${r.key}&from=2099-01-01&to=2099-12-31&party=${r.pick === "supplier" ? supplierId : companyId}`, `r=${r.key}&from=2000-01-01&to=2000-01-31`]) {
        const report = await R.runCentreReport(params(q));
        expect(report.title, r.key).toBeTruthy();
        for (const t of report.tables) for (const row of t.rows) expect(row.length, `${r.key} ${t.title}`).toBe(t.columns.length);
      }
    }
  });

  it("keeps audit reports to accountants", () => {
    expect(R.canOpenReport("audit", { finance: true, accountant: false })).toBe(false);
    expect(R.canOpenReport("audit", { finance: true, accountant: true })).toBe(true);
    expect(R.canOpenReport("pl", { finance: true, accountant: false })).toBe(true);
    expect(R.canOpenReport("pl", { finance: false, accountant: true })).toBe(false);
  });

  it("says so plainly when the ledger is off", async () => {
    await db.update(schema.accountingSettings).set({ cutoverDate: null }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    const r = await R.runCentreReport(params("r=pl"));
    expect(r.notice).toMatch(/not switched on/);
    await db.update(schema.accountingSettings).set({ cutoverDate: "2099-01-01" }).where(D.eq(schema.accountingSettings.organizationId, orgId));
  });
});
