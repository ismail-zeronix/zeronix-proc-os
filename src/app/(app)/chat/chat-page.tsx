"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ChatDetail, ChannelList } from "@/components/chat/chat-widget";
import { useChannels, useTeammates } from "@/components/chat/chat-data";
import { useChatStore } from "@/components/chat/chat-store";
import type { Me } from "@/components/chat/message-row";
import { WebVisitorPanel } from "@/components/chat/web-chat";
import { ChatSurface } from "@/components/chat/panel-bits";
import { dubaiToday, TZ } from "@/lib/dates";
import type { SearchHit } from "@/lib/chat/search";

/** The full chat page. It shares the widget's state, so the conversation open here is the one open there. */
export function ChatPage({ me }: { me: Me }) {
  const view = useChatStore((s) => s.view);
  const show = useChatStore((s) => s.show);
  const channels = useChannels();
  const teammates = useTeammates();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const found = useQuery({
    queryKey: ["chat", "search", debounced],
    queryFn: async () => (await (await fetch(`/api/chat/search?q=${encodeURIComponent(debounced)}`)).json()).results as SearchHit[],
    enabled: debounced.length >= 2,
    staleTime: 10_000,
  });
  const searching = debounced.length >= 2;
  const detailOpen = view.kind !== "list";
  const webId = view.kind === "web" ? view.id : null;

  return (
    <ChatSurface.Provider value="page">
      <div
        className={`mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-[minmax(0,1fr)] p-2 md:grid-cols-[22rem_minmax(0,1fr)] md:p-4 ${webId ? "xl:grid-cols-[22rem_minmax(0,1fr)_20rem]" : ""}`}
      >
        <aside className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card md:rounded-r-none ${detailOpen ? "max-md:hidden" : ""}`}>
          <ChannelList
            me={me}
            channels={channels.data ?? []}
            loading={channels.isPending}
            error={channels.error as Error | null}
            presence={teammates.data?.presence ?? {}}
            inlineActivity={false}
            belowHeader={
              <div className="relative border-b p-2">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search messages"
                  aria-label="Search messages"
                  className="h-8 w-full rounded-lg border border-input bg-transparent pr-8 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
                {q && (
                  <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            }
            body={
              searching ? (
                <SearchResults
                  hits={found.data ?? []}
                  loading={found.isFetching}
                  q={debounced}
                  onOpen={(h) => {
                    show({ kind: "channel", id: h.channelId });
                  }}
                />
              ) : undefined
            }
          />
        </aside>
        <section
          className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card md:rounded-l-none md:border-l-0 ${webId ? "xl:rounded-r-none" : ""} ${detailOpen ? "" : "max-md:hidden"}`}
        >
          {detailOpen ? (
            <ChatDetail me={me} channels={channels.data ?? []} loading={channels.isPending} fetching={channels.isFetching} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <MessageCircle className="size-10" />
              Pick a conversation on the left, or start a new one with the pencil.
            </div>
          )}
        </section>
        {webId && (
          <aside className="hidden min-h-0 flex-col overflow-hidden rounded-r-xl border border-l-0 bg-card xl:flex" aria-label="Visitor details">
            <WebVisitorPanel id={webId} />
          </aside>
        )}
      </div>
    </ChatSurface.Provider>
  );
}

function SearchResults({ hits, loading, q, onOpen }: { hits: SearchHit[]; loading: boolean; q: string; onOpen: (h: SearchHit) => void }) {
  if (!hits.length) return <p className="py-8 text-center text-xs text-muted-foreground">{loading ? "Searching…" : `No messages with “${q}”.`}</p>;
  return (
    <ul>
      {hits.map((h) => (
        <li key={h.id}>
          <button type="button" onClick={() => onOpen(h)} className="grid w-full gap-0.5 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none">
            <span className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium">
                {h.channelName}
                {h.threadId && <span className="font-normal text-muted-foreground"> · in a thread</span>}
              </span>
              <span className="shrink-0 text-muted-foreground">{when(h.createdAt)}</span>
            </span>
            <span className="line-clamp-2 text-sm">
              {h.userName && <span className="text-muted-foreground">{h.userName.split(" ")[0]}: </span>}
              <Highlight text={h.preview} q={q} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The search words marked in the text. */
function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-300/50 px-0.5 text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return dubaiToday(d) === dubaiToday()
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
}
