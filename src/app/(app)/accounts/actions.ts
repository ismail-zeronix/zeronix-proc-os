"use server";

import { and, asc, eq, inArray, isNull, like, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { customerAdvances, openInvoices } from "@/lib/accounts-data";
import { audit } from "@/lib/audit";
import { assertFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { nextSeq, takeInvoiceNumber } from "@/lib/doc-numbers";
import { checkPaymentAmount, dueDateFor, invoiceState, methodLabel, termsLabel, yearNumber } from "@/lib/invoicing";
import { lineTotal } from "@/lib/quotation";
import { collectTitle, writeCreditNote } from "@/lib/ledger/notes";
import { taxCodeForRate } from "@/lib/ledger/rules";
import { docTax, SALES_TAX_CODES } from "@/lib/tax/doc-tax";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { money, round2 } from "@/lib/quotation";
import { normName, stageLabel, trnProblem } from "@/lib/sales";
import { duplicateCompany } from "@/lib/sales-data";
import { getSetting } from "@/lib/settings";
import { assertInLedgerPeriod, assertOpeningDate, assertOpeningOpen, pickPaymentAccount, postAllocationDoc, postAllocationRemoved, postInvoiceDoc, postReceiptDoc, reversePayment } from "@/lib/ledger/documents";
import { currentOrgId, setTxOrg, withOrg } from "@/lib/org";
import type { Tx } from "@/lib/tx";
import { parseInput, UserError } from "@/lib/user-error";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

function refresh(ids: { dealId?: number | null; orderId?: number | null; invoiceId?: number; companyId?: number }) {
  revalidatePath("/accounts", "layout");
  revalidatePath("/crm", "layout");
  if (ids.dealId) revalidatePath(`/crm/deals/${ids.dealId}`);
  if (ids.orderId) revalidatePath(`/sales/orders/${ids.orderId}`);
  if (ids.invoiceId) revalidatePath(`/accounts/invoices/${ids.invoiceId}`);
  if (ids.companyId) revalidatePath(`/crm/companies/${ids.companyId}`);
  revalidatePath("/");
}

const issueSchema = z.object({
  issueDate: day,
  termsDays: z.number().int().min(0).max(365),
  customerAddress: z.string().trim().max(500).default(""),
});
export type IssueInput = z.input<typeof issueSchema>;

/**
 * Issues the tax invoice for a delivered order. The number comes from the Admin series, the customer details are copied as
 * they are today, and the lines are copied from the order. A task to collect the money is put on the deal owner's list
 * for the due date.
 */
export async function issueInvoice(orderId: number, input: IssueInput) {
  const me = await assertFinance();
  const d = parseInput(issueSchema, input);
  const today = dubaiToday();
  if (d.issueDate > today) throw new UserError("The invoice date cannot be in the future.");
  // a UAE tax invoice must carry the seller TRN
  if (!(await getSetting("quote_trn")).trim()) throw new UserError("Add our TRN in Accounts › Settings › VAT registration first: a tax invoice must show it.");
  const orgId = await currentOrgId();

  const result = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    await assertInLedgerPeriod(tx, orgId, d.issueDate);
    const [o] = await tx.select().from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId)).for("update");
    if (!o) throw new UserError("That order no longer exists.");
    if (o.status === "open") throw new UserError("Mark the order delivered first: the invoice date of supply is the delivery date.");
    if (o.status === "cancelled") throw new UserError("This order was cancelled.");
    if (o.status === "invoiced") throw new UserError("This order already has an invoice.");
    if (o.deliveredOn && d.issueDate < o.deliveredOn) throw new UserError("The invoice date cannot be before the delivery date.");
    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, o.companyId));
    // a UAE tax invoice needs the customer's address, and a registered customer's TRN must be valid
    const customerAddress = d.customerAddress || o.deliveryAddress || company.address || (company.emirate ? `${company.emirate}, United Arab Emirates` : "");
    if (!customerAddress) throw new UserError(`Add ${company.name}'s billing address (Sales › Customers › Billing details) before issuing the invoice.`);
    const badTrn = trnProblem(company.trn);
    if (badTrn) throw new UserError(`${badTrn} Fix it in Sales › Customers › Billing details before issuing the invoice.`);
    const items = await tx.select().from(schema.salesOrderItems).where(eq(schema.salesOrderItems.orderId, orderId)).orderBy(asc(schema.salesOrderItems.position), asc(schema.salesOrderItems.id));
    // who collects the money: the deal owner, or the salesperson of the instant quote
    const [deal] = o.dealId ? await tx.select({ ownerId: schema.deals.ownerId }).from(schema.deals).where(eq(schema.deals.id, o.dealId)) : [];
    const [quote] = await tx.select({ ownerId: schema.quotes.ownerId }).from(schema.quotes).where(eq(schema.quotes.id, o.quoteId));

    const number = await takeInvoiceNumber(tx);
    const dueDate = dueDateFor(d.issueDate, d.termsDays);
    const [inv] = await tx
      .insert(schema.invoices)
      .values({
        number,
        orderId,
        dealId: o.dealId,
        companyId: o.companyId,
        issueDate: d.issueDate,
        supplyDate: o.deliveredOn ?? d.issueDate,
        termsDays: d.termsDays,
        dueDate,
        customerName: company.name,
        customerAddress,
        customerTrn: company.trn,
        customerRef: o.customerRef,
        vatPct: o.vatPct,
        subtotal: o.subtotal,
        vatAmount: o.vatAmount,
        total: o.total,
        createdBy: me.id,
      })
      .returning({ id: schema.invoices.id });
    // an order's lines are of one kind: a project deal is services, everything else products
    const [dealKind] = o.dealId ? await tx.select({ kind: schema.deals.kind }).from(schema.deals).where(eq(schema.deals.id, o.dealId)) : [];
    const lineKind: "product" | "service" = dealKind?.kind === "project" ? "service" : "product";
    await tx.insert(schema.invoiceItems).values(items.map((i, position) => ({ invoiceId: inv.id, position, description: i.description, qty: i.qty, unitPrice: i.unitPrice, lineKind, taxCode: taxCodeForRate(o.vatPct) })));
    await tx.update(schema.salesOrders).set({ status: "invoiced", termsDays: d.termsDays }).where(eq(schema.salesOrders.id, orderId));
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Invoice ${number} issued: ${money(o.total)} with VAT, ${termsLabel(d.termsDays).toLowerCase()}, due ${dueDate}.`,
      dealId: o.dealId,
      companyId: o.companyId,
      userId: me.id,
    });
    await tx.insert(schema.tasks).values({
      title: collectTitle(number),
      notes: `${company.name}: ${money(o.total)} due ${dueDate}. Record the payment in Accounts when it arrives.`,
      dueDate,
      priority: "normal",
      assignedTo: deal?.ownerId ?? quote?.ownerId ?? o.createdBy ?? me.id,
      createdBy: me.id,
      relatedType: o.dealId ? "deal" : null,
      relatedId: o.dealId,
    });
    await postInvoiceDoc(tx, orgId, inv.id, me.id);
    await audit(tx, {
      userId: me.id,
      action: "invoice.issue",
      entity: "invoice",
      entityId: inv.id,
      summary: `${number} issued to ${company.name}: ${money(o.total)}`,
      after: { number, orderId, issueDate: d.issueDate, dueDate, subtotal: o.subtotal, vatAmount: o.vatAmount, total: o.total },
    });
    return { id: inv.id, number, dealId: o.dealId, companyId: o.companyId };
  });
  refresh({ ...result, orderId, invoiceId: result.id });
  revalidatePath("/tasks");
  return { id: result.id, number: result.number };
}

/**
 * Cancels an invoice with a credit note for the full amount (ZCN-year-0001). Only an invoice with no payments on it: void
 * the payments first. The order goes back to Delivered, so a corrected invoice can be issued. `goodsBack` says whether the
 * goods are coming back: if so their cost returns to stock, if not it stays a cost.
 */
export async function cancelInvoice(invoiceId: number, reason: string, opts: { goodsBack?: boolean } = {}) {
  const me = await assertFinance();
  const why = parseInput(z.string().trim().min(3, "Say why the invoice is cancelled").max(300), reason);
  const today = dubaiToday();
  const orgId = await currentOrgId();
  const result = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).for("update");
    if (!inv) throw new UserError("That invoice no longer exists.");
    if (inv.status === "cancelled") throw new UserError("This invoice is already cancelled.");
    const [paid] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.paymentAllocations)
      .where(and(eq(schema.paymentAllocations.invoiceId, invoiceId), isNull(schema.paymentAllocations.voidedAt)));
    if (paid.n > 0) throw new UserError("This invoice has payments. Void them or take them off the invoice first, then cancel it.");
    if (inv.kind === "opening") {
      await assertOpeningOpen(tx, orgId);
      // an opening balance entered by mistake: no credit note, as the tax invoice itself lives in Zoho
      await tx.update(schema.invoices).set({ status: "cancelled" }).where(eq(schema.invoices.id, invoiceId));
      await tx.insert(schema.activities).values({ type: "note", body: `Opening invoice ${inv.number} removed: ${why}`, companyId: inv.companyId, userId: me.id });
      await audit(tx, { userId: me.id, action: "invoice.cancel", entity: "invoice", entityId: invoiceId, summary: `Opening invoice ${inv.number} removed: ${why}`, before: { status: inv.status, total: inv.total } });
      return { number: null, dealId: null, orderId: null, companyId: inv.companyId };
    }
    // everything still left on the invoice: the note also takes the order back and removes the collection task
    const { number } = await writeCreditNote(tx, orgId, me.id, inv, { date: today, reason: why, goodsBack: opts.goodsBack ?? true, lines: null });
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Invoice ${inv.number} cancelled with credit note ${number}: ${why}`,
      dealId: inv.dealId,
      companyId: inv.companyId,
      userId: me.id,
    });
    await audit(tx, {
      userId: me.id,
      action: "invoice.cancel",
      entity: "invoice",
      entityId: invoiceId,
      summary: `${inv.number} cancelled with credit note ${number}: ${why}`,
      before: { status: inv.status, total: inv.total },
      after: { status: "cancelled", creditNote: number },
    });
    return { number, dealId: inv.dealId, orderId: inv.orderId, companyId: inv.companyId };
  });
  refresh({ ...result, invoiceId });
  revalidatePath("/tasks");
  return { creditNote: result.number };
}

