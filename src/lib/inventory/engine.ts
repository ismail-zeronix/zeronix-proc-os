import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { schema } from "@/db";
import { posts } from "@/lib/ledger/period";
import type { Tx } from "@/lib/tx";
import { UserError } from "@/lib/user-error";
import { avgCost, cleanSerials, serialNorm, settleOrder, shareOf, takeOut, type MoveKind } from "./costing";

/**
 * The stock engine: the only code that writes stock_moves and the stock figures on items. Callers (lib/ledger/stock-docs.ts)
 * run it inside the transaction that saves the document and post the journal entry for what it moved.
 */

const M = schema.stockMoves;
const S = schema.stockSerials;

export interface StockSettings {
  stockStart: string | null;
  negativeStock: "allow" | "block";
  ledgerStart: string | null;
}

export async function stockSettings(tx: Tx, orgId: number): Promise<StockSettings> {
  const [s] = await tx
    .select({ stockStart: schema.accountingSettings.stockStart, negativeStock: schema.accountingSettings.negativeStock, ledgerStart: schema.accountingSettings.cutoverDate })
    .from(schema.accountingSettings)
    .where(eq(schema.accountingSettings.organizationId, orgId));
  return { stockStart: s?.stockStart ?? null, negativeStock: s?.negativeStock ?? "allow", ledgerStart: s?.ledgerStart ?? null };
}

/** A document dated `date` moves item stock: stock has started by then, and so has the ledger. */
export const stockMovesOn = (s: StockSettings, date: string) => !!s.stockStart && date >= s.stockStart && posts(s.ledgerStart, date);

/** An item as the engine works on it: its stock now (kept up to date as moves are written). */
export interface StockItem {
  id: number;
  sku: string;
  name: string;
  unit: string;
  trackStock: boolean;
  trackSerials: boolean;
  onHand: number;
  stockValue: number;
  avgCost: number;
}

/** The items, row-locked in id order (two documents of the same items wait for each other, never deadlock). */
export async function lockItems(tx: Tx, orgId: number, ids: readonly number[]): Promise<Map<number, StockItem>> {
  const want = [...new Set(ids)].sort((a, b) => a - b);
  if (!want.length) return new Map();
  const rows = await tx
    .select({ id: schema.items.id, sku: schema.items.sku, name: schema.items.name, unit: schema.items.unit, trackStock: schema.items.trackStock, trackSerials: schema.items.trackSerials, onHand: schema.items.onHand, stockValue: schema.items.stockValue, avgCost: schema.items.avgCost })
    .from(schema.items)
    .where(and(eq(schema.items.organizationId, orgId), inArray(schema.items.id, want)))
    .orderBy(asc(schema.items.id))
    .for("update");
  return new Map(rows.map((r) => [r.id, r]));
}

export interface MoveSpec {
  orgId: number;
  item: StockItem;
  date: string;
  kind: MoveKind;
  /** Units: + in, − out. */
  qty: number;
  /** AED: + in, − out. */
  value: number;
  unitCost: number;
  sourceType: string;
  sourceId: number;
  sourceLineId?: number | null;
  uncostedQty?: number;
  settlesMoveId?: number | null;
  returnOfMoveId?: number | null;
  userId: number | null;
}

const q2 = (n: number) => Math.round(n * 100) / 100;
const m2 = (n: number) => Math.round(n * 100) / 100;

/** Writes one move and brings the item's stock figures up to date (on the row and on `spec.item`). */
export async function writeMove(tx: Tx, spec: MoveSpec): Promise<number> {
  const it = spec.item;
  const qty = q2(it.onHand + spec.qty);
  const value = m2(it.stockValue + spec.value);
  const [row] = await tx
    .insert(M)
    .values({
      organizationId: spec.orgId,
      itemId: it.id,
      date: spec.date,
      kind: spec.kind,
      qty: spec.qty,
      unitCost: Math.round(spec.unitCost * 10000) / 10000,
      value: spec.value,
      sourceType: spec.sourceType,
      sourceId: spec.sourceId,
      sourceLineId: spec.sourceLineId ?? null,
      uncostedQty: spec.uncostedQty ?? 0,
      settlesMoveId: spec.settlesMoveId ?? null,
      returnOfMoveId: spec.returnOfMoveId ?? null,
      qtyAfter: qty,
      valueAfter: value,
      createdBy: spec.userId,
    })
    .returning({ id: M.id });
  it.onHand = qty;
  it.stockValue = value;
  it.avgCost = avgCost({ qty, value }, it.avgCost);
  await tx.update(schema.items).set({ onHand: it.onHand, stockValue: it.stockValue, avgCost: it.avgCost }).where(eq(schema.items.id, it.id));
  return row.id;
}

/** Ties moves to the journal entry that posted them. */
export async function linkEntry(tx: Tx, moveIds: readonly number[], entryId: number): Promise<void> {
  if (moveIds.length) await tx.update(M).set({ entryId }).where(inArray(M.id, [...moveIds]));
}

/** A sale given its cost later: the settle row written, and which sale's document posts the cost. */
export interface Settled {
  moveId: number;
  value: number;
  sale: { id: number; date: string; sourceType: string; sourceId: number };
}

