import "server-only";
import { and, desc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import {
  CONTRACT_VERSION,
  type SiteAuthor,
  type SiteAuthorPage,
  type SitePostBlock,
  type SitePostPage,
  type SitePostsResponse,
  type SitePostSummary,
  type SiteSitemapResponse,
} from "./contract";
import { slugify } from "./markdown";
import { MARKER, postPath, readingMinutes, tocOf } from "./post-parse";
import { imageRef, productCards, publicCompare } from "./site-catalog";

/** Guides and blog for the public site: published posts only, the byline from the author's site_authors row. */

const S = siteSchema.sitePosts;
const U = siteSchema.siteAuthors;
const I = siteSchema.siteIndustries;

const GUIDE_TYPES = ["guide", "comparison", "industry_page"] as const;

const cols = {
  id: S.id,
  slug: S.slug,
  type: S.type,
  title: S.title,
  excerpt: S.excerpt,
  metaDescription: S.metaDescription,
  cover: S.cover,
  category: S.category,
  publishedAt: S.publishedAt,
  body: S.body,
  industrySlug: I.slug,
  industryName: I.name,
  authorSlug: U.slug,
  authorName: U.name,
  authorTitle: U.jobTitle,
};

type Row = { [K in keyof typeof cols]: (typeof cols)[K]["_"]["data"] | null };

const author = (r: Row): SiteAuthor | null => (r.authorName && r.authorSlug ? { slug: r.authorSlug, name: r.authorName, jobTitle: r.authorTitle ?? "" } : null);

function toSummary(r: Row): SitePostSummary {
  return {
    slug: r.slug!,
    type: r.type!,
    path: postPath(r.type!, r.slug!),
    title: r.title!,
    excerpt: r.excerpt || r.metaDescription || "",
    cover: imageRef(r.cover, r.title ?? ""),
    category: r.category ?? "",
    industry: r.industrySlug ? { slug: r.industrySlug, name: r.industryName ?? "" } : null,
    author: author(r),
    publishedAt: (r.publishedAt ?? new Date()).toISOString(),
    readingMinutes: readingMinutes(r.body ?? ""),
  };
}

async function rows(where: SQL | undefined, limit = 24, offset = 0): Promise<Row[]> {
  return siteDb
    .select(cols)
    .from(S)
    .leftJoin(U, eq(U.portalUserId, S.authorUserId))
    .leftJoin(I, eq(I.id, S.industryId))
    .where(and(eq(S.status, "published"), where))
    .orderBy(desc(S.publishedAt))
    .limit(limit)
    .offset(offset);
}

/** List: `kind` guides (guides, comparisons, industry pages) or articles; filters by industry slug, category or author slug. */
export async function publicPosts(q: { kind?: string; industry?: string; category?: string; author?: string; page?: number }): Promise<SitePostsResponse> {
  const filters: (SQL | undefined)[] = [
    q.kind === "guides" ? inArray(S.type, [...GUIDE_TYPES]) : q.kind === "articles" ? eq(S.type, "article") : undefined,
    q.industry ? eq(I.slug, q.industry) : undefined,
  ];
  let list = await rows(and(...filters), 500);
  // category and author pages use the slug of the name, so compare slugs
  if (q.category) list = list.filter((r) => slugify(r.category ?? "") === q.category);
  if (q.author) list = list.filter((r) => r.authorSlug === q.author);
  const page = Math.max(1, q.page ?? 1);
  return { contract: CONTRACT_VERSION, total: list.length, posts: list.slice((page - 1) * 24, page * 24).map(toSummary) };
}

export async function publicPost(slug: string): Promise<SitePostPage | null> {
  const [r] = await siteDb
    .select({ ...cols, bodyHtml: S.bodyHtml, faq: S.faq, products: S.products, keywords: S.keywords, ctaText: S.ctaText, schema: S.schema, metaTitle: S.metaTitle, updatedAt: S.updatedAt, industryId: S.industryId })
    .from(S)
    .leftJoin(U, eq(U.portalUserId, S.authorUserId))
    .leftJoin(I, eq(I.id, S.industryId))
    .where(and(eq(S.slug, slug), eq(S.status, "published")));
  if (!r) return null;

  // body: split at the shortcode markers, resolve product shortcodes against published products
  const parts = r.bodyHtml.split(MARKER);
  const refs: string[] = [];
  for (let i = 1; i < parts.length; i += 3) if (parts[i] === "product") refs.push(decodeURIComponent(parts[i + 1]));
  const shortcodeProducts = refs.length ? await productCards({ refs }) : [];
  const blocks: SitePostBlock[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i].trim()) blocks.push({ kind: "html", html: parts[i] });
    const kind = parts[i + 1];
    if (!kind) continue;
    const arg = decodeURIComponent(parts[i + 2] ?? "");
    if (kind === "compare") blocks.push({ kind: "compare" });
    else if (kind === "cta") blocks.push({ kind: "cta", text: arg });
    else {
      const p = shortcodeProducts.find((x) => x.slug === arg || x.mpn.toLowerCase() === arg.toLowerCase());
      if (p) blocks.push({ kind: "product", product: p });
    }
  }

  const pickRows = r.products.length ? await productCards({ ids: r.products.map((p) => p.productId) }) : [];
  const picks = r.products.flatMap((p) => {
    const card = pickRows.find((x) => x.id === p.productId);
    if (!card) return [];
    const { id: _id, mpn: _mpn, ...summary } = card; // eslint-disable-line @typescript-eslint/no-unused-vars -- internal fields stay in the portal
    return [{ ...summary, rank: p.rank, label: p.label, verdict: p.verdict, pros: p.pros, cons: p.cons }];
  });
  const compare = picks.length >= 2 ? ((await publicCompare(picks.slice(0, 4).map((p) => p.slug)))?.groups ?? []) : [];
  const related = (
    await rows(and(ne(S.id, r.id), r.industryId ? eq(S.industryId, r.industryId) : eq(S.type, r.type!)), 3)
  ).map(toSummary);

  return {
    contract: CONTRACT_VERSION,
    ...toSummary(r),
    updatedAt: r.updatedAt.toISOString(),
    blocks,
    toc: tocOf(r.bodyHtml),
    faq: r.faq,
    picks,
    compare,
    keywords: r.keywords,
    ctaText: r.ctaText,
    schema: r.schema,
    seo: { title: r.metaTitle || undefined, description: r.metaDescription || undefined },
    related,
  };
}

