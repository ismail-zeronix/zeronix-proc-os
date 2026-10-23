import "server-only";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { ageBucket, AGE_BUCKETS, buildStatement, invoiceState, type AgeBucket, type InvoiceState } from "@/lib/invoicing";
import { paidByInvoice } from "@/lib/orders-data";
import { longDay, round2 } from "@/lib/quotation";
import { getSettings } from "@/lib/settings";

export interface InvoiceRow {
  id: number;
  number: string;
  companyId: number;
  customerName: string;
  orderId: number;
  issueDate: string;
  dueDate: string;
  termsDays: number;
  total: number;
  status: string;
  ownerName: string | null;
  state: InvoiceState;
}

/** Every invoice with today's state (paid, part paid, due, overdue, cancelled), newest first. */
export async function listInvoices(opts: { companyId?: number } = {}): Promise<InvoiceRow[]> {
  const rows = await db
    .select({
      id: schema.invoices.id,
      number: schema.invoices.number,
      companyId: schema.invoices.companyId,
      customerName: schema.invoices.customerName,
      orderId: schema.invoices.orderId,
      issueDate: schema.invoices.issueDate,
      dueDate: schema.invoices.dueDate,
      termsDays: schema.invoices.termsDays,
      total: schema.invoices.total,
      status: schema.invoices.status,
      ownerName: schema.users.name,
    })
    .from(schema.invoices)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.invoices.dealId))
    .leftJoin(schema.users, eq(schema.users.id, schema.deals.ownerId))
    .where(opts.companyId ? eq(schema.invoices.companyId, opts.companyId) : undefined)
    .orderBy(desc(schema.invoices.issueDate), desc(schema.invoices.id));
  const paid = await paidByInvoice(rows.map((r) => r.id));
  const today = dubaiToday();
  return rows.map((r) => ({ ...r, state: invoiceState(r, paid.get(r.id) ?? 0, today) }));
}

/** The invoice page: invoice, lines, payments (also voided ones), the credit note if cancelled, and the order. */
export async function getInvoice(id: number) {
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!inv) return null;
  const [items, pays, [credit], [order], [company], author] = await Promise.all([
    db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, id)).orderBy(asc(schema.invoiceItems.position), asc(schema.invoiceItems.id)),
    db
      .select({
        id: schema.payments.id,
        number: schema.payments.number,
        paidOn: schema.payments.paidOn,
        amount: schema.payments.amount,
        method: schema.payments.method,
        reference: schema.payments.reference,
        notes: schema.payments.notes,
        voidedAt: schema.payments.voidedAt,
        voidReason: schema.payments.voidReason,
        byName: schema.users.name,
      })
      .from(schema.payments)
      .leftJoin(schema.users, eq(schema.users.id, schema.payments.createdBy))
      .where(eq(schema.payments.invoiceId, id))
      .orderBy(asc(schema.payments.paidOn), asc(schema.payments.id)),
    db.select().from(schema.creditNotes).where(eq(schema.creditNotes.invoiceId, id)),
    db
      .select({ id: schema.salesOrders.id, number: schema.salesOrders.number, dnNumber: schema.salesOrders.dnNumber, dealId: schema.salesOrders.dealId })
      .from(schema.salesOrders)
      .where(eq(schema.salesOrders.id, inv.orderId)),
    db.select({ phone: schema.companies.phone }).from(schema.companies).where(eq(schema.companies.id, inv.companyId)),
    inv.createdBy ? db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, inv.createdBy)).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  const paid = round2(pays.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0));
  return { ...inv, items, payments: pays, credit: credit ?? null, order, companyPhone: company?.phone ?? "", author, state: invoiceState(inv, paid, dubaiToday()) };
}

export interface Receivables {
  open: InvoiceRow[];
  owed: number;
  overdue: number;
  dueSoon: number;
  collectedThisMonth: number;
  buckets: { key: AgeBucket; label: string; amount: number; count: number }[];
}

/** What customers owe today: open invoices (most overdue first), totals, and the amounts by how late they are. */
export async function receivables(): Promise<Receivables> {
  const today = dubaiToday();
  const all = await listInvoices();
  const open = all
    .filter((i) => i.state.balance > 0)
    .sort((a, b) => b.state.daysOverdue - a.state.daysOverdue || a.dueDate.localeCompare(b.dueDate));
  const buckets = AGE_BUCKETS.map((b) => ({ ...b, amount: 0, count: 0 }));
  for (const i of open) {
    const b = buckets.find((x) => x.key === ageBucket(i.state.daysOverdue))!;
    b.amount = round2(b.amount + i.state.balance);
    b.count++;
  }
  const monthStart = today.slice(0, 8) + "01";
  const [c] = await db
    .select({ s: sql<number>`coalesce(sum(${schema.payments.amount}), 0)::float` })
    .from(schema.payments)
    .where(and(isNull(schema.payments.voidedAt), gte(schema.payments.paidOn, monthStart)));
  return {
    open,
    owed: round2(open.reduce((s, i) => s + i.state.balance, 0)),
    overdue: round2(open.filter((i) => i.state.key === "overdue").reduce((s, i) => s + i.state.balance, 0)),
    dueSoon: round2(open.filter((i) => i.state.key !== "overdue" && i.state.daysToDue <= 7).reduce((s, i) => s + i.state.balance, 0)),
    collectedThisMonth: round2(c.s),
    buckets,
  };
}

