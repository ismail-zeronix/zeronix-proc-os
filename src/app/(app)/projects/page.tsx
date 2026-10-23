import { AlertTriangle, CalendarClock, CheckCircle2, FileText, FolderKanban, HardHat, Trophy } from "lucide-react";
import Link from "next/link";
import { HBarPanel } from "@/components/charts/hbar-panel";
import { TrendPanel } from "@/components/charts/trend-panel";
import { Delta, KpiTile } from "@/components/kpi-tile";
import { Segmented } from "@/components/segmented";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { dayLabel } from "@/lib/dates";
import { phaseLabel } from "@/lib/projects";
import { projectsOverview } from "@/lib/projects-data";
import { aedShort } from "@/lib/sales";

export const metadata = { title: "Overview · Zeronix Projects" };

const monthLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

export default async function ProjectsOverviewPage({ searchParams }: PageProps<"/projects">) {
  const access = await requireApp("projects");
  const sp = await searchParams;
  // people who only see their own deals have no team view
  const mine = !access.seesAll || sp.who === "mine";
  const o = await projectsOverview(viewerOf(access), mine ? access.user.id : undefined);
  const k = o.kpi;
  const n = (x: number, one: string) => `${x} ${one}${x === 1 ? "" : "s"}`;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-1 text-sm font-semibold">Projects overview</h1>
        {access.seesAll && (
          <Segmented
            items={[
              { href: "/projects", label: "Team", title: "Whole team", active: !mine },
              { href: "/projects?who=mine", label: "Mine", title: "Only my projects", active: mine },
            ]}
          />
        )}
        <span className="ml-auto text-xs text-muted-foreground">This month, compared with last month</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <KpiTile hero label="In progress" icon={<HardHat />} value={String(k.active)} hint={`${aedShort(k.activeValue)} of won work not yet completed`} />
        <KpiTile label="Project leads" icon={<FolderKanban />} value={String(k.leads)} hint={aedShort(k.leadsValue)} />
        <KpiTile label="Quoted" icon={<FileText />} value={String(k.quoted)} hint={aedShort(k.quotedValue)} />
        <KpiTile label="Won this month" icon={<Trophy />} value={aedShort(k.wonValue)} hint={n(k.wonCount, "project")} delta={<Delta cur={k.wonValue} prev={k.wonPrevValue} label="vs last month" />} />
        <KpiTile
          label="Completed this month"
          icon={<CheckCircle2 />}
          value={String(k.completedCount)}
          delta={<Delta cur={k.completedCount} prev={k.completedPrev} label="vs last month" />}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 [&>section]:h-full">
          <HBarPanel
            title="Projects by phase"
            hint="Leads, quoted, won and the work on site"
            views={[
              { key: "count", label: "Projects", unit: "projects", format: "count", empty: "No projects yet.", data: o.phases.map((p) => ({ label: phaseLabel(p.phase), value: p.count, note: aedShort(p.value) })) },
              { key: "value", label: "Value", unit: "AED", format: "aed", empty: "No projects yet.", data: o.phases.map((p) => ({ label: phaseLabel(p.phase), value: p.value, note: n(p.count, "project") })) },
            ]}
          />
        </div>
        <HBarPanel
          title="Open projects by type"
          hint="Leads to work in progress"
          views={[
            { key: "value", label: "Value", unit: "AED", format: "aed", empty: "No open projects.", data: o.types.map((t) => ({ label: t.label, value: t.value, note: n(t.count, "project") })) },
            { key: "count", label: "Projects", unit: "projects", format: "count", empty: "No open projects.", data: o.types.map((t) => ({ label: t.label, value: t.count })) },
          ]}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendPanel
            title="Won and completed"
            hint="Projects per month"
            points={o.months.map((m) => ({ label: monthLabel(m.start), won: m.won, completed: m.completed }))}
            series={[
              { key: "won", label: "Won", color: "var(--series-1)" },
              { key: "completed", label: "Completed", color: "var(--series-2)" },
            ]}
          />
        </div>
        <section className="min-w-0 rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="size-4 text-muted-foreground" /> Needs attention
            </h2>
            <span className="text-xs text-muted-foreground">{o.attention.length}</span>
          </div>
          <ul className="grid gap-0.5">
            {o.attention.slice(0, 10).map((a) => (
              <li key={a.id}>
                <Link href={`/projects/list/${a.id}`} className="grid gap-0.5 rounded-md px-2 py-1.5 hover:bg-muted">
                  <span className="truncate text-sm">
                    {a.title} <span className="text-muted-foreground">· {a.company}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    {a.due && <CalendarClock className="size-3.5" />}
                    {a.reason}
                    {a.due && ` · ${dayLabel(a.due)}`}
                  </span>
                </Link>
              </li>
            ))}
            {!o.attention.length && <li className="px-2 py-3 text-sm text-muted-foreground">Nothing overdue. Every won project has a start date.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
