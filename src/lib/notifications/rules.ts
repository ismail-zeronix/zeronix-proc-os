/**
 * The system alert rules: what each one watches, its default time limits and the priority of each step.
 * Every alert goes through up to three steps, each fired once: a heads-up before the deadline ("warn"), the deadline
 * passed ("due"), and still not done well after it ("late", the critical one). Admins change the numbers and switch
 * rules off in Admin › Settings › Notifications (stored as JSON in the `notify_rules` setting).
 * Pure code: the database part is in scan.ts.
 */
import type { WorkHours } from "@/lib/attendance";
import type { Priority } from "./types";
import { addWorkMinutes, dayAt, shiftDay, workDayMinutes } from "./work-time";

export type Step = "warn" | "due" | "late";

/**
 * timer = a limit counted in working time from a start (stage change, quote sent, last contact);
 * moment = a time someone picked (the deal's follow-up);
 * date = a calendar day on the record (task due date, quote valid-until, expected close).
 */
export type RuleMode = "timer" | "moment" | "date";

export interface RuleConfig {
  enabled: boolean;
  /** timer rules: the time limit, in the rule's unit. */
  limit: number;
  /** Heads-up before the deadline: hours (timer and moment rules) or days (date rules); 0 = none. */
  warn: number;
  /** How long after the deadline it turns critical, in the rule's unit; 0 = never. */
  escalate: number;
}

export interface RuleDef {
  key: string;
  label: string;
  /** What it watches, for the admin screen. */
  help: string;
  mode: RuleMode;
  /** Unit of `limit` and `escalate`. Date rules always count calendar days. */
  unit: "hours" | "days";
  defaults: RuleConfig;
  priority: Record<Step, Priority>;
  /** Who gets it, for the admin screen. */
  to: string;
}

export const RULES = [
  {
    key: "lead_not_contacted",
    label: "New lead not contacted",
    help: "A deal still at New: nobody has logged a call, WhatsApp, email or meeting.",
    mode: "timer",
    unit: "hours",
    defaults: { enabled: true, limit: 4, warn: 1, escalate: 10 },
    priority: { warn: "high", due: "high", late: "critical" },
    to: "Deal team",
  },
  {
    key: "deal_no_quote",
    label: "Quote not sent",
    help: "A Qualified or Pricing deal with no quote sent yet, counted from when it reached that stage.",
    mode: "timer",
    unit: "days",
    defaults: { enabled: true, limit: 2, warn: 4, escalate: 1 },
    priority: { warn: "normal", due: "high", late: "critical" },
    to: "Deal team",
  },
  {
    key: "quote_no_reply",
    label: "Quote sent, no follow-up",
    help: "A sent quote with no call, message, email or meeting logged since it went out (or since the last one).",
    mode: "timer",
    unit: "days",
    defaults: { enabled: true, limit: 3, warn: 0, escalate: 2 },
    priority: { warn: "normal", due: "normal", late: "high" },
    to: "Deal team and quote owner",
  },
  {
    key: "quote_expiring",
    label: "Quote about to expire",
    help: "A sent quote reaching its valid-until date while the deal is still open.",
    mode: "date",
    unit: "days",
    defaults: { enabled: true, limit: 0, warn: 1, escalate: 0 },
    priority: { warn: "high", due: "normal", late: "normal" },
    to: "Deal team and quote owner",
  },
  {
    key: "deal_follow_up",
    label: "Deal follow-up time",
    help: "The next follow-up time a salesman set on a deal. Logging a call, message, email or meeting clears it.",
    mode: "moment",
    unit: "hours",
    defaults: { enabled: true, limit: 0, warn: 1, escalate: 10 },
    priority: { warn: "high", due: "high", late: "critical" },
    to: "Deal team",
  },
  {
    key: "deal_quiet",
    label: "Deal gone quiet",
    help: "An open deal (past New) with nothing logged on its timeline for this long.",
    mode: "timer",
    unit: "days",
    defaults: { enabled: true, limit: 5, warn: 0, escalate: 5 },
    priority: { warn: "normal", due: "normal", late: "high" },
    to: "Deal team",
  },
  {
    key: "deal_close_passed",
    label: "Expected close date passed",
    help: "An open deal past its expected close date. Move the date or close the deal.",
    mode: "date",
    unit: "days",
    defaults: { enabled: true, limit: 0, warn: 2, escalate: 7 },
    priority: { warn: "normal", due: "high", late: "high" },
    to: "Deal team",
  },
  {
    key: "task_overdue",
    label: "Task due / overdue",
    help: "An open task due today (heads-up) or past its due date. High-priority tasks start at High.",
    mode: "date",
    unit: "days",
    defaults: { enabled: true, limit: 0, warn: 0, escalate: 2 },
    priority: { warn: "normal", due: "high", late: "critical" },
    to: "Task assignee",
  },
  {
    key: "project_past_target",
    label: "Project past its target date",
    help: "A project not completed by its target date.",
    mode: "date",
    unit: "days",
    defaults: { enabled: true, limit: 0, warn: 3, escalate: 7 },
    priority: { warn: "normal", due: "high", late: "critical" },
    to: "Project manager",
  },
] as const satisfies readonly RuleDef[];

