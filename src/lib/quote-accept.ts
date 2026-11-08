import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { type db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { money } from "@/lib/quotation";
import { stageLabel } from "@/lib/sales";
import type { Tx } from "@/lib/tx";
import { UserError } from "@/lib/user-error";

/**
 * "The customer accepted this quote", the same everywhere: the quote page, the chat card, Mark as won, making the order
 * and invoicing it directly all call this. The quote is locked first (two people at once see one result), other open
 * quotes on the deal are marked rejected, the quote becomes Accepted and the deal Won at the quoted amount.
 * Call quoteDecided() after the transaction when `changed` is true, so the salesperson hears about it.
 */
export async function acceptQuote(
  tx: Tx,
  opts: { quoteId: number; userId: number; /** How it was accepted, for the timeline: "order ZSO-2026-0004", "invoice ZINV-12". */ via?: string; /** Added to the stage line, e.g. missing customer details. */ note?: string; /** The status menu may take back a rejection; making an order or invoice may not. */ allowRejected?: boolean },
): Promise<{ changed: boolean; dealId: number | null; number: string }> {
  const [q] = await tx.select().from(schema.quotes).where(eq(schema.quotes.id, opts.quoteId)).for("update");
  if (!q) throw new UserError("That quote no longer exists.");
  const now = new Date();
  const changed = q.status !== "accepted";

  // a deal keeps one quote in play: the winner may not sit next to another accepted quote
  if (q.dealId) await tx.select({ id: schema.deals.id }).from(schema.deals).where(eq(schema.deals.id, q.dealId)).for("update");
  const others = q.dealId
    ? await tx
        .select({ id: schema.quotes.id, number: schema.quotes.number, status: schema.quotes.status })
        .from(schema.quotes)
        .where(and(eq(schema.quotes.dealId, q.dealId), ne(schema.quotes.id, q.id)))
    : [];
  const otherAccepted = others.find((o) => o.status === "accepted");
  if (otherAccepted) throw new UserError(`Quote ${otherAccepted.number} is already accepted for this deal.`);
  if (q.status === "rejected" && !opts.allowRejected) throw new UserError(`Quote ${q.number} was rejected. Set it back to Sent first if the customer changed their mind.`);
  const open = others.filter((o) => o.status === "draft" || o.status === "sent");
  if (open.length) {
    await tx.update(schema.quotes).set({ status: "rejected", decidedAt: now }).where(inArray(schema.quotes.id, open.map((o) => o.id)));
    await tx.insert(schema.activities).values({ type: "note", body: `${open.map((o) => o.number).join(", ")} marked rejected: replaced by ${q.number}.`, dealId: q.dealId, companyId: q.companyId, userId: opts.userId });
  }
  if (changed) {
    await tx.update(schema.quotes).set({ status: "accepted", decidedAt: now }).where(eq(schema.quotes.id, q.id));
    await audit(tx, { userId: opts.userId, action: "quote.accept", entity: "quote", entityId: q.id, summary: `${q.number} accepted${opts.via ? ` (${opts.via})` : ""}`, before: { status: q.status }, after: { status: "accepted", rejected: open.map((o) => o.number) } });
  }

  if (q.dealId) {
    const [deal] = await tx.select({ stage: schema.deals.stage }).from(schema.deals).where(eq(schema.deals.id, q.dealId));
    if (deal && deal.stage !== "won") {
      await tx.update(schema.deals).set({ stage: "won", stageChangedAt: now, closedAt: now, lostReason: "", valueAed: q.subtotal }).where(eq(schema.deals.id, q.dealId));
      await tx.insert(schema.activities).values({
        type: "stage",
        body: `Moved from ${stageLabel(deal.stage)} to ${stageLabel("won")} with quote ${q.number} (${money(q.total)})${opts.via ? `, ${opts.via}` : ""}.${opts.note ? ` ${opts.note}` : ""}`,
        dealId: q.dealId,
        companyId: q.companyId,
        userId: opts.userId,
      });
    } else if (deal) {
      // already won (by hand, earlier): the deal is now worth what this quote says
      await tx.update(schema.deals).set({ valueAed: q.subtotal }).where(eq(schema.deals.id, q.dealId));
    }
  }
  return { changed, dealId: q.dealId, number: q.number };
}

/**
 * The quote is no longer accepted (set back to Sent or Draft, or rejected): a deal that was Won by it goes back to
 * Negotiation, so pipeline figures never count a win nobody has.
 */
export async function unwinDeal(tx: Tx, opts: { dealId: number | null; companyId: number; userId: number; why: string }) {
  if (!opts.dealId) return null;
  const [deal] = await tx.select({ stage: schema.deals.stage }).from(schema.deals).where(eq(schema.deals.id, opts.dealId)).for("update");
  if (deal?.stage !== "won") return null;
  await tx.update(schema.deals).set({ stage: "negotiation", stageChangedAt: new Date(), closedAt: null }).where(eq(schema.deals.id, opts.dealId));
  await tx.insert(schema.activities).values({ type: "stage", body: `Moved from ${stageLabel("won")} to ${stageLabel("negotiation")} (${opts.why}).`, dealId: opts.dealId, companyId: opts.companyId, userId: opts.userId });
  return "negotiation";
}

/** A deal with a live order or invoice cannot be marked Lost or moved off Won by hand: cancel those first. */
export async function liveSaleOfDeal(tx: Tx | typeof db, dealId: number): Promise<string | null> {
  const [o] = await tx.select({ number: schema.salesOrders.number }).from(schema.salesOrders).where(and(eq(schema.salesOrders.dealId, dealId), ne(schema.salesOrders.status, "cancelled"))).limit(1);
  if (o) return `order ${o.number}`;
  const [i] = await tx.select({ number: schema.invoices.number }).from(schema.invoices).where(and(eq(schema.invoices.dealId, dealId), ne(schema.invoices.status, "cancelled"))).limit(1);
  return i ? `invoice ${i.number}` : null;
}
