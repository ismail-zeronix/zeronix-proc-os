"use server";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertAnyApp, assertApp } from "@/lib/auth/session";
import { assertDeal, assertDealOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { orderedBoq } from "@/lib/boq";
import { PROJECT_VALID_DAYS } from "@/lib/proposal";
import { getFx, toAed } from "@/lib/fx";
import { addDays, isQuoteStatus, marginOf, money, quoteNumber, quoteStatusLabel, round2, sellPrice, totals, type QuoteStatus } from "@/lib/quotation";
import { snapshotForQuote } from "@/lib/proposals-data";
import { quoteDefaults } from "@/lib/quotes-data";
import { stageLabel } from "@/lib/sales";

const price = z.number().min(0).max(1e9);

function refresh(dealId?: number) {
  revalidatePath("/sales", "layout");
  revalidatePath("/projects", "layout");
  if (dealId) revalidatePath(`/sales/deals/${dealId}`);
  revalidatePath("/");
}

const itemSchema = z.object({
  description: z.string().trim().min(1, "Describe the item").max(400),
  qty: z.number().int().min(1, "Quantity must be at least 1").max(100000),
  /** Our cost per unit in AED, when known. */
  costAed: price.nullable().optional(),
  unitPriceAed: price,
});
export type ItemInput = z.input<typeof itemSchema>;

async function nextPosition(dealId: number): Promise<number> {
  const [r] = await db.select({ n: sql<number>`coalesce(max(${schema.dealItems.position}), -1) + 1` }).from(schema.dealItems).where(eq(schema.dealItems.dealId, dealId));
  return r.n;
}

async function dealExists(dealId: number) {
  const [d] = await db.select({ id: schema.deals.id }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!d) throw new Error("That deal no longer exists.");
}

/** Adds a line typed by hand (price in AED before VAT; cost is optional). */
export async function addItem(dealId: number, input: ItemInput) {
  await assertApp("sales");
  await assertDeal(dealId);
  const d = itemSchema.parse(input);
  await dealExists(dealId);
  await db.insert(schema.dealItems).values({
    dealId,
    position: await nextPosition(dealId),
    description: d.description,
    qty: d.qty,
    costAed: d.costAed ?? null,
    marginPct: marginOf(d.costAed, d.unitPriceAed),
    unitPriceAed: d.unitPriceAed,
  });
  refresh(dealId);
}

/**
 * Adds a line from a supplier's offer. The cost and supplier are read from the database here, not taken from the browser,
 * and the price is cost plus the default margin. Needs the Procurement app, because it shows what we pay.
 */
export async function addItemFromOffer(dealId: number, offerId: number, qty = 1, marginPct?: number) {
  await assertApp("sales");
  await assertApp("procurement");
  await assertDeal(dealId);
  const q = z.number().int().min(1).max(100000).parse(qty);
  await dealExists(dealId);
  const [o] = await db
    .select({
      id: schema.offers.id,
      productId: schema.offers.productId,
      price: schema.offers.price,
      currency: schema.offers.currency,
      supplierName: schema.suppliers.name,
      brand: schema.products.brand,
      modelName: schema.products.modelName,
      partNumber: schema.products.partNumber,
      specSummary: schema.products.specSummary,
    })
    .from(schema.offers)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.offers.supplierId))
    .innerJoin(schema.products, eq(schema.products.id, schema.offers.productId))
    .where(eq(schema.offers.id, offerId));
  if (!o) throw new Error("That offer no longer exists.");
  if (o.price == null) throw new Error("This offer has no price (price on request). Add the line by hand with the price you are given.");
  const cost = toAed(o.price, o.currency, await getFx());
  if (cost == null) throw new Error(`There is no AED rate for ${o.currency}. Add the line by hand with the cost in AED.`);
  const defaults = await quoteDefaults();
  const margin = marginPct == null ? defaults.marginPct : z.number().min(0).max(300).parse(marginPct);
  const unit = sellPrice(cost, margin);
  const label = [o.brand, o.modelName, o.partNumber].filter(Boolean).join(" ");
  await db.insert(schema.dealItems).values({
    dealId,
    position: await nextPosition(dealId),
    description: (o.specSummary ? `${label}, ${o.specSummary}` : label).slice(0, 400),
    qty: q,
    productId: o.productId,
    offerId: o.id,
    supplierName: o.supplierName,
    costAed: cost,
    marginPct: marginOf(cost, unit),
    unitPriceAed: unit,
  });
  refresh(dealId);
}

