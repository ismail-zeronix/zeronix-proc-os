"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import {
  bulkProducts,
  bulkStatus,
  importListing,
  importProductMarkdown,
  picturesFromLinks,
  productIdsMatching,
  saveBrand,
  saveCategory,
  saveIndustry,
  saveProduct,
  saveSiteImage,
  searchPortalProducts,
  type BrandInput,
  type BulkStatusList,
  type CategoryInput,
  type IndustryInput,
  type ListingImportResult,
  type ProductBulkOp,
  type ProductInput,
} from "@/lib/website/catalog";
import { SITE_ICONS } from "@/lib/website/contract";
import type { ListingItem } from "@/lib/website/listing-import";
import { revalidateSite } from "@/lib/website/revalidate";
import type { SiteImage } from "@/lib/website/types";
import { parseInput } from "@/lib/user-error";

/** Catalog edits from the Website app. Anyone with the app may edit and publish (WEBSITE-PLAN.md section 8). */

const text = (max: number) => z.string().trim().max(max);
const status = z.enum(["draft", "published", "archived"]);
const icon = z.union([z.enum(SITE_ICONS), z.literal("")]);
const image = z.object({ fileId: z.number().int().positive(), alt: text(300), source: text(200).optional() });
const faq = z.array(z.object({ q: text(300).min(1), a: text(2000).min(1) })).max(20);
const seo = z.object({ title: text(70).optional(), description: text(170).optional(), noindex: z.boolean().optional() });
const lines = (max: number) => z.array(text(300)).max(max).transform((a) => a.filter(Boolean));
const slug = text(90).regex(/^[a-z0-9-]*$/, "A web address may only use lowercase letters, digits and dashes");

async function done(path: string, tags: string[]) {
  revalidatePath(path, "layout");
  await revalidateSite(tags);
}

const industrySchema = z.object({
  slug,
  name: text(80).min(2, "Enter the industry name"),
  icon,
  summary: text(200),
  heroTitle: text(140),
  intro: text(20000),
  painPoints: lines(8),
  roles: z.array(z.object({ role: text(80).min(1), needs: text(300), categories: z.array(text(90)).max(10) })).max(8),
  faq,
  seo,
  image: image.nullable(),
  sort: z.number().int().min(0).max(999),
  status,
});

export async function saveIndustryAction(input: IndustryInput, id?: number): Promise<Result<number>> {
  return attempt(async () => {
    await assertApp("website");
    const saved = await saveIndustry(industrySchema.parse(input), id).catch(uniqueSlug);
    await done("/website/industries", ["nav", "catalog"]);
    return saved;
  });
}

const categorySchema = z.object({
  slug,
  name: text(80).min(2, "Enter the category name"),
  icon,
  description: text(300),
  intro: text(20000),
  faq,
  specTemplate: z.object({ groups: z.array(z.object({ label: text(60), fields: z.array(z.object({ key: text(60), label: text(60), filter: z.boolean().optional() })) })).max(20) }),
  seo,
  image: image.nullable(),
  sort: z.number().int().min(0).max(999),
  status,
});

export async function saveCategoryAction(input: CategoryInput, id?: number): Promise<Result<number>> {
  return attempt(async () => {
    await assertApp("website");
    const saved = await saveCategory(categorySchema.parse(input), id).catch(uniqueSlug);
    await done("/website/categories", ["nav", "catalog"]);
    return saved;
  });
}

const brandSchema = z.object({
  slug,
  name: text(60).min(1, "Enter the brand name"),
  website: z.union([z.literal(""), z.url("Enter the brand's website address")]),
  uaeWarrantyNote: text(300),
  sort: z.number().int().min(0).max(999),
  status,
});

export async function saveBrandAction(input: BrandInput, id?: number): Promise<Result<number>> {
  return attempt(async () => {
    await assertApp("website");
    const saved = await saveBrand(brandSchema.parse(input), id).catch(uniqueSlug);
    await done("/website/brands", ["nav", "catalog"]);
    return saved;
  });
}

const productSchema = z
  .object({
    slug,
    name: text(160).min(2, "Enter the product name"),
    series: text(80),
    mpn: text(80),
    categoryId: z.number().int().positive().nullable(),
    brandId: z.number().int().positive().nullable(),
    summary: text(20000),
    highlights: lines(8),
    specs: z.record(z.string().max(60), text(400)),
    images: z.array(image).max(12),
    uaeAvailable: z.boolean(),
    uaeNotes: z.object({ keyboard: text(80).optional(), warranty: text(120).optional(), region: text(80).optional() }),
    sourceUrl: z.union([z.literal(""), z.url("The spec source must be a web address")]),
    specsChecked: z.boolean(),
    pros: lines(10),
    cons: lines(10),
    faq,
    seo,
    portalProductId: z.number().int().positive().nullable(),
    status,
    links: z.array(z.object({ industryId: z.number().int().positive(), role: text(120), label: text(80), rank: z.number().int().min(0) })).max(20),
    priceMode: z.enum(["hidden", "on_request", "public"]).optional(),
    listPrice: z
      .string()
      .trim()
      .nullable()
      .optional()
      .transform((v, ctx) => {
        const n = (v ?? "").replace(/,/g, "");
        if (!n) return null;
        if (!/^\d{1,9}(\.\d{1,2})?$/.test(n)) {
          ctx.addIssue({ code: "custom", message: "The price is a number like 4149 or 4149.50" });
          return z.NEVER;
        }
        return Number(n).toFixed(2);
      }),
  })
  .refine((p) => p.status !== "published" || p.categoryId, { message: "Pick a category before publishing" })
  .refine((p) => p.priceMode !== "public" || p.listPrice, { message: 'Enter the price, or set it to "Price on request"' });

