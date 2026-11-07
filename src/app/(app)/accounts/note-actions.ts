"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { assertFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { assertInLedgerPeriod, paymentAccount, pickPaymentAccount, postRefundDoc, reverseDocument } from "@/lib/ledger/documents";
import { nextSeq } from "@/lib/doc-numbers";
import { yearNumber } from "@/lib/invoicing";
import { fromMinor, toMinor } from "@/lib/money";
import { writeCreditNote, writeDebitNote } from "@/lib/ledger/notes";
import { currentOrgId, setTxOrg } from "@/lib/org";
import { longDay, money, round2 } from "@/lib/quotation";
import { parseInput, UserError } from "@/lib/user-error";

const line = z.object({
  itemId: z.number().int().positive(),
  qty: z.number().min(0).max(1e7),
  unitPrice: z.number().min(0).max(1e10),
});

const creditSchema = z.object({
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
  /** The day the goods came back or the price was agreed. */
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date").optional(),
  reason: z.string().trim().min(3, "Say why the credit note is issued").max(300),
  goodsBack: z.boolean().default(false),
  goodsCost: z.number().min(0).max(1e10).nullable().optional(),
  lines: z.array(line).min(1, "Pick at least one line").max(300),
});
export type CreditNoteInput = z.input<typeof creditSchema>;

/** A credit note for part of an invoice: chosen lines, a quantity or a lower price. Cancelling a whole invoice has its own button. */
export async function createCreditNote(invoiceId: number, input: CreditNoteInput) {
  const me = await assertFinance();
  const d = parseInput(creditSchema, input);
  if (d.issueDate > dubaiToday()) throw new UserError("The credit note date cannot be in the future.");
  const orgId = await currentOrgId();
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).for("update");
    if (!inv) throw new UserError("That invoice no longer exists.");
    if (inv.status === "cancelled") throw new UserError("This invoice is already cancelled.");
    if (inv.kind === "opening") throw new UserError("This is an opening balance from Zoho: the tax invoice and its credit note belong there.");
    if (d.issueDate < inv.issueDate) throw new UserError("The credit note cannot be dated before the invoice.");
    if (d.eventDate && d.eventDate > d.issueDate) throw new UserError("The return date cannot be after the credit note's date.");
    if (d.eventDate && d.eventDate < inv.issueDate) throw new UserError("The return date cannot be before the invoice.");
    await assertInLedgerPeriod(tx, orgId, d.issueDate);
    const note = await writeCreditNote(tx, orgId, me.id, inv, { date: d.issueDate, eventDate: d.eventDate, reason: d.reason, goodsBack: d.goodsBack, goodsCost: d.goodsBack ? (d.goodsCost ?? 0) : null, lines: d.lines });
    await tx.insert(schema.activities).values({ type: "note", body: `Credit note ${note.number} on invoice ${inv.number}, ${money(note.total)}: ${d.reason}`, dealId: inv.dealId, companyId: inv.companyId, userId: me.id });
    await audit(tx, { userId: me.id, action: "credit_note.create", entity: "invoice", entityId: inv.id, summary: `${note.number} on ${inv.number}, ${money(note.total)}: ${d.reason}`, after: { number: note.number, subtotal: note.subtotal, vat: note.vat, total: note.total, toAdvance: note.toAdvance } });
    return { ...note, dealId: inv.dealId, orderId: inv.orderId, companyId: inv.companyId };
  });
  revalidatePath("/accounts", "layout");
  revalidatePath(`/accounts/invoices/${invoiceId}`);
  revalidatePath(`/accounts/customers/${r.companyId}`);
  if (r.orderId) revalidatePath(`/sales/orders/${r.orderId}`);
  if (r.dealId) revalidatePath(`/crm/deals/${r.dealId}`);
  revalidatePath("/tasks");
  return { number: r.number, total: r.total, toAdvance: r.toAdvance, cleared: r.cleared };
}

