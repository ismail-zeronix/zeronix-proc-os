"use client";

import { AtSign, Handshake, Info, MessageCircle, SquareArrowOutUpRight, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { ChannelSummary } from "@/lib/chat/types";
import { dubaiToday, TZ } from "@/lib/dates";
import { useChannels, useChatStream, useTeammates } from "./chat-data";
import { useChatStore, type ChatTab } from "./chat-store";
import { ChannelInfo } from "./channel-info";
import { Conversation } from "./conversation";
import type { Me } from "./message-row";
import { NewChat } from "./new-chat";
import { ChannelAvatar, PanelHeader } from "./panel-bits";

const noop = () => () => {};

/**
 * The team chat on every signed-in page: a round button bottom-right with the unread count, which opens a panel
 * upwards (full screen on a phone). Alt+C opens and closes it, Esc closes it.
 */
export function ChatWidget({ me }: { me: Me }) {
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
            if (e.key === "Escape" && !e.defaultPrevented) setOpen(false);
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

function Panel({ me, channels, loading, fetching, error }: { me: Me; channels: ChannelSummary[]; loading: boolean; fetching: boolean; error: Error | null }) {
  const view = useChatStore((s) => s.view);
  const show = useChatStore((s) => s.show);
  const teammates = useTeammates();
  const online = new Set(teammates.data?.online ?? []);
  const id = view.kind === "channel" || view.kind === "info" ? view.id : null;
  const channel = id != null ? channels.find((c) => c.id === id) : undefined;
  const back = () => show({ kind: "list" });

  if (view.kind === "new") return <NewChat online={online} teammates={teammates.data?.users ?? []} loadingPeople={teammates.isPending} />;

  // the list is still loading or refreshing (a chat just started shows up a moment later), or the conversation is gone
  if (id != null && !channel) {
    return (
      <>
        <PanelHeader title="Chat" onBack={back} />
        <p className="py-8 text-center text-xs text-muted-foreground">{loading || fetching ? "Loading…" : "This conversation is not available any more."}</p>
      </>
    );
  }

  if (view.kind === "info" && channel) return <ChannelInfo channel={channel} me={me} online={online} teammates={teammates.data?.users ?? []} />;

  if (view.kind === "channel" && channel) {
    const peerOnline = !!channel.peer && online.has(channel.peer.id);
    return (
      <>
        <PanelHeader onBack={back}>
          <ChannelAvatar channel={channel} online={online} size={28} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{channel.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {channel.kind === "dm"
                ? peerOnline
                  ? "Online"
                  : "Offline"
                : channel.kind === "record"
                  ? channel.record?.subtitle || "Deal thread"
                  : channel.topic || `${channel.members.length} ${channel.members.length === 1 ? "person" : "people"}`}
            </p>
          </div>
          {channel.kind === "record" && channel.record && (
            <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={channel.record.href} />} aria-label="Open the deal" title="Open the deal">
              <SquareArrowOutUpRight />
            </Button>
          )}
          {channel.kind === "group" && (
            <Button variant="ghost" size="icon-sm" onClick={() => show({ kind: "info", id: channel.id })} aria-label="Channel details" title="Channel details">
              <Info />
            </Button>
          )}
        </PanelHeader>
        <Conversation key={channel.id} channel={channel} me={me} />
      </>
    );
  }

  return <ChannelList me={me} channels={channels} loading={loading} error={error} online={online} />;
}

function ChannelList({ me, channels, loading, error, online }: { me: Me; channels: ChannelSummary[]; loading: boolean; error: Error | null; online: Set<number> }) {
  const show = useChatStore((s) => s.show);
  const tab = useChatStore((s) => s.tab);
  const setTab = useChatStore((s) => s.setTab);
  const inTab = (t: ChatTab) => channels.filter((c) => (t === "activity" ? c.kind === "system" : t === "threads" ? c.kind === "record" : c.kind === "dm" || c.kind === "group"));
  const unreadIn = (t: ChatTab) => inTab(t).reduce((n, c) => n + (c.muted ? 0 : c.unread), 0);
  const shown = inTab(tab);

  return (
    <>
      <PanelHeader>
        <div className="flex flex-1 items-center gap-0.5 pl-1" role="tablist" aria-label="Conversations">
          {(
            [
              { key: "chats", label: "Chats", icon: MessageCircle },
              { key: "threads", label: "Deals", icon: Handshake },
              { key: "activity", label: "Activity", icon: AtSign },
            ] as const
          ).map((t) => {
            const n = unreadIn(t.key);
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-sm ${tab === t.key ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/60"}`}
              >
                <t.icon className="size-4" />
                {t.label}
                {n > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{n}</span>}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => show({ kind: "new" })} aria-label="New message or channel" title="New message or channel">
          <SquarePen />
        </Button>
      </PanelHeader>
      {tab === "activity" ? (
        shown[0] ? (
          <Conversation key={shown[0].id} channel={shown[0]} me={me} />
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <AtSign className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading…" : "When someone @mentions you in chat, a deal timeline, a task or a company note, the card shows up here."}
            </p>
          </div>
        )
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>}
          {error && <p className="py-8 text-center text-xs text-destructive">{error.message}</p>}
          {!loading && !error && !shown.length && (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              {tab === "threads" ? <Handshake className="size-8 text-muted-foreground" /> : <MessageCircle className="size-8 text-muted-foreground" />}
              <p className="text-sm text-muted-foreground">
                {tab === "threads" ? "No deal threads yet. Open a deal and use its Chat tab to talk with the deal's team." : "No conversations yet."}
              </p>
              {tab === "chats" && (
                <Button size="sm" onClick={() => show({ kind: "new" })}>
                  Message a teammate
                </Button>
              )}
            </div>
          )}
          <ul>
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => show({ kind: "channel", id: c.id })}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <ChannelAvatar channel={c} online={online} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={`flex-1 truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>
                        {c.name}
                        {c.kind === "record" && c.record?.subtitle && <span className="font-normal text-muted-foreground"> · {c.record.subtitle}</span>}
                      </span>
                      {c.lastMessageAt && <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(c.lastMessageAt)}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`flex-1 truncate text-xs ${c.unread ? "text-foreground" : "text-muted-foreground"}`}>
                        {c.lastPreview
                          ? `${c.lastFromId === me.id ? "You: " : c.kind !== "dm" && c.lastFrom ? `${c.lastFrom.split(" ")[0]}: ` : ""}${c.lastPreview}`
                          : "No messages yet"}
                      </span>
                      {c.unread > 0 && (
                        <span
                          className={`flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${c.muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}`}
                        >
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
      )}
    </>
  );
}

/** "14:05" today, "Mon" this week, "12 Oct" before that (UAE time). */
function shortTime(iso: string): string {
  const d = new Date(iso);
  if (dubaiToday(d) === dubaiToday()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  if (Date.now() - d.getTime() < 6 * 86400_000) return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
}
