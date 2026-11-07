import "server-only";
import { and, asc, desc, eq, gte, isNull, sql, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ownersJson, type Owner } from "@/lib/company-owners";
import { dubaiToday } from "@/lib/dates";
import { ageBucket, AGE_BUCKETS, buildStatement, invoiceState, type AgeBucket, type InvoiceState } from "@/lib/invoicing";
import { paidByInvoice } from "@/lib/orders-data";
import { likeOf, type ListState } from "@/lib/list-params";
import { lineTotal, longDay, round2 } from "@/lib/quotation";
import { getSettings } from "@/lib/settings";
import { companyVisible, dealVisible, quoteVisible, type Viewer } from "@/lib/auth/visibility";

export interface InvoiceRow {
  id: number;
  number: string;
  companyId: number;
  customerName: string;
  orderId: number | null;
  kind: "sale" | "opening";
  dealId: number | null;
  issueDate: string;
  dueDate: string;
  termsDays: number;
  total: number;
  /** Given back by credit notes, with VAT. */
  creditedTotal: number;
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
      dealId: schema.invoices.dealId,
      kind: schema.invoices.kind,
      issueDate: schema.invoices.issueDate,
      dueDate: schema.invoices.dueDate,
      termsDays: schema.invoices.termsDays,
      total: schema.invoices.total,
      creditedTotal: schema.invoices.creditedTotal,
      status: schema.invoices.status,
      ownerName: schema.users.name,
    })
    .from(schema.invoices)
    .leftJoin(schema.deals, eq(schema.deals.id, schema.invoices.dealId))
    .leftJoin(schema.users, eq(schema.users.id, schema.deals.ownerId))
    .where(opts.companyId ? eq(schema.invoices.companyId, opts.companyId) : undefined)
    .orderBy(desc(schema.invoices.issueDate), desc(schema.invoices.id));
  const paid = await paidByInvoice(rows.map((r) => r.id));
  const today = dubaiToday();
  return rows.map((r) => ({ ...r, state: invoiceState(r, paid.get(r.id) ?? 0, today) }));
}

const INVOICE_SORTS: Record<string, string> = { date: '"issueDate"', number: "number", customer: '"customerName"', due: '"dueDate"', total: "total", owed: "owed" };
export const INVOICE_SORT_KEYS = Object.keys(INVOICE_SORTS);
const INVOICE_VIEWS: Record<string, string[]> = { open: ["unpaid", "part", "overdue"], overdue: ["overdue"], paid: ["paid"], cancelled: ["cancelled"] };

/** One page of invoices for the list: filtered and sorted in the database, with how many are in each state. */
export async function invoicePage(view: string, l: ListState): Promise<{ rows: InvoiceRow[]; total: number; counts: Record<string, number> }> {
  const today = dubaiToday();
  const base = sql`
    SELECT i.id, i.number, i.company_id AS "companyId", i.customer_name AS "customerName", i.order_id AS "orderId", i.kind, i.deal_id AS "dealId",
      i.issue_date::text AS "issueDate", i.due_date::text AS "dueDate", i.terms_days AS "termsDays", i.total::float AS total, i.credited_total::float AS "creditedTotal", i.status, u.name AS "ownerName",
      coalesce(p.paid, 0)::float AS paid,
      CASE WHEN i.status = 'cancelled' THEN 0 ELSE greatest(0, i.total - i.credited_total - coalesce(p.paid, 0)) END::float AS owed,
      CASE WHEN i.status = 'cancelled' THEN 'cancelled' WHEN i.total - i.credited_total - coalesce(p.paid, 0) <= 0 THEN 'paid' WHEN i.due_date < ${today} THEN 'overdue' WHEN coalesce(p.paid, 0) > 0 THEN 'part' ELSE 'unpaid' END AS state
    FROM invoices i
    LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM payment_allocations WHERE voided_at IS NULL GROUP BY 1) p ON p.invoice_id = i.id
    LEFT JOIN deals d ON d.id = i.deal_id
    LEFT JOIN users u ON u.id = d.owner_id
    ${l.q ? sql`WHERE (i.number ILIKE ${likeOf(l.q)} OR i.customer_name ILIKE ${likeOf(l.q)} OR i.customer_ref ILIKE ${likeOf(l.q)})` : sql``}`;
  const states = INVOICE_VIEWS[view];
  const where = states ? sql`WHERE x.state IN (${sql.join(states.map((s) => sql`${s}`), sql`, `)})` : sql``;
  const order = sql.raw(`${INVOICE_SORTS[l.sort] ?? '"issueDate"'} ${l.dir === "asc" ? "ASC" : "DESC"}, id DESC`);
  type Raw = Omit<InvoiceRow, "state"> & { paid: number; owed: number; state: string };
  const [page, groups] = await Promise.all([
    db.execute<Raw>(sql`SELECT * FROM (${base}) x ${where} ORDER BY ${order} LIMIT ${l.size} OFFSET ${l.offset}`),
    db.execute<{ state: string; n: number }>(sql`SELECT x.state, count(*)::int AS n FROM (${base}) x GROUP BY 1`),
  ]);
  const by = new Map(groups.rows.map((g) => [g.state, Number(g.n)]));
  const inStates = (list: string[]) => list.reduce((s, k) => s + (by.get(k) ?? 0), 0);
  const all = [...by.values()].reduce((s, n) => s + n, 0);
  const counts = { all, ...Object.fromEntries(Object.entries(INVOICE_VIEWS).map(([k, v]) => [k, inStates(v)])) };
  return {
    rows: page.rows.map((r) => ({ ...r, id: Number(r.id), state: invoiceState(r, r.paid, today) })),
    total: states ? inStates(states) : all,
    counts,
  };
}

