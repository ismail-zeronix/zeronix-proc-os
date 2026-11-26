/**
 * Billing of SaaS organisations by manual invoice (owner's choice, 2026-11-26): each organisation has a plan with a trial
 * end or a "paid until" date, kept in the platform console. Zeronix invoices from its own Accounts and records the
 * payment in the console. The billing job (worker/billing.ts) reminds the organisation's admins 7, 3 and 1 days
 * before the date, once more after it, and pauses the organisation GRACE_DAYS after an unpaid date; recording a payment
 * reactivates it. Pure functions: dates are "YYYY-MM-DD" UAE days.
 */

/** A new organisation's free trial. */
export const TRIAL_DAYS = 30;
/** Days after an unpaid end date before the organisation is paused. */
export const GRACE_DAYS = 7;

export type Plan = "trial" | "paid" | "free";

export interface BillingFields {
  plan: Plan;
  trialEndsOn: string | null;
  paidUntil: string | null;
}

export interface BillingState {
  plan: Plan;
  /** The day access is paid or free until (inclusive); null = no end. */
  endsOn: string | null;
  /** Days from today to endsOn (negative once past); null = no end. */
  daysLeft: number | null;
  /** Days past endsOn, 0 when not past. */
  overdueDays: number;
  /** The day the organisation is paused if still unpaid; null = no end. */
  pauseOn: string | null;
  /** One line for the console and the admin's notice. */
  label: string;
  tone: "ok" | "warn" | "bad";
}

const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string) => Math.round((ms(to) - ms(from)) / 86_400_000);
export const addDays = (day: string, n: number) => iso(ms(day) + n * 86_400_000);

/** The same day n months later, or the month's last day when it has no such day (31 Jan + 1 month = 28 Feb). */
export function addMonths(day: string, n: number): string {
  const d = new Date(ms(day));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

/** "10 Dec 2026" */
export const dayLabel = (day: string) => new Date(ms(day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "1 day" : `${n} days`);

export function billingState(b: BillingFields, today: string): BillingState {
  if (b.plan === "free") return { plan: "free", endsOn: null, daysLeft: null, overdueDays: 0, pauseOn: null, label: "Free, no end date", tone: "ok" };
  const endsOn = b.plan === "paid" ? b.paidUntil : b.trialEndsOn;
  if (!endsOn) return { plan: b.plan, endsOn: null, daysLeft: null, overdueDays: 0, pauseOn: null, label: b.plan === "trial" ? "Trial, no end date" : "Paid, no end date", tone: "ok" };
  const left = daysBetween(today, endsOn);
  const pauseOn = addDays(endsOn, GRACE_DAYS + 1);
  if (left >= 0) {
    return {
      plan: b.plan,
      endsOn,
      daysLeft: left,
      overdueDays: 0,
      pauseOn,
      label: `${b.plan === "trial" ? "Trial ends" : "Paid until"} ${dayLabel(endsOn)} (${inDays(left)})`,
      tone: left <= 7 ? "warn" : "ok",
    };
  }
  return {
    plan: b.plan,
    endsOn,
    daysLeft: left,
    overdueDays: -left,
    pauseOn,
    label: `${b.plan === "trial" ? "Trial ended" : "Unpaid since"} ${dayLabel(endsOn)}, pauses ${dayLabel(pauseOn)}`,
    tone: "bad",
  };
}

/** Past the grace days: the billing job pauses the organisation. */
export const shouldPause = (s: BillingState) => s.endsOn !== null && s.overdueDays > GRACE_DAYS;

/**
 * The reminder due now, if any: "soon" when 7, 3 or 1 days (or fewer) are left, "overdue" once past the date. Each has
 * a key (end date and step) saved on the organisation, so it goes once, also after the server was down on the day; a
 * new end date (a payment) starts the steps again.
 */
export function reminderFor(s: BillingState, lastKey: string): { key: string; kind: "soon" | "overdue" } | null {
  if (!s.endsOn || s.daysLeft === null) return null;
  if (s.overdueDays > 0) {
    const key = `${s.endsOn}:overdue`;
    return key === lastKey ? null : { key, kind: "overdue" };
  }
  const step = s.daysLeft <= 1 ? 1 : s.daysLeft <= 3 ? 3 : s.daysLeft <= 7 ? 7 : null;
  if (step === null) return null;
  const key = `${s.endsOn}:${step}`;
  // the steps only go down: a reminder for 1 day left is never followed by one for 3
  if (lastKey.startsWith(`${s.endsOn}:`) && Number(lastKey.split(":")[1]) <= step) return null;
  return { key, kind: "soon" };
}

/**
 * The new "paid until" after a payment for `months`: counted on from the later of the current end (paid until, or
 * the trial end, so trial days left are kept) and today.
 */
export function extendPaidUntil(b: BillingFields, today: string, months: number): string {
  const current = b.plan === "paid" ? b.paidUntil : b.trialEndsOn;
  const from = current && current > today ? current : today;
  return addMonths(from, months);
}

/** Where organisations write to about their plan (the platform's support address). */
export function supportEmail(): string {
  return process.env.PLATFORM_SUPPORT_EMAIL?.trim() || "support@zeronixos.online";
}
