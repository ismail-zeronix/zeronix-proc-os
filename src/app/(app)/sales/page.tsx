import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { initials, TempBadge } from "@/components/sales-bits";
import { StageMenu } from "@/components/stage-menu";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { ago } from "@/lib/format";
import { aed, daysSince, isStage, OPEN_STAGES, stageLabel } from "@/lib/sales";
import { type DealRow, listDeals } from "@/lib/sales-data";

export const metadata = { title: "Pipeline · Zeronix Sales" };

export default async function PipelinePage({ searchParams }: PageProps<"/sales">) {
  const { user } = await requireApp("sales");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const all = one("who") === "all";
  const list = one("view") === "list";
  const q = one("q").trim();
  const stage = isStage(one("stage")) ? one("stage") : "";

  const deals = await listDeals({ ownerId: all ? undefined : user.id, q });
  const open = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const closedThisMonth = (s: "won" | "lost") => deals.filter((d) => d.stage === s && d.closedAt && d.closedAt >= monthStart);
  const won = closedThisMonth("won");
  const lost = closedThisMonth("lost");
  const sum = (rows: DealRow[]) => rows.reduce((n, d) => n + (d.valueAed ?? 0), 0);

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { who: all ? "all" : "", view: list ? "list" : "", q, stage, ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/sales?${s}` : "/sales";
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Pipeline"
        description={`${open.length} open deal${open.length === 1 ? "" : "s"} · ${aed(sum(open))}`}
        actions={
          <Button nativeButton={false} render={<Link href="/sales/new" />}>
            <Plus /> New enquiry
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Chip href={href({ who: "" })} active={!all}>
          My deals
        </Chip>
        <Chip href={href({ who: "all" })} active={all}>
          Everyone
        </Chip>
        <span className="mx-1 h-5 w-px bg-border" />
        <Chip href={href({ view: "" })} active={!list}>
          Board
        </Chip>
        <Chip href={href({ view: "list" })} active={list}>
          List
        </Chip>
        <form action="/sales" className="ml-auto flex items-center gap-2">
          {all && <input type="hidden" name="who" value="all" />}
          {list && <input type="hidden" name="view" value="list" />}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Search deals, companies…" className="w-56 pl-8" aria-label="Search deals" />
          </div>
        </form>
      </div>

      {!list ? (
        <>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            {OPEN_STAGES.map((s) => {
              const rows = open.filter((d) => d.stage === s.key);
              return (
                <section key={s.key} aria-label={s.label} className="flex w-72 shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/40 p-2">
                  <header className="flex items-baseline justify-between px-1">
                    <h2 className="text-sm font-semibold" title={s.hint}>
                      {s.label} <span className="font-normal text-muted-foreground">({rows.length})</span>
                    </h2>
                    <span className="text-xs text-muted-foreground">{rows.length ? aed(sum(rows)) : ""}</span>
                  </header>
                  {rows.map((d) => (
                    <DealCard key={d.id} d={d} />
                  ))}
                  {!rows.length && <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nothing here</p>}
                </section>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            This month:{" "}
            <Link href={href({ view: "list", stage: "won" })} className="font-medium text-foreground underline">
              {won.length} won ({aed(sum(won))})
            </Link>
            {" · "}
            <Link href={href({ view: "list", stage: "lost" })} className="font-medium text-foreground underline">
              {lost.length} lost
            </Link>
          </p>
        </>
      ) : (
        <DealTable deals={stage ? deals.filter((d) => d.stage === stage) : deals} stage={stage} href={href} />
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full border px-3 py-1 text-sm ${active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
      {children}
    </Link>
  );
}

function FollowUp({ due }: { due: string | null }) {
  if (!due) return <span className="text-xs text-muted-foreground">No follow-up booked</span>;
  const overdue = due < dubaiToday();
  return <span className={`text-xs ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>{overdue ? "Overdue · " : "Follow-up · "}{dayLabel(due)}</span>;
}

function DealCard({ d }: { d: DealRow }) {
  return (
    <article className="grid gap-2 rounded-lg border bg-card p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/sales/deals/${d.id}`} className="text-sm leading-snug font-medium hover:underline">
          {d.title}
        </Link>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium" title={d.ownerName || "No owner"}>
          {initials(d.ownerName) || "?"}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        <Link href={`/sales/companies/${d.companyId}`} className="hover:underline">
          {d.companyName}
        </Link>
        {d.contactName && ` · ${d.contactName}`}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TempBadge checks={d.checks} />
        <span className="text-sm font-semibold tabular-nums">{d.valueAed != null ? aed(d.valueAed) : <span className="font-normal text-muted-foreground">No value</span>}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <FollowUp due={d.nextDue} />
        <span className="text-xs text-muted-foreground">{daysSince(d.stageChangedAt)}d here</span>
      </div>
      <StageMenu dealId={d.id} stage={d.stage} />
    </article>
  );
}

function DealTable({ deals, stage, href }: { deals: DealRow[]; stage: string; href: (o: Record<string, string>) => string }) {
  return (
    <div className="grid gap-2">
      {stage && (
        <p className="text-sm text-muted-foreground">
          Showing {stageLabel(stage)} deals.{" "}
          <Link href={href({ stage: "" })} className="underline">
            Show all
          </Link>
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="max-w-72 font-medium whitespace-normal">
                  <Link href={`/sales/deals/${d.id}`} className="hover:underline">
                    {d.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/sales/companies/${d.companyId}`} className="hover:underline">
                    {d.companyName}
                  </Link>
                </TableCell>
                <TableCell>
                  <StageMenu dealId={d.id} stage={d.stage} />
                </TableCell>
                <TableCell>
                  <TempBadge checks={d.checks} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{d.valueAed != null ? aed(d.valueAed) : "-"}</TableCell>
                <TableCell>{d.ownerName || "-"}</TableCell>
                <TableCell>
                  <FollowUp due={d.nextDue} />
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{d.lastActivityAt ? ago(d.lastActivityAt) : "-"}</TableCell>
              </TableRow>
            ))}
            {!deals.length && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Empty>No deals match.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
