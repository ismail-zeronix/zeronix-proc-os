import { describe, expect, it } from "vitest";
import { addWorkingDays, firstName, greetingFor, offerLine, pickRecipients, render, schedule, shortCompany, unfilled, whyNot, type EligibilityInput, type RecipientPerson } from "@/lib/prospecting/outreach-rules";
import { checkEmail, layout, writePrompt } from "@/lib/prospecting/writer-rules";
import { guessIndustry } from "@/lib/prospecting/industry";

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
    toEmail: "sara@acme.ae",
    companyStatus: "ready",
    suppressed: false,
    inCrm: "",
    openEnrollment: false,
    daysSinceLast: null,
  };

  it("allows a ready prospect with a confirmed email", () => {
    expect(whyNot(ok)).toBeNull();
  });

  it("blocks each unsafe case with a reason", () => {
    expect(whyNot({ ...ok, toEmail: "" })).toContain("no confirmed email");
    expect(whyNot({ ...ok, suppressed: true })).toContain("do-not-contact");
    expect(whyNot({ ...ok, inCrm: "Acme Trading LLC" })).toBe("already in the CRM (Acme Trading LLC)");
    expect(whyNot({ ...ok, companyStatus: "converted" })).toContain("converted");
    expect(whyNot({ ...ok, openEnrollment: true })).toContain("already in a campaign");
    expect(whyNot({ ...ok, daysSinceLast: 30 })).toContain("wait 90");
    expect(whyNot({ ...ok, daysSinceLast: 120 })).toBeNull();
  });
});

describe("recipients", () => {
  const p = (id: number, email: string, extra: Partial<RecipientPerson> = {}): RecipientPerson => ({ id, name: `P${id}`, email, emailStatus: "verified", isPrimary: false, roleKind: "influencer", ...extra });

  it("puts the main contact in To and every other confirmed address on Cc", () => {
    const r = pickRecipients("info@sajaya.ae", [p(1, "neliza@sajaya.ae"), p(2, "Salem@Sajaya.ae", { isPrimary: true, roleKind: "decision", name: "Salem Ali" }), p(3, "x@sajaya.ae", { emailStatus: "guess" })]);
    expect(r).toEqual({ to: "salem@sajaya.ae", personId: 2, personName: "Salem Ali", cc: ["neliza@sajaya.ae", "info@sajaya.ae"] });
  });

  it("writes to the company inbox when no owner or manager has an email, keeping staff on Cc", () => {
    expect(pickRecipients("info@sajaya.ae", [p(1, "agent@sajaya.ae")])).toEqual({ to: "info@sajaya.ae", personId: null, personName: "", cc: ["agent@sajaya.ae"] });
    expect(pickRecipients("", [p(1, "agent@sajaya.ae")])?.to).toBe("agent@sajaya.ae");
  });

  it("never uses guesses or blocked addresses, and keeps Cc short", () => {
    expect(pickRecipients("", [p(1, "a@x.ae", { emailStatus: "guess" })])).toBeNull();
    const many = pickRecipients("info@x.ae", [p(1, "a@x.ae", { isPrimary: true }), p(2, "b@x.ae"), p(3, "c@x.ae"), p(4, "d@x.ae"), p(5, "e@x.ae")], new Set(["b@x.ae"]));
    expect(many?.cc).toEqual(["c@x.ae", "d@x.ae", "e@x.ae"]);
    expect(pickRecipients("info@x.ae", [], new Set(["x.ae"]))).toBeNull();
  });

  it("greets a person by first name and an inbox as a team", () => {
    expect(greetingFor("Mr. Salem Ali", "Sajaya Real Estate LLC")).toBe("Hi Salem");
    expect(greetingFor("", "Sajaya Real Estate L.L.C")).toBe("Hello Sajaya Real Estate team");
  });
});

describe("AI first emails", () => {
  const body = "Hi there,\n\nI saw that Sajaya leases residential and commercial units across many Dubai buildings. Busy property offices often need reliable CCTV and access control for each building, and we install and support both across Dubai. Would a short call this week be useful to see if it fits your buildings?\n\nBest regards,";

  it("puts our greeting on the email and rejects placeholders and links", () => {
    const ok = checkEmail(JSON.stringify({ subject: "CCTV for your buildings", body }), "Hello Sajaya Real Estate team");
    expect("email" in ok && ok.email.body.startsWith("Hello Sajaya Real Estate team,\n")).toBe(true);
    expect("email" in ok && ok.email.body).not.toContain("Hi there");
    expect(checkEmail(JSON.stringify({ subject: "Quick question", body: body + " [Your Name]" }), "Hi Sara")).toEqual({ problem: "it has placeholders or tags left in it" });
    expect(checkEmail(JSON.stringify({ subject: "CCTV", body: body + " see www.x.ae" }), "Hi Sara")).toEqual({ problem: "it has links in it" });
    expect(checkEmail("Sorry, I cannot help", "Hi Sara")).toEqual({ problem: "the reply was not the JSON asked for" });
  });

  it("lays every email out the same way", () => {
    expect(layout("Hi Muhammad,\nI saw you are hiring. We do our best. Would a brief call this week be helpful? Best regards,", "Hi Muhammad")).toBe(
      "Hi Muhammad,\n\nI saw you are hiring. We do our best.\n\nWould a brief call this week be helpful?\n\nBest regards,",
    );
    expect(layout("Dear Sir, Two lines.\n\nAnd a question?\n\nKind regards", "Hello Acme team")).toBe("Hello Acme team,\n\nTwo lines.\n\nAnd a question?\n\nBest regards,");
  });

  it("gives AI the offer, the facts and the greeting", () => {
    const prompt = writePrompt({ brief: "CCTV and access control", sender: "ZERONIX TECHNOLOGY LLC", company: "Sajaya", industry: "Real estate", emirate: "Dubai", website: "sajaya.ae", greeting: "Hi Salem", personName: "Salem", personTitle: "Owner", personalLine: "You lease units across 20 buildings", signals: [] });
    expect(prompt).toContain('exactly "Hi Salem,"');
    expect(prompt).toContain("CCTV and access control");
    expect(prompt).toContain("Industry: Real estate");
  });
});

describe("industry", () => {
  it("guesses from the company name, real estate before finance", () => {
    expect(guessIndustry("S T CLAIR REAL ESTATES BROKER L.L.C")).toBe("Real estate");
    expect(guessIndustry("BUHALEEBA REAL ESTAE (L. L. C)")).toBe("Real estate");
    expect(guessIndustry("Al Noor Polyclinic")).toBe("Healthcare");
    expect(guessIndustry("AL GHURAIR CENTRE(L.L.C.)", "")).toBe("");
    expect(guessIndustry("ABC LLC", "General Trading")).toBe("Trading");
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
