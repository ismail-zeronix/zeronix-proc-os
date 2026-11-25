import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { REACHED_OUTCOMES } from "@/lib/sales";
import { dubaiToday } from "@/lib/dates";
import { weekStart } from "@/lib/my-day";
import type { Targets } from "@/lib/routine";
import { routineUsers, type RoutineUser } from "@/lib/routine-data";

/**
 * The owner's view of the sales routine (Phase 4): Team Today, and the week / month numbers per salesman, from the
 * timeline (activities), cold calls (prospect_activities), quotes, deals, punches, check-ins and end-of-day reports.
 * One query per measure for everyone at once (the team is small). UAE days.
 */

const REACHED = sql.raw(`(${REACHED_OUTCOMES.map((o) => `'${o}'`).join(", ")})`);
const midnight = (day: string) => new Date(`${day}T00:00:00+04:00`);
const DAY_MS = 86400_000;
const ids = (people: RoutineUser[]) =>
  sql.join(
    people.map((p) => sql`${p.id}`),
    sql`, `,
  );

type Row = Record<string, unknown>;
async function byUser(q: SQL): Promise<Map<number, Row>> {
  const r = await db.execute(q);
  return new Map((r.rows as Row[]).map((x) => [Number(x.user_id), x]));
}
const num = (m: Map<number, Row>, id: number, k: string) => Number(m.get(id)?.[k] ?? 0);

/** Calls, people reached, messages, meetings, leads created, prospects added, quotes sent, per person, from `from`. */
async function activityCounts(people: RoutineUser[], from: Date, to: Date) {
  const list = ids(people);
  const [a, p, q] = await Promise.all([
    byUser(sql`SELECT user_id,
        count(*) FILTER (WHERE type = 'call')::int AS calls,
        count(*) FILTER (WHERE type = 'call' AND outcome IN ${REACHED})::int AS reached,
        count(*) FILTER (WHERE type IN ('whatsapp', 'email'))::int AS messages,
        count(*) FILTER (WHERE type = 'meeting')::int AS meetings,
        count(*) FILTER (WHERE type = 'created')::int AS leads,
        max(at) AS last_at
      FROM activities WHERE user_id IN (${list}) AND at >= ${from} AND at < ${to} GROUP BY user_id`),
    byUser(sql`SELECT user_id,
        count(*) FILTER (WHERE kind = 'call')::int AS calls,
        count(*) FILTER (WHERE kind = 'call' AND outcome IN ${REACHED})::int AS reached,
        count(DISTINCT company_id) FILTER (WHERE kind IN ('created', 'import'))::int AS added,
        max(created_at) AS last_at
      FROM prospect_activities WHERE user_id IN (${list}) AND created_at >= ${from} AND created_at < ${to} GROUP BY user_id`),
    byUser(sql`SELECT coalesce(owner_id, created_by) AS user_id, count(*)::int AS n
      FROM quotes WHERE coalesce(owner_id, created_by) IN (${list}) AND sent_at >= ${from} AND sent_at < ${to} GROUP BY 1`),
  ]);
  return (id: number) => {
    const last = [a.get(id)?.last_at, p.get(id)?.last_at].filter(Boolean).map((v) => new Date(String(v instanceof Date ? v.toISOString() : v)).getTime());
    return {
      calls: num(a, id, "calls") + num(p, id, "calls"),
      reached: num(a, id, "reached") + num(p, id, "reached"),
      messages: num(a, id, "messages"),
      meetings: num(a, id, "meetings"),
      leads: num(a, id, "leads"),
      prospectsAdded: num(p, id, "added"),
      quotesSent: num(q, id, "n"),
      lastAt: last.length ? new Date(Math.max(...last)).toISOString() : null,
    };
  };
}

async function checkInCounts(people: RoutineUser[], fromDay: string, toDay: string) {
  const m = await byUser(sql`SELECT user_id, count(*) FILTER (WHERE answered_at IS NOT NULL)::int AS answered, count(*) FILTER (WHERE missed)::int AS missed
    FROM check_ins WHERE user_id IN (${ids(people)}) AND day >= ${fromDay}::date AND day <= ${toDay}::date GROUP BY user_id`);
  return (id: number) => ({ answered: num(m, id, "answered"), missed: num(m, id, "missed") });
}

