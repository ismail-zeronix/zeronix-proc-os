import "server-only";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { schema } from "@/db";
import { addStock, linkEntry, lockItems, moveSerials, movesOf, removeStock, stockMovesOn, stockSettings, voidMoves, writeMove, type Settled, type StockItem } from "@/lib/inventory/engine";
import { shareOf } from "@/lib/inventory/costing";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { lineCost } from "@/lib/purchases";
import type { Tx } from "@/lib/tx";
import { UserError } from "@/lib/user-error";
import { firstOpenDay, inStockOf, liveEntry } from "./period";
import { postEntry, reverseEntry } from "./post";
import { billCostAccount, stockAdjustLines, stockBackLines, stockOutLines, stockReceiptLines } from "./rules";

/**
 * Item stock in the ledger (Inventory app): what bills, invoices, notes and adjustments do to tracked items, posted in the
 * transaction that saves them, next to their own entry (documents.ts). Nothing here changes a document's own entry: a
 * bill still posts all its goods to Inventory (1310) and its stock-item lines then move on to "Inventory, stock items"
 * (1330), so goods typed by hand keep moving to cost of goods sold by bill exactly as before.
 *
 * Only documents dated from the stock start (Inventory › Settings) move stock, and only lines that point at an item with
 * "Track stock" on. Each function can be called again: what was already posted is skipped.
 */

const sum = (xs: readonly number[]) => fromMinor(sumMinor(xs.map(toMinor)));

/** Stock lines of a document: its lines that point at an item that tracks stock. */
function tracked<L extends { itemId: number | null }>(lines: readonly L[], items: Map<number, StockItem>): (L & { itemId: number })[] {
  return lines.filter((l): l is L & { itemId: number } => l.itemId != null && !!items.get(l.itemId)?.trackStock);
}

/** The cost of sales made without stock, posted under each sale's own document once units come in. */
async function postSettlements(tx: Tx, orgId: number, settled: readonly Settled[], userId: number | null): Promise<void> {
  for (const s of settled) {
    if (!(s.value > 0)) continue;
    const [inv] = s.sale.sourceType === "invoice" ? await tx.select({ number: schema.invoices.number, orderId: schema.invoices.orderId, dealId: schema.invoices.dealId }).from(schema.invoices).where(eq(schema.invoices.id, s.sale.sourceId)) : [];
    const date = await firstOpenDay(tx, orgId, s.sale.date);
    const lines = stockOutLines({ amount: s.value, description: `Cost of ${inv?.number ?? "an earlier sale"} (sold before the stock came in)`, orderId: inv?.orderId, dealId: inv?.dealId });
    if (!lines) continue;
    const e = await postEntry(tx, { orgId, date: date > s.sale.date ? date : s.sale.date, sourceType: s.sale.sourceType, sourceId: s.sale.sourceId, purpose: `settle:${s.moveId}`, memo: `Cost of goods sold earlier without stock (${inv?.number ?? ""})`, createdBy: userId, lines });
    await linkEntry(tx, [s.moveId], e.id);
  }
}

/* ---------- bills and expenses: stock in ---------- */

/**
 * A bill's (or expense's) stock-item lines come into stock at their cost. Its entry moves that cost from where the bill
 * put it (Inventory for goods, otherwise the category's account) into item stock. Sales made earlier without stock get
 * their cost from these units. Returns why it posted nothing, if it did not.
 */
