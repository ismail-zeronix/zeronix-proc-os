import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { ageBucket, AGE_BUCKETS, type AgeBucket, type InvoiceState } from "@/lib/invoicing";
import { likeOf, type ListState } from "@/lib/list-params";
import { billState, lineCost } from "@/lib/purchases";
import { round2 } from "@/lib/quotation";

export interface BillRow {
  id: number;
  number: string;
  kind: "bill" | "expense" | "opening";
  supplierId: number | null;
  /** The supplier's name, or who was paid when there is no supplier. */
  payee: string;
  supplierRef: string;
  billDate: string;
  dueDate: string;
  termsDays: number;
  category: string;
  orderId: number | null;
  orderNumber: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  /** Taken off by debit notes, before VAT and with VAT. */
  creditedNet: number;
  creditedTotal: number;
  status: string;
  state: InvoiceState;
}

/** Money set against each bill so far (voided or taken off left out). */
async function paidByBill(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const a = schema.supplierPaymentAllocations;
  const rows = await db
    .select({ id: a.billId, paid: sql<number>`coalesce(sum(${a.amount}), 0)::float` })
    .from(a)
    .where(and(inArray(a.billId, ids), isNull(a.voidedAt)))
    .groupBy(a.billId);
  return new Map(rows.map((r) => [r.id, r.paid]));
}

/** Bills and expenses with today's state, newest first. */
export async function listBills(opts: { kinds?: BillRow["kind"][]; supplierId?: number; orderId?: number; invoiceId?: number; from?: string; to?: string; withVoid?: boolean } = {}): Promise<BillRow[]> {
  const where: (SQL | undefined)[] = [
    opts.kinds ? inArray(schema.bills.kind, opts.kinds) : undefined,
    opts.supplierId ? eq(schema.bills.supplierId, opts.supplierId) : undefined,
    opts.orderId ? eq(schema.bills.orderId, opts.orderId) : undefined,
    opts.invoiceId ? eq(schema.bills.invoiceId, opts.invoiceId) : undefined,
    opts.from ? gte(schema.bills.billDate, opts.from) : undefined,
    opts.to ? lte(schema.bills.billDate, opts.to) : undefined,
    opts.withVoid === false ? ne(schema.bills.status, "void") : undefined,
  ];
  const rows = await db
    .select({
      id: schema.bills.id,
      number: schema.bills.number,
      kind: schema.bills.kind,
      supplierId: schema.bills.supplierId,
      supplierName: schema.suppliers.name,
      paidTo: schema.bills.paidTo,
      supplierRef: schema.bills.supplierRef,
      billDate: schema.bills.billDate,
      dueDate: schema.bills.dueDate,
      termsDays: schema.bills.termsDays,
      category: schema.bills.category,
      orderId: schema.bills.orderId,
      orderNumber: schema.salesOrders.number,
      subtotal: schema.bills.subtotal,
      vatAmount: schema.bills.vatAmount,
      total: schema.bills.total,
      creditedNet: schema.bills.creditedNet,
      creditedTotal: schema.bills.creditedTotal,
      status: schema.bills.status,
    })
    .from(schema.bills)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.bills.supplierId))
    .leftJoin(schema.salesOrders, eq(schema.salesOrders.id, schema.bills.orderId))
    .where(and(...where))
    .orderBy(desc(schema.bills.billDate), desc(schema.bills.id));
  const paid = await paidByBill(rows.map((r) => r.id));
  const today = dubaiToday();
  return rows.map(({ supplierName, paidTo, ...r }) => ({ ...r, payee: supplierName ?? paidTo, state: billState(r, paid.get(r.id) ?? 0, today) }));
}

const BILL_SORTS: Record<string, string> = { date: '"billDate"', number: "number", supplier: "payee", due: '"dueDate"', total: "total", owed: "owed" };
export const BILL_SORT_KEYS = Object.keys(BILL_SORTS);
const BILL_VIEWS: Record<string, string[]> = { topay: ["unpaid", "part", "overdue"], overdue: ["overdue"], paid: ["paid"], void: ["void"] };

