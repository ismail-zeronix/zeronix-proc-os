/** Notification shapes shared by the server and the bell (no server code here). */

export type Priority = "critical" | "high" | "normal" | "info";
export type NotificationKind = "assign" | "system" | "digest";

/** Most urgent first. */
export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2, info: 3 };

export const PRIORITY_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", normal: "Normal", info: "Info" };

/** The priority dot's colour class. */
export const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  normal: "bg-sky-500",
  info: "bg-muted-foreground/40",
};

/** One line in the bell, as the browser gets it. */
export interface NotificationView {
  id: number;
  kind: NotificationKind;
  rule: string;
  priority: Priority;
  title: string;
  body: string;
  link: string;
  /** ISO time of the deadline it is about, if any. */
  dueAt: string | null;
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  actorName: string | null;
}

/** What the bell shows: the open list (newest and most urgent first) and the unread count. */
export interface BellData {
  items: NotificationView[];
  unread: number;
  /** An unread critical alert is waiting (the badge turns red). */
  critical: boolean;
}

/** Has this deadline passed? */
export const isPast = (at: string | Date | null, now = Date.now()) => !!at && new Date(at).getTime() < now;

/** "in 3 h", "in 2 days", "2 h late", "3 days late" for a deadline. */
export function dueText(dueAt: string | null, now = Date.now()): string {
  if (!dueAt) return "";
  const diff = Date.parse(dueAt) - now;
  const mins = Math.round(Math.abs(diff) / 60_000);
  const span = mins < 60 ? `${Math.max(1, mins)} min` : mins < 48 * 60 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`;
  return diff >= 0 ? `due in ${span}` : `${span} late`;
}
