"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { chime, prefsKey } from "@/components/chat/alerts";
import type { ChatPrefsView } from "@/lib/chat/types";
import { dueText, PRIORITY_RANK, type BellData, type NotificationView } from "@/lib/notifications/types";

export const bellKey = ["notifications"] as const;

/** The bell's lines and unread count. Live events keep it current; it also re-reads every minute and on focus. */
export function useBell(initial?: BellData) {
  return useQuery({
    queryKey: bellKey,
    queryFn: async (): Promise<BellData> => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Could not load notifications.");
      return res.json();
    },
    initialData: initial,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Second line of a row: the deadline when there is one, then the detail. */
export function subline(n: NotificationView): string {
  return [dueText(n.dueAt), n.body].filter(Boolean).join(" · ");
}

/** With several portal tabs open, only the first to see a notification makes a sound or a desktop alert for it. */
function claim(id: number): boolean {
  try {
    const key = `zp-notify-${id}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
    setTimeout(() => localStorage.removeItem(key), 60_000);
    return true;
  } catch {
    return true;
  }
}

/**
 * A notification arrived on the live stream: add it to the bell, and for High and Critical ones show a toast (a Critical
 * one stays until it is dismissed), chime and raise a desktop notification, unless I am on do not disturb.
 */
export function onLiveNotification(qc: QueryClient, n: NotificationView) {
  qc.setQueryData<BellData>(bellKey, (d) => {
    if (!d) return d;
    const items = [n, ...d.items.filter((i) => i.id !== n.id)].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt.localeCompare(a.createdAt));
    const wasUnread = d.items.some((i) => i.id === n.id && !i.readAt);
    return { items, unread: d.unread + (wasUnread ? 0 : 1), critical: d.critical || n.priority === "critical" };
  });
  void qc.invalidateQueries({ queryKey: bellKey });
  if (n.priority !== "critical" && n.priority !== "high") return;

  const open = () => {
    window.location.assign(n.link || "/notifications");
  };
  const desc = subline(n);
  const opts = { description: desc || undefined, duration: n.priority === "critical" ? Infinity : 8000, action: n.link ? { label: "Open", onClick: open } : undefined };
  if (n.priority === "critical") toast.error(n.title, opts);
  else toast.warning(n.title, opts);

  const prefs = qc.getQueryData<ChatPrefsView>(prefsKey);
  if (prefs?.status === "dnd" || !claim(n.id)) return;
  if (prefs?.sound !== false) chime();
  if (prefs?.desktop !== false && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
    const note = new Notification(n.title, { body: desc, tag: `notify-${n.id}`, requireInteraction: n.priority === "critical" });
    note.onclick = () => {
      window.focus();
      open();
      note.close();
    };
  }
}
