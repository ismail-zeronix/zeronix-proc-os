import "server-only";
import { lookup } from "node:dns/promises";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { db, schema } from "@/db";
import { siteFiles } from "./media";
import type { ListingItem } from "./listing-import";
import { getStore } from "./store";
import { markedUp } from "./store-core";
import { faqList, parseMarkdownFile, renderMarkdown, slugify, str, strList } from "./markdown";
import type { SiteFaq, SiteImage, SiteIndustryRole, SiteSeo, SiteSpecTemplate, SiteUaeNotes } from "./types";

/** The Website app's catalog (WEBSITE-PLAN.md section 5): industries, categories, brands, products. Admin side only. */

export type Status = "draft" | "published" | "archived";

// ---------- images ----------

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Stores a picture for the public site in its own folder and site_media (what /api/site/media serves). */
export async function saveSiteImage(file: File, alt: string, userId: number): Promise<SiteImage> {
  return saveSiteImageData(Buffer.from(await file.arrayBuffer()), file.type, file.name, alt, userId);
}

/** Same as saveSiteImage for bytes already in hand (a picture downloaded from a link). The stored name is always new. */
export async function saveSiteImageData(data: Buffer, mime: string, name: string, alt: string, userId: number | null, source = ""): Promise<SiteImage> {
  const ext = IMAGE_TYPES[mime];
  if (!ext) throw new Error("Use a JPG, PNG, WebP or AVIF picture");
  if (data.length > MAX_IMAGE_BYTES) throw new Error("Pictures can be up to 8 MB");
  const storedName = await siteFiles.save(data, ext);
  const [row] = await siteDb
    .insert(siteSchema.siteMedia)
    .values({ name: name.slice(0, 200), storedName, mime, size: data.length, alt: alt.slice(0, 300), source: source.slice(0, 200), uploadedBy: userId })
    .returning({ id: siteSchema.siteMedia.id });
  return { fileId: row.id, alt: alt.slice(0, 300) };
}

/** True for addresses inside our own network (a link must never make the portal fetch those). */
function privateAddress(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  const v4 = ip.replace(/^::ffff:/, "").split(".").map(Number);
  if (v4.length !== 4) return false;
  const [a, b] = v4;
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

async function publicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("is not a web address");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("is not a web address");
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error("could not be found");
  if (addresses.some((a) => privateAddress(a.address))) throw new Error("points inside our network");
  return url;
}

/** Downloads one picture link (following up to 3 redirects, each checked) and saves it under a new name. */
async function pictureFromLink(raw: string, alt: string, userId: number): Promise<SiteImage> {
  let url = await publicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { Accept: "image/*" } });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (next) {
      url = await publicUrl(new URL(next, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES[mime]) throw new Error("is not a JPG, PNG or WebP picture");
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new Error("is bigger than 8 MB");
    const data = Buffer.from(await res.arrayBuffer());
    const name = decodeURIComponent(url.pathname.split("/").pop() || "picture");
    return saveSiteImageData(data, mime, name, alt, userId);
  }
  throw new Error("redirects too many times");
}

/** "Add pictures from links" in the product editor: each link downloaded and saved; failures are reported, not fatal. */
export async function picturesFromLinks(urls: string[], alt: string, userId: number): Promise<{ images: SiteImage[]; problems: string[] }> {
  const images: SiteImage[] = [];
  const problems: string[] = [];
  for (const u of urls) {
    try {
      images.push(await pictureFromLink(u, alt, userId));
    } catch (e) {
      problems.push(`${u.slice(0, 80)} ${(e as Error).message}`);
    }
  }
  return { images, problems };
}

// ---------- industries ----------

export interface IndustryInput {
  slug: string;
  name: string;
  icon: string;
  summary: string;
  heroTitle: string;
  intro: string;
  painPoints: string[];
  roles: SiteIndustryRole[];
  faq: SiteFaq[];
  seo: SiteSeo;
  image: SiteImage | null;
  sort: number;
  status: Status;
}

