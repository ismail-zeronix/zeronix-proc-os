import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isOffDay, type WorkHours } from "@/lib/attendance";
import { workHours } from "@/lib/attendance-data";
import { dubaiToday } from "@/lib/dates";
import { addWorkMinutes, isWorkTime } from "@/lib/notifications/work-time";
import { CHECKIN_MISSED_AFTER_MIN, type CheckInCounts, type CheckInDone } from "@/lib/routine";
import { routineFor, routineUsers } from "@/lib/routine-data";
import { getSetting } from "@/lib/settings";
import { UserError } from "@/lib/user-error";

/**
 * The sales routine check-in: every `checkin_minutes` of working time while someone on the routine is punched in, the
 * portal rings, asks "what have you done since …?" and takes a few ticks and a line. The clock restarts at punch-in and
 * at each answer (or at a missed ask). The browser only asks when this says it is due; the worker marks an ask missed
 * once nobody answered for 15 minutes.
 */

export interface CheckInState {
  name: string;
  /** Counting from: punch-in or the last check-in. */
  since: string;
  dueAt: string;
  due: boolean;
  /** Already recorded as missed (an answer now is late but still welcome). */
  missed: boolean;
  counts: CheckInCounts;
}

const midnight = (day: string) => new Date(`${day}T00:00:00+04:00`);

export async function checkInMinutes(): Promise<number> {
  const n = Number(await getSetting("checkin_minutes"));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 600) : 120;
}

