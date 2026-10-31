/**
 * What a website crawl (or an AI search) changes on a prospect. Pure rules, no database, so they are easy to test:
 * fill empty company fields, add new people, add dated signals, and say whether AI is needed at all.
 */

import { domainOf, isGenericEmail } from "./constants";
import { isIndustry, INDUSTRY_KEYS } from "./industry";

export interface Found<T extends string> {
  value: string;
  source: string;
  kind: T;
}

/** The scraper's JSON (scraper/zx_scraper/crawl.py). */
export interface CrawlResult {
  site?: string;
  pages?: { url: string; title: string }[];
  emails?: { email: string; source: string }[];
  phones?: { phone: string; source: string }[];
  people?: { name: string; title: string; email: string; source: string }[];
  linkedin?: string;
  address?: string;
  hiringPage?: string;
  health?: { https: boolean; mobile: boolean; copyrightYear: number | null; outdated: boolean } | null;
  jsOnly?: boolean;
  robotsBlocked?: number;
  /** Text of the homepage and contact/about/team pages, for the AI reading step. */
  texts?: { url: string; text: string }[];
}

/** What an AI provider returned (only items with a source page are kept). */
export interface AiFindings {
  website?: string;
  emails?: { email: string; source: string }[];
  phones?: { phone: string; source: string }[];
  people?: { name: string; title: string; source: string }[];
  /** The office address as printed on the page. */
  address?: string;
  /** A draft personal line for the first email, from what their own pages say (reading step only). */
  line?: string;
  /** One of INDUSTRY_KEYS, from what the website says they do (reading step only). */
  industry?: string;
}

export interface CompanyNow {
  domain: string | null;
  industry?: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  address: string;
  people: { name: string; email: string }[];
  signals: { kind: string; observedOn: string }[];
}

export interface NewPerson {
  name: string;
  title: string;
  roleKind: "decision" | "influencer";
  email: string;
  emailStatus: "verified" | "likely" | "generic" | "guess";
  emailSource: string;
}

export interface ResearchPlan {
  company: Partial<{ email: string; phone: string; linkedinUrl: string; address: string; personalLine: string; industry: string }>;
  people: NewPerson[];
  signals: { kind: "hiring" | "weak_website"; detail: string; sourceUrl: string }[];
  emails: { email: string; source: string }[];
  phones: { phone: string; source: string }[];
  /** True when the website gave no email and no phone: the only case worth an AI call. */
  needsAi: boolean;
  summary: string;
}

const DECIDES = /\b(founder|owner|ceo|chief executive|managing|director|general manager|gm|president|chairman|partner|principal|proprietor)\b/i;
export const roleKindOf = (title: string): "decision" | "influencer" => (DECIDES.test(title) ? "decision" : "influencer");

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i;
const isLink = (s: string) => /^https?:\/\/\S+$/i.test(s);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Their own domain first, then shared inboxes (info@) first: the best address for the company field. */
function rankEmails(list: { email: string; source: string }[], domain: string) {
  const own = (e: string) => domainOf(e) === domain;
  return [...list].sort((a, b) => Number(own(b.email)) - Number(own(a.email)) || Number(isGenericEmail(b.email)) - Number(isGenericEmail(a.email)));
}

/** A found person's email is theirs when it carries their first or last name ("sara@", "s.khan@"). */
function emailFor(name: string, emails: string[]): string {
  const parts = name
    .toLowerCase()
    .replace(/^(mr|mrs|ms|dr|eng|engr)\.?\s+/, "")
    .split(/\s+/)
    .filter((p) => p.length >= 3);
  return emails.find((e) => !isGenericEmail(e) && parts.some((p) => e.split("@")[0].includes(p))) ?? "";
}

function healthIssues(h: CrawlResult["health"]): string[] {
  if (!h) return [];
  const out: string[] = [];
  if (!h.https) out.push("no SSL (http only)");
  if (!h.mobile) out.push("not mobile-friendly");
  if (h.outdated && h.copyrightYear) out.push(`copyright ${h.copyrightYear}`);
  return out;
}

