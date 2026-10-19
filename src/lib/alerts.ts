import { sql } from "drizzle-orm";
import { db } from "@/db";
import { aedSql, getFx } from "@/lib/fx";

export interface PriceMove {
  productId: number;
  label: string;
  category: string;
  supplierId: number;
  supplierName: string;
  currency: string;
  price: number;
  prevPrice: number;
  /** Negative = cheaper. */
  changePct: number;
  receivedAt: string;
  priceListId: number;
  /** Now the cheapest fresh quote for the product, with at least one other supplier to compare to. */
  isBest: boolean;
  suppliers: number;
}

export interface QuietSupplier {
  id: number;
  name: string;
  lastList: string | null;
  daysSince: number | null;
}

/**
 * Price changes between a supplier's two most recent quotes of the same product, newest first.
 * `withinDays` limits it to quotes that arrived recently; `staleDays` decides which quotes still
 * count when working out whether a new price is the best on offer.
 */
export async function priceMoves(opts: { withinDays: number; staleDays: number; limit?: number }): Promise<PriceMove[]> {
  const fx = await getFx();
  const res = await db.execute<{
    product_id: number; brand: string; model_name: string; part_number: string; category: string;
    supplier_id: number; supplier_name: string; currency: string; price: string; prev_price: string;
    received_at: Date; price_list_id: number; best: string | null; price_aed: string | null; suppliers: number;
  }>(sql`
    WITH ranked AS (
      SELECT o.*,
        row_number() OVER w AS rn,
        lead(o.price) OVER w AS prev_price,
        lead(o.currency) OVER w AS prev_currency
      FROM offers o
      WINDOW w AS (PARTITION BY o.product_id, o.supplier_id ORDER BY o.received_at DESC, o.id DESC)
    ),
    latest AS (
      SELECT *,
        ${aedSql("price", "currency", fx)} AS price_aed,
        min(${aedSql("price", "currency", fx)}) FILTER (WHERE received_at > now() - make_interval(days => ${opts.staleDays}))
          OVER (PARTITION BY product_id) AS best,
        count(*) FILTER (WHERE received_at > now() - make_interval(days => ${opts.staleDays}))
          OVER (PARTITION BY product_id) AS suppliers
      FROM ranked WHERE rn = 1
    )
    SELECT l.product_id, p.brand, p.model_name, p.part_number, p.category,
      l.supplier_id, s.name AS supplier_name, l.currency, l.price, l.prev_price,
      l.received_at, l.price_list_id, l.best, l.price_aed, l.suppliers::int AS suppliers
    FROM latest l
    JOIN products p ON p.id = l.product_id
    JOIN suppliers s ON s.id = l.supplier_id
    WHERE l.price IS NOT NULL AND l.prev_price IS NOT NULL
      AND l.prev_currency = l.currency AND l.price <> l.prev_price
      AND l.received_at > now() - make_interval(days => ${opts.withinDays})
    ORDER BY l.received_at DESC, l.id DESC
    LIMIT ${opts.limit ?? 200}`);

  return res.rows.map((r) => {
    const price = Number(r.price);
    const prev = Number(r.prev_price);
    return {
      productId: r.product_id,
      label: [r.brand, r.model_name, r.part_number].filter(Boolean).join(" "),
      category: r.category,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      currency: r.currency,
      price,
      prevPrice: prev,
      changePct: Math.round(((price - prev) / prev) * 1000) / 10,
      receivedAt: new Date(r.received_at).toISOString(),
      priceListId: r.price_list_id,
      isBest: r.suppliers > 1 && r.best != null && r.price_aed != null && Number(r.price_aed) <= Number(r.best) + 0.005,
      suppliers: r.suppliers,
    };
  });
}

/** Active suppliers whose latest price list is older than `staleDays` (or that never sent one). */
export async function quietSuppliers(staleDays: number): Promise<QuietSupplier[]> {
  const res = await db.execute<{ id: number; name: string; last: Date | null }>(sql`
    SELECT s.id, s.name, max(pl.received_at) AS last
    FROM suppliers s
    LEFT JOIN price_lists pl ON pl.supplier_id = s.id AND pl.status = 'saved'
    WHERE s.is_active
    GROUP BY s.id, s.name
    HAVING max(pl.received_at) IS NULL OR max(pl.received_at) < now() - make_interval(days => ${staleDays})
    ORDER BY max(pl.received_at) NULLS FIRST, s.name`);
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    lastList: r.last ? new Date(r.last).toISOString() : null,
    daysSince: r.last ? Math.floor((Date.now() - new Date(r.last).getTime()) / 86400_000) : null,
  }));
}

/** Lists waiting on a person (review) or broken (failed), plus those still being read. */
export async function listCounts() {
  const res = await db.execute<{ status: string; n: number }>(
    sql`SELECT status, count(*)::int AS n FROM price_lists GROUP BY status`,
  );
  const by = Object.fromEntries(res.rows.map((r) => [r.status, r.n])) as Record<string, number>;
  return {
    review: by.review ?? 0,
    failed: by.failed ?? 0,
    reading: (by.queued ?? 0) + (by.parsing ?? 0),
  };
}