/** Receipts, newest first. */
export async function listPayments(limit = 500) {
  return db
    .select({
      id: schema.payments.id,
      number: schema.payments.number,
      paidOn: schema.payments.paidOn,
      amount: schema.payments.amount,
      method: schema.payments.method,
      reference: schema.payments.reference,
      voidedAt: schema.payments.voidedAt,
      invoiceId: schema.payments.invoiceId,
      invoiceNumber: schema.invoices.number,
      companyId: schema.payments.companyId,
      customerName: schema.invoices.customerName,
      byName: schema.users.name,
    })
    .from(schema.payments)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.payments.invoiceId))
    .leftJoin(schema.users, eq(schema.users.id, schema.payments.createdBy))
    .orderBy(desc(schema.payments.paidOn), desc(schema.payments.id))
    .limit(limit);
}

/** One receipt with what the receipt voucher prints. */
export async function getPayment(id: number) {
  const [p] = await db
    .select({
      id: schema.payments.id,
      number: schema.payments.number,
      paidOn: schema.payments.paidOn,
      amount: schema.payments.amount,
      method: schema.payments.method,
      reference: schema.payments.reference,
      notes: schema.payments.notes,
      voidedAt: schema.payments.voidedAt,
      voidReason: schema.payments.voidReason,
      invoiceId: schema.payments.invoiceId,
      invoiceNumber: schema.invoices.number,
      invoiceTotal: schema.invoices.total,
      customerName: schema.invoices.customerName,
      customerTrn: schema.invoices.customerTrn,
      byName: schema.users.name,
    })
    .from(schema.payments)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.payments.invoiceId))
    .leftJoin(schema.users, eq(schema.users.id, schema.payments.createdBy))
    .where(eq(schema.payments.id, id));
  return p ?? null;
}

/**
 * Statement of account for one customer between two days: the balance brought forward, then invoices, credit notes and
 * payments in date order with the running balance.
 */
export async function statement(companyId: number, from: string, to: string) {
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId));
  if (!company) return null;
  const [invs, credits, pays] = await Promise.all([
    db
      .select({ date: schema.invoices.issueDate, number: schema.invoices.number, amount: schema.invoices.total, due: schema.invoices.dueDate, ref: schema.invoices.customerRef })
      .from(schema.invoices)
      .where(eq(schema.invoices.companyId, companyId)),
    db
      .select({ date: schema.creditNotes.issueDate, number: schema.creditNotes.number, amount: schema.creditNotes.total, invoice: schema.invoices.number })
      .from(schema.creditNotes)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.creditNotes.invoiceId))
      .where(eq(schema.invoices.companyId, companyId)),
    db
      .select({ date: schema.payments.paidOn, number: schema.payments.number, amount: schema.payments.amount, invoice: schema.invoices.number, method: schema.payments.method, ref: schema.payments.reference })
      .from(schema.payments)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.payments.invoiceId))
      .where(and(eq(schema.payments.companyId, companyId), isNull(schema.payments.voidedAt))),
  ]);
  const entries = [
    ...invs.map((i) => ({ date: i.date, kind: "invoice" as const, number: i.number, amount: i.amount, note: `Due ${longDay(i.due)}${i.ref ? ` · PO ${i.ref}` : ""}` })),
    ...credits.map((c) => ({ date: c.date, kind: "credit" as const, number: c.number, amount: c.amount, note: `Cancels ${c.invoice}` })),
    ...pays.map((p) => ({ date: p.date, kind: "payment" as const, number: p.number, amount: p.amount, note: `For ${p.invoice}${p.ref ? ` · ${p.ref}` : ""}` })),
  ];
  const before = buildStatement(entries.filter((e) => e.date < from));
  const within = buildStatement(
    entries.filter((e) => e.date >= from && e.date <= to),
    before.closing,
  );
  return { company, from, to, opening: before.closing, lines: within.lines, closing: within.closing };
}

/** Bank details and our TRN, printed on invoices and statements. */
export async function documentDetails() {
  const s = await getSettings();
  return {
    trn: s.quote_trn,
    bank: { name: s.bank_name, accountName: s.bank_account_name, accountNumber: s.bank_account_number, iban: s.bank_iban, swift: s.bank_swift },
  };
}

/** Customers with something owed, for a company page badge: balance and overdue amount. */
export async function companyBalance(companyId: number) {
  const rows = await listInvoices({ companyId });
  const open = rows.filter((r) => r.state.balance > 0);
  return {
    invoices: rows.length,
    owed: round2(open.reduce((s, r) => s + r.state.balance, 0)),
    overdue: round2(open.filter((r) => r.state.key === "overdue").reduce((s, r) => s + r.state.balance, 0)),
  };
}


/** The number the next invoice will get (for the "Make invoice" dialog). */
export async function nextInvoiceNumber(): Promise<string> {
  const s = await getSettings();
  const { invoiceNumber } = await import("@/lib/invoicing");
  return invoiceNumber(s.invoice_prefix, Math.max(1, Math.floor(Number(s.invoice_next_number)) || 1), Math.floor(Number(s.invoice_digits)) || 5);
}

/** Numbers for the Accounts sidebar badges. */
export async function accountsBadges() {
  const [inv, [toInvoice]] = await Promise.all([
    listInvoices(),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.salesOrders).where(eq(schema.salesOrders.status, "delivered")),
  ]);
  return { overdue: inv.filter((i) => i.state.key === "overdue").length, toInvoice: toInvoice.n };
}
