import { CalendarClock, Kanban, List } from "lucide-react";
import Link from "next/link";
import { Segmented } from "@/components/segmented";
import { StageMenu } from "@/components/stage-menu";
import { Empty } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AvatarStack } from "@/components/user-avatar";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { type Phase, PHASES, phaseLabel } from "@/lib/projects";
import { listProjects, type ProjectRow, projectTypes } from "@/lib/projects-data";
import { aed, aedShort, stageLabel } from "@/lib/sales";
import { salesUsers } from "@/lib/sales-data";
import { EnquiryDialog } from "../../sales/new/enquiry-dialog";
import { ProjectStatusMenu, TaskProgress, TypeFilter } from "../project-ui";

export const metadata = { title: "Projects · Zeronix Projects" };

// phases that are still being worked on; completed and lost ones have their own tabs
const OPEN: Phase[] = ["lead", "quoted", "won", "active"];
const BOARD: Phase[] = ["lead", "quoted", "won", "active", "done"];

export default async function ProjectListPage({ searchParams }: PageProps<"/projects/list">) {
  const access = await requireApp("projects");
  const { user, seesAll, apps } = access;
  const sp = await searchParams;
  const one = (k: string) => String((Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "");
  const all = seesAll && one("who") === "all";
  const board = one("view") === "board";
  const phase = PHASES.some((p) => p.key === one("phase")) ? (one("phase") as Phase) : "";
  const type = one("type");
  const canSales = apps.includes("sales");

  const [rows, types, team] = await Promise.all([
    listProjects(viewerOf(access), { memberId: all ? undefined : user.id, typeKey: type || undefined }),
    projectTypes(),
    canSales ? salesUsers() : Promise.resolve([]),
  ]);
  const typeOptions = types.map((t) => ({ key: t.key, label: t.label }));
  const users = seesAll ? team : team.filter((u) => u.id === user.id);
  const open = rows.filter((r) => OPEN.includes(r.phase));
  const count = (p: Phase) => rows.filter((r) => r.phase === p).length;
  const shown = phase ? rows.filter((r) => r.phase === phase) : open;

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { who: all ? "all" : "", view: board ? "board" : "", phase, type, ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    return p.size ? `/projects/list?${p}` : "/projects/list";
  };
  const add = (stage = "new") => (canSales ? <EnquiryDialog users={users} meId={user.id} stage={stage} projectTypes={typeOptions} kind="project" /> : null);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          items={[
            { href: href({ view: "" }), title: "List view", icon: <List />, active: !board },
            { href: href({ view: "board", phase: "" }), title: "Board view", icon: <Kanban />, active: board },
          ]}
        />
        {seesAll && (
          <Segmented
            items={[
              { href: href({ who: "" }), title: "My projects", label: "Mine", active: !all },
              { href: href({ who: "all" }), title: "Everyone's projects", label: "All", active: all },
            ]}
          />
        )}
        <TypeFilter types={typeOptions} value={type} />
        {!board && (
          <nav aria-label="Phase" className="flex min-w-0 basis-full items-center gap-1 overflow-x-auto sm:flex-1 sm:basis-0">
            <Tab href={href({ phase: "" })} active={!phase} label="Open" n={open.length} />
            {PHASES.map((p) => (
              <Tab key={p.key} href={href({ phase: p.key })} active={phase === p.key} label={p.label} n={count(p.key)} />
            ))}
          </nav>
        )}
        <span className={`text-xs whitespace-nowrap text-muted-foreground ${board ? "ml-auto" : ""}`}>
          {open.length} open · {aedShort(open.reduce((n, r) => n + (r.valueAed ?? 0), 0))}
        </span>
        {!board && add()}
      </div>

      {board ? <Board rows={rows} add={add} canSales={canSales} /> : <ProjectTable rows={shown} grouped={!phase} canSales={canSales} />}
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

/** Lead and quoted projects move with their deal's stage; won ones with their work status. */
function StatusCell({ r, canSales }: { r: ProjectRow; canSales: boolean }) {
  if (r.stage === "won") return <ProjectStatusMenu projectId={r.id} status={r.status} />;
  if (canSales) return <StageMenu dealId={r.dealId} stage={r.stage} />;
  return <span className="text-xs text-muted-foreground">{stageLabel(r.stage)}</span>;
}

function Due({ r }: { r: ProjectRow }) {
  const day = r.stage === "won" ? r.targetDate : r.nextDue;
  if (!day) return <span className="text-xs text-muted-foreground">-</span>;
  const late = day < dubaiToday() && r.phase !== "done";
  return (
    <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${late ? "font-medium text-destructive" : "text-muted-foreground"}`} title={r.stage === "won" ? "Target completion" : "Next follow-up"}>
      <CalendarClock className="size-3.5" />
      {dayLabel(day)}
    </span>
  );
}

function ProjectTable({ rows, grouped, canSales }: { rows: ProjectRow[]; grouped: boolean; canSales: boolean }) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border bg-card">
        <Empty>No projects here. Use + to add a project deal, or mark a deal as a project in Sales.</Empty>
      </div>
    );
  }
  const groups = grouped ? OPEN.map((p) => ({ phase: p, rows: rows.filter((r) => r.phase === p) })).filter((g) => g.rows.length) : [{ phase: null, rows }];
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Project</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Tasks</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Team</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <Group key={g.phase ?? "all"} label={g.phase ? phaseLabel(g.phase) : null} rows={g.rows} canSales={canSales} />
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="grid gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/projects/list/${r.id}`} className="line-clamp-2 text-sm leading-snug font-medium">
                  {r.title}
                </Link>
                <div className="truncate text-xs text-muted-foreground">
                  {r.number} · {r.companyName} · {r.typeLabel}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{r.valueAed != null ? aedShort(r.valueAed) : "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="w-44">
                <StatusCell r={r} canSales={canSales} />
              </div>
              <TaskProgress done={r.tasksDone} open={r.tasksOpen} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <AvatarStack users={r.assignees} size={22} />
              <Due r={r} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Group({ label, rows, canSales }: { label: string | null; rows: ProjectRow[]; canSales: boolean }) {
  return (
    <>
      {label && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={7} className="py-1 text-xs font-semibold text-muted-foreground">
            {label} <span className="font-normal">· {rows.length} · {aedShort(rows.reduce((n, r) => n + (r.valueAed ?? 0), 0))}</span>
          </TableCell>
        </TableRow>
      )}
      {rows.map((r) => (
        <TableRow key={r.id}>
          <TableCell className="max-w-96 py-1.5 whitespace-normal">
            <Link href={`/projects/list/${r.id}`} className="block truncate text-sm font-medium hover:underline">
              {r.title}
            </Link>
            <span className="block truncate text-xs text-muted-foreground">
              <span className="font-mono">{r.number}</span> · {r.companyName}
              {r.contactName && ` · ${r.contactName}`}
            </span>
          </TableCell>
          <TableCell className="py-1.5 text-xs whitespace-nowrap">{r.typeLabel}</TableCell>
          <TableCell className="py-1.5">
            <div className="w-44">
              <StatusCell r={r} canSales={canSales} />
            </div>
          </TableCell>
          <TableCell className="py-1.5 text-right tabular-nums" title={aed(r.valueAed)}>
            {r.valueAed != null ? aedShort(r.valueAed) : "-"}
          </TableCell>
          <TableCell className="py-1.5">
            <TaskProgress done={r.tasksDone} open={r.tasksOpen} />
          </TableCell>
          <TableCell className="py-1.5">
            <Due r={r} />
          </TableCell>
          <TableCell className="py-1.5">
            <AvatarStack users={r.assignees} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function Board({ rows, add, canSales }: { rows: ProjectRow[]; add: (stage?: string) => React.ReactNode; canSales: boolean }) {
  return (
    <div className="-mx-3 flex snap-x gap-2.5 overflow-x-auto px-3 pb-2 md:mx-0 md:px-0">
      {BOARD.map((p) => {
        const list = rows.filter((r) => r.phase === p);
        return (
          <section key={p} aria-label={phaseLabel(p)} className="flex max-h-[calc(100svh-8.5rem)] w-[17rem] shrink-0 snap-start flex-col rounded-xl bg-muted/40">
            <header className="flex min-h-9 items-center gap-1 px-3 pt-2 pb-1">
              <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">
                {phaseLabel(p)}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {list.length}
                  {list.length > 0 && ` · ${aedShort(list.reduce((n, r) => n + (r.valueAed ?? 0), 0))}`}
                </span>
              </h2>
              {p === "lead" && add()}
              {p === "quoted" && add("quoted")}
            </header>
            <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-2 pb-2">
              {list.map((r) => (
                <article key={r.id} className="grid gap-1.5 rounded-lg border bg-card p-2.5 shadow-xs">
                  <Link href={`/projects/list/${r.id}`} className="line-clamp-2 text-sm leading-snug font-medium hover:underline">
                    {r.title}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.companyName} · {r.typeLabel}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <TaskProgress done={r.tasksDone} open={r.tasksOpen} />
                    <span className="text-xs font-semibold tabular-nums">{r.valueAed != null ? aedShort(r.valueAed) : <span className="font-normal text-muted-foreground">No value</span>}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <AvatarStack users={r.assignees} size={22} />
                    <Due r={r} />
                  </div>
                  {p !== "done" && (
                    <div className="w-full">
                      <StatusCell r={r} canSales={canSales} />
                    </div>
                  )}
                </article>
              ))}
              {!list.length && <p className="py-6 text-center text-xs text-muted-foreground">No projects</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
