import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { guardSite, siteKeyOk } = await import("@/lib/website/site-key");
const { allowedApps } = await import("@/lib/apps");

const KEY = "a".repeat(32);

describe("site API key", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only the exact key", () => {
    expect(siteKeyOk(KEY, KEY)).toBe(true);
    expect(siteKeyOk(KEY + "x", KEY)).toBe(false);
    expect(siteKeyOk("", KEY)).toBe(false);
    expect(siteKeyOk(null, KEY)).toBe(false);
  });

  it("keeps the API closed while no key (or a short one) is set on the portal", () => {
    expect(siteKeyOk("", "")).toBe(false);
    expect(siteKeyOk("short", "short")).toBe(false);
  });

  it("answers 401 without the header and lets the right key through", () => {
    vi.stubEnv("SITE_API_KEY", KEY);
    expect(guardSite(new Request("http://portal/api/site/settings"))?.status).toBe(401);
    expect(guardSite(new Request("http://portal/api/site/settings", { headers: { "x-site-key": KEY } }))).toBeNull();
  });

  it("limits wrong keys per IP", () => {
    vi.stubEnv("SITE_API_KEY", KEY);
    const wrong = () => guardSite(new Request("http://portal/api/site/nav", { headers: { "x-site-key": "nope", "x-forwarded-for": "203.0.113.9" } }))?.status;
    const answers = Array.from({ length: 25 }, wrong);
    expect(answers.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(answers.at(-1)).toBe(429);
  });
});

describe("site contract", () => {
  it("the site's copy matches the portal's (website/src/lib/contract.ts)", () => {
    const portal = readFileSync("src/lib/website/contract.ts", "utf8");
    const site = readFileSync("website/src/lib/contract.ts", "utf8");
    expect(site).toBe(portal);
  });
});

describe("Website app", () => {
  it("is for admins by default and can be given to a sales user", () => {
    expect(allowedApps({ role: "admin" })).toContain("website");
    expect(allowedApps({ role: "sales", apps: null })).not.toContain("website");
    expect(allowedApps({ role: "sales", apps: ["website"] })).toContain("website");
  });
});

