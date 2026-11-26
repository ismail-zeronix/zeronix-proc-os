import { Clock } from "lucide-react";
import { dubaiMinutes, formatHm, isOffDay } from "@/lib/attendance";
import { workHours } from "@/lib/attendance-data";
import { dubaiToday } from "@/lib/dates";
import { myDay } from "@/lib/my-day";
import { dayFraction, pace, type Pace, routineBlock, weekFraction } from "@/lib/routine";
import { routineFor, teamTargetsNow } from "@/lib/routine-data";
import { TodayList } from "./today-list";

const TONE: Record<Pace, { bar: string; text: string }> = {
  done: { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  on: { bar: "bg-primary", text: "" },
  behind: { bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  idle: { bar: "bg-red-500", text: "text-red-700 dark:text-red-400" },
};

const PACE_HINT: Record<Pace, string> = { done: "Target reached", on: "On pace", behind: "Behind for this time of day", idle: "Nothing yet" };

function Stat({ label, value, target, p, sub }: { label: string; value: number; target?: number; p?: Pace; sub?: string }) {
  const tone = p ? TONE[p] : null;
  return (
    <div className="grid content-start gap-1 bg-card px-3 py-2" title={p ? PACE_HINT[p] : undefined}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg leading-none font-semibold tabular-nums ${tone?.text ?? ""}`}>
        {value}
        {target != null && <span className="text-sm font-normal text-muted-foreground">/{target}</span>}
      </div>
      {target != null && tone && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.round((value / Math.max(1, target)) * 100))}%` }} />
        </div>
      )}
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** The routine block it is now, for the line under the greeting. */
export async function NowLine() {
  const hours = await workHours();
  const min = dubaiMinutes();
  const b = routineBlock(min, hours, isOffDay(dubaiToday(), hours));
  return (
    <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground md:text-sm">
      <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-medium text-foreground">Now: {b.label}</span>
        {b.until != null && <> until {formatHm(b.until)}</>} · {b.hint}
      </span>
    </p>
  );
}

/** Today's numbers against the targets, then the list of what to do. */
export async function MyDaySection({ userId, coldCalls }: { userId: number; coldCalls: boolean }) {
  const [hours, day, routine, team] = await Promise.all([workHours(), myDay(userId, { coldCalls }), routineFor(userId), teamTargetsNow()]);
  const t = routine?.targets ?? team;
  const min = dubaiMinutes();
  const today = dubaiToday();
  const df = dayFraction(min, hours);
  const wf = weekFraction(today, min, hours);
  const c = day.counts;
  const overdue = day.items.filter((i) => i.kind === "overdue").length;
  const dueToday = day.items.filter((i) => i.kind === "today").length;
  return (
    <>
      <section aria-label="Today's numbers" className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-6">
        <Stat label="Calls today" value={c.calls} target={t.callsDay} p={pace(c.calls, t.callsDay, df)} sub={`${c.reached} talked`} />
        <Stat label="Messages · meetings" value={c.messages + c.meetings} sub={`${c.messages} sent · ${c.meetings} met`} />
        <Stat label="New prospects" value={c.prospectsAdded} target={t.prospectsDay} p={pace(c.prospectsAdded, t.prospectsDay, df)} sub="added today" />
        <Stat label="Leads this week" value={c.leadsWeek} target={t.leadsWeek} p={pace(c.leadsWeek, t.leadsWeek, wf)} sub="deals you created" />
        <Stat label="Quotes this week" value={c.quotesWeek} target={t.quotesWeek} p={pace(c.quotesWeek, t.quotesWeek, wf)} sub="sent to customers" />
        <div className="grid content-start gap-1 bg-card px-3 py-2">
          <div className="truncate text-xs text-muted-foreground">Follow-ups due</div>
          <div className={`text-lg leading-none font-semibold tabular-nums ${overdue ? "text-red-700 dark:text-red-400" : ""}`}>{overdue + dueToday}</div>
          <div className={`truncate text-[11px] ${overdue ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>
            {overdue ? `${overdue} overdue` : dueToday ? "all on time" : "nothing due"}
          </div>
        </div>
      </section>
      <TodayList items={day.items} hours={hours} moreCold={day.moreCold} coldCalls={coldCalls} />
    </>
  );
}
