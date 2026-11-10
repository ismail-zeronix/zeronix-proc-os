import "server-only";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { siteDb, siteSchema } from "@/db/site";
import { allowedApps } from "@/lib/apps";
import { audit } from "@/lib/audit";
import { dubaiToday } from "@/lib/dates";
import { addDays, totals } from "@/lib/quotation";
import { normName, trnProblem } from "@/lib/sales";
import { duplicateCompany } from "@/lib/sales-data";
import { UserError } from "@/lib/user-error";
import { convertQuoteToOrder } from "@/app/(app)/sales/order-actions";
import { saveQuote } from "@/app/(app)/sales/quote-actions";
import { getStore } from "./store";
import { salesLinesForWebOrder, VAT_RATE } from "./store-core";

/**
 * A web order into Sales (Website › Orders › Create sales order). The portal's rule is that every Sales order comes from
 * a quote, so this takes the same road a salesperson does: an instant quote (no deal) for the customer, then the order
 * from it, with the web order number as the customer reference. From there it is the normal order-to-cash flow
 * (delivery note, tax invoice, payment), and syncFromSales() (web-sales-sync.ts) brings Delivered and Paid back.
 */

const O = siteSchema.siteOrders;
const totalOf = (lines: { qty: number; unitPrice: number }[]) => totals(lines, VAT_RATE * 100).total;

async function webOrder(id: number) {
  const [o] = await siteDb.select().from(O).where(eq(O.id, id));
  if (!o) throw new UserError("That web order no longer exists.");
  return o;
}

/** Active people who may own a quote (Sales or Accounts), for the dialog and Settings › Store. */
export async function salesPeople(): Promise<{ id: number; name: string }[]> {
  const people = await db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, apps: schema.users.apps }).from(schema.users).where(eq(schema.users.isActive, true));
  return people.filter((u) => allowedApps(u).some((a) => a === "sales" || a === "accounts")).map((u) => ({ id: u.id, name: u.name }));
}

/** What the dialog needs: customers that look like this buyer, the salespeople, and the lines as Sales will see them. */
export async function salesOrderDraft(orderId: number) {
  const o = await webOrder(orderId);
  const name = o.company || o.name;
  const byEmail = o.email
    ? await db.select({ companyId: schema.contacts.companyId }).from(schema.contacts).where(ilike(schema.contacts.email, o.email))
    : [];
  const ids = [...new Set(byEmail.map((r) => r.companyId))];
  const companies = await db
    .select({ id: schema.companies.id, name: schema.companies.name, trn: schema.companies.trn, emirate: schema.companies.emirate, nameNorm: schema.companies.nameNorm })
    .from(schema.companies)
    .where(or(ids.length ? inArray(schema.companies.id, ids) : undefined, o.trn ? eq(schema.companies.trn, o.trn) : undefined, eq(schema.companies.nameNorm, normName(name))))
    .limit(6);
  const matches = companies.map((c) => ({
    id: c.id,
    name: c.name,
    trn: c.trn,
    emirate: c.emirate,
    why: ids.includes(c.id) ? "same email" : o.trn && c.trn === o.trn ? "same TRN" : "same name",
  }));
  const [owners, store] = await Promise.all([salesPeople(), getStore()]);
  const preview = salesLinesForWebOrder(o.items, o.deliveryFee, o.total, totalOf);
  return {
    matches,
    owners,
    ownerId: owners.some((u) => u.id === store.webOrderOwnerId) ? store.webOrderOwnerId : null,
    newCustomer: {
      name,
      trn: o.trn,
      emirate: o.address.emirate,
      address: o.delivery === "delivery" ? [o.address.street, o.address.area, o.address.emirate].filter(Boolean).join(", ") : "",
      phone: o.phone,
    },
    // cash, card on delivery or a transfer before delivery: due at once; a company on credit gets its terms in the dialog
    termsDays: 0,
    preview,
  };
}

export interface WebToSalesInput {
  /** An existing customer, or null with `newCustomer` filled in. */
  companyId: number | null;
  newCustomer?: { name: string; trn: string; emirate: string; address: string; phone: string };
  ownerId: number;
  termsDays: number;
}