/** One document a receipt or voucher paid: how much of it, the total, and what was still open right after. */
export type PaidDocument = {
  id: number;
  number: string;
  amount: number;
  total: number;
  balanceAfter: number;
};

/** The invoice page: invoice, lines, money set against it (also voided or taken off), the credit note if cancelled, and the order. */
export async function getInvoice(id: number) {
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!inv) return null;
  const [items, pays, creditRows, creditItems, [order], [company], author] = await Promise.all([
    db.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, id)).orderBy(asc(schema.invoiceItems.position), asc(schema.invoiceItems.id)),
    db
      .select({
        id: schema.payments.id,
        allocationId: schema.paymentAllocations.id,
        number: schema.payments.number,
        paidOn: schema.payments.paidOn,
        appliedOn: schema.paymentAllocations.appliedOn,
        amount: schema.paymentAllocations.amount,
        receiptTotal: schema.payments.amount,
        method: schema.payments.method,
        reference: schema.payments.reference,
        notes: schema.payments.notes,
        voidedAt: schema.paymentAllocations.voidedAt,
        paymentVoided: schema.payments.voidedAt,
        voidReason: schema.payments.voidReason,
        byName: schema.users.name,
      })
      .from(schema.paymentAllocations)
      .innerJoin(schema.payments, eq(schema.payments.id, schema.paymentAllocations.paymentId))
      .leftJoin(schema.users, eq(schema.users.id, schema.payments.createdBy))
      .where(eq(schema.paymentAllocations.invoiceId, id))
      .orderBy(asc(schema.paymentAllocations.appliedOn), asc(schema.paymentAllocations.id)),
    db.select().from(schema.creditNotes).where(eq(schema.creditNotes.invoiceId, id)).orderBy(schema.creditNotes.id),
    db
      .select({ item: schema.creditNoteItems })
      .from(schema.creditNoteItems)
      .innerJoin(schema.creditNotes, eq(schema.creditNotes.id, schema.creditNoteItems.creditNoteId))
      .where(eq(schema.creditNotes.invoiceId, id))
      .orderBy(schema.creditNoteItems.position, schema.creditNoteItems.id),
    // an opening invoice (carried from Zoho) has no order
    inv.orderId
      ? db
          .select({ id: schema.salesOrders.id, number: schema.salesOrders.number, dnNumber: schema.salesOrders.dnNumber, dealId: schema.salesOrders.dealId })
          .from(schema.salesOrders)
          .where(eq(schema.salesOrders.id, inv.orderId))
      : Promise.resolve([]),
    db.select({ phone: schema.companies.phone }).from(schema.companies).where(eq(schema.companies.id, inv.companyId)),
    inv.createdBy ? db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, inv.createdBy)).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  const paid = round2(pays.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0));
  const noteLines = creditItems.map((c) => c.item);
  const credits = creditRows.map((c) => ({ ...c, items: noteLines.filter((l) => l.creditNoteId === c.id) }));
  // what each line still has to give back
  const lines = items.map((i) => ({ ...i, left: round2(lineTotal(i) - noteLines.filter((l) => l.invoiceItemId === i.id).reduce((s, l) => s + lineTotal(l), 0)) }));
  return { ...inv, items, lines, payments: pays, credits, order, companyPhone: company?.phone ?? "", author, state: invoiceState(inv, paid, dubaiToday()) };
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

