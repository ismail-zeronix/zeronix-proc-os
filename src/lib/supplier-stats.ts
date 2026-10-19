import { sql } from "drizzle-orm";
import { db } from "@/db";
import { aedSql, getFx } from "@/lib/fx";

export interface SupplierOffer {
  productId: number;
  label: string;
  category: string;
  price: number | null;
  currency: string;
  /** Price in AED, null when the currency has no rate. */
  priceAed: number | null;
  priceBasis: string;
  prevPrice: number | null;
  /** Cheapest fresh price for the product among all suppliers, in AED. */
  best: number | null;
  /** Fresh suppliers quoting the product. */
  suppliers: number;
  receivedAt: string;
  stale: boolean;
  priceListId: number;
  stockNote: string;
}

/** The supplier's latest quote per product, with where it stands against the market. */
export async function supplierOffers(supplierId: number, staleDays: number): Promise<SupplierOffer[]> {
  const fx = await getFx();
  const res = await db.execute<{
    product_id: number; brand: string; model_name: string; part_number: string; category: string;
    price: string | null; currency: string; price_aed: string | null; price_basis: string; prev_price: string | null; prev_currency: string | null;
    best: string | null; n: number | null; received_at: Date; price_list_id: number; stock_note: string;
  }>(sql`
    WITH ranked AS (
      SELECT o.*, row_number() OVER w AS rn, lead(o.price) OVER w AS prev_price, lead(o.currency) OVER w AS prev_currency
      FROM offers o
      WINDOW w AS (PARTITION BY o.product_id, o.supplier_id ORDER BY o.received_at DESC, o.id DESC)
    ),
    latest AS (SELECT * FROM ranked WHERE rn = 1),
    market AS (
      SELECT product_id, min(${aedSql("price", "currency", fx)}) AS best, count(DISTINCT supplier_id) AS n
      FROM latest
      WHERE price IS NOT NULL AND received_at > now() - make_interval(days => ${staleDays})
      GROUP BY product_id
    )
    SELECT l.product_id, p.brand, p.model_name, p.part_number, p.category, l.price, l.currency,
      ${aedSql("l.price", "l.currency", fx)} AS price_aed, l.price_basis, l.prev_price, l.prev_currency, m.best, m.n::int AS n, l.received_at, l.price_list_id, l.stock_note
    FROM latest l
    JOIN products p ON p.id = l.product_id
    LEFT JOIN market m ON m.product_id = l.product_id
    WHERE l.supplier_id = ${supplierId}
    ORDER BY l.received_at DESC, p.brand, p.model_name`);

  const staleBefore = Date.now() - staleDays * 86400_000;
  return res.rows.map((r) => ({
    productId: r.product_id,
    label: [r.brand, r.model_name, r.part_number].filter(Boolean).join(" "),
    category: r.category,
    price: r.price == null ? null : Number(r.price),
    currency: r.currency,
    priceAed: r.price_aed == null ? null : Number(r.price_aed),
    priceBasis: r.price_basis,
    prevPrice: r.prev_price != null && r.prev_currency === r.currency ? Number(r.prev_price) : null,
    best: r.best == null ? null : Number(r.best),
    suppliers: r.n ?? 0,
    receivedAt: new Date(r.received_at).toISOString(),
    stale: new Date(r.received_at).getTime() < staleBefore,
    priceListId: r.price_list_id,
    stockNote: r.stock_note,
  }));
}
