import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// the intake and the connector tools run outside a Next request here
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
// the merge action checks the signed-in person: here, the test user
const me = vi.hoisted(() => ({ id: 0 }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), assertApp: async () => ({ id: me.id, role: "admin" }) }));

import { fingerprint, isUnclear, messageTime, toDraft, type PushedItem } from "@/lib/procurement/intake";

const item = (over: Partial<PushedItem> = {}): PushedItem => ({
  category: "laptop", brand: "hp", model: "HP OmniBook X Flip 14", part_number: "fm0013dx", cpu: "Core Ultra 5 226V", ram_gb: 16,
  storage: "512 ssd", display: "", gpu: "", os: "Win11 Home", extras: "", condition: "new", price: 2850, currency: "", stock_note: "limited stock",
  line: "*HP Omni Book X Flip 2-in-1 14 - FM0013DX* Ultra 5 226V | 16GB | 512GB @2850/-", ...over,
});

describe("stock intake: cleaning a pushed line", () => {
  it("writes brand, model, part number and storage one way", () => {
    const d = toDraft(item(), 0, { currency: "AED", basis: "" });
    expect(d).toMatchObject({ brand: "HP", modelName: "OmniBook X Flip 14", partNumber: "FM0013DX", storage: "512GB SSD", ramGb: 16, currency: "AED", price: 2850, flags: [] });
  });

  it("drops the part number from the model and keeps the supplier's currency when none is given", () => {
    const d = toDraft(item({ model: "Laptop 15-FD0130WM", part_number: "15-fd0130wm", price: 450, currency: "" }), 1, { currency: "USD", basis: "FOB JA" });
    expect(d.modelName).toBe("Laptop");
    expect(d.currency).toBe("USD");
    expect(d.priceBasis).toBe("FOB JA");
    expect(toDraft(item({ currency: "dhs" }), 2, { currency: "USD", basis: "" }).currency).toBe("AED");
  });

  it("flags lines that cannot be identified", () => {
    const noBrand = toDraft(item({ brand: "" }), 0, { currency: "AED", basis: "" });
    const noModel = toDraft(item({ model: "", part_number: "" }), 0, { currency: "AED", basis: "" });
    expect(isUnclear(noBrand)).toBe(true);
    expect(isUnclear(noModel)).toBe(true);
    expect(isUnclear(toDraft(item(), 0, { currency: "AED", basis: "" }))).toBe(false);
    expect(isUnclear({ ...toDraft(item(), 0, { currency: "AED", basis: "" }), suggestedProductId: 5 })).toBe(true);
  });

  it("knows the same message whatever the spacing or bold marks", () => {
    expect(fingerprint("*HP 250 G10*  @1500/-\n\nLimited")).toBe(fingerprint("HP 250 G10 @1500/- limited"));
    expect(fingerprint("HP 250 G10 @1500")).not.toBe(fingerprint("HP 250 G10 @1550"));
  });

  it("never files a message in the future", () => {
    const now = new Date("2026-11-24T10:00:00Z");
    expect(messageTime("2026-11-24T12:00:00+04:00", now).toISOString()).toBe("2026-11-24T08:00:00.000Z");
    expect(messageTime("2030-01-01T00:00:00Z", now)).toBe(now);
    expect(messageTime("yesterday", now)).toBe(now);
  });
});

const live = !!process.env.DATABASE_URL;

