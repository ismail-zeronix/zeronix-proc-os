import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { siteDb, siteSchema } from "@/db/site";
import { DELIVERY_DEFAULTS, deliveryFee, orderNumber, orderTotals, STORE_DEFAULTS, type CheckoutInput, type OrderLine, type OrderStatus, type SiteAddress, type StoreSettings } from "./store-core";
import { sendStoreMail } from "./store-mail";

/**
 * The shop (S.3): store settings, orders priced from the database, customers who sign in with an email code, and the
 * token the site keeps in its cookie. Only the Website app and /api/site/* use this.
 */

const S = siteSchema;

// ---------- settings ----------

export async function getStore(): Promise<StoreSettings> {
  const [row] = await siteDb.select().from(S.siteSettings).where(eq(S.siteSettings.key, "store"));
  const saved = (row?.value as Partial<StoreSettings> | undefined) ?? {};
  return { ...STORE_DEFAULTS, ...saved, delivery: { ...DELIVERY_DEFAULTS, ...saved.delivery } };
}

export async function saveStore(value: StoreSettings, userId: number) {
  const v = value as unknown as Record<string, unknown>;
  await siteDb
    .insert(S.siteSettings)
    .values({ key: "store", value: v, updatedBy: userId })
    .onConflictDoUpdate({ target: S.siteSettings.key, set: { value: v, updatedBy: userId, updatedAt: new Date() } });
}

/** What the site may show: payment options, bank details, the delivery note and charges (never the mailbox). */
export async function publicStore() {
  const s = await getStore();
  return { payments: s.payments, bankDetails: s.bankDetails, deliveryNote: s.deliveryNote, delivery: s.delivery, signIn: Boolean(s.mailUserId) };
}

// ---------- customer tokens (the site's cookie) ----------

const AUDIENCE = "zeronixtech-customer";

function tokenKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return createHash("sha256").update(`${secret}:site-customer`).digest();
}

export async function customerToken(id: number, email: string): Promise<string> {
  return new SignJWT({ email }).setProtectedHeader({ alg: "HS256" }).setSubject(String(id)).setAudience(AUDIENCE).setIssuedAt().setExpirationTime("30d").sign(tokenKey());
}

/** The customer id in a token the site passed on (x-customer-token), or null. */
export async function customerFromToken(token: string | null): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, tokenKey(), { audience: AUDIENCE });
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

// ---------- sign-in codes ----------

const codeHash = (email: string, code: string) => createHash("sha256").update(`${email}:${code}:${process.env.AUTH_SECRET ?? ""}`).digest("hex");

export class StoreProblem extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Emails a 6-digit code. At most 3 codes an email in 15 minutes. */
export async function sendLoginCode(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const store = await getStore();
  if (!store.mailUserId) throw new StoreProblem("Signing in is not available yet. You can still check out as a guest.", 503);
  const [{ n }] = await siteDb
    .select({ n: sql<number>`count(*)::int` })
    .from(S.siteLoginCodes)
    .where(and(eq(S.siteLoginCodes.email, email), gt(S.siteLoginCodes.createdAt, new Date(Date.now() - 15 * 60_000))));
  if (n >= 3) throw new StoreProblem("We sent several codes already. Please use the latest one, or try again in 15 minutes.", 429);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await siteDb.insert(S.siteLoginCodes).values({ email, codeHash: codeHash(email, code), expiresAt: new Date(Date.now() + 10 * 60_000) });
  await sendStoreMail(store, {
    to: email,
    subject: `${code} is your Zeronix Tech sign-in code`,
    text: `Your sign-in code is ${code}\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.`,
  });
}

