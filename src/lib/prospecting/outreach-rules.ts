/** Cold-email rules shared by the server and the browser: merge fields, who may be emailed, and working days. */

export const MERGE_FIELDS = [
  { key: "greeting", label: "Greeting", hint: '"Hi Sara", or "Hello Acme team" when only a company inbox is known' },
  { key: "first_name", label: "First name", hint: "Of the person emailed" },
  { key: "company", label: "Company", hint: "Prospect name without LLC / FZ-LLC" },
  { key: "personal_line", label: "Personal line", hint: "The hook written on the prospect page" },
  { key: "offer_line", label: "Offer", hint: "From the prospect's segment" },
  { key: "signal", label: "Signal", hint: "The latest signal, e.g. hiring" },
  { key: "sender_first_name", label: "Sender first name", hint: "From the sending mailbox" },
] as const;
export type MergeKey = (typeof MERGE_FIELDS)[number]["key"];
export type MergeVars = Partial<Record<MergeKey, string>>;

const FIELD_RE = /\{([a-z_]+)\}/g;

/** Fills {fields}. Returns the text and the fields that had no value (those block approval). */
export function render(template: string, vars: MergeVars): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = template.replace(FIELD_RE, (whole, key: string) => {
    const v = vars[key as MergeKey]?.trim();
    if (!v) {
      missing.add(key);
      return whole;
    }
    return v;
  });
  return { text, missing: [...missing] };
}

/** Fields still written as {field} in a text (left unfilled, or typed by hand in the review queue). */
export const unfilled = (text: string) => [...new Set([...text.matchAll(FIELD_RE)].map((m) => m[1]))];

/** "Mr. Ahmed Al Mansoori" -> "Ahmed". */
export function firstName(name: string): string {
  const parts = name
    .trim()
    .replace(/^(mr|mrs|ms|miss|dr|eng|engr|sheikh)\.?\s+/i, "")
    .split(/\s+/);
  return parts[0] ?? "";
}

/** "Acme Trading FZ-LLC" -> "Acme Trading": how people write a company name in an email. */
export function shortCompany(name: string): string {
  return (
    name
      .replace(/\b(l\.?l\.?c\.?|fz[- ]?llc|fz[- ]?co|fze|fzco|ltd\.?|limited|est\.?|establishment|co\.?\s*llc)\s*$/i, "")
      .replace(/[\s,.-]+$/, "")
      .trim() || name.trim()
  );
}

/** A segment's offer as a phrase inside a sentence ("New office IT setup: ..." -> "new office IT setup: ..."). */
export function offerLine(offer: string): string {
  const s = offer.trim().replace(/\.$/, "");
  // keep acronyms ("IT", "CCTV") as they are
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/** At most this many addresses go on Cc: more makes a cold email look like a mass mailing. */
export const CC_MAX = 3;

export interface RecipientPerson {
  id: number;
  name: string;
  email: string;
  emailStatus: string;
  isPrimary: boolean;
  roleKind: string;
}

export interface Recipients {
  to: string;
  /** The person the email is addressed to; null when it goes to the company inbox. */
  personId: number | null;
  personName: string;
  cc: string[];
}

const VALID = /^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i;

/**
 * Who a first email goes to, picked without anyone choosing: the main contact (or else a decision maker) in To, else
 * the company inbox (info@), else anyone found; every other confirmed address goes on Cc (CC_MAX at most). Guessed
 * addresses and blocked addresses or domains are never used. Null when there is no address at all.
 */
export function pickRecipients(companyEmail: string, people: RecipientPerson[], blocked: Set<string> = new Set()): Recipients | null {
  const ok = (e: string) => {
    const v = e.trim().toLowerCase();
    return !!v && VALID.test(v) && !blocked.has(v) && !blocked.has(v.split("@")[1] ?? "");
  };
  const usable = people.filter((p) => p.emailStatus !== "guess" && ok(p.email));
  const ranked = [...usable].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || Number(b.roleKind === "decision") - Number(a.roleKind === "decision") || a.id - b.id,
  );
  const lead = ranked.find((p) => p.isPrimary || p.roleKind === "decision");
  const inbox = ok(companyEmail) ? companyEmail.trim().toLowerCase() : "";
  const toPerson = lead ?? (inbox ? undefined : ranked[0]);
  const to = toPerson ? toPerson.email.trim().toLowerCase() : inbox;
  if (!to) return null;
  const cc = [...new Set([...ranked.map((p) => p.email.trim().toLowerCase()), inbox].filter((e) => e && e !== to))].slice(0, CC_MAX);
  return { to, personId: toPerson?.id ?? null, personName: toPerson?.name ?? "", cc };
}

/** "Hi Sara" for a person, "Hello Acme team" for a company inbox. */
export const greetingFor = (personName: string, company: string) => (firstName(personName) ? `Hi ${firstName(personName)}` : `Hello ${shortCompany(company)} team`);

export interface EligibilityInput {
  /** The address the first email would go to ("" = none confirmed). */
  toEmail: string;
  companyStatus: string;
  /** The email or its domain is on the do-not-contact list. */
  suppressed: boolean;
  /** Already a CRM company or contact (customer or open deal): never cold-emailed. */
  inCrm: string;
  /** The company is already in a campaign that has not ended. */
  openEnrollment: boolean;
  /** Days since the company's last campaign ended (null = never emailed). */
  daysSinceLast: number | null;
}

/** Why a person cannot be added to a campaign, or null when they can. Cheapest, clearest reasons first. */
export function whyNot(e: EligibilityInput): string | null {
  if (e.suppressed) return "on the do-not-contact list";
  if (!e.toEmail) return "no confirmed email (guessed addresses are never used)";
  if (e.inCrm) return `already in the CRM (${e.inCrm})`;
  if (["converted", "disqualified", "replied", "not_now"].includes(e.companyStatus)) return `prospect is ${e.companyStatus.replace("_", " ")}`;
  if (e.openEnrollment) return "already in a campaign";
  if (e.daysSinceLast !== null && e.daysSinceLast < 90) return `last campaign ended ${e.daysSinceLast} days ago (wait 90)`;
  return null;
}

/** Adds working days (Mon-Fri, the UAE week) to a yyyy-mm-dd date. */
export function addWorkingDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** When each step of a sequence goes out if step 1 goes on `start` (for the preview). */
export function schedule(start: string, delays: number[]): string[] {
  const out: string[] = [];
  let day = start;
  for (const [i, d] of delays.entries()) {
    day = i === 0 ? day : addWorkingDays(day, d);
    out.push(day);
  }
  return out;
}
