import { describe, expect, it } from "vitest";
import { aiPrompt, cleanAi, parseAiJson, planFromAi, planFromCrawl, roleKindOf, type CompanyNow } from "@/lib/prospecting/research-rules";

const today = "2026-10-30";
const empty: CompanyNow = { domain: "acme.ae", email: "", phone: "", linkedinUrl: "", address: "", people: [], signals: [] };

const crawl = {
  pages: [{ url: "https://acme.ae/", title: "Acme" }],
  emails: [
    { email: "sara.khan@acme.ae", source: "https://acme.ae/team" },
    { email: "partner@gmail.com", source: "https://acme.ae/" },
    { email: "info@acme.ae", source: "https://acme.ae/contact" },
  ],
  phones: [{ phone: "+971 4 323 4567", source: "https://acme.ae/contact" }],
  people: [
    { name: "Sara Khan", title: "Managing Director", email: "", source: "https://acme.ae/team" },
    { name: "Omar Hassan", title: "Head of IT", email: "", source: "https://acme.ae/team" },
  ],
  linkedin: "https://www.linkedin.com/company/acme",
  hiringPage: "https://acme.ae/careers",
  health: { https: false, mobile: true, copyrightYear: 2019, outdated: true },
};

describe("planFromCrawl", () => {
  it("fills empty company fields with the company's own shared inbox and first phone", () => {
    const p = planFromCrawl(crawl, empty, today);
    expect(p.company).toEqual({ email: "info@acme.ae", phone: "+971 4 323 4567", linkedinUrl: "https://www.linkedin.com/company/acme" });
    expect(p.emails[0].email).toBe("info@acme.ae");
  });

  it("never overwrites what is already there", () => {
    const p = planFromCrawl(crawl, { ...empty, email: "hello@acme.ae", phone: "+971 4 000 0000", linkedinUrl: "x" }, today);
    expect(p.company).toEqual({});
  });

  it("adds new people, matches their email by name and marks it verified", () => {
    const p = planFromCrawl(crawl, { ...empty, people: [{ name: "Omar Hassan", email: "" }] }, today);
    expect(p.people).toEqual([
      { name: "Sara Khan", title: "Managing Director", roleKind: "decision", email: "sara.khan@acme.ae", emailStatus: "verified", emailSource: "https://acme.ae/team" },
    ]);
  });

  it("adds hiring and weak-website signals once", () => {
    const p = planFromCrawl(crawl, empty, today);
    expect(p.signals.map((s) => s.kind)).toEqual(["hiring", "weak_website"]);
    expect(p.signals[1].detail).toContain("no SSL");
    const again = planFromCrawl(crawl, { ...empty, signals: [{ kind: "hiring", observedOn: "2026-10-01" }, { kind: "weak_website", observedOn: "2025-01-01" }] }, today);
    expect(again.signals).toEqual([]);
  });

  it("asks for AI only when the website gave no email and no phone", () => {
    expect(planFromCrawl(crawl, empty, today).needsAi).toBe(false);
    expect(planFromCrawl({ ...crawl, emails: [] }, empty, today).needsAi).toBe(false);
    expect(planFromCrawl({ pages: [{ url: "https://acme.ae/", title: "" }], emails: [], phones: [] }, empty, today).needsAi).toBe(true);
    expect(planFromCrawl({}, empty, today)).toMatchObject({ needsAi: true, summary: "The website could not be read" });
  });
});

describe("AI findings", () => {
  it("drops anything without a source page, and invalid emails", () => {
    const a = cleanAi({
      website: "https://www.acme.ae",
      emails: [
        { email: "info@acme.ae", source: "https://directory.ae/acme" },
        { email: "guess@acme.ae", source: "" },
        { email: "not an email", source: "https://x.ae" },
      ],
      phones: [{ phone: "04 323 4567", source: "https://directory.ae/acme" }, { phone: "123", source: "https://x.ae" }],
      people: [{ name: "Sara Khan", title: "Owner", source: "made up" }],
    });
    expect(a.emails).toEqual([{ email: "info@acme.ae", source: "https://directory.ae/acme" }]);
    expect(a.phones).toHaveLength(1);
    expect(a.people).toEqual([]);
    expect(a.website).toBe("https://www.acme.ae");
  });

  it("marks AI-found personal emails likely, not verified", () => {
    const a = cleanAi({ emails: [{ email: "sara@acme.ae", source: "https://x.ae/p" }], people: [{ name: "Sara Khan", title: "Owner", source: "https://x.ae/p" }] });
    const p = planFromAi(a, empty);
    expect(p.people[0]).toMatchObject({ name: "Sara Khan", email: "sara@acme.ae", emailStatus: "likely", roleKind: "decision" });
    expect(p.signals).toEqual([]);
  });

  it("reads JSON wrapped in text or a code fence", () => {
    expect(parseAiJson('Here you go:\n```json\n{"website":"acme.ae","emails":[]}\n```')).toEqual({ website: "acme.ae", emails: [] });
    expect(parseAiJson("No results.")).toBeNull();
  });

  it("keeps the prompt short and asks for sources", () => {
    const p = aiPrompt({ name: "Acme", website: "", activity: "Trading", emirate: "Dubai", freeZone: "" });
    expect(p).toContain('"Acme"');
    expect(p).toContain("source");
    expect(p.length).toBeLessThan(900);
  });

  it("tells decision makers from others", () => {
    expect(roleKindOf("Founder & CEO")).toBe("decision");
    expect(roleKindOf("Head of IT")).toBe("influencer");
  });
});