/** One page of supplier bills for the list: filtered and sorted in the database, with how many are in each state and what is owed. */
export async function billPage(view: string, l: ListState): Promise<{ rows: BillRow[]; total: number; counts: Record<string, number>; owed: number }> {
  const today = dubaiToday();
  const base = sql`
    SELECT b.id, b.number, b.kind, b.supplier_id AS "supplierId", coalesce(s.name, b.paid_to) AS payee, b.supplier_ref AS "supplierRef", b.bill_date::text AS "billDate", b.due_date::text AS "dueDate",
      b.terms_days AS "termsDays", b.category, b.order_id AS "orderId", o.number AS "orderNumber", b.subtotal::float AS subtotal, b.credited_net::float AS "creditedNet", b.credited_total::float AS "creditedTotal", b.vat_amount::float AS "vatAmount", b.total::float AS total, b.status,
      coalesce(p.paid, 0)::float AS paid,
      CASE WHEN b.status = 'void' THEN 0 ELSE greatest(0, b.total - b.credited_total - coalesce(p.paid, 0)) END::float AS owed,
      CASE WHEN b.status = 'void' THEN 'void' WHEN b.total - b.credited_total - coalesce(p.paid, 0) <= 0 THEN 'paid' WHEN b.due_date < ${today} THEN 'overdue' WHEN coalesce(p.paid, 0) > 0 THEN 'part' ELSE 'unpaid' END AS state
    FROM bills b
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN sales_orders o ON o.id = b.order_id
    LEFT JOIN (SELECT bill_id, sum(amount) AS paid FROM supplier_payment_allocations WHERE voided_at IS NULL GROUP BY 1) p ON p.bill_id = b.id
    WHERE b.kind IN ('bill', 'opening')
    ${l.q ? sql`AND (b.number ILIKE ${likeOf(l.q)} OR coalesce(s.name, b.paid_to) ILIKE ${likeOf(l.q)} OR b.supplier_ref ILIKE ${likeOf(l.q)})` : sql``}`;
  const states = BILL_VIEWS[view];
  const where = states ? sql`WHERE x.state IN (${sql.join(states.map((s) => sql`${s}`), sql`, `)})` : sql``;
  const order = sql.raw(`${BILL_SORTS[l.sort] ?? '"billDate"'} ${l.dir === "asc" ? "ASC" : "DESC"}, id DESC`);
  type Raw = Omit<BillRow, "state"> & { paid: number; owed: number; state: string };
  const [page, groups] = await Promise.all([
    db.execute<Raw>(sql`SELECT * FROM (${base}) x ${where} ORDER BY ${order} LIMIT ${l.size} OFFSET ${l.offset}`),
    db.execute<{ state: string; n: number; owed: number }>(sql`SELECT x.state, count(*)::int AS n, coalesce(sum(x.owed), 0)::float AS owed FROM (${base}) x GROUP BY 1`),
  ]);
  const by = new Map(groups.rows.map((g) => [g.state, Number(g.n)]));
  const inStates = (list: string[]) => list.reduce((s, k) => s + (by.get(k) ?? 0), 0);
  const all = [...by.values()].reduce((s, n) => s + n, 0);
  return {
    rows: page.rows.map((r) => ({ ...r, id: Number(r.id), state: billState(r, r.paid, today) })),
    total: states ? inStates(states) : all,
    counts: { all, ...Object.fromEntries(Object.entries(BILL_VIEWS).map(([k, v]) => [k, inStates(v)])) },
    owed: round2(groups.rows.reduce((s, g) => s + Number(g.owed), 0)),
  };
}

