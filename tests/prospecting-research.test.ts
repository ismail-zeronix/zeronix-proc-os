import { describe, expect, it } from "vitest";
import { cooldownMinutes, nextUtcMidnight, pickFreeModels, type CatalogModel } from "@/lib/prospecting/free-models";
import { aiPrompt, aiReadPrompt, cleanAi, keepFromPages, parseAiJson, planFromAi, planFromCrawl, roleKindOf, type CompanyNow } from "@/lib/prospecting/research-rules";

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

describe("OpenRouter free models", () => {
  const m = (id: string, extra: Partial<CatalogModel> = {}): CatalogModel => ({
    id,
    name: id,
    context_length: 100_000,
    pricing: { prompt: "0", completion: "0" },
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    supported_parameters: [],
    ...extra,
  });

  it("keeps free text models only, JSON-capable and long-context first", () => {
    const picked = pickFreeModels(
      [
        m("a/plain:free"),
        m("b/json:free", { supported_parameters: ["response_format"], context_length: 32_000 }),
        m("c/big:free", { context_length: 1_000_000 }),
        m("d/paid", { pricing: { prompt: "0.000001", completion: "0.000002" } }),
        m("e/music", { architecture: { input_modalities: ["text"], output_modalities: ["audio"] } }),
        m("f/content-safety:free"),
        m("g/expiring:free", { expiration_date: "2026-10-31" }),
        m("h/later:free", { expiration_date: "2026-12-31" }),
      ],
      "2026-10-30",
    );
    expect(picked.map((p) => p.modelId)).toEqual(["b/json:free", "c/big:free", "a/plain:free", "h/later:free"]);
    expect(picked[0].json).toBe(true);
  });

  it("knows when the free allowance comes back and how long a failing model rests", () => {
    expect(nextUtcMidnight(new Date("2026-10-30T21:15:00Z")).toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(cooldownMinutes(1)).toBe(10);
    expect(cooldownMinutes(3)).toBe(40);
    expect(cooldownMinutes(20)).toBe(24 * 60);
  });

  it("only accepts reading-step findings from the pages that were read", () => {
    const urls = ["https://acme.ae/", "https://acme.ae/contact"];
    const found = keepFromPages(
      cleanAi({
        emails: [
          { email: "info@acme.ae", source: "https://acme.ae/contact" },
          { email: "boss@acme.ae", source: "https://elsewhere.com/x" },
        ],
        phones: [{ phone: "+971 4 323 4567", source: "https://acme.ae/" }],
      }),
      urls,
    );
    expect(found.emails.map((e) => e.email)).toEqual(["info@acme.ae"]);
    expect(found.phones).toHaveLength(1);
    const prompt = aiReadPrompt("Acme", [{ url: urls[1], text: "Write to info at acme dot ae" }]);
    expect(prompt).toContain("PAGE https://acme.ae/contact");
  });
});
