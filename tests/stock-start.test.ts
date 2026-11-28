import "dotenv/config";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminQuery, createTestOrg } from "./helpers/orgs";

let cookieValue: string | undefined;
vi.mock("server-only", () => ({}));
/** Everything here runs for a throwaway organisation, so Zeronix's books and stock are never touched. */
const mockOrg = vi.hoisted(() => ({ id: 0 }));
// every query of the test runs in the throwaway organisation once it exists (runAsOrg still wins, as in the app)
vi.mock("@/db/org-context", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/org-context")>();
  const org = () => real.explicitOrgId() ?? (mockOrg.id || 1);
  return { ...real, resolveOrgId: async () => org(), resolveScope: async () => ({ org: org(), readOnly: false }) };
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

describe.skipIf(!live)("starting stock and adjusting it (throwaway organisation)", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db").schema;
  let D: typeof import("drizzle-orm");
  let P: typeof import("@/app/(app)/accounts/purchase-actions");
  let A: typeof import("@/app/(app)/accounts/actions");
  let N: typeof import("@/app/(app)/accounts/note-actions");
  let IA: typeof import("@/app/(app)/sales/items/item-actions");
  let E: typeof import("@/lib/inventory/engine");
  let INV: typeof import("@/app/(app)/inventory/actions");
  const tag = `ZZSTS${Date.now()}`;
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

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    P = await import("@/app/(app)/accounts/purchase-actions");
    A = await import("@/app/(app)/accounts/actions");
    N = await import("@/app/(app)/accounts/note-actions");
    IA = await import("@/app/(app)/sales/items/item-actions");
    E = await import("@/lib/inventory/engine");
    INV = await import("@/app/(app)/inventory/actions");
    const S = await import("@/lib/ledger/setup");
    today = (await import("@/lib/dates")).dubaiToday();
    orgId = (await createTestOrg({ name: tag }))[0].id;
    await adminQuery("UPDATE organizations SET business_type = 'trader' WHERE id = $1", [orgId]);
    mockOrg.id = orgId;
    await S.ledgerReady(orgId);
    await db.update(schema.accountingSettings).set({ cutoverDate: today }).where(D.eq(schema.accountingSettings.organizationId, orgId));
    mockOrg.id = orgId;
    accountant = (await db.insert(schema.users).values({ name: `${tag}-acc`, email: `${tag}-acc@example.test`, passwordHash: "x", role: "sales", isAccountant: true, apps: ["accounts", "inventory", "sales"] }).returning({ id: schema.users.id }))[0].id;
    await db.insert(schema.attendancePunches).values({ userId: accountant, day: today });
    supplierId = (await db.insert(schema.suppliers).values({ organizationId: orgId, name: `${tag} Supplier`, termsDays: 30 }).returning({ id: schema.suppliers.id }))[0].id;
    companyId = (await db.insert(schema.companies).values({ name: `${tag} Customer`, nameNorm: `${tag.toLowerCase()} customer`, emirate: "Dubai" }).returning({ id: schema.companies.id }))[0].id;
    saved = await db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(D.inArray(schema.settings.key, SETTING_KEYS));
    for (const [key, value] of [["invoice_prefix", `${tag}-`], ["invoice_next_number", "1"], ["invoice_digits", "3"], ["quote_trn", "100000000000003"]] as const)
      await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: [schema.settings.organizationId, schema.settings.key], set: { value } });
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
  let cable = 0;
  const startedOn = async () => (await db.select({ s: schema.accountingSettings.stockStart }).from(schema.accountingSettings).where(D.eq(schema.accountingSettings.organizationId, orgId)))[0].s;

  it("cannot start before a stock document saved while stock was off, until it is voided", async () => {
    laptop = (await IA.saveItem({ name: `${tag} Laptop`, trackStock: true, trackSerials: true, salePrice: 1500 })).id;
    cable = (await IA.saveItem({ name: `${tag} Cable`, trackStock: true, salePrice: 20 })).id;
    const b = await bill([{ qty: 1, unitCost: 900, itemId: cable }]);
    await expect(INV.startStock({ date: today, offset: "opening_equity", lines: [] }, { check: true })).rejects.toThrow(/saved before stock started/);
    await P.voidBill(b.id, "typed before the start");
    expect(await startedOn()).toBeNull();
  });

  it("a check runs everything and saves nothing; serial numbers must match the count", async () => {
    await expect(INV.startStock({ date: today, offset: "opening_equity", lines: [{ itemId: laptop, qty: 2, unitCost: 1000, serials: ["SN-A"] }] }, { check: true })).rejects.toThrow(/2 serial numbers/);
    const r = await INV.startStock({ date: today, offset: "opening_equity", lines: [{ itemId: laptop, qty: 2, unitCost: 1000, serials: ["SN-A", "SN-B"] }, { itemId: cable, qty: 10, unitCost: 5, serials: [] }] }, { check: true });
    expect(r).toMatchObject({ items: 2, units: 12, value: 2050 });
    expect(await startedOn()).toBeNull();
    expect((await item(laptop)).onHand).toBe(0);
    expect(await balance("inventory_items")).toBe(0);
  });

  it("starts stock with the opening count against opening balance equity, once", async () => {
    const eq0 = await balance("opening_equity");
    const r = await INV.startStock({ date: today, offset: "opening_equity", lines: [{ itemId: laptop, qty: 2, unitCost: 1000, serials: ["SN-A", "SN-B"] }, { itemId: cable, qty: 10, unitCost: 5, serials: [] }] });
    expect(r.number).toMatch(/^SA-/);
    expect(await startedOn()).toBe(today);
    expect(await item(laptop)).toMatchObject({ onHand: 2, stockValue: 2000, avgCost: 1000 });
    expect(await balance("inventory_items")).toBe(2050);
    expect(Math.round((await balance("opening_equity")) - eq0)).toBe(-2050);
    await expect(INV.startStock({ date: today, offset: "opening_equity", lines: [] })).rejects.toThrow(/already started/);
  });

  it("can be undone while only the opening count moved stock, and started again", async () => {
    await INV.undoStockStart("counted the wrong shelf");
    expect(await startedOn()).toBeNull();
    expect(await item(laptop)).toMatchObject({ onHand: 0, stockValue: 0 });
    expect(await balance("inventory_items")).toBe(0);
    await INV.startStock({ date: today, offset: "opening_equity", lines: [{ itemId: laptop, qty: 2, unitCost: 1000, serials: ["SN-A", "SN-B"] }, { itemId: cable, qty: 10, unitCost: 5, serials: [] }] });
    expect((await item(laptop)).onHand).toBe(2);
    // a bill moves stock: the start is fixed from now on
    await bill([{ qty: 5, unitCost: 4, itemId: cable }]);
    expect((await item(cable)).onHand).toBe(15);
    await expect(INV.undoStockStart("too late")).rejects.toThrow(/can no longer be undone/);
  });

  let countId = 0;
  it("a count moves the difference against stock adjustments; a write-off takes serials out", async () => {
    const adj0 = await balance("stock_adjustments");
    const c = await INV.saveAdjustment({ date: today, kind: "count", reason: "Month-end count", lines: [{ itemId: cable, qty: 12, serials: [] }] });
    countId = c.id;
    expect((await item(cable)).onHand).toBe(12);
    // 15 cables worth 70 (10 × 5 + 5 × 4): 3 go at the average 4.67
    expect(Math.round(((await balance("stock_adjustments")) - adj0) * 100) / 100).toBe(14);
    await INV.saveAdjustment({ date: today, kind: "write_off", reason: "Dropped in the store", lines: [{ itemId: laptop, qty: 1, serials: ["SN-B"] }] });
    expect((await item(laptop)).onHand).toBe(1);
    const [sn] = await db.select().from(schema.stockSerials).where(D.and(D.eq(schema.stockSerials.organizationId, orgId), D.eq(schema.stockSerials.serialNorm, "SN-B")));
    expect(sn.status).toBe("written_off");
    await expect(INV.saveAdjustment({ date: today, kind: "count", reason: "Nothing changed", lines: [{ itemId: cable, qty: 12, serials: [] }] })).rejects.toThrow(/nothing to adjust/);
  });

  it("an adjustment is voided only while nothing has moved its items since; the opening count only from Settings", async () => {
    await expect(INV.voidAdjustment(countId, "wrong count")).resolves.toBeUndefined();
    expect((await item(cable)).onHand).toBe(15);
    const [opening] = await db.select().from(schema.stockAdjustments).where(D.and(D.eq(schema.stockAdjustments.organizationId, orgId), D.eq(schema.stockAdjustments.kind, "opening"), D.eq(schema.stockAdjustments.status, "posted")));
    await expect(INV.voidAdjustment(opening.id, "recount the shelf")).rejects.toThrow(/Undo stock start/);
    // stock and the ledger agree
    const value = (await db.select({ v: D.sql<number>`coalesce(sum(stock_value), 0)::float` }).from(schema.items).where(D.eq(schema.items.organizationId, orgId)))[0].v;
    expect(Math.round(value * 100) / 100).toBe(await balance("inventory_items"));
  });
  it("serial numbers go out on the invoice, come back on a credit note and go back to the supplier", async () => {
    const DATA = await import("@/lib/inventory/data");
    const b = await bill([{ qty: 2, unitCost: 1200, itemId: laptop, serials: ["SN-C", "SN-D"] }]);
    expect((await item(laptop)).onHand).toBe(3);
    await expect(invoice([{ qty: 2, unitPrice: 1500, itemId: laptop, serials: ["SN-A"] }])).rejects.toThrow(/2 serial numbers/);
    const inv = await invoice([{ qty: 2, unitPrice: 1500, itemId: laptop, serials: ["SN-A", "SN-C"] }]);
    expect((await item(laptop)).onHand).toBe(1);
    const sold = await DATA.noteStockLines(orgId, "invoice", inv.id);
    const [line] = Object.keys(sold).map(Number);
    expect(sold[line]).toEqual({ trackSerials: true, serials: ["SN-A", "SN-C"] });
    await N.createCreditNote(inv.id, { issueDate: today, reason: "One laptop back", goodsBack: true, goodsCost: 0, lines: [{ itemId: line, qty: 1, unitPrice: 1500, qtyBack: 1, serials: ["SN-C"] }] });
    expect((await item(laptop)).onHand).toBe(2);
    expect((await DATA.noteStockLines(orgId, "invoice", inv.id))[line].serials).toEqual(["SN-A"]);
    const [bl] = Object.keys(await DATA.noteStockLines(orgId, "bill", b.id)).map(Number);
    await N.createDebitNote(b.id, { issueDate: today, reason: "Faulty unit back", goodsBack: true, lines: [{ itemId: bl, qty: 1, unitPrice: 1200, serials: ["SN-D"] }] });
    expect((await item(laptop)).onHand).toBe(1);
    const found = await DATA.searchSerials(orgId, "sn-");
    expect(Object.fromEntries(found.map((r) => [r.serial, r.status]))).toEqual({ "SN-A": "sold", "SN-B": "written_off", "SN-C": "in_stock", "SN-D": "returned" });
    // the figures on the item are what its moves add up to, and stock still equals the ledger
    const it = await item(laptop);
    expect(await E.rebuildItem(db as never, orgId, laptop)).toMatchObject({ qty: it.onHand, value: it.stockValue });
    const value = (await db.select({ v: D.sql<number>`coalesce(sum(stock_value), 0)::float` }).from(schema.items).where(D.eq(schema.items.organizationId, orgId)))[0].v;
    expect(Math.round(value * 100) / 100).toBe(await balance("inventory_items"));
  });
});