export const listIndustries = () =>
  siteDb
    .select({
      id: siteSchema.siteIndustries.id,
      slug: siteSchema.siteIndustries.slug,
      name: siteSchema.siteIndustries.name,
      icon: siteSchema.siteIndustries.icon,
      status: siteSchema.siteIndustries.status,
      sort: siteSchema.siteIndustries.sort,
      hasImage: sql<boolean>`${siteSchema.siteIndustries.image} is not null`,
      products: sql<number>`(select count(*)::int from site_product_links l where l.industry_id = ${siteSchema.siteIndustries.id})`,
      updatedAt: siteSchema.siteIndustries.updatedAt,
    })
    .from(siteSchema.siteIndustries)
    .orderBy(asc(siteSchema.siteIndustries.sort), asc(siteSchema.siteIndustries.name));

export async function getIndustry(id: number) {
  const [row] = await siteDb.select().from(siteSchema.siteIndustries).where(eq(siteSchema.siteIndustries.id, id));
  return row ?? null;
}

export async function saveIndustry(input: IndustryInput, id?: number): Promise<number> {
  const values = { ...input, slug: slugify(input.slug || input.name), introHtml: renderMarkdown(input.intro), updatedAt: new Date() };
  if (id) {
    await siteDb.update(siteSchema.siteIndustries).set(values).where(eq(siteSchema.siteIndustries.id, id));
    return id;
  }
  const [row] = await siteDb.insert(siteSchema.siteIndustries).values(values).returning({ id: siteSchema.siteIndustries.id });
  return row.id;
}

// ---------- categories ----------

export interface CategoryInput {
  slug: string;
  name: string;
  icon: string;
  description: string;
  specTemplate: SiteSpecTemplate;
  intro: string;
  faq: SiteFaq[];
  seo: SiteSeo;
  image: SiteImage | null;
  sort: number;
  status: Status;
}

export const listCategories = () =>
  siteDb
    .select({
      id: siteSchema.siteCategories.id,
      slug: siteSchema.siteCategories.slug,
      name: siteSchema.siteCategories.name,
      icon: siteSchema.siteCategories.icon,
      status: siteSchema.siteCategories.status,
      sort: siteSchema.siteCategories.sort,
      specTemplate: siteSchema.siteCategories.specTemplate,
      products: sql<number>`(select count(*)::int from site_products p where p.category_id = ${siteSchema.siteCategories.id})`,
    })
    .from(siteSchema.siteCategories)
    .orderBy(asc(siteSchema.siteCategories.sort), asc(siteSchema.siteCategories.name));

export async function getCategory(id: number) {
  const [row] = await siteDb.select().from(siteSchema.siteCategories).where(eq(siteSchema.siteCategories.id, id));
  return row ?? null;
}

export async function saveCategory(input: CategoryInput, id?: number): Promise<number> {
  const values = { ...input, slug: slugify(input.slug || input.name), introHtml: renderMarkdown(input.intro) };
  if (id) {
    await siteDb.update(siteSchema.siteCategories).set(values).where(eq(siteSchema.siteCategories.id, id));
    return id;
  }
  const [row] = await siteDb.insert(siteSchema.siteCategories).values(values).returning({ id: siteSchema.siteCategories.id });
  return row.id;
}

// ---------- brands ----------

export interface BrandInput {
  slug: string;
  name: string;
  website: string;
  uaeWarrantyNote: string;
  sort: number;
  status: Status;
}

export const listBrands = () =>
  siteDb
    .select({
      id: siteSchema.siteBrands.id,
      slug: siteSchema.siteBrands.slug,
      name: siteSchema.siteBrands.name,
      website: siteSchema.siteBrands.website,
      uaeWarrantyNote: siteSchema.siteBrands.uaeWarrantyNote,
      sort: siteSchema.siteBrands.sort,
      status: siteSchema.siteBrands.status,
      products: sql<number>`(select count(*)::int from site_products p where p.brand_id = ${siteSchema.siteBrands.id})`,
    })
    .from(siteSchema.siteBrands)
    .orderBy(asc(siteSchema.siteBrands.sort), asc(siteSchema.siteBrands.name));

