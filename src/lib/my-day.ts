import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { dubaiToday } from "@/lib/dates";
import { REACHED_OUTCOMES } from "@/lib/sales";

/**
 * A salesman's day on the home page: what they have done today (counted from the timeline) and one ordered list of
 * what to do next. Personal: only deals they are on and prospects given to them, whatever their data scope.
 */

export type ItemKind = "overdue" | "today" | "new_lead" | "quote" | "no_step" | "cold";

export interface DayItem {
  key: string;
  kind: ItemKind;
  dealId: number | null;
  prospectId: number | null;
  quoteId: number | null;
  title: string;
  company: string;
  contact: string;
  phone: string;
  whatsapp: string;
  stage: string | null;
  followUpAt: string | null;
  /** Why it is on the list, e.g. "Follow-up was Mon 10:00" or "Quote Q-12 sent 4 days ago". */
  why: string;
  /** For sorting and the red/amber tone: an ISO time, or null. */
  at: string | null;
}

export interface DayCounts {
  /** Deal calls + cold calls logged today. */
  calls: number;
  /** Of those, the ones where someone answered. */
  reached: number;
  messages: number;
  meetings: number;
  prospectsAdded: number;
  leadsWeek: number;
  quotesWeek: number;
}

export interface MyDay {
  counts: DayCounts;
  items: DayItem[];
  /** More cold-call prospects wait than the list shows. */
  moreCold: boolean;
}

const REACHED = sql.raw(`(${REACHED_OUTCOMES.map((o) => `'${o}'`).join(", ")})`);
const CONTACT = sql`('call', 'whatsapp', 'email', 'meeting')`;
const DAY_MS = 86400_000;

/** Midnight UAE of a YYYY-MM-DD day. */
const midnight = (day: string) => new Date(`${day}T00:00:00+04:00`);

