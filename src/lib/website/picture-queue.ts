import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { MAX_IMAGE_BYTES, saveSiteImageData } from "./catalog";
import { galleryLinks } from "./listing-import";
import type { SiteImage } from "./types";

/**
 * Pictures for products made by "Import listing": the worker reads each queued product's listing page, takes its
 * gallery pictures (galleryLinks) and saves them under our own file names, in order, the first as the main picture.
 * Slow on purpose: a few products a minute and a pause between downloads. When the shop blocks us (403/429) the queue
 * pauses for 30 minutes instead of trying to get around it.
 */

const Q = siteSchema.sitePictureQueue;
const P = siteSchema.siteProducts;
const PER_RUN = 3;
const GAP_MS = 1500;
const PAUSE_MS = 30 * 60_000;
const UA = "Mozilla/5.0 (compatible; ZeronixCatalog/1.0; +https://zeronixtech.com)";
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const g = globalThis as unknown as { __picturesBusy?: boolean; __picturesPausedUntil?: number };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Blocked extends Error {}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,image/*" }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 403 || res.status === 429) throw new Blocked(`the shop answered ${res.status}`);
  return res;
}

async function picturesFor(pageUrl: string, alt: string): Promise<SiteImage[]> {
  const page = await get(pageUrl);
  if (!page.ok) throw new Error(`product page answered ${page.status}`);
  const links = galleryLinks(await page.text());
  if (!links.length) throw new Error("no pictures found on the product page");
  const source = new URL(pageUrl).hostname;
  const images: SiteImage[] = [];
  for (const link of links) {
    await wait(GAP_MS);
    const res = await get(link);
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !TYPES[mime]) continue;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length < 1000 || data.length > MAX_IMAGE_BYTES) continue;
    images.push(await saveSiteImageData(data, mime, `${alt.slice(0, 80)} ${images.length + 1}.${TYPES[mime]}`, alt, null, source));
  }
  if (!images.length) throw new Error("none of the pictures could be downloaded");
  return images;
}

/** One run: up to PER_RUN queued products. Returns how many products got pictures. */
export async function runPictureQueue(): Promise<number> {
  if (g.__picturesBusy || (g.__picturesPausedUntil && g.__picturesPausedUntil > Date.now())) return 0;
  g.__picturesBusy = true;
  let done = 0;
  try {
    const rows = await siteDb
      .select({ productId: Q.productId, pageUrl: Q.pageUrl, name: P.name, images: P.images })
      .from(Q)
      .innerJoin(P, eq(P.id, Q.productId))
      .where(eq(Q.status, "queued"))
      .orderBy(asc(Q.updatedAt))
      .limit(PER_RUN);
    for (const row of rows) {
      // pictures added by hand meanwhile win: nothing is fetched
      if (row.images.length) {
        await siteDb.update(Q).set({ status: "done", pictures: 0, error: "had pictures already", updatedAt: new Date() }).where(eq(Q.productId, row.productId));
        continue;
      }
      try {
        const images = await picturesFor(row.pageUrl, row.name);
        await siteDb
          .update(P)
          .set({ images, updatedAt: new Date() })
          .where(and(eq(P.id, row.productId), sql`jsonb_array_length(${P.images}) = 0`));
        await siteDb.update(Q).set({ status: "done", pictures: images.length, error: "", updatedAt: new Date() }).where(eq(Q.productId, row.productId));
        done++;
      } catch (e) {
        if (e instanceof Blocked) {
          g.__picturesPausedUntil = Date.now() + PAUSE_MS;
          await siteDb.update(Q).set({ error: `Paused 30 minutes: ${e.message}`, updatedAt: new Date() }).where(eq(Q.productId, row.productId));
          break;
        }
        await siteDb.update(Q).set({ status: "failed", error: (e as Error).message.slice(0, 300), updatedAt: new Date() }).where(eq(Q.productId, row.productId));
      }
    }
  } finally {
    g.__picturesBusy = false;
  }
  return done;
}