export type RuleKey = (typeof RULES)[number]["key"];

export const ruleDef = (key: string): RuleDef | undefined => RULES.find((r) => r.key === key);

/** The saved settings merged over the defaults; bad or missing values fall back to the default. */
export function ruleConfigs(saved: string): Record<RuleKey, RuleConfig> {
  let raw: Record<string, Partial<RuleConfig>> = {};
  try {
    const parsed = JSON.parse(saved || "{}");
    if (parsed && typeof parsed === "object") raw = parsed;
  } catch {
    // a broken setting: use the defaults
  }
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000 ? v : d);
  const out = {} as Record<RuleKey, RuleConfig>;
  for (const r of RULES) {
    const s = raw[r.key] ?? {};
    out[r.key] = {
      enabled: typeof s.enabled === "boolean" ? s.enabled : r.defaults.enabled,
      limit: num(s.limit, r.defaults.limit),
      warn: num(s.warn, r.defaults.warn),
      escalate: num(s.escalate, r.defaults.escalate),
    };
  }
  return out;
}

/** The three moments of an alert: heads-up, deadline, critical. */
export interface Timeline {
  warnAt: Date | null;
  dueAt: Date;
  lateAt: Date | null;
}

/** Which step applies now; null = too early for anything. */
export function stepAt(t: Timeline, now: Date): Step | null {
  if (t.lateAt && now >= t.lateAt) return "late";
  if (now >= t.dueAt) return "due";
  if (t.warnAt && now >= t.warnAt) return "warn";
  return null;
}

const toMinutes = (amount: number, unit: "hours" | "days", h: WorkHours) => (unit === "days" ? amount * workDayMinutes(h) : amount * 60);

/** A timer rule: the limit counted in working time from `start`. */
export function timerTimeline(start: Date, cfg: RuleConfig, unit: "hours" | "days", h: WorkHours): Timeline {
  const dueAt = addWorkMinutes(start, toMinutes(cfg.limit, unit, h), h);
  return {
    dueAt,
    warnAt: cfg.warn > 0 ? new Date(dueAt.getTime() - cfg.warn * 3600_000) : null,
    lateAt: cfg.escalate > 0 ? addWorkMinutes(dueAt, toMinutes(cfg.escalate, unit, h), h) : null,
  };
}

/** A moment someone picked (follow-up time): heads-up `warn` hours before, critical `escalate` working hours after. */
export function momentTimeline(at: Date, cfg: RuleConfig, h: WorkHours): Timeline {
  return {
    dueAt: at,
    warnAt: cfg.warn > 0 ? new Date(at.getTime() - cfg.warn * 3600_000) : null,
    lateAt: cfg.escalate > 0 ? addWorkMinutes(at, cfg.escalate * 60, h) : null,
  };
}

/**
 * A calendar-day rule: due at the end of the working day on `day`; the heads-up opens at the start of work `warn` days
 * before (0 = on the day itself); critical `escalate` days after.
 */
export function dateTimeline(day: string, cfg: RuleConfig, h: WorkHours): Timeline {
  return {
    dueAt: dayAt(day, h.end),
    warnAt: dayAt(shiftDay(day, -cfg.warn), h.start),
    lateAt: cfg.escalate > 0 ? dayAt(shiftDay(day, cfg.escalate), h.end) : null,
  };
}

/** The bell heading for a step, e.g. "Quote not sent · 3 h left" is built from this plus the deadline. */
export function alertTitle(rule: RuleKey, step: Step, subject: string): string {
  const s = subject.length > 70 ? `${subject.slice(0, 69)}…` : subject;
  switch (rule) {
    case "lead_not_contacted":
      return step === "warn" ? `Contact this new lead soon: ${s}` : step === "due" ? `New lead not contacted: ${s}` : `Lead still not contacted: ${s}`;
    case "deal_no_quote":
      return step === "warn" ? `Quote due soon: ${s}` : step === "due" ? `Quote not sent yet: ${s}` : `Quote badly overdue: ${s}`;
    case "quote_no_reply":
      return step === "late" ? `No follow-up on sent quote for days: ${s}` : `Follow up on sent quote: ${s}`;
    case "quote_expiring":
      return step === "warn" ? `Quote expires soon: ${s}` : `Quote expired: ${s}`;
    case "deal_follow_up":
      return step === "warn" ? `Follow-up coming up: ${s}` : step === "due" ? `Follow-up due now: ${s}` : `Follow-up missed: ${s}`;
    case "deal_quiet":
      return step === "late" ? `Deal silent for too long: ${s}` : `Deal gone quiet: ${s}`;
    case "deal_close_passed":
      return step === "warn" ? `Expected close is near: ${s}` : `Expected close date passed: ${s}`;
    case "task_overdue":
      return step === "warn" ? `Task due today: ${s}` : step === "due" ? `Task overdue: ${s}` : `Task badly overdue: ${s}`;
    case "project_past_target":
      return step === "warn" ? `Project target date is near: ${s}` : `Project past its target date: ${s}`;
  }
}
