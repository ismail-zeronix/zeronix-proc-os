import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestOrg } from "./helpers/orgs";
import { journalProblem } from "@/lib/ledger/journal";
import { buildOpening, parseAmount, parseTrialBalance, suggestAccount } from "@/lib/ledger/opening";
import { billCostAccount, billLines, cogsLines, creditNoteLines, expenseLines, invoiceLines, receiptLines, supplierPaymentLines } from "@/lib/ledger/rules";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
/** The actions in this file work for a throwaway organisation, so Zeronix's books are never touched. */
const mockOrg = vi.hoisted(() => ({ id: 0 }));
// every query of the test runs in the throwaway organisation once it exists (runAsOrg still wins, as in the app)
vi.mock("@/db/org-context", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/org-context")>();
  const org = () => real.explicitOrgId() ?? (mockOrg.id || 1);
  return { ...real, resolveOrgId: async () => org(), resolveScope: async () => ({ org: org(), readOnly: false }) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

const sum = (lines: { debit?: number; credit?: number }[], k: "debit" | "credit") => Math.round(lines.reduce((s, l) => s + (l[k] ?? 0), 0) * 100) / 100;

describe("posting rules", () => {
  const inv = { companyId: 7, orderId: 3, dealId: 2, parts: [{ lineKind: "product" as const, code: "SR", net: 1000 }], vatAmount: 50, total: 1050, number: "INV-1" };

  it("posts an invoice: receivable, sale and VAT, with the tax code on both", () => {
    const l = invoiceLines(inv);
    expect(journalProblem(l)).toBeNull();
    expect(l.map((x) => [x.account, x.debit ?? -(x.credit ?? 0), x.taxCode ?? null, x.taxBase ?? null])).toEqual([
      ["ar", 1050, null, null],
      ["sales_products", -1000, "SR", 1000],
      ["vat_output", -50, "SR", null],
    ]);
    expect(l[0]).toMatchObject({ partyType: "customer", partyId: 7, orderId: 3 });
    expect(invoiceLines({ ...inv, parts: [{ lineKind: "service", code: "ZR", net: 1000 }], vatAmount: 0, total: 1000 }).map((x) => [x.account, x.taxCode])).toEqual([
      ["ar", undefined],
      ["sales_services", "ZR"],
    ]);
  });

  it("posts a credit note as the mirror, with a negative taxable amount", () => {
    const l = creditNoteLines({ ...inv, creditNumber: "ZCN-1" });
    expect(journalProblem(l)).toBeNull();
    expect(l.map((x) => x.account)).toEqual(["sales_products", "vat_output", "ar"]);
    expect(l[0]).toMatchObject({ debit: 1000, taxBase: -1000 });
  });

  it("sends goods bills to stock until their order is invoiced, other bills to their expense", () => {
    expect(billCostAccount({ category: "cogs" })).toBe("inventory");
    expect(billCostAccount({ category: "services" })).toBe("project_costs");
    expect(billCostAccount({ category: "rent" })).toBe("exp_rent");
    const b = { number: "ZBL-1", supplierId: 4, category: "software", orderId: null, dealId: null, parts: [{ code: "SR", net: 200, selfAssessed: 0 }], vatAmount: 10, total: 210 };
    const l = billLines(b);
    expect(journalProblem(l)).toBeNull();
    expect(l.map((x) => x.account)).toEqual(["exp_software", "vat_input", "ap"]);
    expect(l[2]).toMatchObject({ credit: 210, partyType: "supplier", partyId: 4 });
    const e = expenseLines({ ...b, bankLedgerAccountId: 99 });
    expect(e.map((x) => x.account)).toEqual(["exp_software", "vat_input", 99]);
    expect(journalProblem(e)).toBeNull();
  });

  it("balances payments and cost of goods sold", () => {
    expect(journalProblem(receiptLines({ bankLedgerAccountId: 1, amount: 500, companyId: 7, number: "ZRV-1", allocations: [{ amount: 500, invoiceNumber: "INV-1" }] }))).toBeNull();
    expect(journalProblem(supplierPaymentLines({ bankLedgerAccountId: 1, amount: 500, supplierId: 4, number: "ZPV-1", allocations: [{ amount: 500, billNumber: "ZBL-1" }] }))).toBeNull();
    const c = cogsLines({ amount: 800, billNumber: "ZBL-1", invoiceNumber: "INV-1", orderId: 3, dealId: 2 });
    expect(c.map((x) => [x.account, x.debit ?? -(x.credit ?? 0)])).toEqual([
      ["cogs", 800],
      ["inventory", -800],
    ]);
  });
});

describe("opening balances from Zoho", () => {
  it("reads amounts the way exports write them", () => {
    expect(parseAmount("1,234.50")).toBe(1234.5);
    expect(parseAmount("(200.00)")).toBe(-200);
    expect(parseAmount("AED 75")).toBe(75);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(12)).toBe(12);
  });

  it("reads a Zoho trial balance: finds the header, skips totals, nets each line to one side", () => {
    const grid = [
      ["Zeronix Technology LLC"],
      ["Trial Balance", "As of 31/12/2026"],
      [],
      ["Account", "Account Code", "Net Debit", "Net Credit"],
      ["Assets", null, null, null],
      ["Accounts Receivable", "1200", "15,750.00", ""],
      ["Emirates NBD", "1001", "40,000.00", null],
      ["Accounts Payable", "2000", "", "9,000.00"],
      ["VAT Payable", "2100", "", "1,250.00"],
      ["Owner's Equity", "3000", "100.00", "45,600.00"],
      ["Total", null, "55,750.00", "55,750.00"],
    ];
    const { rows, problem } = parseTrialBalance(grid);
    expect(problem).toBeNull();
    expect(rows).toEqual([
      { name: "Accounts Receivable", code: "1200", debit: 15750, credit: 0 },
      { name: "Emirates NBD", code: "1001", debit: 40000, credit: 0 },
      { name: "Accounts Payable", code: "2000", debit: 0, credit: 9000 },
      { name: "VAT Payable", code: "2100", debit: 0, credit: 1250 },
      { name: "Owner's Equity", code: "3000", debit: 0, credit: 45500 },
    ]);
    expect(parseTrialBalance([["Name", "Amount"]]).problem).toMatch(/No header row/);
  });

  it("suggests our accounts: last mapping, same name, then known Zoho names", () => {
    const accounts = [
      { id: 1, code: "1210", name: "Accounts receivable", systemKey: "ar" },
      { id: 2, code: "1150", name: "Emirates NBD", systemKey: "bank" },
      { id: 3, code: "2230", name: "VAT payable to FTA", systemKey: "vat_payable" },
      { id: 4, code: "2110", name: "Accounts payable", systemKey: "ap" },
      { id: 5, code: "3200", name: "Owner current account", systemKey: "owner_current" },
    ];
    expect(suggestAccount({ name: "Accounts Receivable", code: "" }, accounts)).toBe(1);
    expect(suggestAccount({ name: "Emirates NBD", code: "" }, accounts)).toBe(2);
    expect(suggestAccount({ name: "VAT Payable", code: "" }, accounts)).toBe(3);
    expect(suggestAccount({ name: "Trade Creditors", code: "" }, accounts)).toBe(4);
    expect(suggestAccount({ name: "Owner's Equity", code: "" }, accounts)).toBe(5);
    expect(suggestAccount({ name: "Owner's Equity", code: "" }, accounts, { "Owner's Equity": 2 })).toBe(2);
    expect(suggestAccount({ name: "Something odd", code: "" }, accounts)).toBeNull();
  });

  it("splits receivables and payables per party, keeps the unmatched part visible, and balances", () => {
    const plan = buildOpening({
      rows: [
        { name: "Accounts Receivable", accountId: 1, debit: 15750, credit: 0 },
        { name: "Bank", accountId: 2, debit: 40000, credit: 0 },
        { name: "Accounts Payable", accountId: 4, debit: 0, credit: 9000 },
        { name: "Equity", accountId: 5, debit: 0, credit: 46000 },
      ],
      arAccountId: 1,
      apAccountId: 4,
      equityAccountId: 9,
      customers: [
        { id: 11, name: "Acme", amount: 10000 },
        { id: 12, name: "Globex", amount: 5000 },
      ],
      suppliers: [{ id: 21, name: "Mitsumi", amount: 9000 }],
    });
    expect(journalProblem(plan.lines)).toBeNull();
    expect(plan.arUnmatched).toBe(750);
    expect(plan.apUnmatched).toBe(0);
    expect(plan.imbalance).toBe(750); // 55,750 debits against 55,000 credits
    expect(plan.lines.filter((l) => l.account === 1).map((l) => [l.partyId ?? null, l.debit])).toEqual([
      [11, 10000],
      [12, 5000],
      [null, 750],
    ]);
    expect(plan.lines.find((l) => l.account === 9)).toMatchObject({ credit: 750 });
    expect(sum(plan.lines, "debit")).toBe(sum(plan.lines, "credit"));
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("documents post to the ledger (throwaway organisation, documents dated 2099)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let Doc: typeof import("@/lib/ledger/documents");
  let O: typeof import("@/lib/org");
  let orgId = 0;
  const tag = `ZZLP${Date.now()}`;
  const ids = { company: 0, supplier: 0, quote: 0, order: 0, b1: 0, b2: 0, b3: 0, inv: 0, pay: 0, sp: 0, cn: 0, exp: 0 };
  let seq = 9000 + Math.floor(Math.random() * 900);
  const next = () => ++seq;

  const inOrg = <T,>(fn: (tx: import("@/lib/tx").Tx) => Promise<T>) => O.withOrg(orgId, fn);
  const balance = async (key: string) =>
    Number(
      (
        await db.execute<{ b: number }>(
          D.sql`SELECT coalesce(sum(l.debit - l.credit), 0)::float b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.organization_id = ${orgId} AND a.system_key = ${key}`,
        )
      ).rows[0].b,
    );
  const entries = async () => (await db.execute<{ n: number }>(D.sql`SELECT count(*)::int n FROM journal_entries WHERE organization_id = ${orgId}`)).rows[0].n;
  const bill = async (p: { date: string; subtotal: number; vat: number; kind?: "bill" | "expense"; category?: string; order?: number | null }) => {
    const id = (
      await db
        .insert(schema.bills)
        .values({
          year: 2099,
          seq: next(),
          number: `${tag}-B${seq}`,
          kind: p.kind ?? "bill",
          supplierId: ids.supplier,
          supplierRef: `${tag}-${seq}`,
          billDate: p.date,
          dueDate: p.date,
          category: p.category ?? "cogs",
          orderId: p.order === undefined ? ids.order : p.order,
          vatPct: p.vat ? 5 : 0,
          subtotal: p.subtotal,
          vatAmount: p.vat,
          total: p.subtotal + p.vat,
        })
        .returning({ id: schema.bills.id })
    )[0].id;
    await db.insert(schema.billItems).values({ billId: id, description: "Goods", qty: 1, unitCost: p.subtotal, taxCode: p.vat ? "SR" : "OS" });
    return id;
  };

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    Doc = await import("@/lib/ledger/documents");
    O = await import("@/lib/org");
    const S = await import("@/lib/ledger/setup");
    orgId = (await createTestOrg({ name: tag }))[0].id;
    await S.ledgerReady(orgId);
    mockOrg.id = orgId;
    await db.update(schema.accountingSettings).set({ cutoverDate: "2099-01-01" }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    ids.company = (await db.insert(schema.companies).values({ name: `${tag} Customer`, nameNorm: `${tag.toLowerCase()} customer` }).returning({ id: schema.companies.id }))[0].id;
    ids.supplier = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier` }).returning({ id: schema.suppliers.id }))[0].id;
    ids.quote = (await db.insert(schema.quotes).values({ year: 2099, seq: next(), number: `${tag}-Q`, validUntil: "2099-12-31", companyId: ids.company }).returning({ id: schema.quotes.id }))[0].id;
    ids.order = (
      await db
        .insert(schema.salesOrders)
        .values({ year: 2099, seq: next(), number: `${tag}-SO`, quoteId: ids.quote, companyId: ids.company, vatPct: 5, subtotal: 1500, vatAmount: 75, total: 1575, status: "invoiced" })
        .returning({ id: schema.salesOrders.id })
    )[0].id;
  });

  afterAll(async () => {
    if (!orgId) return;
    const { sql } = D;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.ledger_maintenance = 'on'`);
      await tx.execute(sql`DELETE FROM journal_lines WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM journal_entries WHERE organization_id = ${orgId} AND reversal_of_id IS NOT NULL`);
      await tx.execute(sql`DELETE FROM journal_entries WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM supplier_payment_allocations WHERE bill_id IN (SELECT id FROM bills WHERE number LIKE ${tag + "%"})`);
      await tx.execute(sql`DELETE FROM supplier_payments WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE number LIKE ${tag + "%"})`);
      await tx.execute(sql`DELETE FROM payments WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM credit_notes WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM invoices WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM bills WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM sales_orders WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM quotes WHERE number LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM companies WHERE id = ${ids.company}`);
      await tx.execute(sql`DELETE FROM suppliers WHERE id = ${ids.supplier}`);
      for (const t of ["tax_code_components", "tax_codes", "bank_accounts", "accounts", "accounting_settings", "doc_series", "audit_log"]) await tx.execute(sql.raw(`DELETE FROM ${t} WHERE organization_id = ${orgId}`));
      await tx.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    });
  });

  it("puts goods bought for an order into stock", async () => {
    ids.b1 = await bill({ date: "2099-01-05", subtotal: 1000, vat: 50 });
    await inOrg((tx) => Doc.postBillDoc(tx, orgId, ids.b1, null));
    expect(await balance("inventory")).toBe(1000);
    expect(await balance("vat_input")).toBe(50);
    expect(await balance("ap")).toBe(-1050);
  });

  it("posts the invoice and moves the order's goods to cost of goods sold, once", async () => {
    ids.inv = (
      await db
        .insert(schema.invoices)
        .values({
          number: `${tag}-INV`,
          orderId: ids.order,
          companyId: ids.company,
          issueDate: "2099-01-10",
          supplyDate: "2099-01-10",
          termsDays: 30,
          dueDate: "2099-02-09",
          customerName: `${tag} Customer`,
          vatPct: 5,
          subtotal: 1500,
          vatAmount: 75,
          total: 1575,
        })
        .returning({ id: schema.invoices.id })
    )[0].id;
    await db.insert(schema.invoiceItems).values({ invoiceId: ids.inv, description: "Goods", qty: 1, unitPrice: 1500, taxCode: "SR" });
    await inOrg((tx) => Doc.postInvoiceDoc(tx, orgId, ids.inv, null));
    const n = await entries();
    await inOrg((tx) => Doc.postInvoiceDoc(tx, orgId, ids.inv, null));
    expect(await entries()).toBe(n); // posting again adds nothing
    expect(await balance("ar")).toBe(1575);
    expect(await balance("sales_products")).toBe(-1500);
    expect(await balance("vat_output")).toBe(-75);
    expect(await balance("inventory")).toBe(0);
    expect(await balance("cogs")).toBe(1000);
  });

  it("moves a bill that arrives after the invoice on to cost of goods sold", async () => {
    ids.b2 = await bill({ date: "2099-01-12", subtotal: 300, vat: 15 });
    await inOrg((tx) => Doc.postBillDoc(tx, orgId, ids.b2, null));
    expect(await balance("cogs")).toBe(1300);
    expect(await balance("inventory")).toBe(0);
  });

  it("posts payments both ways and reverses a voided one", async () => {
    const pay = await db
      .insert(schema.payments)
      .values({ year: 2099, seq: next(), number: `${tag}-RV`, companyId: ids.company, paidOn: "2099-01-15", amount: 1000, method: "bank" })
      .returning({ id: schema.payments.id });
    ids.pay = pay[0].id;
    await db.insert(schema.paymentAllocations).values({ paymentId: ids.pay, invoiceId: ids.inv, amount: 1000, appliedOn: "2099-01-15" });
    await inOrg((tx) => Doc.postReceiptDoc(tx, orgId, ids.pay, null));
    expect(await balance("bank")).toBe(1000);
    expect(await balance("ar")).toBe(575);
    ids.sp = (
      await db
        .insert(schema.supplierPayments)
        .values({ year: 2099, seq: next(), number: `${tag}-PV`, supplierId: ids.supplier, paidOn: "2099-01-16", amount: 500, method: "cash" })
        .returning({ id: schema.supplierPayments.id })
    )[0].id;
    await db.insert(schema.supplierPaymentAllocations).values({ paymentId: ids.sp, billId: ids.b1, amount: 500, appliedOn: "2099-01-16" });
    await inOrg((tx) => Doc.postSupplierPaymentDoc(tx, orgId, ids.sp, null));
    expect(await balance("cash")).toBe(-500);
    expect(await balance("ap")).toBe(-1365 + 500);
    await inOrg((tx) => Doc.reverseDocument(tx, orgId, "receipt", ids.pay, "test void", null));
    expect(await balance("bank")).toBe(0);
    expect(await balance("ar")).toBe(1575);
  });

  it("posts a credit note on its own date and puts the goods back in stock", async () => {
    await db.update(schema.invoices).set({ status: "cancelled" }).where(D.eq(schema.invoices.id, ids.inv));
    ids.cn = (
      await db
        .insert(schema.creditNotes)
        .values({ year: 2099, seq: next(), number: `${tag}-CN`, invoiceId: ids.inv, issueDate: "2099-01-20", reason: "test", subtotal: 1500, vatAmount: 75, total: 1575 })
        .returning({ id: schema.creditNotes.id })
    )[0].id;
    await db.insert(schema.creditNoteItems).values({ creditNoteId: ids.cn, description: "Goods", qty: 1, unitPrice: 1500, taxCode: "SR" });
    await inOrg((tx) => Doc.postCreditNoteDoc(tx, orgId, ids.cn, null));
    expect(await balance("ar")).toBe(0);
    expect(await balance("sales_products")).toBe(0);
    expect(await balance("vat_output")).toBe(0);
    expect(await balance("inventory")).toBe(1300); // both bills of the order: the late one went through stock too
    expect(await balance("cogs")).toBe(0);
    const [{ d }] = (await db.execute<{ d: string }>(D.sql`SELECT date::text d FROM journal_entries WHERE organization_id = ${orgId} AND source_type = 'credit_note'`)).rows;
    expect(d).toBe("2099-01-20");
  });

  it("posts an expense out of the cash box, and voiding it reverses it", async () => {
    ids.exp = await bill({ date: "2099-01-21", subtotal: 200, vat: 10, kind: "expense", category: "transport", order: null });
    const [pv2] = await db.insert(schema.supplierPayments).values({ year: 2099, seq: next(), number: `${tag}-PV2`, supplierId: ids.supplier, paidOn: "2099-01-21", amount: 210, method: "cash" }).returning({ id: schema.supplierPayments.id });
    await db.insert(schema.supplierPaymentAllocations).values({ paymentId: pv2.id, billId: ids.exp, amount: 210, appliedOn: "2099-01-21" });
    await inOrg((tx) => Doc.postBillDoc(tx, orgId, ids.exp, null));
    expect(await balance("exp_transport")).toBe(200);
    expect(await balance("cash")).toBe(-710);
    await inOrg((tx) => Doc.reverseDocument(tx, orgId, "expense", ids.exp, "test void", null));
    expect(await balance("exp_transport")).toBe(0);
    expect(await balance("cash")).toBe(-500);
  });

  it("voiding a goods bill takes its cost out of stock or cost of goods sold", async () => {
    await inOrg((tx) => Doc.reverseDocument(tx, orgId, "bill", ids.b2, "test void", null));
    expect(await balance("cogs")).toBe(0);
    expect(await balance("inventory")).toBe(1000);
  });

  it("posts only what is missing when posting existing documents, and is safe to run twice", async () => {
    ids.b3 = await bill({ date: "2099-01-25", subtotal: 100, vat: 5, category: "office", order: null });
    const dry = await inOrg((tx) => Doc.postExistingDocuments(tx, orgId, null, true));
    expect(dry.byType).toEqual({ bill: 1 });
    const before = await entries();
    expect(await entries()).toBe(before); // the dry run left nothing behind
    const done = await inOrg((tx) => Doc.postExistingDocuments(tx, orgId, null));
    expect(done.posted).toBe(1);
    expect((await inOrg((tx) => Doc.postExistingDocuments(tx, orgId, null))).posted).toBe(0);
    expect(await balance("exp_office")).toBe(100);
  });

  it("keeps the whole ledger balanced and knows each party's balance at a date", async () => {
    const [{ total }] = (await db.execute<{ total: number }>(D.sql`SELECT coalesce(sum(debit - credit), 0)::float total FROM journal_lines WHERE organization_id = ${orgId}`)).rows;
    expect(total).toBe(0);
    const { partyBalancesAt } = await import("@/lib/ledger/opening-data");
    const at = await inOrg((tx) => partyBalancesAt(tx, "2099-01-11"));
    expect(at.customers.find((c) => c.id === ids.company)?.amount).toBe(1575);
    expect(at.suppliers.find((s) => s.id === ids.supplier)?.amount).toBe(1050);
  });
});

