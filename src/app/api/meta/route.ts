import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { getSession } from "@/lib/auth/session";

/** Filter options for the compare page. */
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [suppliers, brands, categories, rams, counts] = await Promise.all([
    db.execute<{ id: number; name: string; type: string }>(sql`SELECT id, name, type FROM suppliers WHERE is_active ORDER BY name`),
    db.execute<{ brand: string }>(sql`SELECT DISTINCT brand FROM offers WHERE brand <> '' ORDER BY brand`),
    db.execute<{ category: string }>(sql`SELECT DISTINCT category FROM offers ORDER BY category`),
    db.execute<{ ram_gb: number }>(sql`SELECT DISTINCT ram_gb FROM offers WHERE ram_gb IS NOT NULL ORDER BY ram_gb`),
    db.execute<{ offers: number; products: number; suppliers: number; last: Date | null }>(
      sql`SELECT count(*)::int AS offers, count(DISTINCT product_id)::int AS products,
            count(DISTINCT supplier_id)::int AS suppliers, max(received_at) AS last FROM offers`,
    ),
  ]);
  return NextResponse.json({
    suppliers: suppliers.rows,
    types: [...new Set(suppliers.rows.map((r) => r.type))],
    brands: brands.rows.map((r) => r.brand),
    categories: categories.rows.map((r) => r.category),
    rams: rams.rows.map((r) => r.ram_gb),
    stats: counts.rows[0],
  });
}