export async function postBillStock(tx: Tx, orgId: number, billId: number, userId: number | null): Promise<string | null> {
  const [b] = await tx.select().from(schema.bills).where(eq(schema.bills.id, billId));
  if (!b || b.status === "void" || (b.kind !== "bill" && b.kind !== "expense")) return "not a live bill";
  if (!stockMovesOn(await stockSettings(tx, orgId), b.billDate)) return "before the stock start";
  const sourceType = b.kind === "expense" ? "expense" : "bill";
  if ((await movesOf(tx, orgId, sourceType, b.id, ["purchase"])).length) return "already in stock";
  const lines = await tx.select().from(schema.billItems).where(and(eq(schema.billItems.billId, b.id), isNotNull(schema.billItems.itemId))).orderBy(asc(schema.billItems.position), asc(schema.billItems.id));
  if (!lines.length) return "no item lines";
  const items = await lockItems(tx, orgId, lines.map((l) => l.itemId as number));
  const stock = tracked(lines, items);
  if (!stock.length) return "no stock items";
  const value = sum(stock.map((l) => lineCost(l)));
  // a goods bill: its value must still be in Inventory (a line linked after the bill's cost moved on cannot come in twice)
  if (b.category === "cogs" && toMinor(await inStockOf(tx, orgId, sourceType, b.id)) < toMinor(value)) return "its cost already left Inventory";

  const moveIds: number[] = [];
  const settled: Settled[] = [];
  for (const l of stock) {
    const item = items.get(l.itemId)!;
    if (!(l.qty > 0)) continue;
    const r = await addStock(tx, { orgId, item, date: b.billDate, kind: "purchase", qty: l.qty, value: lineCost(l), sourceType, sourceId: b.id, sourceLineId: l.id, userId });
    await moveSerials(tx, orgId, item, r.moveId, l.serials, l.qty, "receive");
    moveIds.push(r.moveId);
    settled.push(...r.settled);
  }
  const lines2 = stockReceiptLines({ parts: [{ amount: value, fromAccount: billCostAccount(b) }], description: `${b.number} into item stock`, orderId: b.orderId, dealId: b.dealId });
  if (lines2) {
    const e = await postEntry(tx, { orgId, date: b.billDate, sourceType, sourceId: b.id, purpose: "stock", memo: `Stock items of ${b.number}`, createdBy: userId, lines: lines2 });
    await linkEntry(tx, moveIds, e.id);
  }
  await postSettlements(tx, orgId, settled, userId);
  return null;
}

/**
 * Voiding a bill takes its stock back out: only while nothing has moved those items since (otherwise use a debit note).
 * Called before the bill's own entry is reversed.
 */
export async function voidBillStock(tx: Tx, orgId: number, b: { id: number; kind: string; number: string }, reason: string, userId: number | null): Promise<void> {
  const sourceType = b.kind === "expense" ? "expense" : "bill";
  const moves = await movesOf(tx, orgId, sourceType, b.id, ["purchase"]);
  if (!moves.length) return;
  await voidMoves(tx, orgId, moves, `bill ${b.number}`, userId);
  const live = await liveEntry(tx, orgId, sourceType, b.id, "stock");
  if (live && !live.reversedBy) await reverseEntry(tx, { orgId, entryId: live.id, reason, createdBy: userId });
}

/* ---------- invoices: stock out ---------- */

/**
 * An invoice's stock-item lines leave stock at average cost, and their cost goes to cost of goods sold. Selling more than
 * is in stock is allowed or blocked by the company's setting; allowed, the units beyond stock are costed when stock comes in.
 */
export async function postInvoiceStock(tx: Tx, orgId: number, invoiceId: number, userId: number | null): Promise<void> {
  const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!inv || inv.kind !== "sale") return;
  const settings = await stockSettings(tx, orgId);
  if (!stockMovesOn(settings, inv.issueDate)) return;
  if ((await movesOf(tx, orgId, "invoice", inv.id, ["sale"])).length) return;
  const lines = await tx.select().from(schema.invoiceItems).where(and(eq(schema.invoiceItems.invoiceId, inv.id), isNotNull(schema.invoiceItems.itemId))).orderBy(asc(schema.invoiceItems.position), asc(schema.invoiceItems.id));
  if (!lines.length) return;
  const items = await lockItems(tx, orgId, lines.map((l) => l.itemId as number));
  const stock = tracked(lines, items).filter((l) => l.qty > 0);
  if (!stock.length) return;
  if (settings.negativeStock === "block") {
    const need = new Map<number, number>();
    for (const l of stock) need.set(l.itemId, (need.get(l.itemId) ?? 0) + l.qty);
    for (const [id, qty] of need) {
      const it = items.get(id)!;
      if (qty > it.onHand) throw new UserError(`Only ${Math.max(it.onHand, 0)} ${it.unit} of ${it.name} (${it.sku}) in stock; this invoice needs ${qty}. Enter the supplier bill first (Inventory › Settings decides whether an invoice may sell more than is in stock).`);
    }
  }
  const moveIds: number[] = [];
  let cost = 0;
  for (const l of stock) {
    const item = items.get(l.itemId)!;
    const r = await removeStock(tx, { orgId, item, date: inv.issueDate, kind: "sale", qty: l.qty, sourceType: "invoice", sourceId: inv.id, sourceLineId: l.id, userId, allowShort: true });
    await moveSerials(tx, orgId, item, r.moveId, l.serials, l.qty, "sell");
    moveIds.push(r.moveId);
    cost = sum([cost, r.value]);
  }
  const posting = stockOutLines({ amount: cost, description: `${inv.number} stock sold`, orderId: inv.orderId, dealId: inv.dealId });
  if (posting) {
    const e = await postEntry(tx, { orgId, date: inv.issueDate, sourceType: "invoice", sourceId: inv.id, purpose: "stock", memo: `Cost of stock items sold on ${inv.number}`, createdBy: userId, lines: posting });
    await linkEntry(tx, moveIds, e.id);
  }
}

