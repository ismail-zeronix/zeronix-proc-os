"use server";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { sellerSnapshot } from "@/lib/seller";
import { dayString, toFils, toQty2 } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { assertFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { nextSeq } from "@/lib/doc-numbers";
import { checkPaymentAmount, dueDateFor, yearNumber } from "@/lib/invoicing";
import { billState, billTax, categoryLabel, isCategory } from "@/lib/purchases";
import { purchaseTaxCode } from "@/lib/ledger/rules";
import { PURCHASE_TAX_CODES } from "@/lib/tax/doc-tax";
import { openBills, supplierAdvances } from "@/lib/purchases-data";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { money, round2 } from "@/lib/quotation";
import { assertInLedgerPeriod, assertOpeningDate, assertOpeningOpen, pickPaymentAccount, postBillDoc, postSupplierAllocationDoc, postSupplierAllocationRemoved, postSupplierPaymentDoc, reverseDocument, reverseSupplierPayment } from "@/lib/ledger/documents";
import { currentOrgId, setTxOrg } from "@/lib/org";
import type { Tx } from "@/lib/tx";
import { parseInput, UserError } from "@/lib/user-error";

const day = dayString("Pick a valid date");
const id = z.number().int().positive();

function refresh(ids: { billId?: number | null; supplierId?: number | null; orderId?: number | null; dealId?: number | null }) {
  revalidatePath("/accounts", "layout");
  if (ids.billId) revalidatePath(`/accounts/bills/${ids.billId}`);
  if (ids.supplierId) revalidatePath(`/accounts/suppliers/${ids.supplierId}`);
  if (ids.orderId) revalidatePath(`/sales/orders/${ids.orderId}`);
  if (ids.dealId) revalidatePath(`/crm/deals/${ids.dealId}`);
}

const lineSchema = z.object({
  description: z.string().trim().min(1, "Describe each line").max(500),
  qty: z.number().positive("Quantity must be above zero").max(1e7).transform(toQty2),
  unitCost: z.number().min(0, "Cost cannot be below zero").max(1e10).transform(toFils),
  /** VAT code of the line; left out, what the bill's rate means. */
  taxCode: z.enum(PURCHASE_TAX_CODES).optional(),
});

const billSchema = z.object({
  kind: z.enum(["bill", "opening"]).default("bill"),
  supplierId: id,
  supplierRef: z.string().trim().max(60).default(""),
  billDate: day,
  termsDays: z.number().int().min(0).max(365),
  category: z.string().refine(isCategory, "Pick a category"),
  orderId: id.nullable().optional(),
  /** Bought for a direct invoice (one with no order). */
  invoiceId: id.nullable().optional(),
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
  lines: (z.infer<typeof lineSchema> & { taxCode: string })[],
) {
  const year = Number(v.billDate.slice(0, 4));
  const seq = await nextSeq(tx, "bill", schema.bills, schema.bills.year, schema.bills.seq, year);
  const number = yearNumber("ZBL", year, seq);
  const [b] = await tx.insert(schema.bills).values({ ...v, year, seq, number }).returning({ id: schema.bills.id });
  await tx.insert(schema.billItems).values(lines.map((l, i) => ({ billId: b.id, position: i, description: l.description, qty: l.qty, unitCost: round2(l.unitCost), taxCode: l.taxCode })));
  return { id: b.id, number };
}

/** The sale a cost was bought for: a customer order, or a direct invoice with no order. */
async function saleLink(orderId: number | null | undefined, invoiceId: number | null | undefined) {
  if (orderId && invoiceId) throw new UserError("Pick the order or the invoice, not both.");
  if (orderId) {
    const [o] = await db.select({ id: schema.salesOrders.id, number: schema.salesOrders.number, dealId: schema.salesOrders.dealId, companyId: schema.salesOrders.companyId }).from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId));
    if (!o) throw new UserError("That customer order no longer exists.");
    return { orderId: o.id, invoiceId: null, number: o.number, dealId: o.dealId, companyId: o.companyId, label: `order ${o.number}` };
  }
  if (invoiceId) {
    const [i] = await db.select({ id: schema.invoices.id, number: schema.invoices.number, dealId: schema.invoices.dealId, companyId: schema.invoices.companyId, orderId: schema.invoices.orderId, status: schema.invoices.status }).from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
    if (!i) throw new UserError("That invoice no longer exists.");
    if (i.status === "cancelled") throw new UserError(`Invoice ${i.number} was cancelled.`);
    // an invoice made from an order keeps its costs on the order, as before
    return { orderId: i.orderId, invoiceId: i.orderId ? null : i.id, number: i.number, dealId: i.dealId, companyId: i.companyId, label: `invoice ${i.number}` };
  }
  return null;
}

