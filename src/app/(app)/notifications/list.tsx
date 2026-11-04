"use client";

import { useRouter } from "next/navigation";
import { NotificationRow } from "@/components/notifications/row";
import type { NotificationView } from "@/lib/notifications/types";

/** The page's list; reading or snoozing a line re-reads the page. */
export function NotificationList({ items, empty }: { items: NotificationView[]; empty: string }) {
  const router = useRouter();
  if (!items.length) return <p className="rounded-lg border px-3 py-10 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y rounded-lg border p-1">
      {items.map((n) => (
        <NotificationRow key={n.id} n={n} refresh={() => router.refresh()} />
      ))}
    </div>
  );
}
