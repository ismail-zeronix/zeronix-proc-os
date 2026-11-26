import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { siteDb, siteSchema } from "@/db/site";
import { DELIVERY_DEFAULTS, deliveryFee, orderNumber, orderTotals, STORE_DEFAULTS, type CheckoutInput, type OrderLine, type OrderStatus, type SiteAddress, type StoreSettings } from "./store-core";
import { nomodCheckoutBody, returnUrl } from "./nomod-core";
import { createCheckout, getCheckout, NomodError, nomodConfigured } from "./nomod";
import { loginCodeEmail, MAIL_STATUSES, orderPlacedEmail, orderStatusEmail, staffOrderEmail, type MailOrder, type MailStatus } from "./store-email-core";
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
  // online payment is only offered while Nomod is connected (NOMOD_API_KEY)
  const payments = s.payments.filter((p) => p !== "card" || nomodConfigured());
  return { payments: payments.length ? payments : ["request" as const], bankDetails: s.bankDetails, deliveryNote: s.deliveryNote, delivery: s.delivery, signIn: Boolean(s.mailUserId) };
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
  await sendStoreMail(store, { to: email, ...loginCodeEmail(code, siteUrl()) });
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
export async function placeOrder(
  input: CheckoutInput,
  customerId: number | null,
  site: string,
): Promise<{ number: string; total: string; payment: CheckoutInput["payment"]; token?: string; payUrl?: string; payError?: string }> {
  const store = await getStore();
  if (!store.payments.includes(input.payment) || (input.payment === "card" && !nomodConfigured())) throw new StoreProblem("That way of paying is not offered. Please pick another.");
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
  if (input.payment === "card") {
    // emails go out once Nomod confirms the payment (markPaid); an unpaid order waits in Website › Orders
    const token = payToken(order.number);
    try {
      const { url } = await openCheckout(order.id);
      return { number: order.number, total: totals.total, payment: "card", token, payUrl: url };
    } catch (e) {
      console.error(`[store] ${order.number}: could not open the online payment:`, (e as Error).message);
      return { number: order.number, total: totals.total, payment: "card", token, payError: "We saved your order but could not open the payment page." };
    }
  }
  const placed: MailOrder = { ...input, number: order.number, email: input.email.toLowerCase(), items: lines, deliveryFee: fee, ...totals };
  void orderEmails(store, placed).catch((e) => console.error("[store] order emails failed:", (e as Error).message));
  return { number: order.number, total: totals.total, payment: input.payment };
}

// ---------- online payment (Nomod Hosted Checkout, nomod.ts) ----------

const siteUrl = () => process.env.SITE_PUBLIC_URL || "https://zeronixtech.com";

/** Proves a return or "try again" link was made by us for this order, so order numbers cannot be walked through. */
export function payToken(number: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return createHmac("sha256", `${secret}:site-pay`).update(number).digest("base64url").slice(0, 24);
}

