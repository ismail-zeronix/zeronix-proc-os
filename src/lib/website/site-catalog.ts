import "server-only";
import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import {
  CONTRACT_VERSION,
  SITE_ICONS,
  type SiteBrandPage,
  type SiteCategoriesResponse,
  type SiteCategoryPage,
  type SiteCompareResponse,
  type SiteIcon,
  type SiteImageRef,
  type SiteIndustriesResponse,
  type SiteIndustryPage,
  type SiteProductPage,
  type SiteProductsResponse,
  type SiteProductSummary,
  type SiteSpecGroup,
} from "./contract";
import type { SiteImage, SiteSpecTemplate } from "./types";

/**
 * Catalog data for the public site (/api/site/*). Only published rows of published parents leave here, and only the
 * fields in the contract: no part costs, no internal notes, no portal product links.
 */

const P = siteSchema.siteProducts;
const C = siteSchema.siteCategories;
const B = siteSchema.siteBrands;
const I = siteSchema.siteIndustries;

const icon = (v: string): SiteIcon | "" => ((SITE_ICONS as readonly string[]).includes(v) ? (v as SiteIcon) : "");
export const imageRef = (img: SiteImage | null | undefined, fallbackAlt = ""): SiteImageRef | null => (img?.fileId ? { src: `/media/${img.fileId}`, alt: img.alt || fallbackAlt } : null);

/** Template fields in order, then any extra spec keys the template does not name. */
function specGroups(specs: Record<string, string>, template: SiteSpecTemplate | null): SiteSpecGroup[] {
  const used = new Set<string>();
  const groups: SiteSpecGroup[] = (template?.groups ?? [])
    .map((g) => ({
      label: g.label,
      rows: g.fields.filter((f) => specs[f.key]).map((f) => (used.add(f.key), { key: f.key, label: f.label, value: specs[f.key] })),
    }))
    .filter((g) => g.rows.length);
  const extra = Object.entries(specs).filter(([k]) => !used.has(k));
  if (extra.length) groups.push({ label: "More", rows: extra.map(([k, v]) => ({ key: k, label: k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), value: v })) });
  return groups;
}

const summaryCols = {
  id: P.id,
  slug: P.slug,
  name: P.name,
  images: P.images,
  specs: P.specs,
  highlights: P.highlights,
  priceMode: P.priceMode,
  listPrice: P.listPrice,
  currency: P.currency,
  brand: B.name,
  brandSlug: B.slug,
  category: C.name,
  categorySlug: C.slug,
  template: C.specTemplate,
};

type SummaryRow = { [K in keyof typeof summaryCols]: (typeof summaryCols)[K]["_"]["data"] | null };

function toSummary(r: SummaryRow): SiteProductSummary {
  const specs = (r.specs ?? {}) as Record<string, string>;
  const keys = (r.template as SiteSpecTemplate | null)?.groups.flatMap((g) => g.fields.map((f) => f.key)) ?? [];
  const keySpecs = [...keys, ...Object.keys(specs)].filter((k, i, a) => a.indexOf(k) === i && specs[k]).slice(0, 3).map((k) => specs[k]);
  const images = (r.images ?? []) as SiteImage[];
  return {
    slug: r.slug!,
    name: r.name!,
    brand: r.brand ?? "",
    brandSlug: r.brandSlug ?? "",
    category: r.category ?? "",
    categorySlug: r.categorySlug ?? "",
    image: imageRef(images[0], r.name ?? ""),
    keySpecs: keySpecs.map((s) => (s.length > 28 ? `${s.slice(0, 26)}…` : s)),
    highlights: (r.highlights ?? []) as string[],
    priceMode: r.priceMode ?? "on_request",
    price: r.priceMode === "public" ? (r.listPrice as string | null) : null,
    currency: r.currency ?? "AED",
  };
}

/** Published products in published categories (a product with no brand is still shown). */
async function products(where?: SQL, limit = 200, newest = false): Promise<(SummaryRow & { id: number })[]> {
  return (await siteDb
    .select(summaryCols)
    .from(P)
    .innerJoin(C, eq(C.id, P.categoryId))
    .leftJoin(B, eq(B.id, P.brandId))
    .where(and(eq(P.status, "published"), eq(C.status, "published"), where))
    .orderBy(...(newest ? [desc(P.updatedAt), asc(P.name)] : [asc(P.name)]))
    .limit(limit)) as (SummaryRow & { id: number })[];
}

/** Published product cards by id or by slug / part number (for guides and shortcodes), with their ids. */
export async function productCards(by: { ids?: number[]; refs?: string[] }): Promise<(SiteProductSummary & { id: number; mpn: string })[]> {
  const where = by.ids?.length
    ? inArray(P.id, by.ids)
    : by.refs?.length
      ? sql`(${P.slug} in (${sql.join(by.refs.map((r) => sql`${r}`), sql`, `)}) or lower(${P.mpn}) in (${sql.join(by.refs.map((r) => sql`${r.toLowerCase()}`), sql`, `)}))`
      : undefined;
  if (!where) return [];
  const rows = await siteDb
    .select({ ...summaryCols, mpn: P.mpn })
    .from(P)
    .innerJoin(C, eq(C.id, P.categoryId))
    .leftJoin(B, eq(B.id, P.brandId))
    .where(and(eq(P.status, "published"), eq(C.status, "published"), where));
  return rows.map((r) => ({ ...toSummary(r as SummaryRow), id: r.id as number, mpn: r.mpn }));
}

