/** Sales rules and lists in one place: stages, sources, the genuine-lead checklist and its Hot / Warm / Cold label. */

export const STAGES = [
  { key: "new", label: "New", hint: "Just arrived, not yet contacted" },
  { key: "contacted", label: "Contacted", hint: "We spoke or messaged them" },
  { key: "requirement", label: "Qualified", hint: "We know exactly what, how many, by when" },
  { key: "sourcing", label: "Pricing", hint: "Getting prices from suppliers and making the quote" },
  { key: "quoted", label: "Quote sent", hint: "Waiting for their answer" },
  { key: "negotiation", label: "Negotiation", hint: "Price, terms or delivery being discussed" },
  { key: "won", label: "Won", hint: "Order received" },
  { key: "lost", label: "Lost", hint: "Did not go ahead" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

/** Stages shown as columns on the board; Won and Lost are shown as totals below it. */
export const OPEN_STAGES = STAGES.filter((s) => s.key !== "won" && s.key !== "lost");

export const isStage = (k: string): k is StageKey => STAGES.some((s) => s.key === k);
export const isOpen = (k: string) => k !== "won" && k !== "lost";
export const stageLabel = (k: string) => STAGES.find((s) => s.key === k)?.label ?? k;

export const SOURCES = [
  "Phone call",
  "WhatsApp",
  "Email",
  "Website",
  "Walk-in",
  "Referral",
  "Existing customer",
  "Free zone announcement",
  "Exhibition",
  "LinkedIn",
  "Other",
] as const;

export const INDUSTRIES = [
  "Trading",
  "Contracting / Construction",
  "Consulting / Professional services",
  "Real estate",
  "Healthcare",
  "Education",
  "Hospitality",
  "Logistics",
  "IT / Telecom",
  "Government",
  "Retail",
  "Manufacturing",
  "Other",
] as const;

export const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain", "Outside UAE"] as const;

export const LOST_REASONS = [
  "Price too high",
  "Chose another supplier",
  "No budget / project cancelled",
  "Not a genuine lead",
  "No response",
  "Could not supply the item",
  "Other",
] as const;

export const ACTIVITY_TYPES = [
  { key: "call", label: "Call" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "meeting", label: "Meeting" },
  { key: "note", label: "Note" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["key"] | "stage" | "created";

/** The genuine-lead checklist. The first four are need / authority / budget / timing; then ways to verify the company. */
export const CHECKS = [
  { key: "need", group: "ask", label: "Clear need", help: "They told us what, how many and what for" },
  { key: "authority", group: "ask", label: "Talking to the decision maker", help: "Or they named who approves" },
  { key: "budget", group: "ask", label: "Budget is real", help: "A number, or an approved budget" },
  { key: "timing", group: "ask", label: "Has a date", help: "Delivery or decision date, a project" },
  { key: "emailDomain", group: "verify", label: "Email matches their website", help: "Not only a free Gmail or Yahoo address" },
  { key: "licence", group: "verify", label: "Trade licence checked", help: "Number checked with the licensing authority" },
  { key: "trn", group: "verify", label: "TRN verified", help: "Checked on the Federal Tax Authority site" },
  { key: "redFlag", group: "flag", label: "Something feels wrong", help: "Rushing, odd payment request, details do not match" },
] as const;

export type Checks = Partial<Record<(typeof CHECKS)[number]["key"], boolean>>;
export type Temperature = "hot" | "warm" | "cold";

export const TEMPERATURE_LABEL: Record<Temperature, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };

/**
 * Hot: at least three of need / authority / budget / timing are confirmed and the company is verified in some way.
 * Warm: two of the four, or one of the four plus two verifications. Everything else is Cold.
 * A red flag never makes a lead hotter: it caps the label at Warm.
 */
export function temperature(checks: Checks): Temperature {
  const asked = (["need", "authority", "budget", "timing"] as const).filter((k) => checks[k]).length;
  const verified = (["emailDomain", "licence", "trn"] as const).filter((k) => checks[k]).length;
  let t: Temperature = "cold";
  if (asked >= 3 && verified >= 1) t = "hot";
  else if (asked >= 2 || (asked >= 1 && verified >= 2)) t = "warm";
  if (checks.redFlag && t === "hot") t = "warm";
  return t;
}

/** Lower-case letters and digits only, so "ABC Trading L.L.C." and "abc trading llc" compare equal. */
export function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/l\.l\.c\.?|fz[- ]?(llc|co|e)|\bltd\b|\blimited\b|\bfzco\b|\bfze\b|\bllc\b/g, "")
    .replace(/[^a-z0-9؀-ۿ]+/g, "");
}

export function aed(value: number | null | undefined): string {
  if (value == null) return "No value yet";
  return `AED ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Short money for tight spaces: AED 950, AED 12.5k, AED 1.2M. */
export function aedShort(value: number | null | undefined): string {
  if (value == null) return "-";
  const abs = Math.abs(value);
  const trim = (n: number, digits: number) => n.toFixed(digits).replace(/\.0$/, "");
  if (abs >= 1_000_000) return `AED ${trim(value / 1_000_000, abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `AED ${trim(value / 1_000, abs >= 100_000 ? 0 : 1)}k`;
  return `AED ${Math.round(value)}`;
}

/** Short labels for tabs. */
export const STAGE_SHORT: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  requirement: "Qualified",
  sourcing: "Pricing",
  quoted: "Quoted",
  negotiation: "Negotiating",
  won: "Won",
  lost: "Lost",
};

/** Whole days since a date (0 = today). */
export function daysSince(d: Date | string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(d).getTime()) / 86400_000));
}

/** A UAE TRN is 15 digits (spaces and dashes allowed when typed). Empty = the customer is not VAT-registered. */
export const trnProblem = (trn: string): string | null => {
  const t = trn.replace(/[\s-]/g, "");
  return !t || /^\d{15}$/.test(t) ? null : `TRN "${trn}" is not 15 digits.`;
};

export interface CustomerGap {
  key: "address" | "trn" | "trnFormat" | "contact" | "contactReach";
  label: string;
  /** Blocks the tax invoice until fixed; the rest only gets a follow-up task. */
  blocksInvoice: boolean;
}

/** What is missing on a customer before documents go out. Winning the deal is never blocked by it. */
export function customerGaps(c: { trn: string; address: string; emirate: string }, contact: { email: string; phone: string; whatsapp: string } | null): CustomerGap[] {
  const gaps: CustomerGap[] = [];
  if (!c.address.trim() && !c.emirate.trim()) gaps.push({ key: "address", label: "Billing address", blocksInvoice: true });
  if (!c.trn.trim()) gaps.push({ key: "trn", label: "TRN (if they are VAT-registered)", blocksInvoice: false });
  else if (trnProblem(c.trn)) gaps.push({ key: "trnFormat", label: "TRN must be 15 digits", blocksInvoice: true });
  if (!contact) gaps.push({ key: "contact", label: "Primary contact person", blocksInvoice: false });
  else if (!contact.email.trim() && !contact.phone.trim() && !contact.whatsapp.trim()) gaps.push({ key: "contactReach", label: "Contact email or phone", blocksInvoice: false });
  return gaps;
}
