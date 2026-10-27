import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { listCounts, priceMoves, quietSuppliers } from "@/lib/alerts";
import { getSetting } from "@/lib/settings";

/** Everything the Procurement overview shows. Read-only; cached per request. */
export const procurementOverview = cache(async () => {
  const staleDays = Number(await getSetting("stale_days")) || 14;

  const [counts, moves, quiet, stats, bySupplier, weekly, waiting, recent] = await Promise.all([
    listCounts(),
    priceMoves({ withinDays: 7, staleDays, limit: 100 }),
    quietSuppliers(staleDays),
    db
      .execute<{ offers: number; products: number; suppliers: number; compared: number; week: number; prev_week: number }>(
        sql`SELECT count(*)::int AS offers, count(DISTINCT product_id)::int AS products,
              count(DISTINCT supplier_id)::int AS suppliers,
              (SELECT count(*)::int FROM (
                 SELECT product_id FROM offers WHERE received_at > now() - make_interval(days => ${staleDays})
                 GROUP BY product_id HAVING count(DISTINCT supplier_id) > 1) c) AS compared,
              count(*) FILTER (WHERE received_at > now() - interval '7 days')::int AS week,
              count(*) FILTER (WHERE received_at > now() - interval '14 days' AND received_at <= now() - interval '7 days')::int AS prev_week
            FROM offers`,
      )
      .then((r) => r.rows[0]),
    // products each active supplier currently quotes (fresh) and ever quoted
    db
      .execute<{ name: string; fresh: number; total: number }>(
        sql`SELECT s.name,
              count(DISTINCT o.product_id) FILTER (WHERE o.received_at > now() - make_interval(days => ${staleDays}))::int AS fresh,
              count(DISTINCT o.product_id)::int AS total
            FROM suppliers s JOIN offers o ON o.supplier_id = s.id
            WHERE s.is_active GROUP BY s.id, s.name ORDER BY fresh DESC, total DESC LIMIT 8`,
      )
      .then((r) => r.rows),
    // offers added per week, last 12 weeks
    db
      .execute<{ start: string; offers: number; lists: number }>(
        sql`WITH b AS (
              SELECT generate_series(date_trunc('week', now() - interval '11 weeks'), date_trunc('week', now()), interval '1 week') AS start
            )
            SELECT b.start::date::text AS start,
              (SELECT count(*)::int FROM offers o WHERE o.received_at >= b.start AND o.received_at < b.start + interval '1 week') AS offers,
              (SELECT count(*)::int FROM price_lists p WHERE p.status = 'saved' AND p.received_at >= b.start AND p.received_at < b.start + interval '1 week') AS lists
            FROM b ORDER BY b.start`,
      )
      .then((r) => r.rows),
    db
      .select({
        id: schema.priceLists.id,
        status: schema.priceLists.status,
        supplier: schema.suppliers.name,
        receivedAt: schema.priceLists.receivedAt,
        progressDone: schema.priceLists.progressDone,
        progressTotal: schema.priceLists.progressTotal,
        error: schema.priceLists.error,
      })
      .from(schema.priceLists)
      .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.priceLists.supplierId))
      .where(sql`${schema.priceLists.status} <> 'saved'`)
      .orderBy(desc(schema.priceLists.createdAt))
      .limit(10),
    db
      .select({
        id: schema.priceLists.id,
        supplier: schema.suppliers.name,
        receivedAt: schema.priceLists.receivedAt,
        offers: sql<number>`(SELECT count(*)::int FROM offers o WHERE o.price_list_id = ${schema.priceLists.id})`,
      })
      .from(schema.priceLists)
      .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.priceLists.supplierId))
      .where(eq(schema.priceLists.status, "saved"))
      .orderBy(desc(schema.priceLists.receivedAt))
      .limit(10),
  ]);

  return { staleDays, counts, moves, quiet, stats, bySupplier, weekly, waiting, recent };
});