/** One bill with its lines, payments, supplier and the customer order it was bought for. */
export async function getBill(id: number) {
  const [b] = await db.select().from(schema.bills).where(eq(schema.bills.id, id));
  if (!b) return null;
  const [items, pays, supplier, order, invoice, author] = await Promise.all([
    db.select().from(schema.billItems).where(eq(schema.billItems.billId, id)).orderBy(asc(schema.billItems.position), asc(schema.billItems.id)),
    db
      .select({
        id: schema.supplierPayments.id,
        allocationId: schema.supplierPaymentAllocations.id,
        number: schema.supplierPayments.number,
        paidOn: schema.supplierPayments.paidOn,
        appliedOn: schema.supplierPaymentAllocations.appliedOn,
        amount: schema.supplierPaymentAllocations.amount,
        voucherTotal: schema.supplierPayments.amount,
        method: schema.supplierPayments.method,
        reference: schema.supplierPayments.reference,
        voidedAt: schema.supplierPaymentAllocations.voidedAt,
        paymentVoided: schema.supplierPayments.voidedAt,
        voidReason: schema.supplierPayments.voidReason,
      })
      .from(schema.supplierPaymentAllocations)
      .innerJoin(schema.supplierPayments, eq(schema.supplierPayments.id, schema.supplierPaymentAllocations.paymentId))
      .where(eq(schema.supplierPaymentAllocations.billId, id))
      .orderBy(desc(schema.supplierPaymentAllocations.appliedOn), desc(schema.supplierPaymentAllocations.id)),
    b.supplierId ? db.select().from(schema.suppliers).where(eq(schema.suppliers.id, b.supplierId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    b.orderId
      ? db
          .select({ id: schema.salesOrders.id, number: schema.salesOrders.number, companyName: schema.companies.name })
          .from(schema.salesOrders)
          .innerJoin(schema.companies, eq(schema.companies.id, schema.salesOrders.companyId))
          .where(eq(schema.salesOrders.id, b.orderId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    b.invoiceId
      ? db
          .select({ id: schema.invoices.id, number: schema.invoices.number, customerName: schema.invoices.customerName })
          .from(schema.invoices)
          .where(eq(schema.invoices.id, b.invoiceId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    b.createdBy ? db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, b.createdBy)).then((r) => r[0]?.name ?? "") : Promise.resolve(""),
  ]);
  const paid = round2(pays.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0));
  const [noteRows, noteItems] = await Promise.all([
    db.select().from(schema.debitNotes).where(eq(schema.debitNotes.billId, id)).orderBy(schema.debitNotes.id),
    db
      .select({ item: schema.debitNoteItems })
      .from(schema.debitNoteItems)
      .innerJoin(schema.debitNotes, eq(schema.debitNotes.id, schema.debitNoteItems.debitNoteId))
      .where(eq(schema.debitNotes.billId, id))
      .orderBy(schema.debitNoteItems.position, schema.debitNoteItems.id),
  ]);
  const noteLines = noteItems.map((n) => n.item);
  const debitNotes = noteRows.map((n) => ({ ...n, items: noteLines.filter((l) => l.debitNoteId === n.id) }));
  const lines = items.map((i) => ({ ...i, left: round2(lineCost(i) - noteLines.filter((l) => l.billItemId === i.id).reduce((s, l) => s + lineCost(l), 0)) }));
  return { ...b, items, lines, payments: pays, debitNotes, supplier, order, invoice, author, payee: supplier?.name ?? b.paidTo, state: billState(b, paid, dubaiToday()) };
}

/** The bills and expenses a voucher paid. A voided voucher keeps showing what it had paid when it was voided. */
const voucherDocuments = sql<{ id: number; number: string; amount: number; kind: string; category: string; supplierRef: string }[]>`(
  SELECT coalesce(json_agg(json_build_object('id', b.id, 'number', b.number, 'amount', a.amount::float, 'kind', b.kind, 'category', b.category, 'supplierRef', b.supplier_ref) ORDER BY a.id), '[]'::json)
  FROM supplier_payment_allocations a JOIN bills b ON b.id = a.bill_id
  WHERE a.payment_id = supplier_payments.id AND (a.voided_at IS NULL OR a.voided_at = supplier_payments.voided_at)
)`;

/** Payments made (vouchers), newest first, with what each paid and what is left of it as an advance. */
const voucherSearch = (q?: string) =>
  q ? or(ilike(schema.supplierPayments.number, likeOf(q)), ilike(sql`coalesce(${schema.suppliers.name}, ${schema.supplierPayments.paidTo})`, likeOf(q)), ilike(schema.supplierPayments.reference, likeOf(q))) : undefined;

export async function listSupplierPayments(opts: { supplierId?: number; from?: string; to?: string; q?: string; limit?: number; offset?: number; sort?: "date" | "amount" | "number"; dir?: "asc" | "desc" } = {}) {
  const by = { date: schema.supplierPayments.paidOn, amount: schema.supplierPayments.amount, number: schema.supplierPayments.number }[opts.sort ?? "date"];
  const rows = await db
    .select({
      id: schema.supplierPayments.id,
      number: schema.supplierPayments.number,
      paidOn: schema.supplierPayments.paidOn,
      amount: schema.supplierPayments.amount,
      method: schema.supplierPayments.method,
      reference: schema.supplierPayments.reference,
      notes: schema.supplierPayments.notes,
      voidedAt: schema.supplierPayments.voidedAt,
      voidReason: schema.supplierPayments.voidReason,
      supplierId: schema.supplierPayments.supplierId,
      payee: sql<string>`coalesce(${schema.suppliers.name}, ${schema.supplierPayments.paidTo})`,
      byName: schema.users.name,
      documents: voucherDocuments,
    })
    .from(schema.supplierPayments)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierPayments.supplierId))
    .leftJoin(schema.users, eq(schema.users.id, schema.supplierPayments.createdBy))
    .where(
      and(
        opts.supplierId ? eq(schema.supplierPayments.supplierId, opts.supplierId) : undefined,
        opts.from ? gte(schema.supplierPayments.paidOn, opts.from) : undefined,
        opts.to ? lte(schema.supplierPayments.paidOn, opts.to) : undefined,
        voucherSearch(opts.q),
      ),
    )
    .orderBy(opts.dir === "asc" ? asc(by) : desc(by), desc(schema.supplierPayments.id))
    .limit(opts.limit ?? 1000)
    .offset(opts.offset ?? 0);
  return rows.map((r) => ({ ...r, isExpense: r.documents.some((d) => d.kind === "expense"), advance: r.voidedAt ? 0 : round2(r.amount - r.documents.reduce((s, d) => s + d.amount, 0)) }));
}

/** How many vouchers there are and what went out this month, for the list's heading. */
export async function voucherTotals(q?: string) {
  const month = dubaiToday().slice(0, 7);
  const [r] = await db
    .select({
      n: sql<number>`count(*)::int`,
      thisMonth: sql<number>`coalesce(sum(${schema.supplierPayments.amount}) FILTER (WHERE ${schema.supplierPayments.voidedAt} IS NULL AND to_char(${schema.supplierPayments.paidOn}, 'YYYY-MM') = ${month}), 0)::float`,
    })
    .from(schema.supplierPayments)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierPayments.supplierId))
    .where(voucherSearch(q));
  return r;
}