const paymentSchema = z.object({
  paidOn: day,
  amount: z.number().positive("Enter an amount above zero").max(1e10),
  method: z.enum(["cash", "bank"]),
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(500).default(""),
  /** Which bank or cash account; left out, the default of the method. */
  bankAccountId: z.number().int().positive().nullable().optional(),
});
export type PaymentInput = z.input<typeof paymentSchema>;

const receiptSchema = paymentSchema.extend({
  companyId: z.number().int().positive("Pick the customer"),
  /** What it pays. Whatever is left of the amount is kept as an advance. */
  allocations: z.array(z.object({ invoiceId: z.number().int().positive(), amount: z.number().positive("Enter an amount above zero").max(1e10) })).max(200),
});
export type ReceiptInput = z.input<typeof receiptSchema>;

const closeCollectTask = (tx: Tx, invoiceNumber: string) =>
  tx
    .update(schema.tasks)
    .set({ status: "done", doneAt: new Date() })
    .where(and(eq(schema.tasks.status, "open"), like(schema.tasks.title, `${collectTitle(invoiceNumber)}%`)));

/** Money set against an invoice so far (inside the transaction that holds its lock). */
async function allocatedTo(tx: Tx, invoiceId: number): Promise<number> {
  const a = schema.paymentAllocations;
  const [sum] = await tx.select({ paid: sql<number>`coalesce(sum(${a.amount}), 0)::float` }).from(a).where(and(eq(a.invoiceId, invoiceId), isNull(a.voidedAt)));
  return sum.paid;
}

