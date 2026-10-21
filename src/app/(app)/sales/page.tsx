import { AlertTriangle, CalendarClock, Flame, Handshake, Percent, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { type BarView, HBarPanel } from "@/components/charts/hbar-panel";
import { TrendPanel } from "@/components/charts/trend-panel";
import { Delta, KpiTile } from "@/components/kpi-tile";
import { Segmented } from "@/components/segmented";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { requireApp } from "@/lib/auth/session";
import { dayLabel } from "@/lib/dates";
import { aedShort, OPEN_STAGES, stageLabel } from "@/lib/sales";
import { type Overview, RANGES, type RangeDays, salesOverview } from "@/lib/sales-overview";

export const metadata = { title: "Overview · Zeronix Sales" };

const label = (iso: string, monthly: boolean) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", monthly ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });

export default async function SalesOverviewPage({ searchParams }: PageProps<"/sales">) {
  const { user } = await requireApp("sales");
  const sp = await searchParams;
  const one = (k: string) => String((Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "");
  const range = (RANGES.find((r) => String(r.days) === one("range"))?.days ?? 30) as RangeDays;
  const mine = one("who") === "mine";
  const o = await salesOverview(user.id, !mine, range);
  const rangeLabel = RANGES.find((r) => r.days === range)!;
  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { range: range === 30 ? "" : String(range), who: mine ? "mine" : "", ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return p.toString() ? `/sales?${p}` : "/sales";
  };
  const monthly = range > 90;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-1 text-sm font-semibold">Sales overview</h1>
        <Segmented
          items={RANGES.map((r) => ({ href: href({ range: r.days === 30 ? "" : String(r.days) }), label: r.label, title: r.title, active: r.days === range }))}
        />
        <Segmented
          items={[
            { href: href({ who: "" }), label: "Team", title: "Whole team", active: !mine },
            { href: href({ who: "mine" }), label: "Mine", title: "Only my deals", active: mine },
          ]}
        />
        <span className="ml-auto text-xs text-muted-foreground">{rangeLabel.title}, compared with the {range === 365 ? "year" : `${range} days`} before</span>
      </div>

      <Kpis o={o} range={range} rangeLabel={rangeLabel.label} />

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 [&>section]:h-full">
          <HBarPanel title="Open pipeline by stage" hint="Where today's open deals are" views={stageViews(o)} />
        </div>
        <div className="grid gap-3">
          <LeadMix o={o} />
          <Leaderboard o={o} rangeLabel={rangeLabel.label} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendPanel
            title="New enquiries and wins"
            hint={monthly ? "Per month" : "Per week"}
            points={o.trend.map((t) => ({ label: label(t.start, monthly), created: t.created, won: t.won }))}
            series={[
              { key: "created", label: "New enquiries", color: "var(--series-1)" },
              { key: "won", label: "Won", color: "var(--series-2)" },
            ]}
          />
        </div>
        <HBarPanel
          title="Where deals come from"
          hint={rangeLabel.title}
          views={[
            {
              key: "sources",
              label: "Sources",
              unit: "deals",
              format: "count",
              empty: "No enquiries in this period.",
              data: o.sources.map((s) => ({ label: s.source, value: s.count, note: `${s.won} won (${Math.round((s.won / s.count) * 100)}%)` })),
            },
            {
              key: "lost",
              label: "Lost reasons",
              unit: "deals lost",
              format: "count",
              empty: "No lost deals in this period.",
              data: o.lostReasons.map((l) => ({ label: l.reason, value: l.count })),
            },
          ]}
        />
      </div>

      <Attention o={o} />
    </div>
  );
}

function Kpis({ o, range, rangeLabel }: { o: Overview; range: RangeDays; rangeLabel: string }) {
  const k = o.kpi;
  const closed = k.wonCur + k.lostCur;
  const winRate = closed ? Math.round((k.wonCur / closed) * 100) : null;
  const spark = (pick: (t: Overview["trend"][number]) => number) => o.trend.slice(-12).map(pick);
  const prev = `vs previous ${rangeLabel}`;
  void range;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <KpiTile hero label="Open pipeline" icon={<Handshake />} value={aedShort(k.openValue)} hint={`${k.openCount} open deal${k.openCount === 1 ? "" : "s"}`} />
      <KpiTile label="New enquiries" icon={<Sparkles />} value={String(k.newCur)} delta={<Delta cur={k.newCur} prev={k.newPrev} label={prev} />} spark={spark((t) => t.created)} />
      <KpiTile
        label="Won"
        icon={<Trophy />}
        value={aedShort(k.wonValueCur)}
        hint={`${k.wonCur} deal${k.wonCur === 1 ? "" : "s"}`}
        delta={<Delta cur={k.wonValueCur} prev={k.wonValuePrev} label={prev} />}
        spark={spark((t) => t.wonValue)}
      />
      <KpiTile
        label="Win rate"
        icon={<Percent />}
        value={winRate == null ? "-" : `${winRate}%`}
        hint={closed ? `${k.wonCur} won · ${k.lostCur} lost${k.avgDaysToClose != null ? ` · ${k.avgDaysToClose}d to close` : ""}` : "No deals closed yet"}
      />
      <KpiTile
        label="Overdue follow-ups"
        icon={<CalendarClock />}
        value={String(k.overdueFollowUps)}
        tone={k.overdueFollowUps ? "bad" : undefined}
        hint={k.overdueFollowUps ? "Past due, see below" : "All up to date"}
      />
    </div>
  );
}

