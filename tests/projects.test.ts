import { describe, expect, it } from "vitest";
import { isProjectStatus, projectNumber, projectPhase } from "@/lib/projects";

describe("projectPhase", () => {
  it("follows the deal stage until the deal is won", () => {
    expect(projectPhase("new", "not_started")).toBe("lead");
    expect(projectPhase("sourcing", "not_started")).toBe("lead");
    expect(projectPhase("quoted", "not_started")).toBe("quoted");
    expect(projectPhase("negotiation", "not_started")).toBe("quoted");
    expect(projectPhase("lost", "not_started")).toBe("dropped");
  });

  it("follows the work status once won", () => {
    expect(projectPhase("won", "not_started")).toBe("won");
    expect(projectPhase("won", "in_progress")).toBe("active");
    expect(projectPhase("won", "on_hold")).toBe("active");
    expect(projectPhase("won", "completed")).toBe("done");
    expect(projectPhase("won", "closed")).toBe("done");
    expect(projectPhase("won", "cancelled")).toBe("dropped");
  });

  it("ignores a leftover work status while the deal is open again", () => {
    // e.g. the order was cancelled and the deal went back to negotiation
    expect(projectPhase("negotiation", "in_progress")).toBe("quoted");
  });
});

describe("project numbers and statuses", () => {
  it("formats ZPJ-YYYY-NNNN", () => {
    expect(projectNumber(2026, 1)).toBe("ZPJ-2026-0001");
    expect(projectNumber(2026, 12345)).toBe("ZPJ-2026-12345");
  });

  it("knows its statuses", () => {
    expect(isProjectStatus("in_progress")).toBe(true);
    expect(isProjectStatus("won")).toBe(false);
  });
});
