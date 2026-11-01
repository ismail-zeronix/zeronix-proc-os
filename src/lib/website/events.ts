import "server-only";
import { eq } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { describeDevice } from "@/lib/webchat/device";
import { locateIp } from "@/lib/webchat/geo";
import { classifySource, dubaiDay, eventSchema, isBot, pageOf, visitorKeyFor, type SiteEventInput } from "./traffic";

/**
 * Tracker events from the public site (website/src/components/analytics/tracker.tsx → site /api/t → /api/site/events).
 * No cookies and no IP stored: a visitor is a daily-rotating keyed hash, a session is the tab's own random id.
 */

export interface VisitorMeta {
  ip: string;
  ua: string;
  /** The site's host (zeronixtech.com), so our own pages never count as a referrer. */
  host: string;
}

type Ids = { posts: Map<string, number>; products: Map<string, number>; industries: Map<string, number> };
const g = globalThis as unknown as { siteEventIds?: { at: number; ids: Ids } };

/** Slug → id for posts, products and industries, refreshed every 5 minutes. */
async function ids(): Promise<Ids> {
  if (g.siteEventIds && Date.now() - g.siteEventIds.at < 5 * 60_000) return g.siteEventIds.ids;
  const [posts, products, industries] = await Promise.all([
    siteDb.select({ id: siteSchema.sitePosts.id, slug: siteSchema.sitePosts.slug }).from(siteSchema.sitePosts).where(eq(siteSchema.sitePosts.status, "published")),
    siteDb.select({ id: siteSchema.siteProducts.id, slug: siteSchema.siteProducts.slug }).from(siteSchema.siteProducts),
    siteDb.select({ id: siteSchema.siteIndustries.id, slug: siteSchema.siteIndustries.slug }).from(siteSchema.siteIndustries),
  ]);
  const map = (rows: { id: number; slug: string }[]) => new Map(rows.map((r) => [r.slug, r.id]));
  const value = { posts: map(posts), products: map(products), industries: map(industries) };
  g.siteEventIds = { at: Date.now(), ids: value };
  return value;
}

/** Stores the valid events of one beacon; anything malformed is dropped. Returns how many were kept. */
export async function ingestEvents(raw: unknown[], meta: VisitorMeta): Promise<number> {
  if (isBot(meta.ua)) return 0;
  const events = raw.flatMap((e) => {
    const r = eventSchema.safeParse(e);
    return r.success ? [r.data] : [];
  });
  if (!events.length) return 0;

  const secret = process.env.AUTH_SECRET || process.env.SITE_API_KEY || "zeronix-site";
  const visitorKey = visitorKeyFor(meta.ip, meta.ua, dubaiDay(), secret);
  const device = describeDevice(meta.ua).type;
  const lookup = await ids();
  // the country only matters for page views; the lookup is cached per IP for a day
  const country = events.some((e) => e.type === "pageview") ? ((await locateIp(meta.ip).catch(() => null))?.country ?? "") : "";

  const rows = events.map((e: SiteEventInput) => {
    const page = pageOf(e.path);
    return {
      type: e.type,
      path: e.path.slice(0, 300),
      postId: page.kind === "post" ? (lookup.posts.get(page.slug) ?? null) : null,
      productId: page.kind === "product" ? (lookup.products.get(page.slug) ?? null) : null,
      industryId: page.kind === "industry" ? (lookup.industries.get(page.slug) ?? null) : null,
      visitorKey,
      sessionKey: e.sid,
      referrer: e.type === "pageview" ? (e.ref ?? "").slice(0, 500) : "",
      source: e.type === "pageview" ? classifySource(e.ref, e.utm, meta.host) : "",
      utm: e.utm && Object.keys(e.utm).length ? e.utm : null,
      country: e.type === "pageview" ? country : "",
      device,
      target: e.target ?? (e.scroll !== undefined ? `scroll:${e.scroll}` : ""),
      value: e.value ?? e.scroll ?? null,
    };
  });
  await siteDb.insert(siteSchema.siteEvents).values(rows);
  return rows.length;
}
