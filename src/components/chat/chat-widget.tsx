"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Minus, MessageCircle, SquarePen, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { startDm } from "@/app/(app)/chat/actions";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { ChannelSummary } from "@/lib/chat/types";
import { dubaiToday, TZ } from "@/lib/dates";
import { chatKeys, useChannels, useChatStream, useTeammates } from "./chat-data";
import { useChatStore } from "./chat-store";
import { Conversation } from "./conversation";

const noop = () => () => {};

/**
 * The team chat on every signed-in page: a round button bottom-right with the unread count, which opens a panel
 * upwards (full screen on a phone). Alt+C opens and closes it, Esc closes it.
 */
export function ChatWidget({ me }: { me: { id: number; name: string } }) {
  const pathname = usePathname();
  const open = useChatStore((s) => s.open);
  const toggle = useChatStore((s) => s.toggle);
  const setOpen = useChatStore((s) => s.setOpen);
  const channels = useChannels();
  // persisted state is read from localStorage after the first render; wait so server and browser agree
  const ready = useSyncExternalStore(noop, () => true, () => false);
  useChatStream(me.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyC") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const unread = (channels.data ?? []).reduce((n, c) => n + (c.muted ? 0 : c.unread), 0);

  // the full chat page shows the same conversations
  if (!ready || pathname.startsWith("/chat")) return null;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Team chat"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className="fixed right-4 bottom-20 z-40 flex h-140 max-h-[calc(100dvh-6rem)] w-95 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl animate-in fade-in slide-in-from-bottom-4 max-sm:inset-0 max-sm:h-auto max-sm:max-h-none max-sm:w-auto max-sm:rounded-none"
        >
          <Panel me={me} channels={channels.data ?? []} loading={channels.isPending} fetching={channels.isFetching} error={channels.error as Error | null} />
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Close chat" : unread ? `Open chat, ${unread} unread` : "Open chat"}
        title="Chat (Alt+C)"
        className={`fixed right-4 bottom-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${open ? "max-sm:hidden" : ""}`}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-white ring-2 ring-background">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </>
  );
}

function Panel({
  me,
  channels,
  loading,
  fetching,
  error,
}: {
  me: { id: number; name: string };
  channels: ChannelSummary[];
  loading: boolean;
  fetching: boolean;
  error: Error | null;
}) {
  const view = useChatStore((s) => s.view);
  const show = useChatStore((s) => s.show);
  const setOpen = useChatStore((s) => s.setOpen);
  const teammates = useTeammates();
  const online = new Set(teammates.data?.online ?? []);
  const channel = view.kind === "channel" ? channels.find((c) => c.id === view.id) : undefined;

  const back = () => show({ kind: "list" });
  const close = (
    <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Minimise chat" title="Minimise (Esc)">
      <Minus />
    </Button>
  );

  // the list is still loading or refreshing (a DM just started shows up a moment later), or the conversation is gone
  if (view.kind === "channel" && !channel) {
    return (
      <>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
          <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Back to conversations">
            <ArrowLeft />
          </Button>
          <p className="flex-1 text-sm font-medium">Chat</p>
          {close}
        </header>
        <p className="py-8 text-center text-xs text-muted-foreground">{loading || fetching ? "Loading…" : "This conversation is not available any more."}</p>
      </>
    );
  }

  if (view.kind === "channel" && channel) {
    const peerOnline = channel.peer ? online.has(channel.peer.id) : false;
    return (
      <>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
          <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Back to conversations">
            <ArrowLeft />
          </Button>
          <PresenceAvatar name={channel.name} online={peerOnline} size={28} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{channel.name}</p>
            {channel.kind === "dm" && <p className="text-[11px] text-muted-foreground">{peerOnline ? "Online" : "Offline"}</p>}
          </div>
          {close}
        </header>
        <Conversation key={channel.id} channel={channel} me={me.id} />
      </>
    );
  }

  if (view.kind === "new") {
    return (
      <>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
          <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Back to conversations">
            <ArrowLeft />
          </Button>
          <p className="flex-1 text-sm font-medium">New message</p>
          {close}
        </header>
        <PeoplePicker online={online} teammates={teammates.data?.users ?? []} loading={teammates.isPending} />
      </>
    );
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <p className="flex-1 text-sm font-semibold">Chat</p>
        <Button variant="ghost" size="icon-sm" onClick={() => show({ kind: "new" })} aria-label="New message" title="New message">
          <SquarePen />
        </Button>
        {close}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>}
        {error && <p className="py-8 text-center text-xs text-destructive">{error.message}</p>}
        {!loading && !error && !channels.length && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <MessageCircle className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
            <Button size="sm" onClick={() => show({ kind: "new" })}>
              Message a teammate
            </Button>
          </div>
        )}
        <ul>
          {channels.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => show({ kind: "channel", id: c.id })}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <PresenceAvatar name={c.name} online={!!c.peer && online.has(c.peer.id)} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`flex-1 truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>{c.name}</span>
                    {c.lastMessageAt && <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(c.lastMessageAt)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-xs ${c.unread ? "text-foreground" : "text-muted-foreground"}`}>
                      {c.lastPreview ? `${c.lastFromId === me.id ? "You: " : ""}${c.lastPreview}` : "No messages yet"}
                    </span>
                    {c.unread > 0 && (
                      <span className={`flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${c.muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}`}>
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function PresenceAvatar({ name, online, size }: { name: string; online: boolean; size: number }) {
  return (
    <span className="relative shrink-0">
      <UserAvatar name={name} size={size} />
      {online && <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-popover" aria-label="Online" />}
    </span>
  );
}

function PeoplePicker({ teammates, online, loading }: { teammates: { id: number; name: string; jobTitle: string }[]; online: Set<number>; loading: boolean }) {
  const qc = useQueryClient();
  const show = useChatStore((s) => s.show);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? teammates.filter((u) => u.name.toLowerCase().includes(needle) || u.jobTitle.toLowerCase().includes(needle)) : teammates;
    // people who are online first
    return [...list].sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)));
  }, [q, teammates, online]);

  const open = (peerId: number) =>
    start(async () => {
      try {
        const id = await startDm(peerId);
        await qc.invalidateQueries({ queryKey: chatKeys.channels });
        show({ kind: "channel", id });
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people"
          aria-label="Search people"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-busy={pending}>
        {loading && <li className="py-8 text-center text-xs text-muted-foreground">Loading…</li>}
        {!loading && !shown.length && <li className="py-8 text-center text-xs text-muted-foreground">Nobody matches “{q}”.</li>}
        {shown.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => open(u.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:opacity-60"
            >
              <PresenceAvatar name={u.name} online={online.has(u.id)} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                {u.jobTitle && <p className="truncate text-xs text-muted-foreground">{u.jobTitle}</p>}
              </div>
              {online.has(u.id) && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Online</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "14:05" today, "Mon" this week, "12 Oct" before that (UAE time). */
function shortTime(iso: string): string {
  const d = new Date(iso);
  if (dubaiToday(d) === dubaiToday()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  if (Date.now() - d.getTime() < 6 * 86400_000) return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
}