export async function saveBrand(input: BrandInput, id?: number): Promise<number> {
  const values = { ...input, slug: slugify(input.slug || input.name) };
  if (id) {
    await siteDb.update(siteSchema.siteBrands).set(values).where(eq(siteSchema.siteBrands.id, id));
    return id;
  }
  const [row] = await siteDb.insert(siteSchema.siteBrands).values(values).returning({ id: siteSchema.siteBrands.id });
  return row.id;
}

// ---------- products ----------

export interface ProductLinkInput {
  industryId: number;
  role: string;
  label: string;
  rank: number;
}

export interface ProductInput {
  slug: string;
  name: string;
  series: string;
  mpn: string;
  categoryId: number | null;
  brandId: number | null;
  summary: string;
  highlights: string[];
  specs: Record<string, string>;
  images: SiteImage[];
  uaeAvailable: boolean;
  uaeNotes: SiteUaeNotes;
  sourceUrl: string;
  specsChecked: boolean;
  pros: string[];
  cons: string[];
  faq: SiteFaq[];
  seo: SiteSeo;
  portalProductId: number | null;
  status: Status;
  links: ProductLinkInput[];
  /** Optional, so a product .md upload leaves the price as it is. */
  priceMode?: "hidden" | "on_request" | "public";
  /** AED with VAT, "4149.00"; null = no price. */
  listPrice?: string | null;
}

/** What the Products list is showing: a search, a status and a category (0 = products without one). */
export interface ProductFilter {
  q?: string;
  status?: Status;
  categoryId?: number;
}

function productWhere(opts: ProductFilter) {
  return and(
    opts.status ? eq(siteSchema.siteProducts.status, opts.status) : undefined,
    opts.categoryId === 0 ? isNull(siteSchema.siteProducts.categoryId) : opts.categoryId ? eq(siteSchema.siteProducts.categoryId, opts.categoryId) : undefined,
    opts.q ? or(ilike(siteSchema.siteProducts.name, `%${opts.q}%`), ilike(siteSchema.siteProducts.mpn, `%${opts.q}%`)) : undefined,
  );
}

/** One page of the Products list and how many match in all. */
export async function listProducts(opts: ProductFilter & { page?: number; pageSize?: number } = {}) {
  const where = productWhere(opts);
  const pageSize = opts.pageSize ?? 50;
  const [{ total }] = await siteDb.select({ total: sql<number>`count(*)::int` }).from(siteSchema.siteProducts).where(where);
  const rows = await siteDb
    .select({
      id: siteSchema.siteProducts.id,
      slug: siteSchema.siteProducts.slug,
      name: siteSchema.siteProducts.name,
      mpn: siteSchema.siteProducts.mpn,
      status: siteSchema.siteProducts.status,
      category: siteSchema.siteCategories.name,
      categorySlug: siteSchema.siteCategories.slug,
      brand: siteSchema.siteBrands.name,
      images: sql<number>`jsonb_array_length(${siteSchema.siteProducts.images})`,
      priceMode: siteSchema.siteProducts.priceMode,
      listPrice: siteSchema.siteProducts.listPrice,
      pictureStatus: sql<"queued" | "done" | "failed" | null>`(select q.status from site_picture_queue q where q.product_id = ${siteSchema.siteProducts.id})`,
      pictureError: sql<string | null>`(select q.error from site_picture_queue q where q.product_id = ${siteSchema.siteProducts.id})`,
      specs: sql<number>`(select count(*)::int from jsonb_object_keys(${siteSchema.siteProducts.specs}))`,
      industries: sql<number>`(select count(*)::int from site_product_links l where l.product_id = ${siteSchema.siteProducts.id})`,
      updatedAt: siteSchema.siteProducts.updatedAt,
    })
    .from(siteSchema.siteProducts)
    .leftJoin(siteSchema.siteCategories, eq(siteSchema.siteCategories.id, siteSchema.siteProducts.categoryId))
    .leftJoin(siteSchema.siteBrands, eq(siteSchema.siteBrands.id, siteSchema.siteProducts.brandId))
    .where(where)
    .orderBy(desc(siteSchema.siteProducts.updatedAt), desc(siteSchema.siteProducts.id))
    .limit(pageSize)
    .offset(((opts.page ?? 1) - 1) * pageSize);
  return { rows, total };
}