/* eslint-disable @typescript-eslint/no-explicit-any */
describe.skipIf(!live)("stock intake: suppliers, repeats, inbox (needs the test database)", () => {
  const tag = `ZZSTK${Date.now()}`;
  let db: any, schema: any, D: any, I: typeof import("@/lib/procurement/intake");
  let userId = 0;
  let supplierId = 0;
  const msg = (over: Record<string, unknown> = {}) => ({
    chat: `${tag} Laptop Traders`, sender_name: `${tag} Aman`, sender_phone: "+971 50 111 2233", message_time: "2026-11-20T09:00:00+04:00",
    message_text: `${tag} *Offers*\nHP OmniBook X Flip 14 FM0013DX @2850\nLenovo V15 G5 i5 8/512 @1880`, price_basis: "",
    items: [
      item({ part_number: `${tag}A1`, model: "OmniBook X Flip 14" }),
      item({ brand: "Lenovo", model: `V15 Gen 5 ${tag}`, part_number: "", cpu: "Core i5-13420H", ram_gb: 8, storage: "512GB", price: 1880 }),
    ],
    ...over,
  });

  beforeAll(async () => {
    ({ db, schema } = await import("@/db"));
    D = await import("drizzle-orm");
    I = await import("@/lib/procurement/intake");
    userId = (await db.insert(schema.users).values({ name: `${tag}-u`, email: `${tag}-u@example.test`, passwordHash: "x", role: "admin" }).returning({ id: schema.users.id }))[0].id;
    me.id = userId;
    supplierId = (await db.insert(schema.suppliers).values({ name: `${tag} Aman Star` }).returning({ id: schema.suppliers.id }))[0].id;
    await db.insert(schema.supplierHandles).values({ supplierId, kind: "phone", value: "050 111 2233", valueNorm: "971501112233" });
  });

  afterAll(async () => {
    const { sql } = D;
    await db.execute(sql`DELETE FROM offers WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE ${tag + "%"})`);
    await db.execute(sql`DELETE FROM price_lists WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE ${tag + "%"})`);
    await db.execute(sql`DELETE FROM bills WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE ${tag + "%"})`);
    await db.execute(sql`DELETE FROM suppliers WHERE name LIKE ${tag + "%"}`);
    await db.execute(sql`DELETE FROM stock_inbox WHERE chat LIKE ${tag + "%"}`);
    await db.execute(sql`DELETE FROM audit_log WHERE user_id = ${userId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
    const { pool } = await import("@/db");
    await pool.end();
  });

  it("finds the supplier by phone, saves clear lines and learns their WhatsApp name", async () => {
    const [r] = await I.ingestMessages(userId, [msg()]);
    expect(r).toMatchObject({ status: "saved", supplier: `${tag} Aman Star`, saved: 2, newProducts: 2, priceChanges: 0, needCheck: 0 });
    const offers = await db.select().from(schema.offers).where(D.eq(schema.offers.supplierId, supplierId));
    expect(offers).toHaveLength(2);
    expect(offers.map((o: any) => o.receivedAt.toISOString())).toEqual(["2026-11-20T05:00:00.000Z", "2026-11-20T05:00:00.000Z"]);
    const handles = await db.select().from(schema.supplierHandles).where(D.eq(schema.supplierHandles.supplierId, supplierId));
    expect(handles.map((h: any) => h.kind).sort()).toEqual(["name", "phone"]);
    // the WhatsApp name alone now finds them
    expect((await I.findSupplier({ sender_name: `${tag} Aman`, sender_phone: "" }))?.id).toBe(supplierId);
  });

  it("recognises the same broadcast again: nothing new saved, prices count as given again", async () => {
    const [r] = await I.ingestMessages(userId, [msg({ message_text: msg().message_text.replace(/\n/g, "  \n ").replace("*Offers*", "Offers"), message_time: "2026-11-22T09:00:00+04:00" })]);
    expect(r.status).toBe("repeat");
    const lists = await db.select().from(schema.priceLists).where(D.eq(schema.priceLists.supplierId, supplierId));
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({ seenCount: 2 });
    expect(lists[0].receivedAt.toISOString()).toBe("2026-11-22T05:00:00.000Z");
    const offers = await db.select().from(schema.offers).where(D.eq(schema.offers.supplierId, supplierId));
    expect(offers).toHaveLength(2);
    expect(offers[0].receivedAt.toISOString()).toBe("2026-11-22T05:00:00.000Z");
  });

  it("counts a changed price against the supplier's last price for that product", async () => {
    const [r] = await I.ingestMessages(userId, [
      msg({ message_text: `${tag} new prices HP 2799`, message_time: "2026-11-23T09:00:00+04:00", items: [item({ part_number: `${tag}A1`, model: "OmniBook X Flip 14", price: 2799 })] }),
    ]);
    expect(r).toMatchObject({ status: "saved", saved: 1, newProducts: 0, priceChanges: 1 });
  });

  it("keeps unclear lines for a person and saves the rest", async () => {
    const [r] = await I.ingestMessages(userId, [
      msg({ message_text: `${tag} mixed`, items: [item({ part_number: `${tag}B2`, price: 999 }), item({ brand: "", model: "Gaming beast", part_number: "", price: 5000 })] }),
    ]);
    expect(r).toMatchObject({ status: "needs_check", saved: 1, needCheck: 1 });
    const [pl] = await db.select().from(schema.priceLists).where(D.eq(schema.priceLists.id, r.priceListId));
    expect(pl.status).toBe("review");
    expect(pl.drafts).toHaveLength(1);
    expect(pl.drafts[0].flags).toContain("Brand missing");
    expect(await I.inboxCount()).toBeGreaterThanOrEqual(1);
  });

  it("puts an unknown sender in the inbox once, and files everything from them once assigned", async () => {
    const stranger = { sender_name: `${tag} New Guy`, sender_phone: "+971 55 999 0000", chat: `${tag} Laptop Traders` };
    const first = msg({ ...stranger, message_text: `${tag} stranger 1`, items: [item({ part_number: `${tag}C3`, price: 100 })] });
    const [a] = await I.ingestMessages(userId, [first]);
    const [again] = await I.ingestMessages(userId, [first]);
    const [b] = await I.ingestMessages(userId, [msg({ ...stranger, message_text: `${tag} stranger 2`, items: [item({ part_number: `${tag}C4`, price: 200 })] })]);
    expect(a.status).toBe("unknown_sender");
    expect(again.inboxId).toBe(a.inboxId);
    expect(b.inboxId).not.toBe(a.inboxId);

    const status = await I.stockStatus();
    expect(status.waitingInInbox.find((w) => w.chat === `${tag} Laptop Traders`)?.messages).toBe(2);

    // as the Inbox's "This is…" button does: a new supplier, both messages filed, the number remembered
    const sup = (await db.insert(schema.suppliers).values({ name: `${tag} New Guy Trading` }).returning())[0];
    await I.learnHandles(sup.id, stranger);
    for (const id of [a.inboxId, b.inboxId]) {
      const [row] = await db.select().from(schema.stockInbox).where(D.eq(schema.stockInbox.id, id));
      const r = await I.ingestMessage(userId, { ...stranger, message_time: row.messageAt.toISOString(), message_text: row.messageText, price_basis: "", items: row.items }, sup);
      expect(r.status).toBe("saved");
      await db.delete(schema.stockInbox).where(D.eq(schema.stockInbox.id, id));
    }
    const [c] = await I.ingestMessages(userId, [msg({ ...stranger, message_text: `${tag} stranger 3`, items: [item({ part_number: `${tag}C5`, price: 300 })] })]);
    expect(c).toMatchObject({ status: "saved", supplier: `${tag} New Guy Trading` });
  });

  it("tells Claude when each chat was last pushed", async () => {
    const s = await I.stockStatus(`${tag} Laptop Traders`);
    expect(s.chats).toHaveLength(1);
    expect(new Date(s.chats[0].lastMessageAt).getTime()).toBeGreaterThanOrEqual(new Date("2026-11-23T05:00:00Z").getTime());
    expect(s.knownSenders.find((k) => k.supplier === `${tag} Aman Star`)?.phones).toContain("050 111 2233");
  });

  it("runs as the connector tool and records it in the audit trail", async () => {
    const { mcpTools } = await import("@/lib/mcp/tools");
    const tool = (n: string) => mcpTools.find((x) => x.name === n)!;
    const auth = { grantId: 0, userId, name: "t", email: "t@example.test", orgId: 1, sv: 1, write: true, role: "admin" as const, apps: ["procurement" as const], seesAll: true, finance: true };
    const ctx = { auth, viewer: { id: userId, seesAll: true }, base: "https://portal.test" };
    expect(tool("push_supplier_stock").allowed({ ...auth, apps: ["sales"] })).toBe(false);
    const res = await tool("push_supplier_stock").call({ messages: [msg({ message_text: `${tag} via tool`, items: [item({ part_number: `${tag}D6`, price: 777 })] })] }, ctx as any);
    expect(res.structuredContent).toMatchObject({ totals: { messages: 1, saved: 1 } });
    const audit = await db.select().from(schema.auditLog).where(D.eq(schema.auditLog.userId, userId));
    expect(audit.some((a: any) => a.action === "claude.push_supplier_stock")).toBe(true);
    const status = await tool("supplier_stock_status").call({ chat: `${tag} Laptop Traders` }, ctx as any);
    expect((status.structuredContent as any).chats[0].chat).toBe(`${tag} Laptop Traders`);
    // a bad price is refused before anything is saved
    await expect(tool("push_supplier_stock").call({ messages: [msg({ items: [item({ price: -5 })] })] }, ctx as any)).rejects.toThrow();
  });

  it("merges a duplicate supplier, but never one with bills", async () => {
    const { mergeSupplier } = await import("@/app/(app)/procurement/suppliers/actions");
    const dup = (await db.insert(schema.suppliers).values({ name: `${tag} Aman Star (old)`, defaultCurrency: "AED" }).returning())[0];
    await db.insert(schema.supplierHandles).values({ supplierId: dup.id, kind: "phone", value: "050 222 3344", valueNorm: "971502223344" });
    const r = await I.ingestMessage(userId, msg({ message_text: `${tag} old record`, items: [item({ part_number: `${tag}E7`, price: 50 })] }), dup);
    expect(r.status).toBe("saved");

    await mergeSupplier(dup.id, supplierId);
    expect(await db.select().from(schema.suppliers).where(D.eq(schema.suppliers.id, dup.id))).toHaveLength(0);
    const [moved] = await db.select().from(schema.priceLists).where(D.eq(schema.priceLists.id, r.priceListId));
    expect(moved.supplierId).toBe(supplierId);
    expect((await I.findSupplier({ sender_name: "", sender_phone: "0502223344" }))?.id).toBe(supplierId);
    expect((await I.findSupplier({ sender_name: `${tag} Aman Star (old)`, sender_phone: "" }))?.id).toBe(supplierId);

    const billed = (await db.insert(schema.suppliers).values({ name: `${tag} Billed` }).returning())[0];
    await db.insert(schema.bills).values({ year: 2099, seq: Date.now() % 1_000_000, number: `${tag}-BILL`, supplierId: billed.id, billDate: "2026-11-01", dueDate: "2026-12-01", category: "cogs", subtotal: 100, total: 105 });
    await expect(mergeSupplier(billed.id, supplierId)).rejects.toThrow(/bills or payments/);
    await expect(mergeSupplier(supplierId, supplierId)).rejects.toThrow(/different supplier/);
  });
});
