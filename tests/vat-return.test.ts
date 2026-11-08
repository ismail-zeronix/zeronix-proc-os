import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestOrg } from "./helpers/orgs";
import { journalProblem } from "@/lib/ledger/journal";
import { vatPaymentLines, vatSettlementLines } from "@/lib/ledger/rules";
import { buildFaf, fafText, splitVat } from "@/lib/tax/faf";
import { buildVat201, vatPeriodOf, vatPeriods } from "@/lib/tax/vat201";

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

const box = (v: ReturnType<typeof buildVat201>, b: string) => v.rows.find((r) => r.box === b)!;

describe("the VAT 201 boxes", () => {
  const rows = [
    { code: "SR", accountType: "income", systemKey: "sales_products", base: 10000, credit: 10000 },
    { code: "SR", accountType: "liability", systemKey: "vat_output", base: 0, credit: 500 },
    { code: "ZR", accountType: "income", systemKey: "sales_products", base: 2000, credit: 2000 },
    { code: "EX", accountType: "income", systemKey: "sales_services", base: 300, credit: 300 },
    { code: "OS", accountType: "income", systemKey: "sales_services", base: 50, credit: 50 },
    { code: "SR", accountType: "asset", systemKey: "inventory", base: 4000, credit: -4000 },
    { code: "SR", accountType: "asset", systemKey: "vat_input", base: 0, credit: -200 },
    { code: "OS", accountType: "expense", systemKey: "exp_rent", base: 700, credit: -700 },
    { code: "ZR", accountType: "expense", systemKey: "exp_transport", base: 80, credit: -80 },
    { code: "RC", accountType: "expense", systemKey: "exp_software", base: 1000, credit: -1000 },
    { code: "RC", accountType: "liability", systemKey: "vat_output_rc", base: 0, credit: 50 },
    { code: "RC", accountType: "asset", systemKey: "vat_input_rc", base: 0, credit: -50 },
    { code: "IM", accountType: "asset", systemKey: "inventory", base: 600, credit: -600 },
    { code: "IM", accountType: "liability", systemKey: "vat_output_rc", base: 0, credit: 30 },
    { code: "IM", accountType: "asset", systemKey: "vat_input_rc", base: 0, credit: -30 },
  ];
  const v = buildVat201(rows, "Dubai");

  it("puts sales under the registered emirate, and zero-rated and exempt in their boxes", () => {
    expect(box(v, "1b")).toMatchObject({ amount: 10000, vat: 500 });
    expect(box(v, "1a")).toMatchObject({ amount: 0, vat: 0 });
    expect(box(v, "4").amount).toBe(2000);
    expect(box(v, "5").amount).toBe(300);
  });

  it("reports reverse charge and imports as due and as recoverable", () => {
    expect(box(v, "3")).toMatchObject({ amount: 1000, vat: 50 });
    expect(box(v, "6")).toMatchObject({ amount: 600, vat: 30 });
    expect(box(v, "10")).toMatchObject({ amount: 1600, vat: 80 });
    expect(box(v, "9")).toMatchObject({ amount: 4000, vat: 200 });
  });

  it("leaves out of scope and zero-rated purchases off the return", () => {
    expect(box(v, "9").amount).toBe(4000);
    expect(box(v, "8").amount).toBe(10000 + 1000 + 2000 + 300 + 600);
  });

  it("adds up to the net VAT due", () => {
    expect(box(v, "8").vat).toBe(580);
    expect(box(v, "11").vat).toBe(280);
    expect(box(v, "12").vat).toBe(580);
    expect(box(v, "13").vat).toBe(280);
    expect(box(v, "14")).toMatchObject({ label: "Payable VAT for the period", vat: 300 });
    expect(v.payable).toBe(300);
  });

  it("says refundable when more can be reclaimed than is due", () => {
    const r = buildVat201([{ code: "SR", accountType: "asset", systemKey: "vat_input", base: 0, credit: -75 }], "sharjah");
    expect(r.payable).toBe(-75);
    expect(box(r, "14")).toMatchObject({ label: "Refundable VAT for the period", vat: 75 });
  });

  it("settles the VAT accounts into what is payable, in balance either way", () => {
    expect(journalProblem(vatSettlementLines(v, "x")!)).toBeNull();
    const refund = buildVat201([{ code: "SR", accountType: "asset", systemKey: "vat_input", base: 0, credit: -75 }], "dubai");
    const l = vatSettlementLines(refund, "x")!;
    expect(journalProblem(l)).toBeNull();
    expect(l.map((x) => [x.account, x.debit ?? -(x.credit as number)])).toEqual([
      ["vat_input", -75],
      ["vat_payable", 75],
    ]);
    expect(vatSettlementLines(buildVat201([], "dubai"), "x")).toBeNull();
    expect(journalProblem(vatPaymentLines({ amount: -75, bankLedgerAccountId: 1, description: "x" }))).toBeNull();
  });
});

