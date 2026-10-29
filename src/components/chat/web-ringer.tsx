"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BellOff, Globe, PhoneIncoming } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { acceptWebChat } from "@/app/(app)/chat/web-actions";
import { Button } from "@/components/ui/button";
import { pathOf, visitorLabel, type WebChatSummary } from "@/lib/webchat/types";
import { useMyPrefs } from "./alerts";
import { useChatStore } from "./chat-store";
import { useWebChats, webKeys } from "./web-data";

let audio: AudioContext | null = null;

/**
 * The website ring: a quick rising trill, unlike the chat's two-note chime, so people can tell a waiting visitor from a
 * teammate's message without looking.
 */
function ring() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const now = audio.currentTime;
    [1046, 1318, 1046, 1318, 1568].forEach((freq, i) => {
      const t = now + i * 0.11;
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  } catch {
    // no sound yet (the browser wants a click on the page first)
  }
}

/** Chats that should ring: waiting, the visitor still on the site, and (if the admin chose so) the lead form sent. */
export function ringingChats(chats: WebChatSummary[], mode: string): WebChatSummary[] {
  if (mode === "off") return [];
  return chats.filter((c) => c.status === "waiting" && c.online && (mode === "visitors" || c.lead));
}

/** Holds the "zp-web-ring" lock while mounted: only one tab in the browser makes the sound. */
function useRingLock(me: number) {
  const [locked, setHolder] = useState(false);
  // a browser without Web Locks: every tab rings
  const noLocks = typeof navigator !== "undefined" && !navigator.locks;
  const holder = locked || noLocks;
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.locks) return;
    let release: (() => void) | null = null;
    let stopped = false;
    void navigator.locks.request(
      `zp-web-ring-${me}`,
      () =>
        new Promise<void>((resolve) => {
          if (stopped) return resolve();
          release = resolve;
          setHolder(true);
        }),
    );
    return () => {
      stopped = true;
      release?.();
    };
  }, [me]);
  return holder;
}

/**
 * Rings on every portal page while a website visitor waits for someone to accept them, again and again until someone
 * does (or the visitor leaves), and shows a card with Accept. Do not disturb keeps it quiet; the card still shows.
 */
export function WebRinger({ me }: { me: number }) {
  const web = useWebChats();
  const prefs = useMyPrefs();
  const holder = useRingLock(me);
  const qc = useQueryClient();
  const show = useChatStore((s) => s.show);
  const setTab = useChatStore((s) => s.setTab);
  const [silenced, setSilenced] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const notified = useRef(new Set<number>());

  const ringing = ringingChats(web.data?.chats ?? [], web.data?.ring ?? "off");
  const loud = ringing.filter((c) => !silenced.has(c.id));
  const quiet = prefs.data?.status === "dnd" || prefs.data?.sound === false;
  const shouldRing = holder && loud.length > 0 && !quiet;

  // ring now and every 3 seconds while anyone is waiting
  useEffect(() => {
    if (!shouldRing) return;
    ring();
    const t = setInterval(ring, 3000);
    return () => clearInterval(t);
  }, [shouldRing]);

  // the tab title blinks while someone waits, so a background tab shows it too
  useEffect(() => {
    if (!loud.length) return;
    const original = document.title;
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? `🔔 Website visitor waiting` : original;
    }, 1000);
    return () => {
      clearInterval(t);
      document.title = original;
    };
  }, [loud.length]);

  // one desktop notification per visitor, from one tab
  useEffect(() => {
    if (!holder || typeof Notification === "undefined" || Notification.permission !== "granted" || prefs.data?.desktop === false) return;
    for (const c of loud) {
      if (notified.current.has(c.id)) continue;
      notified.current.add(c.id);
      const n = new Notification(c.lead ? `Chat request: ${visitorLabel(c)}` : "New visitor on zeronix.ae", {
        body: `${c.pageTitle || pathOf(c.pageUrl)}\nOpen the portal to accept.`,
        tag: `web-${c.id}`,
        requireInteraction: true,
      });
      n.onclick = () => {
        window.focus();
        setTab("website");
        show({ kind: "web", id: c.id });
        n.close();
      };
    }
  }, [holder, loud, prefs.data?.desktop, setTab, show]);

  if (!ringing.length) return null;

  const take = async (c: WebChatSummary) => {
    setBusy(c.id);
    try {
      await acceptWebChat(c.id);
      await qc.invalidateQueries({ queryKey: webKeys.list, exact: true });
      setTab("website");
      show({ kind: "web", id: c.id });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed top-14 right-3 z-50 flex w-80 flex-col gap-2 max-sm:right-2 max-sm:left-2 max-sm:w-auto" role="region" aria-label="Website visitors waiting">
      {ringing.slice(0, 3).map((c) => {
        const muted = silenced.has(c.id);
        return (
          <div key={c.id} role="alert" className="flex gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl animate-in fade-in slide-in-from-top-2">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ${muted ? "" : "animate-pulse"}`}>
              {c.lead ? <PhoneIncoming className="size-4.5" /> : <Globe className="size-4.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{c.lead ? visitorLabel(c) : "New visitor on the website"}</p>
              <p className="truncate text-xs text-muted-foreground" title={c.pageUrl}>
                {c.lastPreview || c.pageTitle || pathOf(c.pageUrl)}
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <Button size="sm" onClick={() => take(c)} disabled={busy === c.id}>
                  {busy === c.id ? "Accepting…" : "Accept"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTab("website");
                    show({ kind: "web", id: c.id });
                  }}
                >
                  View
                </Button>
                {!muted && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setSilenced((s) => new Set(s).add(c.id))}
                    aria-label="Stop ringing for this visitor on this computer"
                    title="Stop ringing for this visitor (here only)"
                  >
                    <BellOff />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {ringing.length > 3 && <p className="rounded-lg bg-popover px-3 py-1.5 text-center text-xs shadow">+{ringing.length - 3} more waiting</p>}
    </div>
  );
}
