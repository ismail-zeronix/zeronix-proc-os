/**
 * The "next step" chips shown when a salesman logs a call or message on a deal: each turns into a follow-up time
 * (deals.follow_up_at) inside working hours, skipping off days. Pure, so the form and the tests agree. UAE time (UTC+4).
 */
import { dubaiMinutes, isOffDay, type WorkHours } from "@/lib/attendance";
import { dubaiToday } from "@/lib/dates";

export const NEXT_STEPS = [
  { key: "later", label: "In 2 hours" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "2days", label: "In 2 days" },
  { key: "week", label: "Next week" },
] as const;

export type NextStepKey = (typeof NEXT_STEPS)[number]["key"];

/** The instant a UAE day reaches `minutes` after midnight. */
function at(day: string, minutes: number): Date {
  return new Date(Date.parse(`${day}T00:00:00+04:00`) + minutes * 60_000);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The first working day on or after `day` (gives up after two weeks of off days). */
export function workingDayFrom(day: string, hours: WorkHours): string {
  let d = day;
  for (let i = 0; i < 14 && isOffDay(d, hours); i++) d = addDays(d, 1);
  return d;
}

/** Half an hour after the day starts: time to read mail before calling. */
function morning(hours: WorkHours) {
  return Math.min(hours.start + 30, hours.end);
}

export function nextStepAt(key: NextStepKey, hours: WorkHours, now = new Date()): Date {
  const today = dubaiToday(now);
  if (key === "later") {
    const min = dubaiMinutes(now) + 120;
    // still inside today's hours: two hours from now; otherwise first thing on the next working day
    if (!isOffDay(today, hours) && min < hours.end) return new Date(now.getTime() + 120 * 60_000);
    return at(workingDayFrom(addDays(today, 1), hours), morning(hours));
  }
  const days = key === "tomorrow" ? 1 : key === "2days" ? 2 : 7;
  return at(workingDayFrom(addDays(today, days), hours), morning(hours));
}

/** A date typed in the picker (YYYY-MM-DD) as a follow-up time: that morning. */
export function dayToFollowUp(day: string, hours: WorkHours): Date {
  return at(day, morning(hours));
}
