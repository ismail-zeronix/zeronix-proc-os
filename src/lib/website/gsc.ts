import "server-only";
import { and, between, desc, eq, gte, sql } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { parseServiceAccount, signedAssertion, toSearchRows, type GscApiRow, type ServiceAccount } from "./gsc-core";
import { dubaiDay } from "./traffic";

/**
 * Google Search Console import (W.9). The service account key is stored encrypted in site_settings ("gsc"); the worker
 * imports the last days every morning, and the first connection backfills 16 months. Rows go to site_search_daily.
 */

const KEY = "gsc";
const S = siteSchema.siteSearchDaily;

export interface GscSettings {
  /** "sc-domain:zeronixtech.com" or "https://zeronixtech.com/". */
  property: string;
  clientEmail: string;
  credentials: string;
  lastImportAt: string | null;
  lastError: string;
  backfilled: boolean;
}

export async function getGsc(): Promise<GscSettings | null> {
  const [row] = await siteDb.select().from(siteSchema.siteSettings).where(eq(siteSchema.siteSettings.key, KEY));
  return (row?.value as unknown as GscSettings | undefined) ?? null;
}

async function putGsc(value: GscSettings, userId: number | null) {
  const v = value as unknown as Record<string, unknown>;
  await siteDb
    .insert(siteSchema.siteSettings)
    .values({ key: KEY, value: v, updatedBy: userId })
    .onConflictDoUpdate({ target: siteSchema.siteSettings.key, set: { value: v, updatedBy: userId, updatedAt: new Date() } });
}

/** Saves the property and, when given, a new key file (encrypted). An empty key keeps the one already saved. */
export async function saveGsc(property: string, keyJson: string, userId: number): Promise<GscSettings> {
  const cur = await getGsc();
  const p = property.trim();
  if (!/^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s]+\/)$/i.test(p)) throw new Error('Enter the property as "sc-domain:zeronixtech.com" or "https://zeronixtech.com/" (with the slash).');
  let clientEmail = cur?.clientEmail ?? "";
  let credentials = cur?.credentials ?? "";
  if (keyJson.trim()) {
    const sa = parseServiceAccount(keyJson);
    clientEmail = sa.client_email;
    credentials = encryptSecret(JSON.stringify(sa));
  }
  if (!credentials) throw new Error("Paste the service account key (JSON).");
  const next: GscSettings = { property: p, clientEmail, credentials, lastImportAt: cur?.property === p ? (cur?.lastImportAt ?? null) : null, lastError: "", backfilled: cur?.property === p ? Boolean(cur?.backfilled) : false };
  await putGsc(next, userId);
  return next;
}

