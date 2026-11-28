import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { inventory1310 } from "./start";

const I = schema.items;

/** The Inventory overview figures: items by kind and tracking, stock value, and the stock settings. */
export async function inventoryOverview(orgId: number) {
  const [[n], [s]] = await Promise.all([
    db
      .select({
        active: sql<number>`count(*) FILTER (WHERE ${I.isActive})::int`,
        goods: sql<number>`count(*) FILTER (WHERE ${I.isActive} AND ${I.kind} = 'goods')::int`,
        tracked: sql<number>`count(*) FILTER (WHERE ${I.isActive} AND ${I.trackStock})::int`,
        serials: sql<number>`count(*) FILTER (WHERE ${I.isActive} AND ${I.trackSerials})::int`,
        services: sql<number>`count(*) FILTER (WHERE ${I.isActive} AND ${I.kind} = 'service')::int`,
        value: sql<number>`coalesce(sum(${I.stockValue}), 0)::float`,
        low: sql<number>`count(*) FILTER (WHERE ${I.isActive} AND ${I.trackStock} AND ${I.reorderLevel} IS NOT NULL AND ${I.onHand} < ${I.reorderLevel})::int`,
        short: sql<number>`count(*) FILTER (WHERE ${I.trackStock} AND ${I.onHand} < 0)::int`,
        categories: sql<number>`(SELECT count(*)::int FROM ${schema.itemCategories} WHERE ${schema.itemCategories.organizationId} = ${orgId})`,
      })
      .from(I)
      .where(eq(I.organizationId, orgId)),
    db
      .select({ stockStart: schema.accountingSettings.stockStart, negativeStock: schema.accountingSettings.negativeStock })
      .from(schema.accountingSettings)
      .where(eq(schema.accountingSettings.organizationId, orgId)),
  ]);
  return { ...n, stockStart: s?.stockStart ?? null, negativeStock: s?.negativeStock ?? ("allow" as const) };
}

/* ---------- stock on hand ---------- */

export type StockRow = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  categoryName: string | null;
  trackSerials: boolean;
  onHand: number;
  /** On open sales orders not invoiced yet. */
  committed: number;
  available: number;
  reorderLevel: number | null;
  avgCost: number;
  stockValue: number;
  /** Sold beyond stock, still waiting for a supplier bill to give them a cost. */
  uncosted: number;
};

/** Every item that tracks stock (and any other with stock left), with what open orders already promise. */
export async function stockOnHand(orgId: number): Promise<StockRow[]> {
  const res = await db.execute<StockRow>(sql`
    SELECT i.id, i.sku, i.name, i.unit, c.name AS "categoryName", i.track_serials AS "trackSerials",
      i.on_hand::float AS "onHand", coalesce(o.qty, 0)::float AS committed,
      (i.on_hand - coalesce(o.qty, 0))::float AS available, i.reorder_level::float AS "reorderLevel",
      i.avg_cost::float AS "avgCost", i.stock_value::float AS "stockValue", coalesce(u.qty, 0)::float AS uncosted
    FROM items i
    LEFT JOIN item_categories c ON c.id = i.category_id
    LEFT JOIN (
      SELECT oi.item_id, sum(oi.qty) AS qty FROM sales_order_items oi JOIN sales_orders so ON so.id = oi.order_id
      WHERE so.organization_id = ${orgId} AND so.status IN ('open', 'delivered') AND oi.item_id IS NOT NULL GROUP BY oi.item_id
    ) o ON o.item_id = i.id
    LEFT JOIN (
      SELECT item_id, sum(uncosted_qty) AS qty FROM stock_moves WHERE organization_id = ${orgId} AND uncosted_qty > 0 GROUP BY item_id
    ) u ON u.item_id = i.id
    WHERE i.organization_id = ${orgId} AND ((i.track_stock AND i.is_active) OR i.on_hand <> 0)
    ORDER BY lower(i.name)`);
  return res.rows;
}

/* ---------- where a move came from ---------- */

export interface DocRef {
  number: string;
  href: string | null;
  party: string | null;
}

const refKey = (t: string, id: number) => `${t}:${id}`;