describe("markdown for the site", async () => {
  const { renderMarkdown, parseMarkdownFile, slugify } = await import("@/lib/website/markdown");

  it("renders tables and heading ids, and drops scripts and inline handlers", () => {
    const html = renderMarkdown("## Best for agents\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script><img src=x onerror=alert(1)>");
    expect(html).toContain('<h2 id="best-for-agents">');
    expect(html).toContain("<table>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("reads snake_case and camelCase front matter the same way", () => {
    expect(parseMarkdownFile("---\nmeta_title: A\nprimaryKeyword: b\n---\nBody").data).toEqual({ metatitle: "A", primarykeyword: "b" });
  });

  it("makes clean web addresses", () => {
    expect(slugify("HP EliteBook 840 G11")).toBe("hp-elitebook-840-g11");
    expect(slugify("Architecture & Design")).toBe("architecture-and-design");
  });
});

describe("spec template text", async () => {
  const { templateToText, textToTemplate } = await import("@/lib/website/spec-template");

  it("round-trips groups, fields and filters", () => {
    const t = { groups: [{ label: "Performance", fields: [{ key: "processor", label: "Processor", filter: true }, { key: "memory", label: "Memory" }] }] };
    expect(textToTemplate(templateToText(t))).toEqual(t);
  });

  it("ignores lines it cannot read and empty groups", () => {
    expect(textToTemplate("Display\n  nonsense\nEmpty\n").groups).toEqual([]);
  });
});

describe("product .md import", async () => {
  vi.doMock("@/db", () => ({ db: {}, schema: {} }));
  const { productFromMarkdown } = await import("@/lib/website/catalog");
  const lookup = {
    brands: [{ id: 1, slug: "hp", name: "HP" }],
    categories: [{ id: 7, slug: "laptops", name: "Business laptops" }],
    industries: [{ id: 3, slug: "real-estate" }],
  };
  const md = `---
type: product
name: "HP EliteBook 840 G11"
brand: HP
category: laptops
mpn: "A1B2C3EA#ABV"
source_url: "https://www.hp.com/ae-en/x"
specs:
  Processor: "Intel Core Ultra 7 155U"
  memory: 16 GB DDR5
uae: { keyboard: "Arabic/English", warranty: "3 years HP Middle East" }
best_for:
  - { industry: real-estate, role: "Agents on the move", label: "Best overall" }
  - { industry: aviation }
pros: [Light, Long battery]
faq:
  - q: Does it have an Arabic keyboard?
    a: Yes, the #ABV part number.
---
A light business laptop.`;

  it("maps the front matter onto a draft product", () => {
    const { input, warnings } = productFromMarkdown(md, lookup);
    expect(input).toMatchObject({
      name: "HP EliteBook 840 G11",
      slug: "hp-elitebook-840-g11",
      brandId: 1,
      categoryId: 7,
      mpn: "A1B2C3EA#ABV",
      status: "draft",
      specsChecked: true,
      specs: { processor: "Intel Core Ultra 7 155U", memory: "16 GB DDR5" },
      uaeNotes: { keyboard: "Arabic/English", warranty: "3 years HP Middle East" },
      pros: ["Light", "Long battery"],
      summary: "A light business laptop.",
    });
    expect(input.links).toEqual([{ industryId: 3, role: "Agents on the move", label: "Best overall", rank: 0 }]);
    expect(input.faq).toHaveLength(1);
    expect(warnings.join(" ")).toContain("aviation");
  });

  it("refuses a guide uploaded as a product, and a file with no name", () => {
    expect(() => productFromMarkdown("---\ntype: guide\nname: X\n---\n", lookup)).toThrow(/not a product/);
    expect(() => productFromMarkdown("---\nbrand: HP\n---\n", lookup)).toThrow(/no name/);
  });
});

describe("guides and posts", async () => {
  const { postFromMarkdown, renderPostBody, seoChecks, tocOf, MARKER, readingMinutes } = await import("@/lib/website/post-parse");
  const lookup = {
    industries: [{ id: 3, slug: "real-estate" }],
    categories: [{ id: 7, slug: "laptops", name: "Business laptops" }],
    products: [
      { id: 11, slug: "hp-elitebook-840-g11", mpn: "A1B2C3EA#ABV" },
      { id: 12, slug: "dell-latitude-7450", mpn: "" },
    ],
  };
  const md = `---
type: guide
title: "Best Laptops for Real Estate Agents in the UAE (2026)"
meta_title: "Best laptops for real estate agents UAE"
meta_description: "The best business laptops for real estate agents in the UAE: light, long battery, Arabic keyboards and local warranty, compared with B2B pricing."
primary_keyword: "laptops for real estate agents"
industry: real-estate
category: laptops
cover: images/cover.webp
cover_alt: "Agent with a laptop"
products:
  - { mpn: "A1B2C3EA#ABV", label: "Best overall", verdict: "Light and fast", pros: [Light], cons: [Pricey] }
  - { slug: dell-latitude-7450, label: "Best value" }
  - { mpn: "UNKNOWN-1" }
faq:
  - { q: "What size?", a: "14-inch." }
---
Picking laptops for real estate agents starts with weight.

## What laptops for real estate agents need

See [our picks](/industries/real-estate) and [laptops](/products/laptops) and [old](/products/missing).

{{compare}}

{{product:hp-elitebook-840-g11}}

{{cta:Get pricing for your agency}}

## Battery life

![](images/battery.webp)
`;

  it("reads a guide: type, industry, picks by part number or slug, cover path", () => {
    const { input, coverPath, coverAlt, warnings } = postFromMarkdown(md, lookup);
    expect(input).toMatchObject({ type: "guide", slug: "best-laptops-for-real-estate-agents-in-the-uae-2026", industryId: 3, categoryId: 7, category: "Business laptops" });
    expect(input.products.map((p) => [p.productId, p.label, p.rank])).toEqual([
      [11, "Best overall", 1],
      [12, "Best value", 2],
    ]);
    expect(coverPath).toBe("images/cover.webp");
    expect(coverAlt).toBe("Agent with a laptop");
    expect(warnings.join(" ")).toContain("UNKNOWN-1");
  });

  it("keeps shortcodes as markers the site API can split on", () => {
    const html = renderPostBody(md.split("---\n").slice(2).join("---\n"));
    const parts = html.split(MARKER);
    const kinds = parts.filter((_, i) => i % 3 === 1);
    expect(kinds).toEqual(["compare", "product", "cta"]);
    expect(decodeURIComponent(parts[parts.indexOf("cta") + 1])).toBe("Get pricing for your agency");
    expect(tocOf(html).map((t) => t.id)).toEqual(["what-laptops-for-real-estate-agents-need", "battery-life"]);
  });

  it("checks the draft: keyword placement, broken internal links, missing alt text, FAQ count", () => {
    const { input } = postFromMarkdown(md, lookup);
    const checks = Object.fromEntries(seoChecks(input, { known: new Set(["/industries/real-estate", "/products/laptops"]), slugTaken: false }).map((c) => [c.key, c]));
    expect(checks.meta.level).toBe("ok");
    expect(checks.keyword.detail).toContain("title");
    expect(checks.links.level).toBe("fail");
    expect(checks.links.detail).toContain("/products/missing");
    expect(checks.links.detail).not.toContain("battery");
    expect(checks.alt.level).toBe("fail");
    expect(checks.faq.level).toBe("warn");
    expect(checks.picks.level).toBe("ok");
    expect(seoChecks(input, { known: new Set(), slugTaken: true }).find((c) => c.key === "slug")?.level).toBe("fail");
  });

  it("refuses a product file and a file without a title", () => {
    expect(() => postFromMarkdown("---\ntype: product\ntitle: X\n---\n", lookup)).toThrow(/product/);
    expect(() => postFromMarkdown("---\ntype: guide\n---\nBody", lookup)).toThrow(/no title/);
    expect(readingMinutes("word ".repeat(1100))).toBe(5);
  });
});

describe("website database isolation", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { getTableName, isTable } = await import("drizzle-orm");
  const main = await import("@/db/schema");
  const site = await import("@/db/site-schema");
  const tables = (mod: Record<string, unknown>) => Object.values(mod).flatMap((v) => (isTable(v) ? [getTableName(v)] : []));

  it("keeps every site_ table out of the ZeronixOS schema", () => {
    expect(tables(main).filter((t) => t.startsWith("site_"))).toEqual([]);
    expect(tables(site).every((t) => t.startsWith("site_"))).toBe(true);
  });

  it("lets only the Website code import the website database", () => {
    const allowed = [/^src\/lib\/website\//, /^src\/app\/\(app\)\/website\//, /^src\/app\/api\/(site|website-media)\//, /^src\/worker\/website\.ts$/, /^src\/db\/site/];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name).replaceAll("\\", "/");
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && /from "@\/db\/site(-schema)?"/.test(readFileSync(p, "utf8")) && !allowed.some((r) => r.test(p))) offenders.push(p);
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });

  it("says the website database is not set up instead of connecting anywhere", async () => {
    vi.stubEnv("SITE_DATABASE_URL", "");
    const { siteDb, siteDbReachable, SiteDbUnavailable } = await import("@/db/site");
    expect(() => siteDb.select()).toThrow(SiteDbUnavailable);
    expect(await siteDbReachable()).toEqual({ ok: false, detail: "SITE_DATABASE_URL is not set" });
    vi.unstubAllEnvs();
  });
});

