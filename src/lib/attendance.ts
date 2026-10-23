/**
 * Work-hours rules for Punch in / Punch out. Pure functions only, so the home-screen switch and the server agree.
 * Not a full attendance system: one working window, one fixed break, weekly off days. All times are UAE time.
 */
import { TZ } from "@/lib/dates";

export interface WorkHours {
  /** Minutes after midnight. */
  start: number;
  end: number;
  breakStart: number;
  breakEnd: number;
  /** Weekdays with no work, 0 = Sunday … 6 = Saturday. */
  offDays: number[];
}

export const DEFAULT_HOURS = {
  start: "09:30",
  end: "21:30",
  breakStart: "14:30",
  breakEnd: "16:30",
  offDays: "0",
} as const;

/** "09:30" -> 570. Bad input gives NaN. */
export function parseHm(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : NaN;
}

/** 570 -> "9:30 AM". */
export function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function toWorkHours(s: { start: string; end: string; breakStart: string; breakEnd: string; offDays: string }): WorkHours {
  const pick = (v: string, d: string) => (Number.isNaN(parseHm(v)) ? parseHm(d) : parseHm(v));
  return {
    start: pick(s.start, DEFAULT_HOURS.start),
    end: pick(s.end, DEFAULT_HOURS.end),
    breakStart: pick(s.breakStart, DEFAULT_HOURS.breakStart),
    breakEnd: pick(s.breakEnd, DEFAULT_HOURS.breakEnd),
    offDays: s.offDays.trim()
      ? s.offDays
          .split(",")
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      : [],
  };
}

/** Minutes after midnight in the UAE. */
export function dubaiMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** 0 = Sunday for a YYYY-MM-DD day. */
export function weekdayOf(day: string): number {
  return new Date(day + "T00:00:00Z").getUTCDay();
}

export function isOffDay(day: string, hours: WorkHours): boolean {
  return hours.offDays.includes(weekdayOf(day));
}

function inBreak(min: number, h: WorkHours) {
  return min >= h.breakStart && min < h.breakEnd;
}

/**
 * Does this punch need a reason?
 * In: after the start time, unless it is during the break (coming back from break on time) or an off day.
 * Out: inside working hours, unless it is during the break or an off day.
 */
export function needsReason(kind: "in" | "out", min: number, offDay: boolean, h: WorkHours): boolean {
  if (offDay || inBreak(min, h)) return false;
  if (kind === "in") return min > h.start;
  return min >= h.start && min < h.end;
}

export const LATE_REASONS = [
  "Traffic or transport delay",
  "Medical or doctor appointment",
  "Client or site visit before office",
  "Personal or family matter",
  "Approved by manager",
] as const;

export const EARLY_REASONS = [
  "Client or site visit",
  "Delivery or supplier pickup",
  "Medical or feeling unwell",
  "Personal or family matter",
  "Approved by manager",
] as const;

/** Joins a picked reason and a typed note into what is stored. "Other" needs the note. */
export function reasonText(choice: string, note: string): string {
  const n = note.trim();
  if (!choice || choice === "Other") return n;
  return n ? `${choice}: ${n}` : choice;
}

export type DayStatus = "present" | "late" | "absent" | "medical" | "other" | "off" | "today" | "future" | "none";

/** The five statuses that get a colour and a legend entry. */
export const STATUS_META: Record<Exclude<DayStatus, "off" | "today" | "future" | "none">, { label: string; glyph: string; color: string }> = {
  present: { label: "Present", glyph: "P", color: "var(--att-present)" },
  late: { label: "Late punch-in", glyph: "L", color: "var(--att-late)" },
  absent: { label: "Absent", glyph: "A", color: "var(--att-absent)" },
  medical: { label: "Absent · medical", glyph: "M", color: "var(--att-medical)" },
  other: { label: "Absent · other reason", glyph: "O", color: "var(--att-other)" },
};

/**
 * The colour of one day. A punch always wins over a recorded absence; the first punch-in of the day decides late or not.
 * Today only becomes "absent" once the working day is over.
 */
export function dayStatus(input: {
  day: string;
  today: string;
  nowMin: number;
  hours: WorkHours;
  /** Punches of that day, oldest first. */
  punches: { late: boolean }[];
  absence?: "medical" | "other" | null;
  /** First day the person could have worked (account created). */
  firstDay: string;
}): DayStatus {
  const { day, today, nowMin, hours, punches, absence, firstDay } = input;
  if (punches.length) return punches[0].late ? "late" : "present";
  if (absence) return absence;
  if (day > today) return "future";
  if (day < firstDay) return "none";
  if (isOffDay(day, hours)) return "off";
  if (day === today) return nowMin < hours.end ? "today" : "absent";
  return "absent";
}

/** "2026-10" -> every YYYY-MM-DD in that month. */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** Month next to "2026-10" by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** "3h 05m" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