/** Numbers and links of the documents behind stock moves (bills, invoices, notes, adjustments). The ids come from the organisation's own moves. */
export async function docRefs(orgId: number, refs: readonly { sourceType: string; sourceId: number }[]): Promise<Map<string, DocRef>> {
  const ids = (t: string[]) => [...new Set(refs.filter((r) => t.includes(r.sourceType)).map((r) => r.sourceId))];
  const out = new Map<string, DocRef>();
  const bills = ids(["bill", "expense"]);
  const invoices = ids(["invoice"]);
  const cns = ids(["credit_note"]);
  const dns = ids(["debit_note"]);
  const adjs = ids(["stock_adjustment"]);
  const jobs: Promise<void>[] = [];
  if (bills.length)
    jobs.push(
      db
        .select({ id: schema.bills.id, kind: schema.bills.kind, number: schema.bills.number, party: schema.suppliers.name })
        .from(schema.bills)
        .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.bills.supplierId))
        .where(inArray(schema.bills.id, bills))
        .then((rows) => rows.forEach((r) => out.set(refKey(r.kind === "expense" ? "expense" : "bill", r.id), { number: r.number, href: `/accounts/bills/${r.id}`, party: r.party }))),
    );
  if (invoices.length)
    jobs.push(
      db
        .select({ id: schema.invoices.id, number: schema.invoices.number, party: schema.invoices.customerName })
        .from(schema.invoices)
        .where(inArray(schema.invoices.id, invoices))
        .then((rows) => rows.forEach((r) => out.set(refKey("invoice", r.id), { number: r.number, href: `/accounts/invoices/${r.id}`, party: r.party }))),
    );
  if (cns.length)
    jobs.push(
      db
        .select({ id: schema.creditNotes.id, number: schema.creditNotes.number, invoiceId: schema.creditNotes.invoiceId, party: schema.invoices.customerName })
        .from(schema.creditNotes)
        .leftJoin(schema.invoices, eq(schema.invoices.id, schema.creditNotes.invoiceId))
        .where(inArray(schema.creditNotes.id, cns))
        .then((rows) => rows.forEach((r) => out.set(refKey("credit_note", r.id), { number: r.number, href: `/accounts/invoices/${r.invoiceId}`, party: r.party }))),
    );
  if (dns.length)
    jobs.push(
      db
        .select({ id: schema.debitNotes.id, number: schema.debitNotes.number, billId: schema.debitNotes.billId })
        .from(schema.debitNotes)
        .where(inArray(schema.debitNotes.id, dns))
        .then((rows) => rows.forEach((r) => out.set(refKey("debit_note", r.id), { number: r.number, href: `/accounts/bills/${r.billId}`, party: null }))),
    );
  if (adjs.length)
    jobs.push(
      db
        .select({ id: schema.stockAdjustments.id, number: schema.stockAdjustments.number, reason: schema.stockAdjustments.reason })
        .from(schema.stockAdjustments)
        .where(and(eq(schema.stockAdjustments.organizationId, orgId), inArray(schema.stockAdjustments.id, adjs)))
        .then((rows) => rows.forEach((r) => out.set(refKey("stock_adjustment", r.id), { number: r.number, href: `/inventory/adjustments/${r.id}`, party: r.reason || null }))),
    );
  await Promise.all(jobs);
  return out;
}

export const docRefOf = (refs: Map<string, DocRef>, m: { sourceType: string; sourceId: number }): DocRef => refs.get(refKey(m.sourceType, m.sourceId)) ?? { number: `${m.sourceType} ${m.sourceId}`, href: null, party: null };

/* ---------- one item: its stock card ---------- */

/** An item with its latest stock moves (newest first) and its serial numbers. */
export async function itemStockCard(orgId: number, itemId: number) {
  const [row] = await db
    .select({ item: schema.items, categoryName: schema.itemCategories.name })
    .from(schema.items)
    .leftJoin(schema.itemCategories, eq(schema.itemCategories.id, schema.items.categoryId))
    .where(and(eq(schema.items.organizationId, orgId), eq(schema.items.id, itemId)));
  if (!row) return null;
  const M = schema.stockMoves;
  const [moves, serials] = await Promise.all([
    db.select().from(M).where(and(eq(M.organizationId, orgId), eq(M.itemId, itemId))).orderBy(desc(M.id)).limit(500),
    db
      .select({ serial: schema.stockSerials.serial, status: schema.stockSerials.status })
      .from(schema.stockSerials)
      .where(and(eq(schema.stockSerials.organizationId, orgId), eq(schema.stockSerials.itemId, itemId)))
      .orderBy(asc(schema.stockSerials.serialNorm)),
  ]);
  const refs = await docRefs(orgId, moves);
  return { ...row.item, categoryName: row.categoryName, moves: moves.map((m) => ({ ...m, doc: docRefOf(refs, m) })), serials };
}

