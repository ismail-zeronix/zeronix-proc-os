"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { nextSeq } from "@/lib/doc-numbers";
import { checkPaymentAmount, dueDateFor, yearNumber } from "@/lib/invoicing";
import { billState, billTotals, categoryLabel, isCategory } from "@/lib/purchases";
import { money, round2 } from "@/lib/quotation";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");
const id = z.number().int().positive();

function refresh(ids: { billId?: number; supplierId?: number | null; orderId?: number | null; dealId?: number | null }) {
  revalidatePath("/accounts", "layout");
  if (ids.billId) revalidatePath(`/accounts/bills/${ids.billId}`);
  if (ids.supplierId) revalidatePath(`/accounts/suppliers/${ids.supplierId}`);
  if (ids.orderId) revalidatePath(`/accounts/orders/${ids.orderId}`);
  if (ids.dealId) revalidatePath(`/crm/deals/${ids.dealId}`);
}

const lineSchema = z.object({
  description: z.string().trim().min(1, "Describe each line").max(500),
  qty: z.number().positive("Quantity must be above zero").max(1e7),
  unitCost: z.number().min(0, "Cost cannot be below zero").max(1e10),
});

const billSchema = z.object({
  kind: z.enum(["bill", "opening"]).default("bill"),
  supplierId: id,
  supplierRef: z.string().trim().max(60).default(""),
  billDate: day,
  termsDays: z.number().int().min(0).max(365),
  category: z.string().refine(isCategory, "Pick a category"),
  orderId: id.nullable().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line").max(200),
  vatPct: z.number().min(0).max(100).default(5),
  /** Only when the supplier's invoice shows a different VAT amount (rounding). */
  vatAmount: z.number().min(0).max(1e10).nullable().optional(),
  notes: z.string().trim().max(1000).default(""),
});
export type BillInput = z.input<typeof billSchema>;

/** Next bill number and the bill row in one go, inside the transaction that saves it (no gaps, safe at the same moment). */
async function insertBill(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  v: Omit<typeof schema.bills.$inferInsert, "year" | "seq" | "number">,
  lines: z.infer<typeof lineSchema>[],
) {
  const year = Number(v.billDate.slice(0, 4));
  const seq = await nextSeq(tx, "bill", schema.bills, schema.bills.year, schema.bills.seq, year);
  const number = yearNumber("ZBL", year, seq);
  const [b] = await tx.insert(schema.bills).values({ ...v, year, seq, number }).returning({ id: schema.bills.id });
  await tx.insert(schema.billItems).values(lines.map((l, i) => ({ billId: b.id, position: i, description: l.description, qty: l.qty, unitCost: round2(l.unitCost) })));
  return { id: b.id, number };
}

async function orderLink(orderId: number | null | undefined) {
  if (!orderId) return null;
  const [o] = await db.select({ id: schema.salesOrders.id, number: schema.salesOrders.number, dealId: schema.salesOrders.dealId, companyId: schema.salesOrders.companyId }).from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId));
  if (!o) throw new Error("That customer order no longer exists.");
  return o;
}

/**
 * Records a supplier's invoice to pay later (or, `opening`, one still unpaid from before the portal). Linked to a customer
 * order, its cost counts against that order's profit and shows on the deal timeline.
 */
