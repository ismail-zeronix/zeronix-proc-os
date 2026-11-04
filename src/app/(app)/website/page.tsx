import { CircleAlert, Clock, Eye, Handshake, MousePointerClick, Percent, Search, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { HBarPanel } from "@/components/charts/hbar-panel";
import { TrendPanel } from "@/components/charts/trend-panel";
import { Delta, KpiTile } from "@/components/kpi-tile";
import { Segmented } from "@/components/segmented";
import { requireApp } from "@/lib/auth/session";
import { aedShort } from "@/lib/sales";
import { overview, RANGES, type Overview } from "@/lib/website/analytics";
import { getGsc, searchOverview } from "@/lib/website/gsc";
import { contentCounts, setupChecks } from "@/lib/website/overview";
import { StarterButton } from "./starter-button";
import { PhoneCards } from "@/components/phone-cards";

export const metadata = { title: "Overview · Zeronix Website" };

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");
const duration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`);

export default async function WebsiteOverviewPage({ searchParams }: PageProps<"/website">) {
  const { user } = await requireApp("website");
  const sp = await searchParams;
  const range = RANGES.find((r) => String(r) === String(sp.range ?? "")) ?? 30;
  const [o, checks, n, gsc] = await Promise.all([overview(range), setupChecks(), contentCounts(), getGsc()]);
  // Google numbers only once Search Console is connected (Website › Settings)
  const search = gsc?.credentials ? await searchOverview(o.period.from, o.period.to) : null;
  const missing = checks.filter((c) => !c.ok);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-1 text-sm font-semibold">Website overview</h1>
        <Segmented items={RANGES.map((d) => ({ href: d === 30 ? "/website" : `/website?range=${d}`, label: `${d}d`, title: `Last ${d} days`, active: d === range }))} />
        <span className="ml-auto text-xs text-muted-foreground">
          Last {range} days, compared with the {range} days before · UAE time · updated every 15 minutes
        </span>
        {user.role === "admin" && n.industries.total + n.categories.total === 0 && <StarterButton />}
      </div>

      {missing.length > 0 && (
        <details className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <CircleAlert className="size-4 text-amber-600" aria-hidden /> {missing.length} setup step{missing.length === 1 ? "" : "s"} left before go-live
          </summary>
          <ul className="mt-2 grid gap-1 text-xs">
            {missing.map((c) => (
              <li key={c.label}>
                <span className="font-medium">{c.label}:</span> <span className="text-muted-foreground">{c.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Kpis o={o} range={range} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendPanel
            title="Traffic"
            hint="Visitors and page views per day"
            points={o.daily.map((d) => ({ label: dayLabel(String(d.day)), visitors: d.visitors, views: d.views }))}
            series={[
              { key: "visitors", label: "Visitors", color: "var(--series-1)" },
              { key: "views", label: "Page views", color: "var(--series-2)" },
            ]}
          />
        </div>
        <HBarPanel
          title="From visit to deal"
          hint={`Last ${range} days`}
          views={[
            {
              key: "funnel",
              label: "Funnel",
              unit: "",
              format: "count",
              empty: "No visits yet.",
              data: o.funnel.map((f, i) => ({ label: f.label, value: f.value, note: i ? `${pct(f.value, o.funnel[i - 1].value)} of the step before` : undefined })),
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendPanel
            title="Leads"
            hint="Call-to-action clicks, chat leads and quote requests per day"
            points={o.daily.map((d) => ({ label: dayLabel(String(d.day)), cta: d.cta, chats: d.chat_lead, quotes: d.quote }))}
            series={[
              { key: "cta", label: "CTA clicks", color: "var(--series-1)" },
              { key: "chats", label: "Chat leads", color: "var(--series-2)" },
              { key: "quotes", label: "Quote requests", color: "var(--series-3)" },
            ]}
          />
        </div>
        <HBarPanel
          title="Where visitors come from"
          hint="Sessions by the source of their first page"
          views={[
            { key: "sessions", label: "Sessions", unit: "sessions", format: "count", empty: "No visits yet.", data: o.sources.map((s) => ({ label: s.label, value: s.sessions, note: `${s.leads} became a lead` })) },
            { key: "leads", label: "Leads", unit: "leads", format: "count", empty: "No leads yet.", data: o.sources.filter((s) => s.leads).map((s) => ({ label: s.label, value: s.leads, note: `${pct(s.leads, s.sessions)} of sessions` })) },
          ]}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
        <TopPages o={o} className="lg:col-span-2" />
        <HBarPanel
          title="Audience"
          hint={`Last ${range} days`}
          views={[
            { key: "industries", label: "Industry", unit: "quote requests", format: "count", empty: "No quote requests yet.", data: o.industries },
            { key: "chats", label: "Chats", unit: "chats", format: "count", empty: "No chats yet.", data: o.chatsBySite },
            { key: "devices", label: "Devices", unit: "sessions", format: "count", empty: "No visits yet.", data: o.devices },
            { key: "countries", label: "Countries", unit: "sessions", format: "count", empty: "No visits yet.", data: o.countries },
          ]}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
        <RecentLeads o={o} />
        <TrendPanel
          title="Publishing pace"
          hint={`Posts published per week · ${n.posts.published} live, ${n.posts.total - n.posts.published} not published`}
          points={o.publishing.map((w) => ({ label: dayLabel(w.week), posts: w.posts }))}
          series={[{ key: "posts", label: "Posts", color: "var(--series-1)" }]}
        />
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Search className="size-4 text-muted-foreground" aria-hidden /> Google Search
          </h2>
          {search ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {[
                ["Clicks", search.totals.clicks.toLocaleString("en-US")],
                ["Impressions", search.totals.impressions.toLocaleString("en-US")],
                ["Click rate", pct(search.totals.clicks, search.totals.impressions)],
                ["Avg position", search.totals.position ? search.totals.position.toFixed(1) : "–"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Clicks, impressions, top queries and average position from Google Search Console appear here once it is connected in{" "}
              <Link href="/website/settings" className="text-primary hover:underline">
                Website › Settings
              </Link>
              .
            </p>
          )}
          <p className="mt-auto text-xs text-muted-foreground">
            Catalog: {n.industries.published} industries, {n.products.published} products, {n.brands.published} brands live.
          </p>
        </section>
      </div>

      {search && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TrendPanel
              title="Clicks from Google"
              hint="Per day, from Search Console (about two days behind)"
              points={o.period.days.map((d) => ({ label: dayLabel(d), clicks: search.daily.find((x) => x.day === d)?.clicks ?? 0 }))}
              series={[{ key: "clicks", label: "Clicks", color: "var(--series-1)" }]}
            />
          </div>
          <section className="min-w-0 rounded-xl border bg-card">
            <header className="flex items-center gap-2 px-4 pt-3 pb-2">
              <h2 className="text-sm font-medium">Top Google searches</h2>
              <Link href="/website/seo?tab=opportunities" className="ml-auto text-xs text-primary hover:underline">
                Opportunities
              </Link>
            </header>
            {search.top.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">No searches yet in this period.</p>
            ) : (
              <PhoneCards><table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-y">
                    <th className="px-4 py-1.5 text-left font-medium">Search</th>
                    <th className="px-2 py-1.5 text-right font-medium">Clicks</th>
                    <th className="px-4 py-1.5 text-right font-medium">Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {search.top.map((q) => (
                    <tr key={q.query}>
                      <td className="max-w-0 truncate px-4 py-1.5" title={`${q.impressions} impressions`}>
                        {q.query}
                      </td>
                      <td className="px-2 py-1.5 text-right">{q.clicks}</td>
                      <td className="px-4 py-1.5 text-right">{q.position ? q.position.toFixed(1) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table></PhoneCards>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Kpis({ o, range }: { o: Overview; range: number }) {
  const { now, before } = o.totals;
  const v = (t: Record<string, number>, k: string) => t[k] ?? 0;
  const prev = `vs previous ${range}d`;
  const engaged = (t: Record<string, number>) => (v(t, "views") ? Math.round(v(t, "engaged_s") / v(t, "views")) : 0);
  const conv = (leads: number, t: Record<string, number>) => (v(t, "sessions") ? leads / v(t, "sessions") : 0);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <KpiTile
        hero
        label="Visitors"
        icon={<Users />}
        value={v(now, "visitors").toLocaleString("en-US")}
        spark={o.daily.map((d) => Number(d.visitors))}
        delta={<Delta cur={v(now, "visitors")} prev={v(before, "visitors")} label={prev} />}
        hint={`${v(now, "sessions").toLocaleString("en-US")} sessions`}
      />
      <KpiTile label="Page views" icon={<Eye />} value={v(now, "views").toLocaleString("en-US")} delta={<Delta cur={v(now, "views")} prev={v(before, "views")} label={prev} />} />
      <KpiTile label="Time on page" icon={<Clock />} value={duration(engaged(now))} delta={<Delta cur={engaged(now)} prev={engaged(before)} label={prev} />} hint="average" />
      <KpiTile label="CTA clicks" icon={<MousePointerClick />} value={v(now, "cta").toLocaleString("en-US")} delta={<Delta cur={v(now, "cta")} prev={v(before, "cta")} label={prev} />} />
      <KpiTile
        label="Leads"
        icon={<Handshake />}
        value={String(o.leads.now)}
        delta={<Delta cur={o.leads.now} prev={o.leads.before} label={prev} />}
        hint={`${o.leads.quotes} quotes, ${o.leads.chats} chats`}
      />
      <KpiTile
        label="Conversion"
        icon={<Percent />}
        value={pct(o.leads.now, v(now, "sessions"))}
        delta={<Delta cur={Math.round(conv(o.leads.now, now) * 1000)} prev={Math.round(conv(o.leads.before, before) * 1000)} label={prev} />}
        hint="leads per session"
      />
      <KpiTile label="Deals won" icon={<Trophy />} value={String(o.deals.won)} hint={`${o.deals.created} CRM deals${o.deals.wonValue ? ` · ${aedShort(o.deals.wonValue)}` : ""}`} />
    </div>
  );
}

function TopPages({ o, className = "" }: { o: Overview; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border bg-card ${className}`}>
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h2 className="text-sm font-medium">Top pages</h2>
        <span className="text-xs text-muted-foreground">Leads = sessions that started on the page and became a chat lead or quote</span>
      </header>
      {o.pages.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">No page views yet. They appear here once the site is live and the tracker is running.</p>
      ) : (
        <div className="overflow-x-auto">
          <PhoneCards><table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-y">
                <th className="px-4 py-1.5 text-left font-medium">Page</th>
                <th className="px-2 py-1.5 text-right font-medium">Views</th>
                <th className="px-2 py-1.5 text-right font-medium">Visitors</th>
                <th className="px-2 py-1.5 text-right font-medium">Time</th>
                <th className="px-2 py-1.5 text-right font-medium">CTA</th>
                <th className="px-2 py-1.5 text-right font-medium">Entrances</th>
                <th className="px-4 py-1.5 text-right font-medium">Leads</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {o.pages.map((p) => (
                <tr key={p.path}>
                  <td className="max-w-0 px-4 py-1.5">
                    <div className="truncate font-medium" title={p.title}>
                      {p.title}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{p.path}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right">{p.views}</td>
                  <td className="px-2 py-1.5 text-right">{p.visitors}</td>
                  <td className="px-2 py-1.5 text-right">{duration(p.engagedAvg)}</td>
                  <td className="px-2 py-1.5 text-right">{p.cta}</td>
                  <td className="px-2 py-1.5 text-right">{p.entrances}</td>
                  <td className="px-4 py-1.5 text-right font-medium">{p.leads}</td>
                </tr>
              ))}
            </tbody>
          </table></PhoneCards>
        </div>
      )}
    </section>
  );
}

function RecentLeads({ o }: { o: Overview }) {
  return (
    <section className="min-w-0 rounded-xl border bg-card">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h2 className="text-sm font-medium">Newest quote requests</h2>
        <Link href="/website/leads" className="ml-auto text-xs text-primary hover:underline">
          All leads
        </Link>
      </header>
      {o.recent.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">No quote requests yet.</p>
      ) : (
        <ul className="divide-y border-t text-sm">
          {o.recent.map((r) => (
            <li key={r.id} className="grid gap-0.5 px-4 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{r.company || r.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{r.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {r.landingTitle ? `First seen on ${r.landingTitle}` : "First page not known"}
                {r.sourceLabel ? ` · via ${r.sourceLabel}` : ""}
                {r.status === "converted" ? " · in CRM" : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