/** A contact for the buyer at the customer, unless one with that email is there already (so the next order matches). */
async function ensureContact(companyId: number, o: { name: string; email: string; phone: string }) {
  const [c] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.companyId, companyId), o.email ? ilike(schema.contacts.email, o.email) : eq(schema.contacts.name, o.name)));
  if (c) return c.id;
  const [row] = await db.insert(schema.contacts).values({ companyId, name: o.name, email: o.email, phone: o.phone }).returning({ id: schema.contacts.id });
  return row.id;
}

/** Makes the customer (when new), the instant quote and the Sales order, then links the web order to it. */
export async function createSalesOrderFromWeb(orderId: number, input: WebToSalesInput, userId: number): Promise<{ id: number; number: string }> {
  const o = await webOrder(orderId);
  if (o.salesOrderId) {
    // a new Sales order only replaces one that was cancelled
    const [so] = await db.select({ status: schema.salesOrders.status }).from(schema.salesOrders).where(eq(schema.salesOrders.id, o.salesOrderId));
    if (so && so.status !== "cancelled") throw new UserError(`This web order is already Sales order ${o.salesOrderNumber}.`);
  }
  if (o.status === "cancelled") throw new UserError("This web order was cancelled.");

  let companyId = input.companyId;
  if (!companyId) {
    const c = input.newCustomer;
    if (!c || c.name.trim().length < 2) throw new UserError("Enter the customer name.");
    const trn = c.trn.replace(/\s/g, "");
    const bad = trnProblem(trn);
    if (bad) throw new UserError(bad);
    const dup = await duplicateCompany(c.name);
    if (dup) throw new UserError(`"${dup.name}" is already a customer. Pick it from the list instead of adding it twice.`);
    const values = { name: c.name.trim(), trn, emirate: c.emirate.trim(), address: c.address.trim(), phone: c.phone.trim(), source: "Website" };
    const [row] = await db
      .insert(schema.companies)
      .values({ ...values, nameNorm: normName(values.name), isCustomer: true, ownerId: input.ownerId })
      .returning({ id: schema.companies.id });
    companyId = row.id;
    await audit(db, { userId, action: "customer.create", entity: "company", entityId: row.id, summary: `Customer ${values.name} added from web order ${o.number}`, after: values });
  } else {
    await db.update(schema.companies).set({ isCustomer: true }).where(eq(schema.companies.id, companyId));
  }
  const contactId = await ensureContact(companyId, o);

  const { lines, diff } = salesLinesForWebOrder(o.items, o.deliveryFee, o.total, totalOf);
  const ref = `Web order ${o.number}`;
  // a quote left behind by an earlier try that failed at the order step is used again instead of making a second one
  const [left] = await db
    .select({ id: schema.quotes.id })
    .from(schema.quotes)
    .where(and(eq(schema.quotes.companyId, companyId), eq(schema.quotes.notes, ref), inArray(schema.quotes.status, ["draft", "sent"]), sql`not exists (select 1 from sales_orders so where so.quote_id = ${schema.quotes.id} and so.status <> 'cancelled')`));
  const quote = await saveQuote(left?.id ?? null, {
    companyId,
    contactId,
    ownerId: input.ownerId,
    validUntil: addDays(dubaiToday(), 7),
    termsDays: input.termsDays,
    vatPct: VAT_RATE * 100,
    lines: lines.map((l) => ({ description: l.description, qty: l.qty, unitPriceAed: l.unitPriceAed, supplierName: "" })),
    notes: ref,
  });
  const address = o.delivery === "pickup" ? "Collect from our office" : [o.address.street, o.address.area, o.address.emirate].filter(Boolean).join(", ");
  const order = await convertQuoteToOrder(quote.id, {
    customerRef: o.number,
    termsDays: input.termsDays,
    deliveryAddress: address,
    notes: [`${ref}, paid by ${o.payment === "cod" ? "cash or card on delivery" : o.payment === "bank" ? "bank transfer" : "order request (payment link or invoice)"}.`, o.notes && `Customer note: ${o.notes}`, diff ? `Rounding: the Sales total is AED ${(-diff).toFixed(2)} off the web total.` : ""].filter(Boolean).join("\n"),
  });
  await siteDb
    .update(O)
    .set({ salesOrderId: order.id, salesOrderNumber: order.number, syncNote: "", status: o.status === "new" ? "confirmed" : o.status, updatedAt: new Date() })
    .where(eq(O.id, orderId));
  return order;
}