/* ---------- serial numbers ---------- */

/** Serial numbers matching a search (any part; case and spaces ignored), with their item and the last document. */
export async function searchSerials(orgId: number, q: string) {
  const norm = q.toUpperCase().replace(/\s+/g, "");
  if (norm.length < 3) return [];
  const S = schema.stockSerials;
  const rows = await db
    .select({ id: S.id, serial: S.serial, status: S.status, itemId: S.itemId, sku: schema.items.sku, name: schema.items.name, sourceType: schema.stockMoves.sourceType, sourceId: schema.stockMoves.sourceId, date: schema.stockMoves.date })
    .from(S)
    .innerJoin(schema.items, eq(schema.items.id, S.itemId))
    .leftJoin(schema.stockMoves, eq(schema.stockMoves.id, S.lastMoveId))
    .where(and(eq(S.organizationId, orgId), sql`${S.serialNorm} LIKE ${"%" + norm.replace(/[%_\\]/g, "\\$&") + "%"}`))
    .orderBy(asc(S.serialNorm))
    .limit(100);
  const withDoc = rows.filter((r): r is typeof r & { sourceType: string; sourceId: number } => r.sourceType != null && r.sourceId != null);
  const refs = await docRefs(orgId, withDoc);
  return rows.map((r) => ({ ...r, doc: r.sourceType != null && r.sourceId != null ? docRefOf(refs, { sourceType: r.sourceType, sourceId: r.sourceId }) : null }));
}

/* ---------- adjustments ---------- */

export async function listAdjustments(orgId: number) {
  const A = schema.stockAdjustments;
  return db
    .select({
      id: A.id,
      number: A.number,
      date: A.date,
      kind: A.kind,
      reason: A.reason,
      status: A.status,
      totalValue: A.totalValue,
      lines: sql<number>`(SELECT count(*)::int FROM stock_adjustment_lines l WHERE l.adjustment_id = ${A.id})`,
      by: schema.users.name,
    })
    .from(A)
    .leftJoin(schema.users, eq(schema.users.id, A.createdBy))
    .where(eq(A.organizationId, orgId))
    .orderBy(desc(A.date), desc(A.id));
}

export async function getAdjustment(orgId: number, id: number) {
  const A = schema.stockAdjustments;
  const L = schema.stockAdjustmentLines;
  const [a] = await db.select({ adj: A, by: schema.users.name }).from(A).leftJoin(schema.users, eq(schema.users.id, A.createdBy)).where(and(eq(A.organizationId, orgId), eq(A.id, id)));
  if (!a) return null;
  const [lines, moves] = await Promise.all([
    db
      .select({ line: L, sku: schema.items.sku, name: schema.items.name, unit: schema.items.unit })
      .from(L)
      .innerJoin(schema.items, eq(schema.items.id, L.itemId))
      .where(eq(L.adjustmentId, id))
      .orderBy(asc(L.position), asc(L.id)),
    db
      .select()
      .from(schema.stockMoves)
      .where(and(eq(schema.stockMoves.organizationId, orgId), eq(schema.stockMoves.sourceType, "stock_adjustment"), eq(schema.stockMoves.sourceId, id))),
  ]);
  return {
    ...a.adj,
    by: a.by,
    lines: lines.map((l) => {
      const moved = moves.filter((m) => m.sourceLineId === l.line.id && m.kind !== "void");
      return { ...l.line, sku: l.sku, name: l.name, unit: l.unit, value: Math.round(moved.reduce((s, m) => s + m.value, 0) * 100) / 100 };
    }),
  };
}

/* ---------- stock start ---------- */

/** What the Start stock form needs: the books' dates, what the old Inventory account (1310) holds today, the opening count. */
export async function stockStartInfo(orgId: number) {
  const [s] = await db
    .select({ stockStart: schema.accountingSettings.stockStart, cutover: schema.accountingSettings.cutoverDate, lockDate: schema.accountingSettings.lockDate })
    .from(schema.accountingSettings)
    .where(eq(schema.accountingSettings.organizationId, orgId));
  const [balance1310, [opening]] = await Promise.all([
    inventory1310(db as never, orgId, dubaiToday()),
    db
      .select({ id: schema.stockAdjustments.id, number: schema.stockAdjustments.number, totalValue: schema.stockAdjustments.totalValue })
      .from(schema.stockAdjustments)
      .where(and(eq(schema.stockAdjustments.organizationId, orgId), eq(schema.stockAdjustments.kind, "opening"), eq(schema.stockAdjustments.status, "posted"))),
  ]);
  return { stockStart: s?.stockStart ?? null, cutover: s?.cutover ?? null, lockDate: s?.lockDate ?? null, balance1310, opening: opening ?? null };
}