// ---------- bulk changes from the Products list ----------

export type ProductBulkOp = { op: "publish" | "draft" | "archive" | "sell_online" | "quote_only" | "delete" } | { op: "category"; categoryId: number };

/** Every product id matching the list's filter ("select all N"), capped so one click cannot run away. */
export async function productIdsMatching(filter: ProductFilter): Promise<number[]> {
  const rows = await siteDb.select({ id: siteSchema.siteProducts.id }).from(siteSchema.siteProducts).where(productWhere(filter)).limit(5000);
  return rows.map((r) => r.id);
}

/**
 * Applies one change to many products. Publishing skips products without a category, and "sell online" skips those
 * without a price; the result says how many were changed and why the rest were not.
 */
export async function bulkProducts(ids: number[], change: ProductBulkOp): Promise<{ changed: number; skipped: string[] }> {
  if (!ids.length) return { changed: 0, skipped: [] };
  const P = siteSchema.siteProducts;
  const inIds = inArray(P.id, ids);
  const now = new Date();
  const skipped: string[] = [];
  let changed: { id: number }[] = [];
  switch (change.op) {
    case "publish": {
      changed = await siteDb.update(P).set({ status: "published", updatedAt: now }).where(and(inIds, isNotNull(P.categoryId))).returning({ id: P.id });
      break;
    }
    case "draft":
    case "archive":
      changed = await siteDb
        .update(P)
        .set({ status: change.op === "draft" ? "draft" : "archived", updatedAt: now })
        .where(inIds)
        .returning({ id: P.id });
      break;
    case "sell_online":
      changed = await siteDb
        .update(P)
        .set({ priceMode: "public", updatedAt: now })
        .where(and(inIds, isNotNull(P.listPrice), sql`${P.listPrice} > 0`))
        .returning({ id: P.id });
      break;
    case "quote_only":
      changed = await siteDb.update(P).set({ priceMode: "on_request", updatedAt: now }).where(inIds).returning({ id: P.id });
      break;
    case "category":
      changed = await siteDb.update(P).set({ categoryId: change.categoryId, updatedAt: now }).where(inIds).returning({ id: P.id });
      break;
    case "delete":
      changed = await siteDb.delete(P).where(inIds).returning({ id: P.id });
      break;
  }
  const missed = ids.length - changed.length;
  if (missed > 0) skipped.push(change.op === "publish" ? `${missed} without a category (pick one first)` : change.op === "sell_online" ? `${missed} without a price (add one first)` : `${missed} not found`);
  return { changed: changed.length, skipped };
}

export async function getProduct(id: number) {
  const [row] = await siteDb.select().from(siteSchema.siteProducts).where(eq(siteSchema.siteProducts.id, id));
  if (!row) return null;
  const links = await siteDb.select().from(siteSchema.siteProductLinks).where(eq(siteSchema.siteProductLinks.productId, id)).orderBy(asc(siteSchema.siteProductLinks.rank));
  return { ...row, links };
}

export async function saveProduct(input: ProductInput, userId: number, id?: number): Promise<number> {
  const { links, specsChecked, ...rest } = input;
  const values = {
    ...rest,
    slug: slugify(input.slug || input.name),
    summaryHtml: renderMarkdown(input.summary),
    specs: Object.fromEntries(Object.entries(input.specs).filter(([, v]) => v.trim())),
    updatedAt: new Date(),
    ...(specsChecked ? { specsCheckedAt: new Date() } : {}),
  };
  return siteDb.transaction(async (tx) => {
    let productId = id;
    if (productId) await tx.update(siteSchema.siteProducts).set(values).where(eq(siteSchema.siteProducts.id, productId));
    else [{ id: productId }] = await tx.insert(siteSchema.siteProducts).values({ ...values, createdBy: userId }).returning({ id: siteSchema.siteProducts.id });
    await tx.delete(siteSchema.siteProductLinks).where(eq(siteSchema.siteProductLinks.productId, productId!));
    // one row per industry + role (the primary key); a repeated pair keeps the first
    const seen = new Set<string>();
    const rows = links.filter((l) => !seen.has(`${l.industryId}:${l.role}`) && seen.add(`${l.industryId}:${l.role}`)).map((l, i) => ({ ...l, productId: productId!, rank: l.rank || i }));
    if (rows.length) await tx.insert(siteSchema.siteProductLinks).values(rows);
    return productId!;
  });
}

