import { describe, expect, it } from "vitest";
import { toWorkHours } from "@/lib/attendance";
import { dayToFollowUp, nextStepAt, workingDayFrom } from "@/lib/next-step";

// 09:30-21:30, Sunday off (the portal's defaults)
const hours = toWorkHours({ start: "09:30", end: "21:30", breakStart: "14:30", breakEnd: "16:30", offDays: "0" });
/** A UAE wall-clock time as an instant. */
const uae = (s: string) => new Date(`${s}+04:00`);

describe("next-step follow-up times", () => {
  it("puts day choices at 10:00 UAE on the next working day", () => {
    // Thursday 2026-11-26 11:00
    const now = uae("2026-11-26T11:00:00");
    expect(nextStepAt("tomorrow", hours, now)).toEqual(uae("2026-11-27T10:00:00"));
    expect(nextStepAt("2days", hours, now)).toEqual(uae("2026-11-28T10:00:00"));
    expect(nextStepAt("week", hours, now)).toEqual(uae("2026-12-03T10:00:00"));
  });

  it("skips the off day", () => {
    // Saturday: tomorrow is Sunday (off), so Monday
    expect(nextStepAt("tomorrow", hours, uae("2026-11-28T12:00:00"))).toEqual(uae("2026-11-30T10:00:00"));
    expect(workingDayFrom("2026-11-29", hours)).toBe("2026-11-30");
  });

  it("'in 2 hours' stays today inside hours, else moves to the next working morning", () => {
    const now = uae("2026-11-26T11:00:00");
    expect(nextStepAt("later", hours, now)).toEqual(uae("2026-11-26T13:00:00"));
    expect(nextStepAt("later", hours, uae("2026-11-26T20:00:00"))).toEqual(uae("2026-11-27T10:00:00"));
    expect(nextStepAt("later", hours, uae("2026-11-28T20:00:00"))).toEqual(uae("2026-11-30T10:00:00"));
  });

  it("a picked day becomes that morning", () => {
    expect(dayToFollowUp("2030-01-15", hours)).toEqual(uae("2030-01-15T10:00:00"));
  });
});
