import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MOVED_FROM_SALES } from "../next.config";
import { navFor, searchPages } from "@/lib/app-nav";
import { customerGaps, trnProblem } from "@/lib/sales";

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

/** Where Next sends a path: the first rule whose source matches (":path*" = the rest of the path). */
function redirected(path: string): string | null {
  for (const r of MOVED_FROM_SALES) {
    const [src, query] = [r.source, r.destination];
    if (src.endsWith("/:path*")) {
      const base = src.slice(0, -"/:path*".length);
      if (path.startsWith(base + "/")) return query.replace(":path*", path.slice(base.length + 1));
    } else if (path === src) return query;
  }
  return null;
}

describe("Sales became CRM, money moved to Accounts", () => {
  it("sends old Sales links to their new homes", () => {
    expect(redirected("/sales/deals/12")).toBe("/crm/deals/12");
    expect(redirected("/sales/pipeline")).toBe("/crm/deals");
    expect(redirected("/sales/companies/3")).toBe("/crm/companies/3");
    expect(redirected("/sales/contacts")).toBe("/crm/contacts");
    // Sales owns these again: no redirect
    expect(redirected("/sales/quotes/7")).toBeNull();
    expect(redirected("/sales/orders/9")).toBeNull();
    expect(redirected("/sales")).toBeNull();
    // the day they spent under Accounts
    expect(redirected("/accounts/quotes/7")).toBe("/sales/quotes/7");
    expect(redirected("/accounts/orders")).toBe("/sales/orders");
    expect(redirected("/accounts/customers/5")).toBe("/sales/customers/5");
    expect(redirected("/accounts/to-invoice")).toBeNull();
    expect(redirected("/salesforce")).toBeNull();
  });

  it("splits the work: Sales has customers, quotes and orders; Accounts has the money", () => {
    expect(navFor("sales").flatMap((g) => g.items.map((i) => i.href))).toEqual(["/sales/customers", "/sales/quotes", "/sales/orders"]);
    const money = navFor("accounts").flatMap((g) => g.items.map((i) => i.href));
    expect(money).toEqual(expect.arrayContaining(["/accounts", "/accounts/to-invoice", "/accounts/invoices", "/accounts/payments", "/accounts/bills", "/accounts/reports"]));
    expect(money.some((h) => h.startsWith("/sales"))).toBe(false);
    expect(searchPages(["sales"]).some((p) => p.href === "/accounts/invoices")).toBe(false);
  });

  it("lists what a customer lacks, and which gaps block the invoice", () => {
    expect(trnProblem("")).toBeNull();
    expect(trnProblem("100-2003-0040-0500")).toBeNull();
    expect(trnProblem("12345")).toMatch(/15 digits/);
    const g = customerGaps({ trn: "", address: "", emirate: "" }, null);
    expect(g.map((x) => [x.key, x.blocksInvoice])).toEqual([["address", true], ["trn", false], ["contact", false]]);
    expect(customerGaps({ trn: "100200300400500", address: "", emirate: "Dubai" }, { email: "a@b.ae", phone: "", whatsapp: "" })).toEqual([]);
  });

  it("keeps CRM to deals, companies and contacts", () => {
    expect(navFor("crm").flatMap((g) => g.items.map((i) => i.label))).toEqual(["Overview", "Leads", "Deals", "Companies", "Contacts"]);
  });
});

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("Accounts levels (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let D: typeof import("drizzle-orm");
  let S: typeof import("@/app/(app)/crm/actions");
  let Q: typeof import("@/app/(app)/sales/quote-actions");
  let O: typeof import("@/app/(app)/sales/order-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let AD: typeof import("@/lib/accounts-data");
  let seller = 0, colleague = 0, accountant = 0;
  let userIds: number[] = [];
  let today = "";
  const tag = `ZZCRMACC${Date.now()}`;

  const as = async (id: number) => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role: "sales" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    D = await import("drizzle-orm");
    S = await import("@/app/(app)/crm/actions");
    Q = await import("@/app/(app)/sales/quote-actions");
    O = await import("@/app/(app)/sales/order-actions");
    A = await import("@/app/(app)/accounts/actions");
    AD = await import("@/lib/accounts-data");
    today = (await import("@/lib/dates")).dubaiToday();
    const mk = async (name: string, apps: string[]) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales", apps }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller", ["crm", "sales"]);
    colleague = await mk("colleague", ["crm", "sales"]);
    accountant = await mk("accountant", ["accounts", "sales"]); // no CRM at all
    userIds = [seller, colleague, accountant];
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: today })));
  });

  afterAll(async () => {
    const { inArray, like, and, eq } = D;
    const cids = (await db.select({ id: schema.companies.id }).from(schema.companies).where(like(schema.companies.name, `${tag}%`))).map((c) => c.id);
    if (cids.length) {
      await db.delete(schema.salesOrders).where(inArray(schema.salesOrders.companyId, cids));
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(inArray(schema.deals.companyId, cids));
      if (deals.length) await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "deal"), inArray(schema.tasks.relatedId, deals.map((d) => d.id))));
      await db.delete(schema.companies).where(inArray(schema.companies.id, cids));
    }
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  const orderOf = async (label: string) => {
    await as(seller);
    const { id: dealId } = await S.createDeal({ companyName: `${tag} ${label} LLC`, emirate: "Dubai", contactName: "Omar", requirement: "switches" });
    await Q.addItem(dealId, { description: "Switch", qty: 2, costAed: 400, unitPriceAed: 500 });
    const q = await Q.createQuote(dealId, { vatPct: 5 });
    const o = await O.convertQuoteToOrder(q.id, { termsDays: 30 });
    return { dealId, quoteId: q.id, orderId: o.id };
  };

  it("lets Sales quote and order its own deals, but not invoice", async () => {
    const { orderId } = await orderOf("Own");
    await O.markDelivered(orderId, { deliveredOn: today, receivedBy: "Store" });
    await expect(A.issueInvoice(orderId, { issueDate: today, termsDays: 30 })).rejects.toThrow(/accounts team/);
  });

  it("keeps a colleague's orders private in Sales, open to Accounts", async () => {
    const { orderId, quoteId } = await orderOf("Private");
    await as(colleague);
    await expect(O.markDelivered(orderId, { deliveredOn: today })).rejects.toThrow(/not assigned to you/);
    await expect(Q.setQuoteStatus(quoteId, "sent")).rejects.toThrow(/not assigned to you/);
    await as(accountant);
    await O.markDelivered(orderId, { deliveredOn: today, receivedBy: "Gate" });
    const [o] = await db.select({ status: schema.salesOrders.status }).from(schema.salesOrders).where(D.eq(schema.salesOrders.id, orderId));
    expect(o.status).toBe("delivered");
  });

  it("lists a won company as a customer, only for people who may see it", async () => {
    const { dealId } = await orderOf("Customer");
    const [deal] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(D.eq(schema.deals.id, dealId));
    const ids = async (v: { id: number; seesAll: boolean }) => (await AD.listCustomers(v)).map((c) => c.id);
    expect(await ids({ id: seller, seesAll: false })).toContain(deal.companyId);
    expect(await ids({ id: colleague, seesAll: false })).not.toContain(deal.companyId);
    expect(await ids({ id: accountant, seesAll: true })).toContain(deal.companyId);
  });

  it("lets finance fix billing details without CRM, and keeps the company owner", async () => {
    const { dealId } = await orderOf("Billing");
    const [deal] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(D.eq(schema.deals.id, dealId));
    const [before] = await db.select().from(schema.companies).where(D.eq(schema.companies.id, deal.companyId));
    await as(accountant);
    await S.updateCompany(deal.companyId, { name: before.name, trn: "100200300400500", address: "Office 12, Al Quoz 3, Dubai" });
    const [after] = await db.select().from(schema.companies).where(D.eq(schema.companies.id, deal.companyId));
    expect(after).toMatchObject({ trn: "100200300400500", address: "Office 12, Al Quoz 3, Dubai", ownerId: before.ownerId });
    await as(colleague);
    await expect(S.updateCompany(deal.companyId, { name: before.name })).rejects.toThrow(/not assigned to you/);
  });

  it("marks a deal won safely: same company, winning quote accepted, missing details become a task", async () => {
    await as(seller);
    const { id: dealId } = await S.createDeal({ companyName: `${tag} Winner LLC`, contactName: "Rania", requirement: "printers" });
    await Q.addItem(dealId, { description: "Printer", qty: 1, unitPriceAed: 900 });
    const q = await Q.createQuote(dealId, { vatPct: 5 });
    const [before] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(D.eq(schema.deals.id, dealId));
    const check = await S.wonCheck(dealId);
    expect(check.company.id).toBe(before.companyId);
    expect(check.gaps.map((g) => g.key)).toEqual(expect.arrayContaining(["address", "trn", "contactReach"]));
    await expect(S.markDealWon(dealId, {})).rejects.toThrow(/winning quote/);
    const r = await S.markDealWon(dealId, { quoteId: q.id });
    expect(r.gaps.length).toBeGreaterThan(0);
    const [deal] = await db.select({ stage: schema.deals.stage, companyId: schema.deals.companyId }).from(schema.deals).where(D.eq(schema.deals.id, dealId));
    expect(deal).toEqual({ stage: "won", companyId: before.companyId });
    const [quote] = await db.select({ status: schema.quotes.status }).from(schema.quotes).where(D.eq(schema.quotes.id, q.id));
    expect(quote.status).toBe("accepted");
    const tasks = await db.select({ title: schema.tasks.title, priority: schema.tasks.priority }).from(schema.tasks).where(D.and(D.eq(schema.tasks.relatedType, "deal"), D.eq(schema.tasks.relatedId, dealId)));
    expect(tasks.some((t) => t.title.startsWith("Complete customer details") && t.priority === "high")).toBe(true);
    // the same company now shows as a customer in Sales: nothing was copied
    expect((await AD.listCustomers({ id: seller, seesAll: false })).filter((c) => c.id === before.companyId)).toHaveLength(1);
    await expect(S.markDealWon(dealId, { terms: "PO 55" })).rejects.toThrow(/already won/);
  });

  it("wins without a quote when the terms are written down, and refuses an order for a bad TRN", async () => {
    await as(seller);
    const { id: dealId } = await S.createDeal({ companyName: `${tag} Terms LLC`, emirate: "Dubai", contactName: "Ali", requirement: "cables" });
    await S.markDealWon(dealId, { terms: "PO 77, AED 4,000, 30 days" });
    const { id: d2 } = await S.createDeal({ companyName: `${tag} BadTrn LLC`, emirate: "Dubai", contactName: "Sami", requirement: "toner" });
    const [c] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(D.eq(schema.deals.id, d2));
    await db.update(schema.companies).set({ trn: "12345" }).where(D.eq(schema.companies.id, c.companyId));
    await Q.addItem(d2, { description: "Toner", qty: 1, unitPriceAed: 100 });
    const q = await Q.createQuote(d2, { vatPct: 5 });
    await expect(O.convertQuoteToOrder(q.id, { termsDays: 30 })).rejects.toThrow(/15 digits/);
  });

  it("makes an instant quote for a customer with no deal, private to its salesperson and whoever typed it", async () => {
    await as(seller);
    const { id: dealId } = await S.createDeal({ companyName: `${tag} Instant LLC`, emirate: "Dubai", contactName: "Huda", requirement: "first deal" });
    const [d] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(D.eq(schema.deals.id, dealId));
    const base = { companyId: d.companyId, validUntil: "2099-12-31", termsDays: 15, vatPct: 0, lines: [{ description: "Toner", qty: 3, costAed: 80, unitPriceAed: 100 }], terms: "Prices in AED.", notes: "repeat order" };
    // typed by the seller, in the colleague's name, with no deal
    const q = await Q.saveQuote(null, { ...base, ownerId: colleague });
    const [row] = await db.select().from(schema.quotes).where(D.eq(schema.quotes.id, q.id));
    expect(row).toMatchObject({ dealId: null, companyId: d.companyId, ownerId: colleague, createdBy: seller, termsDays: 15, vatPct: 0, subtotal: 300, vatAmount: 0, total: 300, costTotal: 240, status: "draft" });
    const QD = await import("@/lib/quotes-data");
    expect((await QD.listQuotes({ id: colleague, seesAll: false })).some((x) => x.id === q.id)).toBe(true);
    expect((await QD.listQuotes({ id: seller, seesAll: false })).some((x) => x.id === q.id)).toBe(true);
    expect((await QD.listQuotes({ id: accountant, seesAll: false })).some((x) => x.id === q.id)).toBe(false);
    // edit it (same number), then turn it into an order: no deal involved
    const e = await Q.saveQuote(q.id, { ...base, ownerId: colleague, lines: [{ description: "Toner", qty: 4, costAed: 80, unitPriceAed: 100 }] });
    expect(e.number).toBe(q.number);
    const o = await O.convertQuoteToOrder(q.id, { termsDays: 15 });
    const [order] = await db.select().from(schema.salesOrders).where(D.eq(schema.salesOrders.id, o.id));
    expect(order).toMatchObject({ dealId: null, companyId: d.companyId, subtotal: 400, total: 400 });
    const OD = await import("@/lib/orders-data");
    expect((await OD.listOrders({ id: colleague, seesAll: false })).some((x) => x.id === o.id)).toBe(true);
    // the first deal is untouched by the instant quote
    const [deal] = await db.select({ stage: schema.deals.stage }).from(schema.deals).where(D.eq(schema.deals.id, dealId));
    expect(deal.stage).toBe("new");
  });

  it("links a quote to a lead's deal and keeps one quote in play", async () => {
    await as(seller);
    const { id: dealId } = await S.createDeal({ companyName: `${tag} Lead LLC`, emirate: "Dubai", contactName: "Faris", requirement: "switch" });
    const { id: otherDeal } = await S.createDeal({ companyName: `${tag} Other LLC`, emirate: "Dubai", contactName: "Omar", requirement: "x" });
    const [d] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(D.eq(schema.deals.id, dealId));
    const base = { companyId: d.companyId, ownerId: seller, validUntil: "2099-12-31", termsDays: 30, vatPct: 5, lines: [{ description: "Switch", qty: 1, unitPriceAed: 1000 }] };
    await expect(Q.saveQuote(null, { ...base, dealId: otherDeal })).rejects.toThrow(/another customer/);
    await Q.saveQuote(null, { ...base, dealId });
    const [deal] = await db.select({ valueAed: schema.deals.valueAed }).from(schema.deals).where(D.eq(schema.deals.id, dealId));
    expect(deal.valueAed).toBe(1000);
    await expect(Q.saveQuote(null, { ...base, dealId })).rejects.toThrow(/already open/);
    await expect(Q.saveQuote(null, { ...base, lines: [{ description: "Free", qty: 1, unitPriceAed: 0 }] })).rejects.toThrow(/selling price/);
  });
});