const debitSchema = z.object({
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
  reason: z.string().trim().min(3, "Say why the debit note is issued").max(300),
  supplierRef: z.string().trim().max(60).default(""),
  lines: z.array(line).min(1, "Pick at least one line").max(200),
});
export type DebitNoteInput = z.input<typeof debitSchema>;

/** Goods sent back to a supplier, or a price they reduced: takes the cost and the VAT we reclaim off a bill. */
export async function createDebitNote(billId: number, input: DebitNoteInput) {
  const me = await assertFinance();
  const d = parseInput(debitSchema, input);
  if (d.issueDate > dubaiToday()) throw new UserError("The debit note date cannot be in the future.");
  const orgId = await currentOrgId();
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [b] = await tx.select().from(schema.bills).where(eq(schema.bills.id, billId)).for("update");
    if (!b) throw new UserError("That bill no longer exists.");
    if (b.status === "void") throw new UserError("This bill was voided.");
    if (b.kind === "expense") throw new UserError("This is an expense paid on the spot. Void it and enter the corrected amount.");
    if (b.kind === "opening") throw new UserError("This is an opening balance from Zoho: its debit note belongs there.");
    if (d.issueDate < b.billDate) throw new UserError("The debit note cannot be dated before the bill.");
    await assertInLedgerPeriod(tx, orgId, d.issueDate);
    const note = await writeDebitNote(tx, orgId, me.id, b, { date: d.issueDate, reason: d.reason, supplierRef: d.supplierRef, lines: d.lines });
    await audit(tx, { userId: me.id, action: "debit_note.create", entity: "bill", entityId: b.id, summary: `${note.number} on ${b.number}, ${money(note.total)}: ${d.reason}`, after: { number: note.number, subtotal: note.subtotal, vat: note.vat, total: note.total, toAdvance: note.toAdvance } });
    return { ...note, supplierId: b.supplierId };
  });
  revalidatePath("/accounts", "layout");
  revalidatePath(`/accounts/bills/${billId}`);
  if (r.supplierId) revalidatePath(`/accounts/suppliers/${r.supplierId}`);
  return { id: r.id, number: r.number, total: r.total, toAdvance: r.toAdvance };
}

const refundSchema = z.object({
  party: z.enum(["customer", "supplier"]),
  /** The receipt or voucher holding the advance. */
  paymentId: z.number().int().positive(),
  amount: z.number().positive("Enter an amount above zero").max(1e10),
  refundedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
  method: z.enum(["cash", "bank"]),
  bankAccountId: z.number().int().positive().nullable().optional(),
  reference: z.string().trim().max(120).default(""),
  reason: z.string().trim().min(3, "Say why it is refunded").max(300),
});
export type RefundInput = z.input<typeof refundSchema>;

