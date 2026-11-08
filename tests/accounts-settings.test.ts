import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MAPPABLE_KEYS, paymentMethodOf } from "@/lib/ledger/settings-rules";

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

describe("settings rules", () => {
  it("splits accounts by how they are paid from", () => {
    expect(["cash", "petty", "bank", "card"].map(paymentMethodOf)).toEqual(["cash", "cash", "bank", "bank"]);
  });

  it("leaves goods and control accounts out of what can be pointed elsewhere", () => {
    const keys = MAPPABLE_KEYS.map((k) => k.key);
    expect(keys).toEqual(expect.arrayContaining(["sales_products", "sales_services", "project_costs", "exp_rent"]));
    for (const k of ["cogs", "inventory", "ar", "ap", "vat_output", "vat_input", "customer_advances"]) expect(keys).not.toContain(k);
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("Accounts settings (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let St: typeof import("@/app/(app)/accounts/settings-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let O: typeof import("@/app/(app)/accounts/opening-actions");
  let Data: typeof import("@/lib/ledger/data");
  let orgId = 0, accountant = 0, plain = 0, supplierId = 0;
  let saved: { key: string; value: string }[] = [];
  const KEYS = ["quote_trn", "invoice_prefix", "invoice_next_number", "invoice_digits", "default_terms_days", "bank_name", "bank_account_name", "bank_account_number", "bank_iban", "bank_swift"];
  const tag = `ZZST${Date.now()}`;
  const day = (back: number) => new Date(Date.now() - back * 86400_000 + 4 * 3600_000).toISOString().slice(0, 10);

  const as = async (id: number) => {
    cookieValue = await new SignJWT({ name: tag, email: `${tag}@example.test`, role: "sales" }).setProtectedHeader({ alg: "HS256" }).setSubject(String(id)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const accountsOf = () => Data.bankAccountOptions(orgId);
  const settings = async () => (await db.select().from(schema.accountingSettings).where(D.eq(schema.accountingSettings.organizationId, orgId)))[0];
  const bal = async (id: number) => Number((await db.execute<{ b: number }>(D.sql`SELECT coalesce(sum(debit - credit), 0)::float b FROM journal_lines WHERE account_id = ${id}`)).rows[0].b);
  const ledgerIdOf = async (bankId: number) => (await db.select({ a: schema.bankAccounts.accountId }).from(schema.bankAccounts).where(D.eq(schema.bankAccounts.id, bankId)))[0].a;
  const auditOf = async (action: string) => db.select().from(schema.auditLog).where(D.and(D.eq(schema.auditLog.action, action), D.eq(schema.auditLog.userId, accountant)));

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    St = await import("@/app/(app)/accounts/settings-actions");
    A = await import("@/app/(app)/accounts/actions");
    P = await import("@/app/(app)/accounts/purchase-actions");
    O = await import("@/app/(app)/accounts/opening-actions");
    Data = await import("@/lib/ledger/data");
    const S = await import("@/lib/ledger/setup");
    orgId = (await db.insert(schema.organizations).values({ name: tag }).returning({ id: schema.organizations.id }))[0].id;
    await S.ledgerReady(orgId);
    mockOrg.id = orgId;
    const mk = async (name: string, isAccountant: boolean) => (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"], isAccountant }).returning({ id: schema.users.id }))[0].id;
    accountant = await mk("acc", true);
    plain = await mk("plain", false);
    await db.insert(schema.attendancePunches).values([accountant, plain].map((userId) => ({ userId, day: day(0) })));
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier` }).returning({ id: schema.suppliers.id }))[0].id;
    saved = await db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(D.inArray(schema.settings.key, KEYS));
    await as(accountant);
  });

  afterAll(async () => {
    mockOrg.id = 0;
    await db.delete(schema.settings).where(D.inArray(schema.settings.key, KEYS));
    if (saved.length) await db.insert(schema.settings).values(saved);
  });

  it("is for accountants only", async () => {
    await as(plain);
    await expect(St.setLockDate(day(5), "")).rejects.toThrow(/accountant/i);
    await expect(St.saveNumbering({ invoice_prefix: "X", invoice_next_number: 1, invoice_digits: 3 })).rejects.toThrow(/accountant/i);
    await expect(St.saveBankAccount(null, { name: "Sneaky", kind: "bank" })).rejects.toThrow(/accountant/i);
    await as(accountant);
  });

  it("saves the VAT registration, refusing a TRN that is not one, and leaves an audit trail", async () => {
    await expect(St.saveVatRegistration({ trn: "123", emirate: "dubai", vatPeriodMonths: 3, vatPeriodStartMonth: 1 })).rejects.toThrow();
    await St.saveVatRegistration({ trn: "100000000000003", emirate: "sharjah", vatPeriodMonths: 1, vatPeriodStartMonth: 2 });
    expect(await settings()).toMatchObject({ vatPeriodMonths: 1, vatPeriodStartMonth: 2 });
    const [org] = await db.select().from(schema.organizations).where(D.eq(schema.organizations.id, orgId));
    expect(org.emirate).toBe("sharjah");
    expect((await auditOf("settings.vat_registration")).length).toBe(1);
  });

  it("changes the financial year only while the ledger is empty", async () => {
    await St.saveFiscalYear(4);
    expect((await db.select().from(schema.organizations).where(D.eq(schema.organizations.id, orgId)))[0].fiscalYearStartMonth).toBe(4);
    await St.saveFiscalYear(1);
    await O.setCutover(day(40));
    await P.createExpense({ paidOn: day(10), category: "transport", paidTo: tag, description: "Fuel", amount: 10, method: "cash" });
    await expect(St.saveFiscalYear(7)).rejects.toThrow(/cannot change/);
  });

  it("adds a bank account with its own ledger account, and moves the default", async () => {
    await St.saveBankAccount(null, { name: `${tag} ENBD`, kind: "bank", bankName: "ENBD", iban: "AE070331234567890123456", isDefault: true });
    const list = await accountsOf();
    const mine = list.find((a) => a.name === `${tag} ENBD`)!;
    expect(mine.isDefault).toBe(true);
    expect(list.filter((a) => a.kind === "bank" && a.isDefault).length).toBe(1);
    const [acc] = await db.select().from(schema.ledgerAccounts).where(D.eq(schema.ledgerAccounts.id, await ledgerIdOf(mine.id)));
    expect(acc).toMatchObject({ name: `${tag} ENBD`, type: "asset", subtype: "bank", isGroup: false });
    // the cash default was not touched
    expect(list.filter((a) => a.kind === "cash" && a.isDefault).length).toBe(1);
    await expect(St.saveBankAccount(mine.id, { name: mine.name, kind: "cash" })).rejects.toThrow(/cannot become/);
  });

  it("posts a payment to the account picked, and refuses one of the wrong method", async () => {
    const list = await accountsOf();
    const mine = list.find((a) => a.name === `${tag} ENBD`)!;
    const other = list.find((a) => a.kind === "bank" && a.id !== mine.id)!;
    const cash = list.find((a) => a.kind === "cash")!;
    const before = await bal(await ledgerIdOf(other.id));
    const b = await P.createBill({ supplierId, supplierRef: `${tag}-1`, billDate: day(9), termsDays: 0, category: "rent", lines: [{ description: "Rent", qty: 1, unitCost: 400 }], vatPct: 0 });
    await P.recordSupplierPayment(b.id, { paidOn: day(8), amount: 100, method: "bank", reference: "FT1", bankAccountId: other.id });
    expect(await bal(await ledgerIdOf(other.id))).toBe(before - 100);
    // not picking one uses the default
    const defBefore = await bal(await ledgerIdOf(mine.id));
    await P.recordSupplierPayment(b.id, { paidOn: day(8), amount: 50, method: "bank", reference: "FT2" });
    expect(await bal(await ledgerIdOf(mine.id))).toBe(defBefore - 50);
    await expect(P.recordSupplierPayment(b.id, { paidOn: day(8), amount: 10, method: "bank", reference: "FT3", bankAccountId: cash.id })).rejects.toThrow(/cannot take/);
    await expect(P.recordSupplierPayment(b.id, { paidOn: day(8), amount: 10, method: "cash", bankAccountId: 99999999 })).rejects.toThrow(/no longer exists/);
  });

  it("will not switch off an account holding money, or the default", async () => {
    const list = await accountsOf();
    const mine = list.find((a) => a.name === `${tag} ENBD`)!;
    await expect(St.saveBankAccount(mine.id, { name: mine.name, kind: "bank", isDefault: true, isActive: false })).rejects.toThrow(/holds money|default/);
    await St.saveBankAccount(null, { name: `${tag} Spare`, kind: "bank" });
    const spare = (await accountsOf()).find((a) => a.name === `${tag} Spare`)!;
    await St.saveBankAccount(spare.id, { name: spare.name, kind: "bank", isActive: false });
    expect((await accountsOf()).some((a) => a.id === spare.id)).toBe(false);
    await expect(P.createExpense({ paidOn: day(8), category: "transport", paidTo: tag, description: "Fuel", amount: 10, method: "bank", reference: "FT", bankAccountId: spare.id })).rejects.toThrow(/switched off/);
  });

  it("locks the books, needs a reason to reopen them, and refuses a future date", async () => {
    await expect(St.setLockDate("2099-01-01", "")).rejects.toThrow(/future/);
    await St.setLockDate(day(20), "Q3 filed");
    expect((await settings()).lockDate).toBe(day(20));
    await expect(P.createExpense({ paidOn: day(25), category: "transport", paidTo: tag, description: "Fuel", amount: 10, method: "cash" })).rejects.toThrow(/locked/);
    await expect(St.setLockDate(null, "")).rejects.toThrow(/why/);
    await St.setLockDate(day(30), "Found a missing bill");
    expect((await settings()).lockDate).toBe(day(30));
    await St.setLockDate(null, "Found another");
    expect((await settings()).lockDate).toBeNull();
    expect((await auditOf("settings.lock_date")).length).toBe(3);
  });

  it("posts a category to the account picked, only for new documents and only of the right type", async () => {
    const a = schema.ledgerAccounts;
    const [fees] = await db.select({ id: a.id, key: a.systemKey }).from(a).where(D.and(D.eq(a.organizationId, orgId), D.eq(a.systemKey, "exp_fees")));
    const [bank] = await db.select({ id: a.id }).from(a).where(D.and(D.eq(a.organizationId, orgId), D.eq(a.systemKey, "bank")));
    const [group] = await db.select({ id: a.id }).from(a).where(D.and(D.eq(a.organizationId, orgId), D.eq(a.code, "1000")));
    await expect(St.saveAccountMap({ exp_rent: bank.id })).rejects.toThrow(/expense/);
    await expect(St.saveAccountMap({ exp_rent: group.id })).rejects.toThrow(/group/);
    await expect(St.saveAccountMap({ cogs: fees.id })).rejects.toThrow(/Unknown/);
    const before = await bal(fees.id);
    await St.saveAccountMap({ exp_rent: fees.id });
    await P.createExpense({ paidOn: day(5), category: "rent", paidTo: tag, description: "Rent", amount: 70, method: "cash" });
    expect(await bal(fees.id)).toBe(before + 70);
    // back to normal: picking its usual account stores nothing
    const [rent] = await db.select({ id: a.id }).from(a).where(D.and(D.eq(a.organizationId, orgId), D.eq(a.systemKey, "exp_rent")));
    await St.saveAccountMap({ exp_rent: rent.id });
    expect((await settings()).accountMap).toEqual({});
    await P.createExpense({ paidOn: day(5), category: "rent", paidTo: tag, description: "Rent", amount: 30, method: "cash" });
    expect(await bal(fees.id)).toBe(before + 70);
  });

  it("will not reuse an invoice number, and checks the IBAN", async () => {
    const [c] = await db.insert(schema.companies).values({ name: `${tag} C`, nameNorm: `${tag.toLowerCase()}c`, address: "Dubai" }).returning({ id: schema.companies.id });
    await St.saveNumbering({ invoice_prefix: `${tag}-`, invoice_next_number: 5, invoice_digits: 3 });
    await A.createInvoice({ companyId: c.id, issueDate: day(2), termsDays: 0, vatPct: 0, lines: [{ description: "x", qty: 1, unitPrice: 10 }] });
    await expect(St.saveNumbering({ invoice_prefix: `${tag}-`, invoice_next_number: 5, invoice_digits: 3 })).rejects.toThrow(/already exists/);
    // the IBAN printed on invoices is the bank account's, checked and tidied when the account is saved
    await expect(St.saveBankAccount(null, { name: `${tag} Bad IBAN`, kind: "bank", iban: "not an iban" })).rejects.toThrow(/IBAN/);
    await St.saveBankAccount(null, { name: `${tag} Spaced IBAN`, kind: "bank", iban: "AE07 0331 2345 6789 0123 456", swift: "EBILAEAD", holderName: tag });
    const [acc] = await db.select({ iban: schema.bankAccounts.iban, swift: schema.bankAccounts.swift, holder: schema.bankAccounts.holderName }).from(schema.bankAccounts).where(D.eq(schema.bankAccounts.name, `${tag} Spaced IBAN`));
    expect(acc).toEqual({ iban: "AE070331234567890123456", swift: "EBILAEAD", holder: tag });
    // invoice defaults are only the credit terms now
    const { getSetting } = await import("@/lib/settings");
    const terms = await getSetting("default_terms_days");
    await St.saveDocumentDetails({ default_terms_days: terms === "45" ? 60 : 45 });
    expect((await auditOf("settings.documents")).length).toBe(1);
    await St.saveDocumentDetails({ default_terms_days: Number(terms) });
  });
});
