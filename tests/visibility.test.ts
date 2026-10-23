import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Who sees which sales records: own deals only, shared deals, "All data" users and admins.
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

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("record visibility (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let inArray: typeof import("drizzle-orm").inArray;
  let and: typeof import("drizzle-orm").and;
  let eq: typeof import("drizzle-orm").eq;
  let A: typeof import("@/app/(app)/sales/actions");
  let Q: typeof import("@/app/(app)/sales/quote-actions");
  let S: typeof import("@/lib/sales-data");
  let QD: typeof import("@/lib/quotes-data");
  let V: typeof import("@/lib/auth/visibility");
  let userIds: number[] = [];
  let ali: number, sara: number, manager: number, boss: number;
  const tag = `ZZVIS${Date.now()}`;

  const as = async (id: number, role: "admin" | "sales" = "sales") => {
    cookieValue = await new SignJWT({ name: `u${id}`, email: `u${id}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  const own = (id: number) => ({ id, seesAll: false });

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ inArray, and, eq } = await import("drizzle-orm"));
    A = await import("@/app/(app)/sales/actions");
    Q = await import("@/app/(app)/sales/quote-actions");
    S = await import("@/lib/sales-data");
    QD = await import("@/lib/quotes-data");
    V = await import("@/lib/auth/visibility");
    const mk = async (name: string, role: "admin" | "sales", dataScope: "own" | "all") =>
      (
        await db
          .insert(schema.users)
          .values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role, dataScope })
          .returning({ id: schema.users.id })
      )[0].id;
    ali = await mk("ali", "sales", "own");
    sara = await mk("sara", "sales", "own");
    manager = await mk("manager", "sales", "all");
    boss = await mk("boss", "admin", "own"); // admins see everything whatever this says
    userIds = [ali, sara, manager, boss];
    const { dubaiToday } = await import("@/lib/dates");
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: dubaiToday() })));
  });

  afterAll(async () => {
    const names = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies);
    const ids = names.filter((n) => n.name.includes(tag)).map((n) => n.id);
    if (ids.length) {
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(inArray(schema.deals.companyId, ids));
      if (deals.length) {
        await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "deal"), inArray(schema.tasks.relatedId, deals.map((d) => d.id))));
        await db.delete(schema.quotes).where(inArray(schema.quotes.dealId, deals.map((d) => d.id)));
      }
      await db.delete(schema.companies).where(inArray(schema.companies.id, ids));
    }
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  it("keeps a salesman's deal, company, contacts and quotes away from other salesmen", async () => {
    await as(ali);
    const { id } = await A.createEnquiry({ companyName: `${tag} Alpha LLC`, contactName: "Omar", requirement: "20 laptops" });
    await Q.addItem(id, { description: "Laptop", qty: 20, unitPriceAed: 2000 });
    const quote = await Q.createQuote(id);
    const deal = (await S.getDeal(id, own(ali)))!;

    // Ali sees all of it
    expect((await S.listDeals(own(ali))).some((d) => d.id === id)).toBe(true);
    expect((await S.listCompanies(own(ali))).some((c) => c.id === deal.companyId)).toBe(true);
    expect((await S.listContacts(own(ali))).some((c) => c.name === "Omar" && c.companyId === deal.companyId)).toBe(true);
    expect((await QD.listQuotes(own(ali))).some((q) => q.id === quote.id)).toBe(true);

    // Sara sees none of it, in lists, searches and by opening the link
    expect((await S.listDeals(own(sara))).some((d) => d.id === id)).toBe(false);
    expect(await S.getDeal(id, own(sara))).toBeNull();
    expect(await S.getCompany(deal.companyId, own(sara))).toBeNull();
    expect((await S.listCompanies(own(sara))).some((c) => c.id === deal.companyId)).toBe(false);
    expect((await S.listContacts(own(sara))).some((c) => c.companyId === deal.companyId)).toBe(false);
    expect(await S.searchCompanies(own(sara), `${tag} Alpha`)).toHaveLength(0);
    expect((await QD.listQuotes(own(sara))).some((q) => q.id === quote.id)).toBe(false);
    expect(await QD.getQuote(quote.id, own(sara))).toBeNull();

    // and cannot change it by calling the actions directly
    await as(sara);
    await expect(A.moveDeal(id, "contacted")).rejects.toThrow(/not assigned to you/);
    await expect(A.logActivity(id, { type: "note", body: "hi" })).rejects.toThrow(/not assigned to you/);
    await expect(Q.addItem(id, { description: "x", qty: 1, unitPriceAed: 1 })).rejects.toThrow(/not assigned to you/);
    await expect(Q.setQuoteStatus(quote.id, "sent")).rejects.toThrow(/not assigned to you/);
    await expect(A.createContact(deal.companyId, { name: "Spy" })).rejects.toThrow(/not assigned to you/);
    // nor share it with herself
    await expect(A.setAssignees(id, [sara])).rejects.toThrow(/Only an admin/);
  });

  it("shows everything to admins and 'All data' users", async () => {
    await as(ali);
    const { id } = await A.createEnquiry({ companyName: `${tag} Beta LLC`, requirement: "x" });
    const all = { id: manager, seesAll: true };
    expect((await S.listDeals(all)).some((d) => d.id === id)).toBe(true);
    expect(await S.getDeal(id, all)).not.toBeNull();
    // the access check reads the scope from the database
    await as(manager);
    expect((await V.currentViewer()).seesAll).toBe(true);
    await as(boss, "admin");
    expect((await V.currentViewer()).seesAll).toBe(true);
    await as(sara);
    expect((await V.currentViewer()).seesAll).toBe(false);
  });

  it("shares the deal and everything on it once the admin adds a second salesman", async () => {
    await as(ali);
    const { id } = await A.createEnquiry({ companyName: `${tag} Gamma LLC`, requirement: "x" });
    await Q.addItem(id, { description: "Monitor", qty: 2, unitPriceAed: 500 });
    const quote = await Q.createQuote(id);
    const companyId = (await S.getDeal(id, own(ali)))!.companyId;

    await as(boss, "admin");
    await A.setAssignees(id, [ali, sara]);

    expect(await S.getDeal(id, own(sara))).not.toBeNull();
    expect(await S.getCompany(companyId, own(sara))).not.toBeNull();
    expect(await QD.getQuote(quote.id, own(sara))).not.toBeNull();
    // and she can work on it
    await as(sara);
    await A.logActivity(id, { type: "call", body: "Called the buyer" });
    await Q.addItem(id, { description: "Cable", qty: 2, unitPriceAed: 20 });

    // taking her off hides it again
    await as(boss, "admin");
    await A.setAssignees(id, [ali]);
    expect(await S.getDeal(id, own(sara))).toBeNull();
  });

  it("only shows a company's other deals to the people on them", async () => {
    await as(ali);
    const first = await A.createEnquiry({ companyName: `${tag} Delta LLC`, requirement: "first" });
    const companyId = (await S.getDeal(first.id, own(ali)))!.companyId;
    await as(boss, "admin");
    const second = await A.createEnquiry({ companyId, requirement: "second", ownerIds: [sara] });
    // Sara sees the company through her deal, but not Ali's deal there
    const c = (await S.getCompany(companyId, own(sara)))!;
    expect(c.deals.map((d) => d.id)).toEqual([second.id]);
    expect(c.activities.every((a) => a.dealId !== first.id)).toBe(true);
  });

  it("says who has a customer instead of letting a second salesman take it", async () => {
    await as(ali);
    await A.createEnquiry({ companyName: `${tag} Epsilon LLC`, requirement: "x" });
    await as(sara);
    await expect(A.createEnquiry({ companyName: `${tag} epsilon llc`, requirement: "y" })).rejects.toThrow(/already a customer, handled by .*ali/);
    await expect(A.createCompany({ name: `${tag} Epsilon L.L.C` })).rejects.toThrow(/Ask an admin/);
  });

  it("gives a salesman's new deal to them, whoever they pick", async () => {
    await as(ali);
    const { id } = await A.createEnquiry({ companyName: `${tag} Zeta LLC`, requirement: "x", ownerIds: [sara] });
    const d = (await S.getDeal(id, own(ali)))!;
    expect(d.assignees.map((a) => a.id)).toEqual([ali]);
  });
});
