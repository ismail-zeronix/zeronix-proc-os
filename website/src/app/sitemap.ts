import type { MetadataRoute } from "next";
import { getSitemap } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";

/** Every published page with its last real change and its pictures (image sitemap), from the portal. robots.txt points here. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { entries } = await getSitemap();
  return entries.map((e) => ({
    url: `${SITE_URL}${e.path === "/" ? "" : e.path}`,
    lastModified: e.updatedAt,
    ...(e.images?.length ? { images: e.images.map((src) => `${SITE_URL}${src}`) } : {}),
  }));
}

export const revalidate = 600;
