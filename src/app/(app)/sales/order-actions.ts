"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { assertDealOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { nextSeq } from "@/lib/doc-numbers";
import { termsLabel, yearNumber } from "@/lib/invoicing";
import { money } from "@/lib/quotation";
import { stageLabel, trnProblem } from "@/lib/sales";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

function refresh(dealId: number, orderId?: number) {
  revalidatePath("/crm", "layout");
  revalidatePath("/accounts", "layout");
  revalidatePath(`/crm/deals/${dealId}`);
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
  const me = await assertApp("sales");
  await assertDealOf("quotes", quoteId, true);
  const d = convertSchema.parse(input);
  const today = dubaiToday();
  const year = Number(today.slice(0, 4));

  const result = await db.transaction(async (tx) => {
    const [q] = await tx.select().from(schema.quotes).where(eq(schema.quotes.id, quoteId)).for("update");
    if (!q) throw new Error("That quote no longer exists.");
    if (q.status === "rejected") throw new Error("This quote was rejected. Set it back to Sent first if the customer changed their mind.");
    const [existing] = await tx.select({ id: schema.salesOrders.id, number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, quoteId));
    if (existing) throw new Error(`This quote is already order ${existing.number}.`);
    const [deal] = await tx.select().from(schema.deals).where(eq(schema.deals.id, q.dealId));
    const [company] = await tx.select({ name: schema.companies.name, trn: schema.companies.trn }).from(schema.companies).where(eq(schema.companies.id, deal.companyId));
    if (!company) throw new Error("This deal has no customer company.");
    const badTrn = trnProblem(company.trn);
    if (badTrn) throw new Error(`${badTrn} Fix ${company.name}'s billing details in Sales › Customers before making the order.`);
    const items = await tx.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, quoteId)).orderBy(asc(schema.quoteItems.position), asc(schema.quoteItems.id));
    if (!items.length) throw new Error("This quote has no lines.");

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
        companyId: deal.companyId,
        contactId: deal.contactId,
        customerRef: d.customerRef,
        customerRefDate: d.customerRefDate ?? null,
        termsDays: d.termsDays,
        vatPct: q.vatPct,
        subtotal: q.subtotal,
        vatAmount: q.vatAmount,
        total: q.total,
        costTotal: q.costTotal,
        deliveryAddress: d.deliveryAddress,
        notes: d.notes,
        createdBy: me.id,
      })
      .returning({ id: schema.salesOrders.id });
    await tx.insert(schema.salesOrderItems).values(items.map((i, position) => ({ orderId: order.id, position, description: i.description, qty: i.qty, unitPrice: i.unitPrice })));

    const now = new Date();
    if (q.status !== "accepted") await tx.update(schema.quotes).set({ status: "accepted", decidedAt: now }).where(eq(schema.quotes.id, quoteId));
    if (deal.stage !== "won") {
      await tx
        .update(schema.deals)
        .set({ stage: "won", stageChangedAt: now, closedAt: now, lostReason: "", valueAed: q.subtotal })
        .where(eq(schema.deals.id, q.dealId));
      await tx.insert(schema.activities).values({
        type: "stage",
        body: `Moved from ${stageLabel(deal.stage)} to ${stageLabel("won")} (order ${number}).`,
        dealId: q.dealId,
        companyId: deal.companyId,
        userId: me.id,
      });
    }
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Order ${number} made from quote ${q.number}: ${money(q.total)} with VAT, ${termsLabel(d.termsDays).toLowerCase()}${d.customerRef ? `, customer PO ${d.customerRef}` : ""}.`,
      dealId: q.dealId,
      companyId: deal.companyId,
      userId: me.id,
    });
    return { id: order.id, number, dealId: q.dealId };
  });
  refresh(result.dealId, result.id);
  revalidatePath(`/sales/quotes/${quoteId}`);
  return { id: result.id, number: result.number };
}

const editSchema = convertSchema.partial();

/** PO number, terms, address and notes can change until the order is invoiced. */
export async function updateOrder(orderId: number, input: z.input<typeof editSchema>) {
  await assertApp("sales");
  await assertDealOf("sales_orders", orderId, true);
  const d = editSchema.parse(input);
  const [o] = await db.select({ status: schema.salesOrders.status, dealId: schema.salesOrders.dealId }).from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId));
  if (!o) throw new Error("That order no longer exists.");
  if (o.status === "invoiced" || o.status === "cancelled") throw new Error("This order is closed and cannot be changed.");
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
  const me = await assertApp("sales");
  await assertDealOf("sales_orders", orderId, true);
  const d = deliverSchema.parse(input);
  if (d.deliveredOn > dubaiToday()) throw new Error("The delivery date cannot be in the future.");
  const year = Number(d.deliveredOn.slice(0, 4));
  const result = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId)).for("update");
    if (!o) throw new Error("That order no longer exists.");
    if (o.status !== "open") throw new Error(o.status === "cancelled" ? "This order was cancelled." : `This order was already delivered (${o.dnNumber}).`);
    // the delivery note needs somewhere it went: the order's delivery address, or the customer's address / emirate
    const [c] = await tx.select({ address: schema.companies.address, emirate: schema.companies.emirate }).from(schema.companies).where(eq(schema.companies.id, o.companyId));
    if (!(d.deliveryAddress ?? o.deliveryAddress).trim() && !c?.address.trim() && !c?.emirate.trim()) throw new Error("Add the delivery address before marking it delivered.");
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
  const me = await assertApp("sales");
  await assertDealOf("sales_orders", orderId, true);
  const why = z.string().trim().min(3, "Say why the order is cancelled").max(300).parse(reason);
  const dealId = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.salesOrders).where(eq(schema.salesOrders.id, orderId)).for("update");
    if (!o) throw new Error("That order no longer exists.");
    if (o.status === "invoiced") throw new Error("This order has an invoice. Cancel the invoice (credit note) in Accounts first.");
    if (o.status === "cancelled") return o.dealId;
    await tx.update(schema.salesOrders).set({ status: "cancelled", cancelReason: why, cancelledAt: new Date() }).where(eq(schema.salesOrders.id, orderId));
    const [deal] = await tx.select({ stage: schema.deals.stage }).from(schema.deals).where(eq(schema.deals.id, o.dealId));
    if (deal?.stage === "won") {
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
      body: `Order ${o.number} cancelled: ${why}`,
      dealId: o.dealId,
      companyId: o.companyId,
      userId: me.id,
    });
    return o.dealId;
  });
  refresh(dealId, orderId);
}