/**
 * Saves money received and gives the receipt its number (ZRV-year-0001). It can pay one invoice, several or none: what is
 * left is an advance, kept for the customer until it is applied to an invoice. A fully paid invoice closes its collection task.
 */
async function saveReceipt(me: { id: number }, d: z.infer<typeof receiptSchema>) {
  const today = dubaiToday();
  if (d.paidOn > today) throw new UserError("The payment date cannot be in the future.");
  if (d.method === "bank" && !d.reference) throw new UserError("Add the bank reference (transfer number) so the payment can be found on the statement.");
  const amount = round2(d.amount);
  const wanted = d.allocations.map((x) => ({ invoiceId: x.invoiceId, amount: round2(x.amount) }));
  if (new Set(wanted.map((x) => x.invoiceId)).size !== wanted.length) throw new UserError("The same invoice is listed twice.");
  const setAgainst = fromMinor(sumMinor(wanted.map((x) => toMinor(x.amount))));
  if (toMinor(setAgainst) > toMinor(amount)) throw new UserError(`The invoices add up to ${money(setAgainst)}, more than the ${money(amount)} received.`);
  const year = Number(d.paidOn.slice(0, 4));
  const orgId = await currentOrgId();

  const result = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [company] = await tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, d.companyId));
    if (!company) throw new UserError("That customer no longer exists.");
    // locked in id order, so two receipts for the same invoices cannot block each other
    const invoices = wanted.length ? await tx.select().from(schema.invoices).where(inArray(schema.invoices.id, wanted.map((x) => x.invoiceId))).orderBy(asc(schema.invoices.id)).for("update") : [];
    const parts = [];
    for (const w of wanted) {
      const inv = invoices.find((i) => i.id === w.invoiceId);
      if (!inv) throw new UserError("That invoice no longer exists.");
      if (inv.companyId !== d.companyId) throw new UserError(`Invoice ${inv.number} belongs to another customer.`);
      if (inv.status === "cancelled") throw new UserError(`Invoice ${inv.number} was cancelled.`);
      if (d.paidOn < inv.issueDate) throw new UserError(wanted.length === 1 ? "The payment date cannot be before the invoice date." : `The payment date cannot be before the date of invoice ${inv.number}.`);
      const paid = await allocatedTo(tx, inv.id);
      const problem = checkPaymentAmount(w.amount, invoiceState(inv, paid, today).balance);
      if (problem) throw new UserError(wanted.length === 1 ? problem : `${inv.number}: ${problem}`);
      parts.push({ inv, amount: w.amount, after: invoiceState(inv, paid + w.amount, today) });
    }
    await assertInLedgerPeriod(tx, orgId, d.paidOn);
    const seq = await nextSeq(tx, "receipt", schema.payments, schema.payments.year, schema.payments.seq, year);
    const number = yearNumber("ZRV", year, seq);
    const [p] = await tx
      .insert(schema.payments)
      .values({
        year,
        seq,
        number,
        companyId: d.companyId,
        paidOn: d.paidOn,
        amount,
        method: d.method,
        bankAccountId: await pickPaymentAccount(tx, orgId, d.bankAccountId, d.method),
        reference: d.reference,
        notes: d.notes,
        createdBy: me.id,
      })
      .returning({ id: schema.payments.id });
    if (parts.length) await tx.insert(schema.paymentAllocations).values(parts.map((x) => ({ paymentId: p.id, invoiceId: x.inv.id, amount: x.amount, appliedOn: d.paidOn, createdBy: me.id })));
    await postReceiptDoc(tx, orgId, p.id, me.id);
    const how = `by ${methodLabel(d.method).toLowerCase()}${d.reference ? ` (${d.reference})` : ""}`;
    for (const x of parts) {
      if (x.after.key === "paid") await closeCollectTask(tx, x.inv.number);
      await tx.insert(schema.activities).values({
        type: "note",
        body: `Payment ${number} received for invoice ${x.inv.number}: ${money(x.amount)} ${how}. ${x.after.key === "paid" ? "Invoice fully paid." : `Still owed: ${money(x.after.balance)}.`}`,
        dealId: x.inv.dealId,
        companyId: x.inv.companyId,
        userId: me.id,
      });
    }
    const advance = fromMinor(toMinor(amount) - toMinor(setAgainst));
    if (advance > 0) await tx.insert(schema.activities).values({ type: "note", body: `Advance ${number} received: ${money(advance)} ${how}, kept until it is applied to an invoice.`, companyId: d.companyId, userId: me.id });
    await audit(tx, {
      userId: me.id,
      action: "payment.record",
      entity: "payment",
      entityId: p.id,
      summary: `${number}: ${money(amount)} from ${company.name} by ${d.method}${parts.length ? `, for ${parts.map((x) => x.inv.number).join(", ")}` : ""}${advance > 0 ? `, advance ${money(advance)}` : ""}`,
      after: { number, companyId: d.companyId, paidOn: d.paidOn, amount, advance, method: d.method, reference: d.reference, allocations: wanted },
    });
    return { id: p.id, number, advance, parts };
  });
  revalidatePath("/tasks");
  refresh({ companyId: d.companyId });
  for (const x of result.parts) refresh({ dealId: x.inv.dealId, orderId: x.inv.orderId, invoiceId: x.inv.id });
  return { id: result.id, number: result.number, advance: result.advance, fullyPaid: result.parts.length > 0 && result.parts.every((x) => x.after.key === "paid") };
}

