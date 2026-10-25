import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { billState, billTotals, categoryLabel, isCategory } from "@/lib/purchases";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

describe("purchase rules", () => {
  it("adds up lines and VAT, and takes the supplier's VAT figure when given", () => {
    expect(billTotals([{ qty: 2, unitCost: 100 }, { qty: 1, unitCost: 50.5 }], 5)).toEqual({ subtotal: 250.5, vatAmount: 12.53, total: 263.03 });
    expect(billTotals([{ qty: 2, unitCost: 100 }, { qty: 1, unitCost: 50.5 }], 5, 12.52)).toEqual({ subtotal: 250.5, vatAmount: 12.52, total: 263.02 });
    expect(billTotals([{ qty: 3, unitCost: 10 }], 0)).toEqual({ subtotal: 30, vatAmount: 0, total: 30 });
  });

  it("reads a bill like an invoice: due, part paid, overdue, paid, void", () => {
    const b = { status: "open", total: 1000, dueDate: "2026-11-10" };
    expect(billState(b, 0, "2026-11-01").label).toBe("Due in 9 days");
    expect(billState(b, 400, "2026-11-01")).toMatchObject({ key: "part", balance: 600 });
    expect(billState(b, 0, "2026-11-15")).toMatchObject({ key: "overdue", daysOverdue: 5 });
    expect(billState(b, 1000, "2026-11-15").key).toBe("paid");
    expect(billState({ ...b, status: "void" }, 0, "2026-11-15")).toMatchObject({ key: "cancelled", label: "Void", balance: 0 });
  });

  it("knows its categories", () => {
    expect(isCategory("cogs")).toBe(true);
    expect(isCategory("lunch")).toBe(false);
    expect(categoryLabel("rent")).toBe("Rent");
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("purchases (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let PD: typeof import("@/lib/purchases-data");
  let accountant = 0, seller = 0, supplierId = 0;
  let userIds: number[] = [];
  let today = "";
  const tag = `ZZPUR${Date.now()}`;

  const as = async (id: number) => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const bill = (ref: string, unitCost = 1000, extra: Partial<import("@/app/(app)/accounts/purchase-actions").BillInput> = {}) =>
    P.createBill({ supplierId, supplierRef: ref, billDate: today, termsDays: 30, category: "cogs", lines: [{ description: "Laptops", qty: 2, unitCost }], vatPct: 5, ...extra });

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/accounts/purchase-actions");
    PD = await import("@/lib/purchases-data");
    today = (await import("@/lib/dates")).dubaiToday();
    const mk = async (name: string, apps: string[], accountsLevel: "sales" | "finance") =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales", apps, accountsLevel }).returning({ id: schema.users.id }))[0].id;
    accountant = await mk("accountant", ["accounts"], "finance");
    seller = await mk("seller", ["crm", "accounts"], "sales");
    userIds = [accountant, seller];
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: today })));
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Distribution`, termsDays: 30 }).returning({ id: schema.suppliers.id }))[0].id;
  });

  afterAll(async () => {
    const { inArray, like, or, eq } = D;
    const bills = await db.select({ id: schema.bills.id }).from(schema.bills).where(or(eq(schema.bills.supplierId, supplierId), like(schema.bills.paidTo, `${tag}%`)));
    const ids = bills.map((b) => b.id);
    if (ids.length) {
      await db.delete(schema.supplierPayments).where(inArray(schema.supplierPayments.billId, ids));
      await db.delete(schema.bills).where(inArray(schema.bills.id, ids));
    }
    await db.delete(schema.suppliers).where(like(schema.suppliers.name, `${tag}%`));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  it("is for the accounts team only", async () => {
    await as(seller);
    await expect(bill("NOPE-1")).rejects.toThrow(/accounts team/);
  });

  it("records a bill once, numbered ZBL, with VAT", async () => {
    await as(accountant);
    const b = await bill("INV-100");
    expect(b.number).toMatch(new RegExp(`^ZBL-${today.slice(0, 4)}-\\d{4,}$`));
    const full = await PD.getBill(b.id);
    expect(full).toMatchObject({ subtotal: 2000, vatAmount: 100, total: 2100, kind: "bill", state: { key: "unpaid", balance: 2100 } });
    expect(full!.items).toHaveLength(1);
    await expect(bill("INV-100")).rejects.toThrow(/already entered as/);
    await expect(bill("")).rejects.toThrow(/invoice number/);
  });

  it("takes part payments, refuses too much, and voids", async () => {
    await as(accountant);
    const b = await bill("INV-200", 500); // 1000 + 50 VAT
    const p1 = await P.recordSupplierPayment(b.id, { paidOn: today, amount: 600, method: "cash" });
    expect(p1.number).toMatch(/^ZPV-/);
    expect(p1.fullyPaid).toBe(false);
    await expect(P.recordSupplierPayment(b.id, { paidOn: today, amount: 451, method: "cash" })).rejects.toThrow(/more than/);
    await expect(P.recordSupplierPayment(b.id, { paidOn: today, amount: 100, method: "bank" })).rejects.toThrow(/bank reference/);
    const p2 = await P.recordSupplierPayment(b.id, { paidOn: today, amount: 450, method: "bank", reference: "FT123" });
    expect(p2.fullyPaid).toBe(true);
    await expect(P.voidBill(b.id, "Wrong supplier")).rejects.toThrow(/Void them first/);
    await P.voidSupplierPayment(p2.id, "Typed twice");
    expect((await PD.getBill(b.id))!.state).toMatchObject({ key: "part", balance: 450 });
  });

  it("saves an expense with its payment, and voids both together", async () => {
    await as(accountant);
    const e = await P.createExpense({ paidOn: today, category: "transport", paidTo: `${tag} ENOC`, description: "Fuel", amount: 200, vatPct: 5, method: "cash" });
    expect(e.voucher).toMatch(/^ZPV-/);
    const full = await PD.getBill(e.id);
    expect(full).toMatchObject({ kind: "expense", total: 210, payee: `${tag} ENOC`, state: { key: "paid" } });
    await expect(P.voidSupplierPayment(full!.payments[0].id, "x is wrong")).rejects.toThrow(/void the expense/);
    await P.voidBill(e.id, "Entered twice");
    const after = await PD.getBill(e.id);
    expect(after!.status).toBe("void");
    expect(after!.payments[0].voidedAt).not.toBeNull();
  });

  it("gives every bill its own number when saved at the same moment", async () => {
    await as(accountant);
    const made = await Promise.all([1, 2, 3, 4, 5].map((i) => bill(`PAR-${i}`, 10)));
    const seqs = made.map((m) => Number(m.number.split("-").pop())).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(5);
    expect(seqs[4] - seqs[0]).toBe(4);
  });

  it("adds opening balances without VAT and counts what we owe the supplier", async () => {
    await as(accountant);
    await bill("OLD-9", 3000, { kind: "opening", lines: [{ description: "Opening balance", qty: 1, unitCost: 3000 }] });
    const rows = await PD.supplierBalances();
    const s = rows.find((r) => r.id === supplierId)!;
    const open = (await PD.listBills({ supplierId, withVoid: false })).reduce((n, b) => n + b.state.balance, 0);
    expect(s.owed).toBeCloseTo(open, 2);
    const opening = (await PD.listBills({ supplierId, kinds: ["opening"] }))[0];
    expect(opening).toMatchObject({ vatAmount: 0, total: 3000 });
  });
});
