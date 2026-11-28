import "server-only";
import { and, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { dubaiToday } from "@/lib/dates";
import { takeSeriesNumber } from "@/lib/doc-numbers";
import { postAdjustmentDoc, voidAdjustmentDoc } from "@/lib/ledger/stock-docs";
import { longDay } from "@/lib/quotation";
import type { Tx } from "@/lib/tx";
import { UserError } from "@/lib/user-error";
import { cleanSerials } from "./costing";

/**
 * Starting stock (Inventory › Settings, accountants): the day item stock begins to move with bills and invoices, and the
 * opening count of what is on the shelf that morning. Posted as one opening stock adjustment (SA-…), so the stock account
 * (1330) starts at the counted value, against opening balance equity, or against the old Inventory account (1310) when
 * those goods are already in the books from earlier bills.
 *
 * Kept simple on purpose: no stock document may already be dated on or after the start (they were saved while stock
 * was off and moved nothing), and undoing is possible only while nothing but the opening count has moved.
 */

export interface OpeningLine {
  itemId: number;
  qty: number;
  unitCost: number;
  serials: string[];
}

export interface StartInput {
  date: string;
  offset: "opening_equity" | "inventory";
  lines: OpeningLine[];
}

export interface StartResult {
  number: string | null;
  items: number;
  units: number;
  value: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What the old Inventory account (1310: goods bought, not tracked by item) holds at the end of `date`. */
export async function inventory1310(tx: Tx, orgId: number, date: string): Promise<number> {
  const res = await tx.execute<{ b: number }>(sql`
    SELECT coalesce(sum(l.debit - l.credit), 0)::float AS b
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND a.system_key = 'inventory' AND e.date <= ${date}`);
  return r2(Number(res.rows[0]?.b ?? 0));
}

/**
 * Documents with stock-item lines (found through the items, which always carry the organisation) already dated on or after `date`: saved while stock was off, so they moved nothing.
 * Starting before them would leave the stock wrong, so the start must come after the last of them.
 */
export async function stockDocsFrom(tx: Tx, orgId: number, date: string): Promise<{ number: string; date: string }[]> {
  const I = schema.items;
  const bills = await tx
    .selectDistinct({ number: schema.bills.number, date: schema.bills.billDate })
    .from(schema.billItems)
    .innerJoin(schema.bills, eq(schema.bills.id, schema.billItems.billId))
    .innerJoin(I, eq(I.id, schema.billItems.itemId))
    .where(and(eq(I.organizationId, orgId), ne(schema.bills.status, "void"), gte(schema.bills.billDate, date), eq(I.trackStock, true)));
  const invoices = await tx
    .selectDistinct({ number: schema.invoices.number, date: schema.invoices.issueDate })
    .from(schema.invoiceItems)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoiceItems.invoiceId))
    .innerJoin(I, eq(I.id, schema.invoiceItems.itemId))
    .where(and(eq(I.organizationId, orgId), ne(schema.invoices.status, "void"), gte(schema.invoices.issueDate, date), eq(I.trackStock, true), isNotNull(schema.invoiceItems.itemId)));
  return [...bills, ...invoices].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Starts item stock on `date` with the opening count. Call inside a transaction (the caller rolls it back for a dry run). */
export async function startStockTx(tx: Tx, orgId: number, userId: number, d: StartInput): Promise<StartResult> {
  const [s] = await tx.select().from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId)).for("update");
  if (s?.stockStart) throw new UserError(`Stock already started on ${longDay(s.stockStart)}.`);
  if (!s?.cutoverDate) throw new UserError("Switch the books on first (Accounts › Settings › Books: the cut-over date). Stock is valued in the ledger.");
  if (d.date < s.cutoverDate) throw new UserError(`Stock cannot start before the books do (${longDay(s.cutoverDate)}).`);
  if (s.lockDate && d.date <= s.lockDate) throw new UserError(`The books are locked up to ${longDay(s.lockDate)}. Pick a later start date.`);
  if (d.date > dubaiToday()) throw new UserError("The start date cannot be in the future.");
  const docs = await stockDocsFrom(tx, orgId, d.date);
  if (docs.length) {
    const last = docs[0];
    throw new UserError(`${last.number} (${longDay(last.date)}) has stock items and was saved before stock started, so it moved nothing. Pick a start date after ${longDay(last.date)}${docs.length > 1 ? ` (${docs.length} such documents)` : ""}.`);
  }

  const seen = new Set<number>();
  for (const l of d.lines) {
    if (seen.has(l.itemId)) throw new UserError("An item is on the count twice. Put each item on one line.");
    seen.add(l.itemId);
  }
  const ids = [...seen];
  const items = ids.length ? await tx.select().from(schema.items).where(and(eq(schema.items.organizationId, orgId), inArray(schema.items.id, ids))) : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const [n, l] of d.lines.entries()) {
    const it = byId.get(l.itemId);
    if (!it) throw new UserError(`Line ${n + 1}: that item no longer exists.`);
    if (!it.trackStock) throw new UserError(`${it.name} (${it.sku}) does not track stock. Tick "Track stock" on the item first.`);
    if (!(l.qty > 0)) throw new UserError(`${it.name}: enter how many are on the shelf.`);
    if (!(l.unitCost >= 0)) throw new UserError(`${it.name}: enter what one unit cost.`);
    const { serials, problem } = cleanSerials(l.serials);
    if (problem) throw new UserError(`${it.name}: ${problem}`);
    if (it.trackSerials && serials.length !== l.qty) throw new UserError(`${it.name}: ${l.qty} on the shelf need ${l.qty} serial numbers; ${serials.length} given.`);
    if (!it.trackSerials && serials.length) throw new UserError(`${it.name} does not keep serial numbers.`);
  }

  await tx.update(schema.accountingSettings).set({ stockStart: d.date, updatedAt: new Date(), updatedBy: userId }).where(eq(schema.accountingSettings.organizationId, orgId));
  let number: string | null = null;
  let value = 0;
  if (d.lines.length) {
    ({ number } = await takeSeriesNumber(tx, { orgId, key: "stock_adjustment", prefix: "SA" }));
    const [a] = await tx
      .insert(schema.stockAdjustments)
      .values({ organizationId: orgId, number, date: d.date, kind: "opening", reason: "Opening count", offset: d.offset, createdBy: userId })
      .returning({ id: schema.stockAdjustments.id });
    await tx.insert(schema.stockAdjustmentLines).values(
      d.lines.map((l, position) => ({ organizationId: orgId, adjustmentId: a.id, itemId: l.itemId, position, qty: l.qty, unitCost: l.unitCost, serials: cleanSerials(l.serials).serials })),
    );
    await postAdjustmentDoc(tx, orgId, a.id, userId);
    const [t] = await tx.select({ v: schema.stockAdjustments.totalValue }).from(schema.stockAdjustments).where(eq(schema.stockAdjustments.id, a.id));
    value = t.v;
  }
  const units = r2(d.lines.reduce((n, l) => n + l.qty, 0));
  await audit(tx, { userId, orgId, action: "stock.start", entity: "accounting_settings", summary: `Stock started ${d.date}${number ? `, opening count ${number}: ${d.lines.length} items, ${units} units` : ", nothing on the shelf"}` });
  return { number, items: d.lines.length, units, value };
}