describe("VAT periods", () => {
  it("finds the quarter a day falls in, whatever month the year of periods starts", () => {
    expect(vatPeriodOf("2026-11-07", 3, 1)).toMatchObject({ from: "2026-10-01", to: "2026-12-31", due: "2027-01-28" });
    expect(vatPeriodOf("2026-11-07", 3, 2)).toMatchObject({ from: "2026-11-01", to: "2027-01-31" });
    expect(vatPeriodOf("2026-01-15", 3, 3)).toMatchObject({ from: "2025-12-01", to: "2026-02-28" });
    expect(vatPeriodOf("2026-02-10", 1, 1)).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("lists periods newest first with no gaps", () => {
    const list = vatPeriods("2026-11-07", 3, 1, 3);
    expect(list.map((p) => p.from)).toEqual(["2026-10-01", "2026-07-01", "2026-04-01"]);
    expect(list[1].to).toBe("2026-09-30");
  });
});

describe("the FTA Audit File", () => {
  it("replaces commas and removes line breaks inside a field", () => {
    expect(fafText("A, B\nC")).toBe("A; B C");
  });

  it("splits a document's VAT across its standard-rated lines, to the exact fils", () => {
    const lines = [
      { doc: "I", code: "SR", net: 33.33, vat: 5 },
      { doc: "I", code: "ZR", net: 10, vat: 5 },
      { doc: "I", code: "SR", net: 33.33, vat: 5 },
      { doc: "I", code: "SR", net: 33.33, vat: 5 },
    ];
    const v = splitVat(lines);
    expect(v[1]).toBe(0);
    expect(Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100).toBe(5);
  });

  it("has every section with its totals", () => {
    const csv = buildFaf(
      { nameEn: "Zeronix, LLC", nameAr: "", trn: "100", agencyName: "", tan: "", agentName: "", taan: "", from: "2026-10-01", to: "2026-12-31", created: "2027-01-05", product: "Zeronix OS" },
      [{ supplier: "S", country: "AE", trn: "1", invoiceDate: "2026-10-02", invoiceNo: "B1", permitNo: "", transactionId: "ZBL-1", lineNo: 1, description: "x", value: 100, vat: 5, taxCode: "SR" }],
      [{ customer: "C", country: "AE", trn: "2", invoiceDate: "2026-10-03", invoiceNo: "I1", transactionId: "I1", lineNo: 1, description: "y", value: 200, vat: 10, taxCode: "SR" }],
      [{ date: "2026-10-03", accountId: "1200", accountName: "AR", description: "d", name: "n", transactionId: "JE1", sourceId: "1", sourceType: "invoice", debit: 210, credit: 0, balance: 210 }],
    );
    const lines = csv.split("\r\n");
    expect(lines[2]).toContain("Zeronix; LLC,,100");
    expect(lines[2]).toContain("01/10/2026,31/12/2026");
    expect(csv).toContain("FAFv1.0.0");
    expect(csv).toContain("100.00,5.00,1");
    expect(csv).toContain("200.00,10.00,1");
    expect(csv).toContain("210.00,0.00,1,AED");
    for (const s of ["Company Information", "Supplier Purchase Listing", "Customer Supply Listing", "General Ledger"]) expect(csv).toContain(`${s} Table Start`);
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("filing a VAT return through the real actions (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let N: typeof import("@/app/(app)/accounts/note-actions");
  let V: typeof import("@/app/(app)/accounts/vat-actions");
  let O: typeof import("@/app/(app)/accounts/opening-actions");
  let SA: typeof import("@/app/(app)/accounts/settings-actions");
  let L: typeof import("@/lib/ledger/vat");
  let AD: typeof import("@/lib/accounts-data");
  let orgId = 0, accountant = 0, supplierId = 0, companyId = 0, savedTrn: string | null = null;
  const tag = `ZZVR${Date.now()}`;
  let ref = 0;
  const today = new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
  // a whole past month, with monthly periods, and the month before it for the cut-over
  const period = vatPeriodOf(new Date(Date.parse(`${today.slice(0, 7)}-01`) - 86400_000).toISOString().slice(0, 10), 1, 1);
  const mid = `${period.from.slice(0, 8)}15`;

  const balance = async (key: string) =>
    Math.round(Number((await db.execute<{ b: number }>(D.sql`SELECT coalesce(sum(l.debit - l.credit), 0)::float b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.organization_id = ${orgId} AND a.system_key = ${key}`)).rows[0].b) * 100) / 100;
  const lockDate = async () => (await db.select({ d: schema.accountingSettings.lockDate }).from(schema.accountingSettings).where(D.eq(schema.accountingSettings.organizationId, orgId)))[0].d;

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/accounts/purchase-actions");
    A = await import("@/app/(app)/accounts/actions");
    N = await import("@/app/(app)/accounts/note-actions");
    V = await import("@/app/(app)/accounts/vat-actions");
    O = await import("@/app/(app)/accounts/opening-actions");
    SA = await import("@/app/(app)/accounts/settings-actions");
    L = await import("@/lib/ledger/vat");
    AD = await import("@/lib/accounts-data");
    const S = await import("@/lib/ledger/setup");
    orgId = (await createTestOrg({ name: tag, emirate: "dubai" }))[0].id;
    await S.ledgerReady(orgId);
    mockOrg.id = orgId;
    await db.update(schema.accountingSettings).set({ vatPeriodMonths: 1, vatPeriodStartMonth: 1 }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    accountant = (await db.insert(schema.users).values({ name: tag, email: `${tag}@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"], isAccountant: true }).returning({ id: schema.users.id }))[0].id;
    await db.insert(schema.attendancePunches).values({ userId: accountant, day: today });
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier`, trn: "100000000000003" }).returning({ id: schema.suppliers.id }))[0].id;
    const [t] = await db.select().from(schema.settings).where(D.eq(schema.settings.key, "quote_trn"));
    savedTrn = t?.value ?? null;
    await db.insert(schema.settings).values({ key: "quote_trn", value: "100000000000003" }).onConflictDoUpdate({ target: [schema.settings.organizationId, schema.settings.key], set: { value: "100000000000003" } });
    cookieValue = await new SignJWT({ name: tag, email: `${tag}@example.test`, role: "sales" }).setProtectedHeader({ alg: "HS256" }).setSubject(String(accountant)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await O.setCutover(period.from);
    companyId = (await A.createCustomerFromAccounts({ name: `${tag} Customer`, address: "Dubai" })).id;
  });

  afterAll(async () => {
    mockOrg.id = 0;
    await db.update(schema.settings).set({ value: savedTrn ?? "" }).where(D.eq(schema.settings.key, "quote_trn"));
  });

  it("works the boxes out from real documents, credit and debit notes included", async () => {
    const inv = await A.createInvoice({
      companyId,
      issueDate: mid,
      termsDays: 30,
      vatPct: 5,
      customerAddress: "Dubai",
      lines: [
        { description: "Laptops", qty: 4, unitPrice: 1000, lineKind: "product", taxCode: "SR" },
        { description: "Export", qty: 1, unitPrice: 500, lineKind: "product", taxCode: "ZR" },
        { description: "Exempt", qty: 1, unitPrice: 300, lineKind: "service", taxCode: "EX" },
      ],
    });
    const row = (await AD.getInvoice(inv.id))!;
    await N.createCreditNote(inv.id, { issueDate: mid, reason: "One returned", lines: [{ itemId: row.lines.find((l) => l.taxCode === "SR")!.id, qty: 1, unitPrice: 1000 }] });
    const bill = await P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: mid, termsDays: 0, category: "rent", lines: [{ description: "Rent", qty: 1, unitCost: 1000, taxCode: "SR" }, { description: "Fees", qty: 1, unitCost: 100, taxCode: "OS" }] });
    const { getBill } = await import("@/lib/purchases-data");
    const b = (await getBill(bill.id))!;
    await N.createDebitNote(bill.id, { issueDate: mid, reason: "Overcharged", lines: [{ itemId: b.lines.find((l) => l.taxCode === "SR")!.id, qty: 1, unitPrice: 200 }] });
    await P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: mid, termsDays: 0, category: "software", lines: [{ description: "Cloud", qty: 1, unitCost: 2000, taxCode: "RC" }] });

    const { boxes, difference } = await L.vatReturnFor(db, orgId, period.from, period.to);
    expect(difference).toBe(0);
    expect(box(boxes, "1b")).toMatchObject({ amount: 3000, vat: 150 });
    expect(box(boxes, "4").amount).toBe(500);
    expect(box(boxes, "5").amount).toBe(300);
    expect(box(boxes, "3")).toMatchObject({ amount: 2000, vat: 100 });
    expect(box(boxes, "9")).toMatchObject({ amount: 800, vat: 40 });
    expect(box(boxes, "10")).toMatchObject({ amount: 2000, vat: 100 });
    expect(boxes.payable).toBe(250 - 140);
  });

  it("refuses to file a period that is not ours, or one that has not ended", async () => {
    await expect(V.fileVatReturn({ from: period.from, to: mid })).rejects.toThrow(/not one of our VAT periods/);
    const next = vatPeriodOf(today, 1, 1);
    await expect(V.fileVatReturn({ from: next.from, to: next.to })).rejects.toThrow(/has not ended/);
  });

  it("files: keeps the boxes, empties the VAT accounts into what is payable and locks the period", async () => {
    const { id } = await V.fileVatReturn({ from: period.from, to: period.to, reference: "FTA-1" });
    expect(await balance("vat_output")).toBe(0);
    expect(await balance("vat_input")).toBe(0);
    expect(await balance("vat_output_rc")).toBe(0);
    expect(await balance("vat_input_rc")).toBe(0);
    expect(await balance("vat_payable")).toBe(-110);
    expect(await lockDate()).toBe(period.to);
    const [r] = await db.select().from(schema.vatReturns).where(D.eq(schema.vatReturns.id, id));
    expect(r.payable).toBe(110);
    // a document cannot be slipped into a filed period, and the lock cannot move back
    await expect(P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: mid, termsDays: 0, category: "rent", lines: [{ description: "Late", qty: 1, unitCost: 10, taxCode: "SR" }] })).rejects.toThrow(/lock/i);
    await expect(SA.setLockDate(null, "reopen")).rejects.toThrow(/filed/);
    await expect(V.fileVatReturn({ from: period.from, to: period.to })).rejects.toThrow(/already filed/);
    // settlement does not show on the return itself
    expect((await L.vatReturnFor(db, orgId, period.from, period.to)).boxes.payable).toBe(110);
  });

  it("records the payment, then undoes the filing and everything comes back", async () => {
    const [r] = await db.select().from(schema.vatReturns).where(D.and(D.eq(schema.vatReturns.organizationId, orgId), D.isNull(schema.vatReturns.undoneAt)));
    await expect(V.payVatReturn(r.id, { paidOn: period.to, method: "bank", reference: "x" })).rejects.toThrow(/after the period/);
    await V.payVatReturn(r.id, { paidOn: today, method: "bank", reference: "TT-1" });
    expect(await balance("vat_payable")).toBe(0);
    expect(await balance("bank")).toBe(-110);
    await expect(V.payVatReturn(r.id, { paidOn: today, method: "bank" })).rejects.toThrow(/already settled/);
    await V.undoVatFiling(r.id, "Filed by mistake");
    expect(await balance("vat_payable")).toBe(0);
    expect(await balance("bank")).toBe(0);
    expect(await balance("vat_output")).toBe(-150);
    expect(await balance("vat_input")).toBe(40);
    expect(await lockDate()).toBeNull();
    // and it can be filed again
    const again = await V.fileVatReturn({ from: period.from, to: period.to });
    expect(again.id).not.toBe(r.id);
    expect(await balance("vat_payable")).toBe(-110);
  });

  it("makes an audit file that agrees with the documents", async () => {
    const csv = await L.fafFile(orgId, period.from, period.to);
    expect(csv).toContain(`${tag} Supplier`);
    expect(csv).toContain("ZDB-");
    expect(csv).toContain("ZCN-");
    expect(csv).toContain("-200.00,-10.00,SR");
    expect(csv).toContain("-1000.00,-50.00,SR");
  });

  it("finds documents the FTA could question", async () => {
    const [before] = [await L.vatProblems(period.from, period.to)];
    expect(before.some((x) => x.check.includes("Zero-rated") )).toBe(false);
    await db.update(schema.suppliers).set({ trn: "" }).where(D.eq(schema.suppliers.id, supplierId));
    const after = await L.vatProblems(period.from, period.to);
    expect(after.some((x) => x.check === "VAT reclaimed with no supplier TRN")).toBe(true);
  });
});
