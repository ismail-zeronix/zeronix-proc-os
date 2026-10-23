"use client";

import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { previewOf } from "@/lib/chat/text";
import type { ChannelSummary, ChatEvent, ChatMessage, ChatUser } from "@/lib/chat/types";
import { useChatStore } from "./chat-store";

export interface MessagePage {
  messages: ChatMessage[];
  hasMore: boolean;
  members: (ChatUser & { lastReadId: number })[];
}
export type MessagesData = InfiniteData<MessagePage, number | undefined>;

export interface Teammate extends ChatUser {
  jobTitle: string;
}

export const chatKeys = {
  all: ["chat"] as const,
  channels: ["chat", "channels"] as const,
  users: ["chat", "users"] as const,
  messages: (channelId: number) => ["chat", "messages", channelId] as const,
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load the chat.");
  return res.json();
}

export const fetchMessages = (channelId: number, before?: number) =>
  getJson<MessagePage>(`/api/chat/channels/${channelId}/messages${before ? `?before=${before}` : ""}`);

export function useChannels() {
  return useQuery({
    queryKey: chatKeys.channels,
    queryFn: () => getJson<{ channels: ChannelSummary[] }>("/api/chat/channels").then((r) => r.channels),
    staleTime: Infinity, // the live stream keeps it current
  });
}

export function useTeammates() {
  return useQuery({
    queryKey: chatKeys.users,
    queryFn: () => getJson<{ users: Teammate[]; online: number[] }>("/api/chat/users"),
    staleTime: 5 * 60_000,
  });
}

/** Adds a message to a loaded conversation (once, even if the stream and the send both deliver it). */
export function addMessage(qc: QueryClient, m: ChatMessage) {
  qc.setQueryData<MessagesData>(chatKeys.messages(m.channelId), (data) => {
    if (!data) return data;
    if (data.pages.some((p) => p.messages.some((x) => x.id === m.id))) return data;
    const [newest, ...older] = data.pages;
    return { ...data, pages: [{ ...newest, messages: [...newest.messages, m] }, ...older] };
  });
}

/** Moves the conversation to the top of the list with the new last line; counts it as unread unless it is being read. */
export function bumpChannel(qc: QueryClient, m: ChatMessage, me: number, reading: boolean) {
  let known = false;
  qc.setQueryData<ChannelSummary[]>(chatKeys.channels, (list) => {
    if (!list) return list;
    const c = list.find((x) => x.id === m.channelId);
    if (!c) return list;
    known = true;
    const mine = m.userId === me;
    const next: ChannelSummary = {
      ...c,
      lastMessageAt: m.createdAt,
      lastPreview: previewOf(m.kind, m.body),
      lastFrom: m.userName,
      lastFromId: m.userId,
      unread: mine ? 0 : reading ? c.unread : c.unread + 1,
    };
    return [next, ...list.filter((x) => x.id !== m.channelId)];
  });
  // a conversation someone else just started with me
  if (!known) void qc.invalidateQueries({ queryKey: chatKeys.channels });
}

/** True when this browser tab is showing that conversation right now. */
export function isReading(channelId: number): boolean {
  const s = useChatStore.getState();
  return typeof document !== "undefined" && document.visibilityState === "visible" && s.open && s.view.kind === "channel" && s.view.id === channelId;
}

/** Listens to the chat's live stream for as long as the widget is mounted, and keeps the cached lists current. */
export function useChatStream(me: number) {
  const qc = useQueryClient();
  useEffect(() => {
    let source: EventSource | null = null;
    let lost = false;
    const handle = (evt: ChatEvent | { t: "resync" }) => {
      switch (evt.t) {
        case "message.new":
          addMessage(qc, evt.message);
          bumpChannel(qc, evt.message, me, isReading(evt.message.channelId));
          break;
        case "read":
          if (evt.userId === me) qc.setQueryData<ChannelSummary[]>(chatKeys.channels, (l) => l?.map((c) => (c.id === evt.channelId ? { ...c, unread: 0 } : c)));
          qc.setQueryData<MessagesData>(chatKeys.messages(evt.channelId), (d) =>
            d && {
              ...d,
              pages: d.pages.map((p) => ({ ...p, members: p.members.map((u) => (u.id === evt.userId ? { ...u, lastReadId: evt.lastReadId } : u)) })),
            },
          );
          break;
        case "channel.update":
          void qc.invalidateQueries({ queryKey: chatKeys.channels });
          break;
        case "presence":
          qc.setQueryData<{ users: Teammate[]; online: number[] }>(chatKeys.users, (d) =>
            d && { ...d, online: evt.online ? [...new Set([...d.online, evt.userId])] : d.online.filter((id) => id !== evt.userId) },
          );
          break;
        case "resync":
          void qc.invalidateQueries({ queryKey: chatKeys.all });
          break;
      }
    };
    source = new EventSource("/api/chat/stream");
    source.onmessage = (e) => {
      try {
        handle(JSON.parse(e.data));
      } catch {
        // ignore a malformed line
      }
    };
    source.onerror = () => {
      lost = true;
    };
    source.onopen = () => {
      // back after a drop: re-read whatever may have been missed
      if (lost) void qc.invalidateQueries({ queryKey: chatKeys.all });
      lost = false;
    };
    return () => source?.close();
  }, [qc, me]);
}
