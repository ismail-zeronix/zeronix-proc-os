"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { previewOf } from "@/lib/chat/text";
import type { ChannelSummary, ChatMessage, ChatPrefsView } from "@/lib/chat/types";
import { useChatStore } from "./chat-store";

export const prefsKey = ["chat", "me"] as const;

/** My chat settings (status, do not disturb, sound, desktop alerts). */
export function useMyPrefs() {
  return useQuery({
    queryKey: prefsKey,
    queryFn: async (): Promise<ChatPrefsView> => {
      const res = await fetch("/api/chat/me");
      if (!res.ok) throw new Error("Could not load your chat settings.");
      return res.json();
    },
    staleTime: Infinity,
  });
}

let audio: AudioContext | null = null;

/** A short two-note chime, made in the browser (no sound file to load). */
export function chime() {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.25);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    }
  } catch {
    // no sound available (or the browser has not allowed it yet)
  }
}

/** With several portal tabs open, only the first to see a message alerts for it. */
function claim(messageId: number): boolean {
  try {
    const key = `zp-chat-alert-${messageId}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
    setTimeout(() => localStorage.removeItem(key), 60_000);
    return true;
  } catch {
    return true;
  }
}

/**
 * A new message arrived that I am not reading: chime and/or show a desktop notification, unless the conversation is
 * muted, I am on do not disturb, or it is my own message.
 */
export function alertFor(qc: QueryClient, m: ChatMessage, me: number, reading: boolean) {
  if (m.userId === me || m.threadId || reading || m.kind === "system") return;
  const prefs = qc.getQueryData<ChatPrefsView>(prefsKey);
  if (prefs?.status === "dnd") return;
  const channel = qc.getQueryData<ChannelSummary[]>(["chat", "channels"])?.find((c) => c.id === m.channelId);
  if (channel?.muted) return;
  if (!claim(m.id)) return;
  if (prefs?.sound !== false) chime();
  const panelOpen = useChatStore.getState().open;
  if (prefs?.desktop !== false && typeof Notification !== "undefined" && Notification.permission === "granted" && (document.hidden || !panelOpen)) {
    const title = m.kind === "card" ? `${m.userName ?? "Someone"} mentioned you` : channel?.kind === "dm" ? (m.userName ?? "New message") : `${m.userName ?? "Someone"} in ${channel?.name ?? "chat"}`;
    const n = new Notification(title, { body: previewOf(m.kind, m.body), tag: `chat-${m.channelId}` });
    n.onclick = () => {
      window.focus();
      if (channel?.kind === "system") {
        useChatStore.getState().setTab("activity");
        useChatStore.getState().show({ kind: "list" });
      } else useChatStore.getState().show({ kind: "channel", id: m.channelId });
      n.close();
    };
  }
}

/** Tells the others I am away after the portal tab has been in the background for 5 minutes, and back when it returns. */
export function useAwayReporter() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let away = false;
    const send = (value: boolean) => {
      away = value;
      void fetch("/api/chat/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ away: value }) }).catch(() => {});
    };
    const onChange = () => {
      if (document.hidden) timer ??= setTimeout(() => send(true), 5 * 60_000);
      else {
        if (timer) clearTimeout(timer);
        timer = null;
        if (away) send(false);
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      if (timer) clearTimeout(timer);
    };
  }, []);
}
