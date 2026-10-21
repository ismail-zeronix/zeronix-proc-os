import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The actions read the session cookie and ask Next to refresh pages. Here the cookie is ours to set, and refreshing is a no-op.
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

describe.skipIf(!live)("quote actions (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let inArray: typeof import("drizzle-orm").inArray;
  let like: typeof import("drizzle-orm").like;
  let S: typeof import("@/app/(app)/sales/actions");
  let Q: typeof import("@/app/(app)/sales/quote-actions");
  let seller: number, salesOnly: number, boss: number;
  let userIds: number[] = [];
  let supplierId = 0;
  let priceListId = 0;
  let productId = 0;
  const tag = `ZZQUOTE${Date.now()}`;

  const sign = (id: number, name: string, role: "admin" | "sales") =>
    new SignJWT({ name, email: `${name}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const as = async (id: number, name: string, role: "admin" | "sales" = "sales") => {
    cookieValue = await sign(id, name, role);
  };
  const newDeal = async (label: string) => {
    await as(seller, "seller");
    const r = await S.createEnquiry({ companyName: `${tag} ${label} Trading LLC`, contactName: "Ahmed", requirement: "laptops" });
    return r.id;
  };
  const offer = async (price: number | null, currency: string) =>
    (
      await db
        .insert(schema.offers)
        .values({ priceListId, supplierId, productId, category: "laptop", brand: "Dell", modelName: `${tag} Latitude`, price, currency })
        .returning({ id: schema.offers.id })
    )[0].id;

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq, inArray, like } = await import("drizzle-orm"));
    S = await import("@/app/(app)/sales/actions");
    Q = await import("@/app/(app)/sales/quote-actions");
    const mk = async (name: string, role: "admin" | "sales", apps: string[] | null) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role, apps }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller", "sales", ["sales", "procurement"]);
    salesOnly = await mk("salesonly", "sales", ["sales"]);
    boss = await mk("boss", "admin", null);
    userIds = [seller, salesOnly, boss];
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Supplier` }).returning({ id: schema.suppliers.id }))[0].id;
    priceListId = (await db.insert(schema.priceLists).values({ supplierId, rawText: "x", status: "saved" }).returning({ id: schema.priceLists.id }))[0].id;
    productId = (await db.insert(schema.products).values({ category: "laptop", brand: "Dell", modelName: `${tag} Latitude`, matchKey: `${tag}-key`, specSummary: "i5 16GB 512GB" }).returning({ id: schema.products.id }))[0].id;
  });

  afterAll(async () => {
    const cs = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(like(schema.companies.name, `%${tag}%`));
    if (cs.length) {
      const ids = cs.map((c) => c.id);
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(inArray(schema.deals.companyId, ids));
      if (deals.length) await db.delete(schema.tasks).where(inArray(schema.tasks.relatedId, deals.map((d) => d.id)));
      await db.delete(schema.companies).where(inArray(schema.companies.id, ids)); // deals, items, quotes go with it
    }
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.offers).where(eq(schema.offers.productId, productId));
    await db.delete(schema.products).where(eq(schema.products.id, productId));
    await db.delete(schema.priceLists).where(eq(schema.priceLists.id, priceListId));
    await db.delete(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  it("will not make a quote with no lines or a line without a selling price", async () => {
    const dealId = await newDeal("Empty");
    await expect(Q.createQuote(dealId)).rejects.toThrow(/at least one item/i);
    await Q.addItem(dealId, { description: "Free sample", qty: 1, unitPriceAed: 0 });
    await expect(Q.createQuote(dealId)).rejects.toThrow(/no selling price/i);
  });

  it("rejects bad lines", async () => {
    const dealId = await newDeal("Bad");
    await expect(Q.addItem(dealId, { description: "  ", qty: 1, unitPriceAed: 10 })).rejects.toThrow();
    await expect(Q.addItem(dealId, { description: "x", qty: 0, unitPriceAed: 10 })).rejects.toThrow(/at least 1/);
    await expect(Q.addItem(dealId, { description: "x", qty: 1, unitPriceAed: -5 })).rejects.toThrow();
  });

  it("makes a numbered quote with VAT from the lines, and later edits do not change it", async () => {
    const dealId = await newDeal("Totals");
    await Q.addItem(dealId, { description: "Laptop A", qty: 5, costAed: 3000, unitPriceAed: 3400 });
    await Q.addItem(dealId, { description: "Dock", qty: 5, unitPriceAed: 400 });
    const made = await Q.createQuote(dealId);
    expect(made.number).toMatch(/^ZQ-\d{4}-\d{4,}$/);
    const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, made.id));
    expect(q.subtotal).toBe(19000);
    expect(q.vatPct).toBe(5);
    expect(q.vatAmount).toBe(950);
    expect(q.total).toBe(19950);
    expect(q.costTotal).toBe(15000); // only the line that had a cost
    expect(q.status).toBe("draft");
    const lines = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, q.id));
    expect(lines).toHaveLength(2);
    const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(deal.valueAed).toBe(19000); // the deal is worth what was quoted
    // change the deal's line afterwards: the quote keeps what was sent
    const [item] = await db.select().from(schema.dealItems).where(eq(schema.dealItems.dealId, dealId));
    await Q.updateItem(item.id, { description: "Laptop A", qty: 5, costAed: 3000, unitPriceAed: 9999 });
    const after = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, q.id));
    expect(after.map((l) => l.unitPrice).sort((a, b) => a - b)).toEqual([400, 3400]);
  });

  it("gives every quote saved at the same moment its own number", async () => {
    const ids = await Promise.all([newDeal("Race1"), newDeal("Race2"), newDeal("Race3")]);
    for (const d of ids) await Q.addItem(d, { description: "Thing", qty: 1, unitPriceAed: 100 });
    const made = await Promise.all(ids.map((d) => Q.createQuote(d)));
    expect(new Set(made.map((m) => m.number)).size).toBe(3);
  });

  it("moves the deal to Quote sent, then Won at the quoted amount when the customer accepts", async () => {
    const dealId = await newDeal("Flow");
    await Q.addItem(dealId, { description: "Server", qty: 2, unitPriceAed: 10000 });
    const { id } = await Q.createQuote(dealId);
    await Q.setQuoteStatus(id, "sent");
    let [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(deal.stage).toBe("quoted");
    const [sent] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
    expect(sent.sentAt).not.toBeNull();

    await Q.setQuoteStatus(id, "accepted");
    [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(deal.stage).toBe("won");
    expect(deal.closedAt).not.toBeNull();
    expect(deal.valueAed).toBe(20000);
    const log = await db.select().from(schema.activities).where(eq(schema.activities.dealId, dealId));
    expect(log.some((a) => a.type === "stage" && a.body.includes("Won"))).toBe(true);
    expect(log.some((a) => a.body.includes("marked accepted"))).toBe(true);
    // an answered quote is locked
    await expect(Q.updateQuote(id, { terms: "changed" })).rejects.toThrow(/cannot be changed/i);
  });

  it("keeps the deal where it is when a quote is rejected, and does not store 'expired'", async () => {
    const dealId = await newDeal("Reject");
    await Q.addItem(dealId, { description: "PC", qty: 1, unitPriceAed: 2000 });
    const { id } = await Q.createQuote(dealId);
    await Q.setQuoteStatus(id, "sent");
    await Q.setQuoteStatus(id, "rejected");
    const [deal] = await db.select().from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(deal.stage).toBe("quoted");
    await expect(Q.setQuoteStatus(id, "expired")).rejects.toThrow();
    await expect(Q.setQuoteStatus(id, "nonsense")).rejects.toThrow();
  });

  it("only lets an admin delete a quote that was sent", async () => {
    const dealId = await newDeal("Delete");
    await Q.addItem(dealId, { description: "PC", qty: 1, unitPriceAed: 2000 });
    const draft = await Q.createQuote(dealId);
    const sent = await Q.createQuote(dealId);
    await Q.setQuoteStatus(sent.id, "sent");
    await as(seller, "seller");
    await Q.deleteQuote(draft.id);
    expect(await db.select().from(schema.quotes).where(eq(schema.quotes.id, draft.id))).toHaveLength(0);
    await expect(Q.deleteQuote(sent.id)).rejects.toThrow(/admin/i);
    await as(boss, "boss", "admin");
    await Q.deleteQuote(sent.id);
    expect(await db.select().from(schema.quotes).where(eq(schema.quotes.id, sent.id))).toHaveLength(0);
  });

  it("adds a line from a supplier offer using the cost on the server, plus the default margin", async () => {
    const dealId = await newDeal("Offer");
    const usd = await offer(1000, "USD");
    await as(seller, "seller");
    await Q.addItemFromOffer(dealId, usd, 3);
    const [item] = await db.select().from(schema.dealItems).where(eq(schema.dealItems.dealId, dealId));
    expect(item.qty).toBe(3);
    expect(item.supplierName).toBe(`${tag} Supplier`);
    expect(item.offerId).toBe(usd);
    expect(item.costAed).toBeCloseTo(3672.5, 2);
    expect(item.unitPriceAed).toBe(4040); // 3672.5 + 10%, whole dirham
    expect(item.marginPct).toBeCloseTo(10, 0);
    expect(item.description).toContain("Latitude");
    expect(item.description).toContain("i5 16GB 512GB");
  });

  it("refuses offers with no price or no AED rate, and people without Procurement", async () => {
    const dealId = await newDeal("OfferBad");
    const none = await offer(null, "AED");
    const eur = await offer(500, "EUR");
    const ok = await offer(100, "AED");
    await as(seller, "seller");
    await expect(Q.addItemFromOffer(dealId, none)).rejects.toThrow(/no price/i);
    await expect(Q.addItemFromOffer(dealId, eur)).rejects.toThrow(/rate for EUR/i);
    await expect(Q.addItemFromOffer(dealId, 999999999)).rejects.toThrow(/no longer exists/i);
    await as(salesOnly, "salesonly");
    await expect(Q.addItemFromOffer(dealId, ok)).rejects.toThrow(/do not have access/i);
    // but they can still type a line and make a quote
    await Q.addItem(dealId, { description: "By hand", qty: 1, unitPriceAed: 50 });
    expect((await Q.createQuote(dealId)).number).toMatch(/^ZQ-/);
  });
});