/** Money received for one invoice, full or part (the invoice page). */
export async function recordPayment(invoiceId: number, input: PaymentInput) {
  const me = await assertFinance();
  const d = parseInput(paymentSchema, input);
  const [inv] = await db.select({ companyId: schema.invoices.companyId }).from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!inv) throw new UserError("That invoice no longer exists.");
  const r = await saveReceipt(me, { ...d, companyId: inv.companyId, allocations: [{ invoiceId, amount: d.amount }] });
  return { id: r.id, number: r.number, fullyPaid: r.fullyPaid };
}

/** A new receipt: pick the customer, tick the invoices it pays and split the amount. What is left stays as an advance. */
export async function createReceipt(input: ReceiptInput) {
  const me = await assertFinance();
  return saveReceipt(me, parseInput(receiptSchema, input));
}

const applySchema = z.object({
  paymentId: z.number().int().positive(),
  invoiceId: z.number().int().positive(),
  amount: z.number().positive("Enter an amount above zero").max(1e10),
  appliedOn: day,
});

/** Sets an advance (what is left of a receipt) against an invoice of the same customer, on the day it is applied. */
export async function applyAdvance(input: z.input<typeof applySchema>) {
  const me = await assertFinance();
  const d = parseInput(applySchema, input);
  const today = dubaiToday();
  if (d.appliedOn > today) throw new UserError("The date cannot be in the future.");
  const amount = round2(d.amount);
  const orgId = await currentOrgId();
  const a = schema.paymentAllocations;
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, d.paymentId)).for("update");
    if (!p) throw new UserError("That payment no longer exists.");
    if (p.voidedAt) throw new UserError("This payment was voided.");
    const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, d.invoiceId)).for("update");
    if (!inv) throw new UserError("That invoice no longer exists.");
    if (inv.companyId !== p.companyId) throw new UserError(`Invoice ${inv.number} belongs to another customer.`);
    if (inv.status === "cancelled") throw new UserError(`Invoice ${inv.number} was cancelled.`);
    if (d.appliedOn < inv.issueDate || d.appliedOn < p.paidOn) throw new UserError("The date cannot be before the invoice or the payment.");
    await assertInLedgerPeriod(tx, orgId, d.appliedOn);
    const [{ used }] = await tx.select({ used: sql<number>`coalesce(sum(${a.amount}), 0)::float` }).from(a).where(and(eq(a.paymentId, p.id), isNull(a.voidedAt)));
    const [{ refunded }] = await tx.select({ refunded: sql<number>`coalesce(sum(${schema.advanceRefunds.amount}), 0)::float` }).from(schema.advanceRefunds).where(and(eq(schema.advanceRefunds.paymentId, p.id), isNull(schema.advanceRefunds.voidedAt)));
    const left = fromMinor(toMinor(p.amount) - toMinor(used) - toMinor(refunded));
    if (toMinor(amount) > toMinor(left)) throw new UserError(`Only ${money(left)} of ${p.number} is left to apply.`);
    const paid = await allocatedTo(tx, inv.id);
    const problem = checkPaymentAmount(amount, invoiceState(inv, paid, today).balance);
    if (problem) throw new UserError(problem);
    const [row] = await tx.insert(a).values({ paymentId: p.id, invoiceId: inv.id, amount, appliedOn: d.appliedOn, createdBy: me.id }).returning({ id: a.id });
    await postAllocationDoc(tx, orgId, row.id, me.id);
    const after = invoiceState(inv, paid + amount, today);
    if (after.key === "paid") await closeCollectTask(tx, inv.number);
    await tx.insert(schema.activities).values({ type: "note", body: `Advance ${p.number} applied to invoice ${inv.number}: ${money(amount)}. ${after.key === "paid" ? "Invoice fully paid." : `Still owed: ${money(after.balance)}.`}`, dealId: inv.dealId, companyId: inv.companyId, userId: me.id });
    await audit(tx, { userId: me.id, action: "payment.apply", entity: "payment", entityId: p.id, summary: `${money(amount)} of ${p.number} applied to ${inv.number}`, after: { allocationId: row.id, invoiceId: inv.id, amount, appliedOn: d.appliedOn } });
    return { allocationId: row.id, dealId: inv.dealId, orderId: inv.orderId, companyId: inv.companyId, invoiceId: inv.id };
  });
  refresh(r);
  revalidatePath("/tasks");
  return { allocationId: r.allocationId };
}

