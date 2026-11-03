import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { siteDb, siteSchema } from "@/db/site";
import { classifySource } from "./traffic";
import type { SiteQuoteItem } from "./types";

/**
 * "Get B2B pricing" requests from the public site (WEBSITE-PLAN.md section 7). They land in Website › Leads; a person
 * turns a real one into a CRM lead (the same way "Save to leads" works for chats) or marks it as spam.
 */

const text = (max: number) => z.string().trim().max(max);

export const quoteSchema = z.object({
  name: text(120).min(2, "Please enter your name"),
  company: text(160),
  email: z.email("Please enter a valid email address").max(200),
  phone: text(40).refine((v) => !v || /^[+\d][\d\s()-]{5,}$/.test(v), "Please enter a valid phone number"),
  users: z.number().int().min(1).max(100_000).nullable(),
  budget: text(80),
  timeline: text(80),
  notes: text(3000),
  industry: text(90),
  items: z.array(z.object({ slug: text(120).optional(), name: text(200).min(1), qty: z.number().int().min(1).max(10_000) })).max(30),
  sourcePage: text(500),
  cta: text(120),
  utm: z.record(z.string().max(20), text(200)).default({}),
  /** First touch, from the visitor's own browser: the first page they opened and the site that sent them. */
  landingPath: text(300).default(""),
  firstReferrer: text(500).default(""),
  visitorKey: text(64),
});

export type QuoteInput = z.infer<typeof quoteSchema>;

export async function createQuoteRequest(input: QuoteInput, site: string): Promise<number> {
  const slugs = input.items.flatMap((i) => (i.slug ? [i.slug] : []));
  const found = slugs.length ? await siteDb.select({ id: siteSchema.siteProducts.id, slug: siteSchema.siteProducts.slug, name: siteSchema.siteProducts.name }).from(siteSchema.siteProducts).where(inArray(siteSchema.siteProducts.slug, slugs)) : [];
  const items: SiteQuoteItem[] = input.items.map((i) => {
    const p = found.find((x) => x.slug === i.slug);
    return { productId: p?.id, name: p?.name ?? i.name, qty: i.qty };
  });
  const [row] = await siteDb
    .insert(siteSchema.siteQuoteRequests)
    .values({
      site,
      industry: input.industry,
      items,
      sourcePage: input.sourcePage,
      cta: input.cta,
      name: input.name,
      company: input.company,
      email: input.email.toLowerCase(),
      phone: input.phone,
      users: input.users,
      budget: input.budget,
      timeline: input.timeline,
      notes: input.notes,
      utm: input.utm,
      landingPath: input.landingPath.startsWith("/") ? input.landingPath : "",
      firstReferrer: input.firstReferrer,
      source: classifySource(input.firstReferrer, input.utm, site),
      visitorKey: input.visitorKey,
    })
    .returning({ id: siteSchema.siteQuoteRequests.id });
  return row.id;
}

export async function listQuoteRequests(status: "new" | "converted" | "spam", page = 1, pageSize = 50) {
  return siteDb
    .select({ r: siteSchema.siteQuoteRequests, industryName: siteSchema.siteIndustries.name })
    .from(siteSchema.siteQuoteRequests)
    .leftJoin(siteSchema.siteIndustries, eq(siteSchema.siteIndustries.slug, siteSchema.siteQuoteRequests.industry))
    .where(eq(siteSchema.siteQuoteRequests.status, status))
    .orderBy(desc(siteSchema.siteQuoteRequests.createdAt), desc(siteSchema.siteQuoteRequests.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

export async function quoteCounts(): Promise<Record<string, number>> {
  const rows = await siteDb.select({ status: siteSchema.siteQuoteRequests.status, n: sql<number>`count(*)::int` }).from(siteSchema.siteQuoteRequests).groupBy(siteSchema.siteQuoteRequests.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export async function getQuoteRequest(id: number) {
  const [row] = await siteDb.select().from(siteSchema.siteQuoteRequests).where(eq(siteSchema.siteQuoteRequests.id, id));
  return row ?? null;
}

/** The deal's requirement text: what they asked for, for whom and when. */
export function quoteRequirement(r: { items: SiteQuoteItem[]; users: number | null; budget: string; timeline: string; notes: string; industry: string }, industryName?: string | null): string {
  return [
    r.items.length ? r.items.map((i) => `${i.qty} × ${i.name}`).join("\n") : "",
    [industryName || r.industry ? `Industry: ${industryName || r.industry}` : "", r.users ? `Users: ${r.users}` : "", r.budget ? `Budget: ${r.budget}` : "", r.timeline ? `Needed: ${r.timeline}` : ""].filter(Boolean).join(" · "),
    r.notes,
  ]
    .filter(Boolean)
    .join("\n\n");
}