/* ---------- credit notes: stock back from the customer ---------- */

/**
 * Units coming back on a credit note (qty_back) are stock again, at what they cost when sold. Units that were sold
 * without stock and never costed come back without a cost (and no longer wait for one). Only for invoices that moved
 * stock; the most that can come back is what the invoice line sold less earlier returns.
 */
export async function postCreditNoteStock(tx: Tx, orgId: number, creditNoteId: number, userId: number | null): Promise<void> {
  const [cn] = await tx.select().from(schema.creditNotes).where(eq(schema.creditNotes.id, creditNoteId));
  if (!cn || !cn.goodsBack) return;
  if ((await movesOf(tx, orgId, "credit_note", cn.id, ["sale_return"])).length) return;
  const sales = await movesOf(tx, orgId, "invoice", cn.invoiceId, ["sale"]);
  if (!sales.length) return;
  const [inv] = await tx.select({ number: schema.invoices.number, orderId: schema.invoices.orderId, dealId: schema.invoices.dealId }).from(schema.invoices).where(eq(schema.invoices.id, cn.invoiceId));
  const lines = (await tx.select().from(schema.creditNoteItems).where(eq(schema.creditNoteItems.creditNoteId, cn.id)).orderBy(asc(schema.creditNoteItems.position))).filter((l) => (l.qtyBack ?? 0) > 0 && l.invoiceItemId != null);
  if (!lines.length) return;
  const items = await lockItems(tx, orgId, sales.map((s) => s.itemId));
  const M = schema.stockMoves;
  const moveIds: number[] = [];
  const settled: Settled[] = [];
  let back = 0;
  for (const l of lines) {
    const sale = sales.find((s) => s.sourceLineId === l.invoiceItemId);
    if (!sale) continue;
    const item = items.get(sale.itemId)!;
    const [now] = await tx.select({ uncosted: M.uncostedQty }).from(M).where(eq(M.id, sale.id)).for("update");
    const returns = await tx.select({ qty: M.qty, value: M.value }).from(M).where(and(eq(M.organizationId, orgId), eq(M.returnOfMoveId, sale.id), eq(M.kind, "sale_return")));
    const settles = await tx.select({ value: M.value }).from(M).where(and(eq(M.organizationId, orgId), eq(M.settlesMoveId, sale.id)));
    const sold = -sale.qty;
    const returnable = Math.round((sold - returns.reduce((s, r) => s + r.qty, 0)) * 100) / 100;
    const qty = Math.min(l.qtyBack ?? 0, returnable);
    if (!(qty > 0)) continue;
    // uncosted units first: they had no cost, so they bring none back
    const uncostedBack = Math.min(qty, now.uncosted);
    const costedBack = Math.round((qty - uncostedBack) * 100) / 100;
    // what the costed units cost: the sale's value plus what settled it later, less what earlier returns took back
    const costedUnits = Math.round((sold - now.uncosted - returns.reduce((s, r) => s + r.qty, 0)) * 100) / 100;
    const costLeft = sum([-sale.value, ...settles.map((s) => -s.value), ...returns.map((r) => -r.value)]);
    const value = costedBack > 0 ? shareOf(costLeft, costedBack, costedUnits) : 0;
    const serials = l.serials.filter((s) => s.trim());
    // uncosted units coming back only fill the shortfall they made: no value, and the sale no longer waits for their cost
    if (uncostedBack > 0) {
      await tx.update(M).set({ uncostedQty: Math.round((now.uncosted - uncostedBack) * 100) / 100 }).where(eq(M.id, sale.id));
      const id = await writeMove(tx, { orgId, item, date: cn.issueDate, kind: "sale_return", qty: uncostedBack, value: 0, unitCost: 0, sourceType: "credit_note", sourceId: cn.id, sourceLineId: costedBack > 0 ? null : l.id, returnOfMoveId: sale.id, userId });
      await moveSerials(tx, orgId, item, id, serials.slice(0, serials.length ? uncostedBack : 0), uncostedBack, "customer_return");
      moveIds.push(id);
    }
    // costed units are stock again at what they cost (and may give other sales made without stock their cost)
    if (costedBack > 0) {
      const r = await addStock(tx, { orgId, item, date: cn.issueDate, kind: "sale_return", qty: costedBack, value, sourceType: "credit_note", sourceId: cn.id, sourceLineId: l.id, returnOfMoveId: sale.id, userId });
      await moveSerials(tx, orgId, item, r.moveId, serials.slice(serials.length ? uncostedBack : 0), costedBack, "customer_return");
      moveIds.push(r.moveId);
      settled.push(...r.settled);
    }
    back = sum([back, value]);
  }
  const posting = stockBackLines({ amount: back, description: `${cn.number} stock back`, orderId: inv?.orderId, dealId: inv?.dealId });
  if (posting) {
    const e = await postEntry(tx, { orgId, date: cn.issueDate, sourceType: "credit_note", sourceId: cn.id, purpose: "stock", memo: `Stock items back on ${cn.number} (${inv?.number ?? ""})`, createdBy: userId, lines: posting });
    await linkEntry(tx, moveIds, e.id);
  }
  await postSettlements(tx, orgId, settled, userId);
}