function stageViews(o: Overview): BarView[] {
  const row = (key: string) => o.stages.find((s) => s.stage === key);
  const data = (pick: "count" | "value") => OPEN_STAGES.map((s) => ({ label: s.label, value: row(s.key)?.[pick] ?? 0, note: `${row(s.key)?.count ?? 0} deal${row(s.key)?.count === 1 ? "" : "s"}` }));
  return [
    { key: "value", label: "Value", unit: "AED", format: "aed", empty: "No open deals.", data: data("value") },
    { key: "count", label: "Deals", unit: "deals", format: "count", empty: "No open deals.", data: data("count") },
  ];
}

function LeadMix({ o }: { o: Overview }) {
  const t = o.temperature;
  const total = t.hot + t.warm + t.cold;
  // emphasis, not a rainbow: hot stands out in the accent hue, warm in the second, cold recedes
  const segs = [
    { key: "hot", label: "Hot", n: t.hot, color: "var(--series-2)" },
    { key: "warm", label: "Warm", n: t.warm, color: "var(--series-1)" },
    { key: "cold", label: "Cold", n: t.cold, color: "var(--muted-foreground)" },
  ];
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Flame className="size-4 text-muted-foreground" /> Lead quality
        </h2>
        <span className="text-xs text-muted-foreground">{total} open</span>
      </div>
      {total ? (
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segs.map((s) => `${s.label} ${s.n}`).join(", ")}>
          {segs
            .filter((s) => s.n)
            .map((s) => (
              <span key={s.key} className="block h-full" style={{ width: `${(s.n / total) * 100}%`, background: s.color, opacity: s.key === "cold" ? 0.45 : 1 }} title={`${s.label}: ${s.n}`} />
            ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No open deals.</p>
      )}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color, opacity: s.key === "cold" ? 0.45 : 1 }} />
            <span className="font-semibold tabular-nums">{s.n}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">From the genuine-lead checklist on each deal.</p>
    </section>
  );
}

function Leaderboard({ o, rangeLabel }: { o: Overview; rangeLabel: string }) {
  const max = Math.max(1, ...o.team_.map((p) => p.wonValue));
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Won by owner</h2>
        <span className="text-xs text-muted-foreground">{rangeLabel}</span>
      </div>
      <ul className="grid gap-2">
        {o.team_.map((p) => (
          <li key={p.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
            <UserAvatar name={p.name} size={26} />
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.openCount} open · {aedShort(p.openValue)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${(p.wonValue / max) * 100}%`, background: "var(--series-1)" }} />
              </div>
            </div>
            <span className="text-sm font-semibold tabular-nums" title={`${p.wonCount} won`}>
              {aedShort(p.wonValue)}
            </span>
          </li>
        ))}
        {!o.team_.length && <li className="text-sm text-muted-foreground">No deals have an owner yet.</li>}
      </ul>
    </section>
  );
}

function Attention({ o }: { o: Overview }) {
  const more = (n: number, shown: number) => (n > shown ? <p className="px-2 pt-1 text-xs text-muted-foreground">+ {n - shown} more. <Link href="/sales/pipeline" className="underline">Open the pipeline</Link></p> : null);
  const row = "flex flex-wrap items-center justify-between gap-x-3 rounded-md px-2 py-1.5 hover:bg-muted";
  return (
    <section className="rounded-xl border bg-card p-4">
      <Tabs defaultValue={o.overdue.length ? "overdue" : o.quiet.length ? "quiet" : "soon"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <AlertTriangle className="size-4 text-muted-foreground" /> Needs attention
          </h2>
          <TabsList>
            <TabsTrigger value="overdue">Overdue follow-ups ({o.overdue.length})</TabsTrigger>
            <TabsTrigger value="quiet">Going quiet ({o.quiet.length})</TabsTrigger>
            <TabsTrigger value="soon">Closing soon ({o.closingSoon.length})</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overdue" className="grid gap-0.5">
          {o.overdue.slice(0, 8).map((t) => (
            <Link key={t.id} href={`/sales/deals/${t.dealId}`} className={row}>
              <span className="min-w-0 flex-1 truncate text-sm">
                {t.title} <span className="text-muted-foreground">· {t.dealTitle}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserAvatar name={t.assignee} size={18} />
                <span className="font-medium text-destructive">{dayLabel(t.due)}</span>
              </span>
            </Link>
          ))}
          {!o.overdue.length && <p className="px-2 py-3 text-sm text-muted-foreground">No follow-ups are overdue.</p>}
          {more(o.overdue.length, 8)}
        </TabsContent>
        <TabsContent value="quiet" className="grid gap-0.5">
          {o.quiet.slice(0, 8).map((d) => (
            <Link key={d.id} href={`/sales/deals/${d.id}`} className={row}>
              <span className="min-w-0 flex-1 truncate text-sm">
                {d.title} <span className="text-muted-foreground">· {d.company}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {stageLabel(d.stage)} · {d.idleDays}d quiet
              </span>
            </Link>
          ))}
          {!o.quiet.length && <p className="px-2 py-3 text-sm text-muted-foreground">Every open deal has had activity in the last 3 days.</p>}
          {more(o.quiet.length, 8)}
        </TabsContent>
        <TabsContent value="soon" className="grid gap-0.5">
          {o.closingSoon.slice(0, 8).map((d) => (
            <Link key={d.id} href={`/sales/deals/${d.id}`} className={row}>
              <span className="min-w-0 flex-1 truncate text-sm">
                {d.title} <span className="text-muted-foreground">· {d.company}</span>
              </span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{aedShort(d.valueAed)}</span>
                <span className={d.expectedClose < new Date().toISOString().slice(0, 10) ? "font-medium text-destructive" : ""}>{dayLabel(d.expectedClose)}</span>
              </span>
            </Link>
          ))}
          {!o.closingSoon.length && <p className="px-2 py-3 text-sm text-muted-foreground">No deal has an expected close date in the next two weeks.</p>}
          {more(o.closingSoon.length, 8)}
        </TabsContent>
      </Tabs>
    </section>
  );
}
