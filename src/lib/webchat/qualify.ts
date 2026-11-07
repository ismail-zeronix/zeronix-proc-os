import type { WebClientInfo, WebHeat, WebNetworkKind, WebPageVisit, WebSiteEvent } from "./types";

/**
 * Small pure rules for qualifying a website visitor (no server imports, unit-tested in tests/webchat-qualify.test.ts):
 * is it a bot, what kind of network are they on, which email or phone did they type, and how warm are they.
 */

/**
 * Search engines, SEO tools, link previews, uptime checks and scripted browsers. They run the widget's JavaScript like a
 * person would, so without this every crawl would start a chat and ring the portal. The widget has the same list.
 */
const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|bingpreview|mediapartners|adsbot|apis-google|feedfetcher|google-inspectiontool|google-read-aloud|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|site24x7|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp\/|telegrambot|skypeuripreview|slackbot|discordbot|linkedinbot|twitterbot|embedly|preview|scrapy|python|curl\/|wget|httpclient|okhttp|go-http|java\/|node-fetch|axios|phantom|selenium|puppeteer|playwright|ahrefs|semrush|mj12|dotbot|petalbot|yandex|baidu|bytespider|gptbot|chatgpt|claudebot|anthropic|perplexity|ccbot|amazonbot|applebot|duckduckbot|seznam|qwant|ia_archiver|archive\.org/i;

export function isBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  // every real browser sends one, and they are long
  if (ua.length < 20) return true;
  // Cubot is a phone brand, not a bot
  return BOT_RE.test(ua.replace(/cubot/gi, ""));
}

// ---------- the network behind their IP address ----------

/** Clouds and hosting: nobody browses from these except bots, scrapers and VPNs. */
const HOSTING_RE =
  /amazon|\baws\b|google|microsoft|azure|ovh|digitalocean|digital ocean|hetzner|linode|akamai|cloudflare|oracle|alibaba|tencent|huawei cloud|contabo|vultr|choopa|leaseweb|scaleway|fastly|m247|datacamp|cdn77|ionos|godaddy|hostinger|hosting|data ?cent(er|re)|\bserver|\bvps\b|colocation|\bcolo\b|cloud/i;

/** Home, mobile and office internet providers: their name says nothing about the visitor's company. */
const ISP_RE =
  /emirates telecom|etisalat|\be&|emirates integrated|\bdu\b|telecom|telekom|telco|mobile|wireless|broadband|cable|communications|internet service|\bisp\b|vodafone|airtel|jio|reliance|ooredoo|zain|\bstc\b|batelco|omantel|vodacom|verizon|comcast|at&t|t-mobile|\bbt\b|orange|virgin|charter|spectrum|cox |telstra|pldt|globe telecom|ptcl|nayatel|telenor|swisscom|zscaler|starlink|\bnet\b|internet/i;

/**
 * "business" = the IP belongs to an organisation's own network, which is very likely the visitor's employer;
 * "isp" = a home or mobile provider; "hosting" = a data centre (bot or VPN). null when the network is unknown.
 */
export function networkKind(org: string | undefined, isp?: string | undefined): WebNetworkKind | null {
  const name = `${org ?? ""} ${isp ?? ""}`.trim();
  if (!name) return null;
  if (HOSTING_RE.test(name)) return "hosting";
  if (ISP_RE.test(name)) return "isp";
  return "business";
}

// ---------- contact details typed into the chat ----------

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{6,18}\d/g;

/** The first email address and phone number in a line the visitor wrote ("call me on 050 123 4567"). */
export function contactsIn(text: string): { email?: string; phone?: string } {
  const out: { email?: string; phone?: string } = {};
  const email = text.match(EMAIL_RE)?.[0];
  if (email) out.email = email.toLowerCase();
  for (const m of text.matchAll(PHONE_RE)) {
    const raw = m[0].trim();
    const digits = raw.replace(/\D/g, "");
    // 9-15 digits is a phone number; fewer is a price, a quantity or a date
    if (digits.length < 9 || digits.length > 15) continue;
    // 2026-11-05 style dates and 12.10.2026 are not phone numbers
    if (/^\d{4}[-./]\d{2}[-./]\d{2}$|^\d{2}[-./]\d{2}[-./]\d{4}$/.test(raw)) continue;
    out.phone = raw.replace(/\s+/g, " ");
    break;
  }
  return out;
}

export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** A plain domain ("acme.ae"). Partial emails are kept as typed, so check before a domain goes near a database search. */
export const isDomain = (v: string) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(v);

/**
 * What the message box adds to the contact details of a visitor who has not sent the form. The box arrives about twice a
 * second while they type, so "050 123 456" comes just before "050 123 4567": a value that came from the previous text
 * keeps following it, but anything they typed into the form is left alone.
 */
export function contactsFromDraft(previous: string, text: string, current: { email: string; phone: string }): { email?: string; phone?: string } {
  const before = contactsIn(previous);
  const found = contactsIn(text);
  const out: { email?: string; phone?: string } = {};
  if (found.email && found.email !== current.email && (!current.email || current.email === before.email)) out.email = found.email;
  if (found.phone && found.phone !== current.phone && (!current.phone || current.phone === before.phone)) out.phone = found.phone;
  return out;
}

// ---------- hot / warm / cold ----------

export interface HeatInput {
  /** Sent the lead form. */
  lead: boolean;
  /** Typed an email or phone (form not sent, or found in what they wrote). */
  partial: boolean;
  client: WebClientInfo | null;
  pages: WebPageVisit[];
  /** A site's "Get B2B pricing" opened the chat (they asked about a product). */
  asked: boolean;
  network: WebNetworkKind | null;
  countryCode?: string;
  events: WebSiteEvent[];
}

const PAID = /^(cpc|ppc|paid|paidsearch|paid_search|display|cpm)$/i;

/** How likely the visitor is to buy, from what they did on the site; each point comes with its reason. */
export function visitorHeat(i: HeatInput): WebHeat {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  // a way to reach them makes anyone at least warm
  if (i.lead) add(35, "Sent their details");
  else if (i.partial) add(30, "Typed contact details");

  const kinds = new Set(i.events.map((e) => e.kind));
  if (kinds.has("call") || kinds.has("whatsapp") || kinds.has("email")) add(20, "Clicked to call, WhatsApp or email");
  if (kinds.has("download")) add(10, "Downloaded a file");
  if (kinds.has("copy")) add(10, "Copied our contact details");
  if (i.asked) add(15, "Asked about a product");

  const visits = i.client?.visits ?? 1;
  if (visits >= 3) add(15, `Visit ${visits} to the site`);
  else if (visits === 2) add(8, "Second visit");

  const pages = i.pages.length;
  if (pages >= 5) add(10, `Read ${pages} pages`);
  else if (pages >= 3) add(5, `Read ${pages} pages`);

  const seconds = i.pages.reduce((n, p) => n + (p.seconds ?? 0), 0);
  if (seconds >= 180) add(10, `${Math.round(seconds / 60)} min on the site`);
  else if (seconds >= 60) add(5, "Over a minute on the site");

  const c = i.client?.campaign ?? {};
  if (c.gclid || c.msclkid || c.fbclid || PAID.test(c.utm_medium ?? "")) add(5, "Came from an ad");

  if (i.network === "business") add(10, "On a company network");
  if (i.network === "hosting") add(-25, "Data-centre network (VPN or bot)");
  if (i.countryCode === "AE") add(5, "In the UAE");

  score = Math.max(0, Math.min(100, score));
  return { score, level: score >= 60 ? "hot" : score >= 30 ? "warm" : "cold", reasons };
}
