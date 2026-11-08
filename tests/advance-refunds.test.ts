import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestOrg } from "./helpers/orgs";
import { buildStatement } from "@/lib/invoicing";
import { journalProblem } from "@/lib/ledger/journal";
import { customerRefundLines, supplierRefundLines } from "@/lib/ledger/rules";

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
  const org = () => real.explicitOrgId() ?? (mockOrg.id || 1);
  return { ...real, resolveOrgId: async () => org(), resolveScope: async () => ({ org: org(), readOnly: false }) };
});

describe("refund rules", () => {
  it("balances both ways: out of the bank for a customer, into it from a supplier", () => {
    const c = customerRefundLines({ amount: 100, companyId: 7, bankLedgerAccountId: 1, number: "ZRF-1", paymentNumber: "ZRV-1" });
    expect(journalProblem(c)).toBeNull();
    expect(c.map((l) => [l.account, l.debit ?? -(l.credit as number)])).toEqual([
      ["customer_advances", 100],
      [1, -100],
    ]);
    const s = supplierRefundLines({ amount: 100, supplierId: 4, bankLedgerAccountId: 1, number: "ZRF-2", paymentNumber: "ZPV-1" });
    expect(journalProblem(s)).toBeNull();
    expect(s.map((l) => [l.account, l.debit ?? -(l.credit as number)])).toEqual([
      [1, 100],
      ["supplier_advances", -100],
    ]);
  });

  it("adds a refund back on a statement, so a paid-back advance leaves nothing", () => {
    const s = buildStatement([
      { date: "2026-10-01", kind: "payment", number: "ZRV-1", amount: 100 },
      { date: "2026-10-02", kind: "refund", number: "ZRF-1", amount: 100 },
    ]);
    expect(s.closing).toBe(0);
    expect(s.lines[1]).toMatchObject({ debit: 100, credit: 0 });
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("sales returns and refunds through the real actions (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let N: typeof import("@/app/(app)/accounts/note-actions");
  let O: typeof import("@/app/(app)/accounts/opening-actions");
  let AD: typeof import("@/lib/accounts-data");
  let PD: typeof import("@/lib/purchases-data");
  let V: typeof import("@/lib/ledger/vat");
  let RD: typeof import("@/lib/refunds-data");
  let orgId = 0, accountant = 0, supplierId = 0, companyId = 0, savedTrn: string | null = null;
  const tag = `ZZRF${Date.now()}`;
  const day = (back: number) => new Date(Date.now() - back * 86400_000 + 4 * 3600_000).toISOString().slice(0, 10);
  const today = day(0);
  let ref = 0;

  const balance = async (key: string) =>
    Math.round(Number((await db.execute<{ b: number }>(D.sql`SELECT coalesce(sum(l.debit - l.credit), 0)::float b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.organization_id = ${orgId} AND a.system_key = ${key}`)).rows[0].b) * 100) / 100;

  /** A paid invoice with one line back on a credit note: the customer has 262.50 as an advance. */
  const paidReturn = async () => {
    const inv = await A.createInvoice({ companyId, issueDate: day(20), termsDays: 0, customerAddress: "Dubai", vatPct: 5, lines: [{ description: "Laptops", qty: 4, unitPrice: 250, lineKind: "product", taxCode: "SR" }] });
    const r = await A.createReceipt({ companyId, paidOn: day(19), amount: 1050, method: "cash", allocations: [{ invoiceId: inv.id, amount: 1050 }] });
    const row = (await AD.getInvoice(inv.id))!;
    await N.createCreditNote(inv.id, { issueDate: day(2), eventDate: day(3), reason: "One returned", lines: [{ itemId: row.lines[0].id, qty: 1, unitPrice: 250 }] });
    return { inv, payment: r };
  };

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/accounts/purchase-actions");
    A = await import("@/app/(app)/accounts/actions");
    N = await import("@/app/(app)/accounts/note-actions");
    O = await import("@/app/(app)/accounts/opening-actions");
    AD = await import("@/lib/accounts-data");
    PD = await import("@/lib/purchases-data");
    V = await import("@/lib/ledger/vat");
    RD = await import("@/lib/refunds-data");
    const S = await import("@/lib/ledger/setup");
    orgId = (await createTestOrg({ name: tag, emirate: "dubai" }))[0].id;
    await S.ledgerReady(orgId);
    mockOrg.id = orgId;
    accountant = (await db.insert(schema.users).values({ name: tag, email: `${tag}@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"], isAccountant: true }).returning({ id: schema.users.id }))[0].id;
    await db.insert(schema.attendancePunches).values({ userId: accountant, day: today });
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier`, trn: "100000000000003" }).returning({ id: schema.suppliers.id }))[0].id;
    const [t] = await db.select().from(schema.settings).where(D.eq(schema.settings.key, "quote_trn"));
    savedTrn = t?.value ?? null;
    await db.insert(schema.settings).values({ key: "quote_trn", value: "100000000000003" }).onConflictDoUpdate({ target: [schema.settings.organizationId, schema.settings.key], set: { value: "100000000000003" } });
    cookieValue = await new SignJWT({ name: tag, email: `${tag}@example.test`, role: "sales" }).setProtectedHeader({ alg: "HS256" }).setSubject(String(accountant)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await O.setCutover(day(40));
    companyId = (await A.createCustomerFromAccounts({ name: `${tag} Customer`, address: "Dubai" })).id;
  });

  afterAll(async () => {
    mockOrg.id = 0;
    await db.update(schema.settings).set({ value: savedTrn ?? "" }).where(D.eq(schema.settings.key, "quote_trn"));
  });

  it("finishes a paid return: the advance goes back to the customer and every balance clears", async () => {
    const { payment } = await paidReturn();
    expect((await AD.customerAdvances(companyId)).find((a) => a.id === payment.id)?.left).toBe(262.5);
    const beforeCash = await balance("cash");
    const r = await N.refundAdvance({ party: "customer", paymentId: payment.id, amount: 262.5, refundedOn: today, method: "cash", reason: "Returned goods" });
    expect(r.number).toMatch(/^ZRF-/);
    expect(await balance("customer_advances")).toBe(0);
    expect(await balance("cash")).toBe(beforeCash - 262.5);
    expect((await AD.customerAdvances(companyId)).some((a) => a.id === payment.id)).toBe(false);
    const st = await AD.statement(companyId, day(40), today);
    expect(st!.lines.some((l) => l.kind === "refund" && l.debit === 262.5)).toBe(true);
    expect(st!.closing).toBe(0);
    expect((await RD.listRefunds({ companyId })).map((x) => x.number)).toContain(r.number);
  });

  it("refuses more than is left, a refund before the payment, and a bank refund with no reference", async () => {
    const { payment } = await paidReturn();
    const base = { party: "customer" as const, paymentId: payment.id, refundedOn: today, method: "cash" as const, reason: "Too much" };
    await expect(N.refundAdvance({ ...base, amount: 300 })).rejects.toThrow(/left to refund/);
    await expect(N.refundAdvance({ ...base, amount: 10, refundedOn: day(30) })).rejects.toThrow(/before the payment/);
    await expect(N.refundAdvance({ ...base, amount: 10, method: "bank" })).rejects.toThrow(/bank reference/);
  });

  it("a refunded advance cannot also be applied, and the receipt cannot be voided until the refund is", async () => {
    const { payment } = await paidReturn();
    const r = await N.refundAdvance({ party: "customer", paymentId: payment.id, amount: 262.5, refundedOn: today, method: "cash", reason: "Returned goods" });
    const next = await A.createInvoice({ companyId, issueDate: day(1), termsDays: 0, customerAddress: "Dubai", vatPct: 5, lines: [{ description: "More", qty: 1, unitPrice: 100, lineKind: "product", taxCode: "SR" }] });
    await expect(A.applyAdvance({ paymentId: payment.id, invoiceId: next.id, amount: 50, appliedOn: today })).rejects.toThrow(/left to apply/);
    await expect(A.voidPayment(payment.id, "Mistake")).rejects.toThrow(/refunded/);
    const advancesBefore = await balance("customer_advances");
    await N.voidAdvanceRefund(r.id, "Entered twice");
    expect(await balance("customer_advances")).toBe(advancesBefore - 262.5);
    expect((await AD.customerAdvances(companyId)).find((a) => a.id === payment.id)?.left).toBe(262.5);
    await expect(N.voidAdvanceRefund(r.id, "Again")).rejects.toThrow(/already voided/);
    await A.applyAdvance({ paymentId: payment.id, invoiceId: next.id, amount: 50, appliedOn: today });
  });

  it("records money a supplier hands back after a debit note", async () => {
    const bill = await P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: day(10), termsDays: 0, category: "rent", lines: [{ description: "Rent", qty: 1, unitCost: 1000, taxCode: "SR" }] });
    const v = await P.createVoucher({ supplierId, paidOn: day(9), amount: 1050, method: "cash", allocations: [{ billId: bill.id, amount: 1050 }] });
    const b = (await PD.getBill(bill.id))!;
    await N.createDebitNote(bill.id, { issueDate: day(2), reason: "Overcharged", lines: [{ itemId: b.lines[0].id, qty: 1, unitPrice: 100 }] });
    expect(await balance("supplier_advances")).toBe(105);
    const beforeCash = await balance("cash");
    await N.refundAdvance({ party: "supplier", paymentId: v.id, amount: 105, refundedOn: today, method: "cash", reason: "Supplier paid back" });
    expect(await balance("supplier_advances")).toBe(0);
    expect(await balance("cash")).toBe(beforeCash + 105);
    expect((await PD.supplierAdvances(supplierId)).some((a) => a.id === v.id)).toBe(false);
  });

  it("keeps the return date, refuses one after the note, and flags a note more than 14 days late", async () => {
    const inv = await A.createInvoice({ companyId, issueDate: day(30), termsDays: 0, customerAddress: "Dubai", vatPct: 5, lines: [{ description: "Laptops", qty: 4, unitPrice: 250, lineKind: "product", taxCode: "SR" }] });
    const row = (await AD.getInvoice(inv.id))!;
    const line = { itemId: row.lines[0].id, qty: 1, unitPrice: 250 };
    await expect(N.createCreditNote(inv.id, { issueDate: day(5), eventDate: day(1), reason: "Wrong way round", lines: [line] })).rejects.toThrow(/after the credit note/);
    await expect(N.createCreditNote(inv.id, { issueDate: day(5), eventDate: day(31), reason: "Before invoice", lines: [line] })).rejects.toThrow(/before the invoice/);
    const onTime = await N.createCreditNote(inv.id, { issueDate: day(5), eventDate: day(10), reason: "On time", lines: [line] });
    const late = await N.createCreditNote(inv.id, { issueDate: day(1), eventDate: day(20), reason: "Late", lines: [line] });
    const problems = await V.vatProblems(day(40), today);
    const flagged = problems.filter((p) => p.check.includes("14 days")).map((p) => p.number);
    expect(flagged).toContain(late.number);
    expect(flagged).not.toContain(onTime.number);
    const after = (await AD.getInvoice(inv.id))!;
    expect(after.credits.find((c) => c.number === onTime.number)?.eventDate).toBe(day(10));
  });

  it("finds documents with the list search boxes", async () => {
    const l = (q: string) => ({ page: 1, size: 50, offset: 0, sort: "date", dir: "desc" as const, q });
    const inv = await A.createInvoice({ companyId, issueDate: day(3), termsDays: 0, customerAddress: "Dubai", customerRef: `${tag}-PO`, vatPct: 5, lines: [{ description: "X", qty: 1, unitPrice: 10, lineKind: "product", taxCode: "SR" }] });
    const byPo = await AD.invoicePage("all", l(`${tag}-PO`));
    expect(byPo.rows.map((r) => r.id)).toEqual([inv.id]);
    expect((await AD.invoicePage("all", l(tag))).rows.length).toBeGreaterThan(1);
    const bill = await P.createBill({ supplierId, supplierRef: `${tag}-FIND`, billDate: day(3), termsDays: 0, category: "rent", lines: [{ description: "Rent", qty: 1, unitCost: 10, taxCode: "SR" }] });
    expect((await PD.billPage("all", l(`${tag}-FIND`))).rows.map((r) => r.id)).toEqual([bill.id]);
    expect((await PD.billPage("all", l("no such thing at all"))).rows).toHaveLength(0);
    expect((await AD.listPayments({ q: `${tag} Customer` })).length).toBeGreaterThan(0);
    expect((await AD.paymentTotals(`${tag} Customer`)).n).toBeGreaterThan(0);
    expect((await PD.listSupplierPayments({ q: `${tag} Supplier` })).length).toBeGreaterThan(0);
    expect((await PD.voucherTotals(`${tag} Supplier`)).n).toBeGreaterThan(0);
  });

  it("dates a cancellation's return as the day of the note", async () => {
    const inv = await A.createInvoice({ companyId, issueDate: day(4), termsDays: 0, customerAddress: "Dubai", vatPct: 5, lines: [{ description: "X", qty: 1, unitPrice: 100, lineKind: "product", taxCode: "SR" }] });
    await A.cancelInvoice(inv.id, "Wrong customer", { goodsBack: false });
    const after = (await AD.getInvoice(inv.id))!;
    expect(after.credits[0].eventDate).toBe(today);
  });
});
