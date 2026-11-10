import { CircleAlert, ExternalLink } from "lucide-react";
import Link from "next/link";
import { requireApp } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { pageTitles } from "@/lib/website/analytics";
import { getGsc, pageStats, queryStats } from "@/lib/website/gsc";
import { listKeywords, type KeywordView } from "@/lib/website/keywords";
import { dubaiDay } from "@/lib/website/traffic";
import { getDfs, rankOverview } from "@/lib/website/dataforseo";
import { AddGapIdea, DfsButtons, KeywordDelete, KeywordImport, KeywordState } from "./seo-controls";
import { PhoneCards } from "@/components/phone-cards";

export const metadata = { title: "SEO · Zeronix Website" };

const TABS = [
  { key: "clusters", label: "Clusters" },
  { key: "calendar", label: "Calendar" },
  { key: "opportunities", label: "Opportunities" },
  { key: "rankings", label: "Rankings" },
] as const;

const STATUS_TONE: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  draft: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  writing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  planned: "bg-muted text-foreground",
  idea: "bg-muted text-muted-foreground",
};

const monday = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The SEO plan: what to rank for, which page answers it, and when it gets written (website/content/seo-research.md). */
export default async function SeoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireApp("website");
  const want = String((await searchParams).tab ?? "");
  const tab = TABS.find((t) => t.key === want)?.key ?? "clusters";
  const [list, gsc] = await Promise.all([listKeywords(), getGsc()]);
  // real Google numbers for the last 28 days, once Search Console is connected
  const queries = gsc?.credentials ? await queryStats() : [];
  const rank = new Map(queries.map((q) => [q.query.toLowerCase(), q]));
  const clusters = [...new Set(list.map((k) => k.cluster))];
  const live = list.filter((k) => k.status === "published").length;
  const noTarget = list.filter((k) => !k.targetPath).length;
  const thisWeek = monday(dubaiDay());
  const dueThisWeek = list.filter((k) => k.plannedFor && monday(k.plannedFor) === thisWeek && k.status !== "published").length;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">SEO plan</h1>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <Link key={t.key} href={t.key === "clusters" ? "/website/seo" : `/website/seo?tab=${t.key}`} className={cn("rounded-md px-2.5 py-1 text-sm", tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {t.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-xs text-muted-foreground">
          {list.length} keywords · {clusters.length} clusters · {live} live · {dueThisWeek} due this week{noTarget ? ` · ${noTarget} without a page` : ""}
        </span>
        <KeywordImport />
      </div>

      {tab === "rankings" ? (
        <Rankings admin={user.role === "admin"} />
      ) : list.length === 0 ? (
        <section className="rounded-lg border bg-card p-6 text-sm">
          <p className="font-medium">No keywords yet.</p>
          <p className="mt-1 text-muted-foreground">
            Import <code className="text-xs">website/content/keywords.csv</code> (the first research) or a Google Keyword Planner export. Each keyword gets a cluster, the page that should rank for it and a date to write it.
          </p>
        </section>
      ) : tab === "clusters" ? (
        <Clusters list={list} clusters={clusters} rank={rank} />
      ) : tab === "calendar" ? (
        <Calendar list={list} thisWeek={thisWeek} />
      ) : gsc?.credentials ? (
        <Opportunities queries={queries} planned={new Set(list.map((k) => k.keyword.toLowerCase()))} />
      ) : (
        <section className="rounded-lg border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CircleAlert className="size-4 text-amber-600" aria-hidden /> Needs Google Search Console
          </p>
          <p className="mt-1 text-muted-foreground">
            Once Search Console is connected (Website › Settings), this lists the searches where a page sits in positions 8–30 (one better page away from the first page of Google), and pages with many impressions but few clicks (a better
            title helps). It also shows the real position of every keyword above.
          </p>
        </section>
      )}
    </div>
  );
}

