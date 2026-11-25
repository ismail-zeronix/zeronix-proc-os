"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDeal } from "@/app/(app)/crm/actions";
import { db, schema } from "@/db";
import { assertProspects } from "@/lib/prospecting/access";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { parseInput, UserError } from "@/lib/user-error";

const convertSchema = z.object({
  /** The person who answered (a prospect person); none = the company only. */
  personId: z.number().int().positive().nullable().default(null),
  title: z.string().trim().max(160).default(""),
  requirement: z.string().trim().max(4000).default(""),
  /** How they came in: a reply to a cold email, or a cold call. */
  via: z.enum(["email", "call"]).default("email"),
});

/**
 * Outreach › Replies / Call mode: "they are interested" becomes a CRM lead. Creates (or reuses) the company and the
 * contact, the deal at New with today's contact task (crm createDeal), marks the prospect converted with links both
 * ways, and stops any emails still waiting for it.
 */
export async function convertToLead(companyId: number, input: z.input<typeof convertSchema>): Promise<Result<{ dealId: number; reusedCompany: string | null }>> {
  return attempt(async () => {
    const { me } = await assertProspects([companyId]);
    const d = parseInput(convertSchema, input);
    const [p] = await db.select().from(schema.prospectCompanies).where(eq(schema.prospectCompanies.id, companyId));
    if (!p) throw new Problem("That prospect no longer exists.");
    if (p.status === "converted" && p.crmDealId) throw new Problem("Already a lead. Open it from the prospect page.");
    const [person] = d.personId
      ? await db.select().from(schema.prospectPeople).where(and(eq(schema.prospectPeople.id, d.personId), eq(schema.prospectPeople.companyId, companyId)))
      : [];
    if (d.personId && !person) throw new Problem("That person is not on this prospect.");

    let deal: { id: number; reusedCompany: string | null };
    try {
      deal = await createDeal({
        companyName: p.name,
        emirate: p.emirate ?? "",
        industry: p.industry ?? "",
        contactName: person?.name ?? "",
        contactJobTitle: person?.title ?? "",
        contactEmail: person?.email ?? "",
        contactPhone: person?.phone || p.phone || "",
        title: d.title,
        requirement: d.requirement || (d.via === "email" ? "Replied to a cold email." : "Interested on a cold call."),
        source: d.via === "email" ? "Email" : "Phone call",
      });
    } catch (e) {
      // crm messages (the company belongs to another salesman, …) are meant for the person: show them as they are
      if (e instanceof UserError) throw new Problem(e.message);
      throw e;
    }
    const [created] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, deal.id));
    await db.transaction(async (tx) => {
      await tx
        .update(schema.prospectCompanies)
        .set({ status: "converted", crmDealId: deal.id, crmCompanyId: created?.companyId ?? null, statusChangedAt: new Date(), ownerId: p.ownerId ?? me.id })
        .where(eq(schema.prospectCompanies.id, companyId));
      await tx
        .update(schema.outreachEnrollments)
        .set({ status: "stopped", stopReason: "Turned into a CRM lead", nextSendAt: null, updatedAt: new Date() })
        .where(and(eq(schema.outreachEnrollments.companyId, companyId), inArray(schema.outreachEnrollments.status, ["writing", "draft", "active", "paused"])));
      await tx.insert(schema.prospectActivities).values({ companyId, userId: me.id, kind: "converted", body: `Turned into a CRM lead (deal ${deal.id})${deal.reusedCompany ? `, on the existing customer ${deal.reusedCompany}` : ""}.` });
    });
    revalidatePath("/prospecting", "layout");
    revalidatePath("/crm", "layout");
    revalidatePath("/");
    return { dealId: deal.id, reusedCompany: deal.reusedCompany };
  });
}
