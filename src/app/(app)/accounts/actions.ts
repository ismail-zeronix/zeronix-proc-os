"use server";

import { and, asc, eq, isNull, like, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { nextSeq, takeInvoiceNumber } from "@/lib/doc-numbers";
import { checkPaymentAmount, dueDateFor, invoiceState, methodLabel, termsLabel, yearNumber } from "@/lib/invoicing";
import { money, round2 } from "@/lib/quotation";
import { trnProblem } from "@/lib/sales";
import { getSetting } from "@/lib/settings";

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

const collectTitle = (number: string) => `Collect payment: ${number}`;

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
  const d = issueSchema.parse(input);
  const today = dubaiToday();
  if (d.issueDate > today) throw new Error("The invoice date cannot be in the future.");
  // a UAE tax invoice must carry the seller TRN
  if (!(await getSetting("quote_trn")).trim()) throw new Error("Add our TRN in Admin → Settings → Documents first: a tax invoice must show it.");

  const result = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId)).for("update");
    if (!o) throw new Error("That order no longer exists.");
    if (o.status === "open") throw new Error("Mark the order delivered first: the invoice date of supply is the delivery date.");
    if (o.status === "cancelled") throw new Error("This order was cancelled.");
    if (o.status === "invoiced") throw new Error("This order already has an invoice.");
    if (o.deliveredOn && d.issueDate < o.deliveredOn) throw new Error("The invoice date cannot be before the delivery date.");
    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, o.companyId));
    // a UAE tax invoice needs the customer's address, and a registered customer's TRN must be valid
    const customerAddress = d.customerAddress || o.deliveryAddress || company.address || (company.emirate ? `${company.emirate}, United Arab Emirates` : "");
    if (!customerAddress) throw new Error(`Add ${company.name}'s billing address (Sales › Customers › Billing details) before issuing the invoice.`);
    const badTrn = trnProblem(company.trn);
    if (badTrn) throw new Error(`${badTrn} Fix it in Sales › Customers › Billing details before issuing the invoice.`);
    const items = await tx.select().from(schema.salesOrderItems).where(eq(schema.salesOrderItems.orderId, orderId)).orderBy(asc(schema.salesOrderItems.position), asc(schema.salesOrderItems.id));
    const [deal] = await tx.select({ ownerId: schema.deals.ownerId }).from(schema.deals).where(eq(schema.deals.id, o.dealId));

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
    await tx.insert(schema.invoiceItems).values(items.map((i, position) => ({ invoiceId: inv.id, position, description: i.description, qty: i.qty, unitPrice: i.unitPrice })));
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
      assignedTo: deal?.ownerId ?? o.createdBy ?? me.id,
      createdBy: me.id,
      relatedType: "deal",
      relatedId: o.dealId,
    });
    return { id: inv.id, number, dealId: o.dealId, companyId: o.companyId };
  });
  refresh({ ...result, orderId, invoiceId: result.id });
  revalidatePath("/tasks");
  return { id: result.id, number: result.number };
}

/**
 * Cancels an invoice with a credit note for the full amount (ZCN-year-0001). Only an invoice with no payments on it: void
 * the payments first. The order goes back to Delivered, so a corrected invoice can be issued.
 */
