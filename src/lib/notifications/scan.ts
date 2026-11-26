import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dubaiMinutes, isOffDay, type WorkHours } from "@/lib/attendance";
import { workHours } from "@/lib/attendance-data";
import { dubaiToday } from "@/lib/dates";
import { markMissedCheckIns, missedToday } from "@/lib/check-in";
import { callsNudge, CHECKIN_MISSED_AFTER_MIN, dayFraction, minuteAtFraction } from "@/lib/routine";
import { routineUsers } from "@/lib/routine-data";
import { getSetting } from "@/lib/settings";
import { notify, resolveExcept } from "./index";
import { alertTitle, dateTimeline, momentTimeline, ruleConfigs, RULES, stepAt, timerTimeline, type RuleConfig, type RuleKey, type Timeline } from "./rules";
import { dayAt, shiftDay } from "./work-time";

/**
 * The rule checker the worker runs every few minutes. For each rule it finds the records that match, works out which
 * step applies now (heads-up, due, critical), puts that step in the right people's bells (once), and resolves every
 * open alert of the rule that no longer matches. Deal alerts go to the deal team; a deal with nobody on it goes to the
 * admins. Task alerts go to the assignee, project alerts to the project manager.
 */

/** Timeline activity types that count as talking to the customer. */
const CONTACT = sql`('call', 'whatsapp', 'email', 'meeting')`;
const OPEN_DEAL = sql`d.stage NOT IN ('won', 'lost')`;
const TEAM = sql`coalesce((SELECT array_agg(da.user_id ORDER BY da.position) FROM deal_assignees da WHERE da.deal_id = d.id), '{}')`;

interface Hit {
  recordType: string;
  recordId: number;
  userIds: number[];
  subject: string;
  body: string;
  link: string;
  timeline: Timeline;
  /** Starts at High even for the heads-up (a high-priority task). */
  urgent?: boolean;
  /** Extra part of the alert key for alerts that repeat on the same record (the sales routine: per day, per idle spell). */
  keyPart?: string;
}

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Row[];
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
const date = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
const dayText = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

