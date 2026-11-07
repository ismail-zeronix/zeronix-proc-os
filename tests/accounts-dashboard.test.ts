import "dotenv/config";
import { SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cleanLayout, defaultLayout, widgetDef, WIDGETS, widgetsFor } from "@/lib/dashboard-widgets";

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

describe("the widget list", () => {
  it("has one of each, and each offers its usual width", () => {
    const ids = WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WIDGETS) expect(w.widths.length).toBeGreaterThan(0);
  });

  it("starts everyone on a layout of real widgets, none of them accountant-only", () => {
    for (const p of defaultLayout()) {
      expect(widgetDef(p.id)).toBeTruthy();
      expect(widgetDef(p.id)?.accountant).toBeFalsy();
    }
  });

  it("hides accountant widgets from others", () => {
    expect(widgetsFor(false).some((w) => w.id === "books-health")).toBe(false);
    expect(widgetsFor(true).some((w) => w.id === "books-health")).toBe(true);
  });
});

describe("a saved layout made safe", () => {
  it("uses the usual layout when nothing is saved", () => {
    expect(cleanLayout(undefined, false)).toEqual(defaultLayout());
  });

  it("keeps the person's order and widths", () => {
    expect(cleanLayout([{ id: "sales", w: 6 }, { id: "cash", w: 3 }], false)).toEqual([{ id: "sales", w: 6 }, { id: "cash", w: 3 }]);
  });

  it("drops widgets that no longer exist, repeats and what they may not see", () => {
    expect(cleanLayout([{ id: "gone", w: 3 }, { id: "cash", w: 3 }, { id: "cash", w: 4 }, { id: "books-health", w: 6 }, null, 5], false)).toEqual([{ id: "cash", w: 3 }]);
    expect(cleanLayout([{ id: "books-health", w: 6 }], true)).toEqual([{ id: "books-health", w: 6 }]);
  });

  it("puts a width a widget does not offer back to its usual one", () => {
    expect(cleanLayout([{ id: "cash", w: 12 }], false)).toEqual([{ id: "cash", w: 3 }]);
    expect(cleanLayout([{ id: "cash", w: "wide" }], false)).toEqual([{ id: "cash", w: 3 }]);
  });

  it("keeps an emptied overview empty", () => {
    expect(cleanLayout([], false)).toEqual([]);
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("the overview's figures and saved layout", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("@/lib/accounts-dashboard");
  let A: typeof import("@/app/(app)/accounts/dashboard-actions");
  let userId = 0, other = 0;
  const tag = `ZZDB${Date.now()}`;
  const today = new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
  const sign = (id: number) => new SignJWT({ name: tag, email: `${tag}@example.test`, role: "sales" }).setProtectedHeader({ alg: "HS256" }).setSubject(String(id)).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("@/lib/accounts-dashboard");
    A = await import("@/app/(app)/accounts/dashboard-actions");
    const mk = async (n: string) => (await db.insert(schema.users).values({ name: `${tag}${n}`, email: `${tag}${n}@example.test`, passwordHash: "x", role: "sales", apps: ["accounts"] }).returning({ id: schema.users.id }))[0].id;
    userId = await mk("a");
    other = await mk("b");
    await db.insert(schema.attendancePunches).values([userId, other].map((u) => ({ userId: u, day: today })));
  });

  it("keeps each person's layout their own, and cleans what it saves", async () => {
    cookieValue = await sign(userId);
    const saved = await A.saveDashboardLayout([{ id: "sales", w: 6 }, { id: "nonsense", w: 3 }, { id: "books-health", w: 6 }] as never);
    expect(saved).toEqual([{ id: "sales", w: 6 }]);
    expect(await D.dashboardLayout(userId, false)).toEqual([{ id: "sales", w: 6 }]);
    expect(await D.dashboardLayout(other, false)).toEqual(defaultLayout());
    await A.saveDashboardLayout([{ id: "cash", w: 4 }]);
    expect(await D.dashboardLayout(userId, false)).toEqual([{ id: "cash", w: 4 }]);
  });

  it("refuses someone without the Accounts app", async () => {
    const [u] = await db.insert(schema.users).values({ name: `${tag}c`, email: `${tag}c@example.test`, passwordHash: "x", role: "sales", apps: ["tasks"] }).returning({ id: schema.users.id });
    cookieValue = await sign(u.id);
    await expect(A.saveDashboardLayout([])).rejects.toThrow(/access/);
  });

  it("runs every query, whatever the period", async () => {
    const [from, to] = ["2000-01-01", "2099-12-31"];
    const results = await Promise.all([D.booksState(1), D.ledgerBalances(1), D.ledgerResult(1, from, to), D.ledgerVat(1, from, to), D.salesBetween(from, to), D.moneyBetween(from, to), D.salesByMonth(from, to), D.ledgerByMonth(1, from, to), D.moneyByMonth(from, to), D.topCustomers(from, to), D.topSuppliers(from, to), D.costsByCategory(from, to), D.soldWithoutCost(from, to)]);
    expect(results.length).toBe(13);
  });

  it("works out sales and money from the documents", async () => {
    const [c] = await db.insert(schema.companies).values({ name: `${tag} C`, nameNorm: `${tag.toLowerCase()} c` }).returning({ id: schema.companies.id });
    const day = "2091-03-15";
    const [i] = await db.insert(schema.invoices).values({ number: `${tag}-1`, companyId: c.id, issueDate: day, supplyDate: day, termsDays: 0, dueDate: day, customerName: tag, vatPct: 5, subtotal: 1000, vatAmount: 50, total: 1050 }).returning({ id: schema.invoices.id });
    await db.insert(schema.creditNotes).values({ year: 2091, seq: 77001, number: `${tag}-C`, invoiceId: i.id, issueDate: "2091-03-20", reason: "test", subtotal: 200, vatAmount: 10, total: 210 });
    await db.insert(schema.payments).values({ year: 2091, seq: 77001, number: `${tag}-R`, companyId: c.id, paidOn: "2091-03-21", amount: 300, method: "cash" });
    await db.insert(schema.payments).values({ year: 2091, seq: 77002, number: `${tag}-V`, companyId: c.id, paidOn: "2091-03-22", amount: 999, method: "cash", voidedAt: new Date() });
    expect(await D.salesBetween("2091-03-01", "2091-03-31")).toEqual({ net: 800, count: 1 });
    expect((await D.moneyBetween("2091-03-01", "2091-03-31")).in).toBe(300);
    expect((await D.salesByMonth("2091-03-01", "2091-03-31"))[0].net).toBe(800);
    expect((await D.topCustomers("2091-03-01", "2091-03-31"))[0]).toMatchObject({ name: tag, net: 1000, n: 1 });
    expect((await D.soldWithoutCost("2091-03-01", "2091-03-31"))[0]).toMatchObject({ number: `${tag}-1` });
  });
});
