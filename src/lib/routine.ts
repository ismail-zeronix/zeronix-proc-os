/**
 * The salesman's day: targets, how far along they should be by now, and which block of the routine it is.
 * Pure functions only (the home page and the tests share them). All times are UAE time, in minutes after midnight.
 */
import type { WorkHours } from "@/lib/attendance";

/** Default targets until Admin sets them (Phase 3 makes them editable per person). */
export const DEFAULT_TARGETS = { callsDay: 25, prospectsDay: 10, leadsWeek: 5, quotesWeek: 5 };
export type Targets = typeof DEFAULT_TARGETS;

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