async function hitsFor(rule: RuleKey, cfg: RuleConfig, h: WorkHours, today: string, now: Date): Promise<Hit[]> {
  const deal = (r: Row, timeline: Timeline): Hit => ({
    recordType: "deal",
    recordId: Number(r.id),
    userIds: ids(r.team),
    subject: String(r.title),
    body: String(r.company),
    link: `/crm/deals/${r.id}`,
    timeline,
  });
  switch (rule) {
    case "idle_while_punched_in":
    case "day_behind_target":
    case "no_eod_report":
    case "checkin_missed":
      return routineHits(rule, cfg, h, today, now);

    case "lead_not_contacted":
      return (
        await rows(sql`SELECT d.id, d.title, c.name AS company, d.created_at AS start, ${TEAM} AS team
          FROM deals d JOIN companies c ON c.id = d.company_id WHERE d.stage = 'new'`)
      ).map((r) => deal(r, timerTimeline(date(r.start), cfg, "hours", h)));

    case "deal_no_quote":
      return (
        await rows(sql`SELECT d.id, d.title, c.name AS company, d.stage_changed_at AS start, ${TEAM} AS team
          FROM deals d JOIN companies c ON c.id = d.company_id
          WHERE d.stage IN ('requirement', 'sourcing')
            AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.deal_id = d.id AND q.status IN ('sent', 'accepted'))`)
      ).map((r) => deal(r, timerTimeline(date(r.start), cfg, "days", h)));

    case "deal_follow_up":
      return (
        await rows(sql`SELECT d.id, d.title, c.name AS company, d.follow_up_at AS at, ${TEAM} AS team
          FROM deals d JOIN companies c ON c.id = d.company_id WHERE d.follow_up_at IS NOT NULL AND ${OPEN_DEAL}`)
      ).map((r) => deal(r, momentTimeline(date(r.at), cfg, h)));

    case "deal_quiet":
      return (
        await rows(sql`SELECT d.id, d.title, c.name AS company, ${TEAM} AS team,
            greatest(d.created_at, coalesce((SELECT max(a.at) FROM activities a WHERE a.deal_id = d.id), d.created_at)) AS start
          FROM deals d JOIN companies c ON c.id = d.company_id WHERE ${OPEN_DEAL} AND d.stage <> 'new'`)
      ).map((r) => deal(r, timerTimeline(date(r.start), cfg, "days", h)));

    case "deal_close_passed":
      return (
        await rows(sql`SELECT d.id, d.title, c.name AS company, d.expected_close AS day, ${TEAM} AS team
          FROM deals d JOIN companies c ON c.id = d.company_id
          WHERE ${OPEN_DEAL} AND d.expected_close IS NOT NULL AND d.expected_close <= ${shiftDay(today, cfg.warn)}::date`)
      ).map((r) => deal(r, dateTimeline(dayText(r.day), cfg, h)));

    case "quote_no_reply":
    case "quote_expiring": {
      const list = await rows(sql`SELECT q.id, q.number, q.sent_at, q.valid_until, c.name AS company, d.title AS deal_title,
          array_remove(array_cat(${TEAM}, ARRAY[q.owner_id]), NULL) AS team,
          (SELECT max(a.at) FROM activities a WHERE a.deal_id = q.deal_id AND a.type IN ${CONTACT} AND a.at > q.sent_at) AS contacted
        FROM quotes q JOIN companies c ON c.id = q.company_id LEFT JOIN deals d ON d.id = q.deal_id
        WHERE q.status = 'sent' AND q.sent_at IS NOT NULL AND (d.id IS NULL OR ${OPEN_DEAL})
          ${rule === "quote_expiring" ? sql`AND q.valid_until <= ${shiftDay(today, cfg.warn)}::date AND q.valid_until >= ${shiftDay(today, -14)}::date` : sql`AND q.valid_until >= ${today}::date`}`);
      return list.map((r) => ({
        recordType: "quote",
        recordId: Number(r.id),
        userIds: [...new Set(ids(r.team))],
        subject: `${r.number}${r.deal_title ? ` (${r.deal_title})` : ""}`,
        body: String(r.company),
        link: `/sales/quotes/${r.id}`,
        timeline: rule === "quote_expiring" ? dateTimeline(dayText(r.valid_until), cfg, h) : timerTimeline(date(r.contacted ?? r.sent_at), cfg, "days", h),
      }));
    }

    case "task_overdue":
      return (
        await rows(sql`SELECT t.id, t.title, t.due_date, t.priority, t.assigned_to, t.related_type, t.related_id,
            d.title AS deal_title, p.number AS project_number,
            (t.related_type = 'deal' AND (u.role = 'admin' OR u.data_scope = 'all'
              OR EXISTS (SELECT 1 FROM deal_assignees da WHERE da.deal_id = t.related_id AND da.user_id = t.assigned_to))) AS sees_deal
          FROM tasks t JOIN users u ON u.id = t.assigned_to
          LEFT JOIN deals d ON t.related_type = 'deal' AND d.id = t.related_id
          LEFT JOIN projects p ON t.related_type = 'project' AND p.id = t.related_id
          WHERE t.status = 'open' AND t.due_date IS NOT NULL AND t.due_date <= ${shiftDay(today, cfg.warn)}::date`)
      ).map((r) => ({
        recordType: "task",
        recordId: Number(r.id),
        userIds: [Number(r.assigned_to)],
        subject: String(r.title),
        body: r.sees_deal && r.deal_title ? String(r.deal_title) : r.project_number ? `Project ${r.project_number}` : "",
        link: r.sees_deal ? `/crm/deals/${r.related_id}` : r.related_type === "project" ? `/projects/list/${r.related_id}` : "/tasks",
        timeline: dateTimeline(dayText(r.due_date), cfg, h),
        urgent: r.priority === "high",
      }));

    case "project_past_target":
      return (
        await rows(sql`SELECT p.id, p.number, p.target_date, d.title, c.name AS company,
            CASE WHEN p.manager_id IS NOT NULL THEN ARRAY[p.manager_id] ELSE ${TEAM} END AS team
          FROM projects p JOIN deals d ON d.id = p.deal_id JOIN companies c ON c.id = d.company_id
          WHERE d.kind = 'project' AND d.stage = 'won' AND p.status NOT IN ('completed', 'closed', 'cancelled')
            AND p.target_date IS NOT NULL AND p.target_date <= ${shiftDay(today, cfg.warn)}::date`)
      ).map((r) => ({
        recordType: "project",
        recordId: Number(r.id),
        userIds: ids(r.team),
        subject: `${r.number} ${r.title}`,
        body: String(r.company),
        link: `/projects/list/${r.id}`,
        timeline: dateTimeline(dayText(r.target_date), cfg, h),
      }));
  }
}