export interface TodayRow {
  id: number;
  name: string;
  targets: Targets;
  /** in = punched in now, out = punched out today, away = not in today. */
  status: "in" | "out" | "away";
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  /** Last thing they logged today (or punch-in when nothing yet). */
  lastActivity: string | null;
  calls: number;
  reached: number;
  messages: number;
  meetings: number;
  prospectsAdded: number;
  leads: number;
  quotesSent: number;
  /** Open deals of theirs with the follow-up time passed. */
  overdue: number;
  checkIns: { answered: number; missed: number };
  report: { note: string; behindReason: string; submittedAt: string; moved: number } | null;
}

/** Team Today: one row per person on the sales routine. */
export async function teamToday(now = new Date()): Promise<TodayRow[]> {
  const people = await routineUsers();
  if (!people.length) return [];
  const today = dubaiToday(now);
  const list = ids(people);
  const [counts, checks, punches, overdue, reports] = await Promise.all([
    activityCounts(people, midnight(today), new Date(midnight(today).getTime() + DAY_MS)),
    checkInCounts(people, today, today),
    byUser(sql`SELECT user_id, min(in_at) AS first_in, max(out_at) AS last_out, bool_or(out_at IS NULL) AS open,
        sum(extract(epoch FROM (coalesce(out_at, ${now}) - in_at)) / 60)::float AS worked
      FROM attendance_punches WHERE user_id IN (${list}) AND day = ${today}::date GROUP BY user_id`),
    byUser(sql`SELECT da.user_id, count(*)::int AS n FROM deals d JOIN deal_assignees da ON da.deal_id = d.id
      WHERE da.user_id IN (${list}) AND d.stage NOT IN ('won', 'lost') AND d.follow_up_at < ${now} GROUP BY da.user_id`),
    byUser(sql`SELECT user_id, note, behind_reason, submitted_at, moved FROM daily_reports WHERE user_id IN (${list}) AND day = ${today}::date`),
  ]);
  const iso = (v: unknown) => (v ? new Date(v instanceof Date ? v.getTime() : String(v)).toISOString() : null);
  return people
    .map((p) => {
      const c = counts(p.id);
      const punch = punches.get(p.id);
      const r = reports.get(p.id);
      const firstIn = iso(punch?.first_in);
      return {
        id: p.id,
        name: p.name,
        targets: p.targets,
        status: (!punch ? "away" : punch.open ? "in" : "out") as TodayRow["status"],
        firstIn,
        lastOut: punch && !punch.open ? iso(punch.last_out) : null,
        workedMinutes: Math.round(Number(punch?.worked ?? 0)),
        lastActivity: c.lastAt ?? firstIn,
        calls: c.calls,
        reached: c.reached,
        messages: c.messages,
        meetings: c.meetings,
        prospectsAdded: c.prospectsAdded,
        leads: c.leads,
        quotesSent: c.quotesSent,
        overdue: num(overdue, p.id, "n"),
        checkIns: checks(p.id),
        report: r ? { note: String(r.note), behindReason: String(r.behind_reason ?? ""), submittedAt: iso(r.submitted_at)!, moved: Number(r.moved ?? 0) } : null,
      };
    })
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
}

export type KpiRange = "week" | "month";

export interface KpiRow {
  id: number;
  name: string;
  targets: Targets;
  daysWorked: number;
  calls: number;
  reached: number;
  messages: number;
  meetings: number;
  prospectsAdded: number;
  leads: number;
  quotesSent: number;
  wonCount: number;
  wonValue: number;
  checkIns: { answered: number; missed: number };
  reports: number;
}

export interface TeamKpis {
  from: string;
  to: string;
  rows: KpiRow[];
  /** Calls per working day per person (keys u{id}), oldest first, for the chart. */
  callsByDay: ({ label: string } & Record<string, number | string>)[];
}

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric" });