/**
 * Takes a receipt's money off one invoice: the invoice is owed again and the money stays with us as an advance, for
 * another invoice. Also what is needed before cancelling an invoice that was paid.
 */
export async function removeAllocation(allocationId: number, reason: string) {
  const me = await assertFinance();
  const why = parseInput(z.string().trim().min(3, "Say why it is taken off").max(300), reason);
  const orgId = await currentOrgId();
  const a = schema.paymentAllocations;
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [row] = await tx.select().from(a).where(eq(a.id, allocationId)).for("update");
    if (!row) throw new UserError("That payment no longer exists.");
    if (row.voidedAt) throw new UserError("This payment is already off the invoice.");
    const [[p], [inv]] = await Promise.all([tx.select().from(schema.payments).where(eq(schema.payments.id, row.paymentId)), tx.select().from(schema.invoices).where(eq(schema.invoices.id, row.invoiceId))]);
    await assertInLedgerPeriod(tx, orgId, row.appliedOn);
    await tx.update(a).set({ voidedAt: new Date() }).where(eq(a.id, allocationId));
    await postAllocationRemoved(tx, orgId, allocationId, why, me.id);
    await tx.insert(schema.activities).values({ type: "note", body: `${money(row.amount)} of ${p.number} taken off invoice ${inv.number}, kept as an advance: ${why}`, dealId: inv.dealId, companyId: inv.companyId, userId: me.id });
    await audit(tx, { userId: me.id, action: "payment.unapply", entity: "payment", entityId: p.id, summary: `${money(row.amount)} of ${p.number} taken off ${inv.number}: ${why}`, before: { allocationId, invoiceId: inv.id, amount: row.amount } });
    return { dealId: inv.dealId, orderId: inv.orderId, companyId: inv.companyId, invoiceId: inv.id };
  });
  refresh(r);
}