/**
 * Units coming in (bought, returned, counted): the in-move, then the sales made without stock get their cost from these
 * units, oldest sale first. Returns the in-move and the settlements (each needs a cost entry under its sale).
 */
export async function addStock(tx: Tx, spec: Omit<MoveSpec, "qty" | "value" | "unitCost"> & { qty: number; value: number }): Promise<{ moveId: number; settled: Settled[] }> {
  if (!(spec.qty > 0)) throw new Error("addStock needs units");
  const moveId = await writeMove(tx, { ...spec, unitCost: spec.value / spec.qty });
  const short = spec.item.onHand - spec.qty < 0 ? q2(Math.min(spec.qty, -(spec.item.onHand - spec.qty))) : 0;
  const settled: Settled[] = [];
  if (short <= 0) return { moveId, settled };
  const open = await tx
    .select({ id: M.id, uncosted: M.uncostedQty, date: M.date, sourceType: M.sourceType, sourceId: M.sourceId, sourceLineId: M.sourceLineId })
    .from(M)
    .where(and(eq(M.organizationId, spec.orgId), eq(M.itemId, spec.item.id), gt(M.uncostedQty, 0)))
    .orderBy(asc(M.id))
    .for("update");
  for (const part of settleOrder(short, open)) {
    const sale = open.find((o) => o.id === part.id)!;
    const value = shareOf(spec.value, part.qty, spec.qty);
    const date = sale.date > spec.date ? sale.date : spec.date;
    const id = await writeMove(tx, { orgId: spec.orgId, item: spec.item, date, kind: "settle", qty: 0, value: -value, unitCost: value / part.qty, sourceType: sale.sourceType, sourceId: sale.sourceId, sourceLineId: sale.sourceLineId, settlesMoveId: sale.id, userId: spec.userId });
    await tx.update(M).set({ uncostedQty: sql`${M.uncostedQty} - ${part.qty}` }).where(eq(M.id, sale.id));
    settled.push({ moveId: id, value, sale: { id: sale.id, date: sale.date, sourceType: sale.sourceType, sourceId: sale.sourceId } });
  }
  return { moveId, settled };
}

/**
 * Units going out at average cost. `allowShort`: a sale may go beyond stock (the rest is uncosted, settled later);
 * anything else must find the units in stock.
 */
export async function removeStock(tx: Tx, spec: Omit<MoveSpec, "qty" | "value" | "unitCost" | "uncostedQty"> & { qty: number; allowShort: boolean }): Promise<{ moveId: number; value: number; uncosted: number }> {
  const it = spec.item;
  const out = takeOut({ qty: it.onHand, value: it.stockValue }, spec.qty);
  if (out.uncosted > 0 && !spec.allowShort) throw new UserError(`Only ${Math.max(it.onHand, 0)} ${it.unit} of ${it.name} (${it.sku}) in stock; this needs ${spec.qty}.`);
  const moveId = await writeMove(tx, { ...spec, qty: -spec.qty, value: -out.value, unitCost: out.costed > 0 ? out.value / out.costed : it.avgCost, uncostedQty: out.uncosted });
  return { moveId, value: out.value, uncosted: out.uncosted };
}

/* ---------- serial numbers ---------- */

/** void_in undoes a move that brought serials in (they leave stock); void_out undoes one that took them out (back in stock). */
export type SerialOp = "receive" | "sell" | "customer_return" | "supplier_return" | "write_off" | "void_in" | "void_out";

const STATUS_AFTER: Record<SerialOp, "in_stock" | "sold" | "returned" | "written_off"> = {
  receive: "in_stock",
  sell: "sold",
  customer_return: "in_stock",
  supplier_return: "returned",
  write_off: "written_off",
  void_in: "returned",
  void_out: "in_stock",
};

/**
 * Records the serial numbers a move carried and where each one is now. Received serials must not be in stock already;
 * sold ones may be unknown (sold before the bill came in), and are then received later.
 */