/** Words to match: each must appear in the product's name, part number, brand or category ("thinkpad i7 16gb"). */
export const searchWords = (q: string) =>
  q
    .toLowerCase()
    .replace(/[%_\\]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 6);

/** Published products matching every word of the query, by name, part number, brand, category or series. */
export async function searchProducts(q: string, limit = 30): Promise<SiteProductSummary[]> {
  const words = searchWords(q);
  if (!words.length) return [];
  const hay = sql`lower(concat_ws(' ', ${P.name}, ${P.mpn}, ${P.series}, ${B.name}, ${C.name}))`;
  const rows = await products(and(...words.map((w) => sql`${hay} like ${"%" + w + "%"}`)), limit);
  return rows.map(toSummary);
}

/** Product cards for a shelf (home page): newest first, optionally one category. */
export async function publicProducts(q: { category?: string; limit?: number }): Promise<SiteProductsResponse> {
  const limit = Math.min(Math.max(q.limit ?? 12, 1), 48);
  const rows = await products(q.category ? eq(C.slug, q.category) : undefined, limit, true);
  return { contract: CONTRACT_VERSION, products: rows.map(toSummary) };
}

export async function publicIndustries(): Promise<SiteIndustriesResponse> {
  const rows = await siteDb.select().from(I).where(eq(I.status, "published")).orderBy(asc(I.sort), asc(I.name));
  return { contract: CONTRACT_VERSION, industries: rows.map((r) => ({ slug: r.slug, name: r.name, icon: icon(r.icon), summary: r.summary, image: imageRef(r.image, r.name) })) };
}

export async function publicIndustry(slug: string): Promise<SiteIndustryPage | null> {
  const [r] = await siteDb.select().from(I).where(and(eq(I.slug, slug), eq(I.status, "published")));
  if (!r) return null;
  const cats = await siteDb.select({ slug: C.slug, name: C.name }).from(C).where(eq(C.status, "published"));
  const links = await siteDb.select().from(siteSchema.siteProductLinks).where(eq(siteSchema.siteProductLinks.industryId, r.id)).orderBy(asc(siteSchema.siteProductLinks.rank));
  const rows = links.length ? await products(inArray(P.id, links.map((l) => l.productId))) : [];
  const byId = new Map(rows.map((p) => [p.id, p]));
  return {
    contract: CONTRACT_VERSION,
    slug: r.slug,
    name: r.name,
    icon: icon(r.icon),
    summary: r.summary,
    image: imageRef(r.image, r.name),
    heroTitle: r.heroTitle,
    introHtml: r.introHtml,
    painPoints: r.painPoints,
    roles: r.roles.map((x) => ({ role: x.role, needs: x.needs, categories: cats.filter((c) => x.categories.includes(c.slug)) })),
    faq: r.faq,
    products: links.flatMap((l) => {
      const p = byId.get(l.productId);
      return p ? [{ ...toSummary(p), label: l.label, role: l.role }] : [];
    }),
    seo: { title: r.seo.title, description: r.seo.description },
  };
}

export async function publicCategories(): Promise<SiteCategoriesResponse> {
  const rows = await siteDb
    .select({ slug: C.slug, name: C.name, icon: C.icon, summary: C.description, image: C.image, count: sql<number>`(select count(*)::int from site_products p where p.category_id = ${C.id} and p.status = 'published')` })
    .from(C)
    .where(eq(C.status, "published"))
    .orderBy(asc(C.sort), asc(C.name));
  return { contract: CONTRACT_VERSION, categories: rows.map((r) => ({ ...r, icon: icon(r.icon), image: imageRef(r.image, r.name) })) };
}

export async function publicCategory(slug: string): Promise<SiteCategoryPage | null> {
  const [c] = await siteDb.select().from(C).where(and(eq(C.slug, slug), eq(C.status, "published")));
  if (!c) return null;
  const rows = await products(eq(P.categoryId, c.id), 500);
  const links = rows.length
    ? await siteDb
        .select({ productId: siteSchema.siteProductLinks.productId, slug: I.slug, name: I.name })
        .from(siteSchema.siteProductLinks)
        .innerJoin(I, and(eq(I.id, siteSchema.siteProductLinks.industryId), eq(I.status, "published")))
        .where(inArray(siteSchema.siteProductLinks.productId, rows.map((r) => r.id)))
    : [];
  const count = <T extends string>(list: { key: T; name: string }[]) => {
    const m = new Map<T, { slug: T; name: string; count: number }>();
    for (const x of list) m.set(x.key, { slug: x.key, name: x.name, count: (m.get(x.key)?.count ?? 0) + 1 });
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };
  return {
    contract: CONTRACT_VERSION,
    slug: c.slug,
    name: c.name,
    icon: icon(c.icon),
    summary: c.description,
    image: imageRef(c.image, c.name),
    brands: count(rows.filter((r) => r.brandSlug).map((r) => ({ key: r.brandSlug!, name: r.brand! }))),
    industries: count(links.map((l) => ({ key: l.slug, name: l.name }))),
    products: rows.map((r) => ({ ...toSummary(r), industries: links.filter((l) => l.productId === r.id).map((l) => l.slug) })),
    seo: { title: c.seo.title, description: c.seo.description },
  };
}

