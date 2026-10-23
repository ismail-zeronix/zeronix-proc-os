"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { clearAbsence, setAbsence } from "@/app/(app)/attendance-actions";
import { AttendanceLegend, cellLook } from "@/components/attendance/status-cell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDuration, STATUS_META, weekdayOf, type DayStatus } from "@/lib/attendance";
import type { DayCell, MonthAttendance } from "@/lib/attendance-data";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function longDay(day: string) {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function shortDay(day: string) {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export function statusLabel(s: DayStatus) {
  if (s in STATUS_META) return STATUS_META[s as keyof typeof STATUS_META].label;
  return { off: "Day off", today: "Today · not punched in yet", future: "Coming up", none: "No record" }[s as "off" | "today" | "future" | "none"];
}

/** What the tooltip says about one day: status, each session with its reasons, hours. */
export function DayDetails({ cell }: { cell: DayCell }) {
  return (
    <>
      <span className="font-medium">{longDay(cell.day)}</span>
      <span>{statusLabel(cell.status)}</span>
      {cell.sessions.map((s, i) => (
        <span key={i} className="grid opacity-90">
          <span className="tabular-nums">
            {s.in} – {s.out ?? "now"}
            {s.auto ? " (no punch out)" : ""}
          </span>
          {s.late && s.inReason && <span>Late: {s.inReason}</span>}
          {s.early && s.outReason && <span>Left early: {s.outReason}</span>}
        </span>
      ))}
      {cell.minutes > 0 && <span className="tabular-nums">Worked {formatDuration(cell.minutes)}</span>}
      {cell.absence?.note && cell.sessions.length === 0 && <span>Note: {cell.absence.note}</span>}
    </>
  );
}

interface Exception {
  day: string;
  status: DayStatus;
  label: string;
  detail: string;
}

/** Days worth a second look: late, left early, forgot to punch out, or away. */
function exceptions(cells: DayCell[]): Exception[] {
  const out: Exception[] = [];
  for (const c of cells) {
    const first = c.sessions[0];
    if (c.status === "late") out.push({ day: c.day, status: c.status, label: `Late · in at ${first.in}`, detail: first.inReason });
    for (const s of c.sessions) {
      if (s.early) out.push({ day: c.day, status: "late", label: `Left at ${s.out}`, detail: s.outReason });
      if (s.auto) out.push({ day: c.day, status: "today", label: "No punch out", detail: `Closed at ${s.out}` });
    }
    if (c.status === "absent" || c.status === "medical" || c.status === "other") {
      out.push({ day: c.day, status: c.status, label: statusLabel(c.status), detail: c.absence?.note ?? "No reason recorded" });
    }
  }
  return out;
}

/**
 * One person's month: a compact calendar (filled = at work, outlined = away), the month's numbers, and the list of
 * exceptions with their reasons. Hover a day for its punches; click a day without punches to record an absence.
 */
export function AttendanceCalendar({
  data,
  userId,
  canEdit,
  monthLabel,
  prevHref,
  nextHref,
  today,
  caption,
  summary = true,
}: {
  data: MonthAttendance;
  userId: number;
  canEdit: boolean;
  monthLabel: string;
  prevHref: string;
  nextHref: string | null;
  today: string;
  /** Short line about the work hours, shown next to the month. */
  caption?: string;
  /** Show the month's counts (leave out where the page already has a stat strip). */
  summary?: boolean;
}) {
  const lead = (weekdayOf(data.cells[0].day) + 6) % 7; // Monday first
  const { counts } = data;
  const daysIn = counts.present + counts.late;
  const list = exceptions(data.cells);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={prevHref} scroll={false} aria-label="Previous month" title="Previous month" />}>
            <ChevronLeft />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium">{monthLabel}</span>
          {nextHref ? (
            <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={nextHref} scroll={false} aria-label="Next month" title="Next month" />}>
              <ChevronRight />
            </Button>
          ) : (
            <span className="size-7" />
          )}
        </div>
        {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      </div>

      <div className="grid items-start gap-x-8 gap-y-4 md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="grid w-fit grid-cols-[repeat(7,2rem)] gap-1" role="grid" aria-label={`Attendance for ${monthLabel}`}>
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-medium text-muted-foreground" role="columnheader">
              {d}
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`lead-${i}`} />
          ))}
          {data.cells.map((c) => (
            <DayCellButton
              key={c.day}
              cell={c}
              userId={userId}
              isToday={c.day === today}
              editable={canEdit && c.sessions.length === 0 && c.status !== "none"}
            />
          ))}
        </div>

        <div className="grid min-w-0 gap-3">
          {summary && (
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-xs sm:grid-cols-6">
              {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((k) => {
                const look = cellLook(k);
                return (
                  <div key={k} className="bg-card px-2.5 py-1.5">
                    <dt className="flex items-center gap-1.5 truncate text-muted-foreground">
                      <span className={`size-2.5 shrink-0 rounded-[3px] ${look.className}`} style={look.style} aria-hidden />
                      {k === "medical" ? "Medical" : k === "other" ? "Other leave" : k === "late" ? "Late" : STATUS_META[k].label}
                    </dt>
                    <dd className="text-base font-semibold tabular-nums">{counts[k]}</dd>
                  </div>
                );
              })}
              <div className="bg-card px-2.5 py-1.5">
                <dt className="truncate text-muted-foreground">Worked</dt>
                <dd className="text-base font-semibold tabular-nums" title={daysIn ? `Average ${formatDuration(data.totalMinutes / daysIn)} a day` : undefined}>
                  {formatDuration(data.totalMinutes)}
                </dd>
              </div>
            </dl>
          )}

          <div className="grid gap-1">
            <div className="text-xs font-medium text-muted-foreground">
              Exceptions{list.length ? ` (${list.length})` : ""}
              {daysIn > 0 && (
                <span className="font-normal">
                  {" "}
                  · on time {Math.round((counts.present / daysIn) * 100)}% · average {formatDuration(data.totalMinutes / daysIn)} a day
                </span>
              )}
            </div>
            {list.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No late days, early leaves or absences this month.</p>
            ) : (
              <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border text-sm">
                {list.map((e, i) => {
                  const look = cellLook(e.status);
                  return (
                    <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-2 px-2.5 py-1.5">
                      <span className="text-xs text-muted-foreground tabular-nums">{shortDay(e.day)}</span>
                      <span className="min-w-0">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <span className={`size-2.5 shrink-0 rounded-[3px] ${look.className}`} style={look.style} aria-hidden />
                          {e.label}
                        </span>
                        {e.detail && <span className="block truncate text-xs text-muted-foreground" title={e.detail}>{e.detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <AttendanceLegend />
      {canEdit && (
        <p className="text-[11px] text-muted-foreground">
          Click a day without punches to mark it as a medical or other absence (up to 60 days ahead for planned leave).
        </p>
      )}
    </div>
  );
}

function DayCellButton({ cell, userId, isToday, editable }: { cell: DayCell; userId: number; isToday: boolean; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const look = cellLook(cell.status);
  const label = `${longDay(cell.day)}: ${statusLabel(cell.status)}`;
  const className = `flex size-8 items-center justify-center rounded-md text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring ${look.className} ${
    isToday ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""
  } ${editable ? "cursor-pointer hover:brightness-95" : "cursor-default"}`;
  const body = Number(cell.day.slice(8));
  const tip = (
    <TooltipContent className="flex-col items-start gap-1">
      <DayDetails cell={cell} />
    </TooltipContent>
  );

  if (!editable) {
    return (
      <Tooltip>
        <TooltipTrigger render={<div role="gridcell" tabIndex={0} aria-label={label} className={className} style={look.style} />}>{body}</TooltipTrigger>
        {tip}
      </Tooltip>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={<PopoverTrigger render={<button type="button" role="gridcell" aria-label={label} className={className} style={look.style} />} />}
        >
          {body}
        </TooltipTrigger>
        {tip}
      </Tooltip>
      <PopoverContent className="w-72">
        <AbsenceForm cell={cell} userId={userId} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function AbsenceForm({ cell, userId, onDone }: { cell: DayCell; userId: number; onDone: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<"medical" | "other">(cell.absence?.kind ?? "medical");
  const [note, setNote] = useState(cell.absence?.note ?? "");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        onDone();
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  return (
    <form
      className="grid gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setAbsence({ userId, day: cell.day, kind, note }), "Absence saved");
      }}
    >
      <div className="text-sm font-medium">{longDay(cell.day)}</div>
      <div className="inline-flex rounded-lg border bg-muted/50 p-0.5" role="radiogroup" aria-label="Reason">
        {(["medical", "other"] as const).map((k) => {
          const look = cellLook(k);
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium ${
                kind === k ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              <span className={`size-2.5 rounded-[3px] ${look.className}`} style={look.style} aria-hidden />
              {k === "medical" ? "Medical" : "Other reason"}
            </button>
          );
        })}
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={250}
        placeholder={kind === "other" ? "What was the reason?" : "Note (optional), e.g. sick leave"}
        aria-label="Note"
      />
      <div className="flex justify-between gap-2">
        {cell.absence ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            pending={pending}
            onClick={() => run(() => clearAbsence({ userId, day: cell.day }), "Absence removed")}
          >
            Remove
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" size="sm" pending={pending} disabled={(kind === "other" && note.trim().length < 3)}>
          Save
        </Button>
      </div>
    </form>
  );
}