/** One voucher with what the payment voucher prints: each bill it paid, what was still to pay right after, and the advance. */
export async function getSupplierPayment(id: number) {
  const [p] = await db
    .select({
      id: schema.supplierPayments.id,
      number: schema.supplierPayments.number,
      paidOn: schema.supplierPayments.paidOn,
      amount: schema.supplierPayments.amount,
      method: schema.supplierPayments.method,
      reference: schema.supplierPayments.reference,
      notes: schema.supplierPayments.notes,
      voidedAt: schema.supplierPayments.voidedAt,
      voidReason: schema.supplierPayments.voidReason,
      supplierId: schema.supplierPayments.supplierId,
      payee: sql<string>`coalesce(${schema.suppliers.name}, ${schema.supplierPayments.paidTo})`,
      payeeTrn: schema.suppliers.trn,
      byName: schema.users.name,
    })
    .from(schema.supplierPayments)
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierPayments.supplierId))
    .leftJoin(schema.users, eq(schema.users.id, schema.supplierPayments.createdBy))
    .where(eq(schema.supplierPayments.id, id));
  if (!p) return null;
  const docs = await db.execute<{ id: number; number: string; amount: number; total: number; balanceAfter: number; category: string; supplierRef: string }>(sql`
    SELECT b.id, b.number, a.amount::float AS amount, b.total::float AS total, b.category, b.supplier_ref AS "supplierRef",
      greatest(0, b.total - b.credited_total - coalesce((SELECT sum(x.amount) FROM supplier_payment_allocations x WHERE x.bill_id = b.id AND x.voided_at IS NULL AND (x.applied_on < a.applied_on OR (x.applied_on = a.applied_on AND x.id <= a.id))), 0))::float AS "balanceAfter"
    FROM supplier_payment_allocations a JOIN bills b ON b.id = a.bill_id
    JOIN supplier_payments p ON p.id = a.payment_id
    WHERE a.payment_id = ${id} AND (a.voided_at IS NULL OR a.voided_at = p.voided_at)
    ORDER BY a.id`);
  const documents = docs.rows;
  return { ...p, documents, advance: p.voidedAt ? 0 : round2(p.amount - documents.reduce((s, d) => s + d.amount, 0)) };
}

