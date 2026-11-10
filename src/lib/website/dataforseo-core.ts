/**
 * DataForSEO for Website › SEO (website/SEO-STRATEGY.md step 7): real UAE search volumes, a weekly Google ranking check
 * of the planned keywords, and the searches competitors rank for that we do not. This file is pure (request bodies,
 * response parsing, the spending guard) so tests/website-seo.test.ts covers it; dataforseo.ts does the calls.
 *
 * Docs: docs.dataforseo.com/v3 (serp/google/organic/live/regular, keywords_data/google_ads/search_volume/live,
 * dataforseo_labs/google/bulk_keyword_difficulty/live, dataforseo_labs/google/ranked_keywords/live, appendix/user_data).
 */

export const DFS_BASE = "https://api.dataforseo.com/v3";

/** Google results as seen from the United Arab Emirates (country code 2000 + ISO 784), in English. */
export const UAE = { location_code: 2784, language_code: "en" } as const;

/** How deep a ranking check reads Google: the top 30 covers page one plus the "almost there" band (positions 8–30). */
export const SERP_DEPTH = 30;

/**
 * Upper estimates per call in USD, used only to refuse a call that could push the month over the budget. What a call
 * really cost comes back in the response (`cost`) and is what gets added to the month's spending.
 */
export const ESTIMATE_USD = { volume: 0.1, difficulty: 0.05, serp: 0.006, ranked: 0.06, test: 0 } as const;
export type DfsKind = keyof typeof ESTIMATE_USD;

/** The UAE sellers of the same products (website/SEO-STRATEGY.md section 2); editable in Website › Settings. */
export const DEFAULT_COMPETITORS = ["uae.microless.com", "axhubs.com", "irix.ae", "lastbestprice.com", "promisestores.com", "costtocost.ae", "aldhahab.ae", "arabgamers.ae"];

export interface DfsGapRow {
  keyword: string;
  volume: number | null;
  /** Each competitor that ranks for it, best first. */
  competitors: { domain: string; position: number }[];
}

export interface DfsSettings {
  login: string;
  /** Encrypted (lib/crypto); never sent to the browser. */
  password: string;
  /** Monthly cap in USD; 0 = no calls at all. */
  budgetUsd: number;
  competitors: string[];
  /** Spending in the current calendar month (UAE), reset when the month changes. */
  spend: { month: string; usd: number };
  /** The Monday (UAE day) of the last weekly ranking check. */
  lastRankWeek: string | null;
  lastError: string;
  /** The last competitor-gap result, so the page shows it without paying for it again. */
  gap: { at: string; rows: DfsGapRow[] } | null;
}

export const DFS_DEFAULTS: DfsSettings = { login: "", password: "", budgetUsd: 10, competitors: DEFAULT_COMPETITORS, spend: { month: "", usd: 0 }, lastRankWeek: null, lastError: "", gap: null };

export const monthOf = (day: string) => day.slice(0, 7);

/** The Monday of the week a UAE day falls in ("2026-11-11" → "2026-11-09"). */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export const spentIn = (s: Pick<DfsSettings, "spend">, month: string) => (s.spend?.month === month ? s.spend.usd : 0);

/** Whether `calls` calls of this kind fit in what is left of the month's budget. */
export function budgetAllows(s: Pick<DfsSettings, "spend" | "budgetUsd">, month: string, kind: DfsKind, calls = 1): boolean {
  if (!(s.budgetUsd > 0)) return false;
  return spentIn(s, month) + ESTIMATE_USD[kind] * calls <= s.budgetUsd + 1e-9;
}

/** The month's spending after a call that cost `usd`. */
export function addSpend(s: Pick<DfsSettings, "spend">, month: string, usd: number): DfsSettings["spend"] {
  return { month, usd: Math.round((spentIn(s, month) + Math.max(0, usd || 0)) * 10000) / 10000 };
}

/** Google Ads takes keywords of at most 80 characters and 10 words, without symbols; null when nothing usable is left. */
export function cleanKeyword(k: string): string | null {
  const s = k
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.&'+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s.length > 80 || s.split(" ").length > 10) return null;
  return s;
}

/** "https://www.irix.ae/x" or "WWW.IRIX.AE" → "irix.ae". */
export function hostOf(u: string): string {
  const s = u.trim().toLowerCase();
  try {
    return new URL(s.includes("://") ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return s.replace(/^www\./, "");
  }
}

/** One domain per line or separated by spaces/commas, cleaned and without duplicates. */
export function parseDomains(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map(hostOf).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))].slice(0, 15);
}

export const chunk = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// ---------- request bodies ----------

export const volumeBody = (keywords: string[]) => [{ keywords, ...UAE }];
export const difficultyBody = (keywords: string[]) => [{ keywords, ...UAE }];
export const serpBody = (keyword: string) => [{ keyword, ...UAE, depth: SERP_DEPTH, device: "desktop" }];
export const rankedBody = (domain: string, limit = 500) => [
  { target: domain, ...UAE, limit, item_types: ["organic"], filters: [["ranked_serp_element.serp_item.rank_group", "<=", 20]], order_by: ["keyword_data.keyword_info.search_volume,desc"] },
];