/** This week (from Monday) or this month (from the 1st) up to today, per person on the routine. */
export async function teamKpis(range: KpiRange, now = new Date()): Promise<TeamKpis> {
  const today = dubaiToday(now);
  const from = range === "week" ? weekStart(today) : `${today.slice(0, 8)}01`;
  const people = await routineUsers();
  if (!people.length) return { from, to: today, rows: [], callsByDay: [] };
  const list = ids(people);
  const end = new Date(midnight(today).getTime() + DAY_MS);
  const [counts, checks, days, won, reports, perDay] = await Promise.all([
    activityCounts(people, midnight(from), end),
    checkInCounts(people, from, today),
    byUser(sql`SELECT user_id, count(DISTINCT day)::int AS n FROM attendance_punches WHERE user_id IN (${list}) AND day >= ${from}::date AND day <= ${today}::date GROUP BY user_id`),
    byUser(sql`SELECT owner_id AS user_id, count(*)::int AS n, coalesce(sum(value_aed), 0)::float AS v
      FROM deals WHERE owner_id IN (${list}) AND stage = 'won' AND closed_at >= ${midnight(from)} AND closed_at < ${end} GROUP BY owner_id`),
    byUser(sql`SELECT user_id, count(*)::int AS n FROM daily_reports WHERE user_id IN (${list}) AND day >= ${from}::date AND day <= ${today}::date GROUP BY user_id`),
    db.execute<{ user_id: number; day: string; n: number }>(sql`
      SELECT user_id, day::text AS day, count(*)::int AS n FROM (
        SELECT user_id, (at AT TIME ZONE 'Asia/Dubai')::date AS day FROM activities WHERE type = 'call' AND user_id IN (${list}) AND at >= ${midnight(from)} AND at < ${end}
        UNION ALL
        SELECT user_id, (created_at AT TIME ZONE 'Asia/Dubai')::date FROM prospect_activities WHERE kind = 'call' AND user_id IN (${list}) AND created_at >= ${midnight(from)} AND created_at < ${end}
      ) x GROUP BY user_id, day`),
  ]);
  const rows: KpiRow[] = people
    .map((p) => {
      const c = counts(p.id);
      return {
        id: p.id,
        name: p.name,
        targets: p.targets,
        daysWorked: num(days, p.id, "n"),
        calls: c.calls,
        reached: c.reached,
        messages: c.messages,
        meetings: c.meetings,
        prospectsAdded: c.prospectsAdded,
        leads: c.leads,
        quotesSent: c.quotesSent,
        wonCount: num(won, p.id, "n"),
        wonValue: num(won, p.id, "v"),
        checkIns: checks(p.id),
        reports: num(reports, p.id, "n"),
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.calls - a.calls);

  const callsByDay: TeamKpis["callsByDay"] = [];
  for (let d = from; d <= today; d = new Date(midnight(d).getTime() + DAY_MS + 4 * 3600_000).toISOString().slice(0, 10)) {
    const point: { label: string } & Record<string, number | string> = { label: dayLabel(d) };
    for (const p of people) point[`u${p.id}`] = perDay.rows.find((r) => Number(r.user_id) === p.id && r.day === d)?.n ?? 0;
    callsByDay.push(point);
  }
  return { from, to: today, rows, callsByDay };
}

export interface DayEvent {
  at: string;
  kind: "punch" | "deal" | "prospect" | "quote" | "check_in" | "report";
  title: string;
  detail: string;
  link: string | null;
  outcome: string | null;
  tone?: "warn";
}

/** Everything one person did on one UAE day, in time order (the row click on Team Today). */
export async function personDay(userId: number, day: string): Promise<DayEvent[]> {
  const from = midnight(day);
  const to = new Date(from.getTime() + DAY_MS);
  const [punches, acts, pacts, quotes, checks, reports] = await Promise.all([
    db.execute<{ in_at: Date; out_at: Date | null; late: boolean; in_reason: string; early: boolean; out_reason: string; auto_closed: boolean }>(sql`
      SELECT in_at, out_at, late, in_reason, early, out_reason, auto_closed FROM attendance_punches WHERE user_id = ${userId} AND day = ${day}::date ORDER BY in_at`),
    db.execute<{ at: Date; type: string; outcome: string | null; body: string; deal_id: number | null; title: string | null; company: string | null }>(sql`
      SELECT a.at, a.type, a.outcome, a.body, a.deal_id, d.title, c.name AS company FROM activities a
      LEFT JOIN deals d ON d.id = a.deal_id LEFT JOIN companies c ON c.id = coalesce(a.company_id, d.company_id)
      WHERE a.user_id = ${userId} AND a.at >= ${from} AND a.at < ${to} ORDER BY a.at`),
    db.execute<{ created_at: Date; kind: string; outcome: string | null; body: string; company_id: number; name: string }>(sql`
      SELECT x.created_at, x.kind, x.outcome, x.body, x.company_id, pc.name FROM prospect_activities x JOIN prospect_companies pc ON pc.id = x.company_id
      WHERE x.user_id = ${userId} AND x.created_at >= ${from} AND x.created_at < ${to} ORDER BY x.created_at`),
    db.execute<{ id: number; number: string; sent_at: Date; company: string }>(sql`
      SELECT q.id, q.number, q.sent_at, c.name AS company FROM quotes q JOIN companies c ON c.id = q.company_id
      WHERE coalesce(q.owner_id, q.created_by) = ${userId} AND q.sent_at >= ${from} AND q.sent_at < ${to}`),
    db.execute<{ due_at: Date; answered_at: Date | null; missed: boolean; done: string[]; note: string }>(sql`
      SELECT due_at, answered_at, missed, done, note FROM check_ins WHERE user_id = ${userId} AND day = ${day}::date`),
    db.execute<{ submitted_at: Date; note: string; behind_reason: string }>(sql`
      SELECT submitted_at, note, behind_reason FROM daily_reports WHERE user_id = ${userId} AND day = ${day}::date`),
  ]);
  const iso = (v: Date | string) => new Date(v).toISOString();
  const out: DayEvent[] = [];
  for (const p of punches.rows) {
    out.push({ at: iso(p.in_at), kind: "punch", title: "Punched in", detail: p.late ? `Late: ${p.in_reason}` : "", link: null, outcome: null, tone: p.late ? "warn" : undefined });
    if (p.out_at)
      out.push({
        at: iso(p.out_at),
        kind: "punch",
        title: p.auto_closed ? "Closed by the system (no punch-out)" : "Punched out",
        detail: p.early ? `Early: ${p.out_reason}` : "",
        link: null,
        outcome: null,
        tone: p.early || p.auto_closed ? "warn" : undefined,
      });
  }
  for (const a of acts.rows)
    out.push({
      at: iso(a.at),
      kind: "deal",
      title: `${a.type === "created" ? "New lead" : a.type[0].toUpperCase() + a.type.slice(1)}${a.title ? `: ${a.title}` : ""}`,
      detail: [a.company, a.body].filter(Boolean).join(" · "),
      link: a.deal_id ? `/crm/deals/${a.deal_id}` : null,
      outcome: a.outcome,
    });
  for (const x of pacts.rows)
    out.push({
      at: iso(x.created_at),
      kind: "prospect",
      title: `${x.kind === "call" ? "Cold call" : x.kind === "created" ? "Prospect added" : x.kind[0].toUpperCase() + x.kind.slice(1)}: ${x.name}`,
      detail: x.body,
      link: `/prospecting/prospects/${x.company_id}`,
      outcome: x.outcome,
    });
  for (const q of quotes.rows) out.push({ at: iso(q.sent_at), kind: "quote", title: `Quote sent: ${q.number}`, detail: q.company, link: `/sales/quotes/${q.id}`, outcome: null });
  for (const c of checks.rows)
    out.push({
      at: iso(c.answered_at ?? c.due_at),
      kind: "check_in",
      title: c.answered_at ? `Check-in${c.missed ? " (answered late)" : ""}` : "Check-in missed",
      detail: c.answered_at ? `${c.done.join(", ")} · ${c.note}` : "Rang 3 times, no answer",
      link: null,
      outcome: null,
      tone: c.missed ? "warn" : undefined,
    });
  for (const r of reports.rows)
    out.push({ at: iso(r.submitted_at), kind: "report", title: "End-of-day report", detail: [r.note, r.behind_reason && `Behind: ${r.behind_reason}`].filter(Boolean).join(" · "), link: null, outcome: null });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
