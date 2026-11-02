import { createHmac } from "node:crypto";
import { z } from "zod";

/**
 * The tracker's rules (WEBSITE-PLAN.md section 9), kept free of the database so they can be tested: which events
 * exist, what a valid one looks like, which visitors are bots, where a visit came from, and the visitor hash.
 */

export const EVENT_TYPES = ["pageview", "engaged", "cta_click", "outbound", "compare", "filter", "quote_submit", "chat_open", "chat_lead"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const short = (max: number) => z.string().trim().max(max);

export const utmSchema = z
  .object({ source: short(100), medium: short(100), campaign: short(150), term: short(150), content: short(150) })
  .partial()
  .strip();

export const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  /** Path only, never the query string (it can hold personal data). */
  path: short(300).regex(/^\/[^?#]*$/, "path"),
  /** Session id from the tab's sessionStorage (no cookie). */
  sid: short(40).regex(/^[a-z0-9-]{8,40}$/i, "sid"),
  /** document.referrer, sent on the first page of a session only. */
  ref: short(500).optional(),
  utm: utmSchema.optional(),
  /** The button or link (cta_click, outbound, filter...). */
  target: short(200).optional(),
  /** Seconds on page (engaged), scroll % ... */
  value: z.number().int().min(0).max(86_400).optional(),
  scroll: z.number().int().min(0).max(100).optional(),
});
export type SiteEventInput = z.infer<typeof eventSchema>;

export const batchSchema = z.object({ events: z.array(z.unknown()).min(1).max(20) });

/** Crawlers, uptime monitors, headless browsers and link previewers: kept out of the numbers. */
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|slack|headless|phantom|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|axios|node-fetch|okhttp|httpclient|scrapy|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|bytespider|gptbot|chatgpt-user|claudebot|perplexitybot|ccbot|applebot/i;

export function isBot(ua: string | null | undefined): boolean {
  return !ua || ua.length < 20 || BOT.test(ua);
}

export const SOURCES = ["google", "bing", "ai", "social", "email", "campaign", "referral", "direct"] as const;
export type TrafficSource = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<TrafficSource, string> = {
  google: "Google search",
  bing: "Bing and others",
  ai: "AI assistants",
  social: "Social",
  email: "Email",
  campaign: "Campaigns",
  referral: "Other websites",
  direct: "Direct",
};

const AI = /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|bard\.google\.com|claude\.ai|you\.com|phind\.com|poe\.com|deepseek\.com|meta\.ai|grok\.com)$/;
const SEARCH = /(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|yandex\.[a-z]+|ecosia\.org|brave\.com|baidu\.com|naver\.com|search\.[a-z.]+)$/;
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|t\.co|x\.com|twitter\.com|youtube\.com|tiktok\.com|reddit\.com|pinterest\.[a-z.]+|whatsapp\.com|wa\.me|snapchat\.com|threads\.net)$/;
const MAIL = /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com|mail\.zoho\.com|mail\.hostinger\.com)$/;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Where a visit came from: the utm tags win, then the referrer's site; no referrer (or our own site) is direct. */
export function classifySource(referrer: string | undefined, utm: SiteEventInput["utm"], ownHost: string): TrafficSource {
  const medium = (utm?.medium ?? "").toLowerCase();
  const source = (utm?.source ?? "").toLowerCase();
  if (medium || source) {
    if (/mail/.test(medium) || /mail|newsletter/.test(source)) return "email";
    if (/social/.test(medium) || /facebook|instagram|linkedin|twitter|tiktok|youtube|whatsapp/.test(source)) return "social";
    if (/chatgpt|openai|perplexity|copilot|gemini|claude/.test(source)) return "ai";
    return "campaign";
  }
  const host = hostOf(referrer ?? "");
  const own = ownHost.toLowerCase().replace(/^www\./, "");
  if (!host || (own && (host === own || host.endsWith(`.${own}`)))) return "direct";
  if (AI.test(host)) return "ai";
  if (/(^|\.)google\.[a-z.]+$/.test(host) && !/^(mail|docs|drive)\./.test(host)) return "google";
  if (SEARCH.test(host)) return "bing";
  if (MAIL.test(host)) return "email";
  if (SOCIAL.test(host)) return "social";
  return "referral";
}

/** Today's date in the UAE, which is the day the dashboards count in. */
export function dubaiDay(at = new Date()): string {
  return new Date(at.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

/**
 * A visitor's key for one day: a keyed hash of the day, IP and browser. It counts unique visitors without a cookie and
 * without storing the IP; it changes every day, so nobody can be followed from one day to the next.
 */
export function visitorKeyFor(ip: string, ua: string, day: string, secret: string): string {
  return createHmac("sha256", secret).update(`${day}|${ip}|${ua}`).digest("base64url").slice(0, 22);
}

/** The kind of page a path is, and its slug, so events can be tied to a post, product or industry. */
export function pageOf(path: string): { kind: "post" | "product" | "industry" | "other"; slug: string } {
  const p = path.replace(/\/+$/, "");
  let m = p.match(/^\/(?:guides|blog|services)\/([^/]+)$/);
  if (m && m[1] !== "category" && m[1] !== "author") return { kind: "post", slug: m[1] };
  m = p.match(/^\/products\/[^/]+\/([^/]+)$/);
  if (m) return { kind: "product", slug: m[1] };
  m = p.match(/^\/industries\/([^/]+)$/);
  if (m) return { kind: "industry", slug: m[1] };
  // company pages (about, contact, privacy...) are posts of type "page" at the root
  m = p.match(/^\/([^/]+)$/);
  if (m && !["industries", "products", "services", "guides", "blog", "brands", "compare", "quote", "brand"].includes(m[1])) return { kind: "post", slug: m[1] };
  return { kind: "other", slug: "" };
}
