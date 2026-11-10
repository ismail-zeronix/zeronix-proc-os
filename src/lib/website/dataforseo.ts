import "server-only";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  addSpend,
  budgetAllows,
  chunk,
  cleanKeyword,
  costOf,
  DFS_BASE,
  DFS_DEFAULTS,
  difficultyBody,
  gapRows,
  hostOf,
  mondayOf,
  monthOf,
  parseDifficulty,
  parseRanked,
  parseSerp,
  parseVolumes,
  rankedBody,
  serpBody,
  shareOfTop,
  spentIn,
  taskResult,
  volumeBody,
  type DfsGapRow,
  type DfsKind,
  type DfsResponse,
  type DfsSettings,
} from "./dataforseo-core";
import { dubaiDay } from "./traffic";

/**
 * DataForSEO calls for Website › SEO (pure parts in dataforseo-core.ts). The login is stored encrypted in site_settings
 * ("dataforseo"). Every call first checks the month's budget and afterwards adds what it really cost, so the monthly
 * cap in Website › Settings holds whatever DataForSEO's prices are. Nothing here runs unless an admin saved a login.
 */

const KEY = "dataforseo";
const K = siteSchema.siteKeywords;
const R = siteSchema.siteKeywordRanks;
/** Ranking checks per run at most (one call each), so a large plan cannot empty the budget in one go. */
const MAX_RANK_CHECKS = 200;

export const ourHost = () => hostOf(process.env.SITE_PUBLIC_URL || "https://zeronixtech.com");

export async function getDfs(): Promise<DfsSettings | null> {
  const [row] = await siteDb.select().from(siteSchema.siteSettings).where(eq(siteSchema.siteSettings.key, KEY));
  if (!row) return null;
  const v = row.value as Partial<DfsSettings>;
  return { ...DFS_DEFAULTS, ...v, spend: { ...DFS_DEFAULTS.spend, ...v.spend } };
}

async function putDfs(value: DfsSettings, userId: number | null) {
  const v = value as unknown as Record<string, unknown>;
  await siteDb
    .insert(siteSchema.siteSettings)
    .values({ key: KEY, value: v, updatedBy: userId })
    .onConflictDoUpdate({ target: siteSchema.siteSettings.key, set: { value: v, updatedBy: userId, updatedAt: new Date() } });
}

/** Saves the login (a blank password keeps the saved one), the monthly budget and the competitor list. */
export async function saveDfs(input: { login: string; password: string; budgetUsd: number; competitors: string[] }, userId: number): Promise<DfsSettings> {
  const cur = (await getDfs()) ?? DFS_DEFAULTS;
  const password = input.password.trim() ? encryptSecret(input.password.trim()) : cur.password;
  if (!input.login.trim() || !password) throw new Error("Enter the DataForSEO API login and password (dataforseo.com › API Access).");
  const next: DfsSettings = { ...cur, login: input.login.trim(), password, budgetUsd: input.budgetUsd, competitors: input.competitors, lastError: "" };
  await putDfs(next, userId);
  return next;
}