export async function publicProduct(slug: string): Promise<SiteProductPage | null> {
  const [row] = await siteDb
    .select({ ...summaryCols, mpn: P.mpn, series: P.series, summaryHtml: P.summaryHtml, uaeAvailable: P.uaeAvailable, uae: P.uaeNotes, sourceUrl: P.sourceUrl, checkedAt: P.specsCheckedAt, pros: P.pros, cons: P.cons, faq: P.faq, seo: P.seo, categoryId: P.categoryId })
    .from(P)
    .innerJoin(C, eq(C.id, P.categoryId))
    .leftJoin(B, eq(B.id, P.brandId))
    .where(and(eq(P.slug, slug), eq(P.status, "published"), eq(C.status, "published")));
  if (!row) return null;
  const bestFor = await siteDb
    .select({ industrySlug: I.slug, industry: I.name, role: siteSchema.siteProductLinks.role, label: siteSchema.siteProductLinks.label })
    .from(siteSchema.siteProductLinks)
    .innerJoin(I, and(eq(I.id, siteSchema.siteProductLinks.industryId), eq(I.status, "published")))
    .where(eq(siteSchema.siteProductLinks.productId, row.id))
    .orderBy(asc(siteSchema.siteProductLinks.rank));
  const related = (await products(and(eq(P.categoryId, row.categoryId!), ne(P.id, row.id)), 4)).map(toSummary);
  return {
    contract: CONTRACT_VERSION,
    ...toSummary(row),
    mpn: row.mpn,
    series: row.series,
    summaryHtml: row.summaryHtml,
    images: ((row.images ?? []) as SiteImage[]).flatMap((i) => imageRef(i, row.name ?? "") ?? []),
    specGroups: specGroups((row.specs ?? {}) as Record<string, string>, row.template as SiteSpecTemplate | null),
    uaeAvailable: row.uaeAvailable,
    uae: row.uae,
    sourceUrl: row.sourceUrl,
    specsCheckedAt: row.checkedAt?.toISOString() ?? null,
    pros: row.pros,
    cons: row.cons,
    faq: row.faq,
    bestFor,
    related,
    seo: { title: row.seo.title, description: row.seo.description },
  };
}

export async function publicBrand(slug: string): Promise<SiteBrandPage | null> {
  const [b] = await siteDb.select().from(B).where(and(eq(B.slug, slug), eq(B.status, "published")));
  if (!b) return null;
  return { contract: CONTRACT_VERSION, slug: b.slug, name: b.name, website: b.website, uaeWarrantyNote: b.uaeWarrantyNote, products: (await products(eq(P.brandId, b.id))).map(toSummary) };
}

export async function publicCompare(slugs: string[]): Promise<SiteCompareResponse | null> {
  const wanted = [...new Set(slugs)].slice(0, 4);
  if (wanted.length < 2) return null;
  const rows = await products(inArray(P.slug, wanted));
  const ordered = wanted.flatMap((s) => rows.find((r) => r.slug === s) ?? []);
  if (ordered.length < 2) return null;
  const tables = ordered.map((r) => specGroups((r.specs ?? {}) as Record<string, string>, r.template as SiteSpecTemplate | null));
  // rows: the union of every product's groups and rows, in first-seen order
  const groups: SiteCompareResponse["groups"] = [];
  for (const t of tables)
    for (const g of t) {
      let group = groups.find((x) => x.label === g.label);
      if (!group) groups.push((group = { label: g.label, rows: [] }));
      for (const row of g.rows) if (!group.rows.some((x) => x.label === row.label)) group.rows.push({ label: row.label, values: [] });
    }
  for (const g of groups) for (const row of g.rows) row.values = tables.map((t) => t.find((x) => x.label === g.label)?.rows.find((x) => x.label === row.label)?.value ?? "—");
  return { contract: CONTRACT_VERSION, products: ordered.map(toSummary), groups };
}

/** A picture uploaded through the Website app (site_media); nothing from the Files app is ever public. */
export async function publicMediaFile(id: number) {
  const [f] = await siteDb.select().from(siteSchema.siteMedia).where(eq(siteSchema.siteMedia.id, id));
  return f ?? null;
}
