/**
 * Working-time clock for alert deadlines: "4 hours" means 4 hours of the admin's work hours (UAE time, break and off
 * days left out), so a lead that arrives at closing time is due the next working morning, not in the middle of the night.
 * Pure functions; the UAE is UTC+4 all year (no daylight saving).
 */
import { isOffDay, type WorkHours } from "@/lib/attendance";

const OFFSET = 4 * 3600_000;
const DAY = 86400_000;
const MIN = 60_000;

const dayOf = (localMs: number) => new Date(localMs).toISOString().slice(0, 10);

/** The working windows of a day in minutes after midnight: before and after the break. */
function windows(h: WorkHours): [number, number][] {
  if (h.breakStart > h.start && h.breakEnd < h.end && h.breakStart < h.breakEnd) {
    return [
      [h.start, h.breakStart],
      [h.breakEnd, h.end],
    ];
  }
  return h.start < h.end ? [[h.start, h.end]] : [];
}

/** Working minutes in a normal working day (12 h window minus a 2 h break = 600). */
export function workDayMinutes(h: WorkHours): number {
  return windows(h).reduce((s, [a, b]) => s + (b - a), 0) || 480;
}

/** The moment `minutes` of working time after `from`. With no working hours set up it falls back to the clock. */
export function addWorkMinutes(from: Date, minutes: number, h: WorkHours): Date {
  const w = windows(h);
  if (!w.length || h.offDays.length >= 7) return new Date(from.getTime() + minutes * MIN);
  let local = from.getTime() + OFFSET;
  let left = Math.max(0, minutes);
  for (let i = 0; i < 800; i++) {
    const dayStart = Math.floor(local / DAY) * DAY;
    if (!isOffDay(dayOf(dayStart), h)) {
      for (const [a, b] of w) {
        const ws = dayStart + a * MIN;
        const we = dayStart + b * MIN;
        if (local >= we) continue;
        const s = Math.max(local, ws);
        const avail = (we - s) / MIN;
        if (left <= avail) return new Date(s + left * MIN - OFFSET);
        left -= avail;
        local = we;
      }
    }
    local = dayStart + DAY;
  }
  return new Date(from.getTime() + minutes * MIN);
}

/** Is it working time right now (inside the window, not in the break, not an off day)? */
export function isWorkTime(now: Date, h: WorkHours): boolean {
  const local = now.getTime() + OFFSET;
  const dayStart = Math.floor(local / DAY) * DAY;
  if (isOffDay(dayOf(dayStart), h)) return false;
  const m = (local - dayStart) / MIN;
  return windows(h).some(([a, b]) => m >= a && m < b);
}

/** A UAE calendar day at a time of day (minutes after midnight), as a real moment. */
export function dayAt(day: string, minutes: number): Date {
  return new Date(Date.parse(day + "T00:00:00Z") + minutes * MIN - OFFSET);
}

/** A UAE calendar day moved by n days. */
export function shiftDay(day: string, n: number): string {
  return dayOf(Date.parse(day + "T00:00:00Z") + n * DAY);
}