export async function createBill(input: BillInput) {
  const me = await assertFinance();
  const d = billSchema.parse(input);
  if (d.billDate > dubaiToday()) throw new Error("The bill date cannot be in the future.");
  if (d.kind === "bill" && !d.supplierRef) throw new Error("Enter the supplier's invoice number, so the same bill is never entered twice.");
  const [supplier] = await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.id, d.supplierId));
  if (!supplier) throw new Error("That supplier no longer exists.");
  if (d.supplierRef) {
    const [dup] = await db
      .select({ number: schema.bills.number })
      .from(schema.bills)
      .where(and(eq(schema.bills.supplierId, d.supplierId), eq(schema.bills.supplierRef, d.supplierRef), ne(schema.bills.status, "void")));
    if (dup) throw new Error(`${supplier.name} invoice ${d.supplierRef} is already entered as ${dup.number}.`);
  }
  const order = await orderLink(d.orderId);
  // an opening balance was reported in Zoho's VAT returns already
  const t = d.kind === "opening" ? billTotals(d.lines, 0, 0) : billTotals(d.lines, d.vatPct, d.vatAmount);
  if (t.total <= 0) throw new Error("The bill total must be above zero.");

  const r = await db.transaction(async (tx) => {
    const b = await insertBill(
      tx,
      {
        kind: d.kind,
        supplierId: d.supplierId,
        supplierRef: d.supplierRef,
        billDate: d.billDate,
        termsDays: d.termsDays,
        dueDate: dueDateFor(d.billDate, d.termsDays),
        category: d.category,
        orderId: order?.id ?? null,
        dealId: order?.dealId ?? null,
        vatPct: d.kind === "opening" ? 0 : d.vatPct,
        subtotal: t.subtotal,
        vatAmount: t.vatAmount,
        total: t.total,
        notes: d.notes,
        createdBy: me.id,
      },
      d.lines,
    );
    if (order) {
      await tx.insert(schema.activities).values({
        type: "note",
        body: `Supplier bill ${b.number} from ${supplier.name}${d.supplierRef ? ` (${d.supplierRef})` : ""} for order ${order.number}: ${money(t.subtotal)} before VAT.`,
        dealId: order.dealId,
        companyId: order.companyId,
        userId: me.id,
      });
    }
    return b;
  });
  refresh({ billId: r.id, supplierId: d.supplierId, orderId: order?.id, dealId: order?.dealId });
  return r;
}

const expenseSchema = z.object({
  paidOn: day,
  category: z.string().refine(isCategory, "Pick a category"),
  supplierId: id.nullable().optional(),
  paidTo: z.string().trim().max(120).default(""),
  description: z.string().trim().min(2, "Say what it was for").max(300),
  amount: z.number().positive("Enter the amount before VAT").max(1e10),
  vatPct: z.number().min(0).max(100).default(0),
  method: z.enum(["cash", "bank"]),
  reference: z.string().trim().max(120).default(""),
  orderId: id.nullable().optional(),
  notes: z.string().trim().max(1000).default(""),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

/** Money spent on the spot (rent, fuel, a visa fee...): the expense and its payment voucher are saved together. */
export async function createExpense(input: ExpenseInput) {
  const me = await assertFinance();
  const d = expenseSchema.parse(input);
  if (d.paidOn > dubaiToday()) throw new Error("The date cannot be in the future.");
  if (!d.supplierId && !d.paidTo) throw new Error("Say who was paid: pick a supplier or type a name.");
  if (d.method === "bank" && !d.reference) throw new Error("Add the bank reference (transfer number) so the payment can be found on the statement.");
  const supplier = d.supplierId
    ? (await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.id, d.supplierId)))[0]
    : null;
  if (d.supplierId && !supplier) throw new Error("That supplier no longer exists.");
  const order = await orderLink(d.orderId);
  const lines = [{ description: d.description, qty: 1, unitCost: d.amount }];
  const t = billTotals(lines, d.vatPct);
  const year = Number(d.paidOn.slice(0, 4));

  const r = await db.transaction(async (tx) => {
    const b = await insertBill(
      tx,
      {
        kind: "expense",
        supplierId: supplier?.id ?? null,
        paidTo: supplier ? "" : d.paidTo,
        billDate: d.paidOn,
        termsDays: 0,
        dueDate: d.paidOn,
        category: d.category,
        orderId: order?.id ?? null,
        dealId: order?.dealId ?? null,
        vatPct: d.vatPct,
        subtotal: t.subtotal,
        vatAmount: t.vatAmount,
        total: t.total,
        notes: d.notes,
        createdBy: me.id,
      },
      lines,
    );
    const seq = await nextSeq(tx, "voucher", schema.supplierPayments, schema.supplierPayments.year, schema.supplierPayments.seq, year);
    const number = yearNumber("ZPV", year, seq);
    await tx.insert(schema.supplierPayments).values({ year, seq, number, billId: b.id, supplierId: supplier?.id ?? null, paidOn: d.paidOn, amount: t.total, method: d.method, reference: d.reference, createdBy: me.id });
    return { ...b, voucher: number };
  });
  refresh({ billId: r.id, supplierId: supplier?.id, orderId: order?.id, dealId: order?.dealId });
  return r;
}

