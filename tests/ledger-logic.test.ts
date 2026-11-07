import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { partyNeededFor } from "@/lib/ledger/journal";
import { closingStockLines, purchaseTaxCode } from "@/lib/ledger/rules";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
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
const mockOrg = vi.hoisted(() => ({ id: 0 }));
vi.mock("@/lib/org", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/org")>();
  return { ...real, currentOrgId: async () => mockOrg.id || real.DEFAULT_ORG_ID };
});

describe("logic rules", () => {
  it("knows which accounts must name a customer or supplier", () => {
    expect(partyNeededFor("ar")).toBe("customer");
    expect(partyNeededFor("customer_advances")).toBe("customer");
    expect(partyNeededFor("ap")).toBe("supplier");
    expect(partyNeededFor("supplier_advances")).toBe("supplier");
    expect(partyNeededFor("bank")).toBeNull();
    expect(partyNeededFor(null)).toBeNull();
  });

  it("leaves purchases with no VAT outside the return", () => {
    expect(purchaseTaxCode(5)).toBe("SR");
    expect(purchaseTaxCode(0)).toBe("OS");
  });

  it("turns a stock count into the difference, either way", () => {
    expect(closingStockLines(1000, 1000, "x")).toBeNull();
    expect(closingStockLines(1000, 400, "x")?.map((l) => [l.account, l.debit ?? -(l.credit as number)])).toEqual([
      ["cogs", 600],
      ["inventory", -600],
    ]);
    expect(closingStockLines(400, 1000, "x")?.map((l) => [l.account, l.debit ?? -(l.credit as number)])).toEqual([
      ["inventory", 600],
      ["cogs", -600],
    ]);
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("goods, services and the opening balances through the real actions (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let L: typeof import("@/app/(app)/accounts/ledger-actions");
  let O: typeof import("@/app/(app)/accounts/opening-actions");
  let Doc: typeof import("@/lib/ledger/documents");
  let AD: typeof import("@/lib/accounts-data");
  let orgId = 0, accountant = 0, plain = 0, supplierId = 0, companyId = 0;
  const tag = `ZZLL${Date.now()}`;
  let seq = 5000 + Math.floor(Math.random() * 4000);
  const next = () => ++seq;
  const day = (back: number) => new Date(Date.now() - back * 86400_000 + 4 * 3600_000).toISOString().slice(0, 10);
  const today = day(0);
  const cutover = day(40);
  let ref = 0;

  const as = async (id: number) => {
    cookieValue = await new SignJWT({ name: tag, email: `${tag}@example.test`, role: "sales" }).setProtectedHeader({ alg: "HS256" }).setSubject(String(id)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const balance = async (key: string) =>
    Number((await db.execute<{ b: number }>(D.sql`SELECT coalesce(sum(l.debit - l.credit), 0)::float b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.organization_id = ${orgId} AND a.system_key = ${key}`)).rows[0].b);
  /** What moved on an account because of this test: the difference between two readings. */
  const moved = async (keys: string[], fn: () => Promise<unknown>) => {
    const before = await Promise.all(keys.map(balance));
    await fn();
    const after = await Promise.all(keys.map(balance));
    return Object.fromEntries(keys.map((k, i) => [k, Math.round((after[i] - before[i]) * 100) / 100]));
  };
  const accountId = async (key: string) => (await db.select({ id: schema.ledgerAccounts.id }).from(schema.ledgerAccounts).where(D.and(D.eq(schema.ledgerAccounts.organizationId, orgId), D.eq(schema.ledgerAccounts.systemKey, key))))[0].id;

  const order = async () => {
    const q = next();
    const [qu] = await db.insert(schema.quotes).values({ year: 2097, seq: q, number: `${tag}-Q${q}`, validUntil: today, companyId }).returning({ id: schema.quotes.id });
    const [o] = await db.insert(schema.salesOrders).values({ year: 2097, seq: next(), number: `${tag}-SO${q}`, quoteId: qu.id, companyId, vatPct: 5, subtotal: 2000, vatAmount: 100, total: 2100, status: "invoiced" }).returning({ id: schema.salesOrders.id });
    return o.id;
  };
  const invoice = async (orderId: number | null, date = today) => {
    const n = next();
    const [i] = await db
      .insert(schema.invoices)
      .values({ number: `${tag}-I${n}`, orderId, companyId, issueDate: date, supplyDate: date, termsDays: 0, dueDate: date, customerName: tag, vatPct: 5, subtotal: 2000, vatAmount: 100, total: 2100 })
      .returning({ id: schema.invoices.id });
    await db.insert(schema.invoiceItems).values({ invoiceId: i.id, description: "Goods", qty: 1, unitPrice: 2000 });
    await db.transaction((tx) => Doc.postInvoiceDoc(tx, orgId, i.id, accountant));
    return i.id;
  };
  const bill = (cost: number, o: { date?: string; orderId?: number | null; category?: string; vatPct?: number } = {}) =>
    P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: o.date ?? today, termsDays: 0, category: o.category ?? "cogs", orderId: o.orderId ?? null, lines: [{ description: "Goods", qty: 1, unitCost: cost }], vatPct: o.vatPct ?? 0 });

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/accounts/purchase-actions");
    A = await import("@/app/(app)/accounts/actions");
    L = await import("@/app/(app)/accounts/ledger-actions");
    O = await import("@/app/(app)/accounts/opening-actions");
    Doc = await import("@/lib/ledger/documents");
    AD = await import("@/lib/accounts-data");
    const S = await import("@/lib/ledger/setup");
    orgId = (await db.insert(schema.organizations).values({ name: tag }).returning({ id: schema.organizations.id }))[0].id;
    await S.ledgerReady(orgId);
    mockOrg.id = orgId;
    const mk = async (name: string, isAccountant: boolean) => (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"], isAccountant }).returning({ id: schema.users.id }))[0].id;
    accountant = await mk("acc", true);
    plain = await mk("plain", false);
    await db.insert(schema.attendancePunches).values([accountant, plain].map((userId) => ({ userId, day: today })));
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier` }).returning({ id: schema.suppliers.id }))[0].id;
    companyId = (await db.insert(schema.companies).values({ name: `${tag} Customer`, nameNorm: `${tag.toLowerCase()} customer` }).returning({ id: schema.companies.id }))[0].id;
    await as(accountant);
  });

  afterAll(async () => {
    mockOrg.id = 0;
  });

  it("refuses journals until the ledger has a start date", async () => {
    const [bank, capital] = [await accountId("bank"), await accountId("share_capital")];
    await expect(L.postJournal({ date: today, memo: "Too early", lines: [{ accountId: bank, debit: 10 }, { accountId: capital, credit: 10 }] })).rejects.toThrow(/cut-over/);
    await O.setCutover(cutover);
  });

  it("moves goods to cost of goods sold when the order is invoiced", async () => {
    const o = await order();
    await bill(1000, { orderId: o, date: day(5) });
    const m = await moved(["inventory", "cogs"], () => invoice(o, day(2)));
    expect(m).toEqual({ inventory: -1000, cogs: 1000 });
  });

  it("does the same for a bill dated before the invoice but entered after it (it used to stay in Inventory)", async () => {
    const o = await order();
    await invoice(o, day(2));
    const m = await moved(["inventory", "cogs"], () => bill(700, { orderId: o, date: day(5) }));
    expect(m).toEqual({ inventory: 0, cogs: 700 });
    const [{ d }] = (await db.execute<{ d: string }>(D.sql`SELECT e.date::text d FROM journal_entries e WHERE e.organization_id = ${orgId} AND e.purpose LIKE 'cogs:%' ORDER BY e.id DESC LIMIT 1`)).rows;
    expect(d).toBe(day(2)); // the cost falls with the sale
  });

  it("does the same for a bill dated after the invoice", async () => {
    const o = await order();
    await invoice(o, day(5));
    const m = await moved(["inventory", "cogs"], () => bill(300, { orderId: o, date: day(1) }));
    expect(m).toEqual({ inventory: 0, cogs: 300 });
  });

  it("treats goods paid as an expense like goods on a bill, before and after the invoice", async () => {
    const o = await order();
    const before = await moved(["inventory", "cogs"], () => P.createExpense({ paidOn: day(3), category: "cogs", paidTo: tag, description: "Cable bought for the order", amount: 40, method: "cash", orderId: o }));
    expect(before).toEqual({ inventory: 40, cogs: 0 });
    expect(await moved(["inventory", "cogs"], () => invoice(o, day(2)))).toEqual({ inventory: -40, cogs: 40 });
    const after = await moved(["inventory", "cogs"], () => P.createExpense({ paidOn: day(1), category: "cogs", paidTo: tag, description: "Second cable", amount: 25, method: "cash", orderId: o }));
    expect(after).toEqual({ inventory: 0, cogs: 25 });
  });

  it("undoes the move when a bill that already reached cost of goods sold is voided", async () => {
    const o = await order();
    await invoice(o, day(2));
    const b = await bill(500, { orderId: o, date: day(1) });
    const m = await moved(["inventory", "cogs", "ap"], () => P.voidBill(b.id, "Entered by mistake"));
    expect(m).toEqual({ inventory: 0, cogs: -500, ap: 500 });
  });

  it("keeps goods bought for stock in Inventory, and services go straight to cost of sales", async () => {
    expect(await moved(["inventory", "cogs"], () => bill(900))).toEqual({ inventory: 900, cogs: 0 });
    expect(await moved(["inventory", "project_costs"], () => bill(250, { category: "services" }))).toEqual({ inventory: 0, project_costs: 250 });
  });

  it("codes a purchase with no VAT out of scope, and one with VAT standard-rated", async () => {
    const code = async (id: number) => (await db.execute<{ code: string }>(D.sql`SELECT t.code FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN tax_codes t ON t.id = l.tax_code_id WHERE e.source_type = 'bill' AND e.source_id = ${id} AND e.organization_id = ${orgId} LIMIT 1`)).rows[0].code;
    expect(await code((await bill(10)).id)).toBe("OS");
    expect(await code((await bill(10, { vatPct: 5 })).id)).toBe("SR");
  });

  it("returns cost to stock on a credit note only when the goods come back", async () => {
    const o = await order();
    await bill(600, { orderId: o, date: day(4) });
    const inv = await invoice(o, day(3));
    expect(await moved(["inventory", "cogs", "ar"], () => A.cancelInvoice(inv, "Customer returned the goods", { goodsBack: true }))).toEqual({ inventory: 600, cogs: -600, ar: -2100 });
    const o2 = await order();
    await bill(350, { orderId: o2, date: day(4) });
    const inv2 = await invoice(o2, day(3));
    expect(await moved(["inventory", "cogs", "ar"], () => A.cancelInvoice(inv2, "Goodwill, customer keeps them", { goodsBack: false }))).toEqual({ inventory: 0, cogs: 0, ar: -2100 });
    // issued again: the cost that stayed is not counted twice
    expect(await moved(["inventory", "cogs"], () => invoice(o2, day(1)))).toEqual({ inventory: 0, cogs: 0 });
  });

  it("corrects Inventory with the closing stock figure, and that can be reversed", async () => {
    const book = await balance("inventory");
    const diff = 150;
    const m = await moved(["inventory", "cogs"], () => L.postClosingStock({ date: today, value: book - diff }));
    expect(m).toEqual({ inventory: -diff, cogs: diff });
    await expect(L.postClosingStock({ date: today, value: book - diff })).rejects.toThrow(/nothing to post/);
    await expect(L.postClosingStock({ date: day(60), value: 1 })).rejects.toThrow(/ledger starts/);
    const [e] = (await db.execute<{ id: number }>(D.sql`SELECT id FROM journal_entries WHERE organization_id = ${orgId} AND source_type = 'stock_count' ORDER BY id DESC LIMIT 1`)).rows;
    expect(await moved(["inventory", "cogs"], () => L.reverseJournal(Number(e.id), { reason: "Counted wrong" }))).toEqual({ inventory: diff, cogs: -diff });
    await as(plain);
    await expect(L.postClosingStock({ date: today, value: 1 })).rejects.toThrow(/accountant/);
    await as(accountant);
  });

  it("makes a journal on receivables or payables name who it is for, and date it inside the ledger", async () => {
    const [ar, bank] = [await accountId("ar"), await accountId("bank")];
    await expect(L.postJournal({ date: today, memo: "No customer", lines: [{ accountId: ar, debit: 10 }, { accountId: bank, credit: 10 }] })).rejects.toThrow(/which customer/);
    const r = await L.postJournal({ date: today, memo: "With customer", lines: [{ accountId: ar, debit: 10, partyId: companyId }, { accountId: bank, credit: 10 }] });
    const [line] = (await db.execute<{ t: string; p: number }>(D.sql`SELECT party_type t, party_id p FROM journal_lines WHERE entry_id = ${r.id} AND debit > 0`)).rows;
    expect(line).toEqual({ t: "customer", p: companyId });
    await expect(L.postJournal({ date: day(60), memo: "Before the ledger", lines: [{ accountId: bank, debit: 10 }, { accountId: await accountId("share_capital"), credit: 10 }] })).rejects.toThrow(/ledger starts/);
  });

  it("will not switch off an account that still has a balance", async () => {
    const [a] = await db.select().from(schema.ledgerAccounts).where(D.and(D.eq(schema.ledgerAccounts.organizationId, orgId), D.eq(schema.ledgerAccounts.code, "1710")));
    const input = { code: a.code, name: a.name, type: a.type, parentId: a.parentId, isGroup: false, description: "" };
    await L.postJournal({ date: today, memo: "Laptop", lines: [{ accountId: a.id, debit: 100 }, { accountId: await accountId("bank"), credit: 100 }] });
    await expect(L.saveAccount(a.id, { ...input, isActive: false })).rejects.toThrow(/still has a balance/);
  });

  it("freezes opening documents and older payments once the opening entry is posted, until it is reversed", async () => {
    const old = day(50);
    await expect(A.createOpeningInvoice({ companyId, number: `${tag}-LATE`, issueDate: today, termsDays: 0, total: 100 })).rejects.toThrow(/before/);
    const inv = await A.createOpeningInvoice({ companyId, number: `${tag}-OLD`, issueDate: old, termsDays: 0, total: 800 });
    const spare = await A.createOpeningInvoice({ companyId, number: `${tag}-SPARE`, issueDate: old, termsDays: 0, total: 60 });
    const oldBill = await P.createBill({ kind: "opening", supplierId, billDate: old, termsDays: 0, category: "cogs", lines: [{ description: "Old balance", qty: 1, unitCost: 300 }], vatPct: 0 });
    const earlyPay = await A.recordPayment(inv.id, { paidOn: day(45), amount: 100, method: "cash" });
    const ar = await accountId("ar");
    const posted = await O.postOpeningBalances({ rows: [{ name: "Accounts Receivable", code: "", debit: 700, credit: 0, accountId: ar }] });
    const frozen = /opening balances are already posted/;
    await expect(A.createOpeningInvoice({ companyId, number: `${tag}-OLD2`, issueDate: old, termsDays: 0, total: 50 })).rejects.toThrow(frozen);
    await expect(P.createBill({ kind: "opening", supplierId, billDate: old, termsDays: 0, category: "cogs", lines: [{ description: "x", qty: 1, unitCost: 5 }], vatPct: 0 })).rejects.toThrow(frozen);
    await expect(A.cancelInvoice(spare.id, "Too late")).rejects.toThrow(frozen);
    await expect(P.voidBill(oldBill.id, "Too late")).rejects.toThrow(frozen);
    await expect(A.voidPayment(earlyPay.id, "Too late")).rejects.toThrow(/before the ledger starts/);
    await expect(A.recordPayment(inv.id, { paidOn: day(45), amount: 10, method: "cash" })).rejects.toThrow(/before the ledger starts/);
    await expect(bill(10, { date: day(45) })).rejects.toThrow(/before the ledger starts/);
    // a payment in the ledger's time is fine
    await A.recordPayment(inv.id, { paidOn: day(1), amount: 10, method: "cash" });
    // reversing the opening entry opens them up again
    await L.reverseJournal(posted.id, { reason: "Wrong file" });
    await A.voidPayment(earlyPay.id, "Now allowed");
    await P.voidBill(oldBill.id, "Now allowed");
  });

  it("lets the cut-over move only when nothing live hangs on it", async () => {
    await expect(O.setCutover(day(35))).rejects.toThrow(/already in the ledger/);
    await db.transaction(async (tx) => {
      await tx.execute(D.sql`SET LOCAL app.ledger_maintenance = 'on'`);
      await tx.execute(D.sql`DELETE FROM journal_lines WHERE organization_id = ${orgId}`);
      await tx.execute(D.sql`DELETE FROM journal_entries WHERE organization_id = ${orgId} AND reversal_of_id IS NOT NULL`);
      await tx.execute(D.sql`DELETE FROM journal_entries WHERE organization_id = ${orgId}`);
    });
    const posted = await L.postJournal({ date: today, memo: "Hand journal", lines: [{ accountId: await accountId("bank"), debit: 5 }, { accountId: await accountId("share_capital"), credit: 5 }] });
    expect(posted.number).toBeTruthy();
    await O.setCutover(day(35));
    await expect(O.setCutover("2099-01-01")).rejects.toThrow(/month ahead/);
  });

  it("leaves a removed opening invoice out of the customer's statement", async () => {
    const c = (await db.insert(schema.companies).values({ name: `${tag} Other`, nameNorm: `${tag.toLowerCase()} other` }).returning({ id: schema.companies.id }))[0].id;
    await db.update(schema.accountingSettings).set({ cutoverDate: null }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    const inv = await A.createOpeningInvoice({ companyId: c, number: `${tag}-GONE`, issueDate: day(50), termsDays: 0, total: 400 });
    await A.createOpeningInvoice({ companyId: c, number: `${tag}-STAYS`, issueDate: day(50), termsDays: 0, total: 150 });
    await A.cancelInvoice(inv.id, "Entered by mistake");
    const s = await AD.statement(c, day(60), today);
    expect(s?.closing).toBe(150);
    expect(s?.lines.map((l) => l.number)).toEqual([`${tag}-STAYS`]);
  });

  it("writes changes to our TRN and document settings in the audit trail", async () => {
    const Adm = await import("@/app/(app)/admin/actions");
    const { getSettings } = await import("@/lib/settings");
    const admin = (await db.insert(schema.users).values({ name: `${tag}-admin`, email: `${tag}-admin@example.test`, passwordHash: "x", role: "admin" }).returning({ id: schema.users.id }))[0].id;
    await db.insert(schema.attendancePunches).values({ userId: admin, day: today });
    await as(admin);
    const s = await getSettings();
    await Adm.saveQuoteSettings({ quote_margin_pct: Number(s.quote_margin_pct), quote_valid_days: Number(s.quote_valid_days), quote_vat_pct: Number(s.quote_vat_pct), quote_terms: s.quote_terms, quote_trn: "100000000000003" });
    const trn = await db.select().from(schema.auditLog).where(D.and(D.eq(schema.auditLog.action, "settings.trn"), D.eq(schema.auditLog.userId, admin)));
    expect(trn[0]?.after).toEqual({ quote_trn: "100000000000003" });
    await Adm.saveQuoteSettings({ quote_margin_pct: Number(s.quote_margin_pct), quote_valid_days: Number(s.quote_valid_days), quote_vat_pct: Number(s.quote_vat_pct), quote_terms: s.quote_terms, quote_trn: s.quote_trn });
    await as(accountant);
  });

  it("writes a new supplier in the audit trail", async () => {
    const id = await P.createSupplierFromAccounts({ name: `${tag} New Supplier` });
    const rows = await db.select().from(schema.auditLog).where(D.and(D.eq(schema.auditLog.action, "supplier.create"), D.eq(schema.auditLog.entityId, id)));
    expect(rows).toHaveLength(1);
  });
});
