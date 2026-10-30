import { describe, expect, it } from "vitest";
import { addWorkingDays, firstName, offerLine, render, schedule, shortCompany, unfilled, whyNot, type EligibilityInput } from "@/lib/prospecting/outreach-rules";

describe("merge fields", () => {
  it("fills known fields and reports the empty ones", () => {
    const r = render("Hi {first_name}, {personal_line} {company}", { first_name: "Sara", company: "Acme", personal_line: " " });
    expect(r.text).toBe("Hi Sara, {personal_line} Acme");
    expect(r.missing).toEqual(["personal_line"]);
    expect(unfilled(r.text)).toEqual(["personal_line"]);
  });

  it("writes names the way people do in an email", () => {
    expect(firstName("Mr. Ahmed Al Mansoori")).toBe("Ahmed");
    expect(firstName("Dr Sara Khan")).toBe("Sara");
    expect(shortCompany("Acme Trading FZ-LLC")).toBe("Acme Trading");
    expect(shortCompany("Blue Sky L.L.C.")).toBe("Blue Sky");
    expect(shortCompany("LLC")).toBe("LLC");
    expect(offerLine("New office IT setup: laptops.")).toBe("new office IT setup: laptops");
    expect(offerLine("CCTV and networking")).toBe("CCTV and networking");
  });
});

describe("who may be emailed", () => {
  const ok: EligibilityInput = {
    personEmail: "sara@acme.ae",
    emailStatus: "verified",
    companyStatus: "ready",
    score: 6,
    minScore: 4,
    suppressed: false,
    inCrm: "",
    openEnrollment: false,
    daysSinceLast: null,
    companyOpen: 0,
  };

  it("allows a ready prospect with a confirmed email", () => {
    expect(whyNot(ok)).toBeNull();
  });

  it("blocks each unsafe case with a reason", () => {
    expect(whyNot({ ...ok, personEmail: "" })).toContain("no email");
    expect(whyNot({ ...ok, emailStatus: "guess" })).toContain("guess");
    expect(whyNot({ ...ok, suppressed: true })).toContain("do-not-contact");
    expect(whyNot({ ...ok, inCrm: "Acme Trading LLC" })).toBe("already in the CRM (Acme Trading LLC)");
    expect(whyNot({ ...ok, companyStatus: "converted" })).toContain("converted");
    expect(whyNot({ ...ok, openEnrollment: true })).toContain("already in a campaign");
    expect(whyNot({ ...ok, daysSinceLast: 30 })).toContain("wait 90");
    expect(whyNot({ ...ok, daysSinceLast: 120 })).toBeNull();
    expect(whyNot({ ...ok, companyOpen: 2 })).toContain("2 people");
    expect(whyNot({ ...ok, score: 3.2 })).toContain("below 4");
  });
});

describe("working days", () => {
  it("skips Saturday and Sunday", () => {
    // Friday 30 Oct 2026 + 3 working days = Wednesday 4 Nov
    expect(addWorkingDays("2026-10-30", 3)).toBe("2026-11-04");
    expect(addWorkingDays("2026-10-31", 1)).toBe("2026-11-02");
    expect(schedule("2026-11-02", [0, 3, 4, 7])).toEqual(["2026-11-02", "2026-11-05", "2026-11-11", "2026-11-20"]);
  });
});