/** A payment entered by mistake is voided (kept, crossed out) with a reason; every invoice it paid is owed again. */
export async function voidPayment(paymentId: number, reason: string) {
  const me = await assertFinance();
  const why = parseInput(z.string().trim().min(3, "Say why the payment is voided").max(300), reason);
  const orgId = await currentOrgId();
  const a = schema.paymentAllocations;
  const touched = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).for("update");
    if (!p) throw new UserError("That payment no longer exists.");
    if (p.voidedAt) throw new UserError("This payment is already voided.");
    await assertInLedgerPeriod(tx, orgId, p.paidOn);
    const live = await tx
      .select({ amount: a.amount, invoiceId: a.invoiceId, number: schema.invoices.number, dealId: schema.invoices.dealId, orderId: schema.invoices.orderId, companyId: schema.invoices.companyId })
      .from(a)
      .innerJoin(schema.invoices, eq(schema.invoices.id, a.invoiceId))
      .where(and(eq(a.paymentId, paymentId), isNull(a.voidedAt)));
    // the same moment on both, so the receipt can still show what it had paid
    const now = new Date();
    const [refund] = await tx.select({ number: schema.advanceRefunds.number }).from(schema.advanceRefunds).where(and(eq(schema.advanceRefunds.paymentId, paymentId), isNull(schema.advanceRefunds.voidedAt))).limit(1);
    if (refund) throw new UserError(`Part of this payment was refunded (${refund.number}). Void that refund first.`);
    await tx.update(schema.payments).set({ voidedAt: now, voidReason: why }).where(eq(schema.payments.id, paymentId));
    await tx.update(a).set({ voidedAt: now }).where(and(eq(a.paymentId, paymentId), isNull(a.voidedAt)));
    await reversePayment(tx, orgId, paymentId, `payment ${p.number} voided: ${why}`, me.id);
    for (const x of live) {
      await tx.insert(schema.activities).values({ type: "note", body: `Payment ${p.number} (${money(x.amount)}) on invoice ${x.number} voided: ${why}`, dealId: x.dealId, companyId: x.companyId, userId: me.id });
    }
    if (!live.length) await tx.insert(schema.activities).values({ type: "note", body: `Advance ${p.number} (${money(p.amount)}) voided: ${why}`, companyId: p.companyId, userId: me.id });
    await audit(tx, {
      userId: me.id,
      action: "payment.void",
      entity: "payment",
      entityId: paymentId,
      summary: `${p.number} (${money(p.amount)}) voided: ${why}`,
      before: { amount: p.amount, paidOn: p.paidOn, allocations: live.map((x) => ({ invoiceId: x.invoiceId, amount: x.amount })) },
      after: { voided: true, reason: why },
    });
    return { companyId: p.companyId, live };
  });
  refresh({ companyId: touched.companyId });
  for (const x of touched.live) refresh({ dealId: x.dealId, orderId: x.orderId, invoiceId: x.invoiceId });
}

const invoiceLineSchema = z.object({
  description: z.string().trim().min(1, "Describe each line").max(500),
  qty: z.number().positive("Quantity must be above zero").max(1e7),
  unitPrice: z.number().min(0, "Price cannot be below zero").max(1e10),
  lineKind: z.enum(["product", "service"]).default("product"),
  /** VAT code of the line; left out, what the invoice's rate means. */
  taxCode: z.enum(SALES_TAX_CODES).optional(),
});

const directInvoiceSchema = z.object({
  companyId: z.number().int().positive("Pick the customer"),
  issueDate: day,
  supplyDate: day.nullable().optional(),
  termsDays: z.number().int().min(0).max(365),
  customerAddress: z.string().trim().max(500).default(""),
  customerRef: z.string().trim().max(60).default(""),
  vatPct: z.number().min(0).max(100),
  /** The quote it is made from, if any. */
  quoteId: z.number().int().positive().nullable().optional(),
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line").max(300),
});
export type DirectInvoiceInput = z.input<typeof directInvoiceSchema>;

/**
 * A tax invoice with no sales order: typed directly, or made from a quote. The same rules and number series as an invoice
 * made from an order, and it posts to the ledger the same way.
 */
