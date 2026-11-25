import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { workHours } from "@/lib/attendance-data";
import { dubaiToday } from "@/lib/dates";
import { dayCounts, myDay } from "@/lib/my-day";
import { nextStepAt } from "@/lib/next-step";
import { missedDaily, type DayReportCounts, type Targets } from "@/lib/routine";
import { routineFor } from "@/lib/routine-data";
import { UserError } from "@/lib/user-error";

/**
 * The start-of-day and end-of-day sheets of the sales routine. A salesman on the routine (lib/routine-data.ts) sends
 * one end-of-day report per UAE day before punching out: today's numbers (filled in), the follow-ups still due today
 * (moved to the next working morning in one go), a short note, and why when a daily target was missed.
 */

const DAY_MS = 86400_000;
const midnight = (day: string) => new Date(`${day}T00:00:00+04:00`);

export interface LeftFollowUp {
  dealId: number;
  title: string;
  company: string;
  followUpAt: string;
}

export interface EndOfDaySheet {
  day: string;
  counts: DayReportCounts;
  missed: string[];
  left: LeftFollowUp[];
  /** Where "move them" puts the leftovers: the next working morning. */
  moveTo: string;
  sent: { note: string; behindReason: string; submittedAt: string } | null;
}

/** Open deals of theirs with a follow-up due before tonight (overdue ones included). */
async function leftovers(userId: number, today: string): Promise<LeftFollowUp[]> {
  const end = new Date(midnight(today).getTime() + DAY_MS);
  const r = await db.execute<{ id: number; title: string; company: string; follow_up_at: Date | string }>(sql`
    SELECT d.id, d.title, c.name AS company, d.follow_up_at FROM deals d JOIN companies c ON c.id = d.company_id
    WHERE d.stage NOT IN ('won', 'lost') AND d.follow_up_at < ${end}
      AND EXISTS (SELECT 1 FROM deal_assignees da WHERE da.deal_id = d.id AND da.user_id = ${userId})
    ORDER BY d.follow_up_at`);
  return r.rows.map((x) => ({ dealId: Number(x.id), title: x.title, company: x.company, followUpAt: new Date(x.follow_up_at).toISOString() }));
}

async function sentToday(userId: number, day: string) {
  const [r] = await db
    .select({ note: schema.dailyReports.note, behindReason: schema.dailyReports.behindReason, submittedAt: schema.dailyReports.submittedAt })
    .from(schema.dailyReports)
    .where(and(eq(schema.dailyReports.userId, userId), eq(schema.dailyReports.day, day)));
  return r ?? null;
}

/** Has this person still to send today's report before punching out? False for anyone not on the routine. */
export async function reportDue(userId: number, now = new Date()): Promise<boolean> {
  if (!(await routineFor(userId))) return false;
  return !(await sentToday(userId, dubaiToday(now)));
}

async function countsFor(userId: number, targets: Targets, left: number, now: Date): Promise<DayReportCounts> {
  const [c, [ci]] = await Promise.all([
    dayCounts(userId, now),
    db
      .select({
        answered: sql<number>`count(*) FILTER (WHERE ${schema.checkIns.answeredAt} IS NOT NULL)::int`,
        missed: sql<number>`count(*) FILTER (WHERE ${schema.checkIns.missed})::int`,
      })
      .from(schema.checkIns)
      .where(and(eq(schema.checkIns.userId, userId), eq(schema.checkIns.day, dubaiToday(now)))),
  ]);
  return { ...c, followUpsLeft: left, targets, checkIns: { answered: ci?.answered ?? 0, missed: ci?.missed ?? 0 } };
}

export async function endOfDaySheet(userId: number, now = new Date()): Promise<EndOfDaySheet | null> {
  const routine = await routineFor(userId);
  if (!routine) return null;
  const day = dubaiToday(now);
  const [left, sent, hours] = await Promise.all([leftovers(userId, day), sentToday(userId, day), workHours()]);
  const counts = await countsFor(userId, routine.targets, left.length, now);
  return {
    day,
    counts,
    missed: missedDaily(counts, routine.targets),
    left,
    moveTo: nextStepAt("tomorrow", hours, now).toISOString(),
    sent: sent && { note: sent.note, behindReason: sent.behindReason, submittedAt: sent.submittedAt.toISOString() },
  };
}