/** The invoices a receipt paid. A voided receipt keeps showing what it had paid when it was voided. */
const receiptDocuments = sql<{ id: number; number: string; amount: number }[]>`(
  SELECT coalesce(json_agg(json_build_object('id', i.id, 'number', i.number, 'amount', a.amount::float) ORDER BY a.id), '[]'::json)
  FROM payment_allocations a JOIN invoices i ON i.id = a.invoice_id
  WHERE a.payment_id = payments.id AND (a.voided_at IS NULL OR a.voided_at = payments.voided_at)
)`;

/** Receipts, newest first, with the invoices each paid and what is left of it as an advance. */
const paymentSearch = (q?: string) =>
  q ? or(ilike(schema.payments.number, likeOf(q)), ilike(schema.companies.name, likeOf(q)), ilike(schema.payments.reference, likeOf(q))) : undefined;

export async function listPayments(opts: { limit?: number; offset?: number; companyId?: number; q?: string; sort?: "date" | "amount" | "number" | "customer"; dir?: "asc" | "desc" } = {}) {
  const by = { date: schema.payments.paidOn, amount: schema.payments.amount, number: schema.payments.number, customer: schema.companies.name }[opts.sort ?? "date"];
  const rows = await db
    .select({
      id: schema.payments.id,
      number: schema.payments.number,
      paidOn: schema.payments.paidOn,
      amount: schema.payments.amount,
      method: schema.payments.method,
      reference: schema.payments.reference,
      voidedAt: schema.payments.voidedAt,
      companyId: schema.payments.companyId,
      customerName: schema.companies.name,
      byName: schema.users.name,
      documents: receiptDocuments,
    })
    .from(schema.payments)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.payments.companyId))
    .leftJoin(schema.users, eq(schema.users.id, schema.payments.createdBy))
    .where(and(opts.companyId ? eq(schema.payments.companyId, opts.companyId) : undefined, paymentSearch(opts.q)))
    .orderBy(opts.dir === "asc" ? asc(by) : desc(by), desc(schema.payments.id))
    .limit(opts.limit ?? 500)
    .offset(opts.offset ?? 0);
  return rows.map((r) => ({ ...r, advance: r.voidedAt ? 0 : round2(r.amount - r.documents.reduce((s, d) => s + d.amount, 0)) }));
}

/** How many receipts there are, and what came in (voided ones left out), for the list's heading. */
export async function paymentTotals(q?: string) {
  const [r] = await db
    .select({
      n: sql<number>`count(*)::int`,
      live: sql<number>`count(*) FILTER (WHERE ${schema.payments.voidedAt} IS NULL)::int`,
      cash: sql<number>`coalesce(sum(${schema.payments.amount}) FILTER (WHERE ${schema.payments.voidedAt} IS NULL AND ${schema.payments.method} = 'cash'), 0)::float`,
      bank: sql<number>`coalesce(sum(${schema.payments.amount}) FILTER (WHERE ${schema.payments.voidedAt} IS NULL AND ${schema.payments.method} <> 'cash'), 0)::float`,
    })
    .from(schema.payments)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.payments.companyId))
    .where(paymentSearch(q));
  return r;
}

/** One receipt with what the receipt voucher prints: each invoice it paid, what that invoice still owed right after, and the advance. */
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
      companyId: schema.payments.companyId,
      customerName: schema.companies.name,
      customerTrn: schema.companies.trn,
      byName: schema.users.name,
    })
    .from(schema.payments)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.payments.companyId))
    .leftJoin(schema.users, eq(schema.users.id, schema.payments.createdBy))
    .where(eq(schema.payments.id, id));
  if (!p) return null;
  const docs = await db.execute<PaidDocument>(sql`
    SELECT i.id, i.number, a.amount::float AS amount, i.total::float AS total,
      greatest(0, i.total - i.credited_total - coalesce((SELECT sum(b.amount) FROM payment_allocations b WHERE b.invoice_id = i.id AND b.voided_at IS NULL AND (b.applied_on < a.applied_on OR (b.applied_on = a.applied_on AND b.id <= a.id))), 0))::float AS "balanceAfter"
    FROM payment_allocations a JOIN invoices i ON i.id = a.invoice_id
    JOIN payments p ON p.id = a.payment_id
    WHERE a.payment_id = ${id} AND (a.voided_at IS NULL OR a.voided_at = p.voided_at)
    ORDER BY a.id`);
  const documents = docs.rows;
  return { ...p, documents, advance: p.voidedAt ? 0 : round2(p.amount - documents.reduce((s, d) => s + d.amount, 0)) };
}