export async function createInvoice(input: DirectInvoiceInput) {
  const me = await assertFinance();
  const parsed = directInvoiceSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Check the invoice.");
  const d = parsed.data;
  if (d.issueDate > dubaiToday()) throw new UserError("The invoice date cannot be in the future.");
  if (!(await getSetting("quote_trn")).trim()) throw new UserError("Add our TRN in Accounts › Settings › VAT registration first: a tax invoice must show it.");
  const coded = d.lines.map((l) => ({ ...l, taxCode: l.taxCode ?? taxCodeForRate(d.vatPct) }));
  const t = docTax(coded.map((l) => ({ net: lineTotal(l), code: l.taxCode })));
  if (t.total <= 0) throw new UserError("The invoice total must be above zero.");
  const orgId = await currentOrgId();

  const result = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    await assertInLedgerPeriod(tx, orgId, d.issueDate);
    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, d.companyId));
    if (!company) throw new UserError("That customer no longer exists.");
    const customerAddress = d.customerAddress || company.address || (company.emirate ? `${company.emirate}, United Arab Emirates` : "");
    if (!customerAddress) throw new UserError(`Add ${company.name}'s billing address before issuing the invoice.`);
    const badTrn = trnProblem(company.trn);
    if (badTrn) throw new UserError(`${badTrn} Fix it in the customer's billing details before issuing the invoice.`);

    let quote: typeof schema.quotes.$inferSelect | null = null;
    if (d.quoteId) {
      const [q] = await tx.select().from(schema.quotes).where(eq(schema.quotes.id, d.quoteId)).for("update");
      if (!q) throw new UserError("That quote no longer exists.");
      if (q.companyId !== d.companyId) throw new UserError(`Quote ${q.number} is for another customer.`);
      if (q.status === "rejected") throw new UserError("This quote was rejected. Set it back to Sent first if the customer changed their mind.");
      const [order] = await tx.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, q.id));
      if (order) throw new UserError(`This quote is already order ${order.number}: make the invoice from the order.`);
      const [live] = await tx.select({ number: schema.invoices.number }).from(schema.invoices).where(and(eq(schema.invoices.quoteId, q.id), ne(schema.invoices.status, "cancelled")));
      if (live) throw new UserError(`This quote is already invoice ${live.number}.`);
      quote = q;
    }
    // a quote made for a deal keeps the deal informed; the sale is won now
    const [deal] = quote?.dealId ? await tx.select().from(schema.deals).where(eq(schema.deals.id, quote.dealId)) : [];

    const number = await takeInvoiceNumber(tx);
    const dueDate = dueDateFor(d.issueDate, d.termsDays);
    const [inv] = await tx
      .insert(schema.invoices)
      .values({
        number,
        quoteId: quote?.id ?? null,
        dealId: quote?.dealId ?? null,
        companyId: d.companyId,
        issueDate: d.issueDate,
        supplyDate: d.supplyDate ?? d.issueDate,
        termsDays: d.termsDays,
        dueDate,
        customerName: company.name,
        customerAddress,
        customerTrn: company.trn,
        customerRef: d.customerRef,
        vatPct: t.vatPct,
        subtotal: t.subtotal,
        vatAmount: t.vat,
        total: t.total,
        createdBy: me.id,
      })
      .returning({ id: schema.invoices.id });
    await tx.insert(schema.invoiceItems).values(coded.map((l, position) => ({ invoiceId: inv.id, position, description: l.description, qty: l.qty, unitPrice: round2(l.unitPrice), lineKind: l.lineKind, taxCode: l.taxCode })));
    if (quote) {
      const now = new Date();
      if (quote.status !== "accepted") await tx.update(schema.quotes).set({ status: "accepted", decidedAt: now }).where(eq(schema.quotes.id, quote.id));
      if (deal && deal.stage !== "won") {
        await tx.update(schema.deals).set({ stage: "won", stageChangedAt: now, closedAt: now, lostReason: "", valueAed: quote.subtotal }).where(eq(schema.deals.id, deal.id));
        await tx.insert(schema.activities).values({ type: "stage", body: `Moved from ${stageLabel(deal.stage)} to ${stageLabel("won")} (invoice ${number}).`, dealId: deal.id, companyId: d.companyId, userId: me.id });
      }
    }
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Invoice ${number} issued${quote ? ` from quote ${quote.number}` : ""}: ${money(t.total)} with VAT, ${termsLabel(d.termsDays).toLowerCase()}, due ${dueDate}.`,
      dealId: quote?.dealId ?? null,
      companyId: d.companyId,
      userId: me.id,
    });
    await tx.insert(schema.tasks).values({
      title: collectTitle(number),
      notes: `${company.name}: ${money(t.total)} due ${dueDate}. Record the payment in Accounts when it arrives.`,
      dueDate,
      priority: "normal",
      assignedTo: deal?.ownerId ?? quote?.ownerId ?? company.ownerId ?? me.id,
      createdBy: me.id,
      relatedType: quote?.dealId ? "deal" : null,
      relatedId: quote?.dealId ?? null,
    });
    await postInvoiceDoc(tx, orgId, inv.id, me.id);
    await audit(tx, {
      userId: me.id,
      action: "invoice.issue",
      entity: "invoice",
      entityId: inv.id,
      summary: `${number} issued to ${company.name}${quote ? ` from ${quote.number}` : ""}: ${money(t.total)}`,
      after: { number, quoteId: quote?.id ?? null, issueDate: d.issueDate, dueDate, subtotal: t.subtotal, vatAmount: t.vat, total: t.total },
    });
    return { id: inv.id, number, dealId: quote?.dealId ?? null, quoteId: quote?.id ?? null };
  });
  refresh({ dealId: result.dealId, invoiceId: result.id, companyId: d.companyId });
  revalidatePath("/tasks");
  if (result.quoteId) revalidatePath("/sales", "layout");
  return { id: result.id, number: result.number };
}

const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer name").max(200),
  trn: z.string().trim().max(30).default(""),
  address: z.string().trim().max(500).default(""),
  emirate: z.string().trim().max(60).default(""),
  phone: z.string().trim().max(60).default(""),
});
export type NewCustomerInput = z.input<typeof customerSchema>;

/** A customer's billing details, for the invoice form once they are picked. */
export async function customerBilling(companyId: number) {
  await assertFinance();
  const [c] = await db.select({ address: schema.companies.address, emirate: schema.companies.emirate, trn: schema.companies.trn }).from(schema.companies).where(eq(schema.companies.id, companyId));
  if (!c) throw new UserError("That customer no longer exists.");
  return { address: c.address || (c.emirate ? `${c.emirate}, United Arab Emirates` : ""), trn: c.trn };
}

/** A customer's open invoices and unused advances, for the new receipt form. */
export async function customerOpenItems(companyId: number) {
  await assertFinance();
  const [items, advances] = await Promise.all([openInvoices(companyId), customerAdvances(companyId)]);
  return { items, advance: round2(advances.reduce((s, a) => s + a.left, 0)) };
}

/** A customer added in Accounts, with no lead or deal: the same company record CRM and Sales use, with the same duplicate check. */
export async function createCustomerFromAccounts(input: NewCustomerInput) {
  const me = await assertFinance();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Check the customer.");
  const d = parsed.data;
  const badTrn = trnProblem(d.trn);
  if (badTrn) throw new UserError(badTrn);
  const dup = await duplicateCompany(d.name);
  if (dup) throw new UserError(`"${dup.name}" is already in the list. Pick it instead of adding it twice.`);
  const [row] = await db
    .insert(schema.companies)
    .values({ ...d, nameNorm: normName(d.name), isCustomer: true, ownerId: me.id })
    .returning({ id: schema.companies.id });
  await audit(db, { userId: me.id, action: "customer.create", entity: "company", entityId: row.id, summary: `Customer ${d.name} added`, after: d });
  refresh({ companyId: row.id });
  revalidatePath("/sales", "layout");
  return { id: row.id, name: d.name, trn: d.trn, address: d.address, emirate: d.emirate };
}

const openingSchema = z.object({
  companyId: z.number().int().positive("Pick the customer"),
  number: z.string().trim().min(1, "Enter the Zoho invoice number").max(40),
  issueDate: day,
  termsDays: z.number().int().min(0).max(365),
  total: z.number().positive("Enter what is still owed").max(1e10),
  customerRef: z.string().trim().max(60).default(""),
});
export type OpeningInput = z.input<typeof openingSchema>;

/**
 * A customer invoice still unpaid when the portal took over from Zoho: kept with Zoho's number and the amount still owed,
 * so payments and statements work here. Not a sale of this period, so it stays out of profit and VAT reports.
 */
export async function createOpeningInvoice(input: OpeningInput) {
  const me = await assertFinance();
  const d = parseInput(openingSchema, input);
  if (d.issueDate > dubaiToday()) throw new UserError("The invoice date cannot be in the future.");
  const orgId = await currentOrgId();
  await withOrg(orgId, async (tx) => {
    await assertOpeningDate(tx, orgId, d.issueDate);
    await assertOpeningOpen(tx, orgId);
  });
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, d.companyId));
  if (!company) throw new UserError("That customer no longer exists.");
  const [dup] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.number, d.number));
  if (dup) throw new UserError(`Invoice ${d.number} is already in the portal.`);
  const total = round2(d.total);
  const [inv] = await db
    .insert(schema.invoices)
    .values({
      number: d.number,
      kind: "opening",
      companyId: d.companyId,
      issueDate: d.issueDate,
      supplyDate: d.issueDate,
      termsDays: d.termsDays,
      dueDate: dueDateFor(d.issueDate, d.termsDays),
      customerName: company.name,
      customerAddress: company.address,
      customerTrn: company.trn,
      customerRef: d.customerRef,
      vatPct: 0,
      subtotal: total,
      vatAmount: 0,
      total,
      createdBy: me.id,
    })
    .returning({ id: schema.invoices.id });
  await db.insert(schema.activities).values({ type: "note", body: `Opening balance from Zoho: invoice ${d.number}, ${money(total)} still owed.`, companyId: d.companyId, userId: me.id });
  await audit(db, { userId: me.id, action: "invoice.opening", entity: "invoice", entityId: inv.id, summary: `Opening invoice ${d.number} for ${company.name}: ${money(total)}`, after: { number: d.number, issueDate: d.issueDate, total } });
  refresh({ companyId: d.companyId, invoiceId: inv.id });
  return { id: inv.id };
}