/** Checks the newest unused code (5 tries); on success the customer exists and a token is returned. */
export async function verifyLoginCode(rawEmail: string, code: string): Promise<{ token: string; customerId: number }> {
  const email = rawEmail.trim().toLowerCase();
  const [row] = await siteDb
    .select()
    .from(S.siteLoginCodes)
    .where(and(eq(S.siteLoginCodes.email, email), isNull(S.siteLoginCodes.usedAt), gt(S.siteLoginCodes.expiresAt, new Date())))
    .orderBy(desc(S.siteLoginCodes.createdAt))
    .limit(1);
  if (!row || row.tries >= 5) throw new StoreProblem("That code has expired. Ask for a new one.");
  const ok = timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(codeHash(email, code.trim())));
  if (!ok) {
    await siteDb.update(S.siteLoginCodes).set({ tries: row.tries + 1 }).where(eq(S.siteLoginCodes.id, row.id));
    throw new StoreProblem(row.tries + 1 >= 5 ? "Too many wrong tries. Ask for a new code." : "That code is not right. Check the email and try again.");
  }
  await siteDb.update(S.siteLoginCodes).set({ usedAt: new Date() }).where(eq(S.siteLoginCodes.id, row.id));
  const [customer] = await siteDb
    .insert(S.siteCustomers)
    .values({ email, lastLoginAt: new Date() })
    .onConflictDoUpdate({ target: S.siteCustomers.email, set: { lastLoginAt: new Date() } })
    .returning({ id: S.siteCustomers.id });
  return { token: await customerToken(customer.id, email), customerId: customer.id };
}

// ---------- customers ----------

export async function getCustomer(id: number) {
  const [c] = await siteDb.select().from(S.siteCustomers).where(eq(S.siteCustomers.id, id));
  return c ?? null;
}

export async function updateCustomer(id: number, v: { name: string; phone: string; company: string; trn: string; address: SiteAddress }) {
  await siteDb.update(S.siteCustomers).set(v).where(eq(S.siteCustomers.id, id));
}

export async function customerOrders(customerId: number) {
  return siteDb
    .select({ number: S.siteOrders.number, status: S.siteOrders.status, total: S.siteOrders.total, items: S.siteOrders.items, payment: S.siteOrders.payment, createdAt: S.siteOrders.createdAt })
    .from(S.siteOrders)
    .where(eq(S.siteOrders.customerId, customerId))
    .orderBy(desc(S.siteOrders.createdAt))
    .limit(50);
}

// ---------- orders ----------

/**
 * Prices the cart from the database: only published products sold online ("Show the price"). A product that changed
 * or is no longer sold online is reported back instead of being ordered at a stale price.
 */
export async function priceCart(items: { slug: string; qty: number }[]): Promise<{ lines: OrderLine[]; problems: string[] }> {
  const slugs = [...new Set(items.map((i) => i.slug))];
  const rows = slugs.length
    ? await siteDb
        .select({ id: S.siteProducts.id, slug: S.siteProducts.slug, name: S.siteProducts.name, mpn: S.siteProducts.mpn, status: S.siteProducts.status, priceMode: S.siteProducts.priceMode, listPrice: S.siteProducts.listPrice })
        .from(S.siteProducts)
        .where(inArray(S.siteProducts.slug, slugs))
    : [];
  const lines: OrderLine[] = [];
  const problems: string[] = [];
  for (const item of items) {
    const p = rows.find((r) => r.slug === item.slug);
    if (!p || p.status !== "published") problems.push(`${item.slug} is no longer available`);
    else if (p.priceMode !== "public" || !p.listPrice) problems.push(`${p.name} is sold on quote only`);
    else {
      const same = lines.find((l) => l.productId === p.id);
      if (same) same.qty = Math.min(100, same.qty + item.qty);
      else lines.push({ productId: p.id, slug: p.slug, name: p.name, mpn: p.mpn, qty: item.qty, unitPrice: p.listPrice });
    }
  }
  return { lines, problems };
}