// ---------- responses ----------

interface DfsTask {
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: unknown[] | null;
}
export interface DfsResponse {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: DfsTask[];
}

/** No-results answers that are not errors: "No Search Results", "No data". */
const EMPTY_OK = new Set([40102, 40401]);

/** The first task's result list; throws DataForSEO's own message when the call or the task failed. */
export function taskResult(res: DfsResponse): unknown[] {
  if (res.status_code !== 20000) throw new Error(`DataForSEO: ${res.status_message ?? "the request failed"} (${res.status_code ?? "?"})`);
  const t = res.tasks?.[0];
  if (!t) throw new Error("DataForSEO returned no task");
  if (t.status_code && EMPTY_OK.has(t.status_code)) return [];
  if (t.status_code !== 20000) throw new Error(`DataForSEO: ${t.status_message ?? "the task failed"} (${t.status_code ?? "?"})`);
  return Array.isArray(t.result) ? t.result : [];
}

export const costOf = (res: DfsResponse) => (typeof res.cost === "number" && Number.isFinite(res.cost) ? res.cost : 0);

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** search_volume/live: one row per keyword. */
export function parseVolumes(res: DfsResponse): { keyword: string; volume: number | null }[] {
  return taskResult(res).map((r) => ({ keyword: str(rec(r).keyword).toLowerCase(), volume: num(rec(r).search_volume) }));
}

/** bulk_keyword_difficulty/live: result[0].items, 0–100. */
export function parseDifficulty(res: DfsResponse): Map<string, number> {
  const items = (rec(taskResult(res)[0]).items as unknown[] | undefined) ?? [];
  const out = new Map<string, number>();
  for (const it of items) {
    const d = num(rec(it).keyword_difficulty);
    if (d !== null) out.set(str(rec(it).keyword).toLowerCase(), Math.round(d));
  }
  return out;
}

/** organic/live/regular: our best position (null = not in the top SERP_DEPTH) and the top ten domains. */
export function parseSerp(res: DfsResponse, ourHost: string): { position: number | null; url: string; top: { position: number; domain: string; url: string }[] } {
  const items = ((rec(taskResult(res)[0]).items as unknown[] | undefined) ?? []).map(rec).filter((i) => i.type === "organic");
  const rows = items.map((i) => ({ position: num(i.rank_group) ?? 0, domain: hostOf(str(i.domain) || str(i.url)), url: str(i.url) })).filter((r) => r.position > 0);
  const ours = hostOf(ourHost);
  const mine = rows.find((r) => r.domain === ours || r.domain.endsWith(`.${ours}`));
  return { position: mine?.position ?? null, url: mine?.url ?? "", top: rows.slice(0, 10) };
}

/** ranked_keywords/live: the searches one domain ranks for (keyword, monthly volume, position, page). */
export function parseRanked(res: DfsResponse): { keyword: string; volume: number | null; position: number; url: string }[] {
  const items = (rec(taskResult(res)[0]).items as unknown[] | undefined) ?? [];
  return items.flatMap((it) => {
    const kd = rec(rec(it).keyword_data);
    const serp = rec(rec(rec(it).ranked_serp_element).serp_item);
    const keyword = str(kd.keyword).toLowerCase();
    const position = num(serp.rank_group);
    if (!keyword || position === null) return [];
    return [{ keyword, volume: num(rec(kd.keyword_info).search_volume), position, url: str(serp.url) }];
  });
}

/**
 * The competitor gap: searches where at least one competitor is in Google's top 20 for the UAE and we are not (and
 * that are not in our plan yet), most searched first.
 */
export function gapRows(byDomain: Map<string, ReturnType<typeof parseRanked>>, ours: Set<string>, limit = 150): DfsGapRow[] {
  const rows = new Map<string, DfsGapRow>();
  for (const [domain, list] of byDomain)
    for (const r of list) {
      if (ours.has(r.keyword)) continue;
      const row = rows.get(r.keyword) ?? { keyword: r.keyword, volume: r.volume, competitors: [] };
      row.volume = row.volume ?? r.volume;
      if (!row.competitors.some((c) => c.domain === domain)) row.competitors.push({ domain, position: r.position });
      rows.set(r.keyword, row);
    }
  return [...rows.values()]
    .map((r) => ({ ...r, competitors: r.competitors.sort((a, b) => a.position - b.position) }))
    .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || b.competitors.length - a.competitors.length || a.keyword.localeCompare(b.keyword))
    .slice(0, limit);
}

/** "Who ranks above us": how often each domain is in the top ten of our tracked searches, most often first. */
export function shareOfTop(checks: { top: { domain: string }[] }[], ourHost: string): { domain: string; count: number; share: number }[] {
  const total = checks.length;
  if (!total) return [];
  const ours = hostOf(ourHost);
  const m = new Map<string, number>();
  for (const c of checks) for (const d of new Set(c.top.map((t) => t.domain))) m.set(d, (m.get(d) ?? 0) + 1);
  return [...m.entries()]
    .map(([domain, count]) => ({ domain: domain === ours ? `${domain} (us)` : domain, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}