/**
 * Records a supplier's invoice to pay later (or, `opening`, one still unpaid from before the portal). Linked to a customer
 * order, its cost counts against that order's profit and shows on the deal timeline.
 */
export async function createBill(input: BillInput) {
  const me = await assertFinance();
  const d = parseInput(billSchema, input);
  if (d.billDate > dubaiToday()) throw new UserError("The bill date cannot be in the future.");
  if (d.kind === "bill" && !d.supplierRef) throw new UserError("Enter the supplier's invoice number, so the same bill is never entered twice.");
  const [supplier] = await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.id, d.supplierId));
  if (!supplier) throw new UserError("That supplier no longer exists.");
  if (d.supplierRef) {
    const [dup] = await db
      .select({ number: schema.bills.number })
      .from(schema.bills)
      .where(and(eq(schema.bills.supplierId, d.supplierId), eq(schema.bills.supplierRef, d.supplierRef), ne(schema.bills.status, "void")));
    if (dup) throw new UserError(`${supplier.name} invoice ${d.supplierRef} is already entered as ${dup.number}.`);
  }
  const sale = await saleLink(d.orderId, d.invoiceId);
  // an opening balance was reported in Zoho's VAT returns already
  const coded = d.lines.map((l) => ({ ...l, taxCode: d.kind === "opening" ? "OS" : (l.taxCode ?? purchaseTaxCode(d.vatPct)) }));
  const t = billTax(coded, d.kind === "opening" ? null : d.vatAmount);
  if (t.total <= 0) throw new UserError("The bill total must be above zero.");
  const orgId = await currentOrgId();

  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    if (d.kind === "opening") {
      await assertOpeningDate(tx, orgId, d.billDate);
      await assertOpeningOpen(tx, orgId);
    } else await assertInLedgerPeriod(tx, orgId, d.billDate);
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
        orderId: sale?.orderId ?? null,
        invoiceId: sale?.invoiceId ?? null,
        dealId: sale?.dealId ?? null,
        vatPct: t.vatPct,
        subtotal: t.subtotal,
        vatAmount: t.vat,
        total: t.total,
        notes: d.notes,
        createdBy: me.id,
      },
      coded,
    );
    if (sale) {
      await tx.insert(schema.activities).values({
        type: "note",
        body: `Supplier bill ${b.number} from ${supplier.name}${d.supplierRef ? ` (${d.supplierRef})` : ""} for ${sale.label}: ${money(t.subtotal)} before VAT.`,
        dealId: sale.dealId,
        companyId: sale.companyId,
        userId: me.id,
      });
    }
    await postBillDoc(tx, orgId, b.id, me.id);
    await audit(tx, {
      userId: me.id,
      action: d.kind === "opening" ? "bill.opening" : "bill.create",
      entity: "bill",
      entityId: b.id,
      summary: `${b.number} from ${supplier.name}${d.supplierRef ? ` (${d.supplierRef})` : ""}: ${money(t.total)}`,
      after: { number: b.number, kind: d.kind, supplierRef: d.supplierRef, billDate: d.billDate, category: d.category, orderId: sale?.orderId ?? null, invoiceId: sale?.invoiceId ?? null, subtotal: t.subtotal, vatAmount: t.vat, selfAssessed: t.selfAssessed, total: t.total },
    });
    return b;
  });
  refresh({ billId: r.id, supplierId: d.supplierId, orderId: sale?.orderId, dealId: sale?.dealId });
  return r;
}