describe("tracker rules", async () => {
  const { classifySource, eventSchema, isBot, pageOf, visitorKeyFor, dubaiDay } = await import("@/lib/website/traffic");

  it("tells where a visit came from", () => {
    expect(classifySource("https://www.google.com/", undefined, "zeronixtech.com")).toBe("google");
    expect(classifySource("https://www.google.ae/search?q=x", undefined, "zeronixtech.com")).toBe("google");
    expect(classifySource("https://chatgpt.com/", undefined, "zeronixtech.com")).toBe("ai");
    expect(classifySource("https://www.perplexity.ai/search", undefined, "zeronixtech.com")).toBe("ai");
    expect(classifySource("https://www.bing.com/", undefined, "zeronixtech.com")).toBe("bing");
    expect(classifySource("https://www.linkedin.com/feed", undefined, "zeronixtech.com")).toBe("social");
    expect(classifySource("https://zeronixtech.com/guides/x", undefined, "zeronixtech.com")).toBe("direct");
    expect(classifySource("", undefined, "zeronixtech.com")).toBe("direct");
    expect(classifySource("https://someblog.ae/post", undefined, "zeronixtech.com")).toBe("referral");
    expect(classifySource("https://www.google.com/", { source: "newsletter", medium: "email" }, "zeronixtech.com")).toBe("email");
    expect(classifySource("", { source: "google", medium: "cpc" }, "zeronixtech.com")).toBe("campaign");
  });

  it("keeps bots out", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe(false);
  });

  it("hashes a visitor per day without keeping the IP", () => {
    const a = visitorKeyFor("1.2.3.4", "UA", "2026-11-02", "secret");
    expect(a).toBe(visitorKeyFor("1.2.3.4", "UA", "2026-11-02", "secret"));
    expect(a).not.toBe(visitorKeyFor("1.2.3.4", "UA", "2026-11-03", "secret"));
    expect(a).not.toContain("1.2.3.4");
    expect(dubaiDay(new Date("2026-11-01T21:30:00Z"))).toBe("2026-11-02");
  });

  it("ties paths to posts, products and industries", () => {
    expect(pageOf("/guides/best-laptops-for-real-estate-uae")).toEqual({ kind: "post", slug: "best-laptops-for-real-estate-uae" });
    expect(pageOf("/blog/category/how-to")).toEqual({ kind: "other", slug: "" });
    expect(pageOf("/products/laptops/hp-elitebook-840-g11")).toEqual({ kind: "product", slug: "hp-elitebook-840-g11" });
    expect(pageOf("/industries/legal")).toEqual({ kind: "industry", slug: "legal" });
    expect(pageOf("/about")).toEqual({ kind: "post", slug: "about" });
    expect(pageOf("/quote")).toEqual({ kind: "other", slug: "" });
  });

  it("accepts only clean events", () => {
    expect(eventSchema.safeParse({ type: "pageview", path: "/guides/x", sid: "abcdef0123456789" }).success).toBe(true);
    expect(eventSchema.safeParse({ type: "pageview", path: "/quote?email=a@b.c", sid: "abcdef0123456789" }).success).toBe(false);
    expect(eventSchema.safeParse({ type: "purchase", path: "/", sid: "abcdef0123456789" }).success).toBe(false);
    expect(eventSchema.safeParse({ type: "engaged", path: "/", sid: "x" }).success).toBe(false);
  });
});

