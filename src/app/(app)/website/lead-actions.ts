"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createDeal } from "@/app/(app)/crm/actions";
import { db, schema } from "@/db";
import { siteDb, siteSchema } from "@/db/site";
import { assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { getQuoteRequest, quoteRequirement } from "@/lib/website/quotes";

/**
 * A quote request becomes a CRM lead (company, contact, deal at New, source Website) owned by whoever converts it, with
 * the request on the deal's timeline. Needs the CRM app as well. Converting twice opens the same lead.
 */
export async function convertQuoteAction(id: number): Promise<Result<{ dealId: number; reusedCompany: string | null }>> {
  return attempt(async () => {
    const me = await assertApp("website");
    const r = await getQuoteRequest(id);
    if (!r) throw new Problem("That request is gone.");
    if (r.dealId) return { dealId: r.dealId, reusedCompany: null };
    const [industry] = r.industry ? await siteDb.select({ name: siteSchema.siteIndustries.name }).from(siteSchema.siteIndustries).where(eq(siteSchema.siteIndustries.slug, r.industry)) : [];
    const requirement = quoteRequirement(r, industry?.name);
    const { id: dealId, reusedCompany } = await createDeal({
      companyName: r.company || r.name,
      contactName: r.name,
      contactEmail: r.email,
      contactPhone: r.phone,
      source: "Website",
      title: `${r.company || r.name} - B2B pricing request${r.site ? ` (${r.site})` : ""}`,
      requirement,
    }).catch((e: Error) => {
      throw new Problem(e.message === "You do not have access to this" ? "Converting needs the CRM app. Ask an admin." : e.message);
    });
    // the deal and its note live in the ZeronixOS database; only the request's link to it is in the website database
    const [deal] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, dealId));
    await db.insert(schema.activities).values({
      type: "note",
      body: `B2B pricing request #${r.id}${r.site ? ` from ${r.site}` : ""}${r.sourcePage ? ` (page ${r.sourcePage})` : ""}${r.cta ? `, button "${r.cta}"` : ""}\n\n${requirement}`.slice(0, 8000),
      dealId,
      companyId: deal?.companyId,
      userId: me.id,
    });
    await siteDb.update(siteSchema.siteQuoteRequests).set({ dealId, status: "converted" }).where(eq(siteSchema.siteQuoteRequests.id, id));
    revalidatePath("/website", "layout");
    return { dealId, reusedCompany };
  });
}

export async function setQuoteStatusAction(id: number, status: "new" | "spam"): Promise<Result<undefined>> {
  return attempt(async () => {
    await assertApp("website");
    await siteDb.update(siteSchema.siteQuoteRequests).set({ status }).where(eq(siteSchema.siteQuoteRequests.id, id));
    revalidatePath("/website", "layout");
    return undefined;
  });
}
