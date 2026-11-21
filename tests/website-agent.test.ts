import { describe, expect, it } from "vitest";
import type { SiteCategoryPage, SiteIndustryPage, SitePostPage, SiteProductPage } from "../website/src/lib/contract";
import {
  acceptsMarkdown,
  agentSkillText,
  apiCatalog,
  categoryMarkdown,
  htmlToMarkdown,
  industryMarkdown,
  linkHeader,
  markdownRoute,
  mcpTools,
  postMarkdown,
  productMarkdown,
  serverCard,
  skillIndex,
  tokenEstimate,
} from "../website/src/lib/agent";

/** website/SEO-AGENTIC.md: Markdown for agents, discovery files, the MCP server card and the tool list. */

describe("acceptsMarkdown", () => {
  it("is true when text/markdown is asked for and not outranked by html", () => {
    expect(acceptsMarkdown("text/markdown")).toBe(true);
    expect(acceptsMarkdown("text/markdown, text/html;q=0.9")).toBe(true);
    expect(acceptsMarkdown("text/html;q=0.8, text/markdown")).toBe(true);
  });
  it("is false for browsers, wildcards and equal weights listing html first", () => {
    expect(acceptsMarkdown(null)).toBe(false);
    expect(acceptsMarkdown("")).toBe(false);
    expect(acceptsMarkdown("text/html,application/xhtml+xml,*/*;q=0.8")).toBe(false);
    expect(acceptsMarkdown("*/*")).toBe(false);
    expect(acceptsMarkdown("text/html, text/markdown")).toBe(false);
    expect(acceptsMarkdown("text/markdown;q=0")).toBe(false);
  });
});

describe("markdownRoute", () => {
  it("maps site paths to what the Markdown handler should load", () => {
    expect(markdownRoute("/")).toEqual({ kind: "home" });
    expect(markdownRoute("/products")).toEqual({ kind: "categories" });
    expect(markdownRoute("/products/laptops")).toEqual({ kind: "category", slug: "laptops" });
    expect(markdownRoute("/products/laptops/hp-elitebook-840")).toEqual({ kind: "product", slug: "hp-elitebook-840", category: "laptops" });
    expect(markdownRoute("/industries")).toEqual({ kind: "industries" });
    expect(markdownRoute("/industries/legal")).toEqual({ kind: "industry", slug: "legal" });
    expect(markdownRoute("/brands/lenovo")).toEqual({ kind: "brand", slug: "lenovo" });
    expect(markdownRoute("/guides/best-laptops-for-lawyers")).toEqual({ kind: "post", slug: "best-laptops-for-lawyers", path: "/guides/best-laptops-for-lawyers" });
    expect(markdownRoute("/blog/x")).toEqual({ kind: "post", slug: "x", path: "/blog/x" });
    expect(markdownRoute("/services/it-support")).toEqual({ kind: "post", slug: "it-support", path: "/services/it-support" });
    expect(markdownRoute("/about")).toEqual({ kind: "post", slug: "about", path: "/about" });
  });
  it("accepts a .md suffix and a trailing slash", () => {
    expect(markdownRoute("/products/laptops.md")).toEqual({ kind: "category", slug: "laptops" });
    expect(markdownRoute("/guides/x/")).toEqual({ kind: "post", slug: "x", path: "/guides/x" });
    expect(markdownRoute("/index.md")).toEqual({ kind: "home" });
  });
  it("leaves application routes, files and deep paths alone", () => {
    for (const p of ["/api/products", "/cart", "/checkout", "/account", "/search", "/quote", "/contact", "/brand", "/mcp", "/md/x", "/_next/x", "/robots.txt", "/llms.txt", "/sitemap.xml", "/feed/google.xml", "/.well-known/api-catalog", "/products/a/b/c", "/compare/a-vs-b", "/media/12"]) {
      expect(markdownRoute(p), p).toBeNull();
    }
  });
});

