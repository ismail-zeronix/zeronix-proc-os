import { describe, expect, it } from "vitest";
import { allocate, fromMinor, pctOf, sumMinor, toMinor } from "@/lib/money";
import { round2 } from "@/lib/quotation";

describe("money in minor units", () => {
  it("converts both ways, rounding half away from zero like round2", () => {
    expect(toMinor(12.345)).toBe(1235);
    expect(toMinor("1.005")).toBe(101);
    expect(toMinor(-1.005)).toBe(-101);
    expect(toMinor("0.10")).toBe(10);
    expect(toMinor(0)).toBe(0);
    expect(fromMinor(1235)).toBe(12.35);
    for (const n of [0.1, 0.2, 1.005, 2.675, 99.995, 1234.565, 0.015]) expect(fromMinor(toMinor(n))).toBe(round2(n));
  });

  it("refuses what is not an amount", () => {
    expect(() => toMinor("abc")).toThrow();
    expect(() => toMinor(Number.NaN)).toThrow();
    expect(() => fromMinor(1.5)).toThrow();
  });

  it("adds without float drift", () => {
    expect(sumMinor([toMinor(0.1), toMinor(0.2)])).toBe(30);
    expect(fromMinor(sumMinor(Array(10).fill(toMinor(0.1))))).toBe(1);
  });

  it("takes a percentage, half away from zero", () => {
    expect(pctOf(1999, 5)).toBe(100); // 99.95 → 100
    expect(pctOf(1990, 5)).toBe(100); // 99.5 → 100
    expect(pctOf(1989, 5)).toBe(99); // 99.45 → 99
    expect(pctOf(-1990, 5)).toBe(-100);
    expect(pctOf(25050, 5)).toBe(toMinor(round2((250.5 * 5) / 100)));
  });

  it("splits an amount so the parts add up exactly", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(1000, [500, 300, 200])).toEqual([500, 300, 200]);
    expect(allocate(7, [0, 0])).toEqual([4, 3]);
    expect(allocate(5, [])).toEqual([]);
    const parts = allocate(12553, [25050, 1033, 7]);
    expect(sumMinor(parts)).toBe(12553);
  });
});
