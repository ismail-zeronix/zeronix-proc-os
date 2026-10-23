"use client";

import { LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useNow, usePunch, workedMinutes, type PunchProps } from "@/components/attendance/punch-toggle";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dubaiMinutes, formatDuration, formatHm } from "@/lib/attendance";
import { TZ } from "@/lib/dates";

/** Fired by the punch gate's toast so "Punch in" opens this popover from any page. */
export const OPEN_PUNCH_EVENT = "zeronix:open-punch";

/** The current time, updated on each second boundary. Null until mounted, so the server and browser render the same. */
function useSecond() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      t = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    t = setTimeout(tick, 0);
    return () => clearTimeout(t);
  }, []);
  return now;
}

/** UAE time split for a seven-segment display. In DSEG fonts "!" is a blank digit, so "9" shows as " 9" without shifting. */
function clockParts(now: number | null) {
  if (now == null) return { hh: "!!", mm: "!!", ss: "!!", ap: "", ready: false };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hh: get("hour").padStart(2, "!"), mm: get("minute"), ss: get("second"), ap: get("dayPeriod"), ready: true };
}

const TONE = {
  in: { text: "text-emerald-400", glow: "0 0 6px rgb(52 211 153 / 0.55)" },
  out: { text: "text-amber-400", glow: "0 0 6px rgb(251 191 36 / 0.55)" },
};

/** Lit digits over faint "8"s, like an unlit segment display. */
function Segments({ text, className, glow }: { text: string; className: string; glow: string }) {
  return (
    <span className={`relative inline-block font-digital leading-none ${className}`}>
      <span className="text-white/[0.07]" aria-hidden>
        {text.replace(/[0-9!]/g, "8")}
      </span>
      <span className="absolute inset-0" style={{ textShadow: glow }}>
        {text}
      </span>
    </span>
  );
}

/** The LCD panel: big HH:MM, small ticking seconds, then AM/PM over IN/OUT. */
function LcdTime({ punchedIn, large = false }: { punchedIn: boolean; large?: boolean }) {
  const { hh, mm, ss, ap, ready } = clockParts(useSecond());
  const tone = punchedIn ? TONE.in : TONE.out;
  return (
    <span
      className={`inline-flex items-end rounded-md bg-zinc-950 shadow-[inset_0_1px_3px_rgb(0_0_0/0.6)] ring-1 ring-white/10 ${tone.text} ${
        large ? "gap-2 px-3 py-2.5" : "gap-1 px-2 py-1"
      }`}
      aria-hidden
    >
      <Segments text={`${hh}:${mm}`} glow={tone.glow} className={large ? "text-[28px]" : "text-[15px]"} />
      <Segments text={ss} glow={tone.glow} className={large ? "text-[16px]" : "text-[9px]"} />
      <span
        className={`grid font-sans font-semibold tracking-wider ${large ? "gap-0.5 text-[10px]" : "hidden gap-px text-[7.5px] leading-none sm:grid"}`}
      >
        <span className={ready ? "" : "opacity-0"}>{ap || "AM"}</span>
        <span className="opacity-80">{punchedIn ? "IN" : "OUT"}</span>
      </span>
    </span>
  );
}

/**
 * Live UAE clock in the header. Green digits = punched in, amber = not yet.
 * Click it for the date, hours worked today and Punch in / out, from any page.
 */
export function HeaderClock({ punchedIn, since, closedMinutes, hours }: PunchProps) {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const { toggle, pending, dialog } = usePunch({ punchedIn, hours });
  const worked = workedMinutes(closedMinutes, since, now);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_PUNCH_EVENT, show);
    return () => window.removeEventListener(OPEN_PUNCH_EVENT, show);
  }, []);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          data-punch-allow
          aria-label={`Clock, ${punchedIn ? "punched in" : "not punched in"}. Open punch in and out`}
          className="rounded-md outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LcdTime punchedIn={punchedIn} />
        </PopoverTrigger>
        <PopoverContent data-punch-allow align="end" className="w-72 gap-3 p-3">
          <div className="grid justify-items-center gap-1.5">
            <LcdTime punchedIn={punchedIn} large />
            <div className="text-xs text-muted-foreground" suppressHydrationWarning>
              {date} · UAE time
            </div>
          </div>
          <div className="grid gap-1 rounded-md bg-muted/60 px-2.5 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <span className={`size-2 rounded-full ${punchedIn ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
              {punchedIn && since ? `Punched in since ${formatHm(dubaiMinutes(new Date(since)))}` : "Not punched in"}
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Worked today</span>
              <span className="font-medium text-foreground tabular-nums" suppressHydrationWarning>
                {formatDuration(worked)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Work hours</span>
              <span className="tabular-nums">
                {formatHm(hours.start)} – {formatHm(hours.end)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Break</span>
              <span className="tabular-nums">
                {formatHm(hours.breakStart)} – {formatHm(hours.breakEnd)}
              </span>
            </div>
          </div>
          <Button
            variant={punchedIn ? "outline" : "default"}
            pending={pending}
            onClick={() => {
              setOpen(false);
              toggle();
            }}
          >
            {punchedIn ? <LogOut /> : <LogIn />}
            {punchedIn ? "Punch out" : "Punch in"}
          </Button>
        </PopoverContent>
      </Popover>
      {dialog}
    </>
  );
}