const expenseSchema = z.object({
  paidOn: day,
  category: z.string().refine(isCategory, "Pick a category"),
  supplierId: id.nullable().optional(),
  paidTo: z.string().trim().max(120).default(""),
  description: z.string().trim().min(2, "Say what it was for").max(300),
  amount: z.number().positive("Enter the amount before VAT").max(1e10).transform(toFils),
  vatPct: z.number().min(0).max(100).default(0),
  /** VAT code; left out, what the rate means. */
  taxCode: z.enum(PURCHASE_TAX_CODES).optional(),
  method: z.enum(["cash", "bank"]),
  reference: z.string().trim().max(120).default(""),
  bankAccountId: id.nullable().optional(),
  orderId: id.nullable().optional(),
  invoiceId: id.nullable().optional(),
  notes: z.string().trim().max(1000).default(""),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

/** Money spent on the spot (rent, fuel, a visa fee...): the expense and its payment voucher are saved together. */
export async function createExpense(input: ExpenseInput) {
  const me = await assertFinance();
  const d = parseInput(expenseSchema, input);
  if (d.paidOn > dubaiToday()) throw new UserError("The date cannot be in the future.");
  if (!d.supplierId && !d.paidTo) throw new UserError("Say who was paid: pick a supplier or type a name.");
  if (d.method === "bank" && !d.reference) throw new UserError("Add the bank reference (transfer number) so the payment can be found on the statement.");
  const supplier = d.supplierId
    ? (await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.id, d.supplierId)))[0]
    : null;
  if (d.supplierId && !supplier) throw new UserError("That supplier no longer exists.");
  const sale = await saleLink(d.orderId, d.invoiceId);
  const lines = [{ description: d.description, qty: 1, unitCost: d.amount, taxCode: d.taxCode ?? purchaseTaxCode(d.vatPct) }];
  const t = billTax(lines);
  const year = Number(d.paidOn.slice(0, 4));
  const orgId = await currentOrgId();

  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    await assertInLedgerPeriod(tx, orgId, d.paidOn);
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
        orderId: sale?.orderId ?? null,
        invoiceId: sale?.invoiceId ?? null,
        dealId: sale?.dealId ?? null,
        vatPct: t.vatPct,
        subtotal: t.subtotal,
        vatAmount: t.vat,
        total: t.total,
        notes: d.notes,
        createdBy: me.id,
      },
      lines,
    );
    const seq = await nextSeq(tx, "voucher", schema.supplierPayments, schema.supplierPayments.year, schema.supplierPayments.seq, year);
    const number = yearNumber("ZPV", year, seq);
    const bankAccountId = await pickPaymentAccount(tx, orgId, d.bankAccountId, d.method);
    const [voucher] = await tx
      .insert(schema.supplierPayments)
      .values({ sellerSnapshot: await sellerSnapshot(), year, seq, number, supplierId: supplier?.id ?? null, paidTo: supplier ? "" : d.paidTo, paidOn: d.paidOn, amount: t.total, method: d.method, bankAccountId, reference: d.reference, createdBy: me.id })
      .returning({ id: schema.supplierPayments.id });
    await tx.insert(schema.supplierPaymentAllocations).values({ paymentId: voucher.id, billId: b.id, amount: t.total, appliedOn: d.paidOn, createdBy: me.id });
    await postBillDoc(tx, orgId, b.id, me.id);
    await audit(tx, {
      userId: me.id,
      action: "expense.create",
      entity: "bill",
      entityId: b.id,
      summary: `${b.number} paid ${money(t.total)} to ${supplier?.name ?? d.paidTo} (${categoryLabel(d.category)}), voucher ${number}`,
      after: { number: b.number, voucher: number, paidOn: d.paidOn, category: d.category, method: d.method, subtotal: t.subtotal, vatAmount: t.vat, selfAssessed: t.selfAssessed, total: t.total },
    });
    return { ...b, voucher: number };
  });
  refresh({ billId: r.id, supplierId: supplier?.id, orderId: sale?.orderId, dealId: sale?.dealId });
  return r;
}

