import { AlertTriangle, BadgePercent, Coins, FilePlus2, FileText, Hourglass, Percent } from "lucide-react";
import Link from "next/link";
import { HBarPanel } from "@/components/charts/hbar-panel";
import { TrendPanel } from "@/components/charts/trend-panel";
import { Delta, KpiTile } from "@/components/kpi-tile";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { requireApp } from "@/lib/auth/session";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { type SalesDashboard, salesDashboard } from "@/lib/sales-dashboard";
import { aedShort } from "@/lib/sales";
import { RANGES, type RangeDays } from "@/lib/sales-overview";

export const metadata = { title: "Overview · Zeronix Sales" };

const label = (iso: string, monthly: boolean) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", monthly ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Sales overview: what was quoted and sold, what is waiting for the customer, and what still has to go out. Admins and
 * "All data" users switch between the team and their own numbers; everyone else sees their own quotes and sales orders.
 */
export default async function SalesOverviewPage({ searchParams }: PageProps<"/sales">) {
  const { user, seesAll } = await requireApp("sales");
  const sp = await searchParams;
  const one = (k: string) => String((Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "");
  const range = (RANGES.find((r) => String(r.days) === one("range"))?.days ?? 30) as RangeDays;
  const mine = !seesAll || one("who") === "mine";
  const d = await salesDashboard(user.id, !mine, range);
  const rangeLabel = RANGES.find((r) => r.days === range)!;
  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { range: range === 30 ? "" : String(range), who: mine ? "mine" : "", ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return p.toString() ? `/sales?${p}` : "/sales";
  };
  const monthly = range > 90;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-1 text-sm font-semibold">Sales overview</h1>
        <Segmented items={RANGES.map((r) => ({ href: href({ range: r.days === 30 ? "" : String(r.days) }), label: r.label, title: r.title, active: r.days === range }))} />
        {seesAll && (
          <Segmented
            items={[
              { href: href({ who: "" }), label: "Team", title: "Whole team", active: !mine },
              { href: href({ who: "mine" }), label: "Mine", title: "Only my quotes and sales orders", active: mine },
            ]}
          />
        )}
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
          {rangeLabel.title}, compared with the {range === 365 ? "year" : `${range} days`} before · before VAT
        </span>
        <Button size="sm" nativeButton={false} render={<Link href="/sales/quotes/new" />}>
          <FilePlus2 /> New quote
        </Button>
      </div>

      <Kpis d={d} rangeLabel={rangeLabel.label} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendPanel
            title="Quoted and ordered"
            hint={`${monthly ? "Per month" : "Per week"}, AED before VAT`}
            format="aed"
            points={d.trend.map((t) => ({ label: label(t.start, monthly), quoted: t.quoted, ordered: t.ordered }))}
            series={[
              { key: "quoted", label: "Quoted", color: "var(--series-1)" },
              { key: "ordered", label: "Sales orders", color: "var(--series-2)" },
            ]}
          />
        </div>
        <Leaderboard d={d} rangeLabel={rangeLabel.label} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
        <HBarPanel
          title="Who and what sold"
          hint={rangeLabel.title}
          views={[
            {
              key: "customers",
              label: "Customers",
              unit: "AED",
              format: "aed",
              empty: "No sales orders in this period.",
              data: d.customers.map((c) => ({ label: c.name, value: c.value, note: `${c.orders} sales order${c.orders === 1 ? "" : "s"}` })),
            },
            {
              key: "products",
              label: "Items",
              unit: "AED",
              format: "aed",
              empty: "No sales orders in this period.",
              data: d.products.map((p) => ({ label: p.name, value: p.value, note: `${p.qty} pcs` })),
            },
          ]}
        />
        <div className="lg:col-span-2">
          <Attention d={d} />
        </div>
      </div>
    </div>
  );
}

function Kpis({ d, rangeLabel }: { d: SalesDashboard; rangeLabel: string }) {
  const k = d.kpi;
  const prev = `vs previous ${rangeLabel}`;
  const winRate = k.answeredCur ? Math.round((k.acceptedCur / k.answeredCur) * 100) : null;
  const margin = k.profitCur != null && k.marginBase ? Math.round((k.profitCur / k.marginBase) * 100) : null;
  const spark = d.trend.slice(-12);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <KpiTile
        hero
        label="Sales"
        icon={<Coins />}
        value={aedShort(k.salesCur)}
        hint={`${k.ordersCur} sales order${k.ordersCur === 1 ? "" : "s"}`}
        delta={<Delta cur={k.salesCur} prev={k.salesPrev} label={prev} />}
        spark={spark.map((t) => t.ordered)}
      />
      <KpiTile
        label="Quotes sent"
        icon={<FileText />}
        value={String(k.quotesSentCur)}
        hint={aedShort(k.quotedValueCur)}
        delta={<Delta cur={k.quotesSentCur} prev={k.quotesSentPrev} label={prev} />}
        spark={spark.map((t) => t.quoted)}
      />
      <KpiTile
        label="Quote win rate"
        icon={<Percent />}
        value={winRate == null ? "-" : `${winRate}%`}
        hint={k.answeredCur ? `${k.acceptedCur} of ${k.answeredCur} answered quotes accepted` : "No quote answered yet"}
      />
      <KpiTile label="Waiting for an answer" icon={<Hourglass />} value={aedShort(k.waitingValue)} hint={`${k.waitingCount} sent quote${k.waitingCount === 1 ? "" : "s"}`} />
      <KpiTile
        label="Expected profit"
        icon={<BadgePercent />}
        value={k.profitCur == null ? "-" : aedShort(k.profitCur)}
        hint={margin == null ? "No costs on sales orders yet" : `${margin}% margin on quoted cost`}
        tone={k.profitCur != null && k.profitCur < 0 ? "bad" : undefined}
      />
    </div>
  );
}

