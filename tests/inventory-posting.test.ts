import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
/** Everything here runs for a throwaway organisation, so Zeronix's books and stock are never touched. */
const mockOrg = vi.hoisted(() => ({ id: 0 }));
vi.mock("@/lib/org", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/org")>();
  return { ...real, currentOrgId: async () => mockOrg.id || real.DEFAULT_ORG_ID };
});
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

const live = !!process.env.DATABASE_URL && !!process.env.AUTH_SECRET;

describe.skipIf(!live)("item stock moves with bills, invoices and notes (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let N: typeof import("@/app/(app)/accounts/note-actions");
  let IA: typeof import("@/app/(app)/sales/items/item-actions");
  let E: typeof import("@/lib/inventory/engine");
  const tag = `ZZSTK${Date.now()}`;
  let orgId = 0;
  let accountant = 0;
  let supplierId = 0;
  let companyId = 0;
  let today = "";
  let ref = 0;
  let saved: { key: string; value: string }[] = [];
  const SETTING_KEYS = ["invoice_prefix", "invoice_next_number", "invoice_digits", "quote_trn"];

  const as = async (id: number) => {
    cookieValue = await new SignJWT({ name: `${tag}-${id}`, email: `${tag}-${id}@example.test`, role: "sales", sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  };
  /** An account's balance (debit − credit) in the throwaway books. */
  const balance = async (key: string) =>
    Number(
      (
        await db.execute<{ b: number }>(
          D.sql`SELECT coalesce(sum(l.debit - l.credit), 0)::float b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.organization_id = ${orgId} AND a.system_key = ${key}`,
        )
      ).rows[0].b,
    );
  const item = async (id: number) => (await db.select().from(schema.items).where(D.eq(schema.items.id, id)))[0];
  const bill = (lines: { description?: string; qty: number; unitCost: number; itemId?: number | null; serials?: string[] }[], category = "cogs") =>
    P.createBill({ supplierId, supplierRef: `${tag}-B${++ref}`, billDate: today, termsDays: 30, category, lines: lines.map((l) => ({ description: l.description ?? "Goods", ...l })), vatPct: 5 });
  const invoice = (lines: { qty: number; unitPrice: number; itemId?: number | null; serials?: string[] }[]) =>
    A.createInvoice({ companyId, issueDate: today, termsDays: 0, customerAddress: "Dubai", vatPct: 5, lines: lines.map((l) => ({ description: "Goods", lineKind: "product", ...l })) });
  const linesOf = async (table: "invoiceItems" | "billItems", parent: number) =>
    table === "invoiceItems" ? db.select().from(schema.invoiceItems).where(D.eq(schema.invoiceItems.invoiceId, parent)) : db.select().from(schema.billItems).where(D.eq(schema.billItems.billId, parent));

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/accounts/purchase-actions");
    A = await import("@/app/(app)/accounts/actions");
    N = await import("@/app/(app)/accounts/note-actions");
    IA = await import("@/app/(app)/sales/items/item-actions");
    E = await import("@/lib/inventory/engine");
    const S = await import("@/lib/ledger/setup");
    today = (await import("@/lib/dates")).dubaiToday();
    orgId = (await db.insert(schema.organizations).values({ name: tag, businessType: "trader" }).returning({ id: schema.organizations.id }))[0].id;
    await S.ledgerReady(orgId);
    await db.update(schema.accountingSettings).set({ cutoverDate: today }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    mockOrg.id = orgId;
    accountant = (await db.insert(schema.users).values({ name: `${tag}-acc`, email: `${tag}-acc@example.test`, passwordHash: "x", role: "sales", apps: ["accounts", "inventory", "sales"] }).returning({ id: schema.users.id }))[0].id;
    await db.insert(schema.attendancePunches).values({ userId: accountant, day: today });
    supplierId = (await db.insert(schema.suppliers).values({ organizationId: orgId, name: `${tag} Supplier`, termsDays: 30 }).returning({ id: schema.suppliers.id }))[0].id;
    companyId = (await db.insert(schema.companies).values({ name: `${tag} Customer`, nameNorm: `${tag.toLowerCase()} customer`, emirate: "Dubai" }).returning({ id: schema.companies.id }))[0].id;
    saved = await db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(D.inArray(schema.settings.key, SETTING_KEYS));
    for (const [key, value] of [["invoice_prefix", `${tag}-`], ["invoice_next_number", "1"], ["invoice_digits", "3"], ["quote_trn", "100000000000003"]] as const)
      await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
    await as(accountant);
  });

  afterAll(async () => {
    mockOrg.id = 0;
    await db.delete(schema.settings).where(D.inArray(schema.settings.key, SETTING_KEYS));
    if (saved.length) await db.insert(schema.settings).values(saved);
    if (!orgId) return;
    const { sql } = D;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.ledger_maintenance = 'on'`);
      await tx.execute(sql`DELETE FROM stock_move_serials WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM stock_serials WHERE organization_id = ${orgId}`);
      await tx.execute(sql`UPDATE stock_moves SET settles_move_id = NULL, return_of_move_id = NULL WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM stock_moves WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM journal_lines WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM journal_entries WHERE organization_id = ${orgId} AND reversal_of_id IS NOT NULL`);
      await tx.execute(sql`DELETE FROM journal_entries WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM debit_notes WHERE bill_id IN (SELECT id FROM bills WHERE supplier_id = ${supplierId})`);
      await tx.execute(sql`DELETE FROM supplier_payment_allocations WHERE bill_id IN (SELECT id FROM bills WHERE supplier_id = ${supplierId})`);
      await tx.execute(sql`DELETE FROM bills WHERE supplier_id = ${supplierId}`);
      await tx.execute(sql`DELETE FROM credit_notes WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM invoices WHERE company_id = ${companyId}`);
      await tx.execute(sql`DELETE FROM tasks WHERE created_by = ${accountant}`);
      await tx.execute(sql`DELETE FROM activities WHERE company_id = ${companyId}`);
      await tx.execute(sql`DELETE FROM companies WHERE id = ${companyId}`);
      await tx.execute(sql`DELETE FROM suppliers WHERE id = ${supplierId}`);
      await tx.execute(sql`DELETE FROM stock_adjustments WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM items WHERE organization_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM audit_log WHERE user_id = ${accountant}`);
      await tx.execute(sql`DELETE FROM attendance_punches WHERE user_id = ${accountant}`);
      await tx.execute(sql`DELETE FROM users WHERE id = ${accountant}`);
      for (const t of ["tax_code_components", "tax_codes", "bank_accounts", "accounts", "accounting_settings", "doc_series", "audit_log"]) await tx.execute(sql.raw(`DELETE FROM ${t} WHERE organization_id = ${orgId}`));
      await tx.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    });
  });

  let laptop = 0;
  let b1 = 0;

  it("moves nothing before stock starts, and only lines of items that track stock", async () => {
    laptop = (await IA.saveItem({ name: `${tag} Laptop`, trackStock: true, salePrice: 1500 })).id;
    const before = await bill([{ qty: 2, unitCost: 1000, itemId: laptop }]);
    expect((await item(laptop)).onHand).toBe(0);
    await P.voidBill(before.id, "made before the start");
    await db.update(schema.accountingSettings).set({ stockStart: today }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    const plain = (await IA.saveItem({ name: `${tag} Cable`, trackStock: false })).id;
    const b = await bill([{ qty: 5, unitCost: 10, itemId: plain }]);
    expect((await item(plain)).onHand).toBe(0);
    expect(await E.movesOf(db as never, orgId, "bill", b.id)).toHaveLength(0);
  });

  it("a bill brings stock in at its cost; the cost moves from Inventory into item stock", async () => {
    const inv0 = await balance("inventory");
    b1 = (await bill([{ qty: 2, unitCost: 1000, itemId: laptop }, { description: "Typed by hand", qty: 1, unitCost: 300 }])).id;
    expect(await item(laptop)).toMatchObject({ onHand: 2, stockValue: 2000, avgCost: 1000 });
    expect(await balance("inventory_items")).toBe(2000);
    // only the line typed by hand stays in Inventory (it still moves to cost of goods sold by bill)
    expect(Math.round((await balance("inventory")) - inv0)).toBe(300);
    await bill([{ qty: 1, unitCost: 1300, itemId: laptop }]);
    expect(await item(laptop)).toMatchObject({ onHand: 3, stockValue: 3300, avgCost: 1100 });
  });

  it("an invoice takes stock out at average cost into cost of goods sold", async () => {
    const cogs0 = await balance("cogs");
    await invoice([{ qty: 2, unitPrice: 1500, itemId: laptop }]);
    expect(await item(laptop)).toMatchObject({ onHand: 1, stockValue: 1100 });
    expect(Math.round((await balance("cogs")) - cogs0)).toBe(2200);
    expect(await balance("inventory_items")).toBe(1100);
  });

  let short = 0;
  it("selling beyond stock is allowed: the extra units wait for their cost, and the next bill gives it", async () => {
    const cogs0 = await balance("cogs");
    short = (await invoice([{ qty: 3, unitPrice: 1500, itemId: laptop }])).id;
    expect(await item(laptop)).toMatchObject({ onHand: -2, stockValue: 0 });
    expect(Math.round((await balance("cogs")) - cogs0)).toBe(1100);
    expect((await E.rebuildItem(db as never, orgId, laptop)).uncosted).toBe(2);
    await bill([{ qty: 2, unitCost: 1200, itemId: laptop }]);
    expect(await item(laptop)).toMatchObject({ onHand: 0, stockValue: 0 });
    expect(Math.round((await balance("cogs")) - cogs0)).toBe(1100 + 2400);
    expect((await E.rebuildItem(db as never, orgId, laptop)).uncosted).toBe(0);
    // the cost of those units is posted under the invoice that sold them
    const settles = await db.execute<{ n: number }>(D.sql`SELECT count(*)::int n FROM journal_entries WHERE organization_id = ${orgId} AND source_type = 'invoice' AND source_id = ${short} AND purpose LIKE 'settle:%'`);
    expect(Number(settles.rows[0].n)).toBe(1);
  });

  it("units coming back on a credit note are stock again at what they cost", async () => {
    await bill([{ qty: 2, unitCost: 1000, itemId: laptop }]);
    const inv = await invoice([{ qty: 2, unitPrice: 1500, itemId: laptop }]);
    expect((await item(laptop)).onHand).toBe(0);
    const [line] = await linesOf("invoiceItems", inv.id);
    await N.createCreditNote(inv.id, { issueDate: today, reason: "One laptop returned", goodsBack: true, lines: [{ itemId: line.id, qty: 1, unitPrice: 1500 }] });
    expect(await item(laptop)).toMatchObject({ onHand: 1, stockValue: 1000 });
    // a second note cannot bring back more than was sold
    await N.createCreditNote(inv.id, { issueDate: today, reason: "Rest", goodsBack: true, lines: [{ itemId: line.id, qty: 1, unitPrice: 1500, qtyBack: 5 }] });
    expect((await item(laptop)).onHand).toBe(2);
  });

  it("blocks an invoice that sells more than is in stock when the company says so", async () => {
    await db.update(schema.accountingSettings).set({ negativeStock: "block" }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    await expect(invoice([{ qty: 5, unitPrice: 1500, itemId: laptop }])).rejects.toThrow(/Only 2 pcs/);
    expect((await item(laptop)).onHand).toBe(2);
    await db.update(schema.accountingSettings).set({ negativeStock: "allow" }).where(D.eq(schema.accountingSettings.organizationId, orgId));
  });

  it("goods sent back on a debit note leave stock at average cost; a price cut alone moves none", async () => {
    const b = await bill([{ qty: 2, unitCost: 1000, itemId: laptop }]);
    expect(await item(laptop)).toMatchObject({ onHand: 4, stockValue: 4000 });
    const [line] = await linesOf("billItems", b.id);
    await N.createDebitNote(b.id, { issueDate: today, reason: "Discount", lines: [{ itemId: line.id, qty: 1, unitPrice: 100 }] });
    expect((await item(laptop)).onHand).toBe(4);
    await N.createDebitNote(b.id, { issueDate: today, reason: "Faulty unit back", goodsBack: true, lines: [{ itemId: line.id, qty: 1, unitPrice: 900 }] });
    expect(await item(laptop)).toMatchObject({ onHand: 3, stockValue: 3000 });
    // cannot send back what is not in stock
    await expect(N.createDebitNote(b.id, { issueDate: today, reason: "Too many", goodsBack: true, lines: [{ itemId: line.id, qty: 10, unitPrice: 10 }] })).rejects.toThrow(/Only 3 pcs/);
  });

  it("a bill can be voided only while nothing has moved its items since", async () => {
    await expect(P.voidBill(b1, "wrong")).rejects.toThrow(/moved since/);
    const mouse = (await IA.saveItem({ name: `${tag} Mouse`, trackStock: true })).id;
    const b = await bill([{ qty: 4, unitCost: 25, itemId: mouse }]);
    expect((await item(mouse)).onHand).toBe(4);
    await P.voidBill(b.id, "entered twice");
    expect(await item(mouse)).toMatchObject({ onHand: 0, stockValue: 0 });
    // its stock switches are fixed once it has moved
    await expect(IA.saveItem({ id: mouse, name: `${tag} Mouse`, trackStock: false })).rejects.toThrow(/stock moves/);
  });

  it("tracks serial numbers from the supplier to the customer, even sold before they are received", async () => {
    const server = (await IA.saveItem({ name: `${tag} Server`, trackStock: true, trackSerials: true })).id;
    await bill([{ qty: 2, unitCost: 5000, itemId: server, serials: ["SN-1", "SN-2"] }]);
    await expect(bill([{ qty: 1, unitCost: 5000, itemId: server, serials: ["sn-1"] }])).rejects.toThrow(/sn-1/);
    await expect(bill([{ qty: 2, unitCost: 5000, itemId: server, serials: ["SN-7"] }])).rejects.toThrow(/2 serial numbers/);
    await invoice([{ qty: 1, unitPrice: 7000, itemId: server, serials: ["SN-1"] }]);
    await expect(invoice([{ qty: 1, unitPrice: 7000, itemId: server, serials: ["SN-1"] }])).rejects.toThrow(/sold/);
    // back-to-back: sold first, the bill comes later
    await invoice([{ qty: 2, unitPrice: 7000, itemId: server, serials: ["SN-2", "SN-9"] }]);
    await bill([{ qty: 1, unitCost: 5200, itemId: server, serials: ["SN-9"] }]);
    const rows = await db.select({ s: schema.stockSerials.serial, status: schema.stockSerials.status, received: schema.stockSerials.receivedMoveId }).from(schema.stockSerials).where(D.eq(schema.stockSerials.itemId, server)).orderBy(schema.stockSerials.serial);
    expect(rows.map((r) => [r.s, r.status, !!r.received])).toEqual([
      ["SN-1", "sold", true],
      ["SN-2", "sold", true],
      ["SN-9", "sold", true],
    ]);
    expect(await item(server)).toMatchObject({ onHand: 0, stockValue: 0 });
  });

  it("an adjustment counts stock in and writes it off, against stock adjustments", async () => {
    const { takeSeriesNumber } = await import("@/lib/doc-numbers");
    const SD = await import("@/lib/ledger/stock-docs");
    const adj0 = await balance("stock_adjustments");
    await db.transaction(async (tx) => {
      const { number } = await takeSeriesNumber(tx, { orgId, key: "stock_adjustment", prefix: "SA" });
      const [a] = await tx.insert(schema.stockAdjustments).values({ organizationId: orgId, number, date: today, kind: "count", reason: "test" }).returning({ id: schema.stockAdjustments.id });
      // counted 5 where 3 are on hand: 2 more, at the average
      await tx.insert(schema.stockAdjustmentLines).values({ organizationId: orgId, adjustmentId: a.id, itemId: laptop, qty: 0, countedQty: 5 });
      await SD.postAdjustmentDoc(tx, orgId, a.id, accountant);
    });
    expect(await item(laptop)).toMatchObject({ onHand: 5, stockValue: 5000 });
    expect(Math.round((await balance("stock_adjustments")) - adj0)).toBe(-2000);
  });

  it("item stock always equals its account, the cache equals its moves, and posting again adds nothing", async () => {
    const items = await db.select().from(schema.items).where(D.and(D.eq(schema.items.organizationId, orgId), D.eq(schema.items.trackStock, true)));
    const total = items.reduce((s, i) => s + i.stockValue, 0);
    expect(Math.round(total * 100) / 100).toBe(await balance("inventory_items"));
    for (const i of items) {
      const r = await E.rebuildItem(db as never, orgId, i.id);
      expect([r.qty, r.value]).toEqual([i.onHand, i.stockValue]);
      expect(r.uncosted).toBe(Math.max(0, -i.onHand));
    }
    // posting this company's documents again (what "Post existing documents" does) adds no moves and no entries
    const Docs = await import("@/lib/ledger/documents");
    const counts = async (tx: typeof db) =>
      (await tx.execute<{ m: number; e: number }>(D.sql`SELECT (SELECT count(*) FROM stock_moves WHERE organization_id = ${orgId})::int m, (SELECT count(*) FROM journal_entries WHERE organization_id = ${orgId})::int e`)).rows[0];
    const bills = await db.select({ id: schema.bills.id }).from(schema.bills).where(D.and(D.eq(schema.bills.supplierId, supplierId), D.ne(schema.bills.status, "void")));
    const invs = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(D.eq(schema.invoices.companyId, companyId));
    const cns = await db.select({ id: schema.creditNotes.id }).from(schema.creditNotes).where(D.inArray(schema.creditNotes.invoiceId, invs.map((i) => i.id)));
    const dns = await db.select({ id: schema.debitNotes.id }).from(schema.debitNotes).where(D.inArray(schema.debitNotes.billId, bills.map((b) => b.id)));
    const before = await counts(db);
    for (const b of bills) await db.transaction((tx) => Docs.postBillDoc(tx, orgId, b.id, accountant));
    for (const i of invs) await db.transaction((tx) => Docs.postInvoiceDoc(tx, orgId, i.id, accountant));
    for (const c of cns) await db.transaction((tx) => Docs.postCreditNoteDoc(tx, orgId, c.id, accountant));
    for (const d of dns) await db.transaction((tx) => Docs.postDebitNoteDoc(tx, orgId, d.id, accountant));
    expect(await counts(db)).toEqual(before);
  });
});
