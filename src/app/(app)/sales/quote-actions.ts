"use server";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertAnyApp, assertApp } from "@/lib/auth/session";
import { assertDeal, assertDealOf, canSeeCompany, currentViewer, dealVisible } from "@/lib/auth/visibility";
import { allowedApps } from "@/lib/apps";
import { dubaiToday } from "@/lib/dates";
import { orderedBoq } from "@/lib/boq";
import { PROJECT_VALID_DAYS } from "@/lib/proposal";
import { getFx, toAed } from "@/lib/fx";
import { addDays, isQuoteStatus, marginOf, money, quoteNumber, quoteStatusLabel, round2, sellPrice, totals, type QuoteStatus } from "@/lib/quotation";
import { snapshotForQuote } from "@/lib/proposals-data";
import { quoteDefaults } from "@/lib/quotes-data";
import { stageLabel } from "@/lib/sales";

const price = z.number().min(0).max(1e9);

function refresh(dealId?: number | null) {
  revalidatePath("/crm", "layout");
  revalidatePath("/projects", "layout");
  if (dealId) revalidatePath(`/crm/deals/${dealId}`);
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

/** A line's values checked, with the first problem as one plain sentence for the toast (not a JSON dump). */
function parseItem(input: ItemInput) {
  const r = itemSchema.safeParse(input);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Check the line.");
  return r.data;
}

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
  await assertDeal(dealId, true);
  const d = parseItem(input);
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
  await assertDeal(dealId, true);
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
  await assertDealOf("deal_items", itemId, true);
  const d = parseItem(input);
  const [row] = await db.update(schema.dealItems)
    .set({ description: d.description, qty: d.qty, costAed: d.costAed ?? null, marginPct: marginOf(d.costAed, d.unitPriceAed), unitPriceAed: d.unitPriceAed })
    .where(eq(schema.dealItems.id, itemId))
    .returning({ dealId: schema.dealItems.dealId });
  if (row) refresh(row.dealId);
}

