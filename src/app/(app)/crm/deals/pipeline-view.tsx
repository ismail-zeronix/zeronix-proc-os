import { CalendarClock, ChevronDown, FolderKanban, Kanban, List } from "lucide-react";
import Link from "next/link";
import { AssignPopover } from "@/components/assign-popover";
import { DataTable } from "@/components/data-table";
import { LIST_PAGE } from "@/components/list-page";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { SourceBadge, TempBadge } from "@/components/sales-bits";
import { Segmented } from "@/components/segmented";
import { QualifyButton, StageMenu } from "@/components/stage-menu";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { ago } from "@/lib/format";
import { aed, aedShort, daysSince, isLeadStage, OPEN_STAGES, STAGE_SHORT, STAGES, type StageKey } from "@/lib/sales";
import { projectTypes } from "@/lib/projects-data";
import { type DealRow, dealStageStats, listDeals, salesUsers } from "@/lib/sales-data";
import { DealBulkActions } from "../bulk-actions";
import { DealDialog } from "../new/deal-dialog";

type Person = { id: number; name: string };

/** Cards a board column shows at first, and how many more each "Show more" adds. */
const BOARD_STEP = 20;
const BOARD_MAX = 500;

/**
 * CRM pipeline in two halves over the same deal records: "leads" (New, Contacted: not qualified yet) and "deals"
 * (Qualified up to Won / Lost). A lead becomes a deal when it is qualified; nothing is copied.
 *
 * Nothing loads every deal: tab counts and column totals come from one per-stage count, the list loads one page
 * (?page=), and each board column loads its newest cards with a "Show more" (?more_<stage>=) for the rest.
 */
