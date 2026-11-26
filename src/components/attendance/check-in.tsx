"use client";

import { BellRing } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { loadCheckIn, sendCheckIn } from "@/app/(app)/daily-report-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { CheckInState } from "@/lib/check-in";
import { CHECKIN_DONE, CHECKIN_RING_EVERY_MIN, CHECKIN_RINGS, countsLine, type CheckInCounts, type CheckInDone } from "@/lib/routine";
import { errorText } from "@/lib/user-error";

const MIN = 60_000;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

let audio: AudioContext | null = null;

/** A doorbell: two slow falling notes, twice. Different from the chat chime and the website trill. */
function doorbell() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const start = audio.currentTime;
    [
      [880, 0],
      [698, 0.42],
      [880, 1.1],
      [698, 1.52],
    ].forEach(([freq, at]) => {
      const t = start + at;
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {
    // no sound until the page has had a click
  }
}

/** The browser's own voice (free, nothing leaves the computer). */
function say(text: string) {
  try {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
    if (voice) u.voice = voice;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  } catch {
    // no voice available
  }
}

/** One tab per browser makes the sound (the others still show the window). */
function useRingLock(me: number) {
  const [held, setHeld] = useState(false);
  // a browser without Web Locks: every tab rings
  const noLocks = typeof navigator !== "undefined" && !navigator.locks;
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.locks) return;
    let release: (() => void) | null = null;
    let stopped = false;
    void navigator.locks.request(
      `zp-checkin-ring-${me}`,
      () =>
        new Promise<void>((resolve) => {
          if (stopped) return resolve();
          release = resolve;
          setHeld(true);
        }),
    );
    return () => {
      stopped = true;
      release?.();
    };
  }, [me]);
  return held || noLocks;
}

/** Rings done for one ask, shared by the tabs (so a reload does not ring it again from the start). */
const ringsKey = (dueAt: string) => `zp-checkin-rings-${dueAt}`;
const ringsDone = (dueAt: string) => Number(localStorage.getItem(ringsKey(dueAt)) || 0);

/** Pre-ticks what the system already saw them do. */
function guessDone(c: CheckInCounts): CheckInDone[] {
  const out: CheckInDone[] = [];
  if (c.calls) out.push("calls");
  if (c.prospectsAdded) out.push("prospects");
  if (c.messages || c.quotesSent) out.push("emails");
  if (c.meetings) out.push("meeting");
  return out;
}

/**
 * The sales routine check-in (lib/check-in.ts): every two working hours while punched in, rings, asks out loud "what have
 * you done since …?", and opens a small window: ticks, one line, send. Rings again every 5 minutes, 3 times; after that
 * the worker marks it missed and tells the admins, but the window stays until answered.
 */
export function CheckInPrompt({ me, name }: { me: number; name: string }) {
  const [state, setState] = useState<CheckInState | null>(null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<CheckInDone[]>([]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const ringer = useRingLock(me);
  const shownFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await loadCheckIn();
      setState(s);
      if (!s?.due) setOpen(false);
      return s;
    } catch {
      return null;
    }
  }, []);

  // ask the server now, at the due time, and every few minutes (another tab may have answered; punch-out ends it)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async: the state is set once the server answers
    void refresh();
    const t = setInterval(() => void refresh(), 3 * MIN);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!state || state.due) return;
    const wait = Math.max(5_000, Math.min(new Date(state.dueAt).getTime() - Date.now() + 2_000, 10 * MIN));
    const t = setTimeout(() => void refresh(), wait);
    return () => clearTimeout(t);
  }, [state, refresh]);

  // a new ask: open the window with the guesses ticked
  useEffect(() => {
    if (!state?.due || shownFor.current === state.dueAt) return;
    shownFor.current = state.dueAt;
    setDone(guessDone(state.counts));
    setNote("");
    setOpen(true);
  }, [state]);

  // ring + voice now and every 5 minutes, 3 times per ask, from the one tab holding the lock
  useEffect(() => {
    if (!state?.due || !ringer) return;
    const dueAt = state.dueAt;
    const since = hm(state.since);
    const first = name.split(" ")[0];
    const ring = () => {
      const n = ringsDone(dueAt);
      if (n >= CHECKIN_RINGS) return;
      localStorage.setItem(ringsKey(dueAt), String(n + 1));
      doorbell();
      setTimeout(() => say(`${first}, quick check-in. What have you done since ${since}?`), 2200);
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const note = new Notification("Check-in: what have you done?", { body: `Since ${since}. Tap to answer.`, tag: "zp-checkin", requireInteraction: true });
        note.onclick = () => {
          window.focus();
          setOpen(true);
          note.close();
        };
      }
      setOpen(true);
    };
    ring();
    const t = setInterval(ring, CHECKIN_RING_EVERY_MIN * MIN);
    return () => clearInterval(t);
  }, [state?.due, state?.dueAt, state?.since, ringer, name]);

  if (!state?.due) return null;

  const valid = done.length > 0 && note.trim().length >= 3;
  const submit = () =>
    start(async () => {
      try {
        // the click is a chance to ask for desktop alerts, so the next ring shows even in another window
        if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
        const r = await sendCheckIn({ done, note });
        if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
        setOpen(false);
        setState(r.next);
        toast.success(r.next ? `Thanks. Next check-in around ${hm(r.next.dueAt)}.` : "Thanks.");
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  return (
    <>
      {!open && (
        // closed without answering: a reminder in the corner until it is answered
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-20 z-50 inline-flex items-center gap-2 rounded-full bg-amber-500 px-3.5 py-2 text-sm font-medium text-white shadow-lg md:bottom-24"
        >
          <BellRing className="size-4" aria-hidden /> Check-in waiting
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="size-4 text-amber-500" aria-hidden /> Quick check-in
            </DialogTitle>
            <DialogDescription>What have you done since {hm(state.since)}?</DialogDescription>
          </DialogHeader>
          {state.missed && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              This one was not answered in time and shows as missed. Answer it anyway.
            </p>
          )}
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs">
            <span className="text-muted-foreground">The portal counted: </span>
            {countsLine(state.counts)}
            {countsLine(state.counts) === "nothing logged" && (
              <span className="text-muted-foreground"> · if you called or met someone, log it on the deal or prospect too</span>
            )}
          </p>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) submit();
            }}
          >
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="What you did">
              {CHECKIN_DONE.map((d) => {
                const on = done.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDone(on ? done.filter((x) => x !== d.key) : [...done, d.key])}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              aria-label="What you did, in one line"
              placeholder="One line, e.g. called 5 hotels, 2 want a quote; added 3 clinics from Google Maps"
            />
            <DialogFooter>
              <Button type="submit" pending={pending} disabled={!valid}>
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