export async function saveProductAction(input: ProductInput, id?: number): Promise<Result<number>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const saved = await saveProduct(productSchema.parse(input), me.id, id).catch(uniqueSlug);
    await done("/website/products", ["catalog"]);
    return saved;
  });
}

/** One picture for the site (FormData: file, alt). */
export async function uploadSiteImageAction(form: FormData): Promise<Result<SiteImage>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Problem("Choose a picture");
    return saveSiteImage(file, String(form.get("alt") ?? ""), me.id).catch((e: Error) => {
      throw new Problem(e.message);
    });
  });
}

/** Product .md upload (FormData: file). New = draft; an existing part number or slug is updated in place. */
export async function importProductAction(form: FormData): Promise<Result<{ id: number; created: boolean; warnings: string[] }>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Problem("Choose a .md file");
    if (file.size > 512_000) throw new Problem("That file is too big for a product (500 KB at most)");
    const res = await importProductMarkdown(await file.text(), me.id).catch((e: Error) => {
      throw new Problem(e.message);
    });
    await done("/website/products", ["catalog"]);
    return res;
  });
}

const listingItem = z.object({
  mpn: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9#.-]{3,40}$/),
  brand: text(60).min(1),
  name: text(160).min(2),
  category: text(40),
  sourceCategory: text(120),
  price: z
    .string()
    .regex(/^\d{1,9}\.\d{2}$/)
    .nullable(),
  specs: z.record(z.string().max(40), text(400)),
  keyboard: text(80),
  highlights: z.array(text(200)).max(8),
  pageUrl: z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(500)]),
});

/** "Import listing": products read in the browser from pasted JSON, sent a batch at a time, become drafts. */
export async function importListingAction(items: ListingItem[]): Promise<Result<ListingImportResult>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const list = parseInput(z.array(listingItem).min(1).max(100), items);
    const res = await importListing(list, me.id).catch((e: Error) => {
      throw new Problem(e.message);
    });
    await done("/website/products", ["catalog", "nav"]);
    return res;
  });
}

/** "Add pictures from links" in the product editor: the pictures come back for the form; Save keeps them. */
export async function picturesFromLinksAction(urls: string[], alt: string): Promise<Result<{ images: SiteImage[]; problems: string[] }>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const list = z.array(z.string().trim().max(2000)).max(12, "12 links at a time at most").parse(urls).filter(Boolean);
    if (!list.length) throw new Problem("Paste at least one picture link");
    return picturesFromLinks(list, text(300).parse(alt), me.id);
  });
}

export async function searchPortalProductsAction(q: string) {
  await assertApp("website");
  return searchPortalProducts(q);
}

/** A second row with the same web address: say so instead of failing. */
function uniqueSlug(e: unknown): never {
  if ((e as { code?: string }).code === "23505") throw new Problem("Another record already uses this web address (slug). Change the slug.");
  throw e;
}

// ---------- bulk changes from the lists ----------

const productFilter = z.object({
  q: z.string().trim().max(120).optional(),
  status: status.optional(),
  categoryId: z.number().int().min(0).optional(),
});
const productTarget = z.union([z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }), z.object({ filter: productFilter })]);
const productChange = z.union([
  z.object({ op: z.enum(["publish", "draft", "archive", "sell_online", "quote_only", "delete"]) }),
  z.object({ op: z.literal("category"), categoryId: z.number().int().positive() }),
]);

/** Many products at once: the ticked ones, or every product matching the list's filter ("select all N"). */
export async function bulkProductsAction(target: z.infer<typeof productTarget>, change: ProductBulkOp): Promise<Result<{ changed: number; skipped: string[] }>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const t = parseInput(productTarget, target);
    const c = parseInput(productChange, change);
    if (c.op === "delete" && me.role !== "admin") throw new Problem("Only an admin can delete products.");
    const ids = "ids" in t ? t.ids : await productIdsMatching(t.filter);
    const res = await bulkProducts(ids, c);
    await done("/website/products", ["catalog", "nav"]);
    return res;
  });
}

/** Publish, unpublish or archive many industries, categories or brands. */
export async function bulkStatusAction(list: BulkStatusList, ids: number[], to: "published" | "draft" | "archived"): Promise<Result<number>> {
  return attempt(async () => {
    await assertApp("website");
    const n = await bulkStatus(z.enum(["industries", "categories", "brands"]).parse(list), z.array(z.number().int().positive()).max(500).parse(ids), status.parse(to));
    await done(`/website/${list}`, ["catalog", "nav"]);
    return n;
  });
}
