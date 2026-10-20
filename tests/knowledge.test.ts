import { describe, expect, it } from "vitest";
import { ARTICLES, articleBySlug, articleText, SECTIONS, TIPS, tipOfTheDay } from "@/content/knowledge";
import { quoteOfTheDay, QUOTES } from "@/lib/quotes";

describe("knowledge content", () => {
  it("has unique slugs and every article belongs to a known section", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const a of ARTICLES) {
      expect(SECTIONS.some((s) => s.key === a.section)).toBe(true);
      expect(a.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.blocks.length).toBeGreaterThan(0);
    }
  });

  it("has at least one article in every section and finds articles by slug", () => {
    for (const s of SECTIONS) expect(ARTICLES.some((a) => a.section === s.key)).toBe(true);
    expect(articleBySlug("servers")?.title).toBe("Servers");
    expect(articleBySlug("nope")).toBeUndefined();
  });

  it("table rows match their header width", () => {
    for (const a of ARTICLES)
      for (const b of a.blocks)
        if ("table" in b) for (const r of b.table.rows) expect(r.length, `${a.slug}: ${r[0]}`).toBe(b.table.head.length);
  });

  it("indexes article text for search", () => {
    expect(articleText(articleBySlug("servers")!).toLowerCase()).toContain("raid");
  });

  it("picks the same tip and quote all day, and every tip points at a real article", () => {
    const morning = new Date("2026-10-21T05:00:00Z");
    const evening = new Date("2026-10-21T19:30:00Z"); // 23:30 in Dubai, same day
    expect(tipOfTheDay(morning)).toEqual(tipOfTheDay(evening));
    expect(TIPS.length).toBeGreaterThan(0);
    for (const t of TIPS) expect(articleBySlug(t.slug)).toBeDefined();
    expect(QUOTES).toContain(quoteOfTheDay(morning));
  });

  it("changes the quote at midnight in Dubai, not at midnight UTC", () => {
    expect(quoteOfTheDay(new Date("2026-10-21T19:59:00Z"))).not.toEqual(quoteOfTheDay(new Date("2026-10-21T20:00:00Z")));
    expect(quoteOfTheDay(new Date("2026-10-21T00:30:00Z"))).toEqual(quoteOfTheDay(new Date("2026-10-21T10:00:00Z")));
  });
});
