import "server-only";
import { sql } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { siteReachable } from "./revalidate";

export interface SetupCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/** What still has to be set up before the site can go live (env on the portal side, and whether the site answers). */
export async function setupChecks(): Promise<SetupCheck[]> {
  const key = process.env.SITE_API_KEY ?? "";
  const origins = process.env.WEBCHAT_ORIGINS ?? "";
  const site = await siteReachable();
  return [
    { label: "Site API key", ok: key.length >= 24, detail: key.length >= 24 ? "SITE_API_KEY is set" : "Set SITE_API_KEY (24+ characters) on the portal and the site" },
    { label: "Publish refresh", ok: Boolean(process.env.REVALIDATE_SECRET), detail: process.env.REVALIDATE_SECRET ? "REVALIDATE_SECRET is set" : "Set REVALIDATE_SECRET on the portal and the site" },
    { label: "Site reachable", ok: site.ok, detail: site.detail },
    {
      label: "Chat allowed on the site",
      ok: origins.includes("zeronixtech.com"),
      detail: origins.includes("zeronixtech.com") ? "zeronixtech.com is in WEBCHAT_ORIGINS" : "Add https://zeronixtech.com,https://www.zeronixtech.com to WEBCHAT_ORIGINS",
    },
  ];
}

export type StatusCounts = Record<"industries" | "categories" | "brands" | "products" | "posts", { published: number; total: number }>;

export async function contentCounts(): Promise<StatusCounts> {
  const count = (table: typeof siteSchema.siteIndustries | typeof siteSchema.siteCategories | typeof siteSchema.siteBrands | typeof siteSchema.siteProducts | typeof siteSchema.sitePosts) =>
    siteDb
      .select({ total: sql<number>`count(*)::int`, published: sql<number>`count(*) filter (where ${table.status} = 'published')::int` })
      .from(table)
      .then((r) => r[0]);
  const [industries, categories, brands, products, posts] = await Promise.all([
    count(siteSchema.siteIndustries),
    count(siteSchema.siteCategories),
    count(siteSchema.siteBrands),
    count(siteSchema.siteProducts),
    count(siteSchema.sitePosts),
  ]);
  return { industries, categories, brands, products, posts };
}
