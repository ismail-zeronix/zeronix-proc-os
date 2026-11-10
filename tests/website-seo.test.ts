import { describe, expect, it } from "vitest";
import { addSpend, budgetAllows, cleanKeyword, gapRows, hostOf, mondayOf, parseDomains, parseRanked, parseSerp, parseVolumes, shareOfTop, taskResult, type DfsResponse } from "@/lib/website/dataforseo-core";
import type { SiteLlmsResponse, SiteProductPage } from "../website/src/lib/contract";
import { feedId, feedItems, merchantFeed } from "../website/src/lib/merchant-feed";
import { aboutModel, categoryTitle, partRegion, productDescription, productFaq, productTitle, shortName } from "../website/src/lib/product-copy";
import { readableHours, siteJsonLd } from "../website/src/lib/seo";

/** website/SEO-STRATEGY.md: product copy, the Merchant feed, the local-business schema and the DataForSEO helpers. */

const product = (over: Partial<SiteProductPage> = {}): SiteProductPage => ({
  contract: 2,
  slug: "lenovo-thinkpad-x1-carbon-gen-14-aura-edition-21v7006fus",
  name: "Lenovo ThinkPad X1 Carbon Gen 14 Aura Edition, Core Ultra 7 268V, 32GB RAM, 1TB SSD, 14\" 2.8K OLED",
  brand: "Lenovo",
  brandSlug: "lenovo",
  category: "Business laptops",
  categorySlug: "laptops",
  image: { src: "/media/1", alt: "x" },
  keySpecs: ["Core Ultra 7 268V", "32GB", "1TB SSD"],
  highlights: [],
  priceMode: "public",
  price: "8689.00",
  currency: "AED",
  mpn: "21V7006FUS",
  availability: "in_stock",
  series: "ThinkPad X1 Carbon",
  summaryHtml: "",
  images: [],
  specGroups: [
    {
      label: "Performance",
      rows: [
        { key: "processor", label: "Processor", value: "Intel Core Ultra 7 268V" },
        { key: "memory", label: "Memory", value: "32 GB" },
        { key: "storage", label: "Storage", value: "1 TB SSD" },
        { key: "graphics", label: "Graphics", value: "Intel Graphics" },
      ],
    },
  ],
  uaeAvailable: true,
  uae: {},
  sourceUrl: "",
  specsCheckedAt: null,
  pros: [],
  cons: [],
  faq: [],
  bestFor: [{ industrySlug: "legal", industry: "Legal", role: "Partners", label: "" }],
  related: [],
  seo: {},
  ...over,
});

describe("product copy", () => {
  it("keeps the search title under 60 characters with the part number", () => {
    const t = productTitle(product());
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t).toContain("21V7006FUS");
    expect(t).toContain("Price in UAE");
    expect(productTitle(product({ seo: { title: "Own title" } }))).toBe("Own title");
    // no series name (most imported products): the model name is cut at a word so the part number still fits
    expect(productTitle(product({ series: "" }))).toBe("Lenovo ThinkPad X1 Carbon Gen 14 21V7006FUS Price in UAE");
  });

  it("names the model without the spec tail", () => {
    expect(shortName(product())).toBe("Lenovo ThinkPad X1 Carbon Gen 14 Aura Edition");
    expect(shortName({ name: "EliteBook 840 G11, i7", brand: "HP", series: "" })).toBe("HP EliteBook 840 G11");
  });

  it("writes a meta description under 155 characters with the price", () => {
    const d = productDescription(product());
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d).toContain("AED 8,689 incl. VAT");
    expect(productDescription(product({ priceMode: "on_request", price: null }))).toContain("B2B price on request");
  });

  it("tells Middle East from US part numbers", () => {
    expect(partRegion("21V7006FUS")).toBe("us");
    expect(partRegion("A1BC2EA#ABV")).toBe("me");
    expect(partRegion("85D04EA#BH5")).toBe("me");
    expect(partRegion("D4JK5UA#ABA")).toBe("us");
    expect(partRegion("XYZ123")).toBe("");
  });

  it("writes About blocks without inventing a warranty", () => {
    const blocks = aboutModel(product());
    const text = blocks.map((b) => b.text).join(" ");
    expect(blocks.map((b) => b.heading)).toEqual(["Who it suits", "The specs in plain words", "Buying it for a team in the UAE", "Price, delivery and invoice"]);
    expect(text).toContain("US-market configuration");
    expect(text).toContain("partners in legal");
    expect(text).not.toMatch(/Warranty:/);
    expect(text.split(/\s+/).length).toBeGreaterThan(110);
    const withNote = aboutModel(product({ brandWarrantyNote: "1 year Lenovo Middle East warranty", store: { deliveryFee: 0, freeAbove: 0, returnDays: 7 } })).map((b) => b.text).join(" ");
    expect(withNote).toContain("Warranty: 1 year Lenovo Middle East warranty.");
    expect(withNote).toContain("Delivery is free to all seven emirates");
  });

  it("only asks FAQ questions the data can answer, and keeps an editor's FAQ", () => {
    const qs = productFaq(product()).map((f) => f.q);
    expect(qs.some((q) => /warranty/i.test(q))).toBe(false);
    expect(qs.some((q) => /price/i.test(q))).toBe(true);
    expect(productFaq(product({ uae: { warranty: "3 years on-site" } })).some((f) => f.a === "3 years on-site")).toBe(true);
    expect(productFaq(product({ faq: [{ q: "Own?", a: "Yes" }] }))).toEqual([{ q: "Own?", a: "Yes" }]);
  });

  it("never titles a category 'business laptops for business'", () => {
    expect(categoryTitle("Business laptops", ["HP", "Lenovo", "Dell"])).toBe("Business laptops in the UAE: HP, Lenovo, Dell");
    expect(categoryTitle("Business laptops", ["HP", "Lenovo", "Microsoft"])).toBe("Business laptops in the UAE: HP, Lenovo");
    expect(categoryTitle("Monitors", [])).toBe("Monitors for business in the UAE");
    expect(categoryTitle("Business laptops", ["HP", "Lenovo"]).length).toBeLessThanOrEqual(45);
  });
});

