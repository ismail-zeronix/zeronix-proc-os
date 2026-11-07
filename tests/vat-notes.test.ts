import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { journalProblem } from "@/lib/ledger/journal";
import { billLines, debitNoteLines } from "@/lib/ledger/rules";
import { docTax, noteVat } from "@/lib/tax/doc-tax";

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

describe("VAT per line", () => {
  it("works VAT out per code, charging only standard-rated lines", () => {
    const t = docTax([
      { net: 1000, code: "SR" },
      { net: 500, code: "ZR" },
      { net: 200, code: "RC" },
    ]);
    expect(t).toMatchObject({ subtotal: 1700, vat: 50, selfAssessed: 10, total: 1750, vatPct: 5 });
  });

  it("takes the supplier's VAT figure on standard-rated lines only", () => {
    expect(docTax([{ net: 250.5, code: "SR" }], 12.52)).toMatchObject({ vat: 12.52, total: 263.02 });
    expect(docTax([{ net: 100, code: "OS" }], 12)).toMatchObject({ vat: 0, total: 100, vatPct: 0 });
  });

  it("gives back VAT so no fils remain after several notes", () => {
    // 3 x 33.33 at 5% has 5.00 VAT in all, 1.67 on each line worked out alone
    const whole = docTax([{ net: 99.99, code: "SR" }]).vat;
    const first = noteVat([{ net: 33.33, code: "SR" }], { standardNet: 99.99, vat: whole });
    const second = noteVat([{ net: 33.33, code: "SR" }], { standardNet: 66.66, vat: whole - first });
    const last = noteVat([{ net: 33.33, code: "SR" }], { standardNet: 33.33, vat: Math.round((whole - first - second) * 100) / 100 });
    expect(Math.round((first + second + last) * 100) / 100).toBe(whole);
    expect(noteVat([{ net: 100, code: "ZR" }], { standardNet: 500, vat: 25 })).toBe(0);
  });

  it("posts reverse charge as ours alone: the supplier is owed the net", () => {
    const l = billLines({ number: "B", supplierId: 4, category: "software", orderId: null, dealId: null, parts: [{ code: "RC", net: 1000, selfAssessed: 50 }], vatAmount: 0, total: 1000 });
    expect(journalProblem(l)).toBeNull();
    expect(l.map((x) => [x.account, x.debit ?? -(x.credit as number), x.taxCode ?? null])).toEqual([
      ["exp_software", 1000, "RC"],
      ["vat_input_rc", 50, "RC"],
      ["vat_output_rc", -50, "RC"],
      ["ap", -1000, null],
    ]);
  });

  it("takes goods sent back out of stock first, the rest out of cost of goods sold", () => {
    const l = debitNoteLines({ number: "D", billNumber: "B", supplierId: 4, category: "cogs", orderId: null, dealId: null, parts: [{ code: "SR", net: 300, selfAssessed: 0 }], vatAmount: 15, total: 315, inStock: 100 });
    expect(journalProblem(l)).toBeNull();
    expect(l.map((x) => [x.account, x.debit ?? -(x.credit as number)])).toEqual([
      ["ap", 315],
      ["inventory", -100],
      ["cogs", -200],
      ["vat_input", -15],
    ]);
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("line tax codes, credit notes and debit notes through the real actions (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let N: typeof import("@/app/(app)/accounts/note-actions");
  let O: typeof import("@/app/(app)/accounts/opening-actions");
  let AD: typeof import("@/lib/accounts-data");
  let PD: typeof import("@/lib/purchases-data");
  let orgId = 0, accountant = 0, supplierId = 0, companyId = 0, savedTrn: string | null = null;
  const tag = `ZZVN${Date.now()}`;
  const day = (back: number) => new Date(Date.now() - back * 86400_000 + 4 * 3600_000).toISOString().slice(0, 10);
  const today = day(0);
  let ref = 0;

  const balance = async (key: string) =>
    Math.round(Number((await db.execute<{ b: number }>(D.sql`SELECT coalesce(sum(l.debit - l.credit), 0)::float b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.organization_id = ${orgId} AND a.system_key = ${key}`)).rows[0].b) * 100) / 100;
  const moved = async (keys: string[], fn: () => Promise<unknown>) => {
    const before = await Promise.all(keys.map(balance));
    await fn();
    const after = await Promise.all(keys.map(balance));
    return Object.fromEntries(keys.map((k, i) => [k, Math.round((after[i] - before[i]) * 100) / 100]));
  };
  const ledgerBalanced = async () => {
    const r = await db.execute<{ d: number }>(D.sql`SELECT coalesce(sum(debit - credit), 0)::float d FROM journal_lines WHERE organization_id = ${orgId}`);
    expect(Math.round(Number(r.rows[0].d) * 100) / 100).toBe(0);
  };
  const twoLines = () =>
    A.createInvoice({
      companyId,
      issueDate: day(5),
      termsDays: 30,
      customerAddress: "Dubai",
      vatPct: 5,
      lines: [
        { description: "Laptops", qty: 4, unitPrice: 250, lineKind: "product", taxCode: "SR" },
        { description: "Export freight", qty: 1, unitPrice: 200, lineKind: "service", taxCode: "ZR" },
      ],
    });

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/accounts/purchase-actions");
    A = await import("@/app/(app)/accounts/actions");
    N = await import("@/app/(app)/accounts/note-actions");
    O = await import("@/app/(app)/accounts/opening-actions");
    AD = await import("@/lib/accounts-data");
    PD = await import("@/lib/purchases-data");
    const S = await import("@/lib/ledger/setup");
    orgId = (await db.insert(schema.organizations).values({ name: tag }).returning({ id: schema.organizations.id }))[0].id;
    await S.ledgerReady(orgId);
    mockOrg.id = orgId;
    accountant = (await db.insert(schema.users).values({ name: tag, email: `${tag}@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"], isAccountant: true }).returning({ id: schema.users.id }))[0].id;
    await db.insert(schema.attendancePunches).values({ userId: accountant, day: today });
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier` }).returning({ id: schema.suppliers.id }))[0].id;
    const [t] = await db.select().from(schema.settings).where(D.eq(schema.settings.key, "quote_trn"));
    savedTrn = t?.value ?? null;
    await db.insert(schema.settings).values({ key: "quote_trn", value: "100000000000003" }).onConflictDoUpdate({ target: schema.settings.key, set: { value: "100000000000003" } });
    cookieValue = await new SignJWT({ name: tag, email: `${tag}@example.test`, role: "sales" }).setProtectedHeader({ alg: "HS256" }).setSubject(String(accountant)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await O.setCutover(day(40));
    companyId = (await A.createCustomerFromAccounts({ name: `${tag} Customer`, address: "Dubai" })).id;
  });

  afterAll(async () => {
    mockOrg.id = 0;
    await db.update(schema.settings).set({ value: savedTrn ?? "" }).where(D.eq(schema.settings.key, "quote_trn"));
  });

  it("issues an invoice with two VAT codes: VAT only on the standard-rated line, each code in the ledger", async () => {
    const m = await moved(["ar", "sales_products", "sales_services", "vat_output"], twoLines);
    expect(m).toEqual({ ar: 1250, sales_products: -1000, sales_services: -200, vat_output: -50 });
    const rows = await db.execute<{ code: string; base: number }>(D.sql`SELECT t.code, sum(l.tax_base)::float base FROM journal_lines l JOIN tax_codes t ON t.id = l.tax_code_id WHERE l.organization_id = ${orgId} AND l.tax_base IS NOT NULL GROUP BY 1 ORDER BY 1`);
    expect(rows.rows.map((r) => [r.code, Number(r.base)])).toEqual([["SR", 1000], ["ZR", 200]]);
  });

  it("gives back part of an invoice: its own lines, its own VAT, and the customer owes less", async () => {
    const inv = await twoLines();
    const row = (await AD.getInvoice(inv.id))!;
    const laptops = row.lines.find((l) => l.taxCode === "SR")!;
    const m = await moved(["ar", "sales_products", "sales_services", "vat_output"], () => N.createCreditNote(inv.id, { issueDate: today, reason: "One laptop returned", lines: [{ itemId: laptops.id, qty: 1, unitPrice: 250 }] }));
    expect(m).toEqual({ ar: -262.5, sales_products: 250, sales_services: 0, vat_output: 12.5 });
    const after = (await AD.getInvoice(inv.id))!;
    expect(after.state.balance).toBe(987.5);
    expect(after.status).toBe("issued");
    expect(after.credits).toHaveLength(1);
    expect(after.lines.find((l) => l.id === laptops.id)!.left).toBe(750);
    // a second note on the same invoice is fine; more than is left is not
    await N.createCreditNote(inv.id, { issueDate: today, reason: "Another one back", lines: [{ itemId: laptops.id, qty: 1, unitPrice: 250 }] });
    await expect(N.createCreditNote(inv.id, { issueDate: today, reason: "Too much", lines: [{ itemId: laptops.id, qty: 3, unitPrice: 250 }] })).rejects.toThrow(/left to credit/);
    await ledgerBalanced();
  });

  it("cancels the invoice when notes reach its whole value, leaving nothing owed and no VAT", async () => {
    const inv = await twoLines();
    const row = (await AD.getInvoice(inv.id))!;
    const [a, b] = row.lines;
    await N.createCreditNote(inv.id, { issueDate: today, reason: "Price reduced", lines: [{ itemId: a.id, qty: 4, unitPrice: 100 }] });
    const m = await moved(["vat_output", "ar"], () => A.cancelInvoice(inv.id, "Whole order cancelled", { goodsBack: false }));
    expect(m).toEqual({ vat_output: 30, ar: -(600 + 200 + 30) });
    const after = (await AD.getInvoice(inv.id))!;
    expect(after.status).toBe("cancelled");
    expect(after.state.balance).toBe(0);
    expect(after.creditedTotal).toBe(after.total);
    expect(b.left).toBe(200);
    await ledgerBalanced();
  });

  it("turns money already paid into an advance when the note leaves less to pay", async () => {
    const inv = await twoLines();
    const row = (await AD.getInvoice(inv.id))!;
    const laptops = row.lines.find((l) => l.taxCode === "SR")!;
    await A.createReceipt({ companyId, paidOn: day(4), amount: 1250, method: "cash", allocations: [{ invoiceId: inv.id, amount: 1250 }] });
    const m = await moved(["ar", "customer_advances"], async () => {
      const r = await N.createCreditNote(inv.id, { issueDate: today, reason: "One laptop returned", lines: [{ itemId: laptops.id, qty: 1, unitPrice: 250 }] });
      expect(r.toAdvance).toBe(262.5);
    });
    expect(m).toEqual({ ar: 0 - 0, customer_advances: -262.5 });
    const after = (await AD.getInvoice(inv.id))!;
    expect(after.state.balance).toBe(0);
    expect(after.state.paid).toBe(987.5);
    expect(await AD.customerAdvances(companyId)).toEqual(expect.arrayContaining([expect.objectContaining({ left: 262.5 })]));
    await ledgerBalanced();
  });

  it("puts the cost of goods that come back into stock, only as much as was sold", async () => {
    const inv = await twoLines();
    await P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: day(5), termsDays: 0, category: "cogs", invoiceId: inv.id, lines: [{ description: "Laptops", qty: 4, unitCost: 100, taxCode: "SR" }] });
    const row = (await AD.getInvoice(inv.id))!;
    const laptops = row.lines.find((l) => l.taxCode === "SR")!;
    await expect(N.createCreditNote(inv.id, { issueDate: today, reason: "Back", goodsBack: true, goodsCost: 500, lines: [{ itemId: laptops.id, qty: 1, unitPrice: 250 }] })).rejects.toThrow(/cost of goods sold/);
    const m = await moved(["inventory", "cogs"], () => N.createCreditNote(inv.id, { issueDate: today, reason: "Back", goodsBack: true, goodsCost: 100, lines: [{ itemId: laptops.id, qty: 1, unitPrice: 250 }] }));
    expect(m).toEqual({ inventory: 100, cogs: -100 });
  });

  it("refuses a credit note on an opening invoice, or dated before the invoice", async () => {
    const inv = await twoLines();
    const row = (await AD.getInvoice(inv.id))!;
    await expect(N.createCreditNote(inv.id, { issueDate: day(10), reason: "Too early", lines: [{ itemId: row.lines[0].id, qty: 1, unitPrice: 250 }] })).rejects.toThrow(/before the invoice/);
  });

  it("posts reverse charge and imports: nothing to the supplier, both sides of the VAT on our books", async () => {
    const m = await moved(["ap", "exp_software", "vat_input_rc", "vat_output_rc", "vat_input"], () =>
      P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: day(3), termsDays: 0, category: "software", lines: [{ description: "Cloud hosting", qty: 1, unitCost: 1000, taxCode: "RC" }] }),
    );
    expect(m).toEqual({ ap: -1000, exp_software: 1000, vat_input_rc: 50, vat_output_rc: -50, vat_input: 0 });
  });

  it("takes an expense with reverse charge out of the bank at its net", async () => {
    const m = await moved(["vat_input_rc", "vat_output_rc", "exp_software"], () => P.createExpense({ paidOn: day(3), category: "software", paidTo: "Google", description: "Ads", amount: 200, taxCode: "RC", method: "cash" }));
    expect(m).toEqual({ vat_input_rc: 10, vat_output_rc: -10, exp_software: 200 });
  });

  it("uses the supplier's VAT amount on a bill with several codes", async () => {
    const r = await P.createBill({
      supplierId,
      supplierRef: `${tag}-${++ref}`,
      billDate: day(3),
      termsDays: 0,
      category: "rent",
      vatAmount: 12.52,
      lines: [
        { description: "Office", qty: 1, unitCost: 250.5, taxCode: "SR" },
        { description: "Fee", qty: 1, unitCost: 50, taxCode: "OS" },
      ],
    });
    const b = (await PD.getBill(r.id))!;
    expect(b).toMatchObject({ subtotal: 300.5, vatAmount: 12.52, total: 313.02 });
  });

  it("takes a debit note off a bill: we owe less, stock and VAT fall, and the bill can no longer be voided", async () => {
    const r = await P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: day(3), termsDays: 0, category: "cogs", lines: [{ description: "Stock", qty: 10, unitCost: 100, taxCode: "SR" }] });
    const b = (await PD.getBill(r.id))!;
    const m = await moved(["ap", "inventory", "vat_input"], () => N.createDebitNote(r.id, { issueDate: today, reason: "Two damaged", supplierRef: "CN-9", lines: [{ itemId: b.lines[0].id, qty: 2, unitPrice: 100 }] }));
    expect(m).toEqual({ ap: 210, inventory: -200, vat_input: -10 });
    const after = (await PD.getBill(r.id))!;
    expect(after.state.balance).toBe(840);
    expect(after.debitNotes[0].number).toMatch(/^ZDB-/);
    await expect(P.voidBill(r.id, "Mistake")).rejects.toThrow(/debit note/);
    await ledgerBalanced();
  });

  it("does not move goods already sent back to cost of goods sold when the sale is invoiced later", async () => {
    const inv0 = await db.insert(schema.quotes).values({ year: 2098, seq: Date.now() % 100000, number: `${tag}-Q`, validUntil: today, companyId }).returning({ id: schema.quotes.id });
    const [o] = await db.insert(schema.salesOrders).values({ year: 2098, seq: Date.now() % 100000, number: `${tag}-SO`, quoteId: inv0[0].id, companyId, vatPct: 5, subtotal: 1000, vatAmount: 50, total: 1050, status: "delivered", deliveredOn: day(3) }).returning({ id: schema.salesOrders.id });
    await db.insert(schema.salesOrderItems).values({ orderId: o.id, description: "Goods", qty: 1, unitPrice: 1000 });
    const r = await P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: day(3), termsDays: 0, category: "cogs", orderId: o.id, lines: [{ description: "Goods", qty: 10, unitCost: 100, taxCode: "SR" }] });
    const b = (await PD.getBill(r.id))!;
    await N.createDebitNote(r.id, { issueDate: day(2), reason: "Sent four back", lines: [{ itemId: b.lines[0].id, qty: 4, unitPrice: 100 }] });
    const m = await moved(["cogs", "inventory"], () => A.issueInvoice(o.id, { issueDate: today, termsDays: 0, customerAddress: "Dubai" }));
    expect(m).toEqual({ cogs: 600, inventory: -600 });
  });

  it("takes what a debit note leaves over from the payment and keeps it as an advance with the supplier", async () => {
    const r = await P.createBill({ supplierId, supplierRef: `${tag}-${++ref}`, billDate: day(3), termsDays: 0, category: "rent", lines: [{ description: "Rent", qty: 1, unitCost: 1000, taxCode: "SR" }] });
    await P.createVoucher({ supplierId, paidOn: day(2), amount: 1050, method: "cash", allocations: [{ billId: r.id, amount: 1050 }] });
    const b = (await PD.getBill(r.id))!;
    const m = await moved(["supplier_advances", "ap"], async () => {
      const n = await N.createDebitNote(r.id, { issueDate: today, reason: "Overcharged", lines: [{ itemId: b.lines[0].id, qty: 1, unitPrice: 100 }] });
      expect(n.toAdvance).toBe(105);
    });
    expect(m).toEqual({ supplier_advances: 105, ap: 0 });
    expect((await PD.getBill(r.id))!.state.paid).toBe(945);
    await ledgerBalanced();
  });
});
