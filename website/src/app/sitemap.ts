import type { MetadataRoute } from "next";
import { getSitemap } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { GAMES, gamePath } from "@/lib/gaming";

/** When the gaming pages' copy last changed (lib/gaming.ts); bump with the game data. */
const GAMING_UPDATED = "2026-11-22";

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
  return out;
}

export const revalidate = 600;