/** Items the stock forms offer (stock-tracked, active), with what they cost. */
export async function stockItemOptions(orgId: number) {
  return db
    .select({ id: I.id, sku: I.sku, name: I.name, unit: I.unit, trackSerials: I.trackSerials, onHand: I.onHand, avgCost: I.avgCost, purchasePrice: I.purchasePrice })
    .from(I)
    .where(and(eq(I.organizationId, orgId), eq(I.trackStock, true), eq(I.isActive, true)))
    .orderBy(sql`lower(${I.name})`);
}

/** The day stock started, or null: forms ask for serial numbers and warn about shortages only from then on. */
export async function stockStartOf(orgId: number): Promise<string | null> {
  const [s] = await db.select({ stockStart: schema.accountingSettings.stockStart }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
  return s?.stockStart ?? null;
}

/** What a form needs to know about the items on its lines: stock tracking, serials and what is on hand. */
export interface LineStock {
  trackStock: boolean;
  trackSerials: boolean;
  onHand: number;
  unit: string;
}

export async function lineStockOf(orgId: number, ids: readonly (number | null | undefined)[]): Promise<Map<number, LineStock>> {
  const want = [...new Set(ids.filter((i): i is number => !!i))];
  if (!want.length) return new Map();
  const rows = await db
    .select({ id: I.id, trackStock: I.trackStock, trackSerials: I.trackSerials, onHand: I.onHand, unit: I.unit })
    .from(I)
    .where(and(eq(I.organizationId, orgId), inArray(I.id, want)));
  return new Map(rows.map((r) => [r.id, { trackStock: r.trackStock, trackSerials: r.trackSerials, onHand: r.onHand, unit: r.unit }]));
}

/** A document line that moved item stock, for a credit or debit note: whether it keeps serials, and which can still go back. */
export interface NoteStock {
  trackSerials: boolean;
  serials: string[];
}

/**
 * The lines of an invoice (sold from stock) or a bill (came into stock) that moved item stock, with the serial numbers
 * on them that earlier credit or debit notes have not already taken back.
 */
export async function noteStockLines(orgId: number, doc: "invoice" | "bill", id: number): Promise<Record<number, NoteStock>> {
  const M = schema.stockMoves;
  const moves = await db
    .select({ lineId: M.sourceLineId, trackSerials: I.trackSerials })
    .from(M)
    .innerJoin(I, eq(I.id, M.itemId))
    .where(and(eq(M.organizationId, orgId), inArray(M.sourceType, doc === "invoice" ? ["invoice"] : ["bill", "expense"]), eq(M.sourceId, id), eq(M.kind, doc === "invoice" ? "sale" : "purchase")));
  const ids = moves.map((m) => m.lineId).filter((x): x is number => x != null);
  if (!ids.length) return {};
  const [lines, back] =
    doc === "invoice"
      ? await Promise.all([
          db.select({ id: schema.invoiceItems.id, serials: schema.invoiceItems.serials }).from(schema.invoiceItems).where(inArray(schema.invoiceItems.id, ids)),
          db.select({ id: schema.creditNoteItems.invoiceItemId, serials: schema.creditNoteItems.serials }).from(schema.creditNoteItems).where(inArray(schema.creditNoteItems.invoiceItemId, ids)),
        ])
      : await Promise.all([
          db.select({ id: schema.billItems.id, serials: schema.billItems.serials }).from(schema.billItems).where(inArray(schema.billItems.id, ids)),
          db.select({ id: schema.debitNoteItems.billItemId, serials: schema.debitNoteItems.serials }).from(schema.debitNoteItems).where(inArray(schema.debitNoteItems.billItemId, ids)),
        ]);
  const out: Record<number, NoteStock> = {};
  for (const m of moves) {
    if (m.lineId == null) continue;
    const gone = new Set(back.filter((b) => b.id === m.lineId).flatMap((b) => b.serials));
    out[m.lineId] = { trackSerials: m.trackSerials, serials: (lines.find((l) => l.id === m.lineId)?.serials ?? []).filter((s) => !gone.has(s)) };
  }
  return out;
}