const hm = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * The sales routine nudges (lib/routine.ts): people on the routine who are punched in and idle, or behind on calls,
 * get them in their own bell; a missing end-of-day report for the last working day goes to the admins (no userIds).
 */
export async function routineHits(
  rule: "idle_while_punched_in" | "day_behind_target" | "no_eod_report" | "checkin_missed",
  cfg: RuleConfig,
  h: WorkHours,
  today: string,
  now: Date,
): Promise<Hit[]> {
  const people = await routineUsers();
  if (!people.length) return [];
  const list = sql.join(
    people.map((p) => sql`${p.id}`),
    sql`, `,
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  const hit = (id: number, subject: string, body: string, link: string, timeline: Timeline, keyPart: string, toAdmins = false): Hit => ({
    recordType: "user",
    recordId: id,
    userIds: toAdmins ? [] : [id],
    subject,
    body,
    link,
    timeline,
    keyPart,
  });

  if (rule === "checkin_missed") {
    return (await missedToday(now))
      .filter((m) => byId.has(m.userId))
      .map((m) => {
        const p = byId.get(m.userId)!;
        const at = new Date(m.dueAt.getTime() + CHECKIN_MISSED_AFTER_MIN * 60_000);
        return hit(
          p.id,
          `${p.name}, ${hm(m.dueAt)}`,
          m.answeredAt ? `Answered late, at ${hm(m.answeredAt)}.` : "Rang 3 times with no answer.",
          `/admin/users/${p.id}`,
          { warnAt: null, dueAt: at, lateAt: null },
          String(m.dueAt.getTime()),
          true,
        );
      });
  }

  if (rule === "no_eod_report") {
    let day = shiftDay(today, -1);
    for (let i = 0; i < 7 && isOffDay(day, h); i++) day = shiftDay(day, -1);
    const missing = await rows(sql`SELECT DISTINCT p.user_id FROM attendance_punches p
      WHERE p.day = ${day}::date AND p.user_id IN (${list})
        AND NOT EXISTS (SELECT 1 FROM daily_reports r WHERE r.user_id = p.user_id AND r.day = p.day)`);
    const due = dayAt(today, h.start);
    return missing.map((r) => {
      const p = byId.get(Number(r.user_id))!;
      return hit(p.id, `${p.name} (${day})`, "Worked that day but sent no end-of-day report.", `/admin/users/${p.id}`, { warnAt: null, dueAt: due, lateAt: null }, day, true);
    });
  }

  // the other two only while someone is punched in on a working day
  if (isOffDay(today, h)) return [];
  const midnight = dayAt(today, 0);
  const open = await rows(sql`SELECT p.user_id, max(p.in_at) AS in_at,
      (SELECT max(a.at) FROM activities a WHERE a.user_id = p.user_id AND a.at >= ${midnight}) AS deal_last,
      (SELECT max(x.created_at) FROM prospect_activities x WHERE x.user_id = p.user_id AND x.created_at >= ${midnight}) AS prospect_last,
      (SELECT count(*) FROM activities a WHERE a.user_id = p.user_id AND a.type = 'call' AND a.at >= ${midnight})::int
        + (SELECT count(*) FROM prospect_activities x WHERE x.user_id = p.user_id AND x.kind = 'call' AND x.created_at >= ${midnight})::int AS calls
    FROM attendance_punches p WHERE p.day = ${today}::date AND p.out_at IS NULL AND p.user_id IN (${list})
    GROUP BY p.user_id`);

  if (rule === "idle_while_punched_in") {
    return open.map((r) => {
      const p = byId.get(Number(r.user_id))!;
      const since = new Date(Math.max(...[r.in_at, r.deal_last, r.prospect_last].filter(Boolean).map((v) => date(v).getTime())));
      return hit(
        p.id,
        `nothing since ${hm(since)}`,
        "Pick the next one on My Day: a follow-up, a call, a new prospect.",
        "/?view=day",
        timerTimeline(since, cfg, "hours", h),
        `${today}:${since.getTime()}`,
      );
    });
  }

  const fraction = dayFraction(dubaiMinutes(now), h);
  const out: Hit[] = [];
  for (const r of open) {
    const p = byId.get(Number(r.user_id))!;
    const calls = Number(r.calls);
    const step = callsNudge(calls, p.targets.callsDay, fraction);
    if (!step) continue;
    const timeline: Timeline = {
      warnAt: null,
      dueAt: dayAt(today, minuteAtFraction(1 / 3, h)),
      lateAt: step === "late" ? dayAt(today, minuteAtFraction(2 / 3, h)) : null,
    };
    out.push(hit(p.id, `${calls} of ${p.targets.callsDay}`, "Your call list is on My Day: call, pick how it went, next.", "/?view=day", timeline, today));
  }
  return out;
}

const g = globalThis as unknown as { __notifyScanning?: boolean };

/** Runs every rule once. Returns how many bell lines were added and how many alerts were resolved. */
export async function runScan(now = new Date()): Promise<{ added: number; resolved: number }> {
  if (g.__notifyScanning) return { added: 0, resolved: 0 };
  g.__notifyScanning = true;
  try {
    const [saved, h, admins] = await Promise.all([
      getSetting("notify_rules"),
      workHours(),
      db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.role, "admin"), eq(schema.users.isActive, true))),
    ]);
    const configs = ruleConfigs(saved);
    // sales routine: check-ins nobody answered become "missed" first, so the checkin_missed rule sees them
    await markMissedCheckIns(now).catch((e) => console.error("check-in scan failed", e));
    const today = dubaiToday(now);
    let added = 0;
    let resolved = 0;
    for (const rule of RULES) {
      const cfg = configs[rule.key];
      const keep = new Set<string>();
      if (cfg.enabled) {
        for (const hit of await hitsFor(rule.key, cfg, h, today, now)) {
          const step = stepAt(hit.timeline, now);
          if (!step) continue;
          const key = `${rule.key}:${hit.recordType}:${hit.recordId}${hit.keyPart ? `:${hit.keyPart}` : ""}:${step}`;
          const userIds = hit.userIds.length ? hit.userIds : admins.map((a) => a.id);
          for (const u of userIds) keep.add(`${u}|${key}`);
          const priority = hit.urgent && step === "warn" ? "high" : rule.priority[step];
          const told = await notify({
            userIds,
            kind: "system",
            rule: rule.key,
            priority,
            title: alertTitle(rule.key, step, hit.subject),
            body: hit.body,
            link: hit.link,
            record: { type: hit.recordType, id: hit.recordId },
            key,
            dueAt: hit.timeline.dueAt,
          });
          added += told.length;
        }
      }
      resolved += await resolveExcept(rule.key, keep);
    }
    return { added, resolved };
  } finally {
    g.__notifyScanning = false;
  }
}