const paySchema = z.object({
  paidOn: day,
  amount: z.number().positive("Enter an amount above zero").max(1e10).transform(toFils),
  method: z.enum(["cash", "bank"]),
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
  bankAccountId: id.nullable().optional(),
});
export type SupplierPaymentInput = z.input<typeof paySchema>;

const voucherSchema = paySchema.extend({
  supplierId: id,
  /** What it pays. Whatever is left of the amount is an advance to the supplier. */
  allocations: z.array(z.object({ billId: id, amount: z.number().positive("Enter an amount above zero").max(1e10).transform(toFils) })).max(200),
});
export type VoucherInput = z.input<typeof voucherSchema>;

/** Money set against a bill so far (inside the transaction that holds its lock). */
async function allocatedToBill(tx: Tx, billId: number): Promise<number> {
  const a = schema.supplierPaymentAllocations;
  const [sum] = await tx.select({ paid: sql<number>`coalesce(sum(${a.amount}), 0)::float` }).from(a).where(and(eq(a.billId, billId), isNull(a.voidedAt)));
  return sum.paid;
}

/**
 * Saves money paid to a supplier and gives the voucher its number (ZPV-year-0001). It can pay one bill, several or none:
 * what is left is an advance, kept until it is applied to a bill.
 */
async function saveVoucher(me: { id: number }, d: z.infer<typeof voucherSchema>) {
  const today = dubaiToday();
  if (d.paidOn > today) throw new UserError("The payment date cannot be in the future.");
  if (d.method === "bank" && !d.reference) throw new UserError("Add the bank reference (transfer number) so the payment can be found on the statement.");
  const amount = round2(d.amount);
  const wanted = d.allocations.map((x) => ({ billId: x.billId, amount: round2(x.amount) }));
  if (new Set(wanted.map((x) => x.billId)).size !== wanted.length) throw new UserError("The same bill is listed twice.");
  const setAgainst = fromMinor(sumMinor(wanted.map((x) => toMinor(x.amount))));
  if (toMinor(setAgainst) > toMinor(amount)) throw new UserError(`The bills add up to ${money(setAgainst)}, more than the ${money(amount)} paid.`);
  const year = Number(d.paidOn.slice(0, 4));
  const orgId = await currentOrgId();
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [supplier] = await tx.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.id, d.supplierId));
    if (!supplier) throw new UserError("That supplier no longer exists.");
    // locked in id order, so two vouchers for the same bills cannot block each other
    const bills = wanted.length ? await tx.select().from(schema.bills).where(inArray(schema.bills.id, wanted.map((x) => x.billId))).orderBy(asc(schema.bills.id)).for("update") : [];
    const parts = [];
    for (const w of wanted) {
      const b = bills.find((x) => x.id === w.billId);
      if (!b) throw new UserError("That bill no longer exists.");
      if (b.supplierId !== d.supplierId) throw new UserError(`Bill ${b.number} belongs to another supplier.`);
      if (b.kind === "expense") throw new UserError(`${b.number} is an expense, already paid on the spot.`);
      if (b.status === "void") throw new UserError(wanted.length === 1 ? "This bill was voided." : `Bill ${b.number} was voided.`);
      if (d.paidOn < b.billDate) throw new UserError(wanted.length === 1 ? "The payment date cannot be before the bill date." : `The payment date cannot be before the date of bill ${b.number}.`);
      const paid = await allocatedToBill(tx, b.id);
      const problem = checkPaymentAmount(w.amount, billState(b, paid, today).balance);
      if (problem) throw new UserError((wanted.length === 1 ? problem : `${b.number}: ${problem}`).replace("still owed", "still to pay"));
      parts.push({ b, amount: w.amount, after: billState(b, paid + w.amount, today) });
    }
    await assertInLedgerPeriod(tx, orgId, d.paidOn);
    const seq = await nextSeq(tx, "voucher", schema.supplierPayments, schema.supplierPayments.year, schema.supplierPayments.seq, year);
    const number = yearNumber("ZPV", year, seq);
    const [p] = await tx
      .insert(schema.supplierPayments)
      .values({
        sellerSnapshot: await sellerSnapshot(),
        year,
        seq,
        number,
        supplierId: d.supplierId,
        paidOn: d.paidOn,
        amount,
        method: d.method,
        bankAccountId: await pickPaymentAccount(tx, orgId, d.bankAccountId, d.method),
        reference: d.reference,
        notes: d.notes,
        createdBy: me.id,
      })
      .returning({ id: schema.supplierPayments.id });
    if (parts.length) await tx.insert(schema.supplierPaymentAllocations).values(parts.map((x) => ({ paymentId: p.id, billId: x.b.id, amount: x.amount, appliedOn: d.paidOn, createdBy: me.id })));
    await postSupplierPaymentDoc(tx, orgId, p.id, me.id);
    const advance = fromMinor(toMinor(amount) - toMinor(setAgainst));
    await audit(tx, {
      userId: me.id,
      action: "supplier_payment.record",
      entity: "supplier_payment",
      entityId: p.id,
      summary: `${number}: ${money(amount)} to ${supplier.name} by ${d.method}${parts.length ? `, for ${parts.map((x) => x.b.number).join(", ")}` : ""}${advance > 0 ? `, advance ${money(advance)}` : ""}`,
      after: { number, supplierId: d.supplierId, paidOn: d.paidOn, amount, advance, method: d.method, reference: d.reference, allocations: wanted },
    });
    return { id: p.id, number, advance, parts };
  });
  refresh({ supplierId: d.supplierId });
  for (const x of r.parts) refresh({ billId: x.b.id, orderId: x.b.orderId, dealId: x.b.dealId });
  return { id: r.id, number: r.number, advance: r.advance, supplierId: d.supplierId, fullyPaid: r.parts.length > 0 && r.parts.every((x) => x.after.key === "paid") };
}

