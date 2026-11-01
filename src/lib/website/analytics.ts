import "server-only";
import { and, between, count, desc, eq, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { siteDb, siteSchema } from "@/db/site";
import { dubaiDay, SOURCE_LABEL, type TrafficSource } from "./traffic";

/**
 * Website analytics (WEBSITE-PLAN.md section 8): the worker rolls raw tracker events up into site_daily, and the
 * Overview and Analytics pages read the rollups. Chats and CRM deals come from the ZeronixOS database, read-only.
 */

const D = siteSchema.siteDaily;
const E = siteSchema.siteEvents;

// ---------- rollups ----------

/**
 * Rebuilds site_daily for UAE days `from`..`to` (YYYY-MM-DD). Every row is a (day, path, source, metric) count; path
 * "*" and source "*" are the totals, so unique visitors and sessions are counted exactly at every level.
 * - Per page: views, visitors, sessions, engaged seconds, call-to-action clicks, chats, quotes, outbound clicks.
 * - Per landing page (the first page of a session): entrances, sessions that clicked a call to action, sessions that
 *   became a lead (chat lead or quote). This is what credits a guide with the lead it brought in.
 * A session's source is the source of its first page view.
 */
export async function rebuildDaily(from: string, to: string): Promise<number> {
  return siteDb.transaction(async (tx) => {
    await tx.delete(D).where(between(D.day, from, to));
    const res = await tx.execute(sql`
      with ev as (
        select e.type, e.path, e.session_key, e.visitor_key, e.value,
          (e.at at time zone 'Asia/Dubai')::date as day,
          coalesce(nullif(first_value(e.source) over w, ''), 'direct') as ssource,
          first_value(e.path) over w as landing
        from site_events e
        where e.at >= (${from}::date)::timestamp at time zone 'Asia/Dubai'
          and e.at < ((${to}::date + 1)::timestamp at time zone 'Asia/Dubai')
        window w as (partition by e.session_key order by (e.type <> 'pageview'), e.at)
      ),
      sess as (
        select session_key, bool_or(type = 'cta_click') as cta, bool_or(type in ('chat_lead', 'quote_submit')) as lead
        from ev group by session_key
      ),
      pages as (
        select day, coalesce(path, '*') as path, coalesce(ssource, '*') as source,
          count(*) filter (where type = 'pageview') as views,
          count(distinct visitor_key) filter (where type = 'pageview') as visitors,
          count(distinct session_key) filter (where type = 'pageview') as sessions,
          coalesce(sum(value) filter (where type = 'engaged'), 0) as engaged_s,
          count(*) filter (where type = 'cta_click') as cta,
          count(distinct session_key) filter (where type = 'cta_click') as cta_sessions,
          count(*) filter (where type = 'chat_open') as chat_open,
          count(*) filter (where type = 'chat_lead') as chat_lead,
          count(*) filter (where type = 'quote_submit') as quote,
          count(distinct session_key) filter (where type in ('chat_lead', 'quote_submit')) as lead_sessions,
          count(*) filter (where type = 'outbound') as outbound
        from ev
        group by grouping sets ((day, path, ssource), (day, path), (day, ssource), (day))
      ),
      landings as (
        select ev.day, ev.path, ev.ssource,
          count(distinct ev.session_key) as entrances,
          count(distinct ev.session_key) filter (where s.cta) as landing_cta,
          count(distinct ev.session_key) filter (where s.lead) as landing_leads
        from ev join sess s using (session_key)
        where ev.type = 'pageview' and ev.path = ev.landing
        group by grouping sets ((ev.day, ev.path, ev.ssource), (ev.day, ev.path))
      ),
      rows as (
        select p.day, p.path, p.source, m.metric, m.value
        from pages p
        cross join lateral (values
          ('views', p.views), ('visitors', p.visitors), ('sessions', p.sessions), ('engaged_s', p.engaged_s),
          ('cta', p.cta), ('cta_sessions', p.cta_sessions), ('chat_open', p.chat_open), ('chat_lead', p.chat_lead),
          ('quote', p.quote), ('lead_sessions', p.lead_sessions), ('outbound', p.outbound)
        ) as m(metric, value)
        union all
        select l.day, l.path, coalesce(l.ssource, '*'), m.metric, m.value
        from landings l
        cross join lateral (values ('entrances', l.entrances), ('landing_cta', l.landing_cta), ('landing_leads', l.landing_leads)) as m(metric, value)
      )
      insert into site_daily (day, path, source, metric, value)
      select day, path, source, metric, value::int from rows where value > 0
    `);
    return res.rowCount ?? 0;
  });
}

/** Raw events are kept 13 months (WEBSITE-PLAN.md section 5); the daily rollups stay. */
export async function pruneEvents(): Promise<number> {
  const res = await siteDb.delete(E).where(lt(E.at, sql`now() - interval '13 months'`));
  return res.rowCount ?? 0;
}

// ---------- reading ----------

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export interface Period {
  from: string;
  to: string;
  days: string[];
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** The last `days` UAE days up to today, and the same length just before it (for the change figures). */
export function periods(days: number, today = dubaiDay()): { cur: Period; prev: Period } {
  const mk = (to: string): Period => {
    const from = addDays(to, -(days - 1));
    return { from, to, days: Array.from({ length: days }, (_, i) => addDays(from, i)) };
  };
  const cur = mk(today);
  return { cur, prev: mk(addDays(cur.from, -1)) };
}

/** Timestamps bounding a period in UAE time (for tables that store a timestamp, not a day). */
function bounds(p: Period): [Date, Date] {
  return [new Date(`${p.from}T00:00:00+04:00`), new Date(Date.parse(`${p.to}T00:00:00+04:00`) + 86400_000)];
}

export type Totals = Record<string, number>;

async function totals(p: Period): Promise<Totals> {
  const rows = await siteDb
    .select({ metric: D.metric, n: sql<number>`sum(${D.value})::int` })
    .from(D)
    .where(and(between(D.day, p.from, p.to), eq(D.path, "*"), eq(D.source, "*")))
    .groupBy(D.metric);
  return Object.fromEntries(rows.map((r) => [r.metric, r.n]));
}

async function trend(p: Period, metrics: string[]) {
  const rows = await siteDb
    .select({ day: D.day, metric: D.metric, n: sql<number>`sum(${D.value})::int` })
    .from(D)
    .where(and(between(D.day, p.from, p.to), eq(D.path, "*"), eq(D.source, "*"), inArray(D.metric, metrics)))
    .groupBy(D.day, D.metric);
  return p.days.map((day) => {
    const point: Record<string, number | string> = { day };
    for (const m of metrics) point[m] = rows.find((r) => r.day === day && r.metric === m)?.n ?? 0;
    return point;
  });
}

async function sources(p: Period) {
  const rows = await siteDb
    .select({ source: D.source, metric: D.metric, n: sql<number>`sum(${D.value})::int` })
    .from(D)
    .where(and(between(D.day, p.from, p.to), eq(D.path, "*"), ne(D.source, "*"), inArray(D.metric, ["sessions", "lead_sessions"])))
    .groupBy(D.source, D.metric);
  const keys = [...new Set(rows.map((r) => r.source))];
  return keys
    .map((source) => ({
      source,
      label: SOURCE_LABEL[source as TrafficSource] ?? source,
      sessions: rows.find((r) => r.source === source && r.metric === "sessions")?.n ?? 0,
      leads: rows.find((r) => r.source === source && r.metric === "lead_sessions")?.n ?? 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

export interface PageRow {
  path: string;
  title: string;
  views: number;
  visitors: number;
  engagedAvg: number;
  cta: number;
  entrances: number;
  leads: number;
}

/** Pages by views, with the leads of sessions that started on them. */
export async function topPages(p: Period, limit = 15, source = "*"): Promise<PageRow[]> {
  const rows = await siteDb
    .select({ path: D.path, metric: D.metric, n: sql<number>`sum(${D.value})::int` })
    .from(D)
    .where(and(between(D.day, p.from, p.to), ne(D.path, "*"), eq(D.source, source), inArray(D.metric, ["views", "visitors", "engaged_s", "cta", "entrances", "landing_leads"])))
    .groupBy(D.path, D.metric);
  const by = new Map<string, Record<string, number>>();
  for (const r of rows) by.set(r.path, { ...(by.get(r.path) ?? {}), [r.metric]: r.n });
  const list = [...by.entries()]
    .map(([path, m]) => ({
      path,
      title: path,
      views: m.views ?? 0,
      visitors: m.visitors ?? 0,
      engagedAvg: m.views ? Math.round((m.engaged_s ?? 0) / m.views) : 0,
      cta: m.cta ?? 0,
      entrances: m.entrances ?? 0,
      leads: m.landing_leads ?? 0,
    }))
    .sort((a, b) => b.views - a.views || b.leads - a.leads)
    .slice(0, limit);
  const titles = await pageTitles(list.map((r) => r.path));
  return list.map((r) => ({ ...r, title: titles.get(r.path) ?? r.path }));
}

/** Readable names for site paths: post titles, product and industry names. */
export async function pageTitles(paths: string[]): Promise<Map<string, string>> {
  const slugs = (re: RegExp) => paths.flatMap((p) => p.match(re)?.[1] ?? []);
  const postSlugs = [...slugs(/^\/(?:guides|blog)\/([^/]+)$/), ...slugs(/^\/([^/]+)$/)];
  const productSlugs = slugs(/^\/products\/[^/]+\/([^/]+)$/);
  const industrySlugs = slugs(/^\/industries\/([^/]+)$/);
  const categorySlugs = slugs(/^\/products\/([^/]+)$/);
  const [posts, products, industries, categories] = await Promise.all([
    postSlugs.length ? siteDb.select({ slug: siteSchema.sitePosts.slug, name: siteSchema.sitePosts.title }).from(siteSchema.sitePosts).where(inArray(siteSchema.sitePosts.slug, postSlugs)) : [],
    productSlugs.length ? siteDb.select({ slug: siteSchema.siteProducts.slug, name: siteSchema.siteProducts.name }).from(siteSchema.siteProducts).where(inArray(siteSchema.siteProducts.slug, productSlugs)) : [],
    industrySlugs.length ? siteDb.select({ slug: siteSchema.siteIndustries.slug, name: siteSchema.siteIndustries.name }).from(siteSchema.siteIndustries).where(inArray(siteSchema.siteIndustries.slug, industrySlugs)) : [],
    categorySlugs.length ? siteDb.select({ slug: siteSchema.siteCategories.slug, name: siteSchema.siteCategories.name }).from(siteSchema.siteCategories).where(inArray(siteSchema.siteCategories.slug, categorySlugs)) : [],
  ]);
  const fixed: Record<string, string> = { "/": "Home", "/industries": "Industries", "/products": "Products", "/guides": "Guides", "/blog": "Blog", "/quote": "Quote form" };
  const out = new Map<string, string>();
  for (const path of paths) {
    const slug = path.split("/").pop() ?? "";
    const name =
      fixed[path] ??
      (/^\/products\/[^/]+$/.test(path) ? categories.find((x) => x.slug === slug)?.name : path.startsWith("/products/") ? products.find((x) => x.slug === slug)?.name : path.startsWith("/industries/") ? industries.find((x) => x.slug === slug)?.name : posts.find((x) => x.slug === slug)?.name);
    if (name) out.set(path, name);
  }
  return out;
}

/** Page views by device type and by country, straight from the raw events (both are small lists). */
async function audience(p: Period) {
  const [start, end] = bounds(p);
  const where = and(eq(E.type, "pageview"), gte(E.at, start), lt(E.at, end));
  const [devices, countries] = await Promise.all([
    siteDb.select({ key: E.device, n: sql<number>`count(distinct ${E.sessionKey})::int` }).from(E).where(where).groupBy(E.device).orderBy(desc(sql`2`)),
    siteDb.select({ key: E.country, n: sql<number>`count(distinct ${E.sessionKey})::int` }).from(E).where(where).groupBy(E.country).orderBy(desc(sql`2`)).limit(8),
  ]);
  return { devices: devices.map((d) => ({ label: d.key || "Unknown", value: d.n })), countries: countries.map((c) => ({ label: c.key || "Unknown", value: c.n })) };
}

/** Quote requests in the period, by industry, and what became of them in the CRM. */
async function quoteLeads(p: Period) {
  const [start, end] = bounds(p);
  const Q = siteSchema.siteQuoteRequests;
  const rows = await siteDb
    .select({ industry: Q.industry, status: Q.status, dealId: Q.dealId })
    .from(Q)
    .where(and(gte(Q.createdAt, start), lt(Q.createdAt, end), ne(Q.status, "spam")));
  const names = new Map((await siteDb.select({ slug: siteSchema.siteIndustries.slug, name: siteSchema.siteIndustries.name }).from(siteSchema.siteIndustries)).map((r) => [r.slug, r.name]));
  return { rows, names };
}

/** Website chats per site in the period (ZeronixOS database), and the CRM leads saved from them. */
async function chats(p: Period) {
  const [start, end] = bounds(p);
  const C = schema.webChats;
  const rows = await db
    .select({ site: C.site, n: count(), leads: sql<number>`count(${C.leadAt})::int`, dealIds: sql<number[]>`coalesce(array_agg(${C.dealId}) filter (where ${C.dealId} is not null), '{}')` })
    .from(C)
    .where(and(gte(C.createdAt, start), lt(C.createdAt, end)))
    .groupBy(C.site);
  return rows.map((r) => ({ site: r.site || "zeronix.ae", chats: r.n, leads: r.leads, dealIds: r.dealIds }));
}

async function dealStages(ids: number[]) {
  if (!ids.length) return { created: 0, won: 0, wonValue: 0 };
  const rows = await db.select({ stage: schema.deals.stage, value: schema.deals.valueAed }).from(schema.deals).where(inArray(schema.deals.id, ids));
  const won = rows.filter((r) => r.stage === "won");
  return { created: rows.length, won: won.length, wonValue: won.reduce((s, r) => s + (r.value ?? 0), 0) };
}

/** Posts published per week over the last 12 weeks, for the publishing pace chart. */
async function publishing() {
  const P = siteSchema.sitePosts;
  const rows = await siteDb
    .select({ week: sql<string>`to_char(date_trunc('week', ${P.publishedAt} at time zone 'Asia/Dubai'), 'YYYY-MM-DD')`, n: count() })
    .from(P)
    .where(and(eq(P.status, "published"), isNotNull(P.publishedAt), gte(P.publishedAt, sql`now() - interval '12 weeks'`), ne(P.type, "page")))
    .groupBy(sql`1`);
  const monday = (d: Date) => {
    const x = new Date(d.getTime() + 4 * 3600_000);
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  const thisWeek = monday(new Date());
  return Array.from({ length: 12 }, (_, i) => {
    const week = addDays(thisWeek, -7 * (11 - i));
    return { week, posts: rows.find((r) => r.week === week)?.n ?? 0 };
  });
}

/** The newest quote requests with what brought each one in. */
async function recentLeads() {
  const Q = siteSchema.siteQuoteRequests;
  const rows = await siteDb
    .select({ id: Q.id, name: Q.name, company: Q.company, industry: Q.industry, landingPath: Q.landingPath, source: Q.source, sourcePage: Q.sourcePage, status: Q.status, dealId: Q.dealId, createdAt: Q.createdAt })
    .from(Q)
    .where(ne(Q.status, "spam"))
    .orderBy(desc(Q.createdAt))
    .limit(8);
  const titles = await pageTitles(rows.map((r) => r.landingPath).filter(Boolean));
  return rows.map((r) => ({ ...r, landingTitle: r.landingPath ? (titles.get(r.landingPath) ?? r.landingPath) : "", sourceLabel: SOURCE_LABEL[r.source as TrafficSource] ?? "" }));
}

/** This site's host as web_chats.site records it (zeronixtech.com; localhost:3300 in local dev). */
export function siteHost(): string {
  try {
    return new URL(process.env.SITE_PUBLIC_URL || "https://zeronixtech.com").host.replace(/^www./, "");
  } catch {
    return "zeronixtech.com";
  }
}

/** Everything the Overview shows for the last `days` days. */
export async function overview(days: number) {
  const { cur, prev } = periods(days);
  const [now, before, daily, src, pages, aud, quotes, quotesBefore, chatRows, chatRowsBefore, pace, recent] = await Promise.all([
    totals(cur),
    totals(prev),
    trend(cur, ["visitors", "views", "cta", "chat_lead", "quote"]),
    sources(cur),
    topPages(cur, 10),
    audience(cur),
    quoteLeads(cur),
    quoteLeads(prev),
    chats(cur),
    chats(prev),
    publishing(),
    recentLeads(),
  ]);
  const host = siteHost();
  const siteChats = (rows: typeof chatRows) => rows.find((r) => r.site === host) ?? { site: host, chats: 0, leads: 0, dealIds: [] as number[] };
  const dealIds = [...quotes.rows.flatMap((r) => (r.dealId ? [r.dealId] : [])), ...siteChats(chatRows).dealIds];
  const deals = await dealStages(dealIds);

  const leadsNow = quotes.rows.length + siteChats(chatRows).leads;
  const leadsBefore = quotesBefore.rows.length + siteChats(chatRowsBefore).leads;
  const byIndustry = new Map<string, number>();
  for (const r of quotes.rows) {
    const name = r.industry ? (quotes.names.get(r.industry) ?? r.industry) : "Not given";
    byIndustry.set(name, (byIndustry.get(name) ?? 0) + 1);
  }

  return {
    period: cur,
    totals: { now, before },
    leads: { now: leadsNow, before: leadsBefore, quotes: quotes.rows.length, quotesBefore: quotesBefore.rows.length, chats: siteChats(chatRows).leads },
    deals,
    funnel: [
      { label: "Sessions", value: now.sessions ?? 0 },
      { label: "Clicked a call to action", value: now.cta_sessions ?? 0 },
      { label: "Chat or quote", value: leadsNow },
      { label: "CRM deal", value: deals.created },
      { label: "Won", value: deals.won },
    ],
    daily,
    sources: src,
    pages,
    devices: aud.devices,
    countries: aud.countries,
    industries: [...byIndustry.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    chatsBySite: chatRows.map((r) => ({ label: r.site, value: r.chats })).sort((a, b) => b.value - a.value),
    publishing: pace,
    recent,
  };
}
export type Overview = Awaited<ReturnType<typeof overview>>;

/** One page over the last `days` days (post editor): views, visitors, time, clicks and the leads it started. */
export async function pageReport(path: string, days = 90) {
  const { cur } = periods(days);
  const rows = await siteDb
    .select({ metric: D.metric, n: sql<number>`sum(${D.value})::int` })
    .from(D)
    .where(and(between(D.day, cur.from, cur.to), eq(D.path, path), eq(D.source, "*")))
    .groupBy(D.metric);
  const m = Object.fromEntries(rows.map((r) => [r.metric, r.n])) as Record<string, number>;
  const views = m.views ?? 0;
  return { days, views, visitors: m.visitors ?? 0, engagedAvg: views ? Math.round((m.engaged_s ?? 0) / views) : 0, cta: m.cta ?? 0, entrances: m.entrances ?? 0, leads: m.landing_leads ?? 0 };
}
