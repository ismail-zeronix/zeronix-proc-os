import { describe, expect, it } from "vitest";
import { offersToCsv, quoteText } from "@/lib/export";
import { searchParamsFrom, type ProductHit } from "@/lib/search";
import { DEFAULT_SHARE_FOOTER, parseTypedPrice, shareText } from "@/lib/share-price";

const hit = (over: Partial<ProductHit> = {}): ProductHit => ({
  id: 1, label: "HP 250 G10", brand: "HP", modelName: "250 G10", partNumber: "", category: "laptop",
  specSummary: "i5 · 8GB", bestPrice: 1500, bestCurrency: "AED", bestOfferId: 1, worstPrice: 1700, latestAt: "2026-10-19T00:00:00Z",
  offers: [
    { id: 1, supplierId: 1, supplierName: "Aman", supplierType: "market", price: 1500, currency: "AED", priceAed: 1500, priceBasis: "", prevPrice: 1600, receivedAt: "2026-10-19T00:00:00Z",
      stockNote: "", cpu: "i5", ramGb: 8, storage: "", display: "", gpu: "", os: "", extras: "", condition: "new", rawText: "", priceListId: 1, stale: false },
    { id: 2, supplierId: 2, supplierName: "=cmd|' /C calc'!A0", supplierType: "distributor", price: 1700, currency: "AED", priceAed: 1700, priceBasis: "FOB JA", prevPrice: null, receivedAt: "2026-10-18T00:00:00Z",
      stockNote: "", cpu: "", ramGb: null, storage: "", display: "", gpu: "", os: "", extras: "", condition: "new", rawText: "", priceListId: 2, stale: false },
  ],
  ...over,
});

describe("export", () => {
  it("writes an Excel-safe CSV with the diff against the best price", () => {
    const csv = offersToCsv([hit()]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Aman,Market trader,1500,AED,,1500,1500,0");
    expect(lines[2]).toContain("Distributor,1700,AED,FOB JA,1700,1500,200");
  });

  it("neutralises spreadsheet formulas coming from supplier text", () => {
    // a leading apostrophe makes Excel treat the cell as text instead of running it
    expect(offersToCsv([hit()])).toContain(",'=cmd|' /C calc'!A0,Distributor,1700");
  });

  it("builds a pasteable quote", () => {
    const q = quoteText(hit(), 14);
    expect(q).toContain("Best: Aman: AED 1,500");
    expect(q).toContain("=cmd|' /C calc'!A0: AED 1,700 FOB JA");
  });
});

describe("search params", () => {
  it("parses filters and ignores unknown sort keys", () => {
    const p = searchParamsFrom(new URLSearchParams("q=probook&supplier=3&sort=spread&priced=1&limit=9999"));
    expect(p).toMatchObject({ q: "probook", supplierId: 3, sort: "spread", pricedOnly: true, limit: 300 });
    expect(searchParamsFrom(new URLSearchParams("sort=drop table")).sort).toBeUndefined();
  });
});

describe("share price", () => {
  const lines = [
    { label: "Dell Latitude 5450", specs: "i7 · 16GB · 512GB SSD", price: 2200, stock: "Ready stock" },
    { label: "HP *27* Monitor", specs: "", price: 760.5, stock: "" },
  ];

  it("writes one block per product with our price, then the last line", () => {
    const t = shareText(lines, { showSpecs: true, showStock: true, currency: "AED", footer: DEFAULT_SHARE_FOOTER });
    expect(t).toBe(`*Dell Latitude 5450*\ni7 · 16GB · 512GB SSD\nAED 2,200 · Ready stock\n\n*HP 27 Monitor*\nAED 760.5\n\n${DEFAULT_SHARE_FOOTER}`);
  });

  it("leaves out specs, stock and an empty last line when asked", () => {
    expect(shareText(lines.slice(0, 1), { showSpecs: false, showStock: false, currency: "AED", footer: " " })).toBe("*Dell Latitude 5450*\nAED 2,200");
  });

  it("never carries supplier data: it only knows the lines it is given", () => {
    const t = shareText([{ ...lines[0], price: 2200 }], { showSpecs: true, showStock: true, currency: "AED", footer: "" });
    expect(t).not.toMatch(/Aman|supplier|1,500/i);
  });

  it("reads typed prices", () => {
    expect(parseTypedPrice("2,200")).toBe(2200);
    expect(parseTypedPrice("AED 2200.50")).toBe(2200.5);
    expect(parseTypedPrice("")).toBeNull();
    expect(parseTypedPrice("0")).toBeNull();
    expect(parseTypedPrice("abc")).toBeNull();
  });
});