describe("htmlToMarkdown", () => {
  it("keeps headings, links, emphasis and lists", () => {
    const md = htmlToMarkdown('<h2>Why <em>this</em></h2><p>See <a href="/products/laptops">laptops</a> and <a href="https://x.com/a">x</a>. <strong>Bold</strong>.</p><ul><li>One</li><li>Two &amp; three</li></ul>');
    expect(md).toContain("## Why _this_");
    expect(md).toContain("[laptops](https://zeronixtech.com/products/laptops)");
    expect(md).toContain("[x](https://x.com/a)");
    expect(md).toContain("**Bold**");
    expect(md).toContain("- One\n- Two & three");
  });
  it("keeps list items together even when each item wraps a paragraph", () => {
    expect(htmlToMarkdown("<ul><li><p>One</p></li><li><p>Two</p></li></ul><p>After</p>")).toBe("- One\n- Two\n\nAfter");
  });
  it("turns tables into Markdown tables", () => {
    const md = htmlToMarkdown("<table><thead><tr><th>Model</th><th>Price</th></tr></thead><tbody><tr><td>A</td><td>AED 1</td></tr><tr><td>B</td><td>AED 2</td></tr></tbody></table>");
    expect(md).toContain("| Model | Price |\n| --- | --- |\n| A | AED 1 |\n| B | AED 2 |");
  });
  it("drops scripts, styles and unknown tags", () => {
    const md = htmlToMarkdown("<style>p{}</style><script>alert(1)</script><div><span>Hello</span><img src=x></div>");
    expect(md).toBe("Hello");
  });
});

const product = (over: Partial<SiteProductPage> = {}): SiteProductPage => ({
  contract: 2,
  slug: "lenovo-x1-21v7006fus",
  name: "Lenovo ThinkPad X1 Carbon Gen 14",
  brand: "Lenovo",
  brandSlug: "lenovo",
  category: "Business laptops",
  categorySlug: "laptops",
  image: null,
  keySpecs: [],
  highlights: ["OLED screen"],
  priceMode: "public",
  price: "8689.00",
  currency: "AED",
  mpn: "21V7006FUS",
  availability: "in_stock",
  series: "ThinkPad X1 Carbon",
  summaryHtml: "",
  images: [],
  specGroups: [{ label: "Performance", rows: [{ key: "memory", label: "Memory", value: "32 GB" }] }],
  uaeAvailable: true,
  uae: {},
  sourceUrl: "",
  specsCheckedAt: null,
  pros: ["Light"],
  cons: [],
  faq: [{ q: "Is it OLED?", a: "Yes." }],
  bestFor: [],
  related: [],
  seo: {},
  ...over,
});

describe("productMarkdown", () => {
  it("states the facts an agent needs, with the canonical url", () => {
    const md = productMarkdown(product());
    expect(md).toContain("# Lenovo ThinkPad X1 Carbon Gen 14");
    expect(md).toContain("https://zeronixtech.com/products/laptops/lenovo-x1-21v7006fus");
    expect(md).toContain("Part number: 21V7006FUS");
    expect(md).toContain("AED 8,689 incl. 5% VAT");
    expect(md).toContain("| Memory | 32 GB |");
    expect(md).toContain("Is it OLED?");
    expect(md).toContain("/quote?product=lenovo-x1-21v7006fus");
  });
  it("never invents a price for price-on-request products", () => {
    const md = productMarkdown(product({ priceMode: "on_request", price: null }));
    expect(md).toContain("Price: on request");
    expect(md).not.toContain("AED 8,689");
  });
});