/** Pays one bill, in full or in part (the bill page). */
export async function recordSupplierPayment(billId: number, input: SupplierPaymentInput) {
  const me = await assertFinance();
  const d = parseInput(paySchema, input);
  const [b] = await db.select({ supplierId: schema.bills.supplierId, kind: schema.bills.kind }).from(schema.bills).where(eq(schema.bills.id, billId));
  if (!b) throw new UserError("That bill no longer exists.");
  if (!b.supplierId) throw new UserError("This has no supplier: it is an expense, already paid on the spot.");
  return saveVoucher(me, { ...d, supplierId: b.supplierId, allocations: [{ billId, amount: d.amount }] });
}

/** A new voucher: pick the supplier, tick the bills it pays and split the amount. What is left stays as an advance. */
export async function createVoucher(input: VoucherInput) {
  const me = await assertFinance();
  return saveVoucher(me, parseInput(voucherSchema, input));
}

const applySchema = z.object({ paymentId: id, billId: id, amount: z.number().positive("Enter an amount above zero").max(1e10).transform(toFils), appliedOn: day });

/** Sets an advance (what is left of a voucher) against a bill of the same supplier, on the day it is applied. */
export async function applySupplierAdvance(input: z.input<typeof applySchema>) {
  const me = await assertFinance();
  const d = parseInput(applySchema, input);
  const today = dubaiToday();
  if (d.appliedOn > today) throw new UserError("The date cannot be in the future.");
  const amount = round2(d.amount);
  const orgId = await currentOrgId();
  const a = schema.supplierPaymentAllocations;
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [p] = await tx.select().from(schema.supplierPayments).where(eq(schema.supplierPayments.id, d.paymentId)).for("update");
    if (!p) throw new UserError("That payment no longer exists.");
    if (p.voidedAt) throw new UserError("This payment was voided.");
    const [b] = await tx.select().from(schema.bills).where(eq(schema.bills.id, d.billId)).for("update");
    if (!b) throw new UserError("That bill no longer exists.");
    if (b.supplierId !== p.supplierId) throw new UserError(`Bill ${b.number} belongs to another supplier.`);
    if (b.kind === "expense") throw new UserError(`${b.number} is an expense, already paid on the spot.`);
    if (b.status === "void") throw new UserError(`Bill ${b.number} was voided.`);
    if (d.appliedOn < b.billDate || d.appliedOn < p.paidOn) throw new UserError("The date cannot be before the bill or the payment.");
    await assertInLedgerPeriod(tx, orgId, d.appliedOn);
    const [{ used }] = await tx.select({ used: sql<number>`coalesce(sum(${a.amount}), 0)::float` }).from(a).where(and(eq(a.paymentId, p.id), isNull(a.voidedAt)));
    const [{ refunded }] = await tx.select({ refunded: sql<number>`coalesce(sum(${schema.advanceRefunds.amount}), 0)::float` }).from(schema.advanceRefunds).where(and(eq(schema.advanceRefunds.supplierPaymentId, p.id), isNull(schema.advanceRefunds.voidedAt)));
    const left = fromMinor(toMinor(p.amount) - toMinor(used) - toMinor(refunded));
    if (toMinor(amount) > toMinor(left)) throw new UserError(`Only ${money(left)} of ${p.number} is left to apply.`);
    const problem = checkPaymentAmount(amount, billState(b, await allocatedToBill(tx, b.id), today).balance);
    if (problem) throw new UserError(problem.replace("still owed", "still to pay"));
    const [row] = await tx.insert(a).values({ paymentId: p.id, billId: b.id, amount, appliedOn: d.appliedOn, createdBy: me.id }).returning({ id: a.id });
    await postSupplierAllocationDoc(tx, orgId, row.id, me.id);
    await audit(tx, { userId: me.id, action: "supplier_payment.apply", entity: "supplier_payment", entityId: p.id, summary: `${money(amount)} of ${p.number} applied to ${b.number}`, after: { allocationId: row.id, billId: b.id, amount, appliedOn: d.appliedOn } });
    return { allocationId: row.id, billId: b.id, supplierId: b.supplierId };
  });
  refresh(r);
  return { allocationId: r.allocationId };
}