describe.skipIf(!live)("Accounts actions post as they save (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  const tag = `ZZLW${Date.now()}`;
  let orgId = 0;
  let accountant = 0;
  let supplierId = 0;
  let companyId = 0;
  let today = "";

  const as = async (id: number) => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const entryFor = async (sourceType: string, sourceId: number) =>
    (
      await db.execute<{ id: number; rev: number | null }>(
        D.sql`SELECT e.id, r.id rev FROM journal_entries e LEFT JOIN journal_entries r ON r.reversal_of_id = e.id WHERE e.organization_id = ${orgId} AND e.source_type = ${sourceType} AND e.source_id = ${sourceId} AND e.reversal_of_id IS NULL`,
      )
    ).rows[0] ?? null;

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/accounts/purchase-actions");
    A = await import("@/app/(app)/accounts/actions");
    const S = await import("@/lib/ledger/setup");
    today = (await import("@/lib/dates")).dubaiToday();
    orgId = (await createTestOrg({ name: tag }))[0].id;
    await S.ledgerReady(orgId);
    mockOrg.id = orgId;
    await db.update(schema.accountingSettings).set({ cutoverDate: today }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    mockOrg.id = orgId;
    accountant = (await db.insert(schema.users).values({ name: `${tag}-acc`, email: `${tag}-acc@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"] }).returning({ id: schema.users.id }))[0].id;
    await db.insert(schema.attendancePunches).values({ userId: accountant, day: today });
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier`, termsDays: 30 }).returning({ id: schema.suppliers.id }))[0].id;
    companyId = (await db.insert(schema.companies).values({ name: `${tag} Customer`, nameNorm: `${tag.toLowerCase()} customer` }).returning({ id: schema.companies.id }))[0].id;
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
      await tx.execute(sql`DELETE FROM supplier_payment_allocations WHERE bill_id IN (SELECT id FROM bills WHERE supplier_id = ${supplierId} OR paid_to LIKE ${tag + "%"})`);
      await tx.execute(sql`DELETE FROM supplier_payments WHERE supplier_id = ${supplierId} OR paid_to LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE supplier_id = ${supplierId} OR paid_to LIKE ${tag + "%"})`);
      await tx.execute(sql`DELETE FROM bills WHERE supplier_id = ${supplierId} OR paid_to LIKE ${tag + "%"}`);
      await tx.execute(sql`DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM payments WHERE company_id = ${companyId}`);
      await tx.execute(sql`DELETE FROM invoices WHERE company_id = ${companyId}`);
      await tx.execute(sql`DELETE FROM activities WHERE company_id = ${companyId}`);
      await tx.execute(sql`DELETE FROM companies WHERE id = ${companyId}`);
      await tx.execute(sql`DELETE FROM suppliers WHERE id = ${supplierId}`);
      await tx.execute(sql`DELETE FROM audit_log WHERE user_id = ${accountant}`);
      await tx.execute(sql`DELETE FROM attendance_punches WHERE user_id = ${accountant}`);
      await tx.execute(sql`DELETE FROM users WHERE id = ${accountant}`);
      for (const t of ["tax_code_components", "tax_codes", "bank_accounts", "accounts", "accounting_settings", "doc_series", "audit_log"]) await tx.execute(sql.raw(`DELETE FROM ${t} WHERE organization_id = ${orgId}`));
      await tx.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    });
  });

  it("bills, supplier payments, expenses and their voids post and reverse", async () => {
    await as(accountant);
    const b = await P.createBill({ supplierId, supplierRef: `${tag}-1`, billDate: today, termsDays: 30, category: "software", lines: [{ description: "Licences", qty: 1, unitCost: 1000 }], vatPct: 5 });
    expect(await entryFor("bill", b.id)).toMatchObject({ rev: null });
    const p = await P.recordSupplierPayment(b.id, { paidOn: today, amount: 1050, method: "cash" });
    expect(await entryFor("supplier_payment", p.id)).toMatchObject({ rev: null });
    await P.voidSupplierPayment(p.id, "test void");
    expect((await entryFor("supplier_payment", p.id))?.rev).toBeTruthy();
    await P.voidBill(b.id, "test void");
    expect((await entryFor("bill", b.id))?.rev).toBeTruthy();
    const e = await P.createExpense({ paidOn: today, category: "transport", paidTo: `${tag} ENOC`, description: "Fuel", amount: 100, vatPct: 5, method: "cash" });
    expect(await entryFor("expense", e.id)).toMatchObject({ rev: null });
    const [voucher] = await db
      .select({ bankAccountId: schema.supplierPayments.bankAccountId })
      .from(schema.supplierPayments)
      .innerJoin(schema.supplierPaymentAllocations, D.eq(schema.supplierPaymentAllocations.paymentId, schema.supplierPayments.id))
      .where(D.eq(schema.supplierPaymentAllocations.billId, e.id));
    expect(voucher.bankAccountId).toBeTruthy();
  });

  it("customer payments post and their voids reverse; opening invoices stay out of the ledger", async () => {
    await as(accountant);
    const yesterday = new Date(Date.parse(today) - 86400_000).toISOString().slice(0, 10); // opening balances are from before the cut-over
    const inv = await A.createOpeningInvoice({ companyId, number: `${tag}-OPEN`, issueDate: yesterday, termsDays: 30, total: 500 });
    expect(await entryFor("invoice", inv.id)).toBeNull();
    const pay = await A.recordPayment(inv.id, { paidOn: today, amount: 200, method: "bank", reference: "FT1" });
    expect(await entryFor("receipt", pay.id)).toMatchObject({ rev: null });
    await A.voidPayment(pay.id, "test void");
    expect((await entryFor("receipt", pay.id))?.rev).toBeTruthy();
  });
});