/** Places an order (prices from the database), then emails the customer and the store. Emails failing never lose an order. */
export async function placeOrder(input: CheckoutInput, customerId: number | null, site: string): Promise<{ number: string; total: string; payment: CheckoutInput["payment"] }> {
  const store = await getStore();
  if (!store.payments.includes(input.payment)) throw new StoreProblem("That way of paying is not offered. Please pick another.");
  const { lines, problems } = await priceCart(input.items);
  if (problems.length) throw new StoreProblem(`Please update your cart: ${problems.join("; ")}.`, 409);
  // the delivery charge is worked out here from the store settings, never taken from the browser
  const fee = deliveryFee(store.delivery, orderTotals(lines).total, input.delivery, input.address.emirate);
  const totals = orderTotals([...lines, { qty: 1, unitPrice: fee }]);
  const order = await siteDb.transaction(async (tx) => {
    const [row] = await tx
      .insert(S.siteOrders)
      .values({
        number: `tmp-${Date.now()}-${randomInt(0, 1e6)}`,
        customerId,
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone,
        company: input.company,
        trn: input.trn.replace(/\s/g, ""),
        delivery: input.delivery,
        address: input.delivery === "delivery" ? input.address : { emirate: "", area: "", street: "" },
        payment: input.payment,
        items: lines,
        deliveryFee: fee,
        ...totals,
        notes: input.notes,
        site,
      })
      .returning({ id: S.siteOrders.id });
    const number = orderNumber(row.id);
    await tx.update(S.siteOrders).set({ number }).where(eq(S.siteOrders.id, row.id));
    return { id: row.id, number };
  });
  if (customerId) {
    // the profile fills in from the first order, so the next checkout is quicker
    await siteDb
      .update(S.siteCustomers)
      .set({ name: sql`coalesce(nullif(${S.siteCustomers.name}, ''), ${input.name})`, phone: sql`coalesce(nullif(${S.siteCustomers.phone}, ''), ${input.phone})` })
      .where(eq(S.siteCustomers.id, customerId));
  }
  void orderEmails(store, order.number, input, lines, fee, totals).catch((e) => console.error("[store] order emails failed:", (e as Error).message));
  return { number: order.number, total: totals.total, payment: input.payment };
}

const aed = (v: string) => `AED ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function orderEmails(store: StoreSettings, number: string, input: CheckoutInput, lines: OrderLine[], fee: string, totals: { subtotal: string; vat: string; total: string }) {
  if (!store.mailUserId) return;
  const items = [
    ...lines.map((l) => `${l.qty} × ${l.name} (${l.mpn}): ${aed((Number(l.unitPrice) * l.qty).toFixed(2))}`),
    ...(input.delivery === "delivery" ? [`Delivery: ${Number(fee) ? aed(fee) : "Free"}`] : []),
  ].join("\n");
  const where = input.delivery === "pickup" ? "Collect from our office" : `${input.address.street}, ${input.address.area}, ${input.address.emirate}`;
  const sums = `Total before VAT: ${aed(totals.subtotal)}\nVAT 5%: ${aed(totals.vat)}\nTotal: ${aed(totals.total)}`;
  const pay = input.payment === "bank" && store.bankDetails ? `\n\nPlease pay by bank transfer, with ${number} as the reference:\n${store.bankDetails}` : input.payment === "cod" ? "\n\nYou pay on delivery, by cash or card." : "\n\nWe will confirm your order and send you a payment link or invoice.";
  await sendStoreMail(store, {
    to: input.email,
    subject: `Your Zeronix Tech order ${number}`,
    text: `Hello ${input.name},\n\nThank you for your order ${number}.\n\n${items}\n\n${sums}\n\nDelivery: ${where}${pay}\n\n${store.deliveryNote}\n\nReply to this email if anything needs changing.`,
  });
  if (store.notifyEmail) {
    await sendStoreMail(store, {
      to: store.notifyEmail,
      subject: `New web order ${number}: ${aed(totals.total)}`,
      text: `${input.name}${input.company ? `, ${input.company}` : ""}\n${input.email} · ${input.phone}\n\n${items}\n\n${sums}\n\nDelivery: ${where}\nPayment: ${input.payment}\n${input.notes ? `\nNotes: ${input.notes}\n` : ""}\nOpen Website › Orders in ZeronixOS.`,
    });
  }
}

// ---------- Website › Orders ----------

export async function orderCounts(): Promise<Record<string, number>> {
  const rows = await siteDb.select({ status: S.siteOrders.status, n: sql<number>`count(*)::int` }).from(S.siteOrders).groupBy(S.siteOrders.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export const listOrders = (status: OrderStatus, page = 1, pageSize = 50) =>
  siteDb
    .select()
    .from(S.siteOrders)
    .where(eq(S.siteOrders.status, status))
    .orderBy(desc(S.siteOrders.createdAt), desc(S.siteOrders.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

export async function setOrderStatus(id: number, status: OrderStatus, internalNote?: string) {
  await siteDb
    .update(S.siteOrders)
    .set({ status, ...(internalNote === undefined ? {} : { internalNote }), updatedAt: new Date() })
    .where(eq(S.siteOrders.id, id));
}