describe("analytics periods", async () => {
  vi.doMock("@/db", () => ({ db: {}, schema: {} }));
  vi.doMock("@/db/site", () => ({ siteDb: {}, siteSchema: { siteDaily: {}, siteEvents: {} } }));
  const { periods } = await import("@/lib/website/analytics");
  vi.doUnmock("@/db");
  vi.doUnmock("@/db/site");

  it("compares a period with the same length just before it", () => {
    const { cur, prev } = periods(7, "2026-11-02");
    expect(cur).toMatchObject({ from: "2026-10-27", to: "2026-11-02" });
    expect(cur.days).toHaveLength(7);
    expect(prev).toMatchObject({ from: "2026-10-20", to: "2026-10-26" });
  });
});

describe("keyword CSV import", async () => {
  const { keywordsFromCsv, parseCsv } = await import("@/lib/website/keyword-csv");

  it("reads our research file", () => {
    const text = readFileSync("website/content/keywords.csv", "utf8");
    const { rows } = keywordsFromCsv(text);
    expect(rows.length).toBeGreaterThan(20);
    const re = rows.find((r) => r.keyword === "best laptops for real estate agents uae")!;
    expect(re).toMatchObject({ cluster: "Real estate", intent: "commercial", industry: "real-estate", priority: 1, status: "planned", plannedFor: "2026-11-03" });
    expect(re.target).toBe("/guides/best-laptops-for-real-estate-agents-uae");
  });

  it("reads a Keyword Planner export (title lines, tabs, ranges)", () => {
    const text = "Keyword Stats 2026-11-02\nAll locations\nKeyword\tCurrency\tAvg. monthly searches\tCompetition (indexed value)\nBusiness Laptops UAE\tAED\t1K – 10K\t54\nbusiness laptops uae\tAED\t100\t1\n";
    const { rows, skipped } = keywordsFromCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ keyword: "business laptops uae", volume: 1000, difficulty: 54, status: "idea", intent: "commercial" });
    expect(skipped).toBe(1);
  });

  it("keeps quoted commas and quotes", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });
});