/** Takes a voucher's money off one bill: the bill is owed again and the supplier holds the money as an advance. */
export async function removeSupplierAllocation(allocationId: number, reason: string) {
  const me = await assertFinance();
  const why = parseInput(z.string().trim().min(3, "Say why it is taken off").max(300), reason);
  const orgId = await currentOrgId();
  const a = schema.supplierPaymentAllocations;
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [row] = await tx.select().from(a).where(eq(a.id, allocationId)).for("update");
    if (!row) throw new UserError("That payment no longer exists.");
    if (row.voidedAt) throw new UserError("This payment is already off the bill.");
    const [[p], [b]] = await Promise.all([tx.select().from(schema.supplierPayments).where(eq(schema.supplierPayments.id, row.paymentId)), tx.select().from(schema.bills).where(eq(schema.bills.id, row.billId))]);
    if (b.kind === "expense") throw new UserError("This is an expense paid on the spot: void the expense itself instead.");
    await assertInLedgerPeriod(tx, orgId, row.appliedOn);
    await tx.update(a).set({ voidedAt: new Date() }).where(eq(a.id, allocationId));
    await postSupplierAllocationRemoved(tx, orgId, allocationId, why, me.id);
    await audit(tx, { userId: me.id, action: "supplier_payment.unapply", entity: "supplier_payment", entityId: p.id, summary: `${money(row.amount)} of ${p.number} taken off ${b.number}: ${why}`, before: { allocationId, billId: b.id, amount: row.amount } });
    return { billId: b.id, supplierId: b.supplierId };
  });
  refresh(r);
}