export interface ReportInput {
  note: string;
  behindReason: string;
  /** Move today's leftover follow-ups to the next working morning. */
  move: boolean;
}

/** Saves today's report (sending again replaces it) and moves the leftovers when asked. Returns how many moved. */
export async function saveReport(userId: number, input: ReportInput, now = new Date()): Promise<{ moved: number }> {
  const routine = await routineFor(userId);
  if (!routine) throw new UserError("The end-of-day report is only for the sales team.");
  const note = input.note.trim();
  const behindReason = input.behindReason.trim();
  if (note.length < 5) throw new UserError("Write a short note on your day: what moved, anything stuck.");
  const day = dubaiToday(now);
  const [left, hours] = await Promise.all([leftovers(userId, day), workHours()]);
  const counts = await countsFor(userId, routine.targets, left.length, now);
  if (missedDaily(counts, routine.targets).length && behindReason.length < 3) throw new UserError("Say why the daily targets were missed (a few words).");

  const moveTo = nextStepAt("tomorrow", hours, now);
  const when = moveTo.toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const moving = input.move ? left : [];
  await db.transaction(async (tx) => {
    if (moving.length) {
      const ids = moving.map((l) => l.dealId);
      const deals = await tx.select({ id: schema.deals.id, companyId: schema.deals.companyId }).from(schema.deals).where(inArray(schema.deals.id, ids));
      await tx.update(schema.deals).set({ followUpAt: moveTo }).where(inArray(schema.deals.id, ids));
      await tx
        .insert(schema.activities)
        .values(deals.map((d) => ({ type: "note", body: `Follow-up moved to ${when} (end-of-day report).`, dealId: d.id, companyId: d.companyId, userId })));
    }
    const row = { counts, note: note.slice(0, 2000), behindReason: behindReason.slice(0, 500), moved: moving.length, submittedAt: now };
    await tx
      .insert(schema.dailyReports)
      .values({ userId, day, ...row })
      .onConflictDoUpdate({ target: [schema.dailyReports.organizationId, schema.dailyReports.userId, schema.dailyReports.day], set: row });
  });
  return { moved: moving.length };
}

export interface StartOfDaySheet {
  name: string;
  targets: Targets;
  /** The last working day they reported or worked on, with its numbers (null on their first day). */
  last: { day: string; calls: number; reached: number; prospectsAdded: number; note: string } | null;
  overdue: number;
  today: number;
  newLeads: number;
  quotes: number;
  callList: number;
}

/** What the punch-in sheet shows: the last report's numbers, today's targets and how long today's list is. */
export async function startOfDaySheet(userId: number, now = new Date()): Promise<StartOfDaySheet | null> {
  const routine = await routineFor(userId);
  if (!routine) return null;
  const day = dubaiToday(now);
  const [[last], list] = await Promise.all([
    db
      .select({ day: schema.dailyReports.day, counts: schema.dailyReports.counts, note: schema.dailyReports.note })
      .from(schema.dailyReports)
      .where(and(eq(schema.dailyReports.userId, userId), sql`${schema.dailyReports.day} < ${day}::date`))
      .orderBy(sql`${schema.dailyReports.day} desc`)
      .limit(1),
    myDay(userId, { coldCalls: true }, now),
  ]);
  const n = (k: string) => list.items.filter((i) => i.kind === k).length;
  return {
    name: routine.name,
    targets: routine.targets,
    last: last ? { day: last.day, calls: last.counts.calls, reached: last.counts.reached, prospectsAdded: last.counts.prospectsAdded, note: last.note } : null,
    overdue: n("overdue"),
    today: n("today"),
    newLeads: n("new_lead"),
    quotes: n("quote"),
    callList: n("cold") + (list.moreCold ? 1 : 0),
  };
}