export async function publicAuthor(slug: string): Promise<SiteAuthorPage | null> {
  const list = await rows(eq(U.slug, slug), 500);
  if (!list.length) return null;
  return { contract: CONTRACT_VERSION, author: author(list[0])!, posts: list.map(toSummary) };
}

/** Every public page with its last change, for sitemap.xml. */
export async function publicSitemap(): Promise<SiteSitemapResponse> {
  const [ind, cats, prods, brands, posts] = await Promise.all([
    siteDb.select({ slug: I.slug, at: I.updatedAt }).from(I).where(eq(I.status, "published")),
    siteDb.select({ slug: siteSchema.siteCategories.slug, at: siteSchema.siteCategories.createdAt }).from(siteSchema.siteCategories).where(eq(siteSchema.siteCategories.status, "published")),
    siteDb
      .select({ slug: siteSchema.siteProducts.slug, cat: siteSchema.siteCategories.slug, at: siteSchema.siteProducts.updatedAt })
      .from(siteSchema.siteProducts)
      .innerJoin(siteSchema.siteCategories, and(eq(siteSchema.siteCategories.id, siteSchema.siteProducts.categoryId), eq(siteSchema.siteCategories.status, "published")))
      .where(eq(siteSchema.siteProducts.status, "published")),
    siteDb.select({ slug: siteSchema.siteBrands.slug }).from(siteSchema.siteBrands).where(eq(siteSchema.siteBrands.status, "published")),
    rows(undefined, 5000),
  ]);
  const now = new Date().toISOString();
  const at = (d: Date | null) => (d ?? new Date()).toISOString();
  const authors = [...new Set(posts.flatMap((p) => (p.authorSlug ? [p.authorSlug] : [])))];
  return {
    contract: CONTRACT_VERSION,
    entries: [
      ...["/", "/industries", "/products", "/guides", "/blog", "/contact"].map((path) => ({ path, updatedAt: now })),
      ...ind.map((x) => ({ path: `/industries/${x.slug}`, updatedAt: at(x.at) })),
      ...cats.map((x) => ({ path: `/products/${x.slug}`, updatedAt: at(x.at) })),
      ...prods.map((x) => ({ path: `/products/${x.cat}/${x.slug}`, updatedAt: at(x.at) })),
      ...brands.map((x) => ({ path: `/brands/${x.slug}`, updatedAt: now })),
      ...posts.map((p) => ({ path: postPath(p.type!, p.slug!), updatedAt: at(p.publishedAt) })),
      ...authors.map((a) => ({ path: `/blog/author/${a}`, updatedAt: now })),
    ],
  };
}