/* ---------- debit notes: stock back to the supplier ---------- */

/** The bill lines whose units came into item stock (their debit note lines are stock, not Inventory 1310). */
export async function stockBillLineIds(tx: Tx, orgId: number, sourceType: string, billId: number): Promise<Set<number>> {
  return new Set((await movesOf(tx, orgId, sourceType, billId, ["purchase"])).map((m) => m.sourceLineId as number));
}

/**
 * Goods sent back to the supplier on a debit note (goods_back) leave stock at average cost; the cost goes against the
 * account the debit note itself credited (cost of goods sold for goods), so only the price difference stays a cost.
 * A price reduction alone (goods kept) moves no stock.
 */
export async function postDebitNoteStock(tx: Tx, orgId: number, debitNoteId: number, userId: number | null): Promise<void> {
  const [d] = await tx.select().from(schema.debitNotes).where(eq(schema.debitNotes.id, debitNoteId));
  if (!d || !d.goodsBack) return;
  const [b] = await tx.select().from(schema.bills).where(eq(schema.bills.id, d.billId));
  if (!b) return;
  const billSource = b.kind === "expense" ? "expense" : "bill";
  if ((await movesOf(tx, orgId, "debit_note", d.id, ["purchase_return"])).length) return;
  const inStock = await stockBillLineIds(tx, orgId, billSource, b.id);
  if (!inStock.size) return;
  const lines = (await tx.select().from(schema.debitNoteItems).where(eq(schema.debitNoteItems.debitNoteId, d.id)).orderBy(asc(schema.debitNoteItems.position))).filter((l) => l.billItemId != null && inStock.has(l.billItemId) && l.itemId != null && l.qty > 0);
  if (!lines.length) return;
  const items = await lockItems(tx, orgId, lines.map((l) => l.itemId as number));
  const moveIds: number[] = [];
  let value = 0;
  for (const l of lines) {
    const item = items.get(l.itemId as number)!;
    const r = await removeStock(tx, { orgId, item, date: d.issueDate, kind: "purchase_return", qty: l.qty, sourceType: "debit_note", sourceId: d.id, sourceLineId: l.id, userId, allowShort: false });
    await moveSerials(tx, orgId, item, r.moveId, l.serials, l.qty, "supplier_return");
    moveIds.push(r.moveId);
    value = sum([value, r.value]);
  }
  const posting = stockOutLines({ amount: value, to: b.category === "cogs" ? "cogs" : billCostAccount(b), description: `${d.number} stock back to the supplier`, orderId: b.orderId, dealId: b.dealId });
  if (posting) {
    const e = await postEntry(tx, { orgId, date: d.issueDate, sourceType: "debit_note", sourceId: d.id, purpose: "stock", memo: `Stock items sent back on ${d.number} (${b.number})`, createdBy: userId, lines: posting });
    await linkEntry(tx, moveIds, e.id);
  }
}

/* ---------- stock adjustments: opening, counts, write-offs ---------- */

const OFFSET_ACCOUNT = { stock_adjustments: "stock_adjustments", opening_equity: "opening_equity", inventory: "inventory" } as const;

/**
 * A stock adjustment: units in at the cost given (or the average), units out at average cost (never below zero). A count
 * line with a counted quantity moves the difference from what is on hand now. Its value goes against the adjustment's
 * offset account.
 */