export async function cancelInvoice(invoiceId: number, reason: string) {
  const me = await assertFinance();
  const why = z.string().trim().min(3, "Say why the invoice is cancelled").max(300).parse(reason);
  const today = dubaiToday();
  const year = Number(today.slice(0, 4));
  const result = await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).for("update");
    if (!inv) throw new Error("That invoice no longer exists.");
    if (inv.status === "cancelled") throw new Error("This invoice is already cancelled.");
    const [paid] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.payments)
      .where(and(eq(schema.payments.invoiceId, invoiceId), isNull(schema.payments.voidedAt)));
    if (paid.n > 0) throw new Error("This invoice has payments. Void them first, then cancel the invoice.");
    if (inv.kind === "opening") {
      // an opening balance entered by mistake: no credit note, as the tax invoice itself lives in Zoho
      await tx.update(schema.invoices).set({ status: "cancelled" }).where(eq(schema.invoices.id, invoiceId));
      await tx.insert(schema.activities).values({ type: "note", body: `Opening invoice ${inv.number} removed: ${why}`, companyId: inv.companyId, userId: me.id });
      return { number: null, dealId: null, orderId: null, companyId: inv.companyId };
    }
    const seq = await nextSeq(tx, "credit", schema.creditNotes, schema.creditNotes.year, schema.creditNotes.seq, year);
    const number = yearNumber("ZCN", year, seq);
    await tx.insert(schema.creditNotes).values({
      year,
      seq,
      number,
      invoiceId,
      issueDate: today,
      reason: why,
      subtotal: inv.subtotal,
      vatAmount: inv.vatAmount,
      total: inv.total,
      createdBy: me.id,
    });
    await tx.update(schema.invoices).set({ status: "cancelled" }).where(eq(schema.invoices.id, invoiceId));
    if (inv.orderId) await tx.update(schema.salesOrders).set({ status: "delivered" }).where(eq(schema.salesOrders.id, inv.orderId));
    // the collection task is no longer needed
    await tx.delete(schema.tasks).where(and(eq(schema.tasks.status, "open"), like(schema.tasks.title, `${collectTitle(inv.number)}%`)));
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Invoice ${inv.number} cancelled with credit note ${number}: ${why}`,
      dealId: inv.dealId,
      companyId: inv.companyId,
      userId: me.id,
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
});
export type PaymentInput = z.input<typeof paymentSchema>;

/** Records money received (full or part) and gives the receipt its number (ZRV-year-0001). Fully paid closes the collection task. */
export async function recordPayment(invoiceId: number, input: PaymentInput) {
  const me = await assertFinance();
  const d = paymentSchema.parse(input);
  const today = dubaiToday();
  if (d.paidOn > today) throw new Error("The payment date cannot be in the future.");
  if (d.method === "bank" && !d.reference) throw new Error("Add the bank reference (transfer number) so the payment can be found on the statement.");
  const amount = round2(d.amount);
  const year = Number(d.paidOn.slice(0, 4));

  const result = await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).for("update");
    if (!inv) throw new Error("That invoice no longer exists.");
    if (inv.status === "cancelled") throw new Error("This invoice was cancelled.");
    if (d.paidOn < inv.issueDate) throw new Error("The payment date cannot be before the invoice date.");
    const [sum] = await tx
      .select({ paid: sql<number>`coalesce(sum(${schema.payments.amount}), 0)::float` })
      .from(schema.payments)
      .where(and(eq(schema.payments.invoiceId, invoiceId), isNull(schema.payments.voidedAt)));
    const before = invoiceState(inv, sum.paid, today);
    const problem = checkPaymentAmount(amount, before.balance);
    if (problem) throw new Error(problem);
    const seq = await nextSeq(tx, "receipt", schema.payments, schema.payments.year, schema.payments.seq, year);
    const number = yearNumber("ZRV", year, seq);
    const [p] = await tx
      .insert(schema.payments)
      .values({ year, seq, number, invoiceId, companyId: inv.companyId, paidOn: d.paidOn, amount, method: d.method, reference: d.reference, notes: d.notes, createdBy: me.id })
      .returning({ id: schema.payments.id });
    const after = invoiceState(inv, sum.paid + amount, today);
    if (after.key === "paid") {
      await tx
        .update(schema.tasks)
        .set({ status: "done", doneAt: new Date() })
        .where(and(eq(schema.tasks.status, "open"), like(schema.tasks.title, `${collectTitle(inv.number)}%`)));
    }
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Payment ${number} received for invoice ${inv.number}: ${money(amount)} by ${methodLabel(d.method).toLowerCase()}${d.reference ? ` (${d.reference})` : ""}. ${after.key === "paid" ? "Invoice fully paid." : `Still owed: ${money(after.balance)}.`}`,
      dealId: inv.dealId,
      companyId: inv.companyId,
      userId: me.id,
    });
    return { id: p.id, number, dealId: inv.dealId, orderId: inv.orderId, companyId: inv.companyId, fullyPaid: after.key === "paid" };
  });
  refresh({ ...result, invoiceId });
  if (result.fullyPaid) revalidatePath("/tasks");
  return { id: result.id, number: result.number, fullyPaid: result.fullyPaid };
}

/** A payment entered by mistake is voided (kept, crossed out) with a reason; the invoice balance goes back up. */
export async function voidPayment(paymentId: number, reason: string) {
  const me = await assertFinance();
  const why = z.string().trim().min(3, "Say why the payment is voided").max(300).parse(reason);
  const result = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).for("update");
    if (!p) throw new Error("That payment no longer exists.");
    if (p.voidedAt) throw new Error("This payment is already voided.");
    await tx.update(schema.payments).set({ voidedAt: new Date(), voidReason: why }).where(eq(schema.payments.id, paymentId));
    const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, p.invoiceId));
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Payment ${p.number} (${money(p.amount)}) on invoice ${inv.number} voided: ${why}`,
      dealId: inv.dealId,
      companyId: inv.companyId,
      userId: me.id,
    });
    return { invoiceId: p.invoiceId, dealId: inv.dealId, orderId: inv.orderId, companyId: inv.companyId };
  });
  refresh(result);
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
  const d = openingSchema.parse(input);
  if (d.issueDate > dubaiToday()) throw new Error("The invoice date cannot be in the future.");
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, d.companyId));
  if (!company) throw new Error("That customer no longer exists.");
  const [dup] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.number, d.number));
  if (dup) throw new Error(`Invoice ${d.number} is already in the portal.`);
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
  refresh({ companyId: d.companyId, invoiceId: inv.id });
  return { id: inv.id };
}
