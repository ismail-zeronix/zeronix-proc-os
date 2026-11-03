"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { SITE_ICONS, type SiteHome } from "@/lib/website/contract";
import { revalidateSite } from "@/lib/website/revalidate";
import { saveHome } from "@/lib/website/settings";
import { addStarterCatalog, fillEmptyCategoryPages, fillEmptyIndustryPages } from "@/lib/website/starter";

async function assertAdmin() {
  const me = await assertApp("website");
  if (me.role !== "admin") throw new Problem("Only an admin can change the site's pages.");
  return me;
}

const text = (max: number) => z.string().trim().max(max);

const icon = z.union([z.enum(SITE_ICONS), z.literal("")]);
// links stay on the site: a path such as /services/cybersecurity (or empty for a row being cleared)
const href = z.string().trim().max(200).regex(/^(\/|$)/, "Links start with / (a page of the site)");
const link = z.object({ label: text(60), href });
const iconLink = link.extend({ icon });
const promo = z.object({ title: text(90), text: text(200), cta: text(40), href });

const homeSchema = z.object({
  topLinks: z.array(link).max(4),
  hero: z.object({ eyebrow: text(60), title: text(120), subtitle: text(320), shopLabel: text(40), checks: z.array(text(40)).max(3) }),
  benefits: z.array(z.object({ icon, title: text(40), text: text(60) })).max(4),
  bundles: promo,
  featured: z.object({ title: text(90), text: text(200) }),
  services: z.array(iconLink).max(8),
  stats: z.array(z.object({ value: text(12), label: text(60) })).max(4),
  reasons: z.array(z.object({ icon, title: text(60), text: text(200) })).max(6),
  ctaBand: z.object({ title: text(120).min(2, "Enter the closing call-to-action title"), text: text(300) }),
});

/** Home page words (Website › Pages). Empty rows are dropped, so clearing a row removes it from the site. */
export async function updateHome(input: SiteHome): Promise<Result<{ siteRefreshed: boolean }>> {
  return attempt(async () => {
    const me = await assertAdmin();
    const home = homeSchema.parse(input);
    home.topLinks = home.topLinks.filter((l) => l.label && l.href);
    home.hero.checks = home.hero.checks.filter(Boolean);
    home.benefits = home.benefits.filter((b) => b.title);
    home.services = home.services.filter((l) => l.label && l.href);
    home.stats = home.stats.filter((s) => s.value || s.label);
    home.reasons = home.reasons.filter((r) => r.title);
    await saveHome(home, me.id);
    revalidatePath("/website", "layout");
    return { siteRefreshed: await revalidateSite(["settings"]) };
  });
}

/** Starter copy for industry pages nobody has written on yet (lib/website/starter-content.ts). */
export async function fillIndustryPages(): Promise<Result<{ filled: number; siteRefreshed: boolean }>> {
  return attempt(async () => {
    await assertAdmin();
    const filled = await fillEmptyIndustryPages();
    revalidatePath("/website", "layout");
    return { filled, siteRefreshed: await revalidateSite(["catalog"]) };
  });
}

/** Buying advice, FAQ and search text for category pages nobody has written on yet (lib/website/category-content.ts). */
export async function fillCategoryPages(): Promise<Result<{ filled: number; siteRefreshed: boolean }>> {
  return attempt(async () => {
    await assertAdmin();
    const filled = await fillEmptyCategoryPages();
    revalidatePath("/website", "layout");
    return { filled, siteRefreshed: await revalidateSite(["catalog"]) };
  });
}

/** The first industries, categories and brands (lib/website/starter.ts); existing rows are kept as they are. */
export async function addStarter(): Promise<Result<{ added: number; siteRefreshed: boolean }>> {
  return attempt(async () => {
    await assertAdmin();
    const n = await addStarterCatalog();
    revalidatePath("/website", "layout");
    return { added: n.industries + n.categories + n.brands, siteRefreshed: await revalidateSite(["nav"]) };
  });
}
