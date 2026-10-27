import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { formatHm, isMonth, shiftMonth } from "@/lib/attendance";
import { monthAttendance, workHours, type MonthAttendance } from "@/lib/attendance-data";
import { dubaiToday } from "@/lib/dates";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The month a page should show from `?month=`: this month by default, at most one month ahead (planned leave). */
export function pickMonth(asked: string | string[] | undefined) {
  const thisMonth = dubaiToday().slice(0, 7);
  const lastMonth = shiftMonth(thisMonth, 1);
  return { month: isMonth(asked) && asked <= lastMonth ? asked : thisMonth, lastMonth };
}

export function monthLabel(month: string) {
  return new Date(month + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Attendance for one person and one month, in a slim bordered panel. Pass `data` when the page already loaded it. */
export async function AttendanceCard({
  userId,
  month: asked,
  canEdit,
  basePath,
  data: given,
  summary = true,
}: {
  userId: number;
  month?: string | string[];
  canEdit: boolean;
  /** Page the month arrows link back to (may already carry a query string). */
  basePath: string;
  data?: MonthAttendance;
  /** Show the month's counts next to the calendar. */
  summary?: boolean;
}) {
  const { month, lastMonth } = pickMonth(asked);
  const [data, hours] = await Promise.all([given ?? monthAttendance(userId, month), workHours()]);
  const off = hours.offDays.map((d) => DAY_NAMES[d]).join(", ");
  const sep = basePath.includes("?") ? "&" : "?";

  return (
    <section className="rounded-xl border bg-card p-3 md:p-4" aria-label="Attendance">
      <AttendanceCalendar
        data={data}
        userId={userId}
        canEdit={canEdit}
        monthLabel={monthLabel(month)}
        prevHref={`${basePath}${sep}month=${shiftMonth(month, -1)}`}
        nextHref={month < lastMonth ? `${basePath}${sep}month=${shiftMonth(month, 1)}` : null}
        today={dubaiToday()}
        summary={summary}
        caption={`Work ${formatHm(hours.start)}–${formatHm(hours.end)} · break ${formatHm(hours.breakStart)}–${formatHm(hours.breakEnd)}${off ? ` · off ${off}` : ""}`}
      />
    </section>
  );
}
