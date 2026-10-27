"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { punchIn, punchOut } from "@/app/(app)/attendance-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  dubaiMinutes,
  EARLY_REASONS,
  formatDuration,
  formatHm,
  isOffDay,
  LATE_REASONS,
  needsReason,
  reasonText,
  type WorkHours,
} from "@/lib/attendance";
import { dubaiToday } from "@/lib/dates";

/** Ticks every 30 s so the "worked today" figure stays current. */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

export interface PunchProps {
  punchedIn: boolean;
  since: string | null;
  closedMinutes: number;
  hours: WorkHours;
}

/**
 * Punch in / out with the reason question when it is needed. Shared by the home-screen switch and the header clock.
 * Render `dialog` somewhere that stays mounted while it is open.
 */
export function usePunch({ punchedIn, hours }: Pick<PunchProps, "punchedIn" | "hours">) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState<"in" | "out" | null>(null);

  const send = (kind: "in" | "out", reason = "") =>
    start(async () => {
      try {
        await (kind === "in" ? punchIn({ reason }) : punchOut({ reason }));
        setAsk(null);
        toast.success(kind === "in" ? "Punched in. Have a good day." : "Punched out.");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const toggle = () => {
    const kind = punchedIn ? "out" : "in";
    if (needsReason(kind, dubaiMinutes(), isOffDay(dubaiToday(), hours), hours)) setAsk(kind);
    else send(kind);
  };

  const dialog = ask && (
    <ReasonDialog kind={ask} hours={hours} pending={pending} onCancel={() => setAsk(null)} onSubmit={(r) => send(ask, r)} />
  );
  return { toggle, pending, dialog };
}

/** Minutes worked today, including the open session up to `now`. */
export function workedMinutes(closedMinutes: number, since: string | null, now: number) {
  return closedMinutes + (since ? (now - Date.parse(since)) / 60_000 : 0);
}

/** The Punch in / Punch out switch next to the welcome message. Asks for a reason when punching in late or leaving early. */
export function PunchToggle({ punchedIn, since, closedMinutes, hours }: PunchProps) {
  const now = useNow();
  const { toggle, pending, dialog } = usePunch({ punchedIn, hours });
  const worked = workedMinutes(closedMinutes, since, now);

  return (
    <div data-punch-allow className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={punchedIn}
        aria-label={punchedIn ? "Punch out" : "Punch in"}
        disabled={pending}
        onClick={toggle}
        className={`group inline-flex h-9 items-center gap-2.5 rounded-full border py-1 pr-1 pl-3.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          punchedIn
            ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300"
            : "border-border bg-card hover:bg-muted"
        }`}
      >
        <span className="grid text-left leading-tight">
          <span>{punchedIn ? "Punched in" : "Punch in"}</span>
          <span className="text-[11px] font-normal text-muted-foreground tabular-nums" suppressHydrationWarning>
            {punchedIn && since
              ? `since ${formatHm(dubaiMinutes(new Date(since)))} · ${formatDuration(worked)} today`
              : worked > 0
                ? `${formatDuration(worked)} today · tap to start`
                : `work starts ${formatHm(hours.start)}`}
          </span>
        </span>
        <span
          aria-hidden
          className={`relative h-7 w-12 rounded-full transition-colors ${punchedIn ? "bg-emerald-600" : "bg-muted-foreground/30"}`}
        >
          <span
            className={`absolute top-1 size-5 rounded-full bg-white shadow transition-[left] ${punchedIn ? "left-6" : "left-1"}`}
          />
        </span>
      </button>
      {dialog}
    </div>
  );
}

function ReasonDialog({
  kind,
  hours,
  pending,
  onCancel,
  onSubmit,
}: {
  kind: "in" | "out";
  hours: WorkHours;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const options = kind === "in" ? LATE_REASONS : EARLY_REASONS;
  const [choice, setChoice] = useState<string>("");
  const [note, setNote] = useState("");
  const text = reasonText(choice, note);
  const valid = !!choice && (choice !== "Other" || note.trim().length >= 3);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent data-punch-dialog className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "in" ? "Why are you punching in late?" : "Why are you leaving during work hours?"}</DialogTitle>
          <DialogDescription>
            Work hours are {formatHm(hours.start)} to {formatHm(hours.end)}, break {formatHm(hours.breakStart)} to{" "}
            {formatHm(hours.breakEnd)}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSubmit(text);
          }}
        >
          <fieldset className="grid gap-1">
            <legend className="sr-only">Reason</legend>
            {[...options, "Other"].map((o) => (
              <label
                key={o}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${
                  choice === o ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={o}
                  checked={choice === o}
                  onChange={() => setChoice(o)}
                  className="accent-primary"
                />
                {o === "Other" ? "Other (type the reason)" : o}
              </label>
            ))}
          </fieldset>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={250}
            rows={2}
            placeholder={choice === "Other" ? "Type the reason" : "Add a note (optional)"}
            aria-label="Note"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" pending={pending} disabled={!valid}>
              {kind === "in" ? "Punch in" : "Punch out"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
