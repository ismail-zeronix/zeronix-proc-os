"use client";

import { useQuery } from "@tanstack/react-query";
import { openDealThread } from "@/app/(app)/chat/actions";
import { Conversation } from "./conversation";
import type { Me } from "./message-row";

/** The Chat tab on a deal or project: the deal's thread with everyone on the deal, live. */
export function RecordChat({ dealId, me }: { dealId: number; me: Me }) {
  const q = useQuery({ queryKey: ["chat", "deal-thread", dealId], queryFn: () => openDealThread(dealId), staleTime: Infinity, retry: false });
  return (
    <div className="flex h-[min(32rem,70dvh)] min-h-80 flex-col overflow-hidden rounded-lg border bg-card">
      {q.data ? (
        <Conversation channel={q.data} me={me} />
      ) : (
        <p className={`py-8 text-center text-xs ${q.isError ? "text-destructive" : "text-muted-foreground"}`}>{q.isError ? (q.error as Error).message : "Loading…"}</p>
      )}
    </div>
  );
}
