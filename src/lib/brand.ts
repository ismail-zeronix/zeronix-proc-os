import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { configChanged, orgCached } from "@/lib/org-config";
import { configOrg } from "@/lib/settings";
import { DEFAULT_BRAND, type Brand, normalizeStyle } from "@/lib/signature";

async function readBrandRow() {
  const [row] = await db.select().from(schema.brandProfile).where(eq(schema.brandProfile.id, 1));
  return row ?? null;
}

/** Company branding for email signatures (defaults until an admin saves it). Kept between requests (lib/org-config.ts). */
export const getBrandRow = cache(async () => {
  const orgId = await configOrg();
  return orgId ? orgCached(orgId, "brand", readBrandRow) : readBrandRow();
});

/** Call after saving the brand profile (with `tx`, inside that transaction). */
export async function brandChanged(tx?: Parameters<typeof configChanged>[2]): Promise<void> {
  const orgId = await configOrg();
  if (orgId) await configChanged(orgId, "brand", tx);
}

export async function getBrand(): Promise<Brand & { version: number }> {
  const row = await getBrandRow();
  if (!row) return { ...DEFAULT_BRAND, version: 0 };
  return {
    ...normalizeStyle(row.style),
    company: row.company,
    tagline: row.tagline,
    address: row.address,
    website: row.website,
    mainPhone: row.mainPhone,
    layout: row.layout,
    color: row.color,
    disclaimer: row.disclaimer,
    hasLogo: !!row.logoB64,
    version: row.updatedAt.getTime(),
  };
}

/** What customer documents print besides the email brand: contact lines and the uploaded images. */
export async function getDocBrand() {
  const row = await getBrandRow();
  const v = row?.updatedAt.getTime() ?? 0;
  return {
    email: row?.docEmail ?? "",
    phones: row?.docPhones ?? "",
    tradeLicense: row?.tradeLicense ?? "",
    logoDarkSrc: row?.logoDarkB64 ? `/api/brand/asset/logo-dark?v=${v}` : null,
    signatureSrc: row?.signatureB64 ? `/api/brand/asset/signature?v=${v}` : null,
    stampSrc: row?.stampB64 ? `/api/brand/asset/stamp?v=${v}` : null,
  };
}

export const BRAND_ASSETS = ["logo-dark", "signature", "stamp"] as const;
export type BrandAsset = (typeof BRAND_ASSETS)[number];

/** One of the document images (white logo, signature, stamp), or null when not uploaded. */
export async function getBrandAsset(kind: BrandAsset): Promise<{ mime: string; data: Buffer } | null> {
  const row = await getBrandRow();
  if (!row) return null;
  const [b64, mime] = kind === "logo-dark" ? [row.logoDarkB64, row.logoDarkMime] : kind === "signature" ? [row.signatureB64, row.signatureMime] : [row.stampB64, row.stampMime];
  return b64 ? { mime, data: Buffer.from(b64, "base64") } : null;
}

/** The uploaded logo file, or null. */
export async function getLogo(): Promise<{ mime: string; data: Buffer } | null> {
  const row = await getBrandRow();
  if (!row?.logoB64) return null;
  return { mime: row.logoMime, data: Buffer.from(row.logoB64, "base64") };
}

/**
 * Brand images are linked with ?v=<when the brand was saved>, so a link never shows another picture: the browser may
 * keep it for good. A link without the version is kept an hour.
 */
export function brandCacheControl(req: Request): string {
  return new URL(req.url).searchParams.get("v") ? "private, max-age=31536000, immutable" : "private, max-age=3600";
}
