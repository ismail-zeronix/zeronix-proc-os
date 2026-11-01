import type { MetadataRoute } from "next";
import { getSitemap } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";

/** Every published page, from the portal. robots.txt points here once the site is indexed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { entries } = await getSitemap();
  return entries.map((e) => ({ url: `${SITE_URL}${e.path === "/" ? "" : e.path}`, lastModified: e.updatedAt }));
}

export const revalidate = 600;
