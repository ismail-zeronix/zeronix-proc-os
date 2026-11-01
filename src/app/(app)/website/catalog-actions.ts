"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import {
  importProductMarkdown,
  saveBrand,
  saveCategory,
  saveIndustry,
  saveProduct,
  saveSiteImage,
  searchPortalProducts,
  type BrandInput,
  type CategoryInput,
  type IndustryInput,
  type ProductInput,
} from "@/lib/website/catalog";
import { SITE_ICONS } from "@/lib/website/contract";
import { revalidateSite } from "@/lib/website/revalidate";
import type { SiteImage } from "@/lib/website/types";

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
  })
  .refine((p) => p.status !== "published" || p.categoryId, { message: "Pick a category before publishing" });

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

export async function searchPortalProductsAction(q: string) {
  await assertApp("website");
  return searchPortalProducts(q);
}

/** A second row with the same web address: say so instead of failing. */
function uniqueSlug(e: unknown): never {
  if ((e as { code?: string }).code === "23505") throw new Problem("Another record already uses this web address (slug). Change the slug.");
  throw e;
}
