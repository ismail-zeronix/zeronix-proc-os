import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { CATEGORIES, CONDITIONS, type OfferDraft } from "@/lib/offer-draft";
import { normalizeBrand, normalizeCurrency, normalizeName, normalizePartNumber, normalizePhone, normalizeStorage } from "@/lib/parse/clean";
import { attachMatches } from "@/lib/products";
import { insertOffers } from "./offers";

/**
 * Supplier stock that Claude read from WhatsApp (Claude in Chrome) and pushed through the connector. Nothing here reads
 * free text: Claude sends one line per product, and these rules only clean it, find the supplier, spot repeats and match
 * products. Clear lines are saved at once; unclear lines and unknown senders wait in the Procurement Inbox.
 */

const text = (max: number) => z.string().trim().max(max).default("");

export const pushedItemSchema = z.object({
  category: text(30).describe(`One of: ${CATEGORIES.join(", ")}`),
  brand: text(40),
  model: text(120).describe("Model name without the brand, e.g. 'Latitude 5450'"),
  part_number: text(60).describe("Manufacturer part number / SKU when given, e.g. '15-FD0130WM'"),
  cpu: text(60),
  ram_gb: z.number().int().min(0).max(4096).nullable().default(null),
  storage: text(60),
  display: text(60),
  gpu: text(60),
  os: text(40),
  extras: text(200).describe("Anything else that tells configurations apart (keyboard layout, colour, warranty)"),
  condition: text(20).describe(`One of: ${CONDITIONS.join(", ")}; default new`),
  price: z.number().positive().max(100_000_000).nullable().default(null).describe("Unit price as written; null when the message gives none. Never guess."),
  currency: text(5).describe("AED, USD...; empty = the supplier's usual currency"),
  stock_note: text(120).describe("Stock words as written: 'ready stock', '10 pcs', 'ETA 2 weeks', 'on order'"),
  line: text(1000).describe("The original text of this product in the message"),
});
export type PushedItem = z.output<typeof pushedItemSchema>;

export const pushedMessageSchema = z.object({
  chat: text(120).describe("WhatsApp group name, or the contact name for a personal chat"),
  sender_name: text(120).describe("Sender as WhatsApp shows it (contact name or number)"),
  sender_phone: text(40).describe("Sender's phone number when it is visible, with country code"),
  message_time: z.string().trim().min(8).max(40).describe("When the message was sent, ISO 8601 with UAE offset, e.g. 2026-11-24T10:32:00+04:00"),
  message_text: z.string().trim().min(1).max(20_000).describe("The whole message, as written"),
  price_basis: text(40).describe("What the prices are quoted on when the message says so: 'ex-VAT', 'FOB JA'"),
  items: z.array(pushedItemSchema).max(300),
});
export type PushedMessage = z.output<typeof pushedMessageSchema>;

export type IntakeStatus = "saved" | "needs_check" | "repeat" | "unknown_sender" | "no_items";

export interface IntakeResult {
  chat: string;
  sender: string;
  status: IntakeStatus;
  supplier?: string;
  /** Lines saved as offers now. */
  saved: number;
  /** Of those, products that were not in Procurement before. */
  newProducts: number;
  /** Of those, a price different from this supplier's last price for the product. */
  priceChanges: number;
  /** Lines waiting in the Inbox. */
  needCheck: number;
  priceListId?: number;
  inboxId?: number;
}

/** Same message = same words, whatever the spacing or emphasis WhatsApp added. */
export function fingerprint(messageText: string): string {
  const norm = messageText
    .toLowerCase()
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha1").update(norm).digest("hex");
}

export function messageTime(s: string, now = new Date()): Date {
  const d = new Date(s);
  // a time in the future (wrong clock or a guess) counts as now
  return Number.isNaN(d.getTime()) ? now : d > now ? now : d;
}