/** Hands an advance back: to a customer, or received back from a supplier. It can only be what is left of that advance. */
export async function refundAdvance(input: RefundInput) {
  const me = await assertFinance();
  const d = parseInput(refundSchema, input);
  if (d.refundedOn > dubaiToday()) throw new UserError("The refund date cannot be in the future.");
  if (d.method === "bank" && !d.reference) throw new UserError("Add the bank reference (transfer number) so the refund can be found on the statement.");
  const amount = round2(d.amount);
  const orgId = await currentOrgId();
  const customer = d.party === "customer";
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const refunds = schema.advanceRefunds;
    const [p] = customer
      ? await tx.select({ id: schema.payments.id, number: schema.payments.number, amount: schema.payments.amount, paidOn: schema.payments.paidOn, voidedAt: schema.payments.voidedAt, partyId: schema.payments.companyId }).from(schema.payments).where(eq(schema.payments.id, d.paymentId)).for("update")
      : await tx.select({ id: schema.supplierPayments.id, number: schema.supplierPayments.number, amount: schema.supplierPayments.amount, paidOn: schema.supplierPayments.paidOn, voidedAt: schema.supplierPayments.voidedAt, partyId: schema.supplierPayments.supplierId }).from(schema.supplierPayments).where(eq(schema.supplierPayments.id, d.paymentId)).for("update");
    if (!p) throw new UserError("That payment no longer exists.");
    if (p.voidedAt) throw new UserError("This payment was voided.");
    if (d.refundedOn < p.paidOn) throw new UserError("The refund cannot be dated before the payment.");
    await assertInLedgerPeriod(tx, orgId, d.refundedOn);
    const [{ used }] = customer
      ? await tx.select({ used: sql<number>`coalesce(sum(${schema.paymentAllocations.amount}), 0)::float` }).from(schema.paymentAllocations).where(and(eq(schema.paymentAllocations.paymentId, p.id), isNull(schema.paymentAllocations.voidedAt)))
      : await tx.select({ used: sql<number>`coalesce(sum(${schema.supplierPaymentAllocations.amount}), 0)::float` }).from(schema.supplierPaymentAllocations).where(and(eq(schema.supplierPaymentAllocations.paymentId, p.id), isNull(schema.supplierPaymentAllocations.voidedAt)));
    const [{ done }] = await tx.select({ done: sql<number>`coalesce(sum(${refunds.amount}), 0)::float` }).from(refunds).where(and(customer ? eq(refunds.paymentId, p.id) : eq(refunds.supplierPaymentId, p.id), isNull(refunds.voidedAt)));
    const left = fromMinor(toMinor(p.amount) - toMinor(used) - toMinor(done));
    if (toMinor(amount) > toMinor(left)) throw new UserError(`Only ${money(left)} of ${p.number} is left to refund.`);
    const bankAccountId = await pickPaymentAccount(tx, orgId, d.bankAccountId, d.method);
    await paymentAccount(tx, orgId, bankAccountId, d.method);
    const year = Number(d.refundedOn.slice(0, 4));
    const seq = await nextSeq(tx, "refund", refunds, refunds.year, refunds.seq, year);
    const number = yearNumber("ZRF", year, seq);
    const [row] = await tx
      .insert(refunds)
      .values({ organizationId: orgId, year, seq, number, party: d.party, paymentId: customer ? p.id : null, supplierPaymentId: customer ? null : p.id, refundedOn: d.refundedOn, amount, method: d.method, bankAccountId, reference: d.reference, reason: d.reason, createdBy: me.id })
      .returning({ id: refunds.id });
    await postRefundDoc(tx, orgId, row.id, me.id);
    await audit(tx, { userId: me.id, action: "refund.create", entity: "advance_refund", entityId: row.id, summary: `${number}: ${money(amount)} of ${p.number} refunded: ${d.reason}`, after: { number, party: d.party, paymentId: p.id, amount, refundedOn: d.refundedOn, method: d.method } });
    return { id: row.id, number, partyId: p.partyId };
  });
  revalidatePath("/accounts", "layout");
  if (r.partyId) revalidatePath(customer ? `/accounts/customers/${r.partyId}` : `/accounts/suppliers/${r.partyId}`);
  return { id: r.id, number: r.number };
}

/** A refund entered by mistake: the money is an advance again. Kept, crossed out. */
export async function voidAdvanceRefund(refundId: number, reason: string) {
  const me = await assertFinance();
  const why = parseInput(z.string().trim().min(3, "Say why the refund is voided").max(300), reason);
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const t = schema.advanceRefunds;
    const [r] = await tx.select().from(t).where(eq(t.id, refundId)).for("update");
    if (!r) throw new UserError("That refund no longer exists.");
    if (r.voidedAt) throw new UserError("This refund is already voided.");
    await assertInLedgerPeriod(tx, orgId, r.refundedOn);
    await tx.update(t).set({ voidedAt: new Date(), voidReason: why }).where(eq(t.id, refundId));
    await reverseDocument(tx, orgId, "advance_refund", refundId, `refund ${r.number} voided: ${why}`, me.id);
    await audit(tx, { userId: me.id, action: "refund.void", entity: "advance_refund", entityId: refundId, summary: `${r.number} (${money(r.amount)}) voided, on ${longDay(r.refundedOn)}: ${why}`, before: { amount: r.amount }, after: { voided: true, reason: why } });
  });
  revalidatePath("/accounts", "layout");
}
