import { describe, expect, it } from "vitest";
import { toWorkHours, DEFAULT_HOURS } from "@/lib/attendance";
import { dateTimeline, momentTimeline, ruleConfigs, stepAt, timerTimeline } from "@/lib/notifications/rules";
import { dueText } from "@/lib/notifications/types";
import { addWorkMinutes, isWorkTime } from "@/lib/notifications/work-time";

// 09:30-21:30, break 14:30-16:30, Sunday off (2026-11-04 is a Wednesday, 11-08 a Sunday)
const h = toWorkHours({ ...DEFAULT_HOURS });
const uae = (s: string) => new Date(`${s}:00+04:00`);

describe("working-time clock", () => {
  it("skips the break", () => {
    expect(addWorkMinutes(uae("2026-11-04T13:30"), 120, h)).toEqual(uae("2026-11-04T17:30"));
  });

  it("carries over the night and the weekly off day", () => {
    // 1 h left on Saturday, Sunday off, 3 h on Monday morning
    expect(addWorkMinutes(uae("2026-11-07T20:30"), 240, h)).toEqual(uae("2026-11-09T12:30"));
  });

  it("starts counting at the next opening when it begins outside work hours", () => {
    expect(addWorkMinutes(uae("2026-11-04T23:00"), 60, h)).toEqual(uae("2026-11-05T10:30"));
    expect(addWorkMinutes(uae("2026-11-04T15:00"), 30, h)).toEqual(uae("2026-11-04T17:00"));
  });

  it("knows when it is working time", () => {
    expect(isWorkTime(uae("2026-11-04T10:00"), h)).toBe(true);
    expect(isWorkTime(uae("2026-11-04T15:00"), h)).toBe(false);
    expect(isWorkTime(uae("2026-11-08T10:00"), h)).toBe(false);
  });
});

describe("rule steps", () => {
  const cfg = ruleConfigs("{}");

  it("a new lead at closing time is due the next working morning", () => {
    const t = timerTimeline(uae("2026-11-04T21:00"), cfg.lead_not_contacted, "hours", h);
    expect(t.dueAt).toEqual(uae("2026-11-05T13:00"));
    expect(stepAt(t, uae("2026-11-05T11:00"))).toBe(null);
    expect(stepAt(t, uae("2026-11-05T12:15"))).toBe("warn");
    expect(stepAt(t, uae("2026-11-05T13:00"))).toBe("due");
    // 10 more working hours: 13:00-14:30, 16:30-21:30 (6.5 h), then 3.5 h on Friday
    expect(t.lateAt).toEqual(uae("2026-11-06T13:00"));
    expect(stepAt(t, uae("2026-11-06T13:00"))).toBe("late");
  });

  it("counts day limits in working days", () => {
    const t = timerTimeline(uae("2026-11-04T10:00"), cfg.deal_no_quote, "days", h);
    expect(t.dueAt).toEqual(uae("2026-11-06T10:00"));
  });

  it("date rules: heads-up from the start of work, due at the end of the day, critical later", () => {
    const t = dateTimeline("2026-11-04", cfg.task_overdue, h);
    expect(t.warnAt).toEqual(uae("2026-11-04T09:30"));
    expect(t.dueAt).toEqual(uae("2026-11-04T21:30"));
    expect(t.lateAt).toEqual(uae("2026-11-06T21:30"));
    expect(stepAt(t, uae("2026-11-04T08:00"))).toBe(null);
    expect(stepAt(t, uae("2026-11-05T10:00"))).toBe("due");
  });

  it("a picked follow-up time warns an hour before", () => {
    const t = momentTimeline(uae("2026-11-04T15:00"), cfg.deal_follow_up, h);
    expect(stepAt(t, uae("2026-11-04T14:10"))).toBe("warn");
    expect(stepAt(t, uae("2026-11-04T13:50"))).toBe(null);
  });

  it("merges saved settings over the defaults and ignores bad values", () => {
    const c = ruleConfigs(JSON.stringify({ deal_quiet: { enabled: false, limit: 7 }, task_overdue: { escalate: -3 } }));
    expect(c.deal_quiet).toEqual({ enabled: false, limit: 7, warn: 0, escalate: 5 });
    expect(c.task_overdue.escalate).toBe(2);
    expect(ruleConfigs("not json").lead_not_contacted.limit).toBe(4);
  });

  it("says how long is left or how late it is", () => {
    const now = Date.parse("2026-11-04T10:00:00Z");
    expect(dueText("2026-11-04T13:00:00Z", now)).toBe("due in 3 h");
    expect(dueText("2026-11-04T09:30:00Z", now)).toBe("30 min late");
    expect(dueText("2026-11-01T10:00:00Z", now)).toBe("3 days late");
  });
});