describe("catalog and post markdown", () => {
  it("lists a category's products with links", () => {
    const c = { contract: 2, slug: "laptops", name: "Business laptops", icon: "", summary: "For teams", image: null, brands: [], industries: [], products: [product()], introHtml: "<p>Choose by role.</p>", faq: [], seo: {} } as unknown as SiteCategoryPage;
    const md = categoryMarkdown(c);
    expect(md).toContain("# Business laptops");
    expect(md).toContain("[Lenovo ThinkPad X1 Carbon Gen 14](https://zeronixtech.com/products/laptops/lenovo-x1-21v7006fus)");
    expect(md).toContain("Choose by role.");
  });
  it("describes an industry with its roles", () => {
    const i = { contract: 2, slug: "legal", name: "Legal", icon: "", summary: "", image: null, heroTitle: "IT for law firms", introHtml: "", painPoints: ["Client files"], roles: [{ role: "Partner", needs: "Light laptop", categories: [] }], faq: [], products: [], seo: {} } as unknown as SiteIndustryPage;
    const md = industryMarkdown(i);
    expect(md).toContain("# IT for law firms");
    expect(md).toContain("Partner: Light laptop");
    expect(md).toContain("Client files");
  });
  it("renders a guide with byline, picks and faq", () => {
    const p = {
      contract: 2,
      slug: "g",
      type: "guide",
      path: "/guides/g",
      title: "Best laptops for lawyers",
      excerpt: "Short answer.",
      cover: null,
      category: "",
      industry: null,
      author: { slug: "a", name: "Ismail", jobTitle: "Founder" },
      publishedAt: "2026-11-01T00:00:00Z",
      readingMinutes: 5,
      updatedAt: "2026-11-05T00:00:00Z",
      blocks: [{ kind: "html", html: "<p>Body text.</p>" }, { kind: "cta", text: "Get pricing" }],
      toc: [],
      faq: [{ q: "Which?", a: "This one." }],
      picks: [{ ...product(), rank: 1, label: "Best overall", verdict: "Light and fast.", pros: [], cons: [] }],
      compare: [],
      keywords: [],
      ctaText: "",
      schema: null,
      seo: {},
      related: [],
    } as unknown as SitePostPage;
    const md = postMarkdown(p);
    expect(md).toContain("# Best laptops for lawyers");
    expect(md).toContain("By Ismail, Founder");
    expect(md).toContain("Updated 2026-11-05");
    expect(md).toContain("Body text.");
    expect(md).toContain("1. [Lenovo ThinkPad X1 Carbon Gen 14](https://zeronixtech.com/products/laptops/lenovo-x1-21v7006fus): Best overall. Light and fast.");
    expect(md).toContain("**Which?**");
  });
});

describe("helpers", () => {
  it("estimates tokens at about four characters each", () => {
    expect(tokenEstimate("a".repeat(400))).toBe(100);
    expect(tokenEstimate("")).toBe(0);
  });
  it("points agents at the sitemap, llms.txt and the api catalog in one Link header", () => {
    const h = linkHeader();
    expect(h).toContain('<https://zeronixtech.com/sitemap.xml>; rel="sitemap"');
    expect(h).toContain('<https://zeronixtech.com/llms.txt>; rel="describedby"; type="text/plain"');
    expect(h).toContain('<https://zeronixtech.com/.well-known/api-catalog>; rel="api-catalog"');
  });
});

describe("discovery documents", () => {
  it("api catalog is an RFC 9727 linkset", () => {
    const c = apiCatalog();
    expect(c.linkset[0].anchor).toBe("https://zeronixtech.com/mcp");
    expect(c.linkset[0]["service-desc"]?.[0]?.href).toBe("https://zeronixtech.com/.well-known/mcp/server-card.json");
  });
  it("server card names the endpoint and the tools", () => {
    const c = serverCard("Zeronix Tech");
    expect(c.serverInfo.name).toBe("zeronixtech");
    expect(c.transport.endpoint).toBe("/mcp");
    expect(c.capabilities.tools).toBeDefined();
    expect(c.tools.map((t) => t.name)).toEqual(mcpTools.map((t) => t.name));
  });
  it("tools have object schemas and the quote tool needs the user's confirmation", () => {
    for (const t of mcpTools) expect(t.inputSchema.type).toBe("object");
    const quote = mcpTools.find((t) => t.name === "request_quote")!;
    expect(quote.inputSchema.required).toContain("user_confirmed");
    expect(quote.description).toMatch(/explicit/i);
  });
  it("skill index lists the skill with a sha256 digest of its text", async () => {
    const idx = await skillIndex();
    const s = idx.skills[0];
    expect(s.type).toBe("skill-md");
    expect(s.url).toBe("/.well-known/agent-skills/buy-business-it/SKILL.md");
    expect(s.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const bytes = new TextEncoder().encode(agentSkillText("Zeronix Tech"));
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
    expect(s.digest).toBe(`sha256:${hash}`);
  });
  it("skill text has front matter and does not promise prices or stock", () => {
    const t = agentSkillText("Zeronix Tech");
    expect(t.startsWith("---\nname: buy-business-it\ndescription:")).toBe(true);
    expect(t).toMatch(/never (invent|guess)/i);
  });
});