/** Monday of the UAE week `day` is in. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const days = (from: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const str = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v == null ? null : new Date(v as string | Date).toISOString());

export async function dayCounts(userId: number, now = new Date()): Promise<DayCounts> {
  const today = dubaiToday(now);
  const dayStart = midnight(today);
  const week = midnight(weekStart(today));
  const [a, p, q] = await Promise.all([
    db.execute<{ calls: number; reached: number; messages: number; meetings: number; leads: number }>(sql`
      SELECT count(*) FILTER (WHERE type = 'call' AND at >= ${dayStart})::int AS calls,
        count(*) FILTER (WHERE type = 'call' AND at >= ${dayStart} AND outcome IN ${REACHED})::int AS reached,
        count(*) FILTER (WHERE type IN ('whatsapp', 'email') AND at >= ${dayStart})::int AS messages,
        count(*) FILTER (WHERE type = 'meeting' AND at >= ${dayStart})::int AS meetings,
        count(*) FILTER (WHERE type = 'created')::int AS leads
      FROM activities WHERE user_id = ${userId} AND at >= ${week < dayStart ? week : dayStart}`),
    db.execute<{ calls: number; reached: number; added: number }>(sql`
      SELECT count(*) FILTER (WHERE kind = 'call')::int AS calls,
        count(*) FILTER (WHERE kind = 'call' AND outcome IN ${REACHED})::int AS reached,
        count(DISTINCT company_id) FILTER (WHERE kind IN ('created', 'import'))::int AS added
      FROM prospect_activities WHERE user_id = ${userId} AND created_at >= ${dayStart}`),
    db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM quotes WHERE coalesce(owner_id, created_by) = ${userId} AND sent_at >= ${week}`),
  ]);
  const A = a.rows[0];
  const P = p.rows[0];
  return {
    calls: A.calls + P.calls,
    reached: A.reached + P.reached,
    messages: A.messages,
    meetings: A.meetings,
    prospectsAdded: P.added,
    leadsWeek: A.leads,
    quotesWeek: q.rows[0].n,
  };
}

export async function myDay(userId: number, opts: { coldCalls: boolean }, now = new Date()): Promise<MyDay> {
  const today = dubaiToday(now);
  const endOfDay = new Date(midnight(today).getTime() + DAY_MS);
  const mine = sql`EXISTS (SELECT 1 FROM deal_assignees da WHERE da.deal_id = d.id AND da.user_id = ${userId})`;

  const [counts, deals, quotes, cold] = await Promise.all([
    dayCounts(userId, now),
    // open deals with a follow-up due by tonight, brand-new leads, and deals with no next step at all
    db.execute(sql`
      SELECT d.id, d.title, d.stage, d.follow_up_at, d.created_at, c.name AS company, coalesce(ct.name, '') AS contact,
        coalesce(nullif(ct.phone, ''), c.phone, '') AS phone, coalesce(nullif(ct.whatsapp, ''), ct.phone, '') AS whatsapp,
        (SELECT max(a.at) FROM activities a WHERE a.deal_id = d.id AND a.type IN ${CONTACT}) AS last_contact
      FROM deals d JOIN companies c ON c.id = d.company_id LEFT JOIN contacts ct ON ct.id = d.contact_id
      WHERE d.stage NOT IN ('won', 'lost') AND ${mine}
        AND (d.follow_up_at < ${endOfDay} OR d.stage = 'new' OR d.follow_up_at IS NULL)`),
    // quotes sent 2+ days ago with no call, message or meeting since, and no follow-up planned
    db.execute(sql`
      SELECT q.id, q.number, q.sent_at, d.id AS deal_id, d.title, d.stage, d.follow_up_at, c.name AS company,
        coalesce(ct.name, '') AS contact, coalesce(nullif(ct.phone, ''), c.phone, '') AS phone, coalesce(nullif(ct.whatsapp, ''), ct.phone, '') AS whatsapp
      FROM quotes q JOIN companies c ON c.id = q.company_id LEFT JOIN deals d ON d.id = q.deal_id
        LEFT JOIN contacts ct ON ct.id = coalesce(q.contact_id, d.contact_id)
      WHERE q.status = 'sent' AND q.sent_at < ${new Date(now.getTime() - 2 * DAY_MS)} AND q.valid_until >= ${today}::date
        AND (d.id IS NULL OR (d.stage NOT IN ('won', 'lost') AND (d.follow_up_at IS NULL OR d.follow_up_at < ${now})))
        AND (coalesce(q.owner_id, q.created_by) = ${userId} OR (d.id IS NOT NULL AND ${mine}))
        AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.deal_id = q.deal_id AND a.type IN ${CONTACT} AND a.at > q.sent_at)
      ORDER BY q.sent_at`),
    // prospects given to them, with a phone, not called in the last 14 days
    opts.coldCalls
      ? db.execute(sql`
          SELECT p.id, p.name, p.industry, coalesce(pp.name, '') AS contact, coalesce(nullif(pp.phone, ''), p.phone) AS phone,
            (SELECT max(x.created_at) FROM prospect_activities x WHERE x.company_id = p.id AND x.kind = 'call') AS last_call
          FROM prospect_companies p
            LEFT JOIN LATERAL (SELECT name, phone FROM prospect_people pp WHERE pp.company_id = p.id
              ORDER BY (pp.phone <> '') DESC, (pp.role_kind = 'decision') DESC, pp.id LIMIT 1) pp ON TRUE
          WHERE p.owner_id = ${userId} AND p.status IN ('sourced', 'researching', 'ready')
            AND (p.snooze_until IS NULL OR p.snooze_until <= ${today}::date)
            AND coalesce(nullif(pp.phone, ''), p.phone) <> ''
            AND NOT EXISTS (SELECT 1 FROM prospect_activities x WHERE x.company_id = p.id AND x.kind = 'call' AND x.created_at > ${new Date(now.getTime() - 14 * DAY_MS)})
          ORDER BY p.score DESC, p.id LIMIT 16`)
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ]);

  const items: DayItem[] = [];
  const seen = new Set<number>();
  const base = (r: Record<string, unknown>) => ({
    company: str(r.company),
    contact: str(r.contact),
    phone: str(r.phone),
    whatsapp: str(r.whatsapp),
  });

  for (const r of deals.rows) {
    const follow = r.follow_up_at ? new Date(r.follow_up_at as string) : null;
    const last = r.last_contact ? new Date(r.last_contact as string) : null;
    const id = Number(r.id);
    const common = { ...base(r), dealId: id, prospectId: null, quoteId: null, title: str(r.title), stage: str(r.stage), followUpAt: iso(r.follow_up_at) };
    let kind: ItemKind;
    let why: string;
    let at: string | null;
    if (follow && follow < now) {
      kind = "overdue";
      why = `Follow-up was ${fmt.format(follow)}`;
      at = follow.toISOString();
    } else if (follow && follow < endOfDay) {
      kind = "today";
      why = `Follow up at ${time.format(follow)}`;
      at = follow.toISOString();
    } else if (r.stage === "new") {
      const created = new Date(r.created_at as string);
      kind = "new_lead";
      why = `New lead, not contacted yet · came in ${days(created, now) ? `${plural(days(created, now), "day")} ago` : `at ${time.format(created)}`}`;
      at = created.toISOString();
    } else if (!follow) {
      kind = "no_step";
      why = last ? `No next follow-up · last contact ${plural(days(last, now), "day")} ago` : "No next follow-up · never contacted";
      at = (last ?? new Date(r.created_at as string)).toISOString();
    } else continue;
    seen.add(id);
    items.push({ key: `d${id}`, kind, why, at, ...common });
  }

  for (const r of quotes.rows) {
    const dealId = r.deal_id == null ? null : Number(r.deal_id);
    if (dealId && seen.has(dealId)) continue;
    if (dealId) seen.add(dealId);
    const sent = new Date(r.sent_at as string);
    items.push({
      key: `q${r.id}`,
      kind: "quote",
      ...base(r),
      dealId,
      prospectId: null,
      quoteId: Number(r.id),
      title: dealId ? str(r.title) : `Quote ${str(r.number)}`,
      stage: dealId ? str(r.stage) : null,
      followUpAt: iso(r.follow_up_at),
      why: `Quote ${str(r.number)} sent ${plural(days(sent, now), "day")} ago, no answer yet`,
      at: sent.toISOString(),
    });
  }

  const coldRows = cold.rows.slice(0, 15);
  for (const r of coldRows) {
    const last = r.last_call ? new Date(r.last_call as string) : null;
    items.push({
      key: `p${r.id}`,
      kind: "cold",
      company: str(r.name),
      contact: str(r.contact),
      phone: str(r.phone),
      whatsapp: "",
      dealId: null,
      prospectId: Number(r.id),
      quoteId: null,
      title: str(r.name),
      stage: null,
      followUpAt: null,
      why: [str(r.industry), last ? `last called ${plural(days(last, now), "day")} ago` : "never called"].filter(Boolean).join(" · "),
      at: last?.toISOString() ?? null,
    });
  }

  const order: ItemKind[] = ["overdue", "today", "new_lead", "quote", "no_step", "cold"];
  const sortAt = (i: DayItem) => (i.at ? Date.parse(i.at) : 0);
  items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.kind === "cold" ? 0 : sortAt(a) - sortAt(b)));
  return { counts, items, moreCold: cold.rows.length > coldRows.length };
}