function Leaderboard({ d, rangeLabel }: { d: SalesDashboard; rangeLabel: string }) {
  const max = Math.max(1, ...d.people.map((p) => p.sales));
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Sales by salesperson</h2>
        <span className="text-xs text-muted-foreground">{rangeLabel}</span>
      </div>
      <ul className="grid gap-2">
        {d.people.map((p) => (
          <li key={p.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
            <UserAvatar name={p.name} size={26} />
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.orders} sales order{p.orders === 1 ? "" : "s"} · {aedShort(p.waiting)} waiting
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${(p.sales / max) * 100}%`, background: "var(--series-2)" }} />
              </div>
            </div>
            <span className="text-sm font-semibold tabular-nums">{aedShort(p.sales)}</span>
          </li>
        ))}
        {!d.people.length && <li className="text-sm text-muted-foreground">No quotes made yet.</li>}
      </ul>
    </section>
  );
}

function Attention({ d }: { d: SalesDashboard }) {
  const today = dubaiToday();
  const row = "flex flex-wrap items-center justify-between gap-x-3 rounded-md px-2 py-1.5 hover:bg-muted";
  const more = (n: number, href: string) => (n > 8 ? <p className="px-2 pt-1 text-xs text-muted-foreground">+ {n - 8} more. <Link href={href} className="underline">Open the list</Link></p> : null);
  const line = (key: string | number, href: string, number: string, company: string, value: number, right: React.ReactNode) => (
    <Link key={key} href={href} className={row}>
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-mono">{number}</span> <span className="text-muted-foreground">· {company}</span>
      </span>
      <span className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{aedShort(value)}</span>
        {right}
      </span>
    </Link>
  );
  const soon = (day: string) => Date.parse(day) - Date.parse(today) <= 3 * 86400_000;
  const first = d.expired.length ? "expired" : d.waiting.length ? "waiting" : d.toDeliver.length ? "deliver" : "drafts";
  return (
    <section className="h-full rounded-xl border bg-card p-4">
      <Tabs defaultValue={first}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <AlertTriangle className="size-4 text-muted-foreground" /> Needs attention
          </h2>
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="expired">Ran out ({d.expired.length})</TabsTrigger>
            <TabsTrigger value="waiting">Waiting ({d.waiting.length})</TabsTrigger>
            <TabsTrigger value="deliver">To deliver ({d.toDeliver.length})</TabsTrigger>
            <TabsTrigger value="drafts">Drafts ({d.drafts.length})</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="expired" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {d.expired.slice(0, 8).map((q) => line(q.id, `/sales/quotes/${q.id}`, q.number, q.company, q.value, <span className="font-medium text-destructive">ran out {dayLabel(q.validUntil, today)}</span>))}
          {!d.expired.length && <p className="px-2 py-3 text-sm text-muted-foreground">No sent quote has run out without an answer.</p>}
          {more(d.expired.length, "/sales/quotes?status=expired")}
        </TabsContent>
        <TabsContent value="waiting" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {d.waiting.slice(0, 8).map((q) => line(q.id, `/sales/quotes/${q.id}`, q.number, q.company, q.value, <span className={soon(q.validUntil) ? "font-medium text-amber-700 dark:text-amber-400" : ""}>valid until {dayLabel(q.validUntil, today)}</span>))}
          {!d.waiting.length && <p className="px-2 py-3 text-sm text-muted-foreground">No quote is waiting for an answer.</p>}
          {more(d.waiting.length, "/sales/quotes?status=sent")}
        </TabsContent>
        <TabsContent value="deliver" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {d.toDeliver.slice(0, 8).map((o) => line(o.id, `/sales/orders/${o.id}`, o.number, o.company, o.value, <span>since {dayLabel(o.createdAt, today)}</span>))}
          {!d.toDeliver.length && <p className="px-2 py-3 text-sm text-muted-foreground">Every sales order has gone out.</p>}
          {more(d.toDeliver.length, "/sales/orders?view=open")}
        </TabsContent>
        <TabsContent value="drafts" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {d.drafts.slice(0, 8).map((q) => line(q.id, `/sales/quotes/${q.id}`, q.number, q.company, q.value, <span>made {dayLabel(q.createdAt, today)}</span>))}
          {!d.drafts.length && <p className="px-2 py-3 text-sm text-muted-foreground">No draft quotes waiting to be sent.</p>}
          {more(d.drafts.length, "/sales/quotes?status=draft")}
        </TabsContent>
      </Tabs>
    </section>
  );
}
