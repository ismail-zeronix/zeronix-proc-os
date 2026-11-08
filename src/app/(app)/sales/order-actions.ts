"use server";

import { and, asc, eq, ne } from "drizzle-orm";
import { dayString } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertAnyApp } from "@/lib/auth/session";
import { assertDealOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { nextSeq } from "@/lib/doc-numbers";
import { termsLabel, yearNumber } from "@/lib/invoicing";
import { quoteDecided } from "@/lib/notifications/events";
import { money } from "@/lib/quotation";
import { acceptQuote } from "@/lib/quote-accept";
import { audit } from "@/lib/audit";
import { stageLabel, trnProblem } from "@/lib/sales";
import { parseInput, UserError } from "@/lib/user-error";

const day = dayString("Pick a valid date");

function refresh(dealId: number | null, orderId?: number) {
  revalidatePath("/crm", "layout");
  revalidatePath("/sales", "layout");
  revalidatePath("/accounts", "layout");
  if (dealId) revalidatePath(`/crm/deals/${dealId}`);
  if (orderId) revalidatePath(`/sales/orders/${orderId}`);
  revalidatePath("/");
}

const convertSchema = z.object({
  customerRef: z.string().trim().max(80).default(""),
  customerRefDate: day.nullable().optional(),
  termsDays: z.number().int().min(0).max(365),
  deliveryAddress: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(2000).default(""),
});
export type ConvertInput = z.input<typeof convertSchema>;

/**
 * Turns a quote into a sales order (one order per quote). The quote becomes Accepted and the deal Won if they were not
 * already. Lines and totals are copied, so the order never changes when the quote or the deal lines change later.
 */
export async function convertQuoteToOrder(quoteId: number, input: ConvertInput) {
  const me = await assertAnyApp("sales", "accounts");
  await assertDealOf("quotes", quoteId, true);
  const d = parseInput(convertSchema, input);
  const today = dubaiToday();
  const year = Number(today.slice(0, 4));

  const result = await db.transaction(async (tx) => {
    const [q] = await tx.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId)).for("update");
    if (!q) throw new UserError("That quote no longer exists.");
    if (q.status === "rejected") throw new UserError("This quote was rejected. Set it back to Sent first if the customer changed their mind.");
    const [existing] = await tx.select({ id: schema.salesOrders.id, number: schema.salesOrders.number }).from(schema.salesOrders).where(and(eq(schema.salesOrders.quoteId, quoteId), ne(schema.salesOrders.status, "cancelled")));
    if (existing) throw new UserError(`This quote is already order ${existing.number}.`);
    const [invoiced] = await tx.select({ number: schema.invoices.number }).from(schema.invoices).where(and(eq(schema.invoices.quoteId, quoteId), ne(schema.invoices.status, "cancelled")));
    if (invoiced) throw new UserError(`This quote is already invoice ${invoiced.number}.`);
    // an instant quote has no deal: the customer and contact come from the quote
    const [deal] = q.dealId ? await tx.select().from(schema.deals).where(eq(schema.deals.id, q.dealId)) : [];
    const [company] = await tx.select({ name: schema.companies.name, trn: schema.companies.trn }).from(schema.companies).where(eq(schema.companies.id, q.companyId));
    if (!company) throw new UserError("This quote has no customer.");
    const badTrn = trnProblem(company.trn);
    if (badTrn) throw new UserError(`${badTrn} Fix ${company.name}'s billing details in Sales › Customers before making the order.`);
    const items = await tx.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, quoteId)).orderBy(asc(schema.quoteItems.position), asc(schema.quoteItems.id));
    if (!items.length) throw new UserError("This quote has no lines.");

    const seq = await nextSeq(tx, "order", schema.salesOrders, schema.salesOrders.year, schema.salesOrders.seq, year);
    const number = yearNumber("ZSO", year, seq);
    const [order] = await tx
      .insert(schema.salesOrders)
      .values({
        year,
        seq,
        number,
        quoteId,
        dealId: q.dealId,
        companyId: q.companyId,
        contactId: q.contactId ?? deal?.contactId ?? null,
        customerRef: d.customerRef,
        customerRefDate: d.customerRefDate ?? null,
        termsDays: d.termsDays,
        vatPct: q.vatPct,
        subtotal: q.subtotal,
        vatAmount: q.vatAmount,
        total: q.total,
        costTotal: q.costTotal,
        soldWithCost: q.soldWithCost,
        uncostedLines: q.uncostedLines,
        deliveryAddress: d.deliveryAddress,
        notes: d.notes,
        createdBy: me.id,
      })
      .returning({ id: schema.salesOrders.id });
    await tx.insert(schema.salesOrderItems).values(items.map((i, position) => ({ orderId: order.id, position, description: i.description, qty: i.qty, unitPrice: i.unitPrice })));

    // the same acceptance rule as the quote page (lib/quote-accept.ts): other open quotes rejected, deal Won
    const accepted = await acceptQuote(tx, { quoteId, userId: me.id, via: `order ${number}` });
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Order ${number} made from quote ${q.number}: ${money(q.total)} with VAT, ${termsLabel(d.termsDays).toLowerCase()}${d.customerRef ? `, customer PO ${d.customerRef}` : ""}.`,
      dealId: q.dealId,
      companyId: q.companyId,
      userId: me.id,
    });
    await audit(tx, { userId: me.id, action: "order.create", entity: "sales_order", entityId: order.id, summary: `${number} made from ${q.number}: ${money(q.total)}`, after: { quoteId, total: q.total, termsDays: d.termsDays, customerRef: d.customerRef } });
    return { id: order.id, number, dealId: q.dealId, accepted: accepted.changed };
  });
  if (result.accepted) await quoteDecided(quoteId, "accepted", me.id);
  refresh(result.dealId, result.id);
  revalidatePath(`/sales/quotes/${quoteId}`);
  return { id: result.id, number: result.number };
}

const editSchema = convertSchema.partial();

/** PO number, terms, address and notes can change until the order is invoiced. */
export async function updateOrder(orderId: number, input: z.input<typeof editSchema>) {
  await assertAnyApp("sales", "accounts");
  await assertDealOf("sales_orders", orderId, true);
  const d = parseInput(editSchema, input);
  const [o] = await db.select({ status: schema.salesOrders.status, dealId: schema.salesOrders.dealId }).from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId));
  if (!o) throw new UserError("That order no longer exists.");
  if (o.status === "invoiced" || o.status === "cancelled") throw new UserError("This order is closed and cannot be changed.");
  await db.update(schema.salesOrders).set(d).where(eq(schema.salesOrders.id, orderId));
  refresh(o.dealId, orderId);
}

const deliverSchema = z.object({
  deliveredOn: day,
  receivedBy: z.string().trim().max(120).default(""),
  deliveryAddress: z.string().trim().max(500).optional(),
});

/** Records the delivery and gives the delivery note its number (ZDN-year-0001). The whole order goes in one delivery. */
export async function markDelivered(orderId: number, input: z.input<typeof deliverSchema>) {
  const me = await assertAnyApp("sales", "accounts");
  await assertDealOf("sales_orders", orderId, true);
  const d = parseInput(deliverSchema, input);
  if (d.deliveredOn > dubaiToday()) throw new UserError("The delivery date cannot be in the future.");
  const year = Number(d.deliveredOn.slice(0, 4));
  const result = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId)).for("update");
    if (!o) throw new UserError("That order no longer exists.");
    if (o.status !== "open") throw new UserError(o.status === "cancelled" ? "This order was cancelled." : `This order was already delivered (${o.dnNumber}).`);
    // the delivery note needs somewhere it went: the order's delivery address, or the customer's address / emirate
    const [c] = await tx.select({ address: schema.companies.address, emirate: schema.companies.emirate }).from(schema.companies).where(eq(schema.companies.id, o.companyId));
    if (!(d.deliveryAddress ?? o.deliveryAddress).trim() && !c?.address.trim() && !c?.emirate.trim()) throw new UserError("Add the delivery address before marking it delivered.");
    const seq = await nextSeq(tx, "delivery", schema.salesOrders, schema.salesOrders.dnYear, schema.salesOrders.dnSeq, year);
    const dnNumber = yearNumber("ZDN", year, seq);
    await tx
      .update(schema.salesOrders)
      .set({
        status: "delivered",
        dnYear: year,
        dnSeq: seq,
        dnNumber,
        deliveredOn: d.deliveredOn,
        receivedBy: d.receivedBy,
        ...(d.deliveryAddress !== undefined ? { deliveryAddress: d.deliveryAddress } : {}),
      })
      .where(eq(schema.salesOrders.id, orderId));
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Order ${o.number} delivered on ${d.deliveredOn}${d.receivedBy ? `, received by ${d.receivedBy}` : ""} (delivery note ${dnNumber}).`,
      dealId: o.dealId,
      companyId: o.companyId,
      userId: me.id,
    });
    return { dealId: o.dealId, dnNumber };
  });
  refresh(result.dealId, orderId);
  return { dnNumber: result.dnNumber };
}