/**
 * Undoes the stock start: only while the opening count is the only thing that moved stock. The opening adjustment is
 * voided (its entry reversed) and stock is off again; a new start then takes a new SA number.
 */
export async function undoStockStartTx(tx: Tx, orgId: number, userId: number, reason: string): Promise<void> {
  const [s] = await tx.select().from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId)).for("update");
  if (!s?.stockStart) throw new UserError("Stock has not started.");
  const A = schema.stockAdjustments;
  const openings = await tx.select({ id: A.id, status: A.status }).from(A).where(and(eq(A.organizationId, orgId), eq(A.kind, "opening")));
  const openingIds = new Set(openings.map((o) => o.id));
  const [other] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.stockMoves)
    .where(
      and(
        eq(schema.stockMoves.organizationId, orgId),
        openingIds.size ? sql`NOT (${schema.stockMoves.sourceType} = 'stock_adjustment' AND ${schema.stockMoves.sourceId} IN (${sql.join([...openingIds].map((i) => sql`${i}`), sql`, `)}))` : sql`true`,
      ),
    );
  if (other.n > 0) throw new UserError("Bills, invoices or adjustments have moved stock since it started, so the start can no longer be undone. Correct the count with a stock adjustment instead.");
  for (const o of openings) if (o.status === "posted") await voidAdjustmentDoc(tx, orgId, o.id, reason, userId);
  await tx.update(schema.accountingSettings).set({ stockStart: null, updatedAt: new Date(), updatedBy: userId }).where(eq(schema.accountingSettings.organizationId, orgId));
  await audit(tx, { userId, orgId, action: "stock.start_undone", entity: "accounting_settings", summary: `Stock start ${s.stockStart} undone: ${reason}` });
}

