import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { appsForBusiness, visibleApps } from "@/lib/apps";
import { itemFlags, lineKindOf, parseItemsCsv, partNorm } from "@/lib/items";

describe("item rules (no database)", () => {
  it("matches part numbers without case, spaces or dashes", () => {
    expect(partNorm("15FD-0130 WM")).toBe("15fd0130wm");
    expect(partNorm("")).toBe("");
  });

  it("keeps stock and serials for a trader's goods only", () => {
    expect(itemFlags({ kind: "goods", trackStock: true, trackSerials: true }, "trader")).toEqual({ kind: "goods", trackStock: true, trackSerials: true });
    // serials need stock
    expect(itemFlags({ kind: "goods", trackStock: false, trackSerials: true }, "trader")).toEqual({ kind: "goods", trackStock: false, trackSerials: false });
    // a service is never in stock
    expect(itemFlags({ kind: "service", trackStock: true, trackSerials: true }, "trader")).toEqual({ kind: "service", trackStock: false, trackSerials: false });
    // a service provider (or a company that has not said) keeps no stock at all
    expect(itemFlags({ kind: "goods", trackStock: true, trackSerials: true }, "services").trackStock).toBe(false);
    expect(itemFlags({ kind: "goods", trackStock: true, trackSerials: true }, null).trackStock).toBe(false);
    expect(lineKindOf("service")).toBe("service");
    expect(lineKindOf("goods")).toBe("product");
  });

  it("reads an item CSV and reports problems by line", () => {
    const ok = parseItemsCsv('sku,name,category,sale_price,serials,kind\nL-1,"Laptop, 16 GB",Laptops,"3,450",yes,\n,Setup,,150,,service\n');
    expect(ok.problems).toEqual([]);
    expect(ok.rows).toHaveLength(2);
    expect(ok.rows[0]).toMatchObject({ sku: "L-1", name: "Laptop, 16 GB", category: "Laptops", salePrice: 3450, trackStock: true, trackSerials: true, kind: "goods", unit: "pcs" });
    expect(ok.rows[1]).toMatchObject({ kind: "service", trackStock: false, unit: "job" });
    const bad = parseItemsCsv("sku,name,sale_price,vat_code\nA,One,abc,SR\nA,Two,1,XX\nB,,1,SR\n");
    expect(bad.problems.join(" ")).toMatch(/Line 2 \(One\).*not a number/);
    expect(bad.problems.join(" ")).toMatch(/Line 3 \(Two\).*VAT code/);
    expect(bad.problems.join(" ")).toMatch(/Line 4: no name/);
    expect(parseItemsCsv("sku,price\nA,1").problems[0]).toMatch(/name/);
  });

  it("gives the Inventory app to traders only, admins included", () => {
    expect(appsForBusiness(["sales", "inventory"], "trader")).toEqual(["sales", "inventory"]);
    expect(appsForBusiness(["sales", "inventory"], "services")).toEqual(["sales"]);
    expect(appsForBusiness(["sales", "inventory"], null)).toEqual(["sales"]);
    const adminApps = appsForBusiness(["sales", "accounts", "inventory", "admin"], "services");
    expect(visibleApps({ role: "admin", apps: adminApps }).map((a) => a.key)).not.toContain("inventory");
    expect(visibleApps({ role: "admin", apps: ["sales", "accounts", "inventory", "admin"] }).map((a) => a.key)).toContain("inventory");
  });
});

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

