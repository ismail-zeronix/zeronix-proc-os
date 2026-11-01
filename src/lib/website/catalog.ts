import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { db, schema } from "@/db";
import { siteFiles } from "./media";
import { faqList, parseMarkdownFile, renderMarkdown, slugify, str, strList } from "./markdown";
import type { SiteFaq, SiteImage, SiteIndustryRole, SiteSeo, SiteSpecTemplate, SiteUaeNotes } from "./types";

/** The Website app's catalog (WEBSITE-PLAN.md section 5): industries, categories, brands, products. Admin side only. */

export type Status = "draft" | "published" | "archived";

// ---------- images ----------

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Stores a picture for the public site in its own folder and site_media (what /api/site/media serves). */
export async function saveSiteImage(file: File, alt: string, userId: number): Promise<SiteImage> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Use a JPG, PNG, WebP or AVIF picture");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Pictures can be up to 8 MB");
  const storedName = await siteFiles.save(Buffer.from(await file.arrayBuffer()), ext);
  const [row] = await siteDb
    .insert(siteSchema.siteMedia)
    .values({ name: file.name.slice(0, 200), storedName, mime: file.type, size: file.size, alt: alt.slice(0, 300), uploadedBy: userId })
    .returning({ id: siteSchema.siteMedia.id });
  return { fileId: row.id, alt: alt.slice(0, 300) };
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
  const values = { ...input, slug: slugify(input.slug || input.name) };
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
}

export async function listProducts(opts: { q?: string; status?: Status; categoryId?: number } = {}) {
  const where = and(
    opts.status ? eq(siteSchema.siteProducts.status, opts.status) : undefined,
    opts.categoryId ? eq(siteSchema.siteProducts.categoryId, opts.categoryId) : undefined,
    opts.q ? or(ilike(siteSchema.siteProducts.name, `%${opts.q}%`), ilike(siteSchema.siteProducts.mpn, `%${opts.q}%`)) : undefined,
  );
  return siteDb
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
      specs: sql<number>`(select count(*)::int from jsonb_object_keys(${siteSchema.siteProducts.specs}))`,
      industries: sql<number>`(select count(*)::int from site_product_links l where l.product_id = ${siteSchema.siteProducts.id})`,
      updatedAt: siteSchema.siteProducts.updatedAt,
    })
    .from(siteSchema.siteProducts)
    .leftJoin(siteSchema.siteCategories, eq(siteSchema.siteCategories.id, siteSchema.siteProducts.categoryId))
    .leftJoin(siteSchema.siteBrands, eq(siteSchema.siteBrands.id, siteSchema.siteProducts.brandId))
    .where(where)
    .orderBy(desc(siteSchema.siteProducts.updatedAt))
    .limit(500);
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