// ---------- product .md upload ----------

export interface ProductDraft {
  input: ProductInput;
  /** Things the importer could not place; shown to the person who uploaded the file. */
  warnings: string[];
}

/**
 * Reads a product .md (WEBSITE-PLAN.md section 6): front matter with name, brand, category, mpn, source_url, specs,
 * uae, best_for, pros, cons, faq, highlights; the body becomes the summary. Brands and categories are matched by slug
 * or name; industries in best_for by slug. Pure apart from the lookups it is given, so it can be unit-tested.
 */
export function productFromMarkdown(
  text: string,
  lookup: { brands: { id: number; slug: string; name: string }[]; categories: { id: number; slug: string; name: string }[]; industries: { id: number; slug: string }[] },
): ProductDraft {
  const { data, body } = parseMarkdownFile(text);
  const warnings: string[] = [];
  const name = str(data.name ?? data.title, 160);
  if (!name) throw new Error("The file has no name: add `name:` to the front matter");
  const type = str(data.type);
  if (type && type !== "product") throw new Error(`This file is a "${type}", not a product. Upload it under Content.`);

  const find = (list: { id: number; slug: string; name: string }[], v: string) => {
    const s = slugify(v);
    return list.find((x) => x.slug === s || x.name.toLowerCase() === v.toLowerCase());
  };
  const brandName = str(data.brand, 80);
  const brand = brandName ? find(lookup.brands, brandName) : undefined;
  if (brandName && !brand) warnings.push(`Brand "${brandName}" is not in the catalog yet; add it under Brands, then pick it here.`);
  const categoryName = str(data.category, 80);
  const category = categoryName ? find(lookup.categories, categoryName) : undefined;
  if (categoryName && !category) warnings.push(`Category "${categoryName}" is not in the catalog; pick one before publishing.`);

  const specs: Record<string, string> = {};
  if (data.specs && typeof data.specs === "object" && !Array.isArray(data.specs)) {
    for (const [k, v] of Object.entries(data.specs as Record<string, unknown>)) {
      const value = Array.isArray(v) ? v.map((x) => str(x, 200)).join(", ") : str(v, 400);
      if (value) specs[k.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")] = value;
    }
  }

  const uaeRaw = (data.uae && typeof data.uae === "object" ? data.uae : {}) as Record<string, unknown>;
  const links: ProductLinkInput[] = [];
  if (Array.isArray(data.bestfor)) {
    for (const [i, b] of (data.bestfor as unknown[]).entries()) {
      const o = (b && typeof b === "object" ? b : { industry: b }) as Record<string, unknown>;
      const slug = slugify(str(o.industry));
      const ind = lookup.industries.find((x) => x.slug === slug);
      if (!ind) {
        if (slug) warnings.push(`Industry "${slug}" in best_for is not in the catalog.`);
        continue;
      }
      links.push({ industryId: ind.id, role: str(o.role, 120), label: str(o.label, 80), rank: i });
    }
  }

  return {
    warnings,
    input: {
      slug: slugify(str(data.slug) || name),
      name,
      series: str(data.series, 80),
      mpn: str(data.mpn ?? data.partnumber, 80),
      categoryId: category?.id ?? null,
      brandId: brand?.id ?? null,
      summary: body,
      highlights: strList(data.highlights, 8),
      specs,
      images: [],
      uaeAvailable: data.uaeavailable === undefined ? true : Boolean(data.uaeavailable),
      uaeNotes: { keyboard: str(uaeRaw.keyboard, 80) || undefined, warranty: str(uaeRaw.warranty, 120) || undefined, region: str(uaeRaw.region, 80) || undefined },
      sourceUrl: str(data.sourceurl, 500),
      specsChecked: Boolean(str(data.sourceurl)),
      pros: strList(data.pros, 10),
      cons: strList(data.cons, 10),
      faq: faqList(data.faq),
      seo: { title: str(data.metatitle, 70) || undefined, description: str(data.metadescription, 170) || undefined },
      portalProductId: null,
      status: "draft",
      links,
    },
  };
}

/** Upload a product .md: a new draft, or (same part number or slug) an update of the existing product, kept as it was published or not. */
export async function importProductMarkdown(text: string, userId: number): Promise<{ id: number; created: boolean; warnings: string[] }> {
  const [brands, categories, industries] = await Promise.all([
    siteDb.select({ id: siteSchema.siteBrands.id, slug: siteSchema.siteBrands.slug, name: siteSchema.siteBrands.name }).from(siteSchema.siteBrands),
    siteDb.select({ id: siteSchema.siteCategories.id, slug: siteSchema.siteCategories.slug, name: siteSchema.siteCategories.name }).from(siteSchema.siteCategories),
    siteDb.select({ id: siteSchema.siteIndustries.id, slug: siteSchema.siteIndustries.slug }).from(siteSchema.siteIndustries),
  ]);
  const { input, warnings } = productFromMarkdown(text, { brands, categories, industries });
  const [existing] = await siteDb
    .select({ id: siteSchema.siteProducts.id, status: siteSchema.siteProducts.status, images: siteSchema.siteProducts.images })
    .from(siteSchema.siteProducts)
    .where(input.mpn ? or(eq(siteSchema.siteProducts.mpn, input.mpn), eq(siteSchema.siteProducts.slug, input.slug)) : eq(siteSchema.siteProducts.slug, input.slug))
    .limit(1);
  if (existing) {
    await saveProduct({ ...input, status: existing.status, images: existing.images }, userId, existing.id);
    return { id: existing.id, created: false, warnings };
  }
  return { id: await saveProduct(input, userId), created: true, warnings };
}

// ---------- "Import listing" (pasted shop JSON) ----------

/** Puts a product without pictures in the worker's picture queue (again, if it failed before). 1 when queued. */
async function queuePictures(productId: number, pageUrl: string): Promise<number> {
  if (!pageUrl) return 0;
  const Q = siteSchema.sitePictureQueue;
  await siteDb
    .insert(Q)
    .values({ productId, pageUrl })
    .onConflictDoUpdate({ target: Q.productId, set: { pageUrl, status: "queued", error: "", updatedAt: new Date() } });
  return 1;
}

export interface ListingImportResult {
  added: number;
  priced: number;
  unchanged: number;
  /** Products whose pictures the worker will fetch from their listing page. */
  queued: number;
  skipped: string[];
  warnings: string[];
}

/**
 * Products read from pasted category-page JSON (listing-import.ts, in the browser) → draft products, a batch at a time.
 * A part number already in the catalog only gets the new price; everything typed by hand and its status stay. A brand
 * not in the catalog yet is added.
 */
export async function importListing(items: ListingItem[], userId: number): Promise<ListingImportResult> {
  const skipped: string[] = [];
  const [brands, categories] = await Promise.all([
    siteDb.select({ id: siteSchema.siteBrands.id, slug: siteSchema.siteBrands.slug, name: siteSchema.siteBrands.name }).from(siteSchema.siteBrands),
    siteDb.select({ id: siteSchema.siteCategories.id, slug: siteSchema.siteCategories.slug }).from(siteSchema.siteCategories),
  ]);
  const result: ListingImportResult = { added: 0, priced: 0, unchanged: 0, queued: 0, skipped, warnings: [] };
  // the listing price plus the store markup, rounded up to end in 9 (Website › Settings › Store)
  const { markupPercent } = await getStore();
  const priceOf = (p: string | null) => (p ? markedUp(p, markupPercent) : null);
  const missingCategories = new Set<string>();

  for (const item of items) {
    const [existing] = await siteDb
      .select({ id: siteSchema.siteProducts.id, listPrice: siteSchema.siteProducts.listPrice, images: siteSchema.siteProducts.images })
      .from(siteSchema.siteProducts)
      .where(sql`lower(${siteSchema.siteProducts.mpn}) = ${item.mpn.toLowerCase()}`)
      .limit(1);
    if (existing) {
      const price = priceOf(item.price);
      if (price && price !== existing.listPrice) {
        await siteDb.update(siteSchema.siteProducts).set({ listPrice: price, updatedAt: new Date() }).where(eq(siteSchema.siteProducts.id, existing.id));
        result.priced++;
      } else result.unchanged++;
      if (!existing.images.length) result.queued += await queuePictures(existing.id, item.pageUrl);
      continue;
    }

    const brandSlug = slugify(item.brand);
    let brand = brands.find((b) => b.slug === brandSlug || b.name.toLowerCase() === item.brand.toLowerCase());
    if (!brand) {
      const name = item.brand.length <= 4 ? item.brand.toUpperCase() : item.brand;
      const [row] = await siteDb.insert(siteSchema.siteBrands).values({ slug: brandSlug, name, status: "published", sort: 100 }).returning({ id: siteSchema.siteBrands.id });
      brand = { id: row.id, slug: brandSlug, name };
      brands.push(brand);
      result.warnings.push(`Brand ${name} added.`);
    }
    const category = categories.find((c) => c.slug === item.category);
    if (!category) missingCategories.add(item.category || item.sourceCategory || "(none)");

    // our slug: the short name plus the part number, so two configurations of one model never collide
    const slugBase = slugify(`${item.name.split(",")[0]} ${item.mpn}`);
    const [{ n }] = await siteDb.select({ n: sql<number>`count(*)::int` }).from(siteSchema.siteProducts).where(eq(siteSchema.siteProducts.slug, slugBase));
    const productId = await saveProduct(
      {
        slug: n ? `${slugBase}-${Date.now().toString(36)}` : slugBase,
        name: item.name,
        series: "",
        mpn: item.mpn,
        categoryId: category?.id ?? null,
        brandId: brand.id,
        summary: "",
        highlights: item.highlights,
        specs: item.specs,
        images: [],
        uaeAvailable: true,
        uaeNotes: item.keyboard ? { keyboard: item.keyboard } : {},
        sourceUrl: "",
        specsChecked: false,
        pros: [],
        cons: [],
        faq: [],
        seo: {},
        portalProductId: null,
        status: "draft",
        links: [],
        priceMode: item.price ? "public" : "on_request",
        listPrice: priceOf(item.price),
      },
      userId,
    );
    result.added++;
    result.queued += await queuePictures(productId, item.pageUrl);
  }
  if (missingCategories.size) result.warnings.push(`No matching category for ${[...missingCategories].join(", ")}: pick one on those products.`);
  return result;
}

/** Procurement products (ZeronixOS database) matching a part number or name, for "Link to portal product". */
export async function searchPortalProducts(q: string) {
  if (q.trim().length < 2) return [];
  return db
    .select({ id: schema.products.id, brand: schema.products.brand, modelName: schema.products.modelName, partNumber: schema.products.partNumber })
    .from(schema.products)
    .where(or(ilike(schema.products.partNumber, `%${q}%`), ilike(schema.products.modelName, `%${q}%`)))
    .limit(10);
}

export async function industryOptions() {
  return siteDb.select({ id: siteSchema.siteIndustries.id, name: siteSchema.siteIndustries.name, slug: siteSchema.siteIndustries.slug }).from(siteSchema.siteIndustries).orderBy(asc(siteSchema.siteIndustries.sort));
}

export async function filesByIds(ids: number[]) {
  if (!ids.length) return [];
  return siteDb.select({ id: siteSchema.siteMedia.id, name: siteSchema.siteMedia.name }).from(siteSchema.siteMedia).where(inArray(siteSchema.siteMedia.id, ids));
}

// ---------- bulk status from the Website app's lists ----------

export type BulkStatusList = "industries" | "categories" | "brands";

/** Publish, unpublish (draft) or archive many industries, categories or brands at once. */
export async function bulkStatus(list: BulkStatusList, ids: number[], status: Status): Promise<number> {
  if (!ids.length) return 0;
  const table = list === "industries" ? siteSchema.siteIndustries : list === "categories" ? siteSchema.siteCategories : siteSchema.siteBrands;
  const rows = await siteDb.update(table).set({ status }).where(inArray(table.id, ids)).returning({ id: table.id });
  return rows.length;
}