/** A payment entered by mistake is voided (kept, crossed out) with a reason; every bill it paid is owed again. */
export async function voidSupplierPayment(paymentId: number, reason: string) {
  const me = await assertFinance();
  const why = parseInput(z.string().trim().min(3, "Say why the payment is voided").max(300), reason);
  const orgId = await currentOrgId();
  const a = schema.supplierPaymentAllocations;
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [p] = await tx.select().from(schema.supplierPayments).where(eq(schema.supplierPayments.id, paymentId)).for("update");
    if (!p) throw new UserError("That payment no longer exists.");
    if (p.voidedAt) throw new UserError("This payment is already voided.");
    await assertInLedgerPeriod(tx, orgId, p.paidOn);
    const docs = await tx.select({ billId: a.billId, amount: a.amount, voidedAt: a.voidedAt, kind: schema.bills.kind, status: schema.bills.status }).from(a).innerJoin(schema.bills, eq(schema.bills.id, a.billId)).where(eq(a.paymentId, paymentId));
    if (docs.some((d) => d.kind === "expense" && d.status !== "void")) throw new UserError("This is an expense paid on the spot: void the expense itself instead.");
    const now = new Date();
    const [refund] = await tx.select({ number: schema.advanceRefunds.number }).from(schema.advanceRefunds).where(and(eq(schema.advanceRefunds.supplierPaymentId, paymentId), isNull(schema.advanceRefunds.voidedAt))).limit(1);
    if (refund) throw new UserError(`Part of this payment was refunded (${refund.number}). Void that refund first.`);
    await tx.update(schema.supplierPayments).set({ voidedAt: now, voidReason: why }).where(eq(schema.supplierPayments.id, paymentId));
    await tx.update(a).set({ voidedAt: now }).where(and(eq(a.paymentId, paymentId), isNull(a.voidedAt)));
    await reverseSupplierPayment(tx, orgId, paymentId, `payment ${p.number} voided: ${why}`, me.id);
    await audit(tx, {
      userId: me.id,
      action: "supplier_payment.void",
      entity: "supplier_payment",
      entityId: paymentId,
      summary: `${p.number} (${money(p.amount)}) voided: ${why}`,
      before: { amount: p.amount, paidOn: p.paidOn, allocations: docs.filter((d) => !d.voidedAt).map((d) => ({ billId: d.billId, amount: d.amount })) },
      after: { voided: true, reason: why },
    });
    return { supplierId: p.supplierId, bills: docs.map((d) => d.billId) };
  });
  refresh({ supplierId: r.supplierId });
  for (const billId of r.bills) refresh({ billId });
}

/**
 * Voids a bill or expense entered by mistake (kept, crossed out, out of every total). A bill with payments needs them
 * voided first; an expense takes its own payment with it.
 */