export function planFromCrawl(r: CrawlResult, now: CompanyNow, today: string): ResearchPlan {
  const domain = now.domain ?? "";
  const emails = rankEmails(
    (r.emails ?? []).filter((e) => EMAIL.test(e.email)),
    domain,
  );
  const phones = (r.phones ?? []).filter((p) => p.phone.replace(/\D/g, "").length >= 7);
  const known = new Set(now.people.map((p) => p.name.toLowerCase()));
  const knownEmails = new Set([now.email, ...now.people.map((p) => p.email)].filter(Boolean).map((e) => e.toLowerCase()));

  const company: ResearchPlan["company"] = {};
  const generic = emails.find((e) => isGenericEmail(e.email)) ?? emails.find((e) => domainOf(e.email) === domain);
  if (!now.email && generic) company.email = generic.email;
  if (!now.phone && phones[0]) company.phone = phones[0].phone;
  if (!now.linkedinUrl && r.linkedin) company.linkedinUrl = r.linkedin;
  if (!now.address && r.address) company.address = r.address.slice(0, 300);

  const people: NewPerson[] = [];
  for (const p of r.people ?? []) {
    if (!p.name || known.has(p.name.toLowerCase())) continue;
    known.add(p.name.toLowerCase());
    const email = (p.email && EMAIL.test(p.email) ? p.email : emailFor(p.name, emails.map((e) => e.email))).toLowerCase();
    people.push({
      name: p.name.slice(0, 120),
      title: p.title.slice(0, 80),
      roleKind: roleKindOf(p.title),
      email: knownEmails.has(email) ? "" : email,
      // printed on their own website = published by them
      emailStatus: email ? (isGenericEmail(email) ? "generic" : "verified") : "guess",
      emailSource: email ? p.source : "",
    });
  }

  const signals: ResearchPlan["signals"] = [];
  const recent = (kind: string) => now.signals.some((s) => s.kind === kind && Date.parse(today) - Date.parse(s.observedOn) < 90 * 86400_000);
  if (r.hiringPage && !recent("hiring")) signals.push({ kind: "hiring", detail: "Their careers page lists open positions", sourceUrl: r.hiringPage });
  const issues = healthIssues(r.health);
  if (issues.length && !now.signals.some((s) => s.kind === "weak_website")) {
    signals.push({ kind: "weak_website", detail: `Website: ${issues.join(", ")}`, sourceUrl: r.pages?.[0]?.url ?? `https://${domain}` });
  }

  const pages = r.pages?.length ?? 0;
  const bits = [plural(emails.length, "email"), plural(phones.length, "phone"), people.length ? plural(people.length, "new person") : "", signals.length ? plural(signals.length, "signal") : ""].filter(Boolean);
  return {
    company,
    people,
    signals,
    emails,
    phones,
    needsAi: emails.length === 0 && phones.length === 0,
    summary: pages ? `Read ${plural(pages, "page")}: ${bits.join(", ")}` : "The website could not be read",
  };
}

const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Keeps only AI findings that name the page they came from (an answer without a source may be invented). */
export function cleanAi(a: AiFindings): Required<AiFindings> {
  const website = typeof a.website === "string" && domainOf(a.website) ? a.website.trim().slice(0, 200) : "";
  return {
    website,
    address: oneLine(a.address, 300),
    line: oneLine(a.line, 300),
    industry: typeof a.industry === "string" && isIndustry(a.industry.trim()) ? a.industry.trim() : "",
    emails: (a.emails ?? []).filter((e) => typeof e?.email === "string" && EMAIL.test(e.email.trim()) && isLink(String(e.source ?? ""))).map((e) => ({ email: e.email.trim().toLowerCase(), source: e.source })),
    phones: (a.phones ?? []).filter((p) => typeof p?.phone === "string" && p.phone.replace(/\D/g, "").length >= 7 && isLink(String(p.source ?? ""))).map((p) => ({ phone: p.phone.trim().slice(0, 40), source: p.source })),
    people: (a.people ?? []).filter((p) => typeof p?.name === "string" && p.name.trim().length >= 3 && isLink(String(p.source ?? ""))).slice(0, 3).map((p) => ({ name: p.name.trim().slice(0, 120), title: String(p.title ?? "").trim().slice(0, 80), source: p.source })),
  };
}

/**
 * The same plan from AI findings. A person's email is matched by name against what AI found plus the emails printed on
 * their website (siteEmails). Emails count as "verified" only when read from their own pages (ownSite), else "likely".
 */
export function planFromAi(a: Required<AiFindings>, now: CompanyNow, opts: { siteEmails?: { email: string; source: string }[]; ownSite?: boolean; label?: string } = {}): ResearchPlan {
  const known = new Set(a.emails.map((e) => e.email));
  const extra = (opts.siteEmails ?? []).filter((e) => !known.has(e.email));
  const p = planFromCrawl({ emails: [...a.emails, ...extra], phones: a.phones, people: a.people.map((x) => ({ ...x, email: "" })), address: a.address, pages: [] }, now, "2000-01-01");
  if (!opts.ownSite) for (const person of p.people) if (person.email && person.emailStatus === "verified") person.emailStatus = "likely";
  const emails = p.emails.filter((e) => known.has(e.email));
  const bits = [plural(emails.length, "email"), plural(p.phones.length, "phone"), p.people.length ? plural(p.people.length, "person") : "", p.company.address ? "the address" : ""].filter(Boolean);
  return { ...p, emails, signals: [], needsAi: false, summary: `${opts.label ?? "AI search"}: ${a.website ? "website found, " : ""}${bits.join(", ")}` };
}

