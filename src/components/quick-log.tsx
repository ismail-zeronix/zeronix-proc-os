"use client";

/**
 * The pieces of logging a call or message: how it went (outcome chips) and when to follow up (next-step chips).
 * Used by the deal timeline form and the My Day list, so both ask the same questions in the same words.
 */
import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { dubaiToday } from "@/lib/dates";
import type { WorkHours } from "@/lib/attendance";
import { CALL_OUTCOMES, type CallOutcome, CONTACT_TYPES, isOpen, NO_NEXT_STEP_OUTCOMES, OUTCOME_TYPES } from "@/lib/sales";
import { dayToFollowUp, NEXT_STEPS, nextStepAt, type NextStepKey } from "@/lib/next-step";

const chip = (on: boolean, tone?: "good" | "bad") =>
  `rounded-full border px-2.5 py-0.5 text-xs ${
    on ? (tone === "bad" ? "border-destructive bg-destructive text-white" : "border-primary bg-primary text-primary-foreground") : "hover:bg-muted"
  }`;

export function OutcomeChips({ value, onChange, required }: { value: CallOutcome | null; onChange: (v: CallOutcome | null) => void; required?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="How did it go">
      <span className="text-xs text-muted-foreground">
        How did it go{required ? "" : " (optional)"}?
      </span>
      {CALL_OUTCOMES.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(value === o.key ? null : o.key)}
          className={chip(value === o.key, o.reached ? "good" : "bad")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type NextStep = { key: NextStepKey } | { day: string } | null;

export function nextStepTime(step: NextStep, hours: WorkHours): Date | null {
  if (!step) return null;
  return "key" in step ? nextStepAt(step.key, hours) : step.day ? dayToFollowUp(step.day, hours) : null;
}

const whenFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function formatFollowUp(d: Date | string): string {
  return whenFmt.format(typeof d === "string" ? new Date(d) : d);
}

/** Does logging this need a next step? Mirrors the check in crm/actions logActivity. */
export function needsNextStep(o: { type: string; outcome: CallOutcome | null; stage: string; followUpAt: string | null }): boolean {
  if (!(CONTACT_TYPES as readonly string[]).includes(o.type) || !isOpen(o.stage)) return false;
  if (o.outcome && NO_NEXT_STEP_OUTCOMES.includes(o.outcome)) return false;
  // a follow-up more than 12 hours away stays in place
  return !(o.followUpAt && Date.parse(o.followUpAt) > Date.now() + 12 * 3600_000);
}

export const takesOutcome = (type: string) => (OUTCOME_TYPES as readonly string[]).includes(type);

export function NextStepPicker({ value, onChange, hours, required, existing }: { value: NextStep; onChange: (v: NextStep) => void; hours: WorkHours; required: boolean; existing: string | null }) {
  const when = nextStepTime(value, hours);
  const [today] = useState(() => dubaiToday());
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Next step">
      <span className={`inline-flex items-center gap-1 text-xs ${required && !value ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
        <CalendarClock className="size-3.5" />
        Next follow-up{required ? "" : " (optional)"}
      </span>
      {NEXT_STEPS.map((s) => {
        const on = !!value && "key" in value && value.key === s.key;
        return (
          <button key={s.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : { key: s.key })} className={chip(on)}>
            {s.label}
          </button>
        );
      })}
      <input
        type="date"
        min={today}
        aria-label="Pick a follow-up date"
        value={value && "day" in value ? value.day : ""}
        onChange={(e) => onChange(e.target.value ? { day: e.target.value } : null)}
        className="h-6 rounded-full border bg-transparent px-2 text-xs"
      />
      {when ? (
        <span className="text-xs text-muted-foreground">→ {formatFollowUp(when)}</span>
      ) : (
        existing && !required && <span className="text-xs text-muted-foreground">Set: {formatFollowUp(existing)}</span>
      )}
    </div>
  );
}
