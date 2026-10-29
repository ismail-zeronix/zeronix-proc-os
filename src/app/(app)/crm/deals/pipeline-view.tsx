import { CalendarClock, FolderKanban, Kanban, List } from "lucide-react";
import Link from "next/link";
import { AssignPopover } from "@/components/assign-popover";
import { SourceBadge, TempBadge } from "@/components/sales-bits";
import { Segmented } from "@/components/segmented";
import { QualifyButton, StageMenu } from "@/components/stage-menu";
import { Empty } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { ago } from "@/lib/format";
import { aed, aedShort, daysSince, isLeadStage, isOpen, isStage, OPEN_STAGES, STAGE_SHORT, STAGES } from "@/lib/sales";
import { projectTypes } from "@/lib/projects-data";
import { type DealRow, listDeals, salesUsers } from "@/lib/sales-data";
import { DealDialog } from "../new/deal-dialog";

type Person = { id: number; name: string };

/**
 * CRM pipeline in two halves over the same deal records: "leads" (New, Contacted: not qualified yet) and "deals"
 * (Qualified up to Won / Lost). A lead becomes a deal when it is qualified; nothing is copied.
 */
export async function PipelineView({ mode, searchParams }: { mode: "leads" | "deals"; searchParams: Record<string, string | string[] | undefined> }) {
  const base = mode === "leads" ? "/crm/leads" : "/crm/deals";
  const stages = STAGES.filter((s) => (mode === "leads" ? isLeadStage(s.key) : !isLeadStage(s.key)));
  const columns = OPEN_STAGES.filter((s) => (mode === "leads" ? isLeadStage(s.key) : !isLeadStage(s.key)));
  const access = await requireApp("crm");
  const { user, seesAll } = access;
  const sp = searchParams;
  const one = (k: string) => String((Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "");
  const all = seesAll && one("who") === "all";
  const board = one("view") === "board";
  const stage = isStage(one("stage")) ? one("stage") : "";
  const kind = one("kind") === "product" || one("kind") === "project" ? (one("kind") as "product" | "project") : undefined;

  const [everything, team, types] = await Promise.all([listDeals(viewerOf(access), { memberId: all ? undefined : user.id, kind }), salesUsers(), projectTypes()]);
  const deals = everything.filter((d) => (mode === "leads" ? isLeadStage(d.stage) : !isLeadStage(d.stage)));
  const typeOptions = types.map((t) => ({ key: t.key, label: t.label }));
  // only admins and "All data" users share deals with others; everyone else can only pick themselves
  const users = seesAll ? team : team.filter((u) => u.id === user.id);
  const open = deals.filter((d) => isOpen(d.stage));
  const sum = (rows: DealRow[]) => rows.reduce((n, d) => n + (d.valueAed ?? 0), 0);
  const count = (s: string) => deals.filter((d) => d.stage === s).length;

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { who: all ? "all" : "", view: board ? "board" : "", stage, kind: kind ?? "", ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  // the list shows open deals by default; a stage tab narrows it, "Won" / "Lost" show closed ones
  const rows = stage ? deals.filter((d) => d.stage === stage) : open;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          items={[
            { href: href({ view: "", stage }), title: "List view", icon: <List />, active: !board },
            { href: href({ view: "board", stage: "" }), title: "Board view", icon: <Kanban />, active: board },
          ]}
        />
        {seesAll && (
          <Segmented
            items={[
              { href: href({ who: "" }), title: "My deals", label: "Mine", active: !all },
              { href: href({ who: "all" }), title: "Everyone's deals", label: "All", active: all },
            ]}
          />
        )}
        <Segmented
          items={[
            { href: href({ kind: "" }), title: "Products and projects", label: "All", active: !kind },
            { href: href({ kind: "product" }), title: "Product deals only", label: "Products", active: kind === "product" },
            { href: href({ kind: "project" }), title: "Project deals only", label: "Projects", active: kind === "project" },
          ]}
        />
        {!board && (
          <nav aria-label="Stage" className="flex min-w-0 basis-full items-center gap-1 overflow-x-auto sm:flex-1 sm:basis-0">
            <Tab href={href({ stage: "" })} active={!stage} label="Open" n={open.length} />
            {stages.map((s) => (
              <Tab key={s.key} href={href({ stage: s.key })} active={stage === s.key} label={STAGE_SHORT[s.key]} n={count(s.key)} />
            ))}
          </nav>
        )}
        <span className={`text-xs whitespace-nowrap text-muted-foreground ${board ? "ml-auto" : ""}`}>
          {open.length} open{mode === "deals" ? ` · ${aedShort(sum(open))}` : ""}
        </span>
        <DealDialog users={users} meId={user.id} stage={mode === "leads" ? "new" : "requirement"} projectTypes={typeOptions} kind={kind} label={mode === "leads" ? "New lead" : "New deal"} />
      </div>

      {board ? (
        <Board open={open} columns={columns} users={users} meId={user.id} canAssign={seesAll} projectTypes={typeOptions} kind={kind} />
      ) : (
        <DealTable deals={rows} users={users} canAssign={seesAll} leads={mode === "leads"} />
      )}
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

function Board({
  open,
  columns,
  users,
  meId,
  canAssign,
  projectTypes,
  kind,
}: {
  open: DealRow[];
  columns: typeof OPEN_STAGES;
  users: Person[];
  meId: number;
  canAssign: boolean;
  projectTypes: { key: string; label: string }[];
  kind?: "product" | "project";
}) {
  return (
    <div className="-mx-3 flex snap-x gap-2.5 overflow-x-auto px-3 pb-2 md:mx-0 md:px-0">
      {columns.map((s) => {
        const rows = open.filter((d) => d.stage === s.key);
        return (
          <section key={s.key} aria-label={s.label} className="flex max-h-[calc(100svh-8.5rem)] w-[17rem] shrink-0 snap-start flex-col rounded-xl bg-muted/40">
            <header className="flex items-center gap-1 px-3 pt-2 pb-1">
              <h2 className="min-w-0 flex-1 truncate text-xs font-semibold" title={s.hint}>
                {s.label}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {rows.length}
                  {rows.length > 0 && ` · ${aedShort(rows.reduce((n, d) => n + (d.valueAed ?? 0), 0))}`}
                </span>
              </h2>
              <DealDialog users={users} meId={meId} stage={s.key} projectTypes={projectTypes} kind={kind} />
            </header>
            <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-2 pb-2">
              {rows.map((d) => (
                <DealCard key={d.id} d={d} users={users} canAssign={canAssign} />
              ))}
              {!rows.length && <p className="py-6 text-center text-xs text-muted-foreground">No deals</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DealCard({ d, users, canAssign }: { d: DealRow; users: Person[]; canAssign: boolean }) {
  return (
    <article className="grid gap-1.5 rounded-lg border bg-card p-2.5 shadow-xs">
      <Link href={`/crm/deals/${d.id}`} className="line-clamp-2 text-sm leading-snug font-medium hover:underline">
        {d.kind === "project" && <ProjectMark />}
        {d.title}
      </Link>
      <div className="truncate text-xs text-muted-foreground">
        <Link href={`/crm/companies/${d.companyId}`} className="hover:underline">
          {d.companyName}
        </Link>
        {d.contactName && ` · ${d.contactName}`}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <TempBadge checks={d.checks} />
          <SourceBadge source={d.source} />
        </span>
        <span className="text-xs font-semibold tabular-nums">{d.valueAed != null ? aedShort(d.valueAed) : <span className="font-normal text-muted-foreground">No value</span>}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <AssignPopover dealId={d.id} assignees={d.assignees} users={users} size={22} readOnly={!canAssign} />
        <span className="flex items-center gap-2">
          <FollowUp due={d.nextDue} />
          <span className="text-[11px] text-muted-foreground" title="Days in this stage">
            {daysSince(d.stageChangedAt)}d
          </span>
          <StageMenu dealId={d.id} stage={d.stage} variant="icon" />
        </span>
      </div>
    </article>
  );
}

function DealTable({ deals, users, canAssign, leads = false }: { deals: DealRow[]; users: Person[]; canAssign: boolean; leads?: boolean }) {
  if (!deals.length) {
    return (
      <div className="rounded-lg border bg-card">
        <Empty>{leads ? "No open leads. Add one with New lead." : "Nothing here. Qualified leads show up here."}</Empty>
      </div>
    );
  }
  return (
    <>
      {/* wide screens: a dense table */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>{leads ? "Lead" : "Deal"}</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead title="Hot / warm / cold, from the qualification checks">Quality</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="max-w-80 py-1.5 whitespace-normal">
                  <Link href={`/crm/deals/${d.id}`} className="block truncate text-sm font-medium hover:underline">
                    {d.kind === "project" && <ProjectMark />}
                    {d.title}
                  </Link>
                  <Link href={`/crm/companies/${d.companyId}`} className="block truncate text-xs text-muted-foreground hover:underline">
                    {d.companyName}
                    {d.contactName && ` · ${d.contactName}`}
                  </Link>
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-40">
                      <StageMenu dealId={d.id} stage={d.stage} />
                    </div>
                    {leads && <QualifyButton dealId={d.id} />}
                  </div>
                </TableCell>
                <TableCell className="py-1.5">
                  <span className="flex items-center gap-1">
                    <TempBadge checks={d.checks} />
                    <SourceBadge source={d.source} />
                  </span>
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums" title={aed(d.valueAed)}>
                  {d.valueAed != null ? aedShort(d.valueAed) : "-"}
                </TableCell>
                <TableCell className="py-1.5">
                  <AssignPopover dealId={d.id} assignees={d.assignees} users={users} readOnly={!canAssign} />
                </TableCell>
                <TableCell className="py-1.5">
                  <FollowUp due={d.nextDue} />
                </TableCell>
                <TableCell className="py-1.5 text-xs whitespace-nowrap text-muted-foreground">{d.lastActivityAt ? ago(d.lastActivityAt) : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* phones: one compact card per deal instead of a table that scrolls sideways */}
      <ul className="grid gap-2 md:hidden">
        {deals.map((d) => (
          <li key={d.id} className="grid gap-1.5 rounded-lg border bg-card p-3">
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
              <div className="w-48">
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
          </li>
        ))}
      </ul>
    </>
  );
}
