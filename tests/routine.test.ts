import { describe, expect, it } from "vitest";
import { toWorkHours } from "@/lib/attendance";
import { dayFraction, pace, routineBlock, weekFraction } from "@/lib/routine";

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
});
