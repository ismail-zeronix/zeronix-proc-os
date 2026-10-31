import { Building2, CheckCircle2, Search, Send, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { HBarPanel } from "@/components/charts/hbar-panel";
import { KpiTile } from "@/components/kpi-tile";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { STATUSES, statusLabel } from "@/lib/prospecting/constants";
import { prospectingOverview } from "@/lib/prospecting/data";
import { ResearchProgress } from "./research-ui";

export const metadata = { title: "Overview · Zeronix Prospecting" };

export default async function ProspectingOverviewPage() {
  await requireApp("prospecting");
  const o = await prospectingOverview();
  const c = (k: string) => o.count[k] ?? 0;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Prospecting overview</h1>
        <span className="text-xs text-muted-foreground">{o.total} prospects · {o.addedThisWeek} added this week</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/prospecting/import" />}>
            <Upload /> Import a list
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/prospecting/campaigns/new" />}>
            <Send /> New campaign
          </Button>
        </div>
      </div>

      <ResearchProgress />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <KpiTile hero label="To research" icon={<Search />} value={String(c("sourced") + c("researching"))} hint={`${c("sourced")} new · ${c("researching")} in progress`} />
        <KpiTile label="Ready to email" icon={<Sparkles />} value={String(c("ready"))} hint="Key person and personal line in place" />
        <KpiTile label="In sequence" icon={<Send />} value={String(c("in_sequence"))} hint="Emails going out" />
        <KpiTile label="Replied" icon={<Building2 />} value={String(c("replied"))} hint="Waiting to be read" tone={c("replied") ? "bad" : undefined} />
        <KpiTile label="Converted to leads" icon={<CheckCircle2 />} value={String(c("converted"))} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 [&>section]:h-full">
          <HBarPanel
            title="Prospects by status"
            hint="Where each company is in the flow"
            views={[{ key: "status", label: "Status", unit: "prospects", format: "count", empty: "No prospects yet. Import a list or add one.", data: STATUSES.map((s) => ({ label: s.label, value: c(s.key) })) }]}
          />
        </div>
        <HBarPanel
          title="By segment"
          hint="Who we are targeting"
          color="var(--series-5)"
          views={[{ key: "seg", label: "Segment", unit: "prospects", format: "count", empty: "No segments.", data: o.bySegment.map((s) => ({ label: s.label, value: s.n })) }]}
        />
      </div>

      <section className="min-w-0 rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Recently added</h2>
          <Link href="/prospecting/prospects" className="text-xs text-muted-foreground hover:underline">
            All prospects
          </Link>
        </div>
        <ul className="grid gap-0.5">
          {o.recent.map((r) => (
            <li key={r.id}>
              <Link href={`/prospecting/prospects/${r.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="text-xs text-muted-foreground">{statusLabel(r.status)}</span>
                <span className="w-8 text-right text-xs tabular-nums">{r.score.toFixed(1)}</span>
                <span className="w-20 text-right text-xs text-muted-foreground">{ago(r.createdAt)}</span>
              </Link>
            </li>
          ))}
          {!o.recent.length && <li className="px-2 py-3 text-sm text-muted-foreground">Nothing yet. Start with Import, or add a company from Prospects.</li>}
        </ul>
      </section>
    </div>
  );
}
