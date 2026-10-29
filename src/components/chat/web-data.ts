"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import type { ChatEvent, ChatPrefsView } from "@/lib/chat/types";
import type { WebChatSummary, WebMessage } from "@/lib/webchat/types";
import { chime, prefsKey } from "./alerts";

export interface WebList {
  chats: WebChatSummary[];
  /** visitors = ring for everyone who lands on the site; leads = only once they send the form; off = not on the sales team. */
  ring: "visitors" | "leads" | "off";
  /** I answer website chats (I have the CRM app). */
  agent: boolean;
}

export interface WebThread {
  messages: WebMessage[];
  info: { userAgent: string; ip: string; referrer: string; createdAt: string };
}

// under ["chat"], so a reconnect's re-read covers these too
export const webKeys = {
  list: ["chat", "web"] as const,
  thread: (id: number) => ["chat", "web", id] as const,
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load the website chats.");
  return res.json();
}

export function useWebChats() {
  return useQuery({
    queryKey: webKeys.list,
    queryFn: () => getJson<WebList>("/api/chat/web"),
    staleTime: Infinity, // the live stream keeps it current
    // a visitor counts as gone a minute after their page closed: re-check now and then so ringing stops for them
    refetchInterval: 60_000,
  });
}

export function useWebThread(id: number) {
  return useQuery({ queryKey: webKeys.thread(id), queryFn: () => getJson<WebThread>(`/api/chat/web/${id}`), staleTime: Infinity });
}

/** Which website chat is on screen now (its lines do not chime). */
let reading: number | null = null;
export function setReadingWeb(id: number | null) {
  reading = id;
}

/** "Visitor is typing…", per chat. */
export const useWebTyping = create<{ until: Record<number, number>; ping: (id: number) => void }>()((set) => ({
  until: {},
  ping: (id) => set((s) => ({ until: { ...s.until, [id]: Date.now() + 5000 } })),
}));

export function addWebMessage(qc: QueryClient, m: WebMessage) {
  qc.setQueryData<WebThread>(webKeys.thread(m.chatId), (t) => (t && !t.messages.some((x) => x.id === m.id) ? { ...t, messages: [...t.messages, m] } : t));
}

/** The live stream's website chat events (called from useChatStream). */
export function handleWebEvent(qc: QueryClient, evt: Extract<ChatEvent, { t: `web.${string}` }>, me: number) {
  switch (evt.t) {
    case "web.update":
      void qc.invalidateQueries({ queryKey: webKeys.list, exact: true });
      break;
    case "web.message": {
      const m = evt.message;
      addWebMessage(qc, m);
      void qc.invalidateQueries({ queryKey: webKeys.list, exact: true });
      if (m.sender !== "visitor") break;
      useWebTyping.setState((s) => ({ until: { ...s.until, [m.chatId]: 0 } }));
      // a line on my chat that I am not looking at
      const mine = qc.getQueryData<WebList>(webKeys.list)?.chats.find((c) => c.id === m.chatId)?.agent?.id === me;
      const prefs = qc.getQueryData<ChatPrefsView>(prefsKey);
      const looking = reading === m.chatId && document.visibilityState === "visible";
      if (mine && !looking && prefs?.status !== "dnd" && prefs?.sound !== false) chime();
      break;
    }
    case "web.typing":
      useWebTyping.getState().ping(evt.chatId);
      break;
  }
}
