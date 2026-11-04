"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { readNotifications, snoozeNotification } from "@/app/(app)/notifications/actions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ago } from "@/lib/format";
import { isPast, PRIORITY_DOT, PRIORITY_LABEL, type NotificationView } from "@/lib/notifications/types";
import { bellKey, subline } from "./data";

/** One dense line: priority dot, heading, deadline and detail, time; read and snooze on hover. Clicking opens the record. */
export function NotificationRow({ n, onOpen, refresh }: { n: NotificationView; onOpen?: () => void; refresh?: () => void }) {
  const qc = useQueryClient();
  const unread = !n.readAt && !n.resolvedAt;
  const done = () => {
    void qc.invalidateQueries({ queryKey: bellKey });
    refresh?.();
  };
  const read = async () => {
    if (unread) await readNotifications([n.id]).catch(() => {});
    done();
  };
  const sub = subline(n);
  return (
    <div className={`group relative flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted ${unread ? "" : "opacity-70"}`}>
      <span title={PRIORITY_LABEL[n.priority]} className={`mt-1.5 size-2 shrink-0 rounded-full ${PRIORITY_DOT[n.priority]}`} />
      <Link
        href={n.link || "/notifications"}
        onClick={() => {
          void read();
          onOpen?.();
        }}
        className="min-w-0 flex-1"
      >
        <span className={`block truncate text-sm ${unread ? "font-semibold" : ""}`}>{n.title}</span>
        {sub && <span className={`block truncate text-xs ${isPast(n.dueAt) ?"text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{sub}</span>}
        <span className="block text-[11px] text-muted-foreground">
          {n.resolvedAt ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3" /> Resolved
            </span>
          ) : (
            <>
              {ago(n.createdAt)}
              {n.actorName ? ` · by ${n.actorName}` : ""}
            </>
          )}
        </span>
      </Link>
      {!n.resolvedAt && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {unread && (
            <button type="button" title="Mark read" aria-label="Mark read" onClick={() => void read()} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground">
              <Check className="size-3.5" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<button type="button" title="Snooze" aria-label="Snooze" className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground" />}>
              <Clock className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => void snoozeNotification(n.id, "hour").then(done)}>For 1 hour</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void snoozeNotification(n.id, "tomorrow").then(done)}>Until tomorrow 8:00</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
