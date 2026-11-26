import { describe, expect, it } from "vitest";
import { toWorkHours } from "@/lib/attendance";
import { callsNudge, dayFraction, minuteAtFraction, missedDaily, pace, routineBlock, targetsFor, teamTargets, weekFraction } from "@/lib/routine";

// 09:30-21:30 with a 14:30-16:30 break, Sunday off (the portal's defaults)
const h = toWorkHours({ start: "09:30", end: "21:30", breakStart: "14:30", breakEnd: "16:30", offDays: "0" });
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

describe("the salesman's routine", () => {
  it("counts the working day without the break", () => {
    expect(dayFraction(hm("09:00"), h)).toBe(0);
    expect(dayFraction(hm("21:30"), h)).toBe(1);
    // 10 working hours; by 14:30 five are gone, and the break adds nothing
    expect(dayFraction(hm("14:30"), h)).toBeCloseTo(0.5);
    expect(dayFraction(hm("16:00"), h)).toBeCloseTo(0.5);
    expect(dayFraction(hm("17:30"), h)).toBeCloseTo(0.6);
  });

  it("says done, on pace, behind or idle", () => {
    expect(pace(25, 25, 0.3)).toBe("done");
    expect(pace(8, 25, 0.4)).toBe("on"); // expected 10, 70% is 7
    expect(pace(5, 25, 0.4)).toBe("behind");
    expect(pace(0, 25, 0.3)).toBe("idle");
    expect(pace(0, 25, 0.1)).toBe("behind");
  });

  it("names the block of the day", () => {
    expect(routineBlock(hm("08:00"), h).key).toBe("before");
    expect(routineBlock(hm("10:00"), h)).toMatchObject({ key: "followups", until: hm("11:00") });
    expect(routineBlock(hm("12:00"), h)).toMatchObject({ key: "calls", until: hm("13:00") });
    expect(routineBlock(hm("13:30"), h)).toMatchObject({ key: "find", until: hm("14:30") });
    expect(routineBlock(hm("15:00"), h).key).toBe("break");
    expect(routineBlock(hm("17:00"), h)).toMatchObject({ key: "emails", until: hm("17:30") });
    expect(routineBlock(hm("19:00"), h)).toMatchObject({ key: "deals", until: hm("21:00") });
    expect(routineBlock(hm("21:10"), h).key).toBe("wrap");
    expect(routineBlock(hm("22:00"), h).key).toBe("after");
    expect(routineBlock(hm("12:00"), h, true).key).toBe("off");
  });

  it("fits a short day with no break", () => {
    const short = toWorkHours({ start: "09:00", end: "13:00", breakStart: "18:00", breakEnd: "18:30", offDays: "" });
    expect(routineBlock(hm("10:00"), short).key).toBe("followups");
    expect(routineBlock(hm("12:00"), short).key).toBe("calls");
    expect(routineBlock(hm("12:45"), short).key).toBe("wrap");
  });

  it("counts the week from Monday, skipping off days", () => {
    // Wednesday 2026-11-25 at the end of the day: Mon, Tue, Wed of six working days
    expect(weekFraction("2026-11-25", hm("22:00"), h)).toBeCloseTo(3 / 6);
    expect(weekFraction("2026-11-23", hm("08:00"), h)).toBe(0);
  });

  it("reads the team targets and lays a person's own numbers over them", () => {
    expect(teamTargets("{}")).toEqual({ callsDay: 25, prospectsDay: 10, leadsWeek: 5, quotesWeek: 5 });
    expect(teamTargets("broken")).toEqual(teamTargets(""));
    // a bad field falls back to its default, the good ones stay
    expect(teamTargets(JSON.stringify({ callsDay: 40, prospectsDay: -1, leadsWeek: 2.5 }))).toEqual({ callsDay: 40, prospectsDay: 10, leadsWeek: 5, quotesWeek: 5 });
    const team = teamTargets(JSON.stringify({ callsDay: 30 }));
    expect(targetsFor(team, null)).toEqual(team);
    expect(targetsFor(team, { callsDay: 15, off: false })).toEqual({ ...team, callsDay: 15 });
  });

  it("names the daily targets missed", () => {
    const t = { callsDay: 25, prospectsDay: 10, leadsWeek: 5, quotesWeek: 5 };
    expect(missedDaily({ calls: 25, prospectsAdded: 10 }, t)).toEqual([]);
    expect(missedDaily({ calls: 8, prospectsAdded: 10 }, t)).toEqual(["calls 8/25"]);
    expect(missedDaily({ calls: 8, prospectsAdded: 3 }, { ...t, callsDay: 0 })).toEqual(["new prospects 3/10"]);
  });

  it("nudges when calls fall behind at a third and two thirds of the day", () => {
    expect(callsNudge(0, 25, 0.2)).toBeNull();
    expect(callsNudge(7, 25, 0.4)).toBe("due"); // under 30% (7.5)
    expect(callsNudge(8, 25, 0.4)).toBeNull();
    expect(callsNudge(14, 25, 0.7)).toBe("late"); // under 60% (15)
    expect(callsNudge(15, 25, 0.7)).toBeNull();
    expect(callsNudge(0, 0, 0.9)).toBeNull();
  });

  it("finds the minute a share of the working day is gone, skipping the break", () => {
    expect(minuteAtFraction(0, h)).toBe(hm("09:30"));
    expect(minuteAtFraction(0.4, h)).toBe(hm("13:30"));
    expect(minuteAtFraction(0.6, h)).toBe(hm("17:30")); // 6 working hours: past the break
    expect(minuteAtFraction(1, h)).toBe(hm("21:30"));
    for (const f of [0.1, 1 / 3, 2 / 3, 0.9]) expect(dayFraction(minuteAtFraction(f, h), h)).toBeCloseTo(f, 2);
  });
});

describe("check-in counts", () => {
  it("reads as one short line", async () => {
    const { countsLine } = await import("@/lib/routine");
    const zero = { calls: 0, reached: 0, messages: 0, meetings: 0, notes: 0, prospectsAdded: 0, quotesSent: 0 };
    expect(countsLine(zero)).toBe("nothing logged");
    expect(countsLine({ ...zero, calls: 5, reached: 2, prospectsAdded: 1, quotesSent: 2 })).toBe("5 calls (2 talked), 1 new prospect, 2 quotes sent");
    expect(countsLine({ ...zero, calls: 1, messages: 1 })).toBe("1 call, 1 message");
  });
});
