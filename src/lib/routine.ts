/**
 * The salesman's day: targets, how far along they should be by now, and which block of the routine it is.
 * Pure functions only (the home page and the tests share them). All times are UAE time, in minutes after midnight.
 */
import type { WorkHours } from "@/lib/attendance";

/** Targets when Admin has set none (team default in the `sales_targets` setting, per person in users.sales_targets). */
export const DEFAULT_TARGETS = { callsDay: 25, prospectsDay: 10, leadsWeek: 5, quotesWeek: 5 };
export type Targets = typeof DEFAULT_TARGETS;
export type TargetKey = keyof Targets;
export const TARGET_FIELDS: { key: TargetKey; label: string; per: "day" | "week" }[] = [
  { key: "callsDay", label: "Calls", per: "day" },
  { key: "prospectsDay", label: "New prospects", per: "day" },
  { key: "leadsWeek", label: "New leads", per: "week" },
  { key: "quotesWeek", label: "Quotes sent", per: "week" },
];

/** One person's settings over the team default: their own numbers, or off = not on the sales routine at all. */
export type TargetOverride = Partial<Targets> & { off?: boolean };

const okTarget = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000;

/** The team default from the setting (JSON), falling back field by field to DEFAULT_TARGETS. */
export function teamTargets(saved: string): Targets {
  let raw: Record<string, unknown> = {};
  try {
    const p = JSON.parse(saved || "{}");
    if (p && typeof p === "object") raw = p;
  } catch {
    // broken setting: the defaults
  }
  const out = { ...DEFAULT_TARGETS };
  for (const f of TARGET_FIELDS) if (okTarget(raw[f.key])) out[f.key] = raw[f.key] as number;
  return out;
}

/** A person's targets: their own numbers where set, the team's for the rest. */
export function targetsFor(team: Targets, own: TargetOverride | null | undefined): Targets {
  const out = { ...team };
  for (const f of TARGET_FIELDS) if (okTarget(own?.[f.key])) out[f.key] = own![f.key] as number;
  return out;
}

/** What an end-of-day report keeps: the day's numbers and the targets they were measured against. */
export interface DayReportCounts {
  calls: number;
  reached: number;
  messages: number;
  meetings: number;
  prospectsAdded: number;
  leadsWeek: number;
  quotesWeek: number;
  /** Follow-ups still due today when the report was sent (before any were moved). */
  followUpsLeft: number;
  /** The day's check-ins (missed includes ones answered late). Absent on reports from before check-ins. */
  checkIns?: { answered: number; missed: number };
  targets: Targets;
}

/** The daily targets missed by the end of the day (weekly ones are judged on Team Today, not here). */
export function missedDaily(c: Pick<DayReportCounts, "calls" | "prospectsAdded">, t: Targets): string[] {
  const out: string[] = [];
  if (c.calls < t.callsDay) out.push(`calls ${c.calls}/${t.callsDay}`);
  if (c.prospectsAdded < t.prospectsDay) out.push(`new prospects ${c.prospectsAdded}/${t.prospectsDay}`);
  return out;
}

/**
 * The calls nudge: "due" once a third of the day is gone with under 30% of the call target, "late" once two thirds are
 * gone with under 60%. null = on track (or no target).
 */
export function callsNudge(calls: number, target: number, fraction: number): "due" | "late" | null {
  if (target <= 0) return null;
  if (fraction >= 2 / 3 && calls < target * 0.6) return "late";
  if (fraction >= 1 / 3 && calls < target * 0.3) return "due";
  return null;
}

/** Working minutes in the day (break excluded). */
function workMinutes(h: WorkHours) {
  return Math.max(1, h.end - h.start - Math.max(0, h.breakEnd - h.breakStart));
}

/** Share of today's working time already gone, 0..1. */
export function dayFraction(min: number, h: WorkHours): number {
  if (min <= h.start) return 0;
  if (min >= h.end) return 1;
  const inBreak = Math.max(0, Math.min(min, h.breakEnd) - h.breakStart);
  return Math.min(1, Math.max(0, (min - h.start - inBreak) / workMinutes(h)));
}

/** The minute of the day when `fraction` of the working time is gone (the inverse of dayFraction). */
export function minuteAtFraction(fraction: number, h: WorkHours): number {
  const m = h.start + Math.max(0, Math.min(1, fraction)) * workMinutes(h);
  return Math.round(m > h.breakStart && h.breakEnd > h.breakStart ? m + (h.breakEnd - h.breakStart) : m);
}

/** Share of this week's working days gone (Monday-based), counting today by `dayFraction`. */
export function weekFraction(day: string, min: number, h: WorkHours): number {
  const d = new Date(`${day}T00:00:00Z`);
  const todayIdx = (d.getUTCDay() + 6) % 7; // 0 = Monday
  let total = 0;
  let gone = 0;
  for (let i = 0; i < 7; i++) {
    const weekday = (i + 1) % 7; // back to 0 = Sunday
    if (h.offDays.includes(weekday)) continue;
    total++;
    if (i < todayIdx) gone++;
    else if (i === todayIdx) gone += dayFraction(min, h);
  }
  return total ? gone / total : 1;
}