export async function deleteItem(itemId: number) {
  await assertApp("sales");
  await assertDealOf("deal_items", itemId, true);
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
  await assertDeal(dealId, true);
  const d = quoteInput.parse(input);
  const defaults = await quoteDefaults();
  const today = dubaiToday();
  const year = Number(today.slice(0, 4));
  const vatPct = d.vatPct ?? defaults.vatPct;

  const result = await db.transaction(async (tx) => {
    const [deal] = await tx
      .select({ title: schema.deals.title, companyId: schema.deals.companyId, contactId: schema.deals.contactId, ownerId: schema.deals.ownerId, kind: schema.deals.kind })
      .from(schema.deals)
      .where(eq(schema.deals.id, dealId));
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
        companyId: deal.companyId,
        contactId: deal.contactId,
        ownerId: deal.ownerId ?? me.id,
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
    await tx.insert(schema.quoteItems).values(items.map((i, position) => ({ quoteId: quote.id, position, description: i.description, qty: i.qty, unitPrice: i.unitPriceAed, section: i.section, unit: i.unit, costAed: i.costAed, supplierName: i.supplierName })));
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
  await assertDealOf("quotes", quoteId, true);
  const defaults = await quoteDefaults();
  const result = await db.transaction(async (tx) => {
    const [q] = await tx
      .select({ number: schema.quotes.number, status: schema.quotes.status, dealId: schema.quotes.dealId, vatPct: schema.quotes.vatPct, total: schema.quotes.total })
      .from(schema.quotes)
      .where(eq(schema.quotes.id, quoteId))
      .for("update");
    if (!q) throw new Error("That quote no longer exists.");
    if (q.dealId == null) throw new Error(`Quote ${q.number} has no deal: change it on the quote page (Edit).`);
    const dealId = q.dealId;
    if (q.status !== "draft" && q.status !== "sent") throw new Error(`Quote ${q.number} was ${quoteStatusLabel(q.status).toLowerCase()} and cannot be changed.`);
    const [order] = await tx.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, quoteId));
    if (order) throw new Error(`Quote ${q.number} became order ${order.number} and cannot be changed.`);
    const [deal] = await tx.select({ companyId: schema.deals.companyId, kind: schema.deals.kind }).from(schema.deals).where(eq(schema.deals.id, dealId));
    const items = await pricedLines(tx, dealId);
    const t = totals(items.map((i) => ({ qty: i.qty, unitPrice: i.unitPriceAed, cost: i.costAed })), q.vatPct);
    const validUntil = addDays(dubaiToday(), deal.kind === "project" ? PROJECT_VALID_DAYS : defaults.validDays);

    await tx.delete(schema.quoteItems).where(eq(schema.quoteItems.quoteId, quoteId));
    await tx.insert(schema.quoteItems).values(items.map((i, position) => ({ quoteId, position, description: i.description, qty: i.qty, unitPrice: i.unitPriceAed, section: i.section, unit: i.unit, costAed: i.costAed, supplierName: i.supplierName })));
    await snapshotForQuote(tx, dealId, { id: quoteId, number: q.number, vatPct: q.vatPct, validUntil }, me.id);
    await tx
      .update(schema.quotes)
      .set({ subtotal: t.subtotal, vatAmount: t.vat, total: t.total, costTotal: t.cost, validUntil })
      .where(eq(schema.quotes.id, quoteId));
    await tx.update(schema.deals).set({ valueAed: t.subtotal }).where(eq(schema.deals.id, dealId));
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Quote ${q.number} updated: ${money(round2(q.total))} to ${money(t.total)} with VAT (${items.length} item${items.length === 1 ? "" : "s"}).${q.status === "sent" ? " Send it to the customer again." : ""}`,
      dealId,
      companyId: deal.companyId,
      userId: me.id,
    });
    return { id: quoteId, number: q.number, dealId, wasSent: q.status === "sent" };
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
  await assertDealOf("quotes", quoteId, true);
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
  await assertDealOf("quotes", quoteId, true);
  if (!isQuoteStatus(status) || status === "expired") throw new Error("Pick Draft, Sent, Accepted or Rejected.");
  const next: QuoteStatus = status;
  const result = await db.transaction(async (tx) => {
    const [q] = await tx
      .select({ number: schema.quotes.number, status: schema.quotes.status, dealId: schema.quotes.dealId, companyId: schema.quotes.companyId, subtotal: schema.quotes.subtotal, total: schema.quotes.total })
      .from(schema.quotes)
      .where(eq(schema.quotes.id, quoteId));
    if (!q) throw new Error("That quote no longer exists.");
    if (q.status === next) return { dealId: q.dealId, stage: null as string | null };
    const [order] = await tx.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, quoteId));
    if (order) throw new Error(`This quote became order ${order.number}, so it stays Accepted. Cancel the order instead.`);
    // an instant quote has no deal: no stage to move, no other quotes to keep in line
    const [deal] = q.dealId ? await tx.select({ stage: schema.deals.stage }).from(schema.deals).where(eq(schema.deals.id, q.dealId)) : [];
    const now = new Date();
    // keep one quote in play per deal
    const others = q.dealId
      ? await tx
          .select({ id: schema.quotes.id, number: schema.quotes.number, status: schema.quotes.status })
          .from(schema.quotes)
          .where(and(eq(schema.quotes.dealId, q.dealId), ne(schema.quotes.id, quoteId)))
      : [];
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
        companyId: q.companyId,
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
    if (deal && next === "sent" && BEFORE_QUOTED.has(deal.stage)) movedTo = "quoted";
    if (deal && next === "accepted" && deal.stage !== "won") movedTo = "won";
    if (deal && q.dealId && movedTo) {
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
        companyId: q.companyId,
        userId: me.id,
      });
    }
    await tx.insert(schema.activities).values({
      type: "note",
      body: `Quote ${q.number} marked ${quoteStatusLabel(next).toLowerCase()} (${money(round2(q.total))}).`,
      dealId: q.dealId,
      companyId: q.companyId,
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
  await assertDealOf("quotes", quoteId, true);
  const [q] = await db.select({ status: schema.quotes.status, dealId: schema.quotes.dealId }).from(schema.quotes).where(eq(schema.quotes.id, quoteId));
  if (!q) return;
  const [order] = await db.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, quoteId));
  if (order) throw new Error(`This quote became order ${order.number} and cannot be deleted.`);
  if (q.status !== "draft" && me.role !== "admin") throw new Error("Only an admin can delete a quote that was sent. Mark it rejected instead.");
  await db.delete(schema.quotes).where(and(eq(schema.quotes.id, quoteId)));
  refresh(q.dealId);
}

// ---------- the quote page (Sales › Quotes › New / Edit) ----------

const lineSchema = z.object({
  description: z.string().trim().min(1, "Describe each line").max(400),
  qty: z.number().int().min(1, "Quantity must be at least 1").max(100000),
  costAed: price.nullable().optional(),
  unitPriceAed: z.number().positive("Every line needs a selling price").max(1e9),
  supplierName: z.string().trim().max(160).default(""),
});

const saveSchema = z.object({
  companyId: z.number().int().positive("Pick the customer"),
  /** A CRM deal to link it to (a lead being quoted); leave empty for an instant quote to a customer. */
  dealId: z.number().int().positive().nullable().optional(),
  contactId: z.number().int().positive().nullable().optional(),
  /** The salesperson it is in the name of. */
  ownerId: z.number().int().positive("Pick the salesperson"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the valid-until date"),
  termsDays: z.number().int().min(0).max(365),
  vatPct: z.number().min(0).max(100),
  lines: z.array(lineSchema).min(1, "Add at least one line").max(300),
  terms: z.string().trim().max(4000).default(""),
  notes: z.string().trim().max(2000).default(""),
});
export type SaveQuoteInput = z.input<typeof saveSchema>;

/**
 * Saves the quote page: a new quote (`quoteId` null) or changes to an open one. The customer is required; the deal is
 * optional, so a customer can be quoted at once without a lead. With a deal, the deal follows (value, timeline) and keeps
 * one quote in play. The salesperson may be someone other than who types it. Lines are kept with their cost, never printed.
 */
export async function saveQuote(quoteId: number | null, input: SaveQuoteInput) {
  const me = await assertApp("sales");
  const r = saveSchema.safeParse(input);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Check the quote.");
  const d = r.data;
  const v = await currentViewer(true);
  if (!(await canSeeCompany(v, d.companyId))) throw new Error("That customer does not exist or is not yours.");
  if (d.validUntil < dubaiToday()) throw new Error("The valid-until date is in the past.");
  const [owner] = await db.select({ id: schema.users.id, role: schema.users.role, apps: schema.users.apps, isActive: schema.users.isActive }).from(schema.users).where(eq(schema.users.id, d.ownerId));
  if (!owner?.isActive || !allowedApps(owner).includes("sales")) throw new Error("Pick a salesperson who uses Sales.");
  if (d.contactId) {
    const [c] = await db.select({ companyId: schema.contacts.companyId }).from(schema.contacts).where(eq(schema.contacts.id, d.contactId));
    if (c?.companyId !== d.companyId) throw new Error("That contact is not at this customer.");
  }
  if (quoteId) await assertDealOf("quotes", quoteId, true);
  const dealId = d.dealId ?? null;
  if (dealId) {
    await assertDeal(dealId, true);
    const [deal] = await db.select({ companyId: schema.deals.companyId, kind: schema.deals.kind }).from(schema.deals).where(eq(schema.deals.id, dealId));
    if (!deal) throw new Error("That deal no longer exists.");
    if (deal.companyId !== d.companyId) throw new Error("That deal belongs to another customer.");
    if (deal.kind === "project") throw new Error("A project is quoted from its BOQ in Projects.");
  }
  const t = totals(d.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPriceAed, cost: l.costAed ?? null })), d.vatPct);
  const today = dubaiToday();
  const year = Number(today.slice(0, 4));

  const result = await db.transaction(async (tx) => {
    let id = quoteId;
    let number = "";
    let before: { total: number; status: string; dealId: number | null } | null = null;
    if (dealId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7012, ${dealId})`);
      const { accepted, open } = await quotesInPlay(tx, dealId);
      const other = [accepted, open].find((x) => x && x.id !== quoteId);
      if (other) throw new Error(`Quote ${other.number} is already ${other.status === "accepted" ? "accepted" : "open"} for this deal. Edit that one instead.`);
    }
    if (id) {
      const [q] = await tx.select().from(schema.quotes).where(eq(schema.quotes.id, id)).for("update");
      if (!q) throw new Error("That quote no longer exists.");
      if (q.status !== "draft" && q.status !== "sent") throw new Error(`Quote ${q.number} was ${quoteStatusLabel(q.status).toLowerCase()} and cannot be changed.`);
      const [order] = await tx.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(eq(schema.salesOrders.quoteId, id));
      if (order) throw new Error(`Quote ${q.number} became order ${order.number} and cannot be changed.`);
      before = { total: q.total, status: q.status, dealId: q.dealId };
      number = q.number;
      await tx
        .update(schema.quotes)
        .set({ dealId, companyId: d.companyId, contactId: d.contactId ?? null, ownerId: d.ownerId, validUntil: d.validUntil, termsDays: d.termsDays, vatPct: d.vatPct, terms: d.terms, notes: d.notes, subtotal: t.subtotal, vatAmount: t.vat, total: t.total, costTotal: t.cost })
        .where(eq(schema.quotes.id, id));
      await tx.delete(schema.quoteItems).where(eq(schema.quoteItems.quoteId, id));
    } else {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7011)`);
      const [last] = await tx.select({ n: sql<number>`coalesce(max(${schema.quotes.seq}), 0)` }).from(schema.quotes).where(eq(schema.quotes.year, year));
      const seq = last.n + 1;
      number = quoteNumber(year, seq);
      const [q] = await tx
        .insert(schema.quotes)
        .values({ year, seq, number, dealId, companyId: d.companyId, contactId: d.contactId ?? null, ownerId: d.ownerId, validUntil: d.validUntil, termsDays: d.termsDays, vatPct: d.vatPct, terms: d.terms, notes: d.notes, subtotal: t.subtotal, vatAmount: t.vat, total: t.total, costTotal: t.cost, createdBy: me.id })
        .returning({ id: schema.quotes.id });
      id = q.id;
    }
    await tx.insert(schema.quoteItems).values(d.lines.map((l, position) => ({ quoteId: id!, position, description: l.description, qty: l.qty, unitPrice: l.unitPriceAed, costAed: l.costAed ?? null, supplierName: l.supplierName })));
    // the deal is now worth what we quoted (before VAT)
    if (dealId) await tx.update(schema.deals).set({ valueAed: t.subtotal }).where(eq(schema.deals.id, dealId));
    await tx.insert(schema.activities).values({
      type: "note",
      body: before
        ? `Quote ${number} updated: ${money(round2(before.total))} to ${money(t.total)} with VAT (${d.lines.length} item${d.lines.length === 1 ? "" : "s"}).${before.status === "sent" ? " Send it to the customer again." : ""}`
        : `Quote ${number} made: ${money(t.total)} with VAT (${d.lines.length} item${d.lines.length === 1 ? "" : "s"})${dealId ? "" : ", an instant quote"}.`,
      dealId,
      companyId: d.companyId,
      userId: me.id,
    });
    return { id: id!, number, oldDealId: before?.dealId ?? null };
  });
  refresh(dealId);
  if (result.oldDealId && result.oldDealId !== dealId) refresh(result.oldDealId);
  revalidatePath("/sales", "layout");
  return { id: result.id, number: result.number };
}

/**
 * A supplier price from Procurement as a quote line (cost in AED at today's rate, price = cost + margin), for the quote
 * page to add to its lines. Nothing is saved until the quote is.
 */
export async function offerLine(offerId: number, qty = 1, marginPct?: number) {
  await assertApp("sales");
  await assertApp("procurement");
  const n = z.number().int().min(1).max(100000).parse(qty);
  const [o] = await db
    .select({
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
  if (o.price == null) throw new Error("This offer has no price (price on request). Type the line by hand with the price you are given.");
  const cost = toAed(o.price, o.currency, await getFx());
  if (cost == null) throw new Error(`There is no AED rate for ${o.currency}. Type the line by hand with the cost in AED.`);
  const margin = marginPct == null ? (await quoteDefaults()).marginPct : z.number().min(0).max(300).parse(marginPct);
  const label = [o.brand, o.modelName, o.partNumber].filter(Boolean).join(" ");
  return { description: (o.specSummary ? `${label}, ${o.specSummary}` : label).slice(0, 400), qty: n, costAed: cost, unitPriceAed: sellPrice(cost, margin), supplierName: o.supplierName };
}

/** For the quote page once a customer is picked: their contacts, and the deals a quote may be linked to (not lost, not projects). */
export async function customerChoices(companyId: number) {
  await assertApp("sales");
  const v = await currentViewer(true);
  if (!(await canSeeCompany(v, companyId))) throw new Error("That customer does not exist or is not yours.");
  const [contacts, deals] = await Promise.all([
    db
      .select({ id: schema.contacts.id, name: schema.contacts.name, jobTitle: schema.contacts.jobTitle })
      .from(schema.contacts)
      .where(eq(schema.contacts.companyId, companyId))
      .orderBy(desc(schema.contacts.isDecisionMaker), schema.contacts.name),
    db
      .select({ id: schema.deals.id, title: schema.deals.title, stage: schema.deals.stage, contactId: schema.deals.contactId, ownerId: schema.deals.ownerId })
      .from(schema.deals)
      .where(and(eq(schema.deals.companyId, companyId), ne(schema.deals.stage, "lost"), eq(schema.deals.kind, "product"), dealVisible(v, schema.deals.id)))
      .orderBy(desc(schema.deals.createdAt)),
  ]);
  return { contacts, deals: deals.map((d) => ({ ...d, stageLabel: stageLabel(d.stage) })) };
}
