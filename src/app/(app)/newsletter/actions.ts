"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertApp } from "@/lib/auth/session";
import { isEmail } from "@/lib/mail/compose";
import { BLOCK_DEFS, normDoc } from "@/lib/newsletter/blocks";
import { MAX_HTML } from "@/lib/newsletter/custom";
import { addContacts, type ImportResult } from "@/lib/newsletter/data";
import { newsProducts, pickProducts, type PickProduct } from "@/lib/website/newsletter-products";
import { sendTest, setCampaignPaused, startCampaign } from "@/lib/newsletter/send";
import { BLANK_KEY, HTML_KEY, templateByKey } from "@/lib/newsletter/templates";
import type { BlockType, NewsFields, ResolvedProduct } from "@/lib/newsletter/types";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import { setSetting } from "@/lib/settings";
import { parseInput } from "@/lib/user-error";

function refresh() {
  revalidatePath("/newsletter", "layout");
}

const listSchema = z.object({
  name: z.string().trim().min(2, "Give the list a name").max(80),
  consentNote: z.string().trim().max(300).default(""),
});
export type ListInput = z.input<typeof listSchema>;

export async function createList(input: ListInput): Promise<Result<number>> {
  return attempt(async () => {
    await assertApp("newsletter");
    const d = parseInput(listSchema, input);
    const [row] = await db.insert(schema.newsletterLists).values(d).returning({ id: schema.newsletterLists.id });
    refresh();
    return row.id;
  });
}

export async function updateList(id: number, input: ListInput): Promise<Result> {
  return attempt(async () => {
    await assertApp("newsletter");
    const d = parseInput(listSchema, input);
    await db.update(schema.newsletterLists).set(d).where(eq(schema.newsletterLists.id, id));
    refresh();
    return undefined;
  });
}

export async function deleteList(id: number): Promise<Result> {
  return attempt(async () => {
    await assertApp("newsletter");
    await db.delete(schema.newsletterLists).where(eq(schema.newsletterLists.id, id));
    refresh();
    return undefined;
  });
}

export async function importContacts(listId: number, text: string, source: string): Promise<Result<ImportResult>> {
  return attempt(async () => {
    await assertApp("newsletter");
    const src = parseInput(z.string().trim().min(3, "Say where these addresses came from (for example: met at GITEX, existing customers)").max(200), source);
    if (text.length > 400_000) throw new Problem("That is too much text at once. Add up to about 5,000 addresses at a time.");
    const res = await addContacts(listId, text, src);
    if (!res.added && !res.duplicates && !res.invalid.length) throw new Problem("No email addresses found in that text.");
    refresh();
    return res;
  });
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours look like #0F2747");
const font = z.enum(["arial", "segoe", "verdana", "trebuchet", "georgia", "times"]);
const docSchema = z.object({
  v: z.literal(1),
  style: z.object({ headingFont: font, bodyFont: font, brand: hex, accent: hex, page: hex, round: z.boolean(), logo: z.boolean() }),
  blocks: z
    .array(
      z.object({
        id: z.string().max(40),
        type: z.enum(BLOCK_DEFS.map((d) => d.type) as [BlockType, ...BlockType[]]),
        p: z.record(z.string(), z.string().max(8000)),
        ids: z.array(z.number().int()).max(12).optional(),
      }),
    )
    .max(60, "A newsletter can have up to 60 sections"),
});

const campaignSchema = z
  .object({
    name: z.string().trim().min(2, "Give the newsletter a name (only you see it)").max(100),
    templateKey: z.string().refine((k) => k === BLANK_KEY || k === HTML_KEY || !!templateByKey(k), "Pick a template"),
    subject: z.string().trim().min(3, "Write the subject line").max(150),
    preheader: z.string().trim().max(200).default(""),
    doc: docSchema.optional(),
    html: z.string().max(MAX_HTML, "That code is too long (the limit is about 300,000 characters). Use pictures from an address instead of embedding them.").optional(),
    listId: z.number().int().nullable().default(null),
  })
  .refine((d) => (d.templateKey === HTML_KEY ? typeof d.html === "string" : !!d.doc), { message: "The newsletter has no content" });
export type CampaignInput = z.input<typeof campaignSchema>;

/** What is stored: pasted code, or a clean block design. */
function fieldsFrom(d: z.output<typeof campaignSchema>): NewsFields {
  return d.templateKey === HTML_KEY ? { html: d.html } : { doc: normDoc(d.doc) ?? undefined };
}

/** Creates a draft newsletter, or saves changes to a draft (a started newsletter cannot be changed). */
export async function saveCampaign(id: number | null, input: CampaignInput): Promise<Result<number>> {
  return attempt(async () => {
    const me = await assertApp("newsletter");
    const d = parseInput(campaignSchema, input);
    const fields = fieldsFrom(d);
    if (id === null) {
      const [row] = await db
        .insert(schema.newsletterCampaigns)
        .values({ name: d.name, templateKey: d.templateKey, subject: d.subject, preheader: d.preheader, fields, listId: d.listId, createdBy: me.id })
        .returning({ id: schema.newsletterCampaigns.id });
      refresh();
      return row.id;
    }
    const [c] = await db.select({ status: schema.newsletterCampaigns.status }).from(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.id, id));
    if (!c) throw new Problem("Newsletter not found.");
    if (c.status !== "draft") throw new Problem("This newsletter has been started, so it can no longer be edited.");
    await db.update(schema.newsletterCampaigns).set({ name: d.name, subject: d.subject, preheader: d.preheader, fields, listId: d.listId }).where(eq(schema.newsletterCampaigns.id, id));
    refresh();
    return id;
  });
}

