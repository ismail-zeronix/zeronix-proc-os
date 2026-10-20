import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { DEFAULT_BRAND, type Brand } from "@/lib/signature";

/** Company branding for email signatures (defaults until an admin saves it). Cached per request. */
export const getBrandRow = cache(async () => {
  const [row] = await db.select().from(schema.brandProfile).where(eq(schema.brandProfile.id, 1));
  return row ?? null;
});

export async function getBrand(): Promise<Brand & { version: number }> {
  const row = await getBrandRow();
  if (!row) return { ...DEFAULT_BRAND, version: 0 };
  return {
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

/** The uploaded logo file, or null. */
export async function getLogo(): Promise<{ mime: string; data: Buffer } | null> {
  const row = await getBrandRow();
  if (!row?.logoB64) return null;
  return { mime: row.logoMime, data: Buffer.from(row.logoB64, "base64") };
}
