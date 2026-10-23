"use client";

import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";
import { previewOf } from "@/lib/chat/text";
import type { ChannelSummary, ChatEvent, ChatMessage, ChatUser, OpenGroup, Reaction } from "@/lib/chat/types";

export type Member = ChatUser & { lastReadId: number; role: "owner" | "member" };

export interface MessagePage {
  messages: ChatMessage[];
  hasMore: boolean;
  members: Member[];
}
export type MessagesData = InfiniteData<MessagePage, number | undefined>;
export interface ThreadData {
  root: ChatMessage;
  replies: ChatMessage[];
}

export interface Teammate extends ChatUser {
  jobTitle: string;
}

export const chatKeys = {
  all: ["chat"] as const,
  channels: ["chat", "channels"] as const,
  users: ["chat", "users"] as const,
  groups: ["chat", "groups"] as const,
  messages: (channelId: number) => ["chat", "messages", channelId] as const,
  thread: (rootId: number) => ["chat", "thread", rootId] as const,
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load the chat.");
  return res.json();
}

export const fetchMessages = (channelId: number, before?: number) =>
  getJson<MessagePage>(`/api/chat/channels/${channelId}/messages${before ? `?before=${before}` : ""}`);
export const fetchThread = (rootId: number) => getJson<ThreadData>(`/api/chat/messages/${rootId}/thread`);

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

export function useOpenGroups() {
  return useQuery({ queryKey: chatKeys.groups, queryFn: () => getJson<{ groups: OpenGroup[] }>("/api/chat/groups").then((r) => r.groups) });
}

// ---------- which conversations are on screen ----------

const onScreen = new Map<number, number>();

/** Registers a conversation as being shown while the component is mounted (the widget, or a deal's Chat tab). */
export function useOnScreen(channelId: number) {
  useEffect(() => {
    onScreen.set(channelId, (onScreen.get(channelId) ?? 0) + 1);
    return () => {
      const n = (onScreen.get(channelId) ?? 1) - 1;
      if (n > 0) onScreen.set(channelId, n);
      else onScreen.delete(channelId);
    };
  }, [channelId]);
}

/** True when this browser tab is showing that conversation right now. */
export function isReading(channelId: number): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible" && onScreen.has(channelId);
}

// ---------- "is typing" ----------

interface TypingState {
  /** channel id → user id → name and until when */
  typing: Record<number, Record<number, { name: string; until: number }>>;
  add: (channelId: number, userId: number, name: string) => void;
  clear: (channelId: number, userId: number) => void;
}

export const useTypingStore = create<TypingState>()((set) => ({
  typing: {},
  add: (channelId, userId, name) =>
    set((s) => ({ typing: { ...s.typing, [channelId]: { ...s.typing[channelId], [userId]: { name, until: Date.now() + 5000 } } } })),
  clear: (channelId, userId) =>
    set((s) => {
      if (!s.typing[channelId]?.[userId]) return s;
      const ch = { ...s.typing[channelId] };
      delete ch[userId];
      return { typing: { ...s.typing, [channelId]: ch } };
    }),
}));

const lastTyping = new Map<number, number>();
/** Tells the others you are typing, at most every 3 seconds per conversation. */
export function pingTyping(channelId: number) {
  const now = Date.now();
  if (now - (lastTyping.get(channelId) ?? 0) < 3000) return;
  lastTyping.set(channelId, now);
  void fetch("/api/chat/typing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId }) }).catch(() => {});
}

/** After sending, the next keystroke says "typing" again straight away (the others' line cleared when the message arrived). */
export function resetTyping(channelId: number) {
  lastTyping.delete(channelId);
}

// ---------- cache updates ----------

/** Adds a message to a loaded conversation or thread (once, even if the stream and the send both deliver it). */
export function addMessage(qc: QueryClient, m: ChatMessage) {
  if (m.threadId) {
    qc.setQueryData<ThreadData>(chatKeys.thread(m.threadId), (t) => (t && !t.replies.some((x) => x.id === m.id) ? { ...t, replies: [...t.replies, m] } : t));
    return;
  }
  qc.setQueryData<MessagesData>(chatKeys.messages(m.channelId), (data) => {
    if (!data) return data;
    if (data.pages.some((p) => p.messages.some((x) => x.id === m.id))) return data;
    const [newest, ...older] = data.pages;
    return { ...data, pages: [{ ...newest, messages: [...newest.messages, m] }, ...older] };
  });
}

/** Applies a change to one message wherever it is cached (its conversation, its thread). */
function patchMessage(qc: QueryClient, channelId: number, threadId: number | null, messageId: number, fn: (m: ChatMessage) => ChatMessage) {
  const map = (list: ChatMessage[]) => list.map((x) => (x.id === messageId ? fn(x) : x));
  qc.setQueryData<MessagesData>(chatKeys.messages(channelId), (d) => d && { ...d, pages: d.pages.map((p) => ({ ...p, messages: map(p.messages) })) });
  if (threadId) qc.setQueryData<ThreadData>(chatKeys.thread(threadId), (t) => t && { ...t, replies: map(t.replies) });
  qc.setQueryData<ThreadData>(chatKeys.thread(messageId), (t) => t && { ...t, root: fn(t.root) });
}

export function replaceMessage(qc: QueryClient, m: ChatMessage) {
  patchMessage(qc, m.channelId, m.threadId, m.id, () => m);
}

export function setReactions(qc: QueryClient, channelId: number, threadId: number | null, messageId: number, reactions: Reaction[]) {
  patchMessage(qc, channelId, threadId, messageId, (m) => ({ ...m, reactions }));
}

/** Moves the conversation to the top of the list with the new last line; counts it as unread unless it is being read. */
export function bumpChannel(qc: QueryClient, m: ChatMessage, me: number, reading: boolean) {
  if (m.threadId) return;
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
  // a conversation someone else just started with me, or a deal thread's first message
  if (!known) void qc.invalidateQueries({ queryKey: chatKeys.channels });
}

/** Listens to the chat's live stream for as long as the widget is mounted, and keeps the cached lists current. */
export function useChatStream(me: number) {
  const qc = useQueryClient();
  useEffect(() => {
    let lost = false;
    const handle = (evt: ChatEvent | { t: "resync" }) => {
      switch (evt.t) {
        case "message.new":
          addMessage(qc, evt.message);
          bumpChannel(qc, evt.message, me, isReading(evt.message.channelId));
          if (evt.message.userId) useTypingStore.getState().clear(evt.message.channelId, evt.message.userId);
          break;
        case "message.update":
          replaceMessage(qc, evt.message);
          // an edit or delete may change the last line in the list
          if (!evt.message.threadId) void qc.invalidateQueries({ queryKey: chatKeys.channels });
          break;
        case "reaction":
          setReactions(qc, evt.channelId, evt.threadId, evt.messageId, evt.reactions);
          break;
        case "typing":
          useTypingStore.getState().add(evt.channelId, evt.userId, evt.name);
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
          void qc.invalidateQueries({ queryKey: chatKeys.groups });
          void qc.invalidateQueries({ queryKey: chatKeys.messages(evt.channelId) });
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
    const source = new EventSource("/api/chat/stream");
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
    return () => source.close();
  }, [qc, me]);
}
