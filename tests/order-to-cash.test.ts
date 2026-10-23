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

describe.skipIf(!live)("order to cash (needs the dev database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let eq: typeof import("drizzle-orm").eq;
  let inArray: typeof import("drizzle-orm").inArray;
  let and: typeof import("drizzle-orm").and;
  let like: typeof import("drizzle-orm").like;
  let S: typeof import("@/app/(app)/sales/actions");
  let Q: typeof import("@/app/(app)/sales/quote-actions");
  let O: typeof import("@/app/(app)/sales/order-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let AD: typeof import("@/lib/accounts-data");
  let today = "";
  let seller = 0;
  let accountant = 0;
  let userIds: number[] = [];
  const tag = `ZZO2C${Date.now()}`;
  const prefix = `T${String(Date.now()).slice(-6)}-`;
  /** The real invoice series, put back after the test so no real number is used up. */
  let savedSeries: { key: string; value: string }[] = [];

  const as = async (id: number, role: "admin" | "sales" = "sales") => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  /** A deal with two priced lines and a quote: 2 x 1000 + 1 x 500 = 2500, VAT 5% = 125, total 2625. */
  const quotedDeal = async (label: string) => {
    await as(seller);
    const { id: dealId } = await S.createEnquiry({ companyName: `${tag} ${label} LLC`, contactName: "Ahmed", requirement: "laptops" });
    await Q.addItem(dealId, { description: "Laptop", qty: 2, costAed: 900, unitPriceAed: 1000 });
    await Q.addItem(dealId, { description: "Dock", qty: 1, unitPriceAed: 500 });
    const q = await Q.createQuote(dealId, { vatPct: 5 });
    return { dealId, quoteId: q.id };
  };

  const deliveredOrder = async (label: string, terms = 15) => {
    const { dealId, quoteId } = await quotedDeal(label);
    const o = await O.convertQuoteToOrder(quoteId, { customerRef: "PO-77", termsDays: terms });
    await O.markDelivered(o.id, { deliveredOn: today, receivedBy: "Store keeper" });
    return { dealId, quoteId, orderId: o.id, orderNumber: o.number };
  };

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    ({ eq, inArray, like, and } = await import("drizzle-orm"));
    S = await import("@/app/(app)/sales/actions");
    Q = await import("@/app/(app)/sales/quote-actions");
    O = await import("@/app/(app)/sales/order-actions");
    A = await import("@/app/(app)/accounts/actions");
    AD = await import("@/lib/accounts-data");
    today = (await import("@/lib/dates")).dubaiToday();
    const mk = async (name: string, apps: string[]) =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role: "sales", apps }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller", ["sales"]);
    accountant = await mk("accountant", ["sales", "accounts"]);
    userIds = [seller, accountant];
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: today })));
    savedSeries = await db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(inArray(schema.settings.key, ["invoice_prefix", "invoice_next_number", "invoice_digits", "quote_trn"]));
    for (const [key, value] of [["invoice_prefix", prefix], ["invoice_next_number", "41"], ["invoice_digits", "3"], ["quote_trn", "100000000000003"]] as const)
      await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  });

  afterAll(async () => {
    // put the real invoice series back exactly as it was
    await db.delete(schema.settings).where(inArray(schema.settings.key, ["invoice_prefix", "invoice_next_number", "invoice_digits", "quote_trn"]));
    if (savedSeries.length) await db.insert(schema.settings).values(savedSeries);
    const companies = await db.select({ id: schema.companies.id }).from(schema.companies).where(like(schema.companies.name, `${tag}%`));
    const cids = companies.map((c) => c.id);
    if (cids.length) {
      const invs = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(inArray(schema.invoices.companyId, cids));
      const iids = invs.map((i) => i.id);
      if (iids.length) {
        await db.delete(schema.payments).where(inArray(schema.payments.invoiceId, iids));
        await db.delete(schema.creditNotes).where(inArray(schema.creditNotes.invoiceId, iids));
        await db.delete(schema.invoices).where(inArray(schema.invoices.id, iids));
      }
      await db.delete(schema.salesOrders).where(inArray(schema.salesOrders.companyId, cids));
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(inArray(schema.deals.companyId, cids));
      if (deals.length) await db.delete(schema.tasks).where(and(eq(schema.tasks.relatedType, "deal"), inArray(schema.tasks.relatedId, deals.map((d) => d.id))));
      await db.delete(schema.companies).where(inArray(schema.companies.id, cids));
    }
    await db.delete(schema.tasks).where(inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.attendancePunches).where(inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    await pool.end();
  });

  it("turns a quote into one order, accepts the quote and wins the deal", async () => {
    const { dealId, quoteId } = await quotedDeal("Convert");
    const o = await O.convertQuoteToOrder(quoteId, { customerRef: "PO-1", termsDays: 30 });
    expect(o.number).toMatch(new RegExp(`^ZSO-${today.slice(0, 4)}-\\d{4,}$`));
    const [order] = await db.select().from(schema.salesOrders).where(eq(schema.salesOrders.id, o.id));
    expect(order).toMatchObject({ status: "open", subtotal: 2500, vatAmount: 125, total: 2625, costTotal: 1800, termsDays: 30, customerRef: "PO-1" });
    expect(await db.select().from(schema.salesOrderItems).where(eq(schema.salesOrderItems.orderId, o.id))).toHaveLength(2);
    const [quote] = await db.select({ status: schema.quotes.status }).from(schema.quotes).where(eq(schema.quotes.id, quoteId));
    expect(quote.status).toBe("accepted");
    const [deal] = await db.select({ stage: schema.deals.stage }).from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(deal.stage).toBe("won");
    await expect(O.convertQuoteToOrder(quoteId, { termsDays: 30 })).rejects.toThrow(/already order/);
    await expect(Q.deleteQuote(quoteId)).rejects.toThrow(/became order/);
    await expect(Q.setQuoteStatus(quoteId, "rejected")).rejects.toThrow(/became order/);
  });

  it("will not issue a tax invoice before our TRN is set", async () => {
    const { orderId } = await deliveredOrder("NoTrn");
    await db.update(schema.settings).set({ value: "" }).where(eq(schema.settings.key, "quote_trn"));
    await as(accountant);
    await expect(A.issueInvoice(orderId, { issueDate: today, termsDays: 30 })).rejects.toThrow(/our TRN/);
    await db.update(schema.settings).set({ value: "100000000000003" }).where(eq(schema.settings.key, "quote_trn"));
    await as(seller);
    await O.cancelOrder(orderId, "Test order only");
  });

  it("invoices only delivered orders, and only for people with Accounts", async () => {
    const { quoteId } = await quotedDeal("Gate");
    const o = await O.convertQuoteToOrder(quoteId, { termsDays: 7 });
    await as(accountant);
    await expect(A.issueInvoice(o.id, { issueDate: today, termsDays: 7 })).rejects.toThrow(/delivered first/);
    await as(seller);
    await O.markDelivered(o.id, { deliveredOn: today, receivedBy: "Reception" });
    await expect(O.markDelivered(o.id, { deliveredOn: today })).rejects.toThrow(/already delivered/);
    await expect(A.issueInvoice(o.id, { issueDate: today, termsDays: 7 })).rejects.toThrow(/access/);
  });

  it("numbers invoices from the admin series, sets the due date and a collection task", async () => {
    const { dealId, orderId } = await deliveredOrder("Invoice", 15);
    await as(accountant);
    const inv = await A.issueInvoice(orderId, { issueDate: today, termsDays: 15 });
    expect(inv.number).toBe(`${prefix}041`);
    const [row] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, inv.id));
    const { dueDateFor } = await import("@/lib/invoicing");
    expect(row).toMatchObject({ total: 2625, vatAmount: 125, dueDate: dueDateFor(today, 15), supplyDate: today, customerRef: "PO-77", status: "issued" });
    const [next] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "invoice_next_number"));
    expect(next.value).toBe("42");
    const [order] = await db.select({ status: schema.salesOrders.status }).from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId));
    expect(order.status).toBe("invoiced");
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.relatedId, dealId));
    expect(tasks.find((t) => t.title === `Collect payment: ${inv.number}`)?.dueDate).toBe(row.dueDate);
    await expect(A.issueInvoice(orderId, { issueDate: today, termsDays: 15 })).rejects.toThrow(/already has an invoice/);
  });

  it("never gives two invoices the same number when issued at the same moment", async () => {
    const a = await deliveredOrder("ParallelA");
    const b = await deliveredOrder("ParallelB");
    const c = await deliveredOrder("ParallelC");
    await as(accountant);
    const got = await Promise.all([a, b, c].map((o) => A.issueInvoice(o.orderId, { issueDate: today, termsDays: 30 })));
    const nums = got.map((g) => g.number).sort();
    expect(new Set(nums).size).toBe(3);
    expect(nums).toEqual([`${prefix}042`, `${prefix}043`, `${prefix}044`]);
  });

  it("takes part and full payments, cash or bank, and closes the collection task", async () => {
    const { dealId, orderId } = await deliveredOrder("Pay", 30);
    await as(accountant);
    const inv = await A.issueInvoice(orderId, { issueDate: today, termsDays: 30 });
    await expect(A.recordPayment(inv.id, { paidOn: today, amount: 3000, method: "cash" })).rejects.toThrow(/more than/);
    await expect(A.recordPayment(inv.id, { paidOn: today, amount: 100, method: "bank" })).rejects.toThrow(/bank reference/);
    const p1 = await A.recordPayment(inv.id, { paidOn: today, amount: 1000, method: "cash" });
    expect(p1.number).toMatch(/^ZRV-\d{4}-\d{4,}$/);
    expect(p1.fullyPaid).toBe(false);
    let full = await AD.getInvoice(inv.id);
    expect(full!.state).toMatchObject({ key: "part", paid: 1000, balance: 1625 });
    const p2 = await A.recordPayment(inv.id, { paidOn: today, amount: 1625, method: "bank", reference: "FT-123" });
    expect(p2.fullyPaid).toBe(true);
    full = await AD.getInvoice(inv.id);
    expect(full!.state.key).toBe("paid");
    const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.title, `Collect payment: ${inv.number}`));
    expect(task.status).toBe("done");
    await expect(A.recordPayment(inv.id, { paidOn: today, amount: 1, method: "cash" })).rejects.toThrow(/more than/);
    // a voided payment brings the balance back
    await A.voidPayment(p2.id, "Entered twice by mistake");
    full = await AD.getInvoice(inv.id);
    expect(full!.state).toMatchObject({ key: "part", balance: 1625 });
    expect(dealId).toBeGreaterThan(0);
  });

  it("cancels an invoice with a credit note and lets the order be invoiced again", async () => {
    const { orderId } = await deliveredOrder("Cancel");
    await as(accountant);
    const inv = await A.issueInvoice(orderId, { issueDate: today, termsDays: 0 });
    const pay = await A.recordPayment(inv.id, { paidOn: today, amount: 100, method: "cash" });
    await expect(A.cancelInvoice(inv.id, "Wrong customer TRN")).rejects.toThrow(/Void them first/);
    await A.voidPayment(pay.id, "Refunded in cash");
    const cn = await A.cancelInvoice(inv.id, "Wrong customer TRN");
    expect(cn.creditNote).toMatch(/^ZCN-\d{4}-\d{4,}$/);
    const [order] = await db.select({ status: schema.salesOrders.status }).from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId));
    expect(order.status).toBe("delivered");
    await as(seller);
    await expect(O.cancelOrder(orderId, "Customer cancelled")).resolves.toBeUndefined();
  });

  it("keeps the statement balance equal to invoices minus credit notes minus payments", async () => {
    const { orderId } = await deliveredOrder("Statement");
    await as(accountant);
    const inv = await A.issueInvoice(orderId, { issueDate: today, termsDays: 30 });
    await A.recordPayment(inv.id, { paidOn: today, amount: 625, method: "cash" });
    const [row] = await db.select({ companyId: schema.invoices.companyId }).from(schema.invoices).where(eq(schema.invoices.id, inv.id));
    const st = await AD.statement(row.companyId, `${today.slice(0, 4)}-01-01`, today);
    expect(st!.opening).toBe(0);
    expect(st!.closing).toBe(2000);
    expect(st!.lines.map((l) => l.kind)).toEqual(["invoice", "payment"]);
    const bal = await AD.companyBalance(row.companyId);
    expect(bal).toMatchObject({ owed: 2000, overdue: 0 });
  });

  it("cancels an order before invoicing and puts the deal back to negotiation", async () => {
    const { dealId, quoteId } = await quotedDeal("Drop");
    const o = await O.convertQuoteToOrder(quoteId, { termsDays: 30 });
    await expect(O.cancelOrder(o.id, "")).rejects.toThrow();
    await O.cancelOrder(o.id, "Customer bought elsewhere");
    const [deal] = await db.select({ stage: schema.deals.stage }).from(schema.deals).where(eq(schema.deals.id, dealId));
    expect(deal.stage).toBe("negotiation");
    await expect(O.markDelivered(o.id, { deliveredOn: today })).rejects.toThrow(/cancelled/);
  });
});
