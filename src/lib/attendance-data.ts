import "server-only";
import { and, asc, between, eq, isNull, lt } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import {
  dayStatus,
  dubaiMinutes,
  formatHm,
  monthDays,
  toWorkHours,
  type DayStatus,
  type WorkHours,
} from "@/lib/attendance";
import { dubaiToday } from "@/lib/dates";
import { getSettings } from "@/lib/settings";

/** Cached per request: the layout, header and page all ask. */
export const workHours = cache(async (): Promise<WorkHours> => {
  const s = await getSettings();
  return toWorkHours({
    start: s.work_start,
    end: s.work_end,
    breakStart: s.work_break_start,
    breakEnd: s.work_break_end,
    offDays: s.work_off_days,
  });
});

/** The instant a UAE day reaches `minutes` after midnight (the UAE has no daylight saving: always UTC+4). */
function dubaiInstant(day: string, minutes: number): Date {
  return new Date(Date.parse(`${day}T00:00:00+04:00`) + minutes * 60_000);
}

/** Sessions left open on an earlier day are closed at that day's end time (or at punch-in, if that was later). */
export async function closeStaleSessions(userId: number, hours: WorkHours, today = dubaiToday()) {
  const open = await db
    .select({ id: schema.attendancePunches.id, day: schema.attendancePunches.day, inAt: schema.attendancePunches.inAt })
    .from(schema.attendancePunches)
    .where(
      and(
        eq(schema.attendancePunches.userId, userId),
        isNull(schema.attendancePunches.outAt),
        lt(schema.attendancePunches.day, today),
      ),
    );
  for (const p of open) {
    const end = dubaiInstant(p.day, hours.end);
    await db
      .update(schema.attendancePunches)
      .set({ outAt: end > p.inAt ? end : p.inAt, autoClosed: true, outReason: "No punch out (closed by the system)" })
      .where(eq(schema.attendancePunches.id, p.id));
  }
}

export interface PunchState {
  punchedIn: boolean;
  /** ISO time of the open session's punch-in. */
  since: string | null;
  /** Minutes worked today in closed sessions (the open one is added on the client as time passes). */
  closedMinutes: number;
  /** Closed sessions plus the open one up to now. */
  workedMinutes: number;
}

/** Cached per request: the layout (punch gate), the header clock and the home switch all ask. */
export const punchState = cache(async (userId: number): Promise<PunchState> => {
  const hours = await workHours();
  const today = dubaiToday();
  await closeStaleSessions(userId, hours, today);
  const rows = await db
    .select({ inAt: schema.attendancePunches.inAt, outAt: schema.attendancePunches.outAt })
    .from(schema.attendancePunches)
    .where(and(eq(schema.attendancePunches.userId, userId), eq(schema.attendancePunches.day, today)))
    .orderBy(asc(schema.attendancePunches.inAt));
  const open = rows.find((r) => !r.outAt);
  const closedMinutes = rows
    .filter((r) => r.outAt)
    .reduce((n, r) => n + (r.outAt!.getTime() - r.inAt.getTime()) / 60_000, 0);
  const openMinutes = open ? (Date.now() - open.inAt.getTime()) / 60_000 : 0;
  return {
    punchedIn: !!open,
    since: open?.inAt.toISOString() ?? null,
    closedMinutes: Math.round(closedMinutes),
    workedMinutes: Math.round(closedMinutes + openMinutes),
  };
});

export interface DayCell {
  day: string;
  status: DayStatus;
  minutes: number;
  sessions: { in: string; out: string | null; late: boolean; inReason: string; early: boolean; outReason: string; auto: boolean }[];
  absence: { kind: "medical" | "other"; note: string } | null;
}

export interface MonthAttendance {
  month: string;
  cells: DayCell[];
  counts: Record<"present" | "late" | "absent" | "medical" | "other", number>;
  totalMinutes: number;
}

export async function monthAttendance(userId: number, month: string): Promise<MonthAttendance> {
  const hours = await workHours();
  const today = dubaiToday();
  await closeStaleSessions(userId, hours, today);
  const days = monthDays(month);
  const range = between(schema.attendancePunches.day, days[0], days[days.length - 1]);
  const [[user], punches, absences] = await Promise.all([
    db.select({ createdAt: schema.users.createdAt }).from(schema.users).where(eq(schema.users.id, userId)),
    db
      .select()
      .from(schema.attendancePunches)
      .where(and(eq(schema.attendancePunches.userId, userId), range))
      .orderBy(asc(schema.attendancePunches.inAt)),
    db
      .select()
      .from(schema.attendanceAbsences)
      .where(
        and(
          eq(schema.attendanceAbsences.userId, userId),
          between(schema.attendanceAbsences.day, days[0], days[days.length - 1]),
        ),
      ),
  ]);
  const firstDay = user ? dubaiToday(user.createdAt) : today;
  const nowMin = dubaiMinutes();
  const now = Date.now();
  const counts = { present: 0, late: 0, absent: 0, medical: 0, other: 0 };
  let totalMinutes = 0;

  const cells = days.map((day): DayCell => {
    const ps = punches.filter((p) => p.day === day);
    const ab = absences.find((a) => a.day === day);
    const status = dayStatus({ day, today, nowMin, hours, punches: ps, absence: ab?.kind ?? null, firstDay });
    if (status in counts) counts[status as keyof typeof counts]++;
    const minutes = Math.round(ps.reduce((n, p) => n + ((p.outAt?.getTime() ?? now) - p.inAt.getTime()) / 60_000, 0));
    totalMinutes += minutes;
    return {
      day,
      status,
      minutes,
      sessions: ps.map((p) => ({
        in: formatHm(dubaiMinutes(p.inAt)),
        out: p.outAt ? formatHm(dubaiMinutes(p.outAt)) : null,
        late: p.late,
        inReason: p.inReason,
        early: p.early,
        outReason: p.outReason,
        auto: p.autoClosed,
      })),
      absence: ab ? { kind: ab.kind, note: ab.note } : null,
    };
  });
  return { month, cells, counts, totalMinutes };
}

export interface TeamRow {
  user: { id: number; name: string; jobTitle: string };
  data: MonthAttendance;
}

/** Every active person's month, for the admin overview. */
export async function teamMonth(month: string): Promise<TeamRow[]> {
  const people = await db
    .select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle })
    .from(schema.users)
    .where(eq(schema.users.isActive, true))
    .orderBy(asc(schema.users.name));
  return Promise.all(people.map(async (user) => ({ user, data: await monthAttendance(user.id, month) })));
}

/** One short line about someone's day: "In since 9:28 AM", "Out at 6:10 PM", "Not in yet", "Medical leave"... */
export function todayLine(cell: DayCell | undefined): { punchedIn: boolean; label: string } {
  if (!cell) return { punchedIn: false, label: "-" };
  const open = cell.sessions.find((s) => !s.out);
  if (open) return { punchedIn: true, label: `In since ${open.in}` };
  const last = cell.sessions.at(-1);
  if (last) return { punchedIn: false, label: `Out at ${last.out}` };
  const label = {
    today: "Not in yet",
    off: "Day off",
    absent: "Absent",
    medical: "Medical leave",
    other: "Other leave",
    future: "-",
    none: "-",
    present: "-",
    late: "-",
  }[cell.status];
  return { punchedIn: false, label };
}
