import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildPnl, monthsBetween, periodRange, reportToCsv } from "@/lib/reports";

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

describe("report periods and sums", () => {
  it("works out preset periods from today", () => {
    const t = "2026-10-25";
    expect(periodRange("this-month", t)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("last-month", t)).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("this-quarter", t)).toMatchObject({ from: "2026-10-01", to: "2026-12-31" });
    expect(periodRange("last-quarter", t)).toMatchObject({ from: "2026-07-01", to: "2026-09-30" });
    expect(periodRange("last-year", t)).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
    expect(periodRange("last-month", "2026-01-15")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodRange("whatever", t, "2026-02-01", "2026-03-15")).toMatchObject({ key: "custom", from: "2026-02-01", to: "2026-03-15" });
    expect(periodRange("nope", t).key).toBe("this-month");
  });

  it("lists the months a period touches", () => {
    expect(monthsBetween("2025-11-10", "2026-02-03")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-05-01", "2026-05-31")).toEqual(["2026-05"]);
  });

  it("builds profit and loss: credit notes off sales, cost of goods above gross profit", () => {
    const p = buildPnl({
      months: [
        { month: "2026-01", sales: 10000, credits: 1000, costs: { cogs: 5000, rent: 1500 } },
        { month: "2026-02", sales: 4000, credits: 0, costs: { cogs: 2000, fuel: 300, rent: 1500 } },
      ],
      categoryLabel: (k) => k,
    });
    expect(p.totals).toMatchObject({ sales: 14000, credits: 1000, net: 13000, cogs: 7000, gross: 6000, exp: 3300, profit: 2700 });
    expect(p.categories.map((c) => c.key)).toEqual(["rent", "fuel"]);
    expect(p.byMonth[0]).toMatchObject({ net: 9000, gross: 4000, exp: 1500, profit: 2500 });
  });

  it("writes a CSV Excel opens, safe from formulas", () => {
    const csv = reportToCsv({ title: "T", period: "P", kpis: [], tables: [{ title: "A", columns: [{ label: "Name" }, { label: "AED", kind: "money" }], rows: [["=cmd()", 1.5], ['Say "hi", ok', -2]] }] });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=cmd(),1.5");
    expect(csv).toContain('"Say ""hi"", ok",-2');
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("reports on real tables (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let D: typeof import("drizzle-orm");
  let R: typeof import("@/lib/reports-data");
  let accountant = 0, companyId = 0, supplierId = 0;
  const tag = `ZZREP${Date.now()}`;
  // a year nobody has real data in, so the totals are exactly ours
  const from = "2019-01-01", to = "2019-12-31";

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    D = await import("drizzle-orm");
    R = await import("@/lib/reports-data");
    const P = await import("@/app/(app)/accounts/purchase-actions");
    const A = await import("@/app/(app)/accounts/actions");
    const today = (await import("@/lib/dates")).dubaiToday();
    accountant = (await db.insert(schema.users).values({ name: `${tag}-acc`, email: `${tag}-acc@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"] }).returning({ id: schema.users.id }))[0].id;
    await db.insert(schema.attendancePunches).values({ userId: accountant, day: today });
    cookieValue = await new SignJWT({ name: tag, email: `${tag}@example.test`, role: "sales" }).setProtectedHeader({ alg: "HS256" }).setSubject(String(accountant)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    companyId = (await db.insert(schema.companies).values({ name: `${tag} Customer LLC`, nameNorm: `${tag.toLowerCase()}customerllc` }).returning({ id: schema.companies.id }))[0].id;
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier` }).returning({ id: schema.suppliers.id }))[0].id;
    // a sale of 5000 + 250 VAT (written directly: an order and its numbering are not what is tested here)
    await db.insert(schema.invoices).values({ number: `${tag}-S1`, kind: "sale", companyId, issueDate: "2019-03-10", supplyDate: "2019-03-10", termsDays: 30, dueDate: "2019-04-09", customerName: `${tag} Customer LLC`, vatPct: 5, subtotal: 5000, vatAmount: 250, total: 5250 });
    // an opening balance in the same year: owed, but not a sale of the period
    await A.createOpeningInvoice({ companyId, number: `${tag}-OLD`, issueDate: "2019-02-01", termsDays: 30, total: 999 });
    await P.createBill({ supplierId, supplierRef: `${tag}-B1`, billDate: "2019-03-12", termsDays: 30, category: "cogs", lines: [{ description: "Goods", qty: 1, unitCost: 2000 }], vatPct: 5 });
    await P.createExpense({ paidOn: "2019-03-20", category: "rent", paidTo: `${tag} Landlord`, description: "March rent", amount: 1000, vatPct: 5, method: "bank", reference: "FT1" });
  });

  afterAll(async () => {
    const { inArray, like, or, eq } = D;
    const bills = (await db.select({ id: schema.bills.id }).from(schema.bills).where(or(eq(schema.bills.supplierId, supplierId), like(schema.bills.paidTo, `${tag}%`)))).map((b) => b.id);
    if (bills.length) {
      await db.delete(schema.supplierPayments).where(inArray(schema.supplierPayments.billId, bills));
      await db.delete(schema.bills).where(inArray(schema.bills.id, bills));
    }
    await db.delete(schema.invoices).where(eq(schema.invoices.companyId, companyId));
    await db.delete(schema.companies).where(eq(schema.companies.id, companyId));
    await db.delete(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
    await db.delete(schema.attendancePunches).where(eq(schema.attendancePunches.userId, accountant));
    await db.delete(schema.users).where(eq(schema.users.id, accountant));
    await pool.end();
  });

  it("adds up profit and loss, leaving the opening balance out", async () => {
    const r = await R.runReport("pnl", from, to, "2019");
    expect(r.kpis.map((k) => k.value)).toEqual([5000, 3000, 1000, 2000]);
  });

  it("works out VAT to pay from sales and purchases", async () => {
    const r = await R.runReport("vat", from, to, "2019");
    expect(r.kpis.map((k) => k.value)).toEqual([250, 150, 100]);
    expect(r.tables[0].total).toEqual(["Net VAT to pay", null, 100]);
  });

  it("counts the opening balance in what customers owe, and money paid out by month", async () => {
    const owe = await R.runReport("receivables", from, to, "2019");
    expect(owe.tables[1].rows.some((row) => row[0] === `${tag}-OLD`)).toBe(true);
    const cash = await R.runReport("cash", from, to, "2019");
    expect(cash.kpis[1].value).toBe(1050);
  });
});
