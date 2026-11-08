import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestOrg } from "./helpers/orgs";
import { journalProblem } from "@/lib/ledger/journal";
import { advanceAppliedLines, advanceReturnedLines, invoiceLines, receiptLines, supplierAdvanceAppliedLines, supplierAdvanceReturnedLines, supplierPaymentLines } from "@/lib/ledger/rules";

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
// every query of the test runs in the throwaway organisation once it exists (runAsOrg still wins, as in the app)
vi.mock("@/db/org-context", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/org-context")>();
  return { ...real, resolveOrgId: async () => real.explicitOrgId() ?? (mockOrg.id || 1) };
});

const signed = (lines: { account: number | string; debit?: number; credit?: number }[]) => lines.map((l) => [l.account, l.debit ?? -(l.credit ?? 0)]);

describe("posting rules for allocations", () => {
  it("splits a receipt: bank in, off each invoice, the rest an advance", () => {
    const l = receiptLines({ bankLedgerAccountId: 9, amount: 1000, companyId: 7, number: "ZRV-1", allocations: [{ amount: 300, invoiceNumber: "A" }, { amount: 500, invoiceNumber: "B" }] });
    expect(journalProblem(l)).toBeNull();
    expect(signed(l)).toEqual([
      [9, 1000],
      ["ar", -300],
      ["ar", -500],
      ["customer_advances", -200],
    ]);
    expect(l[3]).toMatchObject({ partyType: "customer", partyId: 7 });
  });

  it("keeps a receipt with no invoice wholly as an advance", () => {
    expect(signed(receiptLines({ bankLedgerAccountId: 9, amount: 500, companyId: 7, number: "ZRV-2", allocations: [] }))).toEqual([
      [9, 500],
      ["customer_advances", -500],
    ]);
  });

  it("mirrors it for suppliers: an advance is money they hold for us", () => {
    const l = supplierPaymentLines({ bankLedgerAccountId: 9, amount: 1000, supplierId: 4, number: "ZPV-1", allocations: [{ amount: 600, billNumber: "A" }] });
    expect(journalProblem(l)).toBeNull();
    expect(signed(l)).toEqual([
      ["ap", 600],
      ["supplier_advances", 400],
      [9, -1000],
    ]);
  });

  it("moves an advance onto a document and back", () => {
    const c = { amount: 100, companyId: 7, paymentNumber: "ZRV-1", invoiceNumber: "A" };
    expect(signed(advanceAppliedLines(c))).toEqual([
      ["customer_advances", 100],
      ["ar", -100],
    ]);
    expect(signed(advanceReturnedLines(c))).toEqual([
      ["ar", 100],
      ["customer_advances", -100],
    ]);
    const s = { amount: 100, supplierId: 4, paymentNumber: "ZPV-1", billNumber: "A" };
    expect(signed(supplierAdvanceAppliedLines(s))).toEqual([
      ["ap", 100],
      ["supplier_advances", -100],
    ]);
    expect(signed(supplierAdvanceReturnedLines(s))).toEqual([
      ["supplier_advances", 100],
      ["ap", -100],
    ]);
  });

  it("splits an invoice between products and services, and leaves out a side with nothing on it", () => {
    const i = { companyId: 7, orderId: null, dealId: null, vatAmount: 50, total: 1050, number: "I" };
    const product = (net: number) => ({ lineKind: "product" as const, code: "SR", net });
    const service = (net: number) => ({ lineKind: "service" as const, code: "SR", net });
    expect(signed(invoiceLines({ ...i, parts: [product(600), service(400)] }))).toEqual([
      ["ar", 1050],
      ["sales_products", -600],
      ["sales_services", -400],
      ["vat_output", -50],
    ]);
    expect(invoiceLines({ ...i, parts: [product(1000)] }).map((l) => l.account)).toEqual(["ar", "sales_products", "vat_output"]);
    expect(invoiceLines({ ...i, parts: [service(1000)] }).map((l) => l.account)).toEqual(["ar", "sales_services", "vat_output"]);
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("working directly in Accounts, as a user with only the Accounts app (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let O: typeof import("@/app/(app)/accounts/opening-actions");
  let AD: typeof import("@/lib/accounts-data");
  let PD: typeof import("@/lib/purchases-data");
  let orgId = 0, accountant = 0, supplierId = 0, companyId = 0, savedTrn: string | null = null;
  const tag = `ZZAL${Date.now()}`;
  const day = (back: number) => new Date(Date.now() - back * 86400_000 + 4 * 3600_000).toISOString().slice(0, 10);
  const today = day(0);
  let ref = 0;

  const as = async (id: number) => {
    cookieValue = await new SignJWT({ name: tag, email: `${tag}@example.test`, role: "sales" }).setProtectedHeader({ alg: "HS256" }).setSubject(String(id)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const balance = async (key: string) =>
    Math.round(Number((await db.execute<{ b: number }>(D.sql`SELECT coalesce(sum(l.debit - l.credit), 0)::float b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.organization_id = ${orgId} AND a.system_key = ${key}`)).rows[0].b) * 100) / 100;
  const moved = async (keys: string[], fn: () => Promise<unknown>) => {
    const before = await Promise.all(keys.map(balance));
    await fn();
    const after = await Promise.all(keys.map(balance));
    return Object.fromEntries(keys.map((k, i) => [k, Math.round((after[i] - before[i]) * 100) / 100]));
  };
  const invoice = (total: number, date = day(5)) =>
    A.createInvoice({ companyId, issueDate: date, termsDays: 30, customerAddress: "Dubai", vatPct: 0, lines: [{ description: "Goods", qty: 1, unitPrice: total, lineKind: "product" }] });
  const bill = (total: number, date = day(5)) => P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: date, termsDays: 0, category: "rent", lines: [{ description: "Rent", qty: 1, unitCost: total }], vatPct: 0 });
  const owed = async (id: number) => (await AD.getInvoice(id))!.state.balance;
  const toPay = async (id: number) => (await PD.getBill(id))!.state.balance;
  const receipt = (amount: number, allocations: { invoiceId: number; amount: number }[], paidOn = day(4)) => A.createReceipt({ companyId, paidOn, amount, method: "cash", allocations });
  const voucher = (amount: number, allocations: { billId: number; amount: number }[], paidOn = day(4)) => P.createVoucher({ supplierId, paidOn, amount, method: "cash", allocations });

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/accounts/purchase-actions");
    A = await import("@/app/(app)/accounts/actions");
    O = await import("@/app/(app)/accounts/opening-actions");
    AD = await import("@/lib/accounts-data");
    PD = await import("@/lib/purchases-data");
    const S = await import("@/lib/ledger/setup");
    orgId = (await createTestOrg({ name: tag }))[0].id;
    await S.ledgerReady(orgId);
    mockOrg.id = orgId;
    accountant = (await db.insert(schema.users).values({ name: tag, email: `${tag}@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"], isAccountant: true }).returning({ id: schema.users.id }))[0].id;
    await db.insert(schema.attendancePunches).values({ userId: accountant, day: today });
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier` }).returning({ id: schema.suppliers.id }))[0].id;
    const [t] = await db.select().from(schema.settings).where(D.eq(schema.settings.key, "quote_trn"));
    savedTrn = t?.value ?? null;
    await db.insert(schema.settings).values({ key: "quote_trn", value: "100000000000003" }).onConflictDoUpdate({ target: [schema.settings.organizationId, schema.settings.key], set: { value: "100000000000003" } });
    await as(accountant);
    await O.setCutover(day(40));
  });

  afterAll(async () => {
    mockOrg.id = 0;
    await db.update(schema.settings).set({ value: savedTrn ?? "" }).where(D.eq(schema.settings.key, "quote_trn"));
  });

  it("adds a customer with no lead or deal, and refuses the same name twice", async () => {
    const c = await A.createCustomerFromAccounts({ name: `${tag} Customer`, address: "Dubai" });
    companyId = c.id;
    await expect(A.createCustomerFromAccounts({ name: `${tag}  customer!` })).rejects.toThrow(/already in the list/);
    await expect(A.createCustomerFromAccounts({ name: `${tag} Other`, trn: "123" })).rejects.toThrow();
    const [row] = await db.select().from(schema.companies).where(D.eq(schema.companies.id, c.id));
    expect(row.isCustomer).toBe(true);
    const list = await AD.listCustomers({ id: accountant, seesAll: true });
    expect(list.some((x) => x.id === c.id)).toBe(true);
  });

  it("issues a direct invoice with no order, posting products and services apart", async () => {
    const m = await moved(["ar", "sales_products", "sales_services", "vat_output"], () =>
      A.createInvoice({
        companyId,
        issueDate: day(6),
        termsDays: 15,
        vatPct: 5,
        customerRef: "PO-1",
        lines: [
          { description: "Laptop", qty: 2, unitPrice: 1000, lineKind: "product" },
          { description: "Setup", qty: 1.5, unitPrice: 200, lineKind: "service" },
        ],
      }),
    );
    expect(m).toEqual({ ar: 2415, sales_products: -2000, sales_services: -300, vat_output: -115 });
  });

  it("gives a credit note on a direct invoice the same split", async () => {
    const i = await A.createInvoice({ companyId, issueDate: day(6), termsDays: 15, vatPct: 0, lines: [{ description: "P", qty: 1, unitPrice: 70, lineKind: "product" }, { description: "S", qty: 1, unitPrice: 30, lineKind: "service" }] });
    const m = await moved(["ar", "sales_products", "sales_services"], () => A.cancelInvoice(i.id, "Typed wrong", { goodsBack: false }));
    expect(m).toEqual({ ar: -100, sales_products: 70, sales_services: 30 });
    expect((await AD.getInvoice(i.id))!.state.key).toBe("cancelled");
  });

  it("refuses an invoice with no address, a bad date, or nothing to charge", async () => {
    const [bare] = await db.insert(schema.companies).values({ name: `${tag} Bare`, nameNorm: `${tag.toLowerCase()} bare` }).returning({ id: schema.companies.id });
    await expect(A.createInvoice({ companyId: bare.id, issueDate: today, termsDays: 0, vatPct: 0, lines: [{ description: "x", qty: 1, unitPrice: 5 }] })).rejects.toThrow(/billing address/);
    await expect(A.createInvoice({ companyId, issueDate: "2099-01-01", termsDays: 0, vatPct: 0, lines: [{ description: "x", qty: 1, unitPrice: 5 }] })).rejects.toThrow(/future/);
    await expect(A.createInvoice({ companyId, issueDate: today, termsDays: 0, vatPct: 0, lines: [{ description: "x", qty: 1, unitPrice: 0 }] })).rejects.toThrow(/above zero/);
  });

  it("makes one invoice from a quote, which then cannot become an order or a second invoice", async () => {
    const OA = await import("@/app/(app)/sales/order-actions");
    const [q] = await db.insert(schema.quotes).values({ year: 2097, seq: 7000 + (Date.now() % 900), number: `${tag}-Q1`, validUntil: today, companyId, status: "sent", subtotal: 100, vatAmount: 5, total: 105, createdBy: accountant, ownerId: accountant }).returning({ id: schema.quotes.id });
    const input = { companyId, quoteId: q.id, issueDate: today, termsDays: 0, vatPct: 5, lines: [{ description: "x", qty: 1, unitPrice: 100 }] };
    const i = await A.createInvoice(input);
    const [after] = await db.select({ status: schema.quotes.status }).from(schema.quotes).where(D.eq(schema.quotes.id, q.id));
    expect(after.status).toBe("accepted");
    await expect(A.createInvoice(input)).rejects.toThrow(/already invoice/);
    await expect(OA.convertQuoteToOrder(q.id, { termsDays: 0 })).rejects.toThrow(/already invoice/);
    await A.cancelInvoice(i.id, "Typed wrong", { goodsBack: false });
    // cancelled, so the quote can be invoiced again
    expect((await A.createInvoice(input)).id).toBeGreaterThan(i.id);
  });

  it("pays several invoices with one receipt and keeps the rest as an advance", async () => {
    const [a, b] = [await invoice(1000), await invoice(2000)];
    let r!: { id: number; advance: number; fullyPaid: boolean };
    const m = await moved(["cash", "ar", "customer_advances"], async () => {
      r = await receipt(2500, [{ invoiceId: a.id, amount: 1000 }, { invoiceId: b.id, amount: 1200 }]);
    });
    expect(m).toEqual({ cash: 2500, ar: -2200, customer_advances: -300 });
    expect(r.advance).toBe(300);
    expect(await owed(a.id)).toBe(0);
    expect(await owed(b.id)).toBe(800);
    const p = await AD.getPayment(r.id);
    expect(p?.documents.map((d) => [d.number === a.number, d.amount, d.balanceAfter])).toEqual([
      [true, 1000, 0],
      [false, 1200, 800],
    ]);
    expect(p?.advance).toBe(300);
    // the customer's statement counts the whole receipt, so it agrees with what they paid
    const s = await AD.statement(companyId, day(30), today);
    expect(s?.lines.find((l) => l.number === p?.number)).toMatchObject({ credit: 2500 });
  });

  it("refuses more than a document owes, more than was received, and another customer's invoice", async () => {
    const a = await invoice(100);
    await expect(receipt(500, [{ invoiceId: a.id, amount: 200 }])).rejects.toThrow(/more than/);
    await expect(receipt(50, [{ invoiceId: a.id, amount: 100 }])).rejects.toThrow(/more than/);
    await expect(receipt(100, [{ invoiceId: a.id, amount: 50 }, { invoiceId: a.id, amount: 50 }])).rejects.toThrow(/twice/);
    const [other] = await db.insert(schema.companies).values({ name: `${tag} Rival`, nameNorm: `${tag.toLowerCase()} rival`, address: "Dubai" }).returning({ id: schema.companies.id });
    await expect(A.createReceipt({ companyId: other.id, paidOn: day(4), amount: 100, method: "cash", allocations: [{ invoiceId: a.id, amount: 100 }] })).rejects.toThrow(/another customer/);
    await expect(receipt(100, [{ invoiceId: a.id, amount: 100 }], day(9))).rejects.toThrow(/before the invoice/);
  });

  it("applies an advance to a later invoice, and takes it back off", async () => {
    const r = await receipt(1000, [], day(10));
    expect(r.advance).toBe(1000);
    const left = async () => (await AD.customerAdvances(companyId)).find((x) => x.id === r.id)?.left ?? 0;
    expect(await left()).toBe(1000);
    const i = await invoice(600, day(2));
    let applied!: { allocationId: number };
    const m = await moved(["cash", "ar", "customer_advances"], async () => {
      applied = await A.applyAdvance({ paymentId: r.id, invoiceId: i.id, amount: 600, appliedOn: day(1) });
    });
    expect(m).toEqual({ cash: 0, ar: -600, customer_advances: 600 });
    expect(await left()).toBe(400);
    expect(await owed(i.id)).toBe(0);
    await expect(A.applyAdvance({ paymentId: r.id, invoiceId: i.id, amount: 1, appliedOn: today })).rejects.toThrow();
    const j = await invoice(5000, day(2));
    await expect(A.applyAdvance({ paymentId: r.id, invoiceId: j.id, amount: 500, appliedOn: today })).rejects.toThrow(/left to apply/);
    await expect(A.applyAdvance({ paymentId: r.id, invoiceId: j.id, amount: 100, appliedOn: day(3) })).rejects.toThrow(/before/);

    const back = await moved(["cash", "ar", "customer_advances"], () => A.removeAllocation(applied.allocationId, "Wrong invoice"));
    expect(back).toEqual({ cash: 0, ar: 600, customer_advances: -600 });
    expect(await left()).toBe(1000);
    expect(await owed(i.id)).toBe(600);
    await expect(A.removeAllocation(applied.allocationId, "Again")).rejects.toThrow(/already off/);
  });

  it("takes money that came with the receipt off an invoice, so the invoice can be cancelled", async () => {
    const i = await invoice(800);
    const r = await receipt(800, [{ invoiceId: i.id, amount: 800 }]);
    await expect(A.cancelInvoice(i.id, "Wrong customer")).rejects.toThrow(/take them off/);
    const [alloc] = (await AD.getInvoice(i.id))!.payments;
    const m = await moved(["ar", "customer_advances"], () => A.removeAllocation(alloc.allocationId, "Wrong customer"));
    expect(m).toEqual({ ar: 800, customer_advances: -800 });
    expect((await AD.customerAdvances(companyId)).find((x) => x.id === r.id)?.left).toBe(800);
    await A.cancelInvoice(i.id, "Wrong customer", { goodsBack: false });
    // voiding the receipt now undoes the money, the taking off and all
    const v = await moved(["cash", "ar", "customer_advances"], () => A.voidPayment(r.id, "Never arrived"));
    expect(v).toEqual({ cash: -800, ar: 0, customer_advances: 800 });
  });

  it("voids a receipt across several invoices and frees them all", async () => {
    const [a, b] = [await invoice(300), await invoice(400)];
    const r = await receipt(1000, [{ invoiceId: a.id, amount: 300 }, { invoiceId: b.id, amount: 400 }]);
    const c = await invoice(150, day(3));
    await A.applyAdvance({ paymentId: r.id, invoiceId: c.id, amount: 150, appliedOn: day(1) });
    const m = await moved(["cash", "ar", "customer_advances"], () => A.voidPayment(r.id, "Cheque bounced"));
    expect(m).toEqual({ cash: -1000, ar: 850, customer_advances: 150 });
    expect([await owed(a.id), await owed(b.id), await owed(c.id)]).toEqual([300, 400, 150]);
    // the voided receipt still prints what it had paid
    expect((await AD.getPayment(r.id))?.documents.length).toBe(3);
    await expect(A.voidPayment(r.id, "Again")).rejects.toThrow(/already voided/);
  });

  it("does all of that for suppliers too", async () => {
    const [a, b] = [await bill(1000), await bill(2000)];
    let v!: { id: number; advance: number };
    const m = await moved(["cash", "ap", "supplier_advances"], async () => {
      v = await voucher(2500, [{ billId: a.id, amount: 1000 }, { billId: b.id, amount: 1200 }]);
    });
    expect(m).toEqual({ cash: -2500, ap: 2200, supplier_advances: 300 });
    expect([await toPay(a.id), await toPay(b.id)]).toEqual([0, 800]);
    expect(v.advance).toBe(300);

    let applied!: { allocationId: number };
    const am = await moved(["ap", "supplier_advances"], async () => {
      applied = await P.applySupplierAdvance({ paymentId: v.id, billId: b.id, amount: 300, appliedOn: day(1) });
    });
    expect(am).toEqual({ ap: 300, supplier_advances: -300 });
    expect(await toPay(b.id)).toBe(500);
    expect(await moved(["ap", "supplier_advances"], () => P.removeSupplierAllocation(applied.allocationId, "Wrong bill"))).toEqual({ ap: -300, supplier_advances: 300 });

    await expect(P.voidBill(a.id, "Wrong")).rejects.toThrow(/take them off/);
    const [alloc] = (await PD.getBill(a.id))!.payments;
    expect(await moved(["ap", "supplier_advances"], () => P.removeSupplierAllocation(alloc.allocationId, "Wrong bill"))).toEqual({ ap: -1000, supplier_advances: 1000 });
    expect(await toPay(a.id)).toBe(1000);

    expect(await moved(["cash", "ap", "supplier_advances"], () => P.voidSupplierPayment(v.id, "Bounced"))).toEqual({ cash: 2500, ap: -1200, supplier_advances: -1300 });
    expect(await toPay(b.id)).toBe(2000);
  });

  it("keeps an expense's own voucher out of supplier advances, and voids them together", async () => {
    const before = await balance("supplier_advances");
    const e = await P.createExpense({ paidOn: day(3), category: "transport", supplierId, description: "Fuel", amount: 100, method: "cash" });
    expect(await balance("supplier_advances")).toBe(before);
    const b = await PD.getBill(e.id);
    expect(b?.state.key).toBe("paid");
    const list = await PD.listSupplierPayments({ supplierId });
    const row = list.find((x) => x.documents.some((d) => d.id === e.id))!;
    expect(row.isExpense).toBe(true);
    expect(row.advance).toBe(0);
    await expect(P.voidSupplierPayment(row.id, "Nope")).rejects.toThrow(/void the expense/);
    await expect(P.removeSupplierAllocation(b!.payments[0].allocationId, "Nope")).rejects.toThrow(/void the expense/);
    await P.voidBill(e.id, "Typed twice");
    expect((await PD.getSupplierPayment(row.id))?.voidedAt).toBeTruthy();
  });

  it("agrees between documents and ledger after all of it", async () => {
    const { ledgerChecks } = await import("@/lib/ledger/opening-data");
    // the throwaway organisation's books hold only this test's documents, but the document side reads every organisation until Phase T
    const { checks } = await ledgerChecks(orgId);
    const of = (label: string) => checks.find((c) => c.label === label);
    expect(of("Advances from customers")).toBeTruthy();
    expect(of("Advances to suppliers")).toBeTruthy();
    expect(await balance("customer_advances")).toBe(-Number((await AD.customerAdvances(companyId)).reduce((s, a) => s + a.left, 0).toFixed(2)));
    expect(await balance("ar")).toBeCloseTo((await AD.listInvoices({ companyId })).reduce((s, i) => s + i.state.balance, 0), 2);
    expect(await balance("ap")).toBeCloseTo(-(await PD.listBills({ supplierId, withVoid: false })).reduce((s, b) => s + b.state.balance, 0), 2);
    expect(await balance("supplier_advances")).toBeCloseTo((await PD.supplierAdvances(supplierId)).reduce((s, a) => s + a.left, 0), 2);
  });
});