describe("Merchant Center feed", () => {
  const p = (over: Partial<SiteLlmsResponse["products"][number]> = {}): SiteLlmsResponse["products"][number] => ({
    ...product(),
    path: "/products/laptops/x",
    updatedAt: "2026-11-01T00:00:00Z",
    ...over,
  });

  it("lists only priced, pictured products we can promise", () => {
    const list = [p(), p({ slug: "a", priceMode: "on_request", price: null }), p({ slug: "b", image: null }), p({ slug: "c", availability: "on_order" })];
    expect(feedItems(list).map((x) => x.slug)).toEqual([product().slug]);
  });

  it("writes valid item fields and escapes text", () => {
    const xml = merchantFeed([p({ name: 'HP 14" & more' })], { url: "https://zeronixtech.com", name: "Zeronix Tech", tagline: "x" });
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<g:price>8689.00 AED</g:price>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).toContain("<g:google_product_category>Electronics &gt; Computers &gt; Laptops</g:google_product_category>");
    expect(xml).toContain("HP 14&quot; &amp; more");
    expect(xml).not.toContain("identifier_exists");
    expect(merchantFeed([p({ mpn: "" })], { url: "u", name: "n", tagline: "t" })).toContain("<g:identifier_exists>no</g:identifier_exists>");
  });

  it("keeps ids at 50 characters, stable and distinct", () => {
    const long = "lenovo-thinkpad-x1-carbon-gen-14-aura-edition-21v7006fus";
    expect(feedId(long).length).toBeLessThanOrEqual(50);
    expect(feedId(long)).toBe(feedId(long));
    expect(feedId(long)).not.toBe(feedId(`${long}-2`));
    expect(feedId("short")).toBe("short");
  });
});

describe("local business schema", () => {
  const brand = { name: "Zeronix Tech", tagline: "t", subline: "", email: "", phone: "", whatsapp: "", address: "Bur Dubai", ctaLabel: "x" };

  it("becomes a ComputerStore only once hours or a map link are set", () => {
    const org = (b: typeof brand & { hours?: string; mapUrl?: string }) => (siteJsonLd(b)["@graph"][0] as { "@type": string[]; openingHours?: string[]; hasMap?: string });
    expect(org(brand)["@type"]).not.toContain("ComputerStore");
    const local = org({ ...brand, hours: "Mo-Sa 09:00-19:00", mapUrl: "https://maps.app.goo.gl/x" });
    expect(local["@type"]).toContain("ComputerStore");
    expect(local.openingHours).toEqual(["Mo-Sa 09:00-19:00"]);
    expect(local.hasMap).toBe("https://maps.app.goo.gl/x");
  });

  it("shows hours the way people read them", () => {
    expect(readableHours("Mo-Sa 09:00-19:00")).toBe("Mon–Sat 09:00–19:00");
  });
});

