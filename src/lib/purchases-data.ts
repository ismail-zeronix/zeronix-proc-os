import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { ageBucket, AGE_BUCKETS, type AgeBucket, type InvoiceState } from "@/lib/invoicing";
import { billState } from "@/lib/purchases";
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
  status: string;
  state: InvoiceState;
}

/** Money paid on each bill so far (voided payments left out). */
async function paidByBill(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: schema.supplierPayments.billId, paid: sql<number>`coalesce(sum(${schema.supplierPayments.amount}), 0)::float` })
    .from(schema.supplierPayments)
    .where(and(inArray(schema.supplierPayments.billId, ids), isNull(schema.supplierPayments.voidedAt)))
    .groupBy(schema.supplierPayments.billId);
  return new Map(rows.map((r) => [r.id, r.paid]));
}

/** Bills and expenses with today's state, newest first. */
export async function listBills(opts: { kinds?: BillRow["kind"][]; supplierId?: number; orderId?: number; from?: string; to?: string; withVoid?: boolean } = {}): Promise<BillRow[]> {
  const where: (SQL | undefined)[] = [
    opts.kinds ? inArray(schema.bills.kind, opts.kinds) : undefined,
    opts.supplierId ? eq(schema.bills.supplierId, opts.supplierId) : undefined,
    opts.orderId ? eq(schema.bills.orderId, opts.orderId) : undefined,
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

/** One bill with its lines, payments, supplier and the customer order it was bought for. */
export async function getBill(id: number) {
  const [b] = await db.select().from(schema.bills).where(eq(schema.bills.id, id));
  if (!b) return null;
  const [items, pays, supplier, order, author] = await Promise.all([
    db.select().from(schema.billItems).where(eq(schema.billItems.billId, id)).orderBy(asc(schema.billItems.position), asc(schema.billItems.id)),
    listSupplierPayments({ billId: id }),
    b.supplierId ? db.select().from(schema.suppliers).where(eq(schema.suppliers.id, b.supplierId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    b.orderId
      ? db
          .select({ id: schema.salesOrders.id, number: schema.salesOrders.number, companyName: schema.companies.name })
          .from(schema.salesOrders)
          .innerJoin(schema.companies, eq(schema.companies.id, schema.salesOrders.companyId))
          .where(eq(schema.salesOrders.id, b.orderId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    b.createdBy ? db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, b.createdBy)).then((r) => r[0]?.name ?? "") : Promise.resolve(""),
  ]);
  const paid = round2(pays.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0));
  return { ...b, items, payments: pays, supplier, order, author, payee: supplier?.name ?? b.paidTo, state: billState(b, paid, dubaiToday()) };
}

/** Payments made (vouchers), newest first. */
export async function listSupplierPayments(opts: { billId?: number; supplierId?: number; from?: string; to?: string; limit?: number } = {}) {
  return db
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
      billId: schema.supplierPayments.billId,
      billNumber: schema.bills.number,
      billKind: schema.bills.kind,
      supplierRef: schema.bills.supplierRef,
      category: schema.bills.category,
      supplierId: schema.supplierPayments.supplierId,
      payee: sql<string>`coalesce(${schema.suppliers.name}, ${schema.bills.paidTo})`,
      byName: schema.users.name,
    })
    .from(schema.supplierPayments)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.supplierPayments.billId))
    .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierPayments.supplierId))
    .leftJoin(schema.users, eq(schema.users.id, schema.supplierPayments.createdBy))
    .where(
      and(
        opts.billId ? eq(schema.supplierPayments.billId, opts.billId) : undefined,
        opts.supplierId ? eq(schema.supplierPayments.supplierId, opts.supplierId) : undefined,
        opts.from ? gte(schema.supplierPayments.paidOn, opts.from) : undefined,
        opts.to ? lte(schema.supplierPayments.paidOn, opts.to) : undefined,
      ),
    )
    .orderBy(desc(schema.supplierPayments.paidOn), desc(schema.supplierPayments.id))
    .limit(opts.limit ?? 1000);
}

/** One voucher with what the payment voucher prints. */
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
        billId: schema.bills.id,
        billNumber: schema.bills.number,
        billTotal: schema.bills.total,
        supplierRef: schema.bills.supplierRef,
        category: schema.bills.category,
        payee: sql<string>`coalesce(${schema.suppliers.name}, ${schema.bills.paidTo})`,
        payeeTrn: schema.suppliers.trn,
        byName: schema.users.name,
      })
      .from(schema.supplierPayments)
      .innerJoin(schema.bills, eq(schema.bills.id, schema.supplierPayments.billId))
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierPayments.supplierId))
      .leftJoin(schema.users, eq(schema.users.id, schema.supplierPayments.createdBy))
      .where(eq(schema.supplierPayments.id, id));
  return p ?? null;
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
}

/** Every active supplier (or one we have bills from) with what we owe them. Biggest overdue, then biggest balance first. */
export async function supplierBalances(): Promise<SupplierBalance[]> {
  const [suppliers, bills, pays] = await Promise.all([
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name, type: schema.suppliers.type, trn: schema.suppliers.trn, termsDays: schema.suppliers.termsDays, isActive: schema.suppliers.isActive }).from(schema.suppliers),
    listBills({ withVoid: false }),
    listSupplierPayments({ limit: 20000 }),
  ]);
  const byId = new Map<number, SupplierBalance>();
  for (const s of suppliers) byId.set(s.id, { id: s.id, name: s.name, type: s.type, trn: s.trn, termsDays: s.termsDays, bills: 0, owed: 0, overdue: 0, lastBill: null, lastPaid: null });
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
  return { bills: rows, cost: round2(rows.reduce((s, b) => s + b.subtotal, 0)) };
}

/** Suppliers to pick from on a bill or expense (active ones, A to Z). */
export async function supplierOptions() {
  return db
    .select({ id: schema.suppliers.id, name: schema.suppliers.name, termsDays: schema.suppliers.termsDays })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.isActive, true))
    .orderBy(asc(schema.suppliers.name));
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
