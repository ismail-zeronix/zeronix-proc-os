import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendPanel } from "@/components/charts/trend-panel";
import { PageToolbar } from "@/components/page-toolbar";
import { StatStrip } from "@/components/stat-strip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { formatDuration } from "@/lib/attendance";
import { requireApp } from "@/lib/auth/session";
import { aedShort } from "@/lib/sales";
import { teamKpis, teamToday, type KpiRange, type TodayRow } from "@/lib/sales-kpis";

export const metadata = { title: "Team · CRM · Zeronix" };

const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "-");
const ago = (iso: string | null, now: number) => {
  if (!iso) return "-";
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};
const AMBER = "text-amber-700 dark:text-amber-400";
const RED = "text-red-700 dark:text-red-400";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
] as const;

/**
 * The owner's view of the sales routine: who is in, what each salesman did today (calls against target, prospects,
 * follow-ups overdue, check-ins, the end-of-day report), and the week / month numbers. Admins and "All data" users.
 */
export default async function TeamPage({ searchParams }: PageProps<"/crm/team">) {
  const { seesAll } = await requireApp("crm");
  if (!seesAll) notFound();
  const sp = await searchParams;
  const range = (RANGES.find((r) => r.key === sp.range)?.key ?? "today") as (typeof RANGES)[number]["key"];

  const switcher = (
    <nav aria-label="Period" className="flex w-fit rounded-lg border p-0.5 text-xs">
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={r.key === "today" ? "/crm/team" : `/crm/team?range=${r.key}`}
          replace
          className={`rounded-md px-2.5 py-1 ${r.key === range ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <PageToolbar title="Team" meta="The sales routine: what each salesman did">
        {switcher}
      </PageToolbar>
      {range === "today" ? <Today /> : <Period range={range} />}
    </div>
  );
}

async function Today() {
  const rows = await teamToday();
  // eslint-disable-next-line react-hooks/purity -- a server render: "how long ago" is measured once, at render time
  const now = Date.now();
  if (!rows.length) return <Empty />;
  const sum = (f: (r: TodayRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const inNow = rows.filter((r) => r.status === "in").length;
  const worked = rows.filter((r) => r.status !== "away");
  return (
    <>
      <StatStrip
        items={[
          { label: "Punched in now", value: `${inNow} of ${rows.length}`, hint: rows.filter((r) => r.status === "away").length ? `${rows.filter((r) => r.status === "away").length} not in today` : "everyone came in" },
          { label: "Calls today", value: `${sum((r) => r.calls)} / ${sum((r) => (r.status === "away" ? 0 : r.targets.callsDay))}`, hint: `${sum((r) => r.reached)} talked` },
          { label: "New prospects · leads", value: `${sum((r) => r.prospectsAdded)} · ${sum((r) => r.leads)}`, hint: `${sum((r) => r.quotesSent)} quotes sent` },
          {
            label: "Reports · check-ins",
            value: `${worked.filter((r) => r.report).length} / ${worked.length}`,
            hint: `check-ins ${sum((r) => r.checkIns.answered)} answered, ${sum((r) => r.checkIns.missed)} missed`,
          },
        ]}
      />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow>
              <TableHead>Salesman</TableHead>
              <TableHead>In / out</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Msgs · meet</TableHead>
              <TableHead className="text-right">Prospects</TableHead>
              <TableHead className="text-right">Leads · quotes</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead>Check-ins</TableHead>
              <TableHead>Report</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const idleMin = r.lastActivity ? (now - new Date(r.lastActivity).getTime()) / 60_000 : 0;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/crm/team/${r.id}`} className="flex items-center gap-2 font-medium hover:underline">
                      <UserAvatar name={r.name} size={24} />
                      <span className="truncate">{r.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${r.status === "in" ? "bg-emerald-500" : r.status === "out" ? "bg-muted-foreground/50" : "bg-red-500"}`} aria-hidden />
                      {r.status === "away" ? "Not in" : r.status === "in" ? `In ${hm(r.firstIn)}` : `${hm(r.firstIn)}–${hm(r.lastOut)}`}
                    </span>
                    {r.status !== "away" && <div className="text-muted-foreground">{formatDuration(r.workedMinutes)}</div>}
                  </TableCell>
                  <TableCell className={`text-xs whitespace-nowrap ${r.status === "in" && idleMin > 90 ? AMBER : "text-muted-foreground"}`}>
                    {r.status === "away" ? "-" : ago(r.lastActivity, now)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={r.status !== "away" && r.calls < r.targets.callsDay ? AMBER : ""}>{r.calls}</span>
                    <span className="text-xs text-muted-foreground">/{r.targets.callsDay}</span>
                    <div className="text-xs text-muted-foreground">{r.reached} talked</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.messages} · {r.meetings}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={r.status !== "away" && r.prospectsAdded < r.targets.prospectsDay ? AMBER : ""}>{r.prospectsAdded}</span>
                    <span className="text-xs text-muted-foreground">/{r.targets.prospectsDay}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.leads} · {r.quotesSent}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${r.overdue ? RED : "text-muted-foreground"}`}>{r.overdue}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {r.checkIns.answered + r.checkIns.missed === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <>
                        {r.checkIns.answered} answered
                        {r.checkIns.missed > 0 && <span className={AMBER}>, {r.checkIns.missed} missed</span>}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="max-w-72 text-xs">
                    {r.report ? (
                      <div className="grid gap-0.5">
                        <span className="text-emerald-700 dark:text-emerald-400">Sent {hm(r.report.submittedAt)}</span>
                        <span className="line-clamp-2 text-muted-foreground" title={r.report.note}>
                          {r.report.note}
                        </span>
                        {r.report.behindReason && <span className={`line-clamp-1 ${AMBER}`}>Behind: {r.report.behindReason}</span>}
                      </div>
                    ) : r.status === "out" ? (
                      <span className={AMBER}>Left without a report</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Amber: under the daily target, or nothing logged for 90 minutes while punched in. Click a name for their day, minute by minute.
      </p>
    </>
  );
}

async function Period({ range }: { range: KpiRange }) {
  const k = await teamKpis(range);
  if (!k.rows.length) return <Empty />;
  const sum = (f: (r: (typeof k.rows)[number]) => number) => k.rows.reduce((n, r) => n + f(r), 0);
  const calls = sum((r) => r.calls);
  const reached = sum((r) => r.reached);
  return (
    <>
      <StatStrip
        items={[
          { label: "Calls", value: calls, hint: `${reached} talked (${calls ? Math.round((reached / calls) * 100) : 0}%)` },
          { label: "New prospects · leads", value: `${sum((r) => r.prospectsAdded)} · ${sum((r) => r.leads)}` },
          { label: "Quotes sent", value: sum((r) => r.quotesSent) },
          { label: "Won", value: aedShort(sum((r) => r.wonValue)), hint: `${sum((r) => r.wonCount)} deals` },
        ]}
      />
      <TrendPanel
        title="Calls per day"
        hint="Deal calls and cold calls each salesman logged"
        points={k.callsByDay}
        series={k.rows.slice(0, 6).map((r, i) => ({ key: `u${r.id}`, label: r.name.split(" ")[0], color: `var(--series-${i + 1})` }))}
      />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table cards>
          <TableHeader>
            <TableRow>
              <TableHead>Salesman</TableHead>
              <TableHead className="text-right">Days in</TableHead>
              <TableHead className="text-right">Calls a day</TableHead>
              <TableHead className="text-right">Talked</TableHead>
              <TableHead className="text-right">Msgs · meet</TableHead>
              <TableHead className="text-right">Prospects</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Quotes</TableHead>
              <TableHead className="text-right">Won</TableHead>
              <TableHead>Check-ins</TableHead>
              <TableHead className="text-right">Reports</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {k.rows.map((r) => {
              const perDay = r.daysWorked ? r.calls / r.daysWorked : 0;
              const weeks = range === "week" ? 1 : Math.max(1, r.daysWorked / 6);
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/crm/team/${r.id}`} className="flex items-center gap-2 font-medium hover:underline">
                      <UserAvatar name={r.name} size={24} />
                      <span className="truncate">{r.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.daysWorked}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={r.daysWorked && perDay < r.targets.callsDay ? AMBER : ""}>{r.daysWorked ? perDay.toFixed(1) : "-"}</span>
                    <span className="text-xs text-muted-foreground">/{r.targets.callsDay}</span>
                    <div className="text-xs text-muted-foreground">{r.calls} in all</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.calls ? `${Math.round((r.reached / r.calls) * 100)}%` : "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.messages} · {r.meetings}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.prospectsAdded}
                    {r.daysWorked > 0 && <div className="text-xs text-muted-foreground">{(r.prospectsAdded / r.daysWorked).toFixed(1)} a day</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={r.leads < r.targets.leadsWeek * weeks ? AMBER : ""}>{r.leads}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={r.quotesSent < r.targets.quotesWeek * weeks ? AMBER : ""}>{r.quotesSent}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {aedShort(r.wonValue)}
                    <div className="text-xs text-muted-foreground">{r.wonCount} deals</div>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {r.checkIns.answered} answered
                    {r.checkIns.missed > 0 && <span className={AMBER}>, {r.checkIns.missed} missed</span>}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${r.reports < r.daysWorked ? AMBER : ""}`}>
                    {r.reports}/{r.daysWorked}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        From {k.from} to today. Won deals count for the deal owner. Amber: under target (leads and quotes against the weekly target, a month counted as 6
        working days a week), or fewer reports than days worked.
      </p>
    </>
  );
}

function Empty() {
  return (
    <p className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground">
      Nobody is on the sales routine yet. Sales users with the CRM app are on it; see Admin › Users › person › Sales routine.
    </p>
  );
}
