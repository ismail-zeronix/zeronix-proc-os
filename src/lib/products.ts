import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OfferDraft } from "@/lib/llm/schema";
import { compatible, matchKey, norm, specSummary } from "@/lib/parse/match";

type Product = typeof schema.products.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export function productLabel(p: { brand: string; modelName: string; partNumber: string }) {
  return [p.brand, p.modelName, p.partNumber].filter(Boolean).join(" ");
}

/** Exact match on canonical key or a learned alias. */
export async function findProductByKey(key: string, conn: Db = db): Promise<Product | null> {
  const [direct] = await conn.select().from(schema.products).where(eq(schema.products.matchKey, key)).limit(1);
  if (direct) return direct;
  const [alias] = await conn
    .select({ p: schema.products })
    .from(schema.productAliases)
    .innerJoin(schema.products, eq(schema.products.id, schema.productAliases.productId))
    .where(eq(schema.productAliases.matchKey, key))
    .limit(1);
  return alias?.p ?? null;
}

/**
 * Automatic match: exact key, else the single existing product with the same brand + part number
 * whose CPU model / RAM do not conflict (e.g. one supplier wrote "U7", another "Ultra 7 256V").
 */
export async function resolveProduct(d: OfferDraft, conn: Db = db): Promise<Product | null> {
  const exact = await findProductByKey(matchKey(d), conn);
  if (exact) return exact;
  const pn = norm(d.partNumber);
  if (pn.length < 4) return null;
  const same = await conn
    .select()
    .from(schema.products)
    .where(and(sql`lower(${schema.products.brand}) = lower(${d.brand})`, eq(schema.products.partNorm, pn)));
  const ok = same.filter((p) => compatible(p, d));
  return ok.length === 1 ? ok[0] : null;
}

/** Closest existing product by part number / model similarity (pg_trgm), offered to the user in review. */
export async function suggestProduct(d: Pick<OfferDraft, "brand" | "partNumber" | "modelName" | "cpu" | "ramGb">) {
  const pn = d.partNumber.trim();
  const model = d.modelName.trim();
  if (!pn && !model) return null;
  const rows = await db.execute<{
    id: number; brand: string; model_name: string; part_number: string; cpu: string; ram_gb: number | null; score: number;
  }>(sql`
    SELECT id, brand, model_name, part_number, cpu, ram_gb,
      GREATEST(
        CASE WHEN ${pn} <> '' AND part_number <> '' THEN similarity(part_number, ${pn}) ELSE 0 END,
        similarity(model_name || ' ' || part_number || ' ' || cpu, ${`${model} ${pn} ${d.cpu}`.trim()}) * 0.85
      ) AS score
    FROM products
    WHERE lower(brand) = lower(${d.brand})
    ORDER BY score DESC
    LIMIT 5`);
  const best = rows.rows.find((r) => compatible({ cpu: r.cpu, ramGb: r.ram_gb }, d));
  if (!best || Number(best.score) < 0.45) return null;
  const label = productLabel({ brand: best.brand, modelName: best.model_name, partNumber: best.part_number });
  return { id: best.id, label: [label, best.cpu, best.ram_gb ? `${best.ram_gb}GB` : ""].filter(Boolean).join(" · ") };
}

/** Fills productId (automatic) or a suggestion (fuzzy) on each draft before review. */
export async function attachMatches(drafts: OfferDraft[]): Promise<OfferDraft[]> {
  const out: OfferDraft[] = [];
  for (const d of drafts) {
    const p = await resolveProduct(d);
    if (p) {
      out.push({ ...d, productId: p.id, productLabel: productLabel(p), suggestedProductId: null, suggestedLabel: "" });
      continue;
    }
    const s = await suggestProduct(d);
    out.push(s ? { ...d, suggestedProductId: s.id, suggestedLabel: s.label } : d);
  }
  return out;
}

/** Finds or creates the product for a reviewed draft; learns an alias when the user picked one by hand. */
export async function upsertProductFor(d: OfferDraft, tx: Tx): Promise<number> {
  const key = matchKey(d);
  if (d.productId) {
    const [exists] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, d.productId));
    if (exists) {
      await tx.insert(schema.productAliases).values({ productId: d.productId, matchKey: key }).onConflictDoNothing();
      return d.productId;
    }
  }
  const found = await resolveProduct(d, tx);
  if (found) return found.id;
  const [created] = await tx
    .insert(schema.products)
    .values({
      category: d.category,
      brand: d.brand || "Unknown",
      modelName: d.modelName,
      partNumber: d.partNumber,
      partNorm: norm(d.partNumber),
      cpu: d.cpu,
      ramGb: d.ramGb,
      storage: d.storage,
      specSummary: specSummary(d),
      matchKey: key,
    })
    .onConflictDoUpdate({ target: schema.products.matchKey, set: { matchKey: key } })
    .returning({ id: schema.products.id });
  return created.id;
}

export function searchNormFor(d: OfferDraft, supplierName: string): string {
  return norm(
    [d.category, d.brand, d.modelName, d.partNumber, d.cpu, d.ramGb ? `${d.ramGb}gb` : "", d.storage,
      d.display, d.gpu, d.os, d.extras, supplierName].join(" "),
  );
}
