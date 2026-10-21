import "server-only";
import { sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { type Checks, type StageKey, type Temperature, temperature } from "@/lib/sales";

export type RangeDays = 30 | 90 | 365;
export const RANGES: { days: RangeDays; label: string; title: string }[] = [
  { days: 30, label: "30d", title: "Last 30 days" },
  { days: 90, label: "90d", title: "Last 90 days" },
  { days: 365, label: "12m", title: "Last 12 months" },
];

export interface Overview {
  range: RangeDays;
  team: boolean;
  kpi: {
    openCount: number;
    openValue: number;
    newCur: number;
    newPrev: number;
    wonCur: number;
    wonPrev: number;
    wonValueCur: number;
    wonValuePrev: number;
    lostCur: number;
    lostPrev: number;
    avgDaysToClose: number | null;
    overdueFollowUps: number;
  };
  /** Created / won per week (month for a year view), oldest first. */
  trend: { start: string; created: number; won: number; wonValue: number }[];
  stages: { stage: StageKey; count: number; value: number }[];
  temperature: Record<Temperature, number>;
  sources: { source: string; count: number; won: number }[];
  lostReasons: { reason: string; count: number }[];
  team_: { id: number; name: string; wonCount: number; wonValue: number; openCount: number; openValue: number }[];
  overdue: { id: number; title: string; due: string; dealId: number; dealTitle: string; assignee: string }[];
  quiet: { id: number; title: string; company: string; idleDays: number; stage: string }[];
  closingSoon: { id: number; title: string; company: string; expectedClose: string; valueAed: number | null }[];
}

/**
 * Everything the Sales overview shows, for one range and one scope (the whole team, or the deals one person is on).
 * Cached per request so the page's parts share the same queries.
 */
export const salesOverview = cache(async (userId: number, team: boolean, range: RangeDays): Promise<Overview> => {
  const scope = team ? sql`TRUE` : sql`EXISTS (SELECT 1 FROM deal_assignees a WHERE a.deal_id = d.id AND a.user_id = ${userId})`;
  const days = (n: number) => sql`make_interval(days => ${n})`;
  const curStart = sql`now() - ${days(range)}`;
  const prevStart = sql`now() - ${days(range * 2)}`;
  const today = dubaiToday();
  const unit = range > 90 ? "month" : "week";
  const step = range > 90 ? "1 month" : "1 week";

  const [kpi, trend, stages, checks, sources, lost, people, overdue, quiet, closing] = await Promise.all([
    db.execute<Record<string, number | null>>(sql`
      SELECT
        count(*) FILTER (WHERE d.stage NOT IN ('won','lost'))::int AS open_n,
        coalesce(sum(d.value_aed) FILTER (WHERE d.stage NOT IN ('won','lost')), 0)::float AS open_v,
        count(*) FILTER (WHERE d.created_at >= ${curStart})::int AS new_cur,
        count(*) FILTER (WHERE d.created_at >= ${prevStart} AND d.created_at < ${curStart})::int AS new_prev,
        count(*) FILTER (WHERE d.stage = 'won' AND d.closed_at >= ${curStart})::int AS won_cur,
        count(*) FILTER (WHERE d.stage = 'won' AND d.closed_at >= ${prevStart} AND d.closed_at < ${curStart})::int AS won_prev,
        coalesce(sum(d.value_aed) FILTER (WHERE d.stage = 'won' AND d.closed_at >= ${curStart}), 0)::float AS won_v_cur,
        coalesce(sum(d.value_aed) FILTER (WHERE d.stage = 'won' AND d.closed_at >= ${prevStart} AND d.closed_at < ${curStart}), 0)::float AS won_v_prev,
        count(*) FILTER (WHERE d.stage = 'lost' AND d.closed_at >= ${curStart})::int AS lost_cur,
        count(*) FILTER (WHERE d.stage = 'lost' AND d.closed_at >= ${prevStart} AND d.closed_at < ${curStart})::int AS lost_prev,
        (avg(extract(epoch FROM (d.closed_at - d.created_at)) / 86400) FILTER (WHERE d.stage = 'won' AND d.closed_at >= ${curStart}))::float AS avg_days
      FROM deals d WHERE ${scope}`),
    db.execute<{ start: string; created: number; won: number; won_value: number }>(sql`
      WITH b AS (
        SELECT generate_series(date_trunc(${unit}, ${curStart}), date_trunc(${unit}, now()), ${step}::interval) AS start
      )
      SELECT b.start::date::text AS start,
        (SELECT count(*)::int FROM deals d WHERE ${scope} AND d.created_at >= b.start AND d.created_at < b.start + ${step}::interval) AS created,
        (SELECT count(*)::int FROM deals d WHERE ${scope} AND d.stage = 'won' AND d.closed_at >= b.start AND d.closed_at < b.start + ${step}::interval) AS won,
        (SELECT coalesce(sum(d.value_aed), 0)::float FROM deals d WHERE ${scope} AND d.stage = 'won' AND d.closed_at >= b.start AND d.closed_at < b.start + ${step}::interval) AS won_value
      FROM b ORDER BY b.start`),
    db.execute<{ stage: string; n: number; v: number }>(sql`
      SELECT d.stage, count(*)::int AS n, coalesce(sum(d.value_aed), 0)::float AS v
      FROM deals d WHERE d.stage NOT IN ('won','lost') AND ${scope} GROUP BY d.stage`),
    db.execute<{ checks: Checks }>(sql`SELECT d.checks FROM deals d WHERE d.stage NOT IN ('won','lost') AND ${scope}`),
    db.execute<{ source: string; n: number; won: number }>(sql`
      SELECT coalesce(nullif(d.source, ''), 'Not set') AS source, count(*)::int AS n, count(*) FILTER (WHERE d.stage = 'won')::int AS won
      FROM deals d WHERE ${scope} AND d.created_at >= ${curStart} GROUP BY 1 ORDER BY n DESC LIMIT 8`),
    db.execute<{ reason: string; n: number }>(sql`
      SELECT CASE WHEN d.lost_reason LIKE 'Other:%' THEN 'Other' WHEN d.lost_reason = '' THEN 'Not recorded' ELSE d.lost_reason END AS reason, count(*)::int AS n
      FROM deals d WHERE ${scope} AND d.stage = 'lost' AND d.closed_at >= ${curStart} GROUP BY 1 ORDER BY n DESC LIMIT 8`),
    db.execute<{ id: number; name: string; won_n: number; won_v: number; open_n: number; open_v: number }>(sql`
      SELECT u.id, u.name,
        count(*) FILTER (WHERE d.stage = 'won' AND d.closed_at >= ${curStart})::int AS won_n,
        coalesce(sum(d.value_aed) FILTER (WHERE d.stage = 'won' AND d.closed_at >= ${curStart}), 0)::float AS won_v,
        count(*) FILTER (WHERE d.stage NOT IN ('won','lost'))::int AS open_n,
        coalesce(sum(d.value_aed) FILTER (WHERE d.stage NOT IN ('won','lost')), 0)::float AS open_v
      FROM deals d JOIN users u ON u.id = d.owner_id WHERE ${scope}
      GROUP BY u.id, u.name ORDER BY won_v DESC, open_v DESC LIMIT 8`),
    db.execute<{ id: number; title: string; due: string; deal_id: number; deal_title: string; assignee: string }>(sql`
      SELECT t.id, t.title, t.due_date::text AS due, d.id AS deal_id, d.title AS deal_title, u.name AS assignee
      FROM tasks t JOIN deals d ON d.id = t.related_id JOIN users u ON u.id = t.assigned_to
      WHERE t.related_type = 'deal' AND t.status = 'open' AND t.due_date < ${today}::date AND ${scope}
      ORDER BY t.due_date LIMIT 50`),
    db.execute<{ id: number; title: string; company: string; idle: number; stage: string }>(sql`
      SELECT d.id, d.title, c.name AS company, d.stage,
        floor(extract(epoch FROM (now() - greatest(d.created_at, coalesce((SELECT max(a.at) FROM activities a WHERE a.deal_id = d.id), d.created_at)))) / 86400)::int AS idle
      FROM deals d JOIN companies c ON c.id = d.company_id
      WHERE d.stage NOT IN ('won','lost') AND ${scope}
        AND greatest(d.created_at, coalesce((SELECT max(a.at) FROM activities a WHERE a.deal_id = d.id), d.created_at)) < now() - interval '3 days'
      ORDER BY idle DESC LIMIT 30`),
    db.execute<{ id: number; title: string; company: string; close: string; v: number | null }>(sql`
      SELECT d.id, d.title, c.name AS company, d.expected_close::text AS close, d.value_aed::float AS v
      FROM deals d JOIN companies c ON c.id = d.company_id
      WHERE d.stage NOT IN ('won','lost') AND d.expected_close IS NOT NULL AND d.expected_close <= (${today}::date + 14) AND ${scope}
      ORDER BY d.expected_close LIMIT 30`),
  ]);

  const k = kpi.rows[0];
  const n = (v: number | null | undefined) => v ?? 0;
  const temps: Record<Temperature, number> = { hot: 0, warm: 0, cold: 0 };
  for (const r of checks.rows) temps[temperature(r.checks ?? {})]++;

  return {
    range,
    team,
    kpi: {
      openCount: n(k.open_n),
      openValue: n(k.open_v),
      newCur: n(k.new_cur),
      newPrev: n(k.new_prev),
      wonCur: n(k.won_cur),
      wonPrev: n(k.won_prev),
      wonValueCur: n(k.won_v_cur),
      wonValuePrev: n(k.won_v_prev),
      lostCur: n(k.lost_cur),
      lostPrev: n(k.lost_prev),
      avgDaysToClose: k.avg_days == null ? null : Math.round(k.avg_days),
      overdueFollowUps: overdue.rows.length,
    },
    trend: trend.rows.map((r) => ({ start: r.start, created: r.created, won: r.won, wonValue: r.won_value })),
    stages: stages.rows.map((r) => ({ stage: r.stage as StageKey, count: r.n, value: r.v })),
    temperature: temps,
    sources: sources.rows.map((r) => ({ source: r.source, count: r.n, won: r.won })),
    lostReasons: lost.rows.map((r) => ({ reason: r.reason, count: r.n })),
    team_: people.rows.map((r) => ({ id: r.id, name: r.name, wonCount: r.won_n, wonValue: r.won_v, openCount: r.open_n, openValue: r.open_v })),
    overdue: overdue.rows.map((r) => ({ id: r.id, title: r.title, due: r.due, dealId: r.deal_id, dealTitle: r.deal_title, assignee: r.assignee })),
    quiet: quiet.rows.map((r) => ({ id: r.id, title: r.title, company: r.company, idleDays: r.idle, stage: r.stage })),
    closingSoon: closing.rows.map((r) => ({ id: r.id, title: r.title, company: r.company, expectedClose: r.close, valueAed: r.v })),
  };
});