/** One call: budget check, POST (or GET), real cost added to the month. Errors are kept for the settings page. */
async function call(kind: DfsKind, path: string, body: unknown, fetchImpl: typeof fetch = fetch): Promise<DfsResponse> {
  const s = await getDfs();
  if (!s?.login || !s.password) throw new Error("Connect DataForSEO first (Website › Settings).");
  const month = monthOf(dubaiDay());
  if (!budgetAllows(s, month, kind)) throw new Error(`This month's DataForSEO budget is used up (USD ${spentIn(s, month).toFixed(2)} of ${s.budgetUsd.toFixed(2)}). Raise it in Website › Settings.`);
  const auth = Buffer.from(`${s.login}:${decryptSecret(s.password)}`).toString("base64");
  let res: DfsResponse;
  try {
    const r = await fetchImpl(`${DFS_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    res = (await r.json().catch(() => ({ status_code: r.status, status_message: r.statusText }))) as DfsResponse;
    if (r.status === 401) throw new Error("DataForSEO refused the login. Check the API login and password (not your website password).");
  } catch (e) {
    await putDfs({ ...((await getDfs()) ?? s), lastError: (e as Error).message }, null);
    throw e;
  }
  // re-read before writing: a ranking run and a button press may overlap
  const fresh = (await getDfs()) ?? s;
  await putDfs({ ...fresh, spend: addSpend(fresh, month, costOf(res)), lastError: res.status_code === 20000 ? "" : (res.status_message ?? "") }, null);
  return res;
}

/** Test: the account balance (costs nothing). */
export async function testDfs(): Promise<{ balance: number | null }> {
  const res = await call("test", "/appendix/user_data", undefined);
  const money = (taskResult(res)[0] as { money?: { balance?: number } } | undefined)?.money;
  return { balance: typeof money?.balance === "number" ? money.balance : null };
}

/** Monthly UAE searches and difficulty (0–100) for every keyword in the plan that has none yet. */
export async function fillVolumes(): Promise<{ updated: number; asked: number }> {
  const rows = await siteDb.select({ id: K.id, keyword: K.keyword }).from(K).where(or(isNull(K.volume), isNull(K.difficulty)));
  const byClean = new Map<string, number[]>();
  for (const r of rows) {
    const c = cleanKeyword(r.keyword);
    if (c) byClean.set(c, [...(byClean.get(c) ?? []), r.id]);
  }
  const words = [...byClean.keys()];
  let updated = 0;
  for (const part of chunk(words, 1000)) {
    const volumes = parseVolumes(await call("volume", "/keywords_data/google_ads/search_volume/live", volumeBody(part)));
    const difficulty = parseDifficulty(await call("difficulty", "/dataforseo_labs/google/bulk_keyword_difficulty/live", difficultyBody(part)));
    for (const w of part) {
      const volume = volumes.find((v) => v.keyword === w)?.volume ?? 0; // Google Ads leaves out what nobody searches
      const kd = difficulty.get(w) ?? null;
      const ids = byClean.get(w) ?? [];
      await siteDb
        .update(K)
        .set({ volume, ...(kd !== null ? { difficulty: kd } : {}), updatedAt: new Date() })
        .where(and(inArray(K.id, ids), or(isNull(K.volume), isNull(K.difficulty))));
      updated += ids.length;
    }
  }
  return { updated, asked: words.length };
}

/** The keywords worth tracking: priority 1–2 or already live, most important first. */
async function trackedKeywords() {
  return siteDb
    .select({ id: K.id, keyword: K.keyword })
    .from(K)
    .where(or(lte(K.priority, 2), eq(K.status, "published")))
    .orderBy(K.priority, desc(K.volume))
    .limit(MAX_RANK_CHECKS);
}

/**
 * Google UAE positions for the tracked keywords today (one call each), kept in site_keyword_ranks. Stops cleanly when
 * the budget would be passed; the rest waits for next week.
 */
export async function checkRanks(): Promise<{ checked: number; stopped: boolean }> {
  const day = dubaiDay();
  const host = ourHost();
  let checked = 0;
  for (const k of await trackedKeywords()) {
    const s = await getDfs();
    if (!s || !budgetAllows(s, monthOf(day), "serp")) return { checked, stopped: true };
    const q = cleanKeyword(k.keyword);
    if (!q) continue;
    const r = parseSerp(await call("serp", "/serp/google/organic/live/regular", serpBody(q)), host);
    await siteDb
      .insert(R)
      .values({ keywordId: k.id, checkedOn: day, position: r.position, url: r.url, top: r.top })
      .onConflictDoUpdate({ target: [R.keywordId, R.checkedOn], set: { position: r.position, url: r.url, top: r.top, createdAt: new Date() } });
    checked++;
  }
  const s = await getDfs();
  if (s) await putDfs({ ...s, lastRankWeek: mondayOf(day) }, null);
  return { checked, stopped: false };
}

/** The worker's weekly run: Mondays (UAE) after 06:00, once a week, only when DataForSEO is connected. */
export async function weeklyRankCheck(): Promise<number> {
  const s = await getDfs();
  const day = dubaiDay();
  if (!s?.login || !s.password || !(s.budgetUsd > 0) || s.lastRankWeek === mondayOf(day)) return 0;
  // mark the week first: a failing run is not retried every minute (the error shows in Website › Settings)
  await putDfs({ ...s, lastRankWeek: mondayOf(day) }, null);
  return (await checkRanks()).checked;
}

/** Searches competitors rank for in the UAE (top 20) that we neither rank for nor plan; saved for the SEO page. */
export async function competitorGap(): Promise<DfsGapRow[]> {
  const s = await getDfs();
  if (!s?.competitors.length) throw new Error("Add competitor domains in Website › Settings › DataForSEO.");
  const host = ourHost();
  const mine = parseRanked(await call("ranked", "/dataforseo_labs/google/ranked_keywords/live", rankedBody(host, 1000)));
  const planned = await siteDb.select({ keyword: sql<string>`lower(${K.keyword})` }).from(K);
  const ours = new Set([...mine.map((m) => m.keyword), ...planned.map((p) => p.keyword)]);
  const byDomain = new Map<string, ReturnType<typeof parseRanked>>();
  for (const d of s.competitors) {
    const fresh = await getDfs();
    if (!fresh || !budgetAllows(fresh, monthOf(dubaiDay()), "ranked")) break;
    byDomain.set(d, parseRanked(await call("ranked", "/dataforseo_labs/google/ranked_keywords/live", rankedBody(d))));
  }
  const rows = gapRows(byDomain, ours);
  const latest = (await getDfs()) ?? s;
  await putDfs({ ...latest, gap: { at: new Date().toISOString(), rows } }, null);
  return rows;
}

/** Adds chosen gap searches to the plan as ideas (cluster "Competitor gap"); ones already planned are skipped. */
export async function addGapIdeas(keywords: string[]): Promise<number> {
  const s = await getDfs();
  const rows = (s?.gap?.rows ?? []).filter((r) => keywords.includes(r.keyword));
  if (!rows.length) return 0;
  const added = await siteDb
    .insert(K)
    .values(
      rows.map((r) => ({
        keyword: r.keyword,
        cluster: "Competitor gap",
        intent: "commercial" as const,
        priority: 2,
        volume: r.volume,
        source: "dataforseo" as const,
        status: "idea" as const,
        notes: `Ranked by ${r.competitors.map((c) => `${c.domain} #${c.position}`).join(", ")}`.slice(0, 500),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: K.id });
  return added.length;
}

export interface RankRow {
  keywordId: number;
  keyword: string;
  checkedOn: string;
  position: number | null;
  previous: number | null;
  url: string;
  top: { position: number; domain: string; url: string }[];
}

/** The latest check of every tracked keyword with the one before it, and how often each domain sits in the top ten. */
export async function rankOverview(): Promise<{ rows: RankRow[]; share: ReturnType<typeof shareOfTop>; lastDay: string | null }> {
  const rows = await siteDb
    .select({ keywordId: R.keywordId, keyword: K.keyword, checkedOn: R.checkedOn, position: R.position, url: R.url, top: R.top })
    .from(R)
    .innerJoin(K, eq(K.id, R.keywordId))
    .where(sql`${R.checkedOn} >= (current_date - interval '120 days')`)
    .orderBy(desc(R.checkedOn));
  // newest first: the first row of a keyword is its latest check, the second the one before (null = not in the top 30)
  const latest = new Map<number, RankRow>();
  const hasPrevious = new Set<number>();
  for (const r of rows) {
    const cur = latest.get(r.keywordId);
    if (!cur) latest.set(r.keywordId, { ...r, previous: null });
    else if (!hasPrevious.has(r.keywordId)) {
      cur.previous = r.position;
      hasPrevious.add(r.keywordId);
    }
  }
  const list = [...latest.values()];
  list.sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.keyword.localeCompare(b.keyword));
  return { rows: list, share: shareOfTop(list, ourHost()), lastDay: rows[0]?.checkedOn ?? null };
}
