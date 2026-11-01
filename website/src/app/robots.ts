import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/defaults";
import { flags } from "@/lib/flags";

/** Closed to search engines until go-live (SITE_INDEXING=true), so a half-built site is never indexed. */
export default function robots(): MetadataRoute.Robots {
  if (!flags.indexing) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/"] }, sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL };
}

export const dynamic = "force-dynamic";