export async function postAdjustmentDoc(tx: Tx, orgId: number, adjustmentId: number, userId: number | null): Promise<void> {
  const A = schema.stockAdjustments;
  const L = schema.stockAdjustmentLines;
  const [adj] = await tx.select().from(A).where(and(eq(A.id, adjustmentId), eq(A.organizationId, orgId))).for("update");
  if (!adj || adj.status !== "posted") return;
  if (!stockMovesOn(await stockSettings(tx, orgId), adj.date)) throw new UserError("Stock has not started on that date. An accountant starts it in Inventory › Settings.");
  if ((await movesOf(tx, orgId, "stock_adjustment", adj.id)).length) return;
  const lines = await tx.select().from(L).where(eq(L.adjustmentId, adj.id)).orderBy(asc(L.position), asc(L.id));
  const items = await lockItems(tx, orgId, lines.map((l) => l.itemId));
  const moveIds: number[] = [];
  const settled: Settled[] = [];
  let valueIn = 0;
  let valueOut = 0;
  for (const l of lines) {
    const item = items.get(l.itemId);
    if (!item?.trackStock) throw new UserError(`Line ${l.position + 1}: that item does not track stock.`);
    const qty = l.countedQty != null ? Math.round((l.countedQty - item.onHand) * 100) / 100 : l.qty;
    if (l.countedQty != null && qty !== l.qty) await tx.update(L).set({ qty }).where(eq(L.id, l.id));
    if (qty > 0) {
      const unit = l.unitCost ?? item.avgCost;
      const value = fromMinor(Math.round(toMinor(unit) * qty));
      const r = await addStock(tx, { orgId, item, date: adj.date, kind: adj.kind === "opening" ? "opening" : "adjust_in", qty, value, sourceType: "stock_adjustment", sourceId: adj.id, sourceLineId: l.id, userId });
      await moveSerials(tx, orgId, item, r.moveId, l.serials, qty, "receive");
      moveIds.push(r.moveId);
      settled.push(...r.settled);
      valueIn = sum([valueIn, value]);
    } else if (qty < 0) {
      const r = await removeStock(tx, { orgId, item, date: adj.date, kind: "adjust_out", qty: -qty, sourceType: "stock_adjustment", sourceId: adj.id, sourceLineId: l.id, userId, allowShort: false });
      await moveSerials(tx, orgId, item, r.moveId, l.serials, -qty, "write_off");
      moveIds.push(r.moveId);
      valueOut = sum([valueOut, r.value]);
    }
  }
  await tx.update(A).set({ totalValue: sum([valueIn, -valueOut]) }).where(eq(A.id, adj.id));
  const posting = stockAdjustLines({ valueIn, valueOut, offset: OFFSET_ACCOUNT[adj.offset], description: `${adj.number}${adj.reason ? ` ${adj.reason}` : ""}` });
  if (posting) {
    const e = await postEntry(tx, { orgId, date: adj.date, sourceType: "stock_adjustment", sourceId: adj.id, memo: `Stock adjustment ${adj.number}`, createdBy: userId, lines: posting });
    await linkEntry(tx, moveIds, e.id);
  }
  // sales made without stock and costed by these units: their cost leaves the stock the adjustment just added
  await postSettlements(tx, orgId, settled, userId);
}

/** Voids an adjustment: only while nothing has moved its items since. */
export async function voidAdjustmentDoc(tx: Tx, orgId: number, adjustmentId: number, reason: string, userId: number | null): Promise<void> {
  const A = schema.stockAdjustments;
  const [adj] = await tx.select().from(A).where(and(eq(A.id, adjustmentId), eq(A.organizationId, orgId))).for("update");
  if (!adj) throw new UserError("That adjustment no longer exists.");
  if (adj.status === "void") throw new UserError("This adjustment is already voided.");
  const moves = await movesOf(tx, orgId, "stock_adjustment", adj.id, ["opening", "adjust_in", "adjust_out"]);
  await voidMoves(tx, orgId, moves, `adjustment ${adj.number}`, userId);
  const live = await liveEntry(tx, orgId, "stock_adjustment", adj.id);
  if (live && !live.reversedBy) await reverseEntry(tx, { orgId, entryId: live.id, reason, createdBy: userId });
  await tx.update(A).set({ status: "void", voidReason: reason, voidedAt: new Date() }).where(eq(A.id, adj.id));
}

/** Items in stock moves of these documents (used to refresh pages). */
export async function itemsOfMoves(tx: Tx, orgId: number, sourceType: string, ids: readonly number[]): Promise<number[]> {
  if (!ids.length) return [];
  const rows = await tx.selectDistinct({ itemId: schema.stockMoves.itemId }).from(schema.stockMoves).where(and(eq(schema.stockMoves.organizationId, orgId), eq(schema.stockMoves.sourceType, sourceType), inArray(schema.stockMoves.sourceId, [...ids])));
  return rows.map((r) => r.itemId);
}
