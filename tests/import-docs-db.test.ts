import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestOrg } from "./helpers/orgs";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
const mockOrg = vi.hoisted(() => ({ id: 0 }));
// every query of the test runs in the throwaway organisation once it exists (runAsOrg still wins, as in the app)
vi.mock("@/db/org-context", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/org-context")>();
  const org = () => real.explicitOrgId() ?? (mockOrg.id || 1);
  return { ...real, resolveOrgId: async () => org(), resolveScope: async () => ({ org: org(), readOnly: false }) };
});

const live = !!process.env.DATABASE_URL;
const tag = `IMPT${Date.now()}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
describe.skipIf(!live)("imported invoices and bills are saved and posted (throwaway organisation)", () => {
  let db: any, schema: any, D: any, O: any, X: any;
  let orgId = 0;
  let userId = 0;
  const line = (price: number, taxCode = "SR", qty = 2) => ({ description: "Laptop", qty, price, kind: "product" as const, taxCode });
  const inv = (n: string, over: Record<string, unknown> = {}) => ({ number: `${tag}-${n}`, date: "2026-11-05", termsDays: 30, customerRef: "", address: "Dubai", basis: "net" as const, lines: [line(1000)], partyId: null, newParty: { name: `${tag} Acme LLC`, address: "Dubai" }, paid: null, ...over });
  const bill = (n: string, over: Record<string, unknown> = {}) => ({ number: `${tag}-${n}`, date: "2026-11-05", termsDays: 30, category: "cogs", notes: "", basis: "net" as const, vatOverride: null, lines: [line(500)], partyId: null, newParty: { name: `${tag} Supplier` }, paid: null, ...over });
  const run = (fn: (tx: any) => Promise<any>): Promise<any> => O.withOrg(orgId, fn);
  const paid = (amount: number, method = "bank", date = "2026-11-10") => ({ amount, date, method, bankAccountId: null, reference: "" });
  const balance = async (key: string) =>
    Number((await db.execute(D.sql`SELECT coalesce(sum(l.debit - l.credit), 0)::float b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.organization_id = ${orgId} AND a.system_key = ${key}`)).rows[0].b);

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    O = await import("@/lib/org");
    X = await import("@/lib/ledger/import-docs");
    const S = await import("@/lib/ledger/setup");
    // the app's role cannot add an organisation (row-level security): the test database owner makes it
    orgId = (await createTestOrg({ name: tag }))[0].id;
    mockOrg.id = orgId;
    await S.ledgerReady(orgId);
    await db.update(schema.accountingSettings).set({ cutoverDate: "2026-01-01" }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    userId = (await db.insert(schema.users).values({ name: `${tag}-u`, email: `${tag}-u@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"] }).returning({ id: schema.users.id }))[0].id;
  });

  // the throwaway organisation stays: the test database is made fresh for every run (tests/setup-test-db.ts)
  afterAll(() => {
    mockOrg.id = 0;
  });

  it("keeps the invoice number, adds the customer once and posts receivable, sales and VAT", async () => {
    const a = await run((tx) => X.importInvoiceTx(tx, orgId, userId, inv("A")));
    const b = await run((tx) => X.importInvoiceTx(tx, orgId, userId, inv("B", { newParty: { name: `${tag.toLowerCase()} acme llc`, address: "" } })));
    expect(a.number).toBe(`${tag}-A`);
    expect(b.partyId).toBe(a.partyId);
    expect((await db.execute(D.sql`SELECT count(*)::int n FROM companies WHERE name_norm = ${`${tag.toLowerCase()}acme`}`)).rows[0].n).toBe(1);
    const [row] = await db.select().from(schema.invoices).where(D.eq(schema.invoices.number, `${tag}-A`));
    expect(row).toMatchObject({ kind: "sale", issueDate: "2026-11-05", dueDate: "2026-12-05", subtotal: 2000, vatAmount: 100, total: 2100, status: "issued", customerAddress: "Dubai" });
    expect(await balance("ar")).toBe(4200);
    expect(await balance("vat_output")).toBe(-200);
  });

  it("refuses an invoice number that is already used, the future, and leaves nothing behind", async () => {
    await expect(run((tx) => X.importInvoiceTx(tx, orgId, userId, inv("A", { newParty: { name: `${tag} Other Co`, address: "" } })))).rejects.toThrow(/already in the system/);
    expect((await db.execute(D.sql`SELECT count(*)::int n FROM companies WHERE name = ${`${tag} Other Co`}`)).rows[0].n).toBe(0);
    await expect(run((tx) => X.importInvoiceTx(tx, orgId, userId, inv("F", { date: "2099-01-01" })))).rejects.toThrow(/future/);
  });

  it("records the receipt of a paid invoice and clears what is owed", async () => {
    const before = await balance("ar");
    const r = await run((tx) => X.importInvoiceTx(tx, orgId, userId, inv("P", { paid: paid(2100) })));
    expect(r.paymentNumber).toMatch(/^ZRV-2026-/);
    expect(await balance("ar")).toBe(before);
    expect(await balance("bank")).toBe(2100);
    await expect(run((tx) => X.importInvoiceTx(tx, orgId, userId, inv("Q", { paid: paid(5000) })))).rejects.toThrow(/more than the total/);
  });

  it("converts VAT-inclusive lines so the invoice comes to the amount in the file", async () => {
    await run((tx) => X.importInvoiceTx(tx, orgId, userId, inv("G", { basis: "gross", lines: [line(52.5, "SR", 2), line(52.5, "SR", 1)] })));
    const [row] = await db.select().from(schema.invoices).where(D.eq(schema.invoices.number, `${tag}-G`));
    expect(row).toMatchObject({ total: 157.5, vatAmount: 7.5, subtotal: 150 });
  });

  it("refuses a date in a locked period", async () => {
    await db.update(schema.accountingSettings).set({ lockDate: "2026-02-28" }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    await expect(run((tx) => X.importInvoiceTx(tx, orgId, userId, inv("L", { date: "2026-02-10" })))).rejects.toThrow();
    expect((await db.execute(D.sql`SELECT count(*)::int n FROM invoices WHERE number = ${`${tag}-L`}`)).rows[0].n).toBe(0);
    await db.update(schema.accountingSettings).set({ lockDate: null }).where(D.eq(schema.accountingSettings.organizationId, orgId));
  });

  it("saves a bill with its own number, adds the supplier once and refuses the same supplier invoice twice", async () => {
    const a = await run((tx) => X.importBillTx(tx, orgId, userId, bill("B1")));
    expect(a.number).toMatch(/^ZBL-2026-/);
    const b = await run((tx) => X.importBillTx(tx, orgId, userId, bill("B2", { newParty: { name: `${tag.toUpperCase()} SUPPLIER` } })));
    expect(b.partyId).toBe(a.partyId);
    await expect(run((tx) => X.importBillTx(tx, orgId, userId, bill("B1", { partyId: a.partyId, newParty: null })))).rejects.toThrow(/already entered/);
    expect(await balance("ap")).toBe(-2 * 1050);
  });

  it("records the payment voucher of a paid bill", async () => {
    const before = await balance("ap");
    const r = await run((tx) => X.importBillTx(tx, orgId, userId, bill("B3", { paid: paid(1050, "cash", "2026-11-12") })));
    expect(r.paymentNumber).toMatch(/^ZPV-2026-/);
    expect(await balance("ap")).toBe(before);
    expect(await balance("cash")).toBe(-1050);
  });
});
