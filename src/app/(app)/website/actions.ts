"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { SITE_ICONS, type SiteHome } from "@/lib/website/contract";
import { revalidateSite } from "@/lib/website/revalidate";
import { saveHome } from "@/lib/website/settings";
import { addStarterCatalog, fillEmptyIndustryPages } from "@/lib/website/starter";

async function assertAdmin() {
  const me = await assertApp("website");
  if (me.role !== "admin") throw new Problem("Only an admin can change the site's pages.");
  return me;
}

const text = (max: number) => z.string().trim().max(max);

const homeSchema = z.object({
  hero: z.object({ eyebrow: text(60), title: text(120), subtitle: text(320), secondaryCta: text(40) }),
  features: z
    .array(z.object({ tag: text(30), title: text(90), text: text(160), href: z.string().trim().max(200).regex(/^(\/|$)/, "Feature links start with / (a page of the site)"), image: text(80) }))
    .max(3),
  stats: z.array(z.object({ value: text(12), label: text(60) })).max(4),
  steps: z.array(z.object({ title: text(60), text: text(200) })).max(4),
  reasons: z.array(z.object({ icon: z.union([z.enum(SITE_ICONS), z.literal("")]), title: text(60), text: text(200) })).max(6),
  ctaBand: z.object({ title: text(120).min(2, "Enter the closing call-to-action title"), text: text(300) }),
});

/** Home page words (Website › Pages). Empty rows are dropped, so clearing a row removes it from the site. */
export async function updateHome(input: SiteHome): Promise<Result<{ siteRefreshed: boolean }>> {
  return attempt(async () => {
    const me = await assertAdmin();
    const home = homeSchema.parse(input);
    home.features = home.features.filter((f) => f.title);
    home.stats = home.stats.filter((s) => s.value || s.label);
    home.steps = home.steps.filter((s) => s.title);
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

/** The first industries, categories and brands (lib/website/starter.ts); existing rows are kept as they are. */
export async function addStarter(): Promise<Result<{ added: number; siteRefreshed: boolean }>> {
  return attempt(async () => {
    await assertAdmin();
    const n = await addStarterCatalog();
    revalidatePath("/website", "layout");
    return { added: n.industries + n.categories + n.brands, siteRefreshed: await revalidateSite(["nav"]) };
  });
}