export async function sendTestEmail(campaignId: number, to: string): Promise<Result<string>> {
  return attempt(async () => {
    await assertApp("newsletter");
    const addr = parseInput(z.string().trim().toLowerCase().refine(isEmail, "Enter a valid email address"), to);
    return sendTest(campaignId, addr);
  });
}

export async function startNewsletter(id: number): Promise<Result<{ queued: number; skipped: number }>> {
  return attempt(async () => {
    await assertApp("newsletter");
    const r = await startCampaign(id);
    refresh();
    return r;
  });
}

export async function pauseNewsletter(id: number, paused: boolean): Promise<Result> {
  return attempt(async () => {
    await assertApp("newsletter");
    await setCampaignPaused(id, paused);
    refresh();
    return undefined;
  });
}

/** A copy of a newsletter as a new draft: the way to reuse a design you made. */
export async function duplicateNewsletter(id: number): Promise<Result<number>> {
  return attempt(async () => {
    const me = await assertApp("newsletter");
    const [c] = await db.select().from(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.id, id));
    if (!c) throw new Problem("Newsletter not found.");
    const [row] = await db
      .insert(schema.newsletterCampaigns)
      .values({ name: `${c.name} (copy)`.slice(0, 100), templateKey: c.templateKey, subject: c.subject, preheader: c.preheader, fields: c.fields, listId: c.listId, createdBy: me.id })
      .returning({ id: schema.newsletterCampaigns.id });
    refresh();
    return row.id;
  });
}

export async function deleteNewsletter(id: number): Promise<Result> {
  return attempt(async () => {
    await assertApp("newsletter");
    const [c] = await db.select({ status: schema.newsletterCampaigns.status }).from(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.id, id));
    if (c?.status === "sending") throw new Problem("Pause the newsletter before deleting it.");
    await db.delete(schema.newsletterCampaigns).where(eq(schema.newsletterCampaigns.id, id));
    refresh();
    return undefined;
  });
}

/** For the live preview and product picker in the editor. */
export async function searchSiteProducts(q: string): Promise<PickProduct[]> {
  await assertApp("newsletter");
  return pickProducts(q.slice(0, 80));
}

export async function resolveSiteProducts(ids: number[]): Promise<ResolvedProduct[]> {
  await assertApp("newsletter");
  return newsProducts(ids.slice(0, 12));
}

/** How many days must pass before the same address is mailed another newsletter (0 = no cool-off). */
export async function setCooloffDays(days: number): Promise<Result> {
  return attempt(async () => {
    await assertApp("newsletter");
    const d = parseInput(z.number().int("Enter whole days").min(0, "Days cannot be negative").max(365, "At most 365 days"), days);
    await setSetting("newsletter_cooloff_days", String(d));
    refresh();
    return undefined;
  });
}

export async function removeContact(id: number): Promise<Result> {
  return attempt(async () => {
    await assertApp("newsletter");
    await db.delete(schema.newsletterContacts).where(eq(schema.newsletterContacts.id, id));
    refresh();
    return undefined;
  });
}