export async function updateItem(itemId: number, input: ItemInput) {
  await assertApp("sales");
  await assertDealOf("deal_items", itemId);
  const d = itemSchema.parse(input);
  const [row] = await db.update(schema.dealItems)
    .set({ description: d.description, qty: d.qty, costAed: d.costAed ?? null, marginPct: marginOf(d.costAed, d.unitPriceAed), unitPriceAed: d.unitPriceAed })
    .where(eq(schema.dealItems.id, itemId))
    .returning({ dealId: schema.dealItems.dealId });
  if (row) refresh(row.dealId);
}

export async function deleteItem(itemId: number) {
  await assertApp("sales");
  await assertDealOf("deal_items", itemId);
  const [row] = await db.delete(schema.dealItems).where(eq(schema.dealItems.id, itemId)).returning({ dealId: schema.dealItems.dealId });
  if (row) refresh(row.dealId);
}

const PROJECT_QUOTE_TERMS = "Scope, payment schedule, timeline, warranty, exclusions and terms as set out in the attached proposal.";

const quoteInput = z.object({
  validDays: z.number().int().min(1).max(180).optional(),
  vatPct: z.number().min(0).max(30).optional(),
  terms: z.string().trim().max(2000).optional(),
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The deal's lines, checked: at least one, and every line has a selling price. For a project the lines come in BOQ
 * section order, and optional extras are left out (they are offered on the proposal, not part of the quoted total).
 */
async function pricedLines(tx: Tx, dealId: number) {
  const all = await tx.select().from(schema.dealItems).where(eq(schema.dealItems.dealId, dealId)).orderBy(schema.dealItems.position, schema.dealItems.id);
  const [project] = await tx
    .select({ sections: schema.projects.boqSections })
    .from(schema.projects)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .where(and(eq(schema.projects.dealId, dealId), eq(schema.deals.kind, "project")));
  const items = project ? orderedBoq(all, project.sections).filter((i) => !i.optional) : all;
  if (!items.length) throw new Error("Add at least one item before making a quote.");
  const unpriced = items.find((i) => !(i.unitPriceAed > 0));
  if (unpriced) throw new Error(`"${unpriced.description.slice(0, 40)}" has no selling price yet.`);
  return items;
}

/** The deal's accepted quote and its newest open one (draft or sent, also when past its date). */
async function quotesInPlay(tx: Tx, dealId: number) {
  const rows = await tx
    .select({ id: schema.quotes.id, number: schema.quotes.number, status: schema.quotes.status })
    .from(schema.quotes)
    .where(eq(schema.quotes.dealId, dealId))
    .orderBy(desc(schema.quotes.createdAt));
  return { accepted: rows.find((q) => q.status === "accepted"), open: rows.find((q) => q.status === "draft" || q.status === "sent") };
}

/**
 * Turns the deal's lines into a numbered quote. The lines are copied, so later edits to the deal never change a quote that
 * was already made. Numbers are ZQ-year-0001 and restart every year; two people saving at once cannot get the same number.
 * A deal has one quote in play: while one is open it is revised (reviseQuote), and after one is accepted no new one is made.
 */
export async function createQuote(dealId: number, input: z.input<typeof quoteInput> = {}) {
  // project quotes are made from the BOQ in the Projects app
  const me = await assertAnyApp("sales", "projects");
  await assertDeal(dealId);
  const d = quoteInput.parse(input);
  const defaults = await quoteDefaults();
  const today = dubaiToday();
  const year = Number(today.slice(0, 4));
  const vatPct = d.vatPct ?? defaults.vatPct;

  const result = await db.transaction(async (tx) => {
    const [deal] = await tx.select({ title: schema.deals.title, companyId: schema.deals.companyId, kind: schema.deals.kind }).from(schema.deals).where(eq(schema.deals.id, dealId));
    if (!deal) throw new Error("That deal no longer exists.");
    // one quote at a time per deal (the lock stops two clicks at once from both getting through)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7012, ${dealId})`);
    const { accepted, open } = await quotesInPlay(tx, dealId);
    if (accepted) throw new Error(`Quote ${accepted.number} was already accepted for this deal, so no new quote is needed.`);
    if (open) throw new Error(`Quote ${open.number} is still open. Update it instead, or mark it rejected to start a new one.`);
    const items = await pricedLines(tx, dealId);

    await tx.execute(sql`SELECT pg_advisory_xact_lock(7011)`);
    const [last] = await tx.select({ n: sql<number>`coalesce(max(${schema.quotes.seq}), 0)` }).from(schema.quotes).where(eq(schema.quotes.year, year));
    const seq = last.n + 1;
    const number = quoteNumber(year, seq);
    const t = totals(items.map((i) => ({ qty: i.qty, unitPrice: i.unitPriceAed, cost: i.costAed })), vatPct);
    // project quotes stay open longer: the customer has a site and a scope to agree
    const validUntil = addDays(today, d.validDays ?? (deal.kind === "project" ? PROJECT_VALID_DAYS : defaults.validDays));

    const [quote] = await tx
      .insert(schema.quotes)
      .values({
        year,
        seq,
        number,
        dealId,
        validUntil,
        vatPct,
        // a project's warranty, exclusions and conditions are written in its proposal, not in the product terms
        terms: d.terms ?? (deal.kind === "project" ? PROJECT_QUOTE_TERMS : defaults.terms),
        subtotal: t.subtotal,
        vatAmount: t.vat,
        total: t.total,
        costTotal: t.cost,
        createdBy: me.id,
      })
      .returning({ id: schema.quotes.id });
    await tx.insert(schema.quoteItems).values(items.map((i, position) => ({ quoteId: quote.id, position, description: i.description, qty: i.qty, unitPrice: i.unitPriceAed, section: i.section, unit: i.unit })));
    // a project quote carries its proposal, frozen as it is now (the quote print, PDF and email show it)
    await snapshotForQuote(tx, dealId, { id: quote.id, number, vatPct, validUntil }, me.id);
    // the deal is now worth what we quoted (before VAT)
    await tx.update(schema.deals).set({ valueAed: t.subtotal }).where(eq(schema.deals.id, dealId));
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Quote ${number} made: ${money(t.total)} with VAT (${items.length} item${items.length === 1 ? "" : "s"}).`,
      dealId,
      companyId: deal.companyId,
      userId: me.id,
    });
    return { id: quote.id, number };
  });
  refresh(dealId);
  return result;
}

/**
 * Rewrites an open quote (draft or sent) with the deal's current lines, keeping its number and status, so a changed price or
 * quantity does not need a second quote. Validity starts again from today. If it was already sent, send it again.
 */
export async function reviseQuote(quoteId: number) {
  const me = await assertAnyApp("sales", "projects");
  await assertDealOf("quotes", quoteId);
  const defaults = await quoteDefaults();
  const result = await db.transaction(async (tx) => {
    const [q] = await tx
      .select({ number: schema.quotes.number, status: schema.quotes.status, dealId: schema.quotes.dealId, vatPct: schema.quotes.vatPct, total: schema.quotes.total })
      .from(schema.quotes)
      .where(eq(schema.quotes.id, quoteId))
      .for("update");
    if (!q) throw new Error("That quote no longer exists.");
    if (q.status !== "draft" && q.status !== "sent") throw new Error(`Quote ${q.number} was ${quoteStatusLabel(q.status).toLowerCase()} and cannot be changed.`);
    const [order] = await tx.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, quoteId));
    if (order) throw new Error(`Quote ${q.number} became order ${order.number} and cannot be changed.`);
    const [deal] = await tx.select({ companyId: schema.deals.companyId, kind: schema.deals.kind }).from(schema.deals).where(eq(schema.deals.id, q.dealId));
    const items = await pricedLines(tx, q.dealId);
    const t = totals(items.map((i) => ({ qty: i.qty, unitPrice: i.unitPriceAed, cost: i.costAed })), q.vatPct);
    const validUntil = addDays(dubaiToday(), deal.kind === "project" ? PROJECT_VALID_DAYS : defaults.validDays);

    await tx.delete(schema.quoteItems).where(eq(schema.quoteItems.quoteId, quoteId));
    await tx.insert(schema.quoteItems).values(items.map((i, position) => ({ quoteId, position, description: i.description, qty: i.qty, unitPrice: i.unitPriceAed, section: i.section, unit: i.unit })));
    await snapshotForQuote(tx, q.dealId, { id: quoteId, number: q.number, vatPct: q.vatPct, validUntil }, me.id);
    await tx
      .update(schema.quotes)
      .set({ subtotal: t.subtotal, vatAmount: t.vat, total: t.total, costTotal: t.cost, validUntil })
      .where(eq(schema.quotes.id, quoteId));
    await tx.update(schema.deals).set({ valueAed: t.subtotal }).where(eq(schema.deals.id, q.dealId));
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Quote ${q.number} updated: ${money(round2(q.total))} to ${money(t.total)} with VAT (${items.length} item${items.length === 1 ? "" : "s"}).${q.status === "sent" ? " Send it to the customer again." : ""}`,
      dealId: q.dealId,
      companyId: deal.companyId,
      userId: me.id,
    });
    return { id: quoteId, number: q.number, dealId: q.dealId, wasSent: q.status === "sent" };
  });
  refresh(result.dealId);
  revalidatePath(`/sales/quotes/${quoteId}`);
  return result;
}