/** One short prompt; the model must search and return JSON with a source for every item. */
export function aiPrompt(c: { name: string; website: string; activity: string; emirate: string; freeZone: string }): string {
  const known = [c.website && `website ${c.website}`, c.activity && `activity "${c.activity}"`, c.emirate, c.freeZone && `free zone ${c.freeZone}`].filter(Boolean).join("; ");
  return [
    `Search the web for public business contact details of this UAE company: "${c.name}"${known ? ` (${known})` : ""}.`,
    `Reply with JSON only, no other text: {"website":"","emails":[{"email":"","source":""}],"phones":[{"phone":"","source":""}],"people":[{"name":"","title":"","source":""}]}`,
    "Rules: include only details printed on a web page you found, with that page's URL as source. Business contacts only.",
    "At most 3 people: the owner, managing director or the head of IT/operations. Never guess or construct an email. Use empty lists when nothing is found.",
  ].join("\n");
}

/** The JSON object inside a model's reply (models sometimes wrap it in text or a code fence). */
export function parseAiJson(text: string): AiFindings | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === "object" ? (v as AiFindings) : null;
  } catch {
    return null;
  }
}

/**
 * The free reading step: a model reads the text of pages the scraper already fetched (no web search, so a free model
 * will do) and lists contacts the patterns missed. Each finding must name one of those pages as its source.
 */
export function aiReadPrompt(name: string, texts: { url: string; text: string }[]): string {
  const pages = texts.map((t) => `PAGE ${t.url}\n${t.text.slice(0, 2500)}`).join("\n\n");
  return [
    `Below is text from the website of the company "${name}". List the business contact details printed in it.`,
    `Reply with JSON only, no other text: {"emails":[{"email":"","source":""}],"phones":[{"phone":"","source":""}],"people":[{"name":"","title":"","source":""}],"address":"","line":"","industry":""}`,
    "Rules: source is the PAGE address the detail appears under. Only details written in the text; never guess or construct an email. Empty lists when there are none.",
    "people: named staff with their job title, owners and managers first (at most 5). address: the office address exactly as written, or empty.",
    "line: one short, friendly sentence (at most 25 words) to open a sales email to them, about something specific the text says they do (their business, area, projects). No flattery, nothing that is not in the text; empty if nothing specific.",
    `industry: what they do, exactly one of: ${INDUSTRY_KEYS.join(", ")}.`,
    "",
    pages,
  ].join("\n");
}

/** What to search for when looking for the people who run a company. */
export function peopleQuery(c: { name: string; emirate: string }): string {
  return `"${c.name}" ${c.emirate || "UAE"} owner OR founder OR "managing director" OR CEO OR "general manager"`;
}

/**
 * Reading web search results (from a search service) with a free model: who runs the company, and its website and
 * contacts. Every finding must name the result it came from.
 */
export function aiSearchReadPrompt(c: { name: string; website: string; emirate: string }, hits: { url: string; title: string; content: string }[]): string {
  const results = hits.map((h) => `RESULT ${h.url}\n${h.title}\n${h.content.slice(0, 1200)}`).join("\n\n");
  return [
    `Below are web search results about the UAE company "${c.name}"${c.website ? ` (website ${c.website})` : ""}${c.emirate ? `, ${c.emirate}` : ""}.`,
    "Who owns or runs this company (owner, founder, CEO, managing director, general manager, partner, head of IT or operations)? Also its official website and business contacts.",
    `Reply with JSON only, no other text: {"website":"","emails":[{"email":"","source":""}],"phones":[{"phone":"","source":""}],"people":[{"name":"","title":"","source":""}]}`,
    "Rules: source is the RESULT address the detail appears under. Only people the text says work at this exact company (not one with a similar name). At most 3 people.",
    "Never guess or construct an email. Empty lists when nothing is found.",
    "",
    results,
  ].join("\n");
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Drops reading-step findings whose source is not one of the pages that were read, and an address or a name that is
 * not in the text (the model made it up). The website is kept only when asked (search results may name it).
 */
export function keepFromPages(a: Required<AiFindings>, pages: { url: string; text: string }[], opts: { website?: boolean } = {}): Required<AiFindings> {
  const ok = new Set(pages.map((p) => p.url));
  const all = squash(pages.map((p) => p.text).join(" "));
  const inText = (v: string) => !!v && all.includes(squash(v));
  return {
    website: opts.website ? a.website : "",
    emails: a.emails.filter((e) => ok.has(e.source)),
    phones: a.phones.filter((p) => ok.has(p.source)),
    people: a.people.filter((p) => ok.has(p.source) && inText(p.name)),
    address: inText(a.address) ? a.address : "",
    line: a.line,
    industry: a.industry,
  };
}
