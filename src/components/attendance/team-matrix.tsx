"use client";

import Link from "next/link";
import { DayDetails, statusLabel, longDay } from "@/components/attendance/attendance-calendar";
import { AttendanceLegend, cellLook } from "@/components/attendance/status-cell";
import { UserAvatar } from "@/components/user-avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { weekdayOf } from "@/lib/attendance";
import type { TeamRow } from "@/lib/attendance-data";

const LETTER = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The team's month as a heatmap: one row per person, one small square per day (filled = at work, outlined = away),
 * with the month's counts at the end of the row. Hover a square for that day's punches and reasons.
 */
export function TeamMatrix({ rows, month, today }: { rows: TeamRow[]; month: string; today: string }) {
  const days = rows[0]?.data.cells.map((c) => c.day) ?? [];
  if (!rows.length) return <p className="p-4 text-sm text-muted-foreground">No active users.</p>;

  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs" aria-label="Team attendance this month">
          <thead>
            <tr className="text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card pr-3 pb-1 text-left font-medium">Person</th>
              {days.map((d) => {
                const wd = weekdayOf(d);
                return (
                  <th
                    key={d}
                    scope="col"
                    className={`px-px pb-1 text-center font-normal tabular-nums ${d === today ? "text-foreground" : ""}`}
                    title={longDay(d)}
                  >
                    <div className="text-[9px] leading-none">{LETTER[wd]}</div>
                    <div className={`text-[10px] leading-tight ${d === today ? "font-semibold" : ""}`}>{Number(d.slice(8))}</div>
                  </th>
                );
              })}
              <th className="pb-1 pl-3 text-right font-medium" title="Present / late / away (absent, medical, other)">
                In · Late · Away
              </th>
              <th className="pb-1 pl-3 text-right font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ user, data }) => {
              const away = data.counts.absent + data.counts.medical + data.counts.other;
              return (
                <tr key={user.id} className="group">
                  <th scope="row" className="sticky left-0 z-10 bg-card py-0.5 pr-3 text-left font-normal">
                    <Link href={`/admin/users/${user.id}?month=${month}`} className="flex items-center gap-2 hover:underline">
                      <UserAvatar name={user.name} size={20} />
                      <span className="max-w-36 truncate font-medium">{user.name}</span>
                    </Link>
                  </th>
                  {data.cells.map((c) => {
                    const look = cellLook(c.status);
                    return (
                      <td key={c.day} className="px-px py-0.5">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <div
                                tabIndex={0}
                                aria-label={`${user.name}, ${longDay(c.day)}: ${statusLabel(c.status)}`}
                                className={`mx-auto size-[18px] rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${look.className} ${
                                  c.day === today ? "ring-1 ring-foreground ring-offset-1 ring-offset-card" : ""
                                }`}
                                style={look.style}
                              />
                            }
                          />
                          <TooltipContent className="flex-col items-start gap-1">
                            <span className="font-semibold">{user.name}</span>
                            <DayDetails cell={c} />
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}
                  <td className="py-0.5 pl-3 text-right whitespace-nowrap tabular-nums">
                    {data.counts.present} · {data.counts.late} · {away}
                  </td>
                  <td className="py-0.5 pl-3 text-right tabular-nums">{Math.round(data.totalMinutes / 60)}h</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AttendanceLegend />
    </div>
  );
}