export type Pace = "done" | "on" | "behind" | "idle";

/**
 * Against a target: done, on pace, behind (under 70% of where they should be by now) or idle (nothing yet, a
 * quarter of the day gone). A weekly target counts the days of the week too (`weekFraction` 0..1 at the end of today).
 */
export function pace(done: number, target: number, fraction: number): Pace {
  if (target <= 0) return "on";
  if (done >= target) return "done";
  const expected = target * fraction;
  if (done === 0 && fraction >= 0.25) return "idle";
  return done >= expected * 0.7 ? "on" : "behind";
}

export interface Block {
  key: "before" | "followups" | "calls" | "find" | "break" | "emails" | "deals" | "wrap" | "after" | "off";
  label: string;
  hint: string;
  /** Minutes after midnight it ends (null when the day is over or off). */
  until: number | null;
}

const B = {
  before: { label: "Before work", hint: "Punch in and look at today's list." },
  followups: { label: "Follow-ups first", hint: "Overdue and today's follow-ups, then new leads." },
  calls: { label: "Cold calls", hint: "Work down your call list: call, pick how it went, next." },
  find: { label: "Find new customers", hint: "Add new prospects and check their details." },
  break: { label: "Break", hint: "Back after the break for emails and quotes." },
  emails: { label: "Emails and replies", hint: "Answer replies and send what you promised." },
  deals: { label: "Quotes and deals", hint: "Chase sent quotes and move deals forward." },
  wrap: { label: "Wrap up", hint: "Set next steps on anything open, then your end-of-day report." },
  after: { label: "Day over", hint: "See you tomorrow." },
  off: { label: "Day off", hint: "No routine today." },
} as const;

/** Which part of the routine `min` falls in. Blocks shrink to fit short days and never overlap. */
export function routineBlock(min: number, h: WorkHours, offDay = false): Block {
  if (offDay) return { key: "off", ...B.off, until: null };
  if (min < h.start) return { key: "before", ...B.before, until: h.start };
  if (min >= h.end) return { key: "after", ...B.after, until: null };
  if (min >= h.breakStart && min < h.breakEnd) return { key: "break", ...B.break, until: h.breakEnd };
  const wrapStart = Math.max(h.start, h.end - 30);
  const morningEnd = Math.min(h.breakStart > h.start && h.breakStart < h.end ? h.breakStart : h.end, wrapStart);
  const steps: [Block["key"], number][] = [
    ["followups", Math.min(h.start + 90, morningEnd)],
    ["calls", Math.min(h.start + 210, morningEnd)],
    ["find", morningEnd],
    ["emails", Math.min(Math.max(h.breakEnd, morningEnd) + 60, wrapStart)],
    ["deals", wrapStart],
    ["wrap", h.end],
  ];
  for (const [key, until] of steps) {
    if (min < until) return { key, ...B[key], until };
  }
  return { key: "wrap", ...B.wrap, until: h.end };
}

/** The "what have you done?" check-in: what they can tick, and how the asking works. */
export const CHECKIN_DONE = [
  { key: "calls", label: "Calls" },
  { key: "followups", label: "Follow-ups" },
  { key: "prospects", label: "Found prospects" },
  { key: "emails", label: "Emails or quotes" },
  { key: "meeting", label: "Meeting or visit" },
  { key: "other", label: "Other" },
] as const;
export type CheckInDone = (typeof CHECKIN_DONE)[number]["key"];
export const CHECKIN_DONE_KEYS = CHECKIN_DONE.map((d) => d.key) as [CheckInDone, ...CheckInDone[]];
/** Rings again every 5 minutes, 3 rings in all; unanswered 15 minutes after it was due = missed (admins are told). */
export const CHECKIN_RING_EVERY_MIN = 5;
export const CHECKIN_RINGS = 3;
export const CHECKIN_MISSED_AFTER_MIN = CHECKIN_RING_EVERY_MIN * CHECKIN_RINGS;

/** What the system counted since the last check-in, shown in the window and kept with the answer. */
export interface CheckInCounts {
  calls: number;
  reached: number;
  messages: number;
  meetings: number;
  notes: number;
  prospectsAdded: number;
  quotesSent: number;
}

/** "5 calls (2 talked), 1 new prospect", or "nothing logged". */
export function countsLine(c: CheckInCounts): string {
  const parts: string[] = [];
  const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;
  if (c.calls) parts.push(`${n(c.calls, "call")}${c.reached ? ` (${c.reached} talked)` : ""}`);
  if (c.messages) parts.push(n(c.messages, "message"));
  if (c.meetings) parts.push(n(c.meetings, "meeting"));
  if (c.prospectsAdded) parts.push(n(c.prospectsAdded, "new prospect"));
  if (c.quotesSent) parts.push(n(c.quotesSent, "quote sent", "quotes sent"));
  if (c.notes) parts.push(n(c.notes, "note"));
  return parts.length ? parts.join(", ") : "nothing logged";
}