/** What is left of a customer's receipts, not yet set against an invoice, oldest first. */
export async function customerAdvances(companyId: number) {
  const res = await db.execute<{ id: number; number: string; paidOn: string; amount: number; left: number }>(sql`
    SELECT * FROM (
      SELECT p.id, p.number, p.paid_on::text AS "paidOn", p.amount::float AS amount,
        (p.amount - coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id = p.id AND a.voided_at IS NULL), 0) - coalesce((SELECT sum(r.amount) FROM advance_refunds r WHERE r.payment_id = p.id AND r.voided_at IS NULL), 0))::float AS "left"
      FROM payments p WHERE p.company_id = ${companyId} AND p.voided_at IS NULL
    ) x WHERE x."left" >= 0.005 ORDER BY x."paidOn", x.id`);
  return res.rows;
}

/** A customer's open invoices, oldest first, for a new receipt or for applying an advance. */
export async function openInvoices(companyId: number) {
  const rows = await listInvoices({ companyId });
  return rows
    .filter((i) => i.state.balance > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)
    .map((i) => ({ id: i.id, number: i.number, issueDate: i.issueDate, dueDate: i.dueDate, total: i.total, balance: i.state.balance, label: i.state.label }));
}

/**
 * Statement of account for one customer between two days: the balance brought forward, then invoices, credit notes and
 * payments in date order with the running balance.
 */
