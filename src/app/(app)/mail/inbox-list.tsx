"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { ago } from "@/lib/format";

interface Row {
  uid: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  receivedAt: string;
  seen: boolean;
}
interface Page {
  messages: Row[];
  total: number;
  hasMore: boolean;
}

export class MailFetchError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

/** Fetches JSON from a Mail API route; failures carry the server's code (not_connected, paused, error). */
export async function mailJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MailFetchError(body.error ?? "Could not load mail.", body.code ?? "error");
  return body as T;
}

/** The inbox, newest first, read live from the mail server and refreshed every minute. */
export function InboxList() {
  const pathname = usePathname();
  const activeUid = Number(/^\/mail\/(\d+)$/.exec(pathname)?.[1]);
  const q = useInfiniteQuery<Page, MailFetchError>({
    queryKey: ["mail-list"],
    queryFn: ({ pageParam }) => mailJson<Page>(`/api/mail/list?page=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasMore ? all.length : undefined),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  if (q.isPending) {
    return (
      <div className="grid gap-2 p-3" aria-busy="true" aria-label="Loading inbox">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="grid gap-2 p-4 text-sm">
        <p className="text-destructive">{q.error.message}</p>
        {(q.error.code === "paused" || q.error.code === "not_connected") && (
          <Link href="/account" className="underline">
            Open My account
          </Link>
        )}
        <Button variant="outline" size="sm" className="w-fit" onClick={() => q.refetch()}>
          <RefreshCw /> Try again
        </Button>
      </div>
    );
  }

  const rows = q.data.pages.flatMap((p) => p.messages);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {rows.map((m) => (
        <Link
          key={m.uid}
          href={`/mail/${m.uid}`}
          className={`flex items-start gap-2 border-b px-3 py-2 hover:bg-muted ${activeUid === m.uid ? "bg-muted" : ""}`}
        >
          <span
            className={`mt-1.5 size-2 shrink-0 rounded-full ${m.seen ? "bg-transparent" : "bg-primary"}`}
            aria-label={m.seen ? "read" : "unread"}
          />
          <UserAvatar name={m.fromName || m.fromEmail || "?"} size={28} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`truncate text-sm ${m.seen ? "" : "font-semibold"}`}>{m.fromName || m.fromEmail || "Unknown sender"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{ago(m.receivedAt)}</span>
            </div>
            <div className={`truncate text-xs ${m.seen ? "text-muted-foreground" : "font-medium"}`}>{m.subject || "(no subject)"}</div>
          </div>
        </Link>
      ))}
      {!rows.length && <p className="p-4 text-sm text-muted-foreground">The inbox is empty.</p>}
      {q.hasNextPage && (
        <div className="p-2">
          <Button variant="ghost" size="sm" className="w-full" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {q.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null} Older emails
          </Button>
        </div>
      )}
    </div>
  );
}