describe("DataForSEO helpers", () => {
  const ok = (result: unknown[], cost = 0.002): DfsResponse => ({ status_code: 20000, cost, tasks: [{ status_code: 20000, result }] });

  it("guards the monthly budget", () => {
    const s = { budgetUsd: 1, spend: { month: "2026-11", usd: 0.995 } };
    expect(budgetAllows(s, "2026-11", "serp")).toBe(false);
    expect(budgetAllows(s, "2026-12", "serp")).toBe(true); // a new month starts at zero
    expect(budgetAllows({ ...s, budgetUsd: 0 }, "2026-12", "test")).toBe(false); // 0 = switched off
    expect(addSpend(s, "2026-11", 0.004)).toEqual({ month: "2026-11", usd: 0.999 });
    expect(addSpend(s, "2026-12", 0.004)).toEqual({ month: "2026-12", usd: 0.004 });
  });

  it("cleans keywords and domains", () => {
    expect(cleanKeyword("  Best LAPTOPS for law firms (UAE)! ")).toBe("best laptops for law firms uae");
    expect(cleanKeyword("a b c d e f g h i j k")).toBeNull();
    expect(hostOf("https://www.irix.ae/x")).toBe("irix.ae");
    expect(parseDomains("https://uae.microless.com\nirix.ae, irix.ae  not-a-domain")).toEqual(["uae.microless.com", "irix.ae"]);
    expect(mondayOf("2026-11-11")).toBe("2026-11-09");
  });

  it("reads volumes, positions and ranked keywords", () => {
    expect(parseVolumes(ok([{ keyword: "Business Laptops UAE", search_volume: 320 }]))).toEqual([{ keyword: "business laptops uae", volume: 320 }]);
    const serp = parseSerp(
      ok([
        {
          items: [
            { type: "paid", rank_group: 1, domain: "ads.com", url: "https://ads.com" },
            { type: "organic", rank_group: 1, domain: "www.microless.com", url: "https://www.microless.com/a" },
            { type: "organic", rank_group: 2, domain: "zeronixtech.com", url: "https://zeronixtech.com/products/laptops" },
          ],
        },
      ]),
      "zeronixtech.com",
    );
    expect(serp.position).toBe(2);
    expect(serp.url).toBe("https://zeronixtech.com/products/laptops");
    expect(serp.top.map((t) => t.domain)).toEqual(["microless.com", "zeronixtech.com"]);
    expect(parseSerp({ status_code: 20000, tasks: [{ status_code: 40102, result: null }] }, "zeronixtech.com").position).toBeNull();
    const ranked = parseRanked(ok([{ items: [{ keyword_data: { keyword: "HP ProBook price", keyword_info: { search_volume: 90 } }, ranked_serp_element: { serp_item: { rank_group: 4, url: "https://irix.ae/p" } } }] }]));
    expect(ranked).toEqual([{ keyword: "hp probook price", volume: 90, position: 4, url: "https://irix.ae/p" }]);
  });

  it("throws DataForSEO's own message on errors", () => {
    expect(() => taskResult({ status_code: 40100, status_message: "You are not authorized" })).toThrow("You are not authorized");
    expect(() => taskResult({ status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid Field" }] })).toThrow("Invalid Field");
  });

  it("builds the gap without our own or planned searches, most searched first", () => {
    const rows = gapRows(
      new Map([
        ["irix.ae", [{ keyword: "laptop supplier dubai", volume: 50, position: 3, url: "" }, { keyword: "ours", volume: 999, position: 1, url: "" }]],
        ["axhubs.com", [{ keyword: "laptop supplier dubai", volume: 50, position: 7, url: "" }, { keyword: "bulk laptops uae", volume: 200, position: 9, url: "" }]],
      ]),
      new Set(["ours"]),
    );
    expect(rows.map((r) => r.keyword)).toEqual(["bulk laptops uae", "laptop supplier dubai"]);
    expect(rows[1].competitors).toEqual([
      { domain: "irix.ae", position: 3 },
      { domain: "axhubs.com", position: 7 },
    ]);
  });

  it("counts who sits in the top ten", () => {
    const share = shareOfTop([{ top: [{ domain: "irix.ae" }, { domain: "zeronixtech.com" }] }, { top: [{ domain: "irix.ae" }] }], "zeronixtech.com");
    expect(share[0]).toEqual({ domain: "irix.ae", count: 2, share: 1 });
    expect(share[1].domain).toBe("zeronixtech.com (us)");
  });
});