/** A pushed line as a draft offer: written one standard way (lib/parse/clean.ts). */
export function toDraft(it: PushedItem, i: number, opts: { currency: string; basis: string }): OfferDraft {
  const brand = normalizeBrand(it.brand);
  const partNumber = normalizePartNumber(it.part_number);
  let modelName = it.model.replace(/\s+/g, " ").trim();
  if (brand && modelName.toLowerCase().startsWith(brand.toLowerCase() + " ")) modelName = modelName.slice(brand.length + 1);
  if (partNumber && partNumber.length >= 4 && modelName.toUpperCase().includes(partNumber)) {
    modelName = modelName.replace(new RegExp(partNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[- ]?"), "i"), "").replace(/\s*[-–]\s*$/, "").trim();
  }
  const cat = it.category.toLowerCase();
  const cond = it.condition.toLowerCase().replace(/\s+/g, "-");
  const flags: string[] = [];
  if (!brand) flags.push("Brand missing");
  if (!partNumber && !modelName) flags.push("Model missing");
  return {
    key: `w${i}`,
    category: ((CATEGORIES as readonly string[]).includes(cat) ? cat : "other") as OfferDraft["category"],
    brand,
    modelName,
    partNumber,
    cpu: it.cpu,
    ramGb: it.ram_gb,
    storage: normalizeStorage(it.storage),
    display: it.display,
    gpu: it.gpu,
    os: it.os,
    extras: it.extras,
    condition: ((CONDITIONS as readonly string[]).includes(cond) ? cond : "new") as OfferDraft["condition"],
    price: it.price,
    currency: normalizeCurrency(it.currency) || opts.currency || "AED",
    priceBasis: opts.basis,
    stockNote: it.stock_note,
    rawText: it.line,
    confidence: flags.length ? 0.5 : 1,
    flags,
    productId: null,
    productLabel: "",
    suggestedProductId: null,
    suggestedLabel: "",
    include: true,
  };
}

/**
 * A different part number is a different product: a look-alike found by fuzzy search (FM0013DX vs FM0047NR) is no reason
 * to ask. Only a line without its own part number is worth an "Is this the same as …?".
 */
export const dropSkuLookalike = (d: OfferDraft): OfferDraft => (d.partNumber.length >= 4 && d.suggestedProductId !== null ? { ...d, suggestedProductId: null, suggestedLabel: "" } : d);

/**
 * A line we should not file on our own: it cannot be identified (no brand, or no model and no part number), or it looks
 * like an existing product without matching it for sure ("Is this the same as …?").
 */
export const isUnclear = (d: OfferDraft) => d.flags.length > 0 || (!d.productId && d.suggestedProductId !== null);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Conn = typeof db | Tx;
type Supplier = { id: number; name: string; defaultCurrency: string };

const supplierCols = { id: schema.suppliers.id, name: schema.suppliers.name, defaultCurrency: schema.suppliers.defaultCurrency };

/** Who sent it: their phone number first, then the name WhatsApp shows, then a supplier of exactly that name. */
export async function findSupplier(m: { sender_name: string; sender_phone: string }, conn: Conn = db): Promise<Supplier | null> {
  const phone = normalizePhone(m.sender_phone) || (/^[+\d\s()-]{7,}$/.test(m.sender_name) ? normalizePhone(m.sender_name) : "");
  const name = normalizeName(m.sender_name);
  const byHandle = async (kind: "phone" | "name", value: string) =>
    value
      ? (
          await conn
            .select(supplierCols)
            .from(schema.supplierHandles)
            .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierHandles.supplierId))
            .where(and(eq(schema.supplierHandles.kind, kind), eq(schema.supplierHandles.valueNorm, value)))
            .limit(1)
        )[0]
      : undefined;
  const found = (await byHandle("phone", phone)) ?? (await byHandle("name", name));
  if (found) return found;
  if (!m.sender_name.trim()) return null;
  const [exact] = await conn
    .select(supplierCols)
    .from(schema.suppliers)
    .where(sql`lower(${schema.suppliers.name}) = lower(${m.sender_name.trim()})`)
    .limit(1);
  return exact ?? null;
}

/** Remembers how this supplier shows up in WhatsApp; a number or name already taken by another supplier is left alone. */
export async function learnHandles(supplierId: number, m: { sender_name: string; sender_phone: string }, conn: Conn = db) {
  const rows: (typeof schema.supplierHandles.$inferInsert)[] = [];
  const phone = normalizePhone(m.sender_phone) || (/^[+\d\s()-]{7,}$/.test(m.sender_name) ? normalizePhone(m.sender_name) : "");
  if (phone) rows.push({ supplierId, kind: "phone", value: m.sender_phone || m.sender_name, valueNorm: phone });
  const name = normalizeName(m.sender_name);
  // a bare number is a phone, not a name
  if (name && !/^\d+$/.test(name)) rows.push({ supplierId, kind: "name", value: m.sender_name.trim(), valueNorm: name });
  if (rows.length) await conn.insert(schema.supplierHandles).values(rows).onConflictDoNothing();
}