/** What is left of a supplier's vouchers, not yet set against a bill, oldest first. */
export async function supplierAdvances(supplierId: number) {
  const res = await db.execute<{ id: number; number: string; paidOn: string; amount: number; left: number }>(sql`
    SELECT * FROM (
      SELECT p.id, p.number, p.paid_on::text AS "paidOn", p.amount::float AS amount,
        (p.amount - coalesce((SELECT sum(a.amount) FROM supplier_payment_allocations a WHERE a.payment_id = p.id AND a.voided_at IS NULL), 0) - coalesce((SELECT sum(r.amount) FROM advance_refunds r WHERE r.supplier_payment_id = p.id AND r.voided_at IS NULL), 0))::float AS "left"
      FROM supplier_payments p WHERE p.supplier_id = ${supplierId} AND p.voided_at IS NULL
    ) x WHERE x."left" >= 0.005 ORDER BY x."paidOn", x.id`);
  return res.rows;
}

/** A supplier's unpaid bills, oldest first, for a new voucher or for applying an advance. */
export async function openBills(supplierId: number) {
  const rows = await listBills({ supplierId, kinds: ["bill", "opening"], withVoid: false });
  return rows
    .filter((b) => b.state.balance > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)
    .map((b) => ({ id: b.id, number: b.number, supplierRef: b.supplierRef, issueDate: b.billDate, dueDate: b.dueDate, total: b.total, balance: b.state.balance, label: b.state.label }));
}

export interface Payables {
  open: BillRow[];
  owed: number;
  overdue: number;
  dueSoon: number;
  paidThisMonth: number;
  buckets: { key: AgeBucket; label: string; amount: number; count: number }[];
}

/** What we owe suppliers today: unpaid bills (most overdue first), totals, and the amounts by how late they are. */
export async function payables(): Promise<Payables> {
  const today = dubaiToday();
  const open = (await listBills({ withVoid: false }))
    .filter((b) => b.state.balance > 0)
    .sort((a, b) => b.state.daysOverdue - a.state.daysOverdue || a.dueDate.localeCompare(b.dueDate));
  const buckets = AGE_BUCKETS.map((b) => ({ ...b, amount: 0, count: 0 }));
  for (const b of open) {
    const x = buckets.find((k) => k.key === ageBucket(b.state.daysOverdue))!;
    x.amount = round2(x.amount + b.state.balance);
    x.count++;
  }
  const [p] = await db
    .select({ s: sql<number>`coalesce(sum(${schema.supplierPayments.amount}), 0)::float` })
    .from(schema.supplierPayments)
    .where(and(isNull(schema.supplierPayments.voidedAt), gte(schema.supplierPayments.paidOn, today.slice(0, 8) + "01")));
  return {
    open,
    owed: round2(open.reduce((s, b) => s + b.state.balance, 0)),
    overdue: round2(open.filter((b) => b.state.key === "overdue").reduce((s, b) => s + b.state.balance, 0)),
    dueSoon: round2(open.filter((b) => b.state.key !== "overdue" && b.state.daysToDue <= 7).reduce((s, b) => s + b.state.balance, 0)),
    paidThisMonth: round2(p.s),
    buckets,
  };
}

export interface SupplierBalance {
  id: number;
  name: string;
  type: string;
  trn: string;
  termsDays: number;
  bills: number;
  owed: number;
  overdue: number;
  lastBill: string | null;
  lastPaid: string | null;
  /** Paid to them and not yet set against a bill. */
  advance: number;
}

