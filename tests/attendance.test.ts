import { describe, expect, it } from "vitest";
import {
  dayStatus,
  dubaiMinutes,
  formatDuration,
  formatHm,
  monthDays,
  needsReason,
  parseHm,
  reasonText,
  shiftMonth,
  toWorkHours,
  DEFAULT_HOURS,
} from "@/lib/attendance";

const H = toWorkHours(DEFAULT_HOURS);
const at = (hm: string) => parseHm(hm);

describe("work hours", () => {
  it("defaults to 9:30 AM to 9:30 PM with a 2:30 to 4:30 PM break and Sunday off", () => {
    expect(H).toEqual({ start: 570, end: 1290, breakStart: 870, breakEnd: 990, offDays: [0] });
    expect(formatHm(H.start)).toBe("9:30 AM");
    expect(formatHm(H.end)).toBe("9:30 PM");
    expect(formatHm(H.breakStart)).toBe("2:30 PM");
    expect(formatHm(0)).toBe("12:00 AM");
  });

  it("falls back to the defaults for bad times and allows no off days", () => {
    expect(toWorkHours({ start: "nope", end: "25:00", breakStart: "14:30", breakEnd: "16:30", offDays: "" })).toMatchObject({
      start: 570,
      end: 1290,
      offDays: [],
    });
    expect(toWorkHours({ ...DEFAULT_HOURS, offDays: "5, 6" }).offDays).toEqual([5, 6]);
  });

  it("reads the time in Dubai whatever the server zone", () => {
    expect(dubaiMinutes(new Date("2026-10-21T05:30:00Z"))).toBe(570); // 09:30 in Dubai
  });
});

describe("when a reason is needed", () => {
  it("punching in on time or during the break needs none; late does", () => {
    expect(needsReason("in", at("08:50"), false, H)).toBe(false);
    expect(needsReason("in", at("09:30"), false, H)).toBe(false);
    expect(needsReason("in", at("09:31"), false, H)).toBe(true);
    expect(needsReason("in", at("15:00"), false, H)).toBe(false); // back from break
    expect(needsReason("in", at("16:45"), false, H)).toBe(true); // late from break
  });

  it("punching out during work hours needs a reason, but not at the break or after work", () => {
    expect(needsReason("out", at("12:00"), false, H)).toBe(true);
    expect(needsReason("out", at("14:30"), false, H)).toBe(false);
    expect(needsReason("out", at("21:15"), false, H)).toBe(true);
    expect(needsReason("out", at("21:30"), false, H)).toBe(false);
    expect(needsReason("out", at("08:00"), false, H)).toBe(false);
  });

  it("never asks on an off day", () => {
    expect(needsReason("in", at("13:00"), true, H)).toBe(false);
    expect(needsReason("out", at("13:00"), true, H)).toBe(false);
  });

  it("joins the picked reason and the note", () => {
    expect(reasonText("Traffic or transport delay", "")).toBe("Traffic or transport delay");
    expect(reasonText("Traffic or transport delay", " accident on E11 ")).toBe("Traffic or transport delay: accident on E11");
    expect(reasonText("Other", "Bank visit")).toBe("Bank visit");
  });
});

describe("day colour", () => {
  const base = { today: "2026-10-21", nowMin: at("11:00"), hours: H, firstDay: "2026-10-01", absence: null };
  it("uses the first punch-in of the day", () => {
    expect(dayStatus({ ...base, day: "2026-10-20", punches: [{ late: false }, { late: true }] })).toBe("present");
    expect(dayStatus({ ...base, day: "2026-10-20", punches: [{ late: true }] })).toBe("late");
  });
  it("shows absences, off days and days before the account", () => {
    expect(dayStatus({ ...base, day: "2026-10-20", punches: [] })).toBe("absent");
    expect(dayStatus({ ...base, day: "2026-10-20", punches: [], absence: "medical" })).toBe("medical");
    expect(dayStatus({ ...base, day: "2026-10-30", punches: [], absence: "other" })).toBe("other");
    expect(dayStatus({ ...base, day: "2026-10-18", punches: [] })).toBe("off"); // a Sunday
    expect(dayStatus({ ...base, day: "2026-09-30", punches: [] })).toBe("none");
    expect(dayStatus({ ...base, day: "2026-10-22", punches: [] })).toBe("future");
  });
  it("today is only absent once the working day is over", () => {
    expect(dayStatus({ ...base, day: "2026-10-21", punches: [] })).toBe("today");
    expect(dayStatus({ ...base, day: "2026-10-21", nowMin: at("21:30"), punches: [] })).toBe("absent");
  });
});

describe("months", () => {
  it("lists the days and moves across years", () => {
    expect(monthDays("2026-02")).toHaveLength(28);
    expect(monthDays("2028-02").at(-1)).toBe("2028-02-29");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(formatDuration(185)).toBe("3h 05m");
  });
});