/** Each pushed message in turn; one failing message does not stop the others. */
export async function ingestMessages(userId: number, messages: PushedMessage[]): Promise<IntakeResult[]> {
  const out: IntakeResult[] = [];
  for (const m of messages) out.push(await ingestMessage(userId, m));
  return out;
}

export async function ingestMessage(userId: number, m: PushedMessage, supplierOverride?: Supplier): Promise<IntakeResult> {
  const base = { chat: m.chat, sender: m.sender_name || m.sender_phone, saved: 0, newProducts: 0, priceChanges: 0, needCheck: 0 };
  const at = messageTime(m.message_time);
  const supplier = supplierOverride ?? (await findSupplier(m));

  if (!supplier) {
    // already waiting from the same sender? then do not file it twice
    const [same] = await db
      .select({ id: schema.stockInbox.id })
      .from(schema.stockInbox)
      .where(and(eq(schema.stockInbox.messageText, m.message_text), eq(schema.stockInbox.senderName, m.sender_name), eq(schema.stockInbox.senderPhone, m.sender_phone)))
      .limit(1);
    const id =
      same?.id ??
      (
        await db
          .insert(schema.stockInbox)
          .values({ chat: m.chat, senderName: m.sender_name, senderPhone: m.sender_phone, messageAt: at, messageText: m.message_text, items: m.items, priceBasis: m.price_basis, createdBy: userId })
          .returning({ id: schema.stockInbox.id })
      )[0].id;
    return { ...base, status: "unknown_sender", needCheck: m.items.length, inboxId: id };
  }

  await learnHandles(supplier.id, m);
  const print = fingerprint(m.message_text);
  const [seen] = await db
    .select({ id: schema.priceLists.id, receivedAt: schema.priceLists.receivedAt })
    .from(schema.priceLists)
    .where(and(eq(schema.priceLists.supplierId, supplier.id), eq(schema.priceLists.fingerprint, print)))
    .limit(1);
  if (seen) {
    await bumpRepeat(seen, at);
    return { ...base, status: "repeat", supplier: supplier.name, priceListId: seen.id };
  }
  if (!m.items.length) return { ...base, status: "no_items", supplier: supplier.name };

  const drafts = (await attachMatches(m.items.map((it, i) => toDraft(it, i, { currency: supplier.defaultCurrency, basis: m.price_basis })))).map(dropSkuLookalike);
  const clear = drafts.filter((d) => !isUnclear(d));
  const unclear = drafts.filter(isUnclear);
  const knownBefore = new Set(clear.map((d) => d.productId).filter((id): id is number => id !== null));

  const result = await db.transaction(async (tx) => {
    const [pl] = await tx
      .insert(schema.priceLists)
      .values({
        supplierId: supplier.id,
        rawText: m.message_text,
        source: "whatsapp",
        sourceName: m.chat,
        chat: m.chat,
        sender: m.sender_name || m.sender_phone,
        fingerprint: print,
        receivedAt: at,
        lastSeenAt: new Date(),
        status: unclear.length ? "review" : "saved",
        // a list that waits keeps only the lines still to check; the others are offers already
        drafts: unclear.length ? unclear : clear,
        model: "Claude (WhatsApp)",
        progressDone: drafts.length,
        progressTotal: drafts.length,
        createdBy: userId,
        savedAt: unclear.length ? null : new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: schema.priceLists.id });
    // the same message pushed twice at the same moment: the other push filed it
    if (!pl) return null;
    const lastPrices = await lastPriceBySupplier(tx, supplier.id, [...knownBefore]);
    const ids = await insertOffers(tx, { priceListId: pl.id, supplierId: supplier.id, supplierName: supplier.name, receivedAt: at }, clear);
    let priceChanges = 0;
    clear.forEach((d, i) => {
      const before = lastPrices.get(ids[i]);
      if (before != null && d.price != null && before !== d.price) priceChanges++;
    });
    const newProducts = new Set(ids.filter((id) => !knownBefore.has(id))).size;
    return { id: pl.id, priceChanges, newProducts };
  });
  if (!result) return { ...base, status: "repeat", supplier: supplier.name };
  return {
    ...base,
    status: unclear.length ? "needs_check" : "saved",
    supplier: supplier.name,
    saved: clear.length,
    newProducts: result.newProducts,
    priceChanges: result.priceChanges,
    needCheck: unclear.length,
    priceListId: result.id,
  };
}

