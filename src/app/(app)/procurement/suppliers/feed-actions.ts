"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { assertSafeUrl } from "@/lib/feed/fetch";
import { syncFeed, type SyncResult } from "@/lib/feed/sync";
import { CURRENCIES } from "@/lib/fx";

const feedSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  url: z.string().trim().min(8, "Paste the feed link.").max(1000),
  intervalMinutes: z.coerce.number().int().min(5, "Check at most every 5 minutes.").max(60 * 24 * 7),
  currency: z.enum(CURRENCIES).default("USD"),
  enabled: z.boolean().default(true),
});

function refresh(supplierId: number) {
  revalidatePath(`/procurement/suppliers/${supplierId}`);
  revalidatePath("/procurement/suppliers");
  revalidatePath("/procurement/compare");
  revalidatePath("/procurement/price-lists");
  revalidatePath("/");
}

/** Saves the feed settings and reads the sheet straight away, so a wrong link shows up immediately. */
export async function saveFeed(input: z.input<typeof feedSchema>): Promise<SyncResult> {
  await requireAdmin();
  const data = feedSchema.parse(input);
  assertSafeUrl(data.url);

  const [existing] = await db.select().from(schema.supplierFeeds).where(eq(schema.supplierFeeds.supplierId, data.supplierId));
  const changedLink = !existing || existing.url !== data.url;
  const values = {
    url: data.url,
    currency: data.currency,
    intervalMinutes: data.intervalMinutes,
    enabled: data.enabled,
    // a new link must be read from scratch
    ...(changedLink ? { resolvedUrl: "", lastHash: "", lastStatus: "never" as const, lastMessage: "" } : {}),
  };
  if (existing) await db.update(schema.supplierFeeds).set(values).where(eq(schema.supplierFeeds.id, existing.id));
  else await db.insert(schema.supplierFeeds).values({ supplierId: data.supplierId, ...values });

  const result = await syncFeed(data.supplierId);
  refresh(data.supplierId);
  return result;
}

export async function syncFeedNow(supplierId: number): Promise<SyncResult> {
  await requireAdmin();
  const [feed] = await db.select().from(schema.supplierFeeds).where(eq(schema.supplierFeeds.supplierId, supplierId));
  if (!feed) throw new Error("This supplier has no live feed.");
  // after an error the same sheet may need to be applied again (e.g. the "sheet shrank" safety check)
  const result = await syncFeed(supplierId, { force: feed.lastStatus === "error" });
  refresh(supplierId);
  return result;
}

/** Stops syncing. The price lists already saved from the feed are kept. */
export async function removeFeed(supplierId: number) {
  await requireAdmin();
  await db.delete(schema.supplierFeeds).where(eq(schema.supplierFeeds.supplierId, supplierId));
  refresh(supplierId);
}