function Target({ k }: { k: KeywordView }) {
  if (!k.targetPath) return <span className="text-xs text-amber-700 dark:text-amber-400">No page yet</span>;
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs">
      <span className="truncate" title={k.targetPath}>
        {k.targetTitle ?? k.targetPath}
      </span>
      {k.status === "published" && (
        <a href={`${process.env.SITE_PUBLIC_URL ?? ""}${k.targetPath}`} target="_blank" rel="noreferrer" aria-label="Open on the site" className="shrink-0 text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-3" />
        </a>
      )}
    </span>
  );
}

type QueryStat = Awaited<ReturnType<typeof queryStats>>[number];

function Clusters({ list, clusters, rank }: { list: KeywordView[]; clusters: string[]; rank: Map<string, QueryStat> }) {
  return (
    <div className="grid gap-3">
      {clusters.map((c) => {
        const rows = list.filter((k) => k.cluster === c);
        const live = rows.filter((k) => k.status === "published").length;
        return (
          <section key={c} className="min-w-0 rounded-lg border bg-card">
            <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <h2 className="text-sm font-semibold">{c}</h2>
              <span className="text-xs text-muted-foreground">
                {rows.length} keyword{rows.length === 1 ? "" : "s"} · {live} live
              </span>
              <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${live} of ${rows.length} live`}>
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(live / rows.length) * 100}%` }} />
              </div>
            </header>
            <div className="overflow-x-auto">
              <PhoneCards><table className="w-full min-w-[760px] text-sm">
                <tbody className="divide-y">
                  {rows.map((k) => (
                    <tr key={k.id}>
                      <td className="w-[34%] px-3 py-1.5">
                        <div className="font-medium">{k.keyword}</div>
                        <div className="truncate text-xs text-muted-foreground" title={k.notes}>
                          P{k.priority} · {k.intent}
                          {k.industry ? ` · ${k.industry}` : ""}
                          {k.volume !== null ? ` · ${k.volume.toLocaleString("en-US")}/mo` : ""}
                          {k.difficulty !== null ? ` · KD ${k.difficulty}` : ""}
                          {k.notes ? ` · ${k.notes}` : ""}
                        </div>
                        {rank.get(k.keyword) && (
                          <div className="text-xs font-medium tabular-nums">
                            Google #{rank.get(k.keyword)!.position.toFixed(1)} · {rank.get(k.keyword)!.clicks} clicks · {rank.get(k.keyword)!.impressions} impressions (28 days)
                          </div>
                        )}
                      </td>
                      <td className="max-w-0 px-2 py-1.5">
                        <Target k={k} />
                      </td>
                      <td className="w-px px-2 py-1.5">
                        <KeywordState id={k.id} status={k.status} plannedFor={k.plannedFor} locked={k.status === "published"} />
                      </td>
                      <td className="w-px py-1.5 pr-2">
                        <KeywordDelete id={k.id} keyword={k.keyword} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></PhoneCards>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Calendar({ list, thisWeek }: { list: KeywordView[]; thisWeek: string }) {
  // one page answers several keywords: the calendar lists pages, each with its keywords
  const pages = new Map<string, { week: string; title: string; path: string; status: string; keywords: string[] }>();
  for (const k of list.filter((x) => x.plannedFor)) {
    const key = k.targetPath || `kw:${k.keyword}`;
    const cur = pages.get(key);
    if (cur) {
      cur.keywords.push(k.keyword);
      if (monday(k.plannedFor!) < cur.week) cur.week = monday(k.plannedFor!);
    } else pages.set(key, { week: monday(k.plannedFor!), title: k.targetTitle ?? (k.targetPath || k.keyword), path: k.targetPath, status: k.status, keywords: [k.keyword] });
  }
  const weeks = [...new Set([...pages.values()].map((p) => p.week))].sort();
  const unscheduled = list.filter((k) => !k.plannedFor && k.status !== "published").length;
  return (
    <div className="grid gap-3">
      {weeks.map((w) => (
        <section key={w} className="rounded-lg border bg-card">
          <h2 className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
            Week of {dayLabel(w)}
            {w === thisWeek && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">This week</span>}
            {w < thisWeek && [...pages.values()].some((p) => p.week === w && p.status !== "published") && <span className="text-xs font-normal text-amber-700 dark:text-amber-400">Behind</span>}
          </h2>
          <ul className="divide-y text-sm">
            {[...pages.values()]
              .filter((p) => p.week === w)
              .map((p) => (
                <li key={p.title} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_TONE[p.status])}>{p.status}</span>
                  <span className="font-medium">{p.title}</span>
                  <span className="w-full min-w-0 truncate text-xs text-muted-foreground sm:w-auto sm:flex-1">{p.keywords.join(" · ")}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {unscheduled > 0 && <p className="text-xs text-muted-foreground">{unscheduled} keywords have no date yet (set one in Clusters).</p>}
    </div>
  );
}

/** What Search Console says to do next: searches just off page one, pages people see but do not click, and searches nobody planned for. */
async function Opportunities({ queries, planned }: { queries: QueryStat[]; planned: Set<string> }) {
  const close = queries.filter((q) => q.position >= 8 && q.position <= 30 && q.impressions >= 10).sort((a, b) => b.impressions - a.impressions).slice(0, 25);
  const pages = (await pageStats()).filter((p) => p.impressions >= 100 && p.clicks / p.impressions < 0.015).sort((a, b) => b.impressions - a.impressions).slice(0, 15);
  const titles = await pageTitles(pages.map((p) => p.page));
  const fresh = queries.filter((q) => q.impressions >= 20 && !planned.has(q.query.toLowerCase())).sort((a, b) => b.impressions - a.impressions).slice(0, 20);
  const box = (title: string, hint: string, rows: React.ReactNode[], empty: string) => (
    <section className="min-w-0 rounded-lg border bg-card">
      <header className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </header>
      {rows.length ? <ul className="divide-y text-sm">{rows}</ul> : <p className="px-3 py-3 text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {box(
        "Almost on page one",
        "Positions 8–30 in the last 28 days: improve or expand the page, add internal links.",
        close.map((q) => (
          <li key={q.query} className="grid gap-0.5 px-3 py-1.5">
            <span className="font-medium">{q.query}</span>
            <span className="truncate text-xs text-muted-foreground tabular-nums">
              #{q.position.toFixed(1)} · {q.impressions} impressions · {q.page}
            </span>
          </li>
        )),
        "Nothing between positions 8 and 30 yet.",
      )}
      {box(
        "Seen but not clicked",
        "Pages with 100+ impressions and under 1.5% click rate: rewrite the title and meta description.",
        pages.map((p) => (
          <li key={p.page} className="grid gap-0.5 px-3 py-1.5">
            <span className="truncate font-medium">{titles.get(p.page) ?? p.page}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {p.impressions} impressions · {p.clicks} clicks · {((p.clicks / p.impressions) * 100).toFixed(1)}%
            </span>
          </li>
        )),
        "No page needs a better title yet.",
      )}
      {box(
        "Searches not in the plan",
        "Google already shows us for these; add the good ones to the plan (Import .csv) or to an existing page.",
        fresh.map((q) => (
          <li key={q.query} className="grid gap-0.5 px-3 py-1.5">
            <span className="font-medium">{q.query}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {q.impressions} impressions · #{q.position.toFixed(1)}
            </span>
          </li>
        )),
        "Every search with 20+ impressions is already in the plan.",
      )}
    </div>
  );
}

/**
 * DataForSEO (website/SEO-STRATEGY.md step 7): where we rank on Google UAE for the tracked keywords, who holds the top
 * ten, and the searches competitors rank for that we do not.
 */
async function Rankings({ admin }: { admin: boolean }) {
  const dfs = await getDfs();
  if (!dfs?.login) {
    return (
      <section className="rounded-lg border bg-card p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <CircleAlert className="size-4 text-amber-600" aria-hidden /> Needs DataForSEO
        </p>
        <p className="mt-1 text-muted-foreground">
          Connect it in Website › Settings (API login, a monthly budget and the competitor domains). Then this tab shows the Google UAE position of every priority keyword each Monday, which sites hold the top ten, and the searches competitors rank for that we
          do not.
        </p>
      </section>
    );
  }
  const { rows, share, lastDay } = await rankOverview();
  const gap = dfs.gap;
  const move = (r: (typeof rows)[number]) => {
    if (r.previous === null || r.position === null) return null;
    const d = r.previous - r.position;
    return d === 0 ? null : <span className={d > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>;
  };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">
          Google UAE, top 30{lastDay ? ` · last checked ${dayLabel(lastDay)}` : " · not checked yet"} · {rows.filter((r) => r.position !== null && r.position <= 10).length} on page one · {rows.filter((r) => r.position !== null).length} of {rows.length} in the top 30
        </span>
        {admin && (
          <div className="ml-auto">
            <DfsButtons />
          </div>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-lg border bg-card">
          <header className="border-b px-3 py-2">
            <h2 className="text-sm font-semibold">Our positions</h2>
          </header>
          {rows.length ? (
            <ul className="divide-y text-sm">
              {rows.map((r) => (
                <li key={r.keywordId} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="w-12 shrink-0 font-semibold tabular-nums">{r.position === null ? "—" : `#${r.position}`}</span>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{r.keyword}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.url ? r.url.replace(/^https?:\/\/(www\.)?/, "") : `Top: ${r.top.slice(0, 3).map((t) => t.domain).join(", ") || "no results"}`}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">{move(r)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">No check yet. It runs every Monday morning{admin ? ", or press Check rankings now" : ""}.</p>
          )}
        </section>
        <section className="min-w-0 rounded-lg border bg-card">
          <header className="border-b px-3 py-2">
            <h2 className="text-sm font-semibold">Who ranks above us</h2>
            <p className="text-xs text-muted-foreground">How often each site is in the top ten of these searches.</p>
          </header>
          {share.length ? (
            <ul className="divide-y text-sm">
              {share.slice(0, 15).map((s) => (
                <li key={s.domain} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{s.domain}</span>
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(s.share * 100)}%` }} />
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums">{Math.round(s.share * 100)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">Shows after the first check.</p>
          )}
        </section>
      </div>
      <section className="min-w-0 rounded-lg border bg-card">
        <header className="border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Competitor gap</h2>
          <p className="text-xs text-muted-foreground">
            Searches where {dfs.competitors.length} competitors are in Google UAE&apos;s top 20 and we are not, not yet in the plan, most searched first.{gap ? ` Found ${new Date(gap.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : ""}
          </p>
        </header>
        {gap?.rows.length ? (
          <div className="overflow-x-auto">
            <PhoneCards>
              <table className="w-full min-w-[640px] text-sm">
                <tbody className="divide-y">
                  {gap.rows.slice(0, 100).map((r) => (
                    <tr key={r.keyword}>
                      <td className="px-3 py-1.5 font-medium">{r.keyword}</td>
                      <td className="w-px px-2 py-1.5 text-right text-xs whitespace-nowrap tabular-nums">{r.volume === null ? "—" : `${r.volume.toLocaleString("en-US")}/mo`}</td>
                      <td className="max-w-0 px-2 py-1.5 text-xs text-muted-foreground">
                        <span className="block truncate">{r.competitors.map((c) => `${c.domain} #${c.position}`).join(" · ")}</span>
                      </td>
                      <td className="w-px py-1.5 pr-2">{admin && <AddGapIdea keyword={r.keyword} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PhoneCards>
          </div>
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">{gap ? "Nothing found: every search they rank for is already ours or in the plan." : admin ? "Press Competitor gap to find them." : "Not run yet."}</p>
        )}
      </section>
    </div>
  );
}