describe.skipIf(!live)("items on documents (needs the test database)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let pool: typeof import("@/db").pool;
  let D: typeof import("drizzle-orm");
  let IA: typeof import("@/app/(app)/sales/items/item-actions");
  let S: typeof import("@/app/(app)/crm/actions");
  let Q: typeof import("@/app/(app)/sales/quote-actions");
  let O: typeof import("@/app/(app)/sales/order-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let Adm: typeof import("@/app/(app)/admin/actions");
  let today = "";
  let seller = 0;
  let accountant = 0;
  let admin = 0;
  let userIds: number[] = [];
  const tag = `ZZITEM${Date.now()}`;
  let savedSeries: { key: string; value: string }[] = [];

  const as = async (id: number, role: "admin" | "sales" = "sales") => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role, sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };

  beforeAll(async () => {
    ({ db, schema, pool } = await import("@/db"));
    D = await import("drizzle-orm");
    IA = await import("@/app/(app)/sales/items/item-actions");
    S = await import("@/app/(app)/crm/actions");
    Q = await import("@/app/(app)/sales/quote-actions");
    O = await import("@/app/(app)/sales/order-actions");
    A = await import("@/app/(app)/accounts/actions");
    P = await import("@/app/(app)/accounts/purchase-actions");
    Adm = await import("@/app/(app)/admin/actions");
    today = (await import("@/lib/dates")).dubaiToday();
    const mk = async (name: string, apps: string[] | null, role: "admin" | "sales" = "sales") =>
      (await db.insert(schema.users).values({ name: `${tag}-${name}`, email: `${tag}-${name}@example.test`, passwordHash: "x", role, apps }).returning({ id: schema.users.id }))[0].id;
    seller = await mk("seller", ["crm", "sales"]);
    accountant = await mk("accountant", ["crm", "sales", "accounts", "inventory"]);
    admin = await mk("admin", null, "admin");
    userIds = [seller, accountant, admin];
    await db.insert(schema.attendancePunches).values(userIds.map((userId) => ({ userId, day: today })));
    savedSeries = await db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(D.inArray(schema.settings.key, ["invoice_prefix", "invoice_next_number", "invoice_digits", "quote_trn"]));
    for (const [key, value] of [["invoice_prefix", `IT${String(Date.now()).slice(-5)}-`], ["invoice_next_number", "1"], ["invoice_digits", "3"], ["quote_trn", "100000000000003"]] as const)
      await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: [schema.settings.organizationId, schema.settings.key], set: { value } });
    await db.update(schema.organizations).set({ businessType: "trader" }).where(D.eq(schema.organizations.id, 1));
  });

  afterAll(async () => {
    await db.delete(schema.settings).where(D.inArray(schema.settings.key, ["invoice_prefix", "invoice_next_number", "invoice_digits", "quote_trn"]));
    if (savedSeries.length) await db.insert(schema.settings).values(savedSeries);
    await db.update(schema.organizations).set({ businessType: "trader" }).where(D.eq(schema.organizations.id, 1));
    const companies = await db.select({ id: schema.companies.id }).from(schema.companies).where(D.like(schema.companies.name, `${tag}%`));
    const cids = companies.map((c) => c.id);
    if (cids.length) {
      await db.delete(schema.invoices).where(D.inArray(schema.invoices.companyId, cids));
      await db.delete(schema.salesOrders).where(D.inArray(schema.salesOrders.companyId, cids));
      const deals = await db.select({ id: schema.deals.id }).from(schema.deals).where(D.inArray(schema.deals.companyId, cids));
      if (deals.length) await db.delete(schema.tasks).where(D.and(D.eq(schema.tasks.relatedType, "deal"), D.inArray(schema.tasks.relatedId, deals.map((d) => d.id))));
      await db.delete(schema.companies).where(D.inArray(schema.companies.id, cids));
    }
    const sups = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).where(D.like(schema.suppliers.name, `${tag}%`));
    if (sups.length) {
      await db.delete(schema.bills).where(D.inArray(schema.bills.supplierId, sups.map((s) => s.id)));
      await db.delete(schema.suppliers).where(D.inArray(schema.suppliers.id, sups.map((s) => s.id)));
    }
    await db.delete(schema.items).where(D.like(schema.items.name, `${tag}%`));
    await db.delete(schema.itemCategories).where(D.like(schema.itemCategories.name, `${tag}%`));
    await db.delete(schema.tasks).where(D.inArray(schema.tasks.createdBy, userIds));
    await db.delete(schema.auditLog).where(D.inArray(schema.auditLog.userId, userIds));
    await db.delete(schema.attendancePunches).where(D.inArray(schema.attendancePunches.userId, userIds));
    await db.delete(schema.users).where(D.inArray(schema.users.id, userIds));
    await pool.end();
  });

  it("numbers items ITM-00001 when the SKU is blank, and keeps SKUs unique whatever the case", async () => {
    await as(accountant);
    const a = await IA.saveItem({ name: `${tag} Laptop`, partNumber: "21M7-002X", trackStock: true, trackSerials: true, salePrice: 3450, purchasePrice: 2980 });
    expect(a.sku).toMatch(/^ITM-\d{5}$/);
    const [row] = await db.select().from(schema.items).where(D.eq(schema.items.id, a.id));
    expect(row).toMatchObject({ partNorm: "21m7002x", trackStock: true, trackSerials: true, salePrice: 3450, purchasePrice: 2980, unit: "pcs", organizationId: 1 });
    await IA.saveItem({ name: `${tag} Mouse`, sku: `${tag}-m1` });
    await expect(IA.saveItem({ name: `${tag} Mouse 2`, sku: `${tag}-M1` })).rejects.toThrow(/already used/);
  });

  it("lets only the accounts team set a purchase price", async () => {
    await as(seller);
    const s = await IA.saveItem({ name: `${tag} Dock`, salePrice: 500, purchasePrice: 400 });
    const [row] = await db.select({ p: schema.items.purchasePrice }).from(schema.items).where(D.eq(schema.items.id, s.id));
    expect(row.p).toBeNull();
    await as(accountant);
    await IA.saveItem({ id: s.id, name: `${tag} Dock`, salePrice: 500, purchasePrice: 400 });
    await as(seller);
    // a salesman editing the item leaves the cost alone
    await IA.saveItem({ id: s.id, name: `${tag} Dock`, salePrice: 520 });
    const [after] = await db.select({ p: schema.items.purchasePrice, s: schema.items.salePrice }).from(schema.items).where(D.eq(schema.items.id, s.id));
    expect(after).toEqual({ p: 400, s: 520 });
  });

  it("keeps category names unique and gives a new category's presets", async () => {
    await as(accountant);
    const c = await IA.saveCategory({ name: `${tag} Monitors`, kind: "goods", trackStock: true, trackSerials: true });
    await expect(IA.saveCategory({ name: `${tag} MONITORS` })).rejects.toThrow(/already a category/);
    const [row] = await db.select().from(schema.itemCategories).where(D.eq(schema.itemCategories.id, c.id));
    expect(row).toMatchObject({ trackStock: true, trackSerials: true, kind: "goods" });
  });

  it("imports a CSV: new SKUs added, known SKUs updated, categories made", async () => {
    await as(accountant);
    const { rows } = parseItemsCsv(`sku,name,category,sale_price,serials\n${tag}-c1,${tag} Cam,${tag} Cameras,900,yes\n${tag}-m1,${tag} Mouse renamed,,45,\n`);
    const r = await IA.importItems(rows);
    expect(r).toEqual({ created: 1, updated: 1 });
    const [cam] = await db.select().from(schema.items).where(D.eq(schema.items.sku, `${tag}-c1`));
    expect(cam).toMatchObject({ trackSerials: true, trackStock: true, salePrice: 900 });
    expect(cam.categoryId).toBeGreaterThan(0);
    const [mouse] = await db.select({ name: schema.items.name }).from(schema.items).where(D.eq(schema.items.sku, `${tag}-m1`));
    expect(mouse.name).toBe(`${tag} Mouse renamed`);
  });

  it("carries the item from quote to order to invoice, and an invoice line follows its item's kind", async () => {
    await as(accountant);
    const laptop = await IA.saveItem({ name: `${tag} Laptop B`, trackStock: true, salePrice: 1000 });
    const setup = await IA.saveItem({ name: `${tag} Setup`, kind: "service", salePrice: 100 });
    const { id: dealId } = await S.createDeal({ companyName: `${tag} Buyer LLC`, emirate: "Dubai", contactName: "Sara", requirement: "laptops" });
    await Q.addItem(dealId, { description: "Laptop B", qty: 2, unitPriceAed: 1000, itemId: laptop.id });
    await Q.addItem(dealId, { description: "Setup", qty: 1, unitPriceAed: 100, itemId: setup.id });
    const q = await Q.createQuote(dealId, { vatPct: 5 });
    const qLines = await db.select({ itemId: schema.quoteItems.itemId }).from(schema.quoteItems).where(D.eq(schema.quoteItems.quoteId, q.id)).orderBy(schema.quoteItems.position);
    expect(qLines.map((l) => l.itemId)).toEqual([laptop.id, setup.id]);
    const o = await O.convertQuoteToOrder(q.id, { termsDays: 7 });
    const oLines = await db.select({ itemId: schema.salesOrderItems.itemId }).from(schema.salesOrderItems).where(D.eq(schema.salesOrderItems.orderId, o.id)).orderBy(schema.salesOrderItems.position);
    expect(oLines.map((l) => l.itemId)).toEqual([laptop.id, setup.id]);
    // straight to the invoice: the delivery note is optional
    const inv = await A.issueInvoice(o.id, { issueDate: today, termsDays: 7 });
    const iLines = await db.select({ itemId: schema.invoiceItems.itemId, kind: schema.invoiceItems.lineKind }).from(schema.invoiceItems).where(D.eq(schema.invoiceItems.invoiceId, inv.id)).orderBy(schema.invoiceItems.position);
    expect(iLines).toEqual([
      { itemId: laptop.id, kind: "product" },
      { itemId: setup.id, kind: "service" },
    ]);
    // an item on a document cannot be deleted, only switched off
    await expect(IA.deleteItem(laptop.id)).rejects.toThrow(/Switch it off/);
    await IA.setItemActive(laptop.id, false);
  });

  it("keeps the item on bills and refuses an item of another company", async () => {
    await as(accountant);
    const it = await IA.saveItem({ name: `${tag} Switch`, trackStock: true, purchasePrice: 700 });
    const [sup] = await db.insert(schema.suppliers).values({ name: `${tag} Supplier` }).returning({ id: schema.suppliers.id });
    const b = await P.createBill({ supplierId: sup.id, supplierRef: `${tag}-B1`, billDate: today, termsDays: 30, category: "cogs", lines: [{ description: "Switch", qty: 3, unitCost: 700, itemId: it.id }] });
    const [line] = await db.select({ itemId: schema.billItems.itemId }).from(schema.billItems).where(D.eq(schema.billItems.billId, b.id));
    expect(line.itemId).toBe(it.id);
    await expect(P.createBill({ supplierId: sup.id, supplierRef: `${tag}-B2`, billDate: today, termsDays: 30, category: "cogs", lines: [{ description: "Ghost", qty: 1, unitCost: 1, itemId: 999999999 }] })).rejects.toThrow(/no longer exists/);
  });

  it("an admin sets what the company does; a service provider has no Inventory app", async () => {
    await as(admin, "admin");
    await Adm.setBusinessType("services");
    const { loadAccess } = await import("@/lib/auth/session");
    // loadAccess is cached per request in Next; in tests each call is fresh
    const acc = await loadAccess();
    expect(acc?.businessType).toBe("services");
    expect(acc?.apps).not.toContain("inventory");
    await Adm.setBusinessType("trader");
    await as(seller);
    await expect(Adm.setBusinessType("services")).rejects.toThrow(/Admin access/);
  });
});