describe("Search Console", async () => {
  const { createVerify, generateKeyPairSync } = await import("node:crypto");
  const { parseServiceAccount, pathOf, signedAssertion, toSearchRows } = await import("@/lib/website/gsc-core");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const sa = { client_email: "reader@zeronix.iam.gserviceaccount.com", private_key: privateKey };

  it("reads only a real service account key", () => {
    expect(parseServiceAccount(JSON.stringify({ type: "service_account", ...sa, project_id: "x" }))).toEqual(sa);
    expect(() => parseServiceAccount("not json")).toThrow(/JSON key file/);
    expect(() => parseServiceAccount(JSON.stringify({ type: "authorized_user" }))).toThrow(/service account/);
  });

  it("signs the token request with RS256 and the read-only scope", () => {
    const jwt = signedAssertion(sa, 1_800_000_000);
    const [head, claims, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(head, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const v = createVerify("RSA-SHA256");
    v.update(`${head}.${claims}`);
    expect(v.verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("stores pages as site paths and merges duplicates", () => {
    expect(pathOf("https://zeronixtech.com/guides/x/")).toBe("/guides/x");
    expect(pathOf("https://www.zeronixtech.com/")).toBe("/");
    const rows = toSearchRows([
      { keys: ["2026-11-01", "https://zeronixtech.com/guides/x", "laptops for law firms", "are", "DESKTOP"], clicks: 2, impressions: 10, ctr: 0.2, position: 5 },
      { keys: ["2026-11-01", "https://zeronixtech.com/guides/x/", "laptops for law firms", "are", "DESKTOP"], clicks: 1, impressions: 30, ctr: 0.03, position: 9 },
    ]);
    expect(rows).toEqual([{ day: "2026-11-01", page: "/guides/x", query: "laptops for law firms", country: "ARE", device: "desktop", clicks: 3, impressions: 40, position: 8 }]);
  });
});

describe("checklist for company pages", async () => {
  vi.doMock("@/db", () => ({ db: {}, schema: {} }));
  const { seoChecks } = await import("@/lib/website/post-parse");
  vi.doUnmock("@/db");
  const base = { type: "page", slug: "privacy", title: "Privacy policy", metaTitle: "", metaDescription: "How we use information on zeronixtech.com: no cookies for analytics, details used only to answer your pricing or chat request.", excerpt: "", body: "## What we collect\n\n" + "word ".repeat(200) + "\n\n## Contact\n\nSee [contact](/contact) and [about](/about).", primaryKeyword: "", keywords: [], category: "", tags: [], industryId: null, categoryId: null, products: [], faq: [], schema: null, cover: null, ctaText: "", authorUserId: null, reviewNotes: "" } as const;

  it("does not ask a privacy page for a keyword, 1000 words, a cover or an FAQ", () => {
    const checks = seoChecks({ ...base, keywords: [], tags: [], products: [], faq: [] }, { known: new Set(["/contact", "/about"]), slugTaken: false });
    expect(checks.filter((c) => c.level !== "ok")).toEqual([]);
    expect(checks.map((c) => c.key)).not.toContain("faq");
  });

  it("still holds a guide to the full list", () => {
    const checks = seoChecks({ ...base, type: "guide", keywords: [], tags: [], products: [], faq: [] }, { known: new Set(["/contact", "/about"]), slugTaken: false });
    expect(checks.filter((c) => c.level !== "ok").map((c) => c.key)).toEqual(expect.arrayContaining(["keyword", "length", "cover", "faq"]));
  });
});