/** What they logged between `since` and `until`: deal timeline, cold calls, prospects added, quotes sent. */
export async function countsSince(userId: number, since: Date, until = new Date()): Promise<CheckInCounts> {
  const [a, p, q] = await Promise.all([
    db.execute<{ calls: number; reached: number; messages: number; meetings: number; notes: number }>(sql`
      SELECT count(*) FILTER (WHERE type = 'call')::int AS calls,
        count(*) FILTER (WHERE type = 'call' AND outcome IN ('connected', 'interested', 'quote_requested', 'meeting_set', 'call_back', 'not_interested'))::int AS reached,
        count(*) FILTER (WHERE type IN ('whatsapp', 'email'))::int AS messages,
        count(*) FILTER (WHERE type = 'meeting')::int AS meetings,
        count(*) FILTER (WHERE type = 'note')::int AS notes
      FROM activities WHERE user_id = ${userId} AND at >= ${since} AND at < ${until}`),
    db.execute<{ calls: number; reached: number; added: number }>(sql`
      SELECT count(*) FILTER (WHERE kind = 'call')::int AS calls,
        count(*) FILTER (WHERE kind = 'call' AND outcome IN ('connected', 'interested', 'quote_requested', 'meeting_set', 'call_back', 'not_interested'))::int AS reached,
        count(DISTINCT company_id) FILTER (WHERE kind IN ('created', 'import'))::int AS added
      FROM prospect_activities WHERE user_id = ${userId} AND created_at >= ${since} AND created_at < ${until}`),
    db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM quotes WHERE coalesce(owner_id, created_by) = ${userId} AND sent_at >= ${since} AND sent_at < ${until}`),
  ]);
  const A = a.rows[0];
  const P = p.rows[0];
  return {
    calls: A.calls + P.calls,
    reached: A.reached + P.reached,
    messages: A.messages,
    meetings: A.meetings,
    notes: A.notes,
    prospectsAdded: P.added,
    quotesSent: q.rows[0].n,
  };
}

/**
 * When the next ask is due for this person today, from punch-in or their last check-in. null = nothing to ask today:
 * not on the routine, check-ins off, not punched in, an off day, or the next ask would fall after work ends.
 */
export async function nextCheckIn(userId: number, h: WorkHours, minutes: number, now = new Date()) {
  if (!minutes) return null;
  const today = dubaiToday(now);
  if (isOffDay(today, h)) return null;
  const [open] = await db
    .select({ inAt: schema.attendancePunches.inAt })
    .from(schema.attendancePunches)
    .where(and(eq(schema.attendancePunches.userId, userId), eq(schema.attendancePunches.day, today), isNull(schema.attendancePunches.outAt)))
    .orderBy(desc(schema.attendancePunches.inAt))
    .limit(1);
  if (!open) return null;
  const [last] = await db
    .select({ dueAt: schema.checkIns.dueAt, answeredAt: schema.checkIns.answeredAt, missed: schema.checkIns.missed })
    .from(schema.checkIns)
    .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.day, today)))
    .orderBy(desc(schema.checkIns.dueAt))
    .limit(1);
  // an unanswered miss is still open for a late answer until the next ask comes round
  const lastAt = last ? (last.answeredAt ?? last.dueAt) : null;
  const since = lastAt && lastAt > open.inAt ? lastAt : open.inAt;
  const dueAt = addWorkMinutes(since, minutes, h);
  if (dubaiToday(dueAt) !== today) return null;
  // an unanswered miss can still be answered (late) until the next ask is due; then the new one takes over
  const pendingMiss = last && !last.answeredAt && last.missed && lastAt! >= open.inAt && now < dueAt ? last.dueAt : null;
  return { since, dueAt, inAt: open.inAt, pendingMiss };
}

/** For the browser: is a check-in due now (or when), with what was counted so far. null = none today. */
export async function checkInState(userId: number, now = new Date()): Promise<CheckInState | null> {
  const routine = await routineFor(userId);
  if (!routine) return null;
  const [h, minutes] = await Promise.all([workHours(), checkInMinutes()]);
  const next = await nextCheckIn(userId, h, minutes, now);
  if (!next) return null;
  // a missed ask they have not answered yet: show it again, counting from before it
  if (next.pendingMiss && isWorkTime(now, h)) {
    const [prev] = await db
      .select({ answeredAt: schema.checkIns.answeredAt, dueAt: schema.checkIns.dueAt })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.day, dubaiToday(now)), sql`${schema.checkIns.dueAt} < ${next.pendingMiss}`))
      .orderBy(desc(schema.checkIns.dueAt))
      .limit(1);
    const before = prev ? (prev.answeredAt ?? prev.dueAt) : null;
    const since = before && before > next.inAt ? before : next.inAt;
    return { name: routine.name, since: since.toISOString(), dueAt: next.pendingMiss.toISOString(), due: true, missed: true, counts: await countsSince(userId, since, now) };
  }
  const due = now >= next.dueAt && isWorkTime(now, h);
  return {
    name: routine.name,
    since: next.since.toISOString(),
    dueAt: next.dueAt.toISOString(),
    due,
    missed: false,
    counts: due ? await countsSince(userId, next.since, now) : { calls: 0, reached: 0, messages: 0, meetings: 0, notes: 0, prospectsAdded: 0, quotesSent: 0 },
  };
}

/** Saves the answer to the ask that is due (or the missed one still open). */
export async function answerCheckIn(userId: number, input: { done: CheckInDone[]; note: string }, now = new Date()) {
  const note = input.note.trim();
  if (!input.done.length) throw new UserError("Tick what you did (Other if none fits).");
  if (note.length < 3) throw new UserError("Add one line on what you did.");
  const state = await checkInState(userId, now);
  if (!state?.due) throw new UserError("No check-in is waiting right now.");
  const dueAt = new Date(state.dueAt);
  const row = { answeredAt: now, done: [...new Set(input.done)], note: note.slice(0, 500), counts: state.counts };
  await db
    .insert(schema.checkIns)
    .values({ userId, day: dubaiToday(now), dueAt, ...row })
    .onConflictDoUpdate({ target: [schema.checkIns.organizationId, schema.checkIns.userId, schema.checkIns.dueAt], set: row });
  return { late: state.missed };
}

/** Worker: asks nobody answered 15 minutes after they were due become missed rows (which restart the clock). */
export async function markMissedCheckIns(now = new Date(), only?: number[]): Promise<number> {
  const minutes = await checkInMinutes();
  if (!minutes) return 0;
  const [all, h] = await Promise.all([routineUsers(), workHours()]);
  const people = only ? all.filter((p) => only.includes(p.id)) : all;
  let marked = 0;
  for (const p of people) {
    const next = await nextCheckIn(p.id, h, minutes, now);
    if (!next || next.pendingMiss) continue;
    if (now.getTime() - next.dueAt.getTime() < CHECKIN_MISSED_AFTER_MIN * 60_000) continue;
    const done = await db
      .insert(schema.checkIns)
      .values({ userId: p.id, day: dubaiToday(now), dueAt: next.dueAt, missed: true })
      .onConflictDoNothing()
      .returning({ id: schema.checkIns.id });
    marked += done.length;
  }
  return marked;
}

/** Today's check-ins of everyone on the routine who missed one (the admins' alert). */
export async function missedToday(now = new Date()) {
  return db
    .select({ id: schema.checkIns.id, userId: schema.checkIns.userId, dueAt: schema.checkIns.dueAt, answeredAt: schema.checkIns.answeredAt })
    .from(schema.checkIns)
    .where(and(eq(schema.checkIns.missed, true), eq(schema.checkIns.day, dubaiToday(now)), gte(schema.checkIns.dueAt, midnight(dubaiToday(now)))));
}