export async function moveSerials(tx: Tx, orgId: number, item: StockItem, moveId: number, list: readonly string[], qty: number, op: SerialOp): Promise<void> {
  const { serials, problem } = cleanSerials(list);
  if (!serials.length) return;
  if (problem) throw new UserError(problem);
  if (!item.trackSerials) throw new UserError(`${item.name} (${item.sku}) does not keep serial numbers.`);
  if (serials.length !== Math.abs(qty)) throw new UserError(`${item.name}: ${Math.abs(qty)} unit${Math.abs(qty) === 1 ? "" : "s"} need ${Math.abs(qty)} serial number${Math.abs(qty) === 1 ? "" : "s"}; ${serials.length} given.`);
  const norms = serials.map(serialNorm);
  const known = new Map((await tx.select().from(S).where(and(eq(S.organizationId, orgId), eq(S.itemId, item.id), inArray(S.serialNorm, norms))).for("update")).map((r) => [r.serialNorm, r]));
  const now = new Date();
  for (const [i, raw] of serials.entries()) {
    const n = norms[i];
    const row = known.get(n);
    let id: number;
    if (!row) {
      if (op !== "receive" && op !== "sell") throw new UserError(`Serial ${raw} is not known for ${item.name}.`);
      [{ id }] = await tx
        .insert(S)
        .values({ organizationId: orgId, itemId: item.id, serial: raw, serialNorm: n, status: STATUS_AFTER[op], receivedMoveId: op === "receive" ? moveId : null, lastMoveId: moveId })
        .returning({ id: S.id });
    } else {
      const ok =
        op === "receive" ? row.status !== "in_stock" : op === "sell" ? row.status === "in_stock" : op === "customer_return" ? row.status === "sold" : op === "void_in" || op === "void_out" ? true : row.status === "in_stock";
      // bought after it was already sold (back-to-back): it stays sold, now with where it came from
      const soldBefore = op === "receive" && row.status === "sold" && row.receivedMoveId == null;
      if (!ok && !soldBefore) throw new UserError(`Serial ${raw} of ${item.name} is ${row.status.replace("_", " ")}, so it cannot be ${op === "receive" ? "received" : op === "sell" ? "sold" : "moved"} here.`);
      id = row.id;
      await tx
        .update(S)
        .set({ status: soldBefore ? "sold" : STATUS_AFTER[op], ...(op === "receive" ? { receivedMoveId: moveId } : {}), lastMoveId: moveId, updatedAt: now })
        .where(eq(S.id, row.id));
    }
    await tx.insert(schema.stockMoveSerials).values({ organizationId: orgId, moveId, serialId: id });
  }
}

/** The serials a move carried. */
export async function serialsOfMove(tx: Tx, moveId: number): Promise<string[]> {
  const rows = await tx.select({ serial: S.serial }).from(schema.stockMoveSerials).innerJoin(S, eq(S.id, schema.stockMoveSerials.serialId)).where(eq(schema.stockMoveSerials.moveId, moveId));
  return rows.map((r) => r.serial);
}

/* ---------- reading the moves ---------- */

export type MoveRow = typeof schema.stockMoves.$inferSelect;

export async function movesOf(tx: Tx, orgId: number, sourceType: string, sourceId: number, kinds?: readonly string[]): Promise<MoveRow[]> {
  return tx
    .select()
    .from(M)
    .where(and(eq(M.organizationId, orgId), eq(M.sourceType, sourceType), eq(M.sourceId, sourceId), kinds ? inArray(M.kind, [...kinds]) : sql`true`))
    .orderBy(asc(M.id));
}

/**
 * Undoes a document's moves exactly (void rows at their own values), which is only safe while nothing has moved those
 * items since: otherwise average costs and later sales were worked out with them. Serials it brought in leave stock.
 */
export async function voidMoves(tx: Tx, orgId: number, moves: readonly MoveRow[], what: string, userId: number | null): Promise<number[]> {
  if (!moves.length) return [];
  const items = await lockItems(tx, orgId, moves.map((m) => m.itemId));
  const first = Math.min(...moves.map((m) => m.id));
  const ids = moves.map((m) => m.id);
  const [later] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(M)
    .where(and(eq(M.organizationId, orgId), inArray(M.itemId, [...items.keys()]), gt(M.id, first), sql`${M.id} NOT IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
  if (later.n > 0) throw new UserError(`The items on ${what} have moved since (sold, returned or counted), so it cannot be undone. Use a debit note or a stock adjustment instead.`);
  const out: number[] = [];
  for (const m of [...moves].reverse()) {
    const item = items.get(m.itemId)!;
    const id = await writeMove(tx, { orgId, item, date: m.date, kind: "void", qty: -m.qty, value: -m.value, unitCost: m.unitCost, sourceType: m.sourceType, sourceId: m.sourceId, returnOfMoveId: m.id, userId });
    const serials = await serialsOfMove(tx, m.id);
    if (serials.length) await moveSerials(tx, orgId, item, id, serials, serials.length, m.qty > 0 ? "void_in" : "void_out");
    out.push(id);
  }
  return out;
}

/** Has this item any stock moves? (Its stock and serial switches are then fixed.) */
export async function itemHasMoves(tx: Tx, orgId: number, itemId: number): Promise<boolean> {
  const [r] = await tx.select({ id: M.id }).from(M).where(and(eq(M.organizationId, orgId), eq(M.itemId, itemId))).limit(1);
  return !!r;
}

/** An item's stock worked out again from its moves (the figures on the row are a cache of this). */
export async function rebuildItem(tx: Tx, orgId: number, itemId: number): Promise<{ qty: number; value: number; uncosted: number }> {
  const [r] = await tx
    .select({ qty: sql<number>`coalesce(sum(${M.qty}), 0)::float`, value: sql<number>`coalesce(sum(${M.value}), 0)::float`, uncosted: sql<number>`coalesce(sum(${M.uncostedQty}), 0)::float` })
    .from(M)
    .where(and(eq(M.organizationId, orgId), eq(M.itemId, itemId)));
  return { qty: q2(r.qty), value: m2(r.value), uncosted: q2(r.uncosted) };
}