const paySchema = z.object({
  paidOn: day,
  amount: z.number().positive("Enter an amount above zero").max(1e10),
  method: z.enum(["cash", "bank"]),
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
});
export type SupplierPaymentInput = z.input<typeof paySchema>;

/** Pays a bill, in full or in part, and gives the payment voucher its number (ZPV-year-0001). */
export async function recordSupplierPayment(billId: number, input: SupplierPaymentInput) {
  const me = await assertFinance();
  const d = paySchema.parse(input);
  const today = dubaiToday();
  if (d.paidOn > today) throw new Error("The payment date cannot be in the future.");
  if (d.method === "bank" && !d.reference) throw new Error("Add the bank reference (transfer number) so the payment can be found on the statement.");
  const amount = round2(d.amount);
  const year = Number(d.paidOn.slice(0, 4));
  const r = await db.transaction(async (tx) => {
    const [b] = await tx.select().from(schema.bills).where(eq(schema.bills.id, billId)).for("update");
    if (!b) throw new Error("That bill no longer exists.");
    if (b.status === "void") throw new Error("This bill was voided.");
    if (d.paidOn < b.billDate) throw new Error("The payment date cannot be before the bill date.");
    const [sum] = await tx
      .select({ paid: sql<number>`coalesce(sum(${schema.supplierPayments.amount}), 0)::float` })
      .from(schema.supplierPayments)
      .where(and(eq(schema.supplierPayments.billId, billId), isNull(schema.supplierPayments.voidedAt)));
    const problem = checkPaymentAmount(amount, billState(b, sum.paid, today).balance);
    if (problem) throw new Error(problem.replace("still owed", "still to pay"));
    const seq = await nextSeq(tx, "voucher", schema.supplierPayments, schema.supplierPayments.year, schema.supplierPayments.seq, year);
    const number = yearNumber("ZPV", year, seq);
    const [p] = await tx
      .insert(schema.supplierPayments)
      .values({ year, seq, number, billId, supplierId: b.supplierId, paidOn: d.paidOn, amount, method: d.method, reference: d.reference, notes: d.notes, createdBy: me.id })
      .returning({ id: schema.supplierPayments.id });
    return { id: p.id, number, supplierId: b.supplierId, fullyPaid: billState(b, sum.paid + amount, today).key === "paid" };
  });
  refresh({ billId, supplierId: r.supplierId });
  return r;
}

/** A payment entered by mistake is voided (kept, crossed out) with a reason; the bill is owed again. */
export async function voidSupplierPayment(paymentId: number, reason: string) {
  await assertFinance();
  const why = z.string().trim().min(3, "Say why the payment is voided").max(300).parse(reason);
  const r = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.supplierPayments).where(eq(schema.supplierPayments.id, paymentId)).for("update");
    if (!p) throw new Error("That payment no longer exists.");
    if (p.voidedAt) throw new Error("This payment is already voided.");
    const [b] = await tx.select({ kind: schema.bills.kind, status: schema.bills.status }).from(schema.bills).where(eq(schema.bills.id, p.billId));
    if (b.kind === "expense" && b.status !== "void") throw new Error("This is an expense paid on the spot: void the expense itself instead.");
    await tx.update(schema.supplierPayments).set({ voidedAt: new Date(), voidReason: why }).where(eq(schema.supplierPayments.id, paymentId));
    return { billId: p.billId, supplierId: p.supplierId };
  });
  refresh(r);
}