/** Every active supplier (or one we have bills from) with what we owe them. Biggest overdue, then biggest balance first. */
export async function supplierBalances(): Promise<SupplierBalance[]> {
  const [suppliers, bills, pays] = await Promise.all([
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name, type: schema.suppliers.type, trn: schema.suppliers.trn, termsDays: schema.suppliers.termsDays, isActive: schema.suppliers.isActive }).from(schema.suppliers),
    listBills({ withVoid: false }),
    listSupplierPayments({ limit: 20000 }),
  ]);
  const byId = new Map<number, SupplierBalance>();
  for (const s of suppliers) byId.set(s.id, { id: s.id, name: s.name, type: s.type, trn: s.trn, termsDays: s.termsDays, bills: 0, owed: 0, overdue: 0, lastBill: null, lastPaid: null, advance: 0 });
  for (const b of bills) {
    const s = b.supplierId ? byId.get(b.supplierId) : undefined;
    if (!s) continue;
    s.bills++;
    s.owed = round2(s.owed + b.state.balance);
    if (b.state.key === "overdue") s.overdue = round2(s.overdue + b.state.balance);
    if (!s.lastBill || b.billDate > s.lastBill) s.lastBill = b.billDate;
  }
  for (const p of pays) {
    const s = p.supplierId ? byId.get(p.supplierId) : undefined;
    if (s && !p.voidedAt && (!s.lastPaid || p.paidOn > s.lastPaid)) s.lastPaid = p.paidOn;
    if (s) s.advance = round2(s.advance + p.advance);
  }
  const active = new Set(suppliers.filter((s) => s.isActive).map((s) => s.id));
  return [...byId.values()]
    .filter((s) => active.has(s.id) || s.bills > 0)
    .sort((a, b) => b.overdue - a.overdue || b.owed - a.owed || (b.lastBill ?? "").localeCompare(a.lastBill ?? "") || a.name.localeCompare(b.name));
}

/** Sidebar badge: supplier bills overdue or due within a week. */
export async function billsDueCount(): Promise<number> {
  const open = (await listBills({ kinds: ["bill", "opening"], withVoid: false })).filter((b) => b.state.balance > 0);
  return open.filter((b) => b.state.key === "overdue" || b.state.daysToDue <= 7).length;
}

/** What a customer order really cost: the bills bought for it (before VAT, voids left out). */
export async function orderCosts(orderId: number) {
  const rows = await listBills({ orderId, withVoid: false });
  return { bills: rows, cost: round2(rows.reduce((s, b) => s + b.subtotal - b.creditedNet, 0)) };
}

/** What a direct invoice (no order) really cost. */
export async function invoiceCosts(invoiceId: number) {
  const rows = await listBills({ invoiceId, withVoid: false });
  return { bills: rows, cost: round2(rows.reduce((s, b) => s + b.subtotal - b.creditedNet, 0)) };
}

/** Suppliers to pick from on a bill or expense (active ones, A to Z). */
export async function supplierOptions() {
  return db
    .select({ id: schema.suppliers.id, name: schema.suppliers.name, termsDays: schema.suppliers.termsDays })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.isActive, true))
    .orderBy(asc(schema.suppliers.name));
}

/** Direct invoices (no order) a bill can be bought for, newest first. */
export async function directInvoiceOptions() {
  return db
    .select({ id: schema.invoices.id, number: schema.invoices.number, companyName: schema.invoices.customerName })
    .from(schema.invoices)
    .where(and(isNull(schema.invoices.orderId), eq(schema.invoices.kind, "sale"), eq(schema.invoices.status, "issued")))
    .orderBy(desc(schema.invoices.issueDate), desc(schema.invoices.id))
    .limit(300);
}

/** Customer orders a bill can be bought for (newest first, cancelled ones left out). */
export async function orderOptions() {
  return db
    .select({ id: schema.salesOrders.id, number: schema.salesOrders.number, companyName: schema.companies.name })
    .from(schema.salesOrders)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.salesOrders.companyId))
    .where(ne(schema.salesOrders.status, "cancelled"))
    .orderBy(desc(schema.salesOrders.createdAt))
    .limit(300);
}
