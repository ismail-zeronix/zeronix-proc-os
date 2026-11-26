"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertApp } from "@/lib/auth/session";
import { attempt, Problem, type Result } from "@/lib/prospecting/result";
import type { SiteBrand } from "@/lib/website/contract";
import { revalidateSite } from "@/lib/website/revalidate";
import { importSearch, saveGsc, testGsc } from "@/lib/website/gsc";
import { saveBrand } from "@/lib/website/settings";
import { saveStore } from "@/lib/website/store";
import { EMIRATES, PAYMENT_METHODS, type StoreSettings } from "@/lib/website/store-core";
import { dubaiDay } from "@/lib/website/traffic";
import { parseInput } from "@/lib/user-error";

const text = (max: number) => z.string().trim().max(max);

const brandSchema = z.object({
  name: text(80).min(2, "Enter the site name"),
  tagline: text(120).min(2, "Enter a tagline"),
  subline: text(200),
  email: z.union([z.literal(""), z.email("Enter a valid email")]),
  phone: text(40),
  whatsapp: text(40),
  address: text(200),
  ctaLabel: text(40).min(2, "Enter the button text"),
  hours: text(120).optional(),
  mapUrl: z.union([z.literal(""), z.string().trim().regex(/^https:\/\/\S+$/, "The map link must start with https://")]).optional(),
  profiles: text(1500)
    .optional()
    .refine((v) => !v || v.split(/\s+/).every((u) => /^https:\/\/\S+$/.test(u)), "Each company profile link must start with https://"),
});

/** Brand and contact details shown on every page of the site. Admins only; the site refreshes right away. */
export async function updateBrand(input: SiteBrand): Promise<Result<{ siteRefreshed: boolean }>> {
  return attempt(async () => {
    const me = await assertApp("website");
    if (me.role !== "admin") throw new Problem("Only an admin can change the site's details.");
    await saveBrand(brandSchema.parse(input), me.id);
    revalidatePath("/website", "layout");
    return { siteRefreshed: await revalidateSite(["settings"]) };
  });
}

// ---------- Google Search Console (W.9) ----------

const gscSchema = z.object({ property: text(200), key: z.string().max(20_000) });

/** Saves the Search Console property and, when pasted, a new service account key (stored encrypted). Admins only. */
export async function saveGscAction(input: z.infer<typeof gscSchema>): Promise<Result<{ clientEmail: string }>> {
  return attempt(async () => {
    const me = await assertApp("website");
    if (me.role !== "admin") throw new Problem("Only an admin can connect Search Console.");
    const v = parseInput(gscSchema, input);
    const saved = await saveGsc(v.property, v.key, me.id).catch((e: Error) => {
      throw new Problem(e.message);
    });
    revalidatePath("/website/settings");
    return { clientEmail: saved.clientEmail };
  });
}

/** Asks Google for the last week without storing anything, to prove the key and the property access work. */
export async function testGscAction(): Promise<Result<{ rows: number; clicks: number }>> {
  return attempt(async () => {
    await assertApp("website");
    return testGsc().catch((e: Error) => {
      throw new Problem(e.message);
    });
  });
}

/** Imports the last 7 days now (the worker does the daily import and the first 16-month backfill). */
export async function importGscNowAction(): Promise<Result<{ rows: number }>> {
  return attempt(async () => {
    const me = await assertApp("website");
    if (me.role !== "admin") throw new Problem("Only an admin can run the import.");
    const back = (n: number) => dubaiDay(new Date(Date.now() - n * 86400_000));
    const rows = await importSearch(back(8), back(1)).catch((e: Error) => {
      throw new Problem(e.message);
    });
    revalidatePath("/website", "layout");
    return { rows };
  });
}

// ---------- Store (S.3) ----------

const storeSchema = z.object({
  markupPercent: z.number().min(0, "The markup cannot be negative").max(200),
  payments: z.array(z.enum(PAYMENT_METHODS)).min(1, "Leave at least one way to pay"),
  bankDetails: text(1000),
  deliveryNote: text(300),
  mailUserId: z.number().int().positive().nullable(),
  notifyEmail: z.union([z.literal(""), z.email("Enter a valid email for new orders")]),
  webOrderOwnerId: z.number().int().positive().nullable(),
  returnDays: z.number().int().min(0, "Return days cannot be negative").max(365),
  delivery: z.object({
    fee: z.number().min(0, "The delivery charge cannot be negative").max(5000),
    freeAbove: z.number().min(0).max(1_000_000),
    emirateFees: z.record(z.enum(EMIRATES), z.number().min(0).max(5000)),
  }),
});

/** Markup, ways to pay, bank details and the store mailbox. Admins only; checkout picks it up straight away. */
export async function saveStoreAction(input: StoreSettings): Promise<Result<null>> {
  return attempt(async () => {
    const me = await assertApp("website");
    if (me.role !== "admin") throw new Problem("Only an admin can change the store settings.");
    const v = parseInput(storeSchema, input);
    if (v.payments.includes("bank") && !v.bankDetails.trim()) throw new Problem("Add the bank details, or switch Bank transfer off.");
    await saveStore(v, me.id);
    revalidatePath("/website/settings");
    return null;
  });
}
