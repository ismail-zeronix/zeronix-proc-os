import type { MetadataRoute } from "next";
import { getBrand, getSitemap } from "@/lib/api";
import { BRAND_SEO } from "@/lib/seo-brands";
import { EMIRATE_PAGES } from "@/lib/seo-emirates";
import { SITE_URL } from "@/lib/defaults";
import { GAMES, gamePath } from "@/lib/gaming";

/** When the gaming pages' copy last changed (lib/gaming.ts); bump with the game data. */
const GAMING_UPDATED = "2026-11-22";
/** When the SEO landing copy (lib/seo-*.ts) last changed. */
const SEO_UPDATED = "2026-11-25";

/**
 * Every published page with its last real change and its pictures (image sitemap), from the portal, plus the Gaming
 * pages (/gaming, GTA VI, one per game) once the gaming categories are published. robots.txt points here.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { entries } = await getSitemap();
  const out: MetadataRoute.Sitemap = entries.map((e) => ({
    url: `${SITE_URL}${e.path === "/" ? "" : e.path}`,
    lastModified: e.updatedAt,
    ...(e.images?.length ? { images: e.images.map((src) => `${SITE_URL}${src}`) } : {}),
  }));
  if (entries.some((e) => e.path.startsWith("/products/gaming-pcs")))
    out.push(...["/gaming", ...GAMES.map(gamePath)].map((path) => ({ url: `${SITE_URL}${path}`, lastModified: GAMING_UPDATED })));
  // SEO landing pages (lib/seo-emirates.ts, lib/seo-brands.ts): emirate pages always; a brand + category page only
  // when the brand has products in that category (the others are noindex)
  out.push(...EMIRATE_PAGES.map((e) => ({ url: `${SITE_URL}/video-conferencing/${e.slug}`, lastModified: SEO_UPDATED })));
  const brands = await Promise.all(Object.keys(BRAND_SEO).map((slug) => getBrand(slug).catch(() => null)));
  for (const b of brands) {
    if (!b) continue;
    for (const category of Object.keys(BRAND_SEO[b.slug].categories))
      if (b.products.some((p) => p.categorySlug === category)) out.push({ url: `${SITE_URL}/brands/${b.slug}/${category}`, lastModified: SEO_UPDATED });
  }
  return out;
}

export const revalidate = 600;
