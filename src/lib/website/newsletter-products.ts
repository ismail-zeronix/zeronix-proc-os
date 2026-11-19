import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { siteDb, siteDbConfigured, siteSchema } from "@/db/site";
import { productCards, searchWords } from "./site-catalog";
import type { NewsProduct } from "@/lib/newsletter/types";

/**
 * Website products for the newsletter's product cards. Only published products of published categories come back, and
 * only what is public on the site: a price shows only when the product has a public price, never a supplier cost.
 */

const site = () => (process.env.SITE_PUBLIC_URL || "https://zeronixtech.com").replace(/\/+$/, "");

export interface PickProduct {
  id: number;
  name: string;
  brand: string;
  category: string;
}

/** Published products matching the words typed (name, part number, brand or category); newest edits first when empty. */
export async function pickProducts(q: string, limit = 12): Promise<PickProduct[]> {
  if (!siteDbConfigured()) return [];
  const P = siteSchema.siteProducts;
  const C = siteSchema.siteCategories;
  const B = siteSchema.siteBrands;
  const hay = sql`lower(concat_ws(' ', ${P.name}, ${P.mpn}, ${P.series}, ${B.name}, ${C.name}))`;
  const words = searchWords(q);
  try {
    const rows = await siteDb
      .select({ id: P.id, name: P.name, brand: B.name, category: C.name })
      .from(P)
      .innerJoin(C, eq(C.id, P.categoryId))
      .leftJoin(B, eq(B.id, P.brandId))
      .where(and(eq(P.status, "published"), eq(C.status, "published"), ...words.map((w) => sql`${hay} like ${"%" + w + "%"}`)))
      .orderBy(asc(P.name))
      .limit(limit);
    return rows.map((r) => ({ id: r.id, name: r.name, brand: r.brand ?? "", category: r.category ?? "" }));
  } catch {
    return [];
  }
}

/** The picked products as newsletter cards, in the order they were picked; a product that is no longer published drops out. */
export async function newsProducts(ids: number[]): Promise<(NewsProduct & { id: number })[]> {
  if (!ids.length || !siteDbConfigured()) return [];
  let cards: Awaited<ReturnType<typeof productCards>> = [];
  try {
    cards = await productCards({ ids });
  } catch {
    return [];
  }
  const base = site();
  return ids
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({
      id: c.id,
      name: c.name,
      brand: c.brand,
      url: `${base}/products/${c.categorySlug}/${c.slug}`,
      image: c.image ? `${base}${c.image.src}` : null,
      price: c.price ? `${c.currency} ${Number(c.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : null,
    }));
}
