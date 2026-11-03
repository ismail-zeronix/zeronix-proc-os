import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { CONTRACT_VERSION, type SiteLlmsResponse } from "./contract";
import { postPath } from "./post-parse";
import { publicCategories, publicIndustries, productCards } from "./site-catalog";

/**
 * The whole published site in short form, for the site's /llms.txt and /llms-full.txt: what AI assistants and agents
 * read to learn what Zeronix Tech sells and where each page is. Only published rows, only contract fields.
 */
export async function publicLlms(): Promise<SiteLlmsResponse> {
  const P = siteSchema.siteProducts;
  const S = siteSchema.sitePosts;
  const B = siteSchema.siteBrands;
  const [{ industries }, { categories }, brands, productRows, posts] = await Promise.all([
    publicIndustries(),
    publicCategories(),
    siteDb.select({ slug: B.slug, name: B.name }).from(B).where(eq(B.status, "published")).orderBy(asc(B.name)),
    siteDb.select({ id: P.id, updatedAt: P.updatedAt }).from(P).where(eq(P.status, "published")).orderBy(asc(P.name)).limit(5000),
    siteDb
      .select({ slug: S.slug, type: S.type, title: S.title, excerpt: S.excerpt, meta: S.metaDescription, publishedAt: S.publishedAt, updatedAt: S.updatedAt })
      .from(S)
      .where(and(eq(S.status, "published")))
      .orderBy(desc(S.publishedAt))
      .limit(5000),
  ]);
  const changed = new Map(productRows.map((r) => [r.id, r.updatedAt]));
  // productCards drops products whose category is not published, like every other public list
  const cards = productRows.length ? await productCards({ ids: productRows.map((r) => r.id) }) : [];
  return {
    contract: CONTRACT_VERSION,
    industries: industries.map((i) => ({ slug: i.slug, name: i.name, summary: i.summary ?? "" })),
    categories: categories.filter((c) => c.count > 0).map((c) => ({ slug: c.slug, name: c.name, summary: c.summary ?? "", count: c.count })),
    brands,
    products: cards
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map(({ id, ...p }) => ({ ...p, path: `/products/${p.categorySlug}/${p.slug}`, updatedAt: (changed.get(id) ?? new Date()).toISOString() })),
    posts: posts.map((p) => ({
      path: postPath(p.type, p.slug),
      type: p.type,
      title: p.title,
      excerpt: p.excerpt || p.meta || "",
      updatedAt: (p.updatedAt ?? p.publishedAt ?? new Date()).toISOString(),
    })),
  };
}