const quotePatch = z.object({
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date").optional(),
  terms: z.string().trim().max(2000).optional(),
});

/** Change the valid-until date or the terms of a quote that is still a draft or waiting for an answer. */
export async function updateQuote(quoteId: number, patch: z.input<typeof quotePatch>) {
  await assertApp("sales");
  await assertDealOf("quotes", quoteId);
  const d = quotePatch.parse(patch);
  const [q] = await db.select({ status: schema.quotes.status, dealId: schema.quotes.dealId }).from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!q) throw new Error("That quote no longer exists.");
  if (q.status === "accepted" || q.status === "rejected") throw new Error("A quote the customer has answered cannot be changed.");
  const set: Partial<typeof schema.quotes.$inferInsert> = {};
  if (d.validUntil) set.validUntil = d.validUntil;
  if (d.terms !== undefined) set.terms = d.terms;
  if (Object.keys(set).length) await db.update(schema.quotes).set(set).where(eq(schema.quotes.id, quoteId));
  refresh(q.dealId);
  revalidatePath(`/sales/quotes/${quoteId}`);
}

const BEFORE_QUOTED = new Set(["new", "contacted", "requirement", "sourcing"]);

/**
 * Sent: the deal moves to "Quote sent" if it was earlier than that. Accepted: the deal is Won at the quoted amount.
 * Rejected: the deal stays where it is, so the salesperson decides between negotiating and marking it Lost.
 * Every change is written to the deal's timeline. ("Expired" is never stored: a sent quote past its date just shows as expired.)
 */