export async function PipelineView({ mode, searchParams }: { mode: "leads" | "deals"; searchParams: Record<string, string | string[] | undefined> }) {
  const base = mode === "leads" ? "/crm/leads" : "/crm/deals";
  const stages = STAGES.filter((s) => (mode === "leads" ? isLeadStage(s.key) : !isLeadStage(s.key)));
  const columns = OPEN_STAGES.filter((s) => (mode === "leads" ? isLeadStage(s.key) : !isLeadStage(s.key)));
  const access = await requireApp("crm");
  const { user, seesAll } = access;
  const viewer = viewerOf(access);
  const sp = searchParams;
  const one = (k: string) => String((Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "");
  const all = seesAll && one("who") === "all";
  const board = one("view") === "board";
  // a stage from the other half (a lead stage on Deals) is ignored
  const stage = stages.find((s) => s.key === one("stage"))?.key ?? "";
  const kind = one("kind") === "product" || one("kind") === "project" ? (one("kind") as "product" | "project") : undefined;
  const filter = { memberId: all ? undefined : user.id, kind };
  // how many cards each board column shows
  const shown = (s: StageKey) => Math.min(BOARD_MAX, Math.max(BOARD_STEP, Math.ceil((Number(one(`more_${s}`)) || 0) / BOARD_STEP) * BOARD_STEP));

  const openKeys = columns.map((c) => c.key);
  const listStages: StageKey[] = stage ? [stage] : openKeys;
  const page = pageParam(sp.page);

  const [stats, team, types, listRows, boardRows] = await Promise.all([
    dealStageStats(viewer, filter),
    salesUsers(),
    projectTypes(),
    board ? Promise.resolve([]) : listDeals(viewer, { ...filter, stages: listStages, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    board ? Promise.all(columns.map((c) => listDeals(viewer, { ...filter, stages: [c.key], limit: shown(c.key) }))) : Promise.resolve([]),
  ]);
  const typeOptions = types.map((t) => ({ key: t.key, label: t.label }));
  // only admins and "All data" users share deals with others; everyone else can only pick themselves
  const users = seesAll ? team : team.filter((u) => u.id === user.id);
  const count = (s: StageKey) => stats[s]?.count ?? 0;
  const value = (s: StageKey) => stats[s]?.value ?? 0;
  const openCount = openKeys.reduce((n, s) => n + count(s), 0);
  const openValue = openKeys.reduce((n, s) => n + value(s), 0);
  const listTotal = listStages.reduce((n, s) => n + count(s), 0);

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const more = board ? Object.fromEntries(openKeys.map((k) => [`more_${k}`, one(`more_${k}`)])) : {};
    const cur: Record<string, string> = { who: all ? "all" : "", view: board ? "board" : "", stage, kind: kind ?? "", ...more, ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  // switching view, scope or kind starts the board columns short again
  const fresh = Object.fromEntries(openKeys.map((k) => [`more_${k}`, ""]));

  const toolbar = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <Segmented
        items={[
          { href: href({ ...fresh, view: "", stage }), title: "List view", icon: <List />, active: !board },
          { href: href({ ...fresh, view: "board", stage: "" }), title: "Board view", icon: <Kanban />, active: board },
        ]}
      />
      {seesAll && (
        <Segmented
          items={[
            { href: href({ ...fresh, who: "" }), title: "My deals", label: "Mine", active: !all },
            { href: href({ ...fresh, who: "all" }), title: "Everyone's deals", label: "All", active: all },
          ]}
        />
      )}
      <Segmented
        items={[
          { href: href({ ...fresh, kind: "" }), title: "Products and projects", label: "All", active: !kind },
          { href: href({ ...fresh, kind: "product" }), title: "Product deals only", label: "Products", active: kind === "product" },
          { href: href({ ...fresh, kind: "project" }), title: "Project deals only", label: "Projects", active: kind === "project" },
        ]}
      />
      {!board && (
        <nav aria-label="Stage" className="flex min-w-0 basis-full items-center gap-1 overflow-x-auto sm:flex-1 sm:basis-0">
          <Tab href={href({ stage: "" })} active={!stage} label="Open" n={openCount} />
          {stages.map((s) => (
            <Tab key={s.key} href={href({ stage: s.key })} active={stage === s.key} label={STAGE_SHORT[s.key]} n={count(s.key)} />
          ))}
        </nav>
      )}
      <span className={`text-xs whitespace-nowrap text-muted-foreground ${board ? "ml-auto" : ""}`}>
        {openCount} open{mode === "deals" ? ` · ${aedShort(openValue)}` : ""}
      </span>
      <DealDialog users={users} meId={user.id} stage={mode === "leads" ? "new" : "requirement"} projectTypes={typeOptions} kind={kind} label={mode === "leads" ? "New lead" : "New deal"} />
    </div>
  );

  if (board) {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {toolbar}
        <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 md:mx-0 md:px-0">
          {columns.map((s, i) => {
            const rows = boardRows[i] ?? [];
            const total = count(s.key);
            const left = total - rows.length;
            return (
              <section
                key={s.key}
                aria-label={s.label}
                // phones: one column at a time (most of the screen); wider: columns share the width, never narrower than a readable card
                className="flex max-h-[calc(100svh-8.5rem)] w-[85vw] max-w-[24rem] shrink-0 snap-start flex-col rounded-xl bg-muted/40 sm:w-auto sm:max-w-[28rem] sm:min-w-[18rem] sm:flex-1 sm:basis-0"
              >
                <header className="flex items-center gap-1 px-3 pt-2 pb-1">
                  <h2 className="min-w-0 flex-1 truncate text-xs font-semibold" title={s.hint}>
                    {s.label}
                    <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
                      {total}
                      {value(s.key) > 0 && ` · ${aedShort(value(s.key))}`}
                    </span>
                  </h2>
                  <DealDialog users={users} meId={user.id} stage={s.key} projectTypes={typeOptions} kind={kind} />
                </header>
                <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-2 pb-2">
                  {rows.map((d) => (
                    <DealCard key={d.id} d={d} users={users} canAssign={seesAll} />
                  ))}
                  {!rows.length && <p className="py-6 text-center text-xs text-muted-foreground">No {mode}</p>}
                  {left > 0 && rows.length < BOARD_MAX && (
                    <Link
                      href={href({ [`more_${s.key}`]: String(rows.length + BOARD_STEP) })}
                      scroll={false}
                      className="inline-flex items-center justify-center gap-1 rounded-md border border-dashed bg-background/60 py-1.5 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <ChevronDown className="size-3.5" />
                      Show {Math.min(BOARD_STEP, left)} more <span className="tabular-nums">({left} not shown)</span>
                    </Link>
                  )}
                  {left > 0 && rows.length >= BOARD_MAX && (
                    <Link href={href({ ...fresh, view: "", stage: s.key })} className="py-1.5 text-center text-xs text-primary hover:underline">
                      See all {total} in the list
                    </Link>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  const leads = mode === "leads";
  return (
    <div className={LIST_PAGE}>
      {toolbar}
      <DataTable
        noun={leads ? "lead" : "deal"}
        total={listTotal}
        acrossPages={false}
        empty={leads ? "No open leads. Add one with New lead." : stage ? "Nothing in this stage." : "Nothing here. Qualified leads show up here."}
        actions={<DealBulkActions leads={leads} users={users} canAssign={seesAll} />}
        pager={<Pager path={base} params={sp} page={page} total={listTotal} showSingle />}
        columns={[
          { label: leads ? "Lead" : "Deal", className: "max-w-80 py-1.5 whitespace-normal" },
          { label: "Stage", className: "py-1.5" },
          { label: <span title="Hot / warm / cold, from the qualification checks">Quality</span>, className: "py-1.5" },
          { label: "Value", className: "py-1.5 text-right" },
          { label: "Team", className: "py-1.5" },
          { label: "Follow-up", className: "py-1.5" },
          { label: "Last activity", className: "py-1.5" },
        ]}
        rows={listRows.map((d) => ({
          id: d.id,
          cells: [
            <div key="t">
              <Link href={`/crm/deals/${d.id}`} className="block truncate text-sm font-medium hover:underline">
                {d.kind === "project" && <ProjectMark />}
                {d.title}
              </Link>
              <Link href={`/crm/companies/${d.companyId}`} className="block truncate text-xs text-muted-foreground hover:underline">
                {d.companyName}
                {d.contactName && ` · ${d.contactName}`}
              </Link>
            </div>,
            <div key="s" className="flex items-center gap-1.5">
              <div className="w-40">
                <StageMenu dealId={d.id} stage={d.stage} />
              </div>
              {leads && <QualifyButton dealId={d.id} />}
            </div>,
            <span key="q" className="flex items-center gap-1">
              <TempBadge checks={d.checks} />
              <SourceBadge source={d.source} />
            </span>,
            <span key="v" className="tabular-nums" title={aed(d.valueAed)}>
              {d.valueAed != null ? aedShort(d.valueAed) : "-"}
            </span>,
            <AssignPopover key="a" dealId={d.id} assignees={d.assignees} users={users} readOnly={!seesAll} />,
            <FollowUp key="f" due={d.nextDue} />,
            <span key="l" className="text-xs whitespace-nowrap text-muted-foreground">
              {d.lastActivityAt ? ago(d.lastActivityAt) : "-"}
            </span>,
          ],
          card: <DealListCard d={d} users={users} canAssign={seesAll} />,
        }))}
      />
    </div>
  );
}

function Tab({ href, active, label, n }: { href: string; active: boolean; label: string; n: number }) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-primary/15" : "bg-muted"}`}>{n}</span>
    </Link>
  );
}

function ProjectMark() {
  return <FolderKanban className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" aria-label="Project" />;
}

function FollowUp({ due }: { due: string | null }) {
  if (!due) return <span className="text-xs text-muted-foreground">-</span>;
  const overdue = due < dubaiToday();
  return (
    <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`} title={overdue ? "Follow-up overdue" : "Next follow-up"}>
      <CalendarClock className="size-3.5" />
      {dayLabel(due)}
    </span>
  );
}

/** A board card: title and the stage switch on top, so the footer only carries the team and the dates. */
function DealCard({ d, users, canAssign }: { d: DealRow; users: Person[]; canAssign: boolean }) {
  return (
    <article className="grid gap-2 rounded-lg border bg-card p-3 shadow-xs">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <Link href={`/crm/deals/${d.id}`} className="line-clamp-2 text-sm leading-snug font-medium break-words hover:underline">
            {d.kind === "project" && <ProjectMark />}
            {d.title}
          </Link>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            <Link href={`/crm/companies/${d.companyId}`} className="hover:underline">
              {d.companyName}
            </Link>
            {d.contactName && ` · ${d.contactName}`}
          </div>
        </div>
        <div className="-mt-1 -mr-1.5 shrink-0">
          <StageMenu dealId={d.id} stage={d.stage} variant="icon" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          <TempBadge checks={d.checks} />
          <SourceBadge source={d.source} />
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{d.valueAed != null ? aedShort(d.valueAed) : <span className="text-xs font-normal text-muted-foreground">No value</span>}</span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <AssignPopover dealId={d.id} assignees={d.assignees} users={users} size={22} readOnly={!canAssign} />
        <span className="flex shrink-0 items-center gap-2.5">
          <FollowUp due={d.nextDue} />
          <span className="text-[11px] text-muted-foreground tabular-nums" title="Days in this stage">
            {daysSince(d.stageChangedAt)}d
          </span>
        </span>
      </div>
    </article>
  );
}

/** The list row as a small card for phones (the list puts the tick box beside it). */
function DealListCard({ d, users, canAssign }: { d: DealRow; users: Person[]; canAssign: boolean }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/crm/deals/${d.id}`} className="line-clamp-2 text-sm leading-snug font-medium">
            {d.kind === "project" && <ProjectMark />}
            {d.title}
          </Link>
          <div className="truncate text-xs text-muted-foreground">
            {d.companyName}
            {d.contactName && ` · ${d.contactName}`}
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{d.valueAed != null ? aedShort(d.valueAed) : "-"}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="w-44 min-w-0">
          <StageMenu dealId={d.id} stage={d.stage} />
        </div>
        <span className="flex items-center gap-1">
          <TempBadge checks={d.checks} />
          <SourceBadge source={d.source} />
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <AssignPopover dealId={d.id} assignees={d.assignees} users={users} size={22} readOnly={!canAssign} />
        <FollowUp due={d.nextDue} />
      </div>
    </div>
  );
}