/**
 * Voids a bill or expense entered by mistake (kept, crossed out, out of every total). A bill with payments needs them
 * voided first; an expense takes its own payment with it.
 */
export async function voidBill(billId: number, reason: string) {
  const me = await assertFinance();
  const why = z.string().trim().min(3, "Say why it is voided").max(300).parse(reason);
  const r = await db.transaction(async (tx) => {
    const [b] = await tx.select().from(schema.bills).where(eq(schema.bills.id, billId)).for("update");
    if (!b) throw new Error("That bill no longer exists.");
    if (b.status === "void") throw new Error("This is already voided.");
    const live = await tx
      .select({ id: schema.supplierPayments.id })
      .from(schema.supplierPayments)
      .where(and(eq(schema.supplierPayments.billId, billId), isNull(schema.supplierPayments.voidedAt)));
    if (live.length && b.kind !== "expense") throw new Error("This bill has payments. Void them first, then void the bill.");
    if (live.length) await tx.update(schema.supplierPayments).set({ voidedAt: new Date(), voidReason: `Expense ${b.number} voided: ${why}` }).where(eq(schema.supplierPayments.billId, billId));
    await tx.update(schema.bills).set({ status: "void", voidedAt: new Date(), voidReason: why }).where(eq(schema.bills.id, billId));
    if (b.dealId) {
      const [o] = b.orderId ? await tx.select({ companyId: schema.salesOrders.companyId }).from(schema.salesOrders).where(eq(schema.salesOrders.id, b.orderId)) : [];
      await tx.insert(schema.activities).values({ type: "note", body: `Supplier bill ${b.number} (${categoryLabel(b.category)}, ${money(b.subtotal)}) voided: ${why}`, dealId: b.dealId, companyId: o?.companyId ?? null, userId: me.id });
    }
    return { billId, supplierId: b.supplierId, orderId: b.orderId, dealId: b.dealId };
  });
  refresh(r);
}

const supplierBillingSchema = z.object({
  trn: z.string().trim().max(30).default(""),
  email: z.string().trim().max(200).default(""),
  address: z.string().trim().max(300).default(""),
  termsDays: z.number().int().min(0).max(365),
  bankName: z.string().trim().max(120).default(""),
  iban: z.string().trim().max(40).default(""),
});
export type SupplierBillingInput = z.input<typeof supplierBillingSchema>;

/** The details Accounts needs to pay a supplier (TRN, terms, bank). Name, contact and prices stay in Procurement. */
export async function updateSupplierBilling(supplierId: number, input: SupplierBillingInput) {
  await assertFinance();
  const d = supplierBillingSchema.parse(input);
  await db.update(schema.suppliers).set(d).where(eq(schema.suppliers.id, supplierId));
  revalidatePath(`/procurement/suppliers/${supplierId}`);
  refresh({ supplierId });
}

/** A supplier added from Accounts (when the bill comes from someone Procurement never had). */
export async function createSupplierFromAccounts(input: { name: string; termsDays?: number; trn?: string }) {
  await assertFinance();
  const name = z.string().trim().min(2, "Enter the supplier name").max(160).parse(input.name);
  const [dup] = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).where(sql`lower(${schema.suppliers.name}) = lower(${name})`);
  if (dup) throw new Error(`"${name}" is already a supplier. Pick it from the list.`);
  const [s] = await db
    .insert(schema.suppliers)
    .values({ name, termsDays: input.termsDays ?? 30, trn: (input.trn ?? "").trim().slice(0, 30) })
    .returning({ id: schema.suppliers.id });
  refresh({ supplierId: s.id });
  revalidatePath("/procurement/suppliers");
  return s.id;
}