export async function setQuoteStatus(quoteId: number, status: string) {
  const me = await assertApp("sales");
  await assertDealOf("quotes", quoteId);
  if (!isQuoteStatus(status) || status === "expired") throw new Error("Pick Draft, Sent, Accepted or Rejected.");
  const next: QuoteStatus = status;
  const result = await db.transaction(async (tx) => {
    const [q] = await tx
      .select({ number: schema.quotes.number, status: schema.quotes.status, dealId: schema.quotes.dealId, subtotal: schema.quotes.subtotal, total: schema.quotes.total })
      .from(schema.quotes)
      .where(eq(schema.quotes.id, quoteId));
    if (!q) throw new Error("That quote no longer exists.");
    if (q.status === next) return { dealId: q.dealId, stage: null as string | null };
    const [order] = await tx.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, quoteId));
    if (order) throw new Error(`This quote became order ${order.number}, so it stays Accepted. Cancel the order instead.`);
    const [deal] = await tx.select({ stage: schema.deals.stage, companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, q.dealId));
    const now = new Date();
    // keep one quote in play per deal
    const others = await tx
      .select({ id: schema.quotes.id, number: schema.quotes.number, status: schema.quotes.status })
      .from(schema.quotes)
      .where(and(eq(schema.quotes.dealId, q.dealId), ne(schema.quotes.id, quoteId)));
    const otherAccepted = others.find((o) => o.status === "accepted");
    if (otherAccepted && next !== "rejected") throw new Error(`Quote ${otherAccepted.number} is already accepted for this deal.`);
    const otherOpen = others.filter((o) => o.status === "draft" || o.status === "sent");
    if (otherOpen.length && (next === "draft" || next === "sent"))
      throw new Error(`Quote ${otherOpen[0].number} is already open for this deal. Update that one, or mark it rejected first.`);
    if (next === "accepted" && otherOpen.length) {
      // the customer took this one, so the older open quotes are answered too
      await tx.update(schema.quotes).set({ status: "rejected", decidedAt: now }).where(inArray(schema.quotes.id, otherOpen.map((o) => o.id)));
      await tx.insert(schema.activities).values({
        type: "note",
        body: `${otherOpen.map((o) => o.number).join(", ")} marked rejected: replaced by ${q.number}.`,
        dealId: q.dealId,
        companyId: deal.companyId,
        userId: me.id,
      });
    }
    await tx
      .update(schema.quotes)
      .set({
        status: next,
        sentAt: next === "sent" ? now : next === "draft" ? null : undefined,
        decidedAt: next === "accepted" || next === "rejected" ? now : null,
      })
      .where(eq(schema.quotes.id, quoteId));
    let movedTo: string | null = null;
    if (next === "sent" && BEFORE_QUOTED.has(deal.stage)) movedTo = "quoted";
    if (next === "accepted" && deal.stage !== "won") movedTo = "won";
    if (movedTo) {
      await tx
        .update(schema.deals)
        .set({
          stage: movedTo,
          stageChangedAt: now,
          closedAt: movedTo === "won" ? now : null,
          lostReason: "",
          ...(movedTo === "won" ? { valueAed: q.subtotal } : {}),
        })
        .where(eq(schema.deals.id, q.dealId));
      await tx.insert(schema.activities).values({
        type: "stage",
        body: `Moved from ${stageLabel(deal.stage)} to ${stageLabel(movedTo)} (quote ${q.number} ${quoteStatusLabel(next).toLowerCase()}).`,
        dealId: q.dealId,
        companyId: deal.companyId,
        userId: me.id,
      });
    }
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Quote ${q.number} marked ${quoteStatusLabel(next).toLowerCase()} (${money(round2(q.total))}).`,
      dealId: q.dealId,
      companyId: deal.companyId,
      userId: me.id,
    });
    return { dealId: q.dealId, stage: movedTo };
  });
  refresh(result.dealId);
  revalidatePath(`/sales/quotes/${quoteId}`);
  return result;
}

/** A draft can be removed by anyone in Sales; a quote that was sent can only be removed by an admin. */
export async function deleteQuote(quoteId: number) {
  const me = await assertApp("sales");
  await assertDealOf("quotes", quoteId);
  const [q] = await db.select({ status: schema.quotes.status, dealId: schema.quotes.dealId }).from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!q) return;
  const [order] = await db.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, quoteId));
  if (order) throw new Error(`This quote became order ${order.number} and cannot be deleted.`);
  if (q.status !== "draft" && me.role !== "admin") throw new Error("Only an admin can delete a quote that was sent. Mark it rejected instead.");
  await db.delete(schema.quotes).where(and(eq(schema.quotes.id, quoteId)));
  refresh(q.dealId);
}
