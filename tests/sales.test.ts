import { describe, expect, it } from "vitest";
import { aed, daysSince, isOpen, isStage, normName, OPEN_STAGES, STAGES, temperature } from "@/lib/sales";

describe("temperature (genuine-lead label)", () => {
  it("is cold with nothing ticked", () => {
    expect(temperature({})).toBe("cold");
  });

  it("is hot with three of need/authority/budget/timing and some verification", () => {
    expect(temperature({ need: true, authority: true, budget: true, trn: true })).toBe("hot");
    expect(temperature({ need: true, authority: true, timing: true, licence: true })).toBe("hot");
  });

  it("is not hot without any verification, however well the questions went", () => {
    expect(temperature({ need: true, authority: true, budget: true, timing: true })).toBe("warm");
  });

  it("is warm with two answers, or one answer plus two verifications", () => {
    expect(temperature({ need: true, budget: true })).toBe("warm");
    expect(temperature({ need: true, emailDomain: true, licence: true })).toBe("warm");
  });

  it("stays cold with one answer or only verifications", () => {
    expect(temperature({ need: true })).toBe("cold");
    expect(temperature({ emailDomain: true, licence: true, trn: true })).toBe("cold");
    expect(temperature({ need: true, trn: true })).toBe("cold");
  });

  it("caps a red-flagged lead at warm", () => {
    expect(temperature({ need: true, authority: true, budget: true, trn: true, redFlag: true })).toBe("warm");
    expect(temperature({ redFlag: true })).toBe("cold");
  });
});

describe("stages", () => {
  it("has Won and Lost as closed, everything else open", () => {
    expect(STAGES.map((s) => s.key)).toEqual(["new", "contacted", "requirement", "sourcing", "quoted", "negotiation", "won", "lost"]);
    expect(OPEN_STAGES).toHaveLength(6);
    expect(isOpen("quoted")).toBe(true);
    expect(isOpen("won")).toBe(false);
    expect(isOpen("lost")).toBe(false);
    expect(isStage("won")).toBe(true);
    expect(isStage("nope")).toBe(false);
  });
});

describe("normName", () => {
  it("treats common spellings of the same company as equal", () => {
    expect(normName("ABC Trading L.L.C.")).toBe(normName("abc trading llc"));
    expect(normName("ABC  Trading, LLC")).toBe(normName("ABC Trading"));
    expect(normName("Zeronix FZ-LLC")).toBe(normName("Zeronix"));
  });

  it("keeps different companies apart and keeps Arabic names", () => {
    expect(normName("ABC Trading")).not.toBe(normName("ABD Trading"));
    expect(normName("شركة النور")).not.toBe("");
  });
});

describe("formatting helpers", () => {
  it("formats AED and handles missing values", () => {
    expect(aed(12500)).toBe("AED 12,500");
    expect(aed(null)).toBe("No value yet");
  });

  it("counts whole days since a date", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    expect(daysSince("2026-10-21T01:00:00Z", now)).toBe(0);
    expect(daysSince("2026-10-18T11:00:00Z", now)).toBe(3);
    expect(daysSince("2026-10-25T00:00:00Z", now)).toBe(0);
  });
});