/* ---------- stock adjustments after the start ---------- */

export interface AdjustLine {
  itemId: number;
  /** A count: what is on the shelf. A write-off: how many go. */
  qty: number;
  /** A count that finds more than on hand: what one extra unit cost (empty = the average cost). */
  unitCost?: number | null;
  serials: string[];
}

export interface AdjustInput {
  date: string;
  kind: "count" | "write_off";
  reason: string;
  lines: AdjustLine[];
}

/** A stock count or a write-off, against stock adjustments (5150). Returns the new adjustment. */
export async function saveAdjustmentTx(tx: Tx, orgId: number, userId: number, d: AdjustInput): Promise<{ id: number; number: string }> {
  const [s] = await tx.select({ stockStart: schema.accountingSettings.stockStart, lockDate: schema.accountingSettings.lockDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
  if (!s?.stockStart) throw new UserError("Stock has not started. An accountant starts it in Inventory › Settings.");
  if (d.date < s.stockStart) throw new UserError(`Stock started on ${longDay(s.stockStart)}; an adjustment cannot be dated before that.`);
  if (s.lockDate && d.date <= s.lockDate) throw new UserError(`The books are locked up to ${longDay(s.lockDate)}.`);
  if (d.date > dubaiToday()) throw new UserError("The date cannot be in the future.");
  if (!d.lines.length) throw new UserError("Add at least one item.");
  const seen = new Set<number>();
  for (const l of d.lines) {
    if (seen.has(l.itemId)) throw new UserError("An item is on the adjustment twice. Put each item on one line.");
    seen.add(l.itemId);
    if (d.kind === "write_off" ? !(l.qty > 0) : !(l.qty >= 0)) throw new UserError(d.kind === "write_off" ? "Enter how many units go on each line." : "Enter what was counted on each line (0 when none are left).");
  }
  const { number } = await takeSeriesNumber(tx, { orgId, key: "stock_adjustment", prefix: "SA" });
  const [a] = await tx
    .insert(schema.stockAdjustments)
    .values({ organizationId: orgId, number, date: d.date, kind: d.kind, reason: d.reason, offset: "stock_adjustments", createdBy: userId })
    .returning({ id: schema.stockAdjustments.id });
  await tx.insert(schema.stockAdjustmentLines).values(
    d.lines.map((l, position) => ({
      organizationId: orgId,
      adjustmentId: a.id,
      itemId: l.itemId,
      position,
      qty: d.kind === "write_off" ? -l.qty : 0,
      countedQty: d.kind === "count" ? l.qty : null,
      unitCost: d.kind === "count" ? (l.unitCost ?? null) : null,
      serials: cleanSerials(l.serials).serials,
    })),
  );
  await postAdjustmentDoc(tx, orgId, a.id, userId);
  // a count that matched what was on hand moved nothing on that line; a count where nothing changed at all is no adjustment
  const [moved] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.stockMoves).where(and(eq(schema.stockMoves.organizationId, orgId), eq(schema.stockMoves.sourceType, "stock_adjustment"), eq(schema.stockMoves.sourceId, a.id)));
  if (!moved.n) throw new UserError("The count matches what is on hand for every item, so there is nothing to adjust.");
  await audit(tx, { userId, orgId, action: "stock.adjust", entity: "stock_adjustment", entityId: a.id, summary: `${number}: ${d.kind === "count" ? "stock count" : "write-off"} of ${d.lines.length} item${d.lines.length === 1 ? "" : "s"}` });
  return { id: a.id, number };
}
