/** Prospecting app: statuses, signal kinds and the small rules shared by the server and the browser. */

export const STATUSES = [
  { key: "sourced", label: "Sourced", hint: "Found, not looked at yet" },
  { key: "researching", label: "Researching", hint: "Someone is checking the company and finding the right person" },
  { key: "ready", label: "Ready", hint: "Key person, email and personal line are in place" },
  { key: "in_sequence", label: "In sequence", hint: "Emails are going out" },
  { key: "replied", label: "Replied", hint: "They answered; someone needs to read it" },
  { key: "converted", label: "Converted", hint: "Turned into a CRM lead" },
  { key: "not_now", label: "Not now", hint: "Snoozed until a date" },
  { key: "disqualified", label: "Disqualified", hint: "Not a fit, not interested or unsubscribed" },
] as const;

export type StatusKey = (typeof STATUSES)[number]["key"];
const STATUS_KEYS = new Set<string>(STATUSES.map((s) => s.key));
export const isStatus = (k: string): k is StatusKey => STATUS_KEYS.has(k);
export const statusLabel = (k: string) => STATUSES.find((s) => s.key === k)?.label ?? k;
/** Statuses a person may set by hand; in_sequence, replied and converted are set by the app itself (P.5-P.7). */
export const MANUAL_STATUSES: StatusKey[] = ["sourced", "researching", "ready", "not_now", "disqualified"];

export const DISQUALIFY_REASONS = ["Not a fit", "Too small", "Already a customer", "Closed / not trading", "No contact found", "Not interested", "Unsubscribed", "Duplicate"] as const;

/** Signal kinds with their weight on the signal score (0-10). A signal needs a date and a source. */
export const SIGNALS = [
  { key: "new_license", label: "Newly licensed", score: 10 },
  { key: "new_office", label: "New office or branch", score: 10 },
  { key: "hiring", label: "Hiring", score: 9 },
  { key: "tender", label: "IT / CCTV tender", score: 9 },
  { key: "funding", label: "Funding or acquisition", score: 8 },
  { key: "leadership", label: "New leadership", score: 8 },
  { key: "exhibitor", label: "Exhibiting at a show", score: 6 },
  { key: "weak_website", label: "Weak or no website", score: 5 },
  { key: "other", label: "Other", score: 4 },
] as const;
export type SignalKey = (typeof SIGNALS)[number]["key"];
export const signalLabel = (k: string) => SIGNALS.find((s) => s.key === k)?.label ?? k;
export const isSignal = (k: string): k is SignalKey => SIGNALS.some((s) => s.key === k);

export const SIZE_BANDS = ["1-10", "11-50", "51-200", "200+"] as const;

export const ROLE_KINDS = [
  { key: "decision", label: "Decision maker" },
  { key: "influencer", label: "Influencer" },
  { key: "gatekeeper", label: "Gatekeeper" },
] as const;
export const roleLabel = (k: string) => ROLE_KINDS.find((r) => r.key === k)?.label ?? k;

export const EMAIL_STATUSES = [
  { key: "verified", label: "Verified", hint: "Published by them or confirmed" },
  { key: "likely", label: "Likely", hint: "Follows the company's address pattern" },
  { key: "guess", label: "Guess", hint: "Not checked; confirm before sending" },
  { key: "generic", label: "Generic", hint: "info@, sales@, a shared inbox" },
] as const;
export const emailStatusLabel = (k: string) => EMAIL_STATUSES.find((e) => e.key === k)?.label ?? k;

export const SUPPRESSION_REASONS = ["manual", "unsubscribe", "bounce", "complaint", "customer"] as const;

/** Free mailbox providers: their domain says nothing about the company and is never a duplicate or block key. */
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "yandex.com",
  "zoho.com",
  "emirates.net.ae",
  "eim.ae",
]);
export const isFreeMail = (domain: string) => FREE_MAIL.has(domain.toLowerCase());

const GENERIC_LOCAL = /^(info|sales|contact|hello|admin|office|enquir(y|ies)|inquir(y|ies)|support|mail|team|hr|careers|jobs|accounts|marketing)$/i;
/** info@, sales@ and the like: reach a shared inbox, not a person. */
export const isGenericEmail = (email: string) => GENERIC_LOCAL.test(email.split("@")[0] ?? "");

/**
 * The bare domain of a website or email: "https://www.Example.ae/about" and "sam@example.ae" both give "example.ae".
 * Empty for free mail providers and anything that is not a domain.
 */
export function domainOf(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return "";
  if (s.includes("@") && !s.includes("/")) s = s.slice(s.lastIndexOf("@") + 1);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^www\d?\./, "");
  s = s.split(/[/?#:]/)[0].replace(/\.+$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) || /^\d+(\.\d+)+$/.test(s)) return "";
  return isFreeMail(s) ? "" : s;
}

/** A website as typed, made into a link we can open. */
export function websiteHref(site: string): string {
  const s = site.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
