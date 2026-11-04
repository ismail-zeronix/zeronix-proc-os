import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { WorkHours } from "@/lib/attendance";
import { workHours } from "@/lib/attendance-data";
import { dubaiToday } from "@/lib/dates";
import { getSetting } from "@/lib/settings";
import { notify, resolveExcept } from "./index";
import { alertTitle, dateTimeline, momentTimeline, ruleConfigs, RULES, stepAt, timerTimeline, type RuleConfig, type RuleKey, type Timeline } from "./rules";
import { shiftDay } from "./work-time";

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
}

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as Row[];
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
const date = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
const dayText = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

async function hitsFor(rule: RuleKey, cfg: RuleConfig, h: WorkHours, today: string): Promise<Hit[]> {
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
    const today = dubaiToday(now);
    let added = 0;
    let resolved = 0;
    for (const rule of RULES) {
      const cfg = configs[rule.key];
      const keep = new Set<string>();
      if (cfg.enabled) {
        for (const hit of await hitsFor(rule.key, cfg, h, today)) {
          const step = stepAt(hit.timeline, now);
          if (!step) continue;
          const key = `${rule.key}:${hit.recordType}:${hit.recordId}:${step}`;
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