/** Cancels an order that has no invoice. The deal goes back to Negotiation, so the team decides what happens next. */
export async function cancelOrder(orderId: number, reason: string) {
  const me = await assertAnyApp("sales", "accounts");
  await assertDealOf("sales_orders", orderId, true);
  const why = parseInput(z.string().trim().min(3, "Say why the order is cancelled").max(300), reason);
  const dealId = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId)).for("update");
    if (!o) throw new UserError("That order no longer exists.");
    if (o.status === "invoiced") throw new UserError("This order has an invoice. Cancel the invoice (credit note) in Accounts first.");
    if (o.status === "cancelled") return o.dealId;
    await tx.update(schema.salesOrders).set({ status: "cancelled", cancelReason: why, cancelledAt: new Date() }).where(eq(schema.salesOrders.id, orderId));
    // the quote is open again (Sent), so it can be changed, re-ordered or replaced: the deal never gets stuck
    await tx.update(schema.quotes).set({ status: "sent", decidedAt: null }).where(and(eq(schema.quotes.id, o.quoteId), eq(schema.quotes.status, "accepted")));
    const [deal] = o.dealId ? await tx.select({ stage: schema.deals.stage }).from(schema.deals).where(eq(schema.deals.id, o.dealId)) : [];
    if (o.dealId && deal?.stage === "won") {
      await tx.update(schema.deals).set({ stage: "negotiation", stageChangedAt: new Date(), closedAt: null }).where(eq(schema.deals.id, o.dealId));
      await tx.insert(schema.activities).values({
        type: "stage",
        body: `Moved from ${stageLabel("won")} to ${stageLabel("negotiation")} (order ${o.number} cancelled).`,
        dealId: o.dealId,
        companyId: o.companyId,
        userId: me.id,
      });
    }
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Order ${o.number} cancelled: ${why}. Its quote is open again.`,
      dealId: o.dealId,
      companyId: o.companyId,
      userId: me.id,
    });
    await audit(tx, { userId: me.id, action: "order.cancel", entity: "sales_order", entityId: o.id, summary: `${o.number} cancelled: ${why}`, before: { status: o.status }, after: { status: "cancelled", reason: why } });
    return o.dealId;
  });
  refresh(dealId, orderId);
}