async function accessToken(sa: ServiceAccount, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedAssertion(sa) }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google refused the key: ${data.error_description ?? res.status}`);
  return data.access_token;
}

/** One Search Analytics query, paged until Google has no more rows. */
async function query(token: string, property: string, start: string, end: string, fetchImpl: typeof fetch): Promise<GscApiRow[]> {
  const all: GscApiRow[] = [];
  for (let startRow = 0; ; startRow += 25_000) {
    const res = await fetchImpl(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["date", "page", "query", "country", "device"], rowLimit: 25_000, startRow, dataState: "final" }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await res.json().catch(() => ({}))) as { rows?: GscApiRow[]; error?: { message?: string } };
    if (!res.ok) throw new Error(res.status === 403 ? `The service account has no access to ${property}. Add its email (shown in Website › Settings) as a user of the property in Search Console.` : `Search Console said: ${data.error?.message ?? res.status}`);
    all.push(...(data.rows ?? []));
    if ((data.rows?.length ?? 0) < 25_000 || startRow > 500_000) return all;
  }
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Imports `from`..`to` (replacing those days). Returns the rows stored. */
export async function importSearch(from: string, to: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const cfg = await getGsc();
  if (!cfg?.credentials) throw new Error("Search Console is not connected.");
  const sa = JSON.parse(decryptSecret(cfg.credentials)) as ServiceAccount;
  try {
    const token = await accessToken(sa, fetchImpl);
    const rows = toSearchRows(await query(token, cfg.property, from, to, fetchImpl));
    await siteDb.transaction(async (tx) => {
      await tx.delete(S).where(between(S.day, from, to));
      for (let i = 0; i < rows.length; i += 2000) await tx.insert(S).values(rows.slice(i, i + 2000));
    });
    await putGsc({ ...cfg, lastImportAt: new Date().toISOString(), lastError: "" }, null);
    return rows.length;
  } catch (e) {
    await putGsc({ ...cfg, lastError: (e as Error).message.slice(0, 300) }, null);
    throw e;
  }
}

/** Worker: on first connection, 16 months a month at a time; then every day the last 4 days (Google lags ~2 days). */
export async function dailySearchImport(): Promise<number> {
  const cfg = await getGsc();
  if (!cfg?.credentials) return 0;
  const today = dubaiDay();
  let n = 0;
  if (!cfg.backfilled) {
    for (let end = addDays(today, -1); end > addDays(today, -486); end = addDays(end, -30)) n += await importSearch(addDays(end, -29), end);
    const after = await getGsc();
    if (after) await putGsc({ ...after, backfilled: true }, null);
    return n;
  }
  return importSearch(addDays(today, -4), addDays(today, -1));
}

/** Test button: a 7-day query without storing anything. */
export async function testGsc(fetchImpl: typeof fetch = fetch): Promise<{ rows: number; clicks: number }> {
  const cfg = await getGsc();
  if (!cfg?.credentials) throw new Error("Save the property and key first.");
  const sa = JSON.parse(decryptSecret(cfg.credentials)) as ServiceAccount;
  const today = dubaiDay();
  const rows = await query(await accessToken(sa, fetchImpl), cfg.property, addDays(today, -9), addDays(today, -3), fetchImpl);
  return { rows: rows.length, clicks: rows.reduce((s, r) => s + r.clicks, 0) };
}

// ---------- reading ----------

/** Totals per day, the top queries and the average position, for the Overview. */
export async function searchOverview(from: string, to: string) {
  const [daily, top, totals] = await Promise.all([
    siteDb
      .select({ day: S.day, clicks: sql<number>`sum(${S.clicks})::int`, impressions: sql<number>`sum(${S.impressions})::int` })
      .from(S)
      .where(between(S.day, from, to))
      .groupBy(S.day),
    siteDb
      .select({ query: S.query, clicks: sql<number>`sum(${S.clicks})::int`, impressions: sql<number>`sum(${S.impressions})::int`, position: sql<number>`(sum(${S.position} * ${S.impressions}) / nullif(sum(${S.impressions}), 0))::real` })
      .from(S)
      .where(between(S.day, from, to))
      .groupBy(S.query)
      .orderBy(desc(sql`2`), desc(sql`3`))
      .limit(10),
    siteDb
      .select({ clicks: sql<number>`coalesce(sum(${S.clicks}), 0)::int`, impressions: sql<number>`coalesce(sum(${S.impressions}), 0)::int`, position: sql<number>`(sum(${S.position} * ${S.impressions}) / nullif(sum(${S.impressions}), 0))::real` })
      .from(S)
      .where(between(S.day, from, to)),
  ]);
  return { daily, top, totals: totals[0] };
}

/** Last 28 days per query: average position, clicks and impressions (SEO page, keyword positions and opportunities). */
export async function queryStats(since = dubaiDay(new Date(Date.now() - 28 * 86400_000))) {
  return siteDb
    .select({
      query: S.query,
      page: sql<string>`(array_agg(${S.page} order by ${S.impressions} desc))[1]`,
      clicks: sql<number>`sum(${S.clicks})::int`,
      impressions: sql<number>`sum(${S.impressions})::int`,
      position: sql<number>`(sum(${S.position} * ${S.impressions}) / nullif(sum(${S.impressions}), 0))::real`,
    })
    .from(S)
    .where(gte(S.day, since))
    .groupBy(S.query);
}

/** Last 28 days per page: clicks, impressions and click-through rate (pages that need a better title). */
export async function pageStats(since = dubaiDay(new Date(Date.now() - 28 * 86400_000))) {
  return siteDb
    .select({ page: S.page, clicks: sql<number>`sum(${S.clicks})::int`, impressions: sql<number>`sum(${S.impressions})::int` })
    .from(S)
    .where(gte(S.day, since))
    .groupBy(S.page);
}

/** One page's queries (post editor). */
export async function queriesForPage(path: string, since = dubaiDay(new Date(Date.now() - 90 * 86400_000))) {
  return siteDb
    .select({ query: S.query, clicks: sql<number>`sum(${S.clicks})::int`, impressions: sql<number>`sum(${S.impressions})::int`, position: sql<number>`(sum(${S.position} * ${S.impressions}) / nullif(sum(${S.impressions}), 0))::real` })
    .from(S)
    .where(and(eq(S.page, path), gte(S.day, since)))
    .groupBy(S.query)
    .orderBy(desc(sql`3`))
    .limit(20);
}
