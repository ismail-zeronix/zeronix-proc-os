import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dealVisible, type Viewer } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { invoiceState, type InvoiceState } from "@/lib/invoicing";

/** Money received on each invoice (voided payments do not count). */
export async function paidByInvoice(invoiceIds: number[]): Promise<Map<number, number>> {
  if (!invoiceIds.length) return new Map();
  const rows = await db
    .select({ id: schema.payments.invoiceId, paid: sql<number>`coalesce(sum(${schema.payments.amount}), 0)::float` })
    .from(schema.payments)
    .where(and(inArray(schema.payments.invoiceId, invoiceIds), isNull(schema.payments.voidedAt)))
    .groupBy(schema.payments.invoiceId);
  return new Map(rows.map((r) => [r.id, r.paid]));
}

export interface OrderRow {
  id: number;
  number: string;
  status: string;
  companyId: number;
  companyName: string;
  dealId: number;
  dealTitle: string;
  customerRef: string;
  termsDays: number;
  total: number;
  dnNumber: string | null;
  deliveredOn: string | null;
  createdAt: Date;
  ownerName: string | null;
  invoice: { id: number; number: string; state: InvoiceState } | null;
}

/** Orders on the deals the viewer may see, newest first, with the state of their (active) invoice. */
export async function listOrders(v: Viewer, opts: { companyId?: number; dealId?: number; limit?: number } = {}): Promise<OrderRow[]> {
  const where = [
    dealVisible(v, schema.salesOrders.dealId),
    opts.companyId ? eq(schema.salesOrders.companyId, opts.companyId) : undefined,
    opts.dealId ? eq(schema.salesOrders.dealId, opts.dealId) : undefined,
  ];
  const rows = await db
    .select({
      id: schema.salesOrders.id,
      number: schema.salesOrders.number,
      status: schema.salesOrders.status,
      companyId: schema.salesOrders.companyId,
      companyName: schema.companies.name,
      dealId: schema.salesOrders.dealId,
      dealTitle: schema.deals.title,
      customerRef: schema.salesOrders.customerRef,
      termsDays: schema.salesOrders.termsDays,
      total: schema.salesOrders.total,
      dnNumber: schema.salesOrders.dnNumber,
      deliveredOn: schema.salesOrders.deliveredOn,
      createdAt: schema.salesOrders.createdAt,
      ownerName: schema.users.name,
    })
    .from(schema.salesOrders)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.salesOrders.companyId))
    .innerJoin(schema.deals, eq(schema.deals.id, schema.salesOrders.dealId))
    .leftJoin(schema.users, eq(schema.users.id, schema.deals.ownerId))
    .where(and(...where))
    .orderBy(desc(schema.salesOrders.createdAt))
    .limit(opts.limit ?? 500);
  const invs = rows.length
    ? await db
        .select({ id: schema.invoices.id, orderId: schema.invoices.orderId, number: schema.invoices.number, status: schema.invoices.status, total: schema.invoices.total, dueDate: schema.invoices.dueDate })
        .from(schema.invoices)
        .where(and(inArray(schema.invoices.orderId, rows.map((r) => r.id)), ne(schema.invoices.status, "cancelled")))
    : [];
  const paid = await paidByInvoice(invs.map((i) => i.id));
  const today = dubaiToday();
  return rows.map((r) => {
    const inv = invs.find((i) => i.orderId === r.id);
    return { ...r, invoice: inv ? { id: inv.id, number: inv.number, state: invoiceState(inv, paid.get(inv.id) ?? 0, today) } : null };
  });
}

/** The order page: order, lines, customer, contact, the quote it came from, its invoices (active and cancelled). Null when hidden from the viewer. */
export async function getOrder(id: number, v: Viewer) {
  const [o] = await db
    .select()
    .from(schema.salesOrders)
    .where(and(eq(schema.salesOrders.id, id), dealVisible(v, schema.salesOrders.dealId)));
  if (!o) return null;
  const [items, [company], contact, [quote], [deal], invs, author] = await Promise.all([
    db.select().from(schema.salesOrderItems).where(eq(schema.salesOrderItems.orderId, id)).orderBy(asc(schema.salesOrderItems.position), asc(schema.salesOrderItems.id)),
    db.select().from(schema.companies).where(eq(schema.companies.id, o.companyId)),
    o.contactId ? db.select().from(schema.contacts).where(eq(schema.contacts.id, o.contactId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    db.select({ id: schema.quotes.id, number: schema.quotes.number }).from(schema.quotes).where(eq(schema.quotes.id, o.quoteId)),
    db.select({ id: schema.deals.id, title: schema.deals.title, ownerId: schema.deals.ownerId }).from(schema.deals).where(eq(schema.deals.id, o.dealId)),
    db.select().from(schema.invoices).where(eq(schema.invoices.orderId, id)).orderBy(desc(schema.invoices.createdAt)),
    o.createdBy
      ? db
          .select({ name: schema.users.name, email: schema.users.email, jobTitle: schema.users.jobTitle, phone: schema.users.phone, mobile: schema.users.mobile })
          .from(schema.users)
          .where(eq(schema.users.id, o.createdBy))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const paid = await paidByInvoice(invs.map((i) => i.id));
  const today = dubaiToday();
  return {
    ...o,
    items,
    company,
    contact,
    quote,
    deal,
    author,
    invoices: invs.map((i) => ({ ...i, state: invoiceState(i, paid.get(i.id) ?? 0, today) })),
  };
}

/** The order made from a quote, if any (for the quote page button). */
export async function orderOfQuote(quoteId: number) {
  const [o] = await db.select({ id: schema.salesOrders.id, number: schema.salesOrders.number, status: schema.salesOrders.status }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, quoteId));
  return o ?? null;
}