export async function statement(companyId: number, from: string, to: string) {
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId));
  if (!company) return null;
  const [invs, credits, pays, refunds] = await Promise.all([
    db
      .select({ date: schema.invoices.issueDate, number: schema.invoices.number, amount: schema.invoices.total, due: schema.invoices.dueDate, ref: schema.invoices.customerRef })
      .from(schema.invoices)
      // an opening invoice removed by mistake has no credit note to take it back out
      .where(and(eq(schema.invoices.companyId, companyId), sql`NOT (${schema.invoices.kind} = 'opening' AND ${schema.invoices.status} = 'cancelled')`)),
    db
      .select({ date: schema.creditNotes.issueDate, number: schema.creditNotes.number, amount: schema.creditNotes.total, invoice: schema.invoices.number })
      .from(schema.creditNotes)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.creditNotes.invoiceId))
      .where(eq(schema.invoices.companyId, companyId)),
    db
      .select({ date: schema.payments.paidOn, number: schema.payments.number, amount: schema.payments.amount, documents: receiptDocuments, method: schema.payments.method, ref: schema.payments.reference })
      .from(schema.payments)
      .where(and(eq(schema.payments.companyId, companyId), isNull(schema.payments.voidedAt))),
    db
      .select({ date: schema.advanceRefunds.refundedOn, number: schema.advanceRefunds.number, amount: schema.advanceRefunds.amount, of: schema.payments.number })
      .from(schema.advanceRefunds)
      .innerJoin(schema.payments, eq(schema.payments.id, schema.advanceRefunds.paymentId))
      .where(and(eq(schema.payments.companyId, companyId), isNull(schema.advanceRefunds.voidedAt))),
  ]);
  const entries = [
    ...refunds.map((r) => ({ date: r.date, kind: "refund" as const, number: r.number, amount: r.amount, note: `Advance ${r.of} refunded` })),
    ...invs.map((i) => ({ date: i.date, kind: "invoice" as const, number: i.number, amount: i.amount, note: `Due ${longDay(i.due)}${i.ref ? ` · PO ${i.ref}` : ""}` })),
    ...credits.map((c) => ({ date: c.date, kind: "credit" as const, number: c.number, amount: c.amount, note: `For ${c.invoice}` })),
    ...pays.map((p) => ({ date: p.date, kind: "payment" as const, number: p.number, amount: p.amount, note: [p.documents.length ? `For ${p.documents.map((d) => d.number).join(", ")}` : "Advance", p.ref].filter(Boolean).join(" · ") })),
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

export interface CustomerRow {
  id: number;
  name: string;
  emirate: string;
  trn: string;
  industry: string;
  address: string;
  /** Main owner first. */
  owners: Owner[];
  /** The decision maker, else the first contact. */
  contact: { name: string; jobTitle: string; phone: string; email: string } | null;
  contacts: number;
  openDeals: number;
  /** Money received and not yet set against an invoice. */
  advance: number;
  /** Sent quotes still waiting for an answer, and their value before VAT. */
  openQuotes: number;
  openQuotesValue: number;
  orders: number;
  /** Orders not delivered yet. */
  toDeliver: number;
  /** Every order that was not cancelled, with VAT. */
  sales: number;
  lastOrder: string | null;
  /** First won deal or first order. */
  since: string | null;
  invoices: number;
  owed: number;
  overdue: number;
  lastPaid: string | null;
}

/**
 * Customers: companies with a won deal or an order (a company turns into a customer by itself, nothing is copied), with
 * who looks after them, what is going on and what each owes. Only the ones the viewer may see; biggest overdue, then
 * biggest balance first.
 */
export async function listCustomers(v: Viewer): Promise<CustomerRow[]> {
  const today = dubaiToday();
  // counts of deals and quotes only include the ones the viewer may see
  const quoteOk = quoteVisible(v, { dealId: sql`q.deal_id`, ownerId: sql`q.owner_id`, createdBy: sql`q.created_by` });
  const companies = await db.execute<Omit<CustomerRow, "invoices" | "owed" | "overdue" | "lastPaid">>(sql`
    SELECT c.id, c.name, c.emirate, c.trn, c.industry, c.address,
      ${ownersJson(sql`c.id`, sql`c.owner_id`)} AS owners,
      (SELECT json_build_object('name', p.name, 'jobTitle', p.job_title, 'phone', coalesce(nullif(p.phone, ''), p.whatsapp), 'email', p.email)
        FROM contacts p WHERE p.company_id = c.id ORDER BY p.is_decision_maker DESC, p.id LIMIT 1) AS contact,
      (SELECT count(*)::int FROM contacts p WHERE p.company_id = c.id) AS contacts,
      (SELECT count(*)::int FROM deals d WHERE d.company_id = c.id AND d.stage NOT IN ('won', 'lost') AND ${dealVisible(v, sql`d.id`)}) AS "openDeals",
      (SELECT count(*)::int FROM quotes q WHERE q.company_id = c.id AND q.status = 'sent' AND q.valid_until >= ${today} AND ${quoteOk}) AS "openQuotes",
      (SELECT coalesce(sum(q.subtotal), 0)::float FROM quotes q WHERE q.company_id = c.id AND q.status = 'sent' AND q.valid_until >= ${today} AND ${quoteOk}) AS "openQuotesValue",
      (SELECT count(*)::int FROM sales_orders o WHERE o.company_id = c.id AND o.status <> 'cancelled') AS orders,
      (SELECT count(*)::int FROM sales_orders o WHERE o.company_id = c.id AND o.status = 'open') AS "toDeliver",
      (SELECT coalesce(sum(o.total), 0)::float FROM sales_orders o WHERE o.company_id = c.id AND o.status <> 'cancelled') AS sales,
      (SELECT to_char(max(o.created_at) AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') FROM sales_orders o WHERE o.company_id = c.id AND o.status <> 'cancelled') AS "lastOrder",
      (SELECT coalesce(sum(p.amount - coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id = p.id AND a.voided_at IS NULL), 0) - coalesce((SELECT sum(r.amount) FROM advance_refunds r WHERE r.payment_id = p.id AND r.voided_at IS NULL), 0)), 0)::float
        FROM payments p WHERE p.company_id = c.id AND p.voided_at IS NULL) AS advance,
      to_char(least(
        (SELECT min(o.created_at) FROM sales_orders o WHERE o.company_id = c.id),
        (SELECT min(coalesce(d.closed_at, d.created_at)) FROM deals d WHERE d.company_id = c.id AND d.stage = 'won')
      ) AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS since
    FROM companies c
    WHERE (c.is_customer
        OR EXISTS (SELECT 1 FROM sales_orders o WHERE o.company_id = c.id)
        OR EXISTS (SELECT 1 FROM invoices i WHERE i.company_id = c.id)
        OR EXISTS (SELECT 1 FROM deals d WHERE d.company_id = c.id AND d.stage = 'won'))
      AND ${companyVisible(v, sql`c.id`)}`);
  const ids = new Set(companies.rows.map((c) => c.id));
  const [invoices, payments] = await Promise.all([listInvoices(), listPayments({ limit: 5000 })]);
  const byId = new Map<number, CustomerRow>(companies.rows.map((c) => [c.id, { ...c, invoices: 0, owed: 0, overdue: 0, lastPaid: null }]));
  for (const i of invoices) {
    const c = byId.get(i.companyId);
    if (!c || !ids.has(i.companyId)) continue;
    if (i.status !== "cancelled") c.invoices++;
    c.owed = round2(c.owed + i.state.balance);
    if (i.state.key === "overdue") c.overdue = round2(c.overdue + i.state.balance);
  }
  for (const p of payments) {
    const c = byId.get(p.companyId);
    if (c && !p.voidedAt && (!c.lastPaid || p.paidOn > c.lastPaid)) c.lastPaid = p.paidOn;
  }
  return [...byId.values()].sort((a, b) => b.overdue - a.overdue || b.owed - a.owed || a.name.localeCompare(b.name));
}