function tokenOk(number: string, token: string): boolean {
  const a = Buffer.from(payToken(number));
  const b = Buffer.from(String(token ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function orderByNumber(number: string, token: string) {
  if (!/^WEB-\d{5,}$/.test(number) || !tokenOk(number, token)) throw new StoreProblem("This payment link is not valid.", 404);
  const [o] = await siteDb.select().from(S.siteOrders).where(eq(S.siteOrders.number, number));
  if (!o || o.payment !== "card") throw new StoreProblem("This payment link is not valid.", 404);
  return o;
}

/** A new Hosted Checkout for the order's full total; the latest one is kept on the order. */
async function openCheckout(orderId: number): Promise<{ url: string }> {
  const [o] = await siteDb.select().from(S.siteOrders).where(eq(S.siteOrders.id, orderId));
  const token = payToken(o.number);
  const body = nomodCheckoutBody(
    { number: o.number, name: o.name, email: o.email, phone: o.phone, company: o.company, items: o.items, deliveryFee: o.deliveryFee, total: o.total },
    { success: returnUrl(siteUrl(), o.number, token, "success"), failure: returnUrl(siteUrl(), o.number, token, "failure"), cancelled: returnUrl(siteUrl(), o.number, token, "cancelled") },
    o.site,
  );
  const checkout = await createCheckout(body, siteUrl());
  await siteDb.update(S.siteOrders).set({ paymentRef: checkout.id, updatedAt: new Date() }).where(eq(S.siteOrders.id, o.id));
  return { url: checkout.url };
}

export type PayState = "paid" | "pending" | "failed" | "closed";

/**
 * Asks Nomod about the order's latest checkout and records a payment. The return page and the worker both call it;
 * the redirect alone never marks an order paid. "closed" = cancelled by us, nothing more to pay.
 */
async function refreshPayment(o: typeof S.siteOrders.$inferSelect): Promise<PayState> {
  if (o.paidAt) return "paid";
  if (o.status === "cancelled") return "closed";
  if (!o.paymentRef) return "failed";
  const c = await getCheckout(o.paymentRef);
  if (c.status === "paid") {
    if (Number.isFinite(c.amount) && Math.abs(c.amount - Number(o.total)) > 0.01) {
      console.error(`[store] ${o.number}: Nomod says paid AED ${c.amount}, the order is AED ${o.total}. Not marked paid.`);
      const note = `Nomod reports AED ${c.amount} paid against a total of AED ${o.total}. Check the payment in Nomod.`;
      if (o.syncNote !== note) await siteDb.update(S.siteOrders).set({ syncNote: note, updatedAt: new Date() }).where(eq(S.siteOrders.id, o.id));
      return "pending";
    }
    await markPaid(o.id);
    return "paid";
  }
  return c.status === "created" ? "pending" : "failed";
}

/** Records the payment once (two callers at the same moment send one email), moves the order to Paid, sends the emails. */
async function markPaid(id: number) {
  const [o] = await siteDb
    .update(S.siteOrders)
    .set({ paidAt: new Date(), status: sql`case when ${S.siteOrders.status} in ('new', 'confirmed') then 'paid' else ${S.siteOrders.status} end`, updatedAt: new Date() })
    .where(and(eq(S.siteOrders.id, id), isNull(S.siteOrders.paidAt)))
    .returning();
  if (!o) return;
  const store = await getStore();
  void orderEmails(store, mailOrder(o)).catch((e) => console.error("[store] order emails failed:", (e as Error).message));
}

/** The return page: where the payment stands now. */
export async function paymentStatus(number: string, token: string): Promise<{ number: string; total: string; state: PayState }> {
  const o = await orderByNumber(number, token);
  const state = await refreshPayment(o).catch((e) => {
    if (e instanceof NomodError) return "pending" as const; // Nomod unreachable: ask again later rather than say it failed
    throw e;
  });
  return { number: o.number, total: o.total, state };
}

/** "Try again": a fresh checkout for an order that is not paid yet. */
export async function retryPayment(number: string, token: string): Promise<{ state: PayState; payUrl?: string }> {
  const o = await orderByNumber(number, token);
  const state = await refreshPayment(o).catch(() => "failed" as const);
  if (state === "paid" || state === "closed") return { state };
  try {
    return { state: "pending", payUrl: (await openCheckout(o.id)).url };
  } catch (e) {
    console.error(`[store] ${o.number}: could not open the online payment:`, (e as Error).message);
    throw new StoreProblem("The payment page could not be opened. Please try again in a moment, or call us.", 502);
  }
}

/** The worker, every 5 minutes: card orders of the last 3 days whose customer paid but never came back to the site. */
export async function syncOnlinePayments(): Promise<string[]> {
  if (!nomodConfigured()) return [];
  const open = await siteDb
    .select()
    .from(S.siteOrders)
    .where(and(eq(S.siteOrders.payment, "card"), isNull(S.siteOrders.paidAt), ne(S.siteOrders.paymentRef, ""), ne(S.siteOrders.status, "cancelled"), gt(S.siteOrders.createdAt, new Date(Date.now() - 3 * 86400_000))))
    .limit(50);
  const paid: string[] = [];
  for (const o of open) {
    const state = await refreshPayment(o).catch((e: Error) => {
      console.error(`[store] ${o.number}: payment check failed:`, e.message);
      return "pending" as const;
    });
    if (state === "paid") paid.push(o.number);
  }
  return paid;
}


/** A site_orders row in the shape the email templates take. */
const mailOrder = (o: typeof S.siteOrders.$inferSelect): MailOrder => ({ ...o, address: o.address as SiteAddress, tracking: o.tracking });

/** The customer's confirmation and the team's notice (branded HTML + plain text, store-email-core.ts). */
async function orderEmails(store: StoreSettings, o: MailOrder) {
  if (!store.mailUserId) return;
  await sendStoreMail(store, { to: o.email, ...orderPlacedEmail(o, store, siteUrl()) });
  if (store.notifyEmail) await sendStoreMail(store, { to: store.notifyEmail, ...staffOrderEmail(o, siteUrl()) });
}

/**
 * Tells the customer their order moved on (confirmed, paid, shipped / ready to collect, delivered, cancelled). Called
 * when the team changes the status in Website › Orders and when the Sales sync marks it paid or delivered. Never
 * throws: a mail problem must not undo the status change.
 */
export async function sendStatusEmail(id: number, status: string) {
  if (!MAIL_STATUSES.includes(status)) return;
  try {
    const store = await getStore();
    if (!store.mailUserId) return;
    const [o] = await siteDb.select().from(S.siteOrders).where(eq(S.siteOrders.id, id));
    if (!o || !o.email) return;
    await sendStoreMail(store, { to: o.email, ...orderStatusEmail(mailOrder(o), status as MailStatus, store, siteUrl()) });
  } catch (e) {
    console.error(`[store] status email for order ${id} failed:`, (e as Error).message);
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
  const [before] = await siteDb.select({ status: S.siteOrders.status }).from(S.siteOrders).where(eq(S.siteOrders.id, id));
  await siteDb
    .update(S.siteOrders)
    .set({ status, ...(internalNote === undefined ? {} : { internalNote }), updatedAt: new Date() })
    .where(eq(S.siteOrders.id, id));
  // the customer hears about a real change only (saving a note on the same status sends nothing)
  if (before && before.status !== status) void sendStatusEmail(id, status);
}

