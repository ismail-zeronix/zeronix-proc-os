import "server-only";
import { sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { dubaiToday } from "@/lib/dates";
import type { RangeDays } from "@/lib/sales-overview";

export interface SalesDashboard {
  kpi: {
    /** Sales orders made in the period (not cancelled), before VAT, and the period before. */
    salesCur: number;
    salesPrev: number;
    ordersCur: number;
    ordersPrev: number;
    /** Quoted cost on those orders, for the expected profit. Null when no order has a cost. */
    profitCur: number | null;
    marginBase: number;
    quotesSentCur: number;
    quotesSentPrev: number;
    quotedValueCur: number;
    /** Accepted, and answered (accepted + rejected + ran out) in the period. */
    acceptedCur: number;
    answeredCur: number;
    waitingCount: number;
    waitingValue: number;
    toDeliverCount: number;
    toDeliverValue: number;
    toInvoiceCount: number;
  };
  /** Quoted and ordered value per week (month for a year view), oldest first. */
  trend: { start: string; quoted: number; ordered: number }[];
  customers: { name: string; value: number; orders: number }[];
  products: { name: string; value: number; qty: number }[];
  people: { id: number; name: string; sales: number; orders: number; waiting: number }[];
  waiting: { id: number; number: string; company: string; value: number; validUntil: string }[];
  expired: { id: number; number: string; company: string; value: number; validUntil: string }[];
  drafts: { id: number; number: string; company: string; value: number; createdAt: string }[];
  toDeliver: { id: number; number: string; company: string; value: number; createdAt: string }[];
}

/**
 * Everything the Sales overview shows for one range and one scope: the whole team, or one salesperson (the quotes in
 * their name and the sales orders made from them). Cached per request.
 */
export const salesDashboard = cache(async (userId: number, team: boolean, range: RangeDays): Promise<SalesDashboard> => {
  // a quote and its sales order belong to the quote's salesperson (whoever typed it, for older quotes)
  const qMine = team ? sql`TRUE` : sql`coalesce(q.owner_id, q.created_by) = ${userId}`;
  const oMine = team ? sql`TRUE` : sql`EXISTS (SELECT 1 FROM quotes q WHERE q.id = o.quote_id AND coalesce(q.owner_id, q.created_by) = ${userId})`;
  const days = (n: number) => sql`make_interval(days => ${n})`;
  const curStart = sql`now() - ${days(range)}`;
  const prevStart = sql`now() - ${days(range * 2)}`;
  const today = dubaiToday();
  const unit = range > 90 ? "month" : "week";
  const step = range > 90 ? "1 month" : "1 week";
  const live = sql`o.status <> 'cancelled'`;

  const [orders, quotes, open, trend, customers, products, people, waiting, expired, drafts, toDeliver] = await Promise.all([
    db.execute<Record<string, number | null>>(sql`
      SELECT
        coalesce(sum(o.subtotal) FILTER (WHERE o.created_at >= ${curStart}), 0)::float AS sales_cur,
        coalesce(sum(o.subtotal) FILTER (WHERE o.created_at >= ${prevStart} AND o.created_at < ${curStart}), 0)::float AS sales_prev,
        count(*) FILTER (WHERE o.created_at >= ${curStart})::int AS orders_cur,
        count(*) FILTER (WHERE o.created_at >= ${prevStart} AND o.created_at < ${curStart})::int AS orders_prev,
        sum(o.subtotal - o.cost_total) FILTER (WHERE o.created_at >= ${curStart} AND o.cost_total IS NOT NULL)::float AS profit_cur,
        coalesce(sum(o.subtotal) FILTER (WHERE o.created_at >= ${curStart} AND o.cost_total IS NOT NULL), 0)::float AS margin_base,
        count(*) FILTER (WHERE o.status = 'open')::int AS deliver_n,
        coalesce(sum(o.subtotal) FILTER (WHERE o.status = 'open'), 0)::float AS deliver_v,
        count(*) FILTER (WHERE o.status = 'delivered')::int AS invoice_n
      FROM sales_orders o WHERE ${live} AND ${oMine}`),
    db.execute<Record<string, number | null>>(sql`
      SELECT
        count(*) FILTER (WHERE q.sent_at >= ${curStart})::int AS sent_cur,
        count(*) FILTER (WHERE q.sent_at >= ${prevStart} AND q.sent_at < ${curStart})::int AS sent_prev,
        coalesce(sum(q.subtotal) FILTER (WHERE q.sent_at >= ${curStart}), 0)::float AS quoted_cur,
        count(*) FILTER (WHERE q.status = 'accepted' AND q.decided_at >= ${curStart})::int AS accepted,
        count(*) FILTER (WHERE (q.status IN ('accepted', 'rejected') AND q.decided_at >= ${curStart})
          OR (q.status = 'sent' AND q.valid_until < ${today} AND q.valid_until >= (now() - ${days(range)})::date))::int AS answered
      FROM quotes q WHERE ${qMine}`),
    db.execute<{ n: number; v: number }>(sql`
      SELECT count(*)::int AS n, coalesce(sum(q.subtotal), 0)::float AS v FROM quotes q WHERE q.status = 'sent' AND q.valid_until >= ${today} AND ${qMine}`),
    db.execute<{ start: string; quoted: number; ordered: number }>(sql`
      WITH b AS (SELECT generate_series(date_trunc(${unit}, ${curStart}), date_trunc(${unit}, now()), ${step}::interval) AS start)
      SELECT b.start::date::text AS start,
        (SELECT coalesce(sum(q.subtotal), 0)::float FROM quotes q WHERE ${qMine} AND q.sent_at >= b.start AND q.sent_at < b.start + ${step}::interval) AS quoted,
        (SELECT coalesce(sum(o.subtotal), 0)::float FROM sales_orders o WHERE ${live} AND ${oMine} AND o.created_at >= b.start AND o.created_at < b.start + ${step}::interval) AS ordered
      FROM b ORDER BY b.start`),
    db.execute<{ name: string; v: number; n: number }>(sql`
      SELECT c.name, sum(o.subtotal)::float AS v, count(*)::int AS n
      FROM sales_orders o JOIN companies c ON c.id = o.company_id
      WHERE ${live} AND ${oMine} AND o.created_at >= ${curStart} GROUP BY c.name ORDER BY v DESC LIMIT 8`),
    db.execute<{ name: string; v: number; qty: number }>(sql`
      SELECT left(i.description, 80) AS name, sum(i.qty * i.unit_price)::float AS v, sum(i.qty)::int AS qty
      FROM sales_order_items i JOIN sales_orders o ON o.id = i.order_id
      WHERE ${live} AND ${oMine} AND o.created_at >= ${curStart} GROUP BY 1 ORDER BY v DESC LIMIT 8`),
    db.execute<{ id: number; name: string; sales: number; orders: number; waiting: number }>(sql`
      SELECT u.id, u.name,
        coalesce((SELECT sum(o.subtotal) FROM sales_orders o JOIN quotes q ON q.id = o.quote_id
          WHERE ${live} AND coalesce(q.owner_id, q.created_by) = u.id AND o.created_at >= ${curStart}), 0)::float AS sales,
        (SELECT count(*) FROM sales_orders o JOIN quotes q ON q.id = o.quote_id
          WHERE ${live} AND coalesce(q.owner_id, q.created_by) = u.id AND o.created_at >= ${curStart})::int AS orders,
        coalesce((SELECT sum(q.subtotal) FROM quotes q WHERE q.status = 'sent' AND q.valid_until >= ${today} AND coalesce(q.owner_id, q.created_by) = u.id), 0)::float AS waiting
      FROM users u
      WHERE ${team ? sql`TRUE` : sql`u.id = ${userId}`}
        AND EXISTS (SELECT 1 FROM quotes q WHERE coalesce(q.owner_id, q.created_by) = u.id)
      ORDER BY sales DESC, waiting DESC LIMIT 8`),
    db.execute<{ id: number; number: string; company: string; v: number; valid: string }>(sql`
      SELECT q.id, q.number, c.name AS company, q.subtotal::float AS v, q.valid_until::text AS valid
      FROM quotes q JOIN companies c ON c.id = q.company_id
      WHERE q.status = 'sent' AND q.valid_until >= ${today} AND ${qMine} ORDER BY q.valid_until LIMIT 30`),
    db.execute<{ id: number; number: string; company: string; v: number; valid: string }>(sql`
      SELECT q.id, q.number, c.name AS company, q.subtotal::float AS v, q.valid_until::text AS valid
      FROM quotes q JOIN companies c ON c.id = q.company_id
      WHERE q.status = 'sent' AND q.valid_until < ${today} AND ${qMine} ORDER BY q.valid_until DESC LIMIT 30`),
    db.execute<{ id: number; number: string; company: string; v: number; at: string }>(sql`
      SELECT q.id, q.number, c.name AS company, q.subtotal::float AS v, to_char(q.created_at AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS at
      FROM quotes q JOIN companies c ON c.id = q.company_id
      WHERE q.status = 'draft' AND ${qMine} ORDER BY q.created_at LIMIT 30`),
    db.execute<{ id: number; number: string; company: string; v: number; at: string }>(sql`
      SELECT o.id, o.number, c.name AS company, o.subtotal::float AS v, to_char(o.created_at AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS at
      FROM sales_orders o JOIN companies c ON c.id = o.company_id
      WHERE o.status = 'open' AND ${oMine} ORDER BY o.created_at LIMIT 30`),
  ]);

  const o = orders.rows[0];
  const q = quotes.rows[0];
  const n = (v: number | null | undefined) => v ?? 0;
  return {
    kpi: {
      salesCur: n(o.sales_cur),
      salesPrev: n(o.sales_prev),
      ordersCur: n(o.orders_cur),
      ordersPrev: n(o.orders_prev),
      profitCur: o.profit_cur ?? null,
      marginBase: n(o.margin_base),
      quotesSentCur: n(q.sent_cur),
      quotesSentPrev: n(q.sent_prev),
      quotedValueCur: n(q.quoted_cur),
      acceptedCur: n(q.accepted),
      answeredCur: n(q.answered),
      waitingCount: open.rows[0]?.n ?? 0,
      waitingValue: open.rows[0]?.v ?? 0,
      toDeliverCount: n(o.deliver_n),
      toDeliverValue: n(o.deliver_v),
      toInvoiceCount: n(o.invoice_n),
    },
    trend: trend.rows,
    customers: customers.rows.map((r) => ({ name: r.name, value: r.v, orders: r.n })),
    products: products.rows.map((r) => ({ name: r.name, value: r.v, qty: r.qty })),
    people: people.rows,
    waiting: waiting.rows.map((r) => ({ id: r.id, number: r.number, company: r.company, value: r.v, validUntil: r.valid })),
    expired: expired.rows.map((r) => ({ id: r.id, number: r.number, company: r.company, value: r.v, validUntil: r.valid })),
    drafts: drafts.rows.map((r) => ({ id: r.id, number: r.number, company: r.company, value: r.v, createdAt: r.at })),
    toDeliver: toDeliver.rows.map((r) => ({ id: r.id, number: r.number, company: r.company, value: r.v, createdAt: r.at })),
  };
});
