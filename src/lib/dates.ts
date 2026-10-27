/** The company works on UAE time whatever time zone the server runs in. */
export const TZ = "Asia/Dubai";

/** Today's calendar day in the UAE as YYYY-MM-DD (also sorts correctly as text). */
export function dubaiToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole days since 1970-01-01 for the UAE calendar day: changes at midnight in Dubai, whatever the server's time zone. */
export function dubaiDayNumber(now = new Date()): number {
  return Math.floor(Date.parse(dubaiToday(now) + "T00:00:00Z") / 86400_000);
}

/** "Today", "Tomorrow", "Yesterday", "Mon 26 Oct" for a YYYY-MM-DD day, relative to the UAE today. */
export function dayLabel(day: string, today = dubaiToday()): string {
  const diff = Math.round((Date.parse(day + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