export async function voidBill(billId: number, reason: string) {
  const me = await assertFinance();
  const why = parseInput(z.string().trim().min(3, "Say why it is voided").max(300), reason);
  const orgId = await currentOrgId();
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [b] = await tx.select().from(schema.bills).where(eq(schema.bills.id, billId)).for("update");
    if (!b) throw new UserError("That bill no longer exists.");
    if (b.status === "void") throw new UserError("This is already voided.");
    if (b.kind === "opening") await assertOpeningOpen(tx, orgId);
    else await assertInLedgerPeriod(tx, orgId, b.billDate);
    const a = schema.supplierPaymentAllocations;
    const live = await tx.select({ paymentId: a.paymentId }).from(a).where(and(eq(a.billId, billId), isNull(a.voidedAt)));
    if (live.length && b.kind !== "expense") throw new UserError("This bill has payments. Void them or take them off the bill first, then void it.");
    if (b.creditedTotal > 0) throw new UserError("This bill has a debit note. Issue a debit note for the rest instead of voiding it.");
    if (live.length) {
      const now = new Date();
      await tx.update(schema.supplierPayments).set({ voidedAt: now, voidReason: `Expense ${b.number} voided: ${why}` }).where(inArray(schema.supplierPayments.id, live.map((x) => x.paymentId)));
      await tx.update(a).set({ voidedAt: now }).where(and(eq(a.billId, billId), isNull(a.voidedAt)));
    }
    await tx.update(schema.bills).set({ status: "void", voidedAt: new Date(), voidReason: why }).where(eq(schema.bills.id, billId));
    await reverseDocument(tx, orgId, b.kind === "expense" ? "expense" : "bill", billId, `${b.number} voided: ${why}`, me.id);
    await audit(tx, {
      userId: me.id,
      action: b.kind === "expense" ? "expense.void" : "bill.void",
      entity: "bill",
      entityId: billId,
      summary: `${b.number} (${money(b.total)}) voided: ${why}`,
      before: { status: b.status, total: b.total },
      after: { status: "void", reason: why },
    });
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
  const me = await assertFinance();
  const d = parseInput(supplierBillingSchema, input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ name: schema.suppliers.name, trn: schema.suppliers.trn, termsDays: schema.suppliers.termsDays, bankName: schema.suppliers.bankName, iban: schema.suppliers.iban })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, supplierId));
    if (!before) throw new UserError("That supplier no longer exists.");
    await tx.update(schema.suppliers).set(d).where(eq(schema.suppliers.id, supplierId));
    // bank details changing is what auditors look for first (payment fraud)
    await audit(tx, { userId: me.id, action: "supplier.billing", entity: "supplier", entityId: supplierId, summary: `Billing details of ${before.name} changed`, before, after: d });
  });
  revalidatePath(`/procurement/suppliers/${supplierId}`);
  refresh({ supplierId });
}

/** A supplier's unpaid bills and unused advances, for the new voucher form. */
export async function supplierOpenItems(supplierId: number) {
  await assertFinance();
  const [items, advances] = await Promise.all([openBills(supplierId), supplierAdvances(supplierId)]);
  return { items, advance: round2(advances.reduce((s, a) => s + a.left, 0)) };
}

const newSupplierSchema = z.object({
  name: z.string().trim().min(2, "Enter the supplier name").max(160),
  termsDays: z.number().int().min(0).max(365).default(30),
  trn: z.string().trim().max(30).default(""),
  email: z.string().trim().max(200).default(""),
  address: z.string().trim().max(300).default(""),
  bankName: z.string().trim().max(120).default(""),
  iban: z.string().trim().max(40).default(""),
});
export type NewSupplierInput = z.input<typeof newSupplierSchema>;

/** A supplier added from Accounts (when the bill comes from someone Procurement never had), with what is needed to pay them. */
export async function createSupplierFromAccounts(input: NewSupplierInput) {
  const me = await assertFinance();
  const parsed = newSupplierSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Check the supplier.");
  const d = parsed.data;
  const { name } = d;
  const [dup] = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).where(sql`lower(${schema.suppliers.name}) = lower(${name})`);
  if (dup) throw new UserError(`"${name}" is already a supplier. Pick it from the list.`);
  const [s] = await db.insert(schema.suppliers).values(d).returning({ id: schema.suppliers.id });
  await audit(db, { userId: me.id, action: "supplier.create", entity: "supplier", entityId: s.id, summary: `Supplier ${name} added`, after: d });
  refresh({ supplierId: s.id });
  revalidatePath("/procurement/suppliers");
  return s.id;
}

