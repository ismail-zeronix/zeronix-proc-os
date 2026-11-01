import "server-only";
import { asc, eq } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { CONTRACT_VERSION, SITE_ICONS, type SiteIcon, type SiteNavResponse, type SiteSettingsResponse } from "./contract";
import { getBrand, getHome } from "./settings";

/** Only published rows and public fields ever leave through these: the site must not see drafts or internal notes. */

const icon = (v: string): SiteIcon | "" => ((SITE_ICONS as readonly string[]).includes(v) ? (v as SiteIcon) : "");

export async function publicSettings(): Promise<SiteSettingsResponse> {
  const [brand, home] = await Promise.all([getBrand(), getHome()]);
  return { contract: CONTRACT_VERSION, brand, home };
}

export async function publicNav(): Promise<SiteNavResponse> {
  const [industries, categories, brands] = await Promise.all([
    siteDb
      .select({ slug: siteSchema.siteIndustries.slug, name: siteSchema.siteIndustries.name, icon: siteSchema.siteIndustries.icon, summary: siteSchema.siteIndustries.summary })
      .from(siteSchema.siteIndustries)
      .where(eq(siteSchema.siteIndustries.status, "published"))
      .orderBy(asc(siteSchema.siteIndustries.sort), asc(siteSchema.siteIndustries.name)),
    siteDb
      .select({ slug: siteSchema.siteCategories.slug, name: siteSchema.siteCategories.name, icon: siteSchema.siteCategories.icon, summary: siteSchema.siteCategories.description })
      .from(siteSchema.siteCategories)
      .where(eq(siteSchema.siteCategories.status, "published"))
      .orderBy(asc(siteSchema.siteCategories.sort), asc(siteSchema.siteCategories.name)),
    siteDb
      .select({ slug: siteSchema.siteBrands.slug, name: siteSchema.siteBrands.name })
      .from(siteSchema.siteBrands)
      .where(eq(siteSchema.siteBrands.status, "published"))
      .orderBy(asc(siteSchema.siteBrands.sort), asc(siteSchema.siteBrands.name)),
  ]);
  return {
    contract: CONTRACT_VERSION,
    industries: industries.map((x) => ({ ...x, icon: icon(x.icon) })),
    categories: categories.map((x) => ({ ...x, icon: icon(x.icon) })),
    brands: brands.map((b) => ({ ...b, icon: "" as const, summary: "" })),
  };
}
