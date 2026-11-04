import Link from "next/link";
import { Pager, PAGE_SIZE, pageParam } from "@/components/pager";
import { requireApp } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pageTitles } from "@/lib/website/analytics";
import { listQuoteRequests, quoteCounts } from "@/lib/website/quotes";
import { SOURCE_LABEL, type TrafficSource } from "@/lib/website/traffic";
import { LeadActions } from "./lead-row";
import { LIST_PAGE } from "@/components/list-page";

export const metadata = { title: "Leads · Zeronix Website" };

const TABS = [
  { key: "new", label: "New" },
  { key: "converted", label: "Converted" },
  { key: "spam", label: "Spam" },
] as const;

/** "Get B2B pricing" requests from the site. Website chats are in Chat › Website chats (with a site badge). */
export default async function LeadsPage({ searchParams }: PageProps<"/website/leads">) {
  await requireApp("website");
  const sp = await searchParams;
  const tab = String(sp.tab ?? "new");
  const status = (TABS.find((t) => t.key === tab)?.key ?? "new") as "new" | "converted" | "spam";
  const page = pageParam(sp.page);
  const [rows, counts] = await Promise.all([listQuoteRequests(status, page, PAGE_SIZE), quoteCounts()]);
  // the page that brought each visitor in (first touch), by name
  const titles = await pageTitles(rows.map(({ r }) => r.landingPath).filter(Boolean));

  return (
    <div className={LIST_PAGE}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">Leads</h1>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <Link key={t.key} href={`/website/leads?tab=${t.key}`} className={cn("rounded-md px-2.5 py-1 text-sm", status === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {t.label} <span className="tabular-nums opacity-70">{counts[t.key] ?? 0}</span>
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-xs text-muted-foreground">
          B2B pricing requests from the site. Chats are in{" "}
          <Link href="/chat/website" className="underline">
            Website chats
          </Link>
          .
        </span>
      </div>
      {rows.length === 0 && <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No {status === "new" ? "new requests" : status} yet.</p>}
      <ul className="grid gap-2">
        {rows.map(({ r, industryName }) => (
          <li key={r.id} className="grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-[16rem_1fr_auto]">
            <div className="grid content-start gap-0.5 text-sm">
              <span className="font-semibold">{r.name}</span>
              {r.company && <span>{r.company}</span>}
              <a href={`mailto:${r.email}`} className="text-primary hover:underline">
                {r.email}
              </a>
              {r.phone && <span className="text-muted-foreground">{r.phone}</span>}
              <span className="text-xs text-muted-foreground">
                {ago(r.createdAt)}
                {r.site ? ` · ${r.site}` : ""}
              </span>
            </div>
            <div className="grid content-start gap-1.5 text-sm">
              {r.items.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {r.items.map((i) => (
                    <li key={i.name} className="rounded-md bg-muted px-2 py-0.5">
                      {i.qty} × {i.name}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {[industryName || r.industry, r.users ? `${r.users} users` : "", r.budget && `Budget ${r.budget}`, r.timeline && `Needed ${r.timeline}`].filter(Boolean).join(" · ")}
              </p>
              {r.notes && <p className="whitespace-pre-wrap">{r.notes}</p>}
              {r.landingPath && (
                <p className="truncate text-xs" title={r.firstReferrer || "No referrer"}>
                  First seen on <span className="font-medium">{titles.get(r.landingPath) ?? r.landingPath}</span>
                  {r.source ? ` via ${SOURCE_LABEL[r.source as TrafficSource] ?? r.source}` : ""}
                </p>
              )}
              {(r.sourcePage || r.cta) && (
                <p className="truncate text-xs text-muted-foreground" title={r.sourcePage}>
                  From {r.sourcePage || "the site"}
                  {r.cta ? ` · "${r.cta}"` : ""}
                  {r.utm.source ? ` · ${r.utm.source}${r.utm.campaign ? `/${r.utm.campaign}` : ""}` : ""}
                </p>
              )}
            </div>
            <LeadActions id={r.id} status={r.status} dealId={r.dealId} />
          </li>
        ))}
      </ul>
      <div className="sticky bottom-(--mobile-nav-h) z-20 -mx-1 mt-auto flex min-h-12 items-center border-t bg-background/95 py-2 pr-1 pl-1 backdrop-blur md:pr-20">
        <div className="ml-auto"><Pager path="/website/leads" params={sp} page={page} total={counts[status] ?? 0} showSingle /></div>
      </div>
    </div>
  );
}
