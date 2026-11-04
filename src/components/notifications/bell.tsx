"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { readNotifications } from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BellData } from "@/lib/notifications/types";
import { bellKey, useBell } from "./data";
import { NotificationRow } from "./row";

const TABS = [
  { key: "alerts", label: "Alerts" },
  { key: "assign", label: "Assigned" },
  { key: "all", label: "All" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** The header bell: unread count (red when something critical waits) and the open list in a popover. */
export function NotificationBell({ initial }: { initial?: BellData }) {
  const qc = useQueryClient();
  const { data } = useBell(initial);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("alerts");
  const items = data?.items ?? [];
  const shown = items.filter((n) => (tab === "all" ? true : tab === "assign" ? n.kind === "assign" : n.kind !== "assign"));
  const count = (t: Tab) => items.filter((n) => !n.readAt && (t === "all" || (t === "assign" ? n.kind === "assign" : n.kind !== "assign"))).length;
  const unread = data?.unread ?? 0;
  const Icon = data?.critical ? BellRing : Bell;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-punch-allow
        render={<Button variant="ghost" size="icon-sm" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications" />}
      >
        <Icon className={data?.critical ? "text-red-600 dark:text-red-400" : undefined} />
        {unread > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ring-2 ring-background ${data?.critical ? "animate-pulse bg-red-600" : "bg-orange-500"}`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent data-punch-allow align="end" className="w-96 max-w-[calc(100vw-1.5rem)] gap-1 p-1.5">
        <div className="flex items-center gap-1 px-1 pb-1">
          <div className="flex rounded-md bg-muted p-0.5 text-xs">
            {TABS.map((t) => {
              const c = count(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`rounded px-2 py-0.5 ${tab === t.key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t.label}
                  {c > 0 && <span className="ml-1 text-muted-foreground">{c}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void readNotifications().then(() => qc.invalidateQueries({ queryKey: bellKey }))}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
          {shown.length ? (
            shown.map((n) => <NotificationRow key={n.id} n={n} onOpen={() => setOpen(false)} />)
          ) : (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">{tab === "assign" ? "Nothing assigned to you lately." : "All clear. Nothing needs you right now."}</p>
          )}
        </div>
        <Link href="/notifications" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-center text-xs text-muted-foreground hover:bg-muted">
          See all notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}