/** This supplier's latest price for each product, before this message. */
async function lastPriceBySupplier(tx: Tx, supplierId: number, productIds: number[]): Promise<Map<number, number | null>> {
  if (!productIds.length) return new Map();
  const rows = await tx
    .selectDistinctOn([schema.offers.productId], { productId: schema.offers.productId, price: schema.offers.price })
    .from(schema.offers)
    .where(and(eq(schema.offers.supplierId, supplierId), inArray(schema.offers.productId, productIds)))
    .orderBy(schema.offers.productId, desc(schema.offers.receivedAt), desc(schema.offers.id));
  return new Map(rows.map((r) => [r.productId, r.price]));
}

/**
 * The same broadcast again: nothing new is saved, but its prices count as given again on that day, so they stay fresh
 * (and they are this supplier's latest again when an older message comes back).
 */
async function bumpRepeat(list: { id: number; receivedAt: Date }, at: Date) {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.priceLists)
      .set({ seenCount: sql`${schema.priceLists.seenCount} + 1`, lastSeenAt: new Date(), ...(at > list.receivedAt ? { receivedAt: at } : {}) })
      .where(eq(schema.priceLists.id, list.id));
    if (at > list.receivedAt) await tx.update(schema.offers).set({ receivedAt: at }).where(eq(schema.offers.priceListId, list.id));
  });
}

/** For Claude before it reads: when each chat was last pushed, so only newer messages need reading; plus who we know. */
export async function stockStatus(chat?: string) {
  const chatFilter = chat?.trim() ? sql`AND lower(pl.chat) = lower(${chat.trim()})` : sql``;
  const chats = await db.execute<{ chat: string; last_message_at: string; messages: number; suppliers: string }>(sql`
    SELECT pl.chat, max(pl.received_at) AS last_message_at, count(*)::int AS messages,
      string_agg(DISTINCT s.name, ', ') AS suppliers
    FROM price_lists pl JOIN suppliers s ON s.id = pl.supplier_id
    WHERE pl.source = 'whatsapp' AND pl.chat <> '' ${chatFilter}
    GROUP BY pl.chat ORDER BY max(pl.received_at) DESC LIMIT 100`);
  const inboxFilter = chat?.trim() ? sql`WHERE lower(chat) = lower(${chat.trim()})` : sql``;
  const waiting = await db.execute<{ chat: string; last_message_at: string; messages: number }>(sql`
    SELECT chat, max(message_at) AS last_message_at, count(*)::int AS messages FROM stock_inbox ${inboxFilter} GROUP BY chat`);
  const handles = await db
    .select({ supplier: schema.suppliers.name, kind: schema.supplierHandles.kind, value: schema.supplierHandles.value })
    .from(schema.supplierHandles)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierHandles.supplierId))
    .orderBy(schema.suppliers.name)
    .limit(500);
  const known = new Map<string, { supplier: string; phones: string[]; names: string[] }>();
  for (const h of handles) {
    const k = known.get(h.supplier) ?? { supplier: h.supplier, phones: [], names: [] };
    (h.kind === "phone" ? k.phones : k.names).push(h.value);
    known.set(h.supplier, k);
  }
  return {
    chats: chats.rows.map((r) => ({ chat: r.chat, lastMessageAt: new Date(r.last_message_at).toISOString(), messages: r.messages, suppliers: r.suppliers })),
    waitingInInbox: waiting.rows.map((r) => ({ chat: r.chat, lastMessageAt: new Date(r.last_message_at).toISOString(), messages: r.messages })),
    knownSenders: [...known.values()],
  };
}

/** What waits for a person: unknown senders and lists with lines to check (also Excel uploads not saved yet). */
export async function inboxCount(): Promise<number> {
  const res = await db.execute<{ n: number }>(sql`
    SELECT (SELECT count(*) FROM stock_inbox) + (SELECT count(*) FROM price_lists WHERE status = 'review') AS n`);
  return Number(res.rows[0]?.n ?? 0);
}
