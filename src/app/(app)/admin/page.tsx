import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { monthLabel, pickMonth } from "@/components/attendance/attendance-card";
import { cellLook } from "@/components/attendance/status-cell";
import { TeamMatrix } from "@/components/attendance/team-matrix";
import { PageToolbar } from "@/components/page-toolbar";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { formatDuration, formatHm, shiftMonth } from "@/lib/attendance";
import { teamMonth, todayLine, workHours } from "@/lib/attendance-data";
import { requireApp } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";

export const metadata = { title: "Admin · Zeronix" };

/** Admin overview: who is in today, with late and early-leave reasons, and the team's month as a heatmap. */
export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  await requireApp("admin");
  const today = dubaiToday();
  const thisMonth = today.slice(0, 7);
  const { month, lastMonth } = pickMonth((await searchParams).month);
  const [team, hours, teamNow] = await Promise.all([
    teamMonth(month),
    workHours(),
    month === thisMonth ? null : teamMonth(thisMonth),
  ]);
  const now = (teamNow ?? team).map((r) => {
    const cell = r.data.cells.find((c) => c.day === today);
    return { ...r, cell, line: todayLine(cell) };
  });
  const inNow = now.filter((r) => r.line.punchedIn).length;
  const late = now.filter((r) => r.cell?.status === "late").length;
  const notIn = now.filter((r) => r.cell?.status === "today").length;
  const away = now.filter((r) => r.cell && ["absent", "medical", "other"].includes(r.cell.status)).length;

  return (
    <div className="grid gap-3">
      <PageToolbar
        title="Team today"
        meta={`Work ${formatHm(hours.start)}–${formatHm(hours.end)} · break ${formatHm(hours.breakStart)}–${formatHm(hours.breakEnd)}`}
      />
      <StatStrip
        items={[
          { label: "Punched in now", value: `${inNow} of ${now.length}` },
          { label: "Late today", value: late, hint: late ? "reasons below" : "everyone on time" },
          { label: "Not in yet", value: notIn },
          { label: "Away today", value: away, hint: "absent, medical or other leave" },
        ]}
      />

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Person</TableHead>
              <TableHead>Now</TableHead>
              <TableHead className="hidden sm:table-cell">First in</TableHead>
              <TableHead className="hidden sm:table-cell">Last out</TableHead>
              <TableHead className="text-right">Worked</TableHead>
              <TableHead className="hidden md:table-cell">Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {now.map(({ user, cell, line }) => {
              const first = cell?.sessions[0];
              const last = cell?.sessions.at(-1);
              const notes = [
                first?.late && first.inReason ? `Late: ${first.inReason}` : "",
                ...(cell?.sessions.filter((s) => s.early && s.outReason).map((s) => `Left ${s.out}: ${s.outReason}`) ?? []),
                cell?.absence && !cell.sessions.length ? cell.absence.note : "",
              ].filter(Boolean);
              const look = cell ? cellLook(cell.status) : null;
              return (
                <TableRow key={user.id}>
                  <TableCell className="py-1.5">
                    <Link href={`/admin/users/${user.id}`} className="flex items-center gap-2 hover:underline">
                      <UserAvatar name={user.name} size={24} />
                      <span className="font-medium">{user.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="py-1.5 text-xs whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${line.punchedIn ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-hidden />
                      {line.label}
                    </span>
                  </TableCell>
                  <TableCell className="hidden py-1.5 text-xs whitespace-nowrap tabular-nums sm:table-cell">
                    {first ? (
                      <span className="inline-flex items-center gap-1.5">
                        {look && cell && (cell.status === "late" || cell.status === "present") && (
                          <span className={`size-2.5 rounded-[3px] ${look.className}`} style={look.style} title={cell.status === "late" ? "Late" : "On time"} />
                        )}
                        {first.in}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="hidden py-1.5 text-xs tabular-nums sm:table-cell">{last?.out ?? "-"}</TableCell>
                  <TableCell className="py-1.5 text-right text-xs tabular-nums">{cell?.minutes ? formatDuration(cell.minutes) : "-"}</TableCell>
                  <TableCell className="hidden max-w-80 py-1.5 text-xs text-muted-foreground md:table-cell">
                    <span className="line-clamp-2" title={notes.join(" · ")}>
                      {notes.join(" · ") || "-"}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <section className="grid gap-2 rounded-lg border bg-card p-3" aria-label="Team attendance this month">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Attendance</h2>
          <div className="ml-auto flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/admin?month=${shiftMonth(month, -1)}`} scroll={false} aria-label="Previous month" title="Previous month" />}>
              <ChevronLeft />
            </Button>
            <span className="min-w-28 text-center text-sm font-medium">{monthLabel(month)}</span>
            {month < lastMonth ? (
              <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/admin?month=${shiftMonth(month, 1)}`} scroll={false} aria-label="Next month" title="Next month" />}>
                <ChevronRight />
              </Button>
            ) : (
              <span className="size-7" />
            )}
          </div>
        </div>
        <TeamMatrix rows={team} month={month} today={today} />
      </section>
    </div>
  );
}
