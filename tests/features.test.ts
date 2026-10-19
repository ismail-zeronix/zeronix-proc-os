import { describe, expect, it } from "vitest";
import { offersToCsv, quoteText } from "@/lib/export";
import type { LlmProvider } from "@/lib/llm/provider";
import type { OfferDraft } from "@/lib/llm/schema";
import { preclean } from "@/lib/parse/preclean";
import { blockCacheKey, parsePriceList } from "@/lib/parse/pipeline";
import { toDraft } from "@/lib/parse/postfix";
import { likelyPriceLists, looksLikeChatExport, parseChatExport } from "@/lib/parse/whatsapp";
import { searchParamsFrom, type ProductHit } from "@/lib/search";

const ANDROID = `19/10/2026, 09:01 - Messages and calls are end-to-end encrypted.
19/10/2026, 09:05 - Aman Star: Good morning
19/10/2026, 10:32 - Aman Star: *Desktops*
HP 290 G9 | i5 | 8GB | 256GB @1500/-
Lenovo V15 | i3 | 8GB | 256GB @1200/-
Dell Vostro | i7 | 16GB | 512GB @2400/-
20/10/2026, 08:00 - Aman Star: <Media omitted>`;

describe("WhatsApp chat export", () => {
  it("splits messages, joins continuation lines and drops system/media lines", () => {
    expect(looksLikeChatExport(ANDROID)).toBe(true);
    const msgs = parseChatExport(ANDROID);
    expect(msgs).toHaveLength(2);
    expect(msgs[1].sender).toBe("Aman Star");
    expect(msgs[1].at).toBe("2026-10-19T10:32");
    expect(msgs[1].text.split("\n")).toHaveLength(4);
    expect(likelyPriceLists(msgs)).toEqual([msgs[1]]);
  });

  it("reads iOS and web-copy formats, 12-hour clock and month-first dates", () => {
    const ios = parseChatExport("[19/10/26, 10:32:15] Sam: HP 250 @1500/-\n[19/10/26, 10:33:00] Sam: ok");
    expect(ios[0].at).toBe("2026-10-19T10:32");
    const web = parseChatExport("[10:32, 19/10/2026] Sam: HP 250 @1500/-");
    expect(web[0].at).toBe("2026-10-19T10:32");
    const us = parseChatExport("10/19/2026, 9:05 PM - Sam: hi\n10/20/2026, 9:05 AM - Sam: yo");
    expect(us[0].at).toBe("2026-10-19T21:05");
    expect(us[1].at).toBe("2026-10-20T09:05");
  });

  it("strips the copy-paste prefix before cleaning", () => {
    expect(preclean("[10:32, 19/10/2026] Aman Star: *HP 250 G10* | 8GB")).toBe("HP 250 G10 | 8GB");
    expect(preclean("19/10/2026, 10:32 - Aman Star: HP 250")).toBe("HP 250");
    expect(preclean("HP ProBook 440 G11 | 16GB | 512GB")).toBe("HP ProBook 440 G11 | 16GB | 512GB");
  });
});

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

describe("reusing reviewed rows", () => {
  const list = `HP 250 G10 | i5 | 8GB | 256GB\n@1500/-\n\nLenovo V15 | i3 | 8GB | 256GB\n@1200/-\n\nDell Vostro 3520 | i7 | 16GB\n@2400/-`;
  const item = (block: number, brand: string, model: string, price: number) => ({
    block, category: "laptop" as const, brand, model_name: model, part_number: "", cpu: "", ram: "8GB", storage: "",
    display: "", gpu: "", os: "", extras: "", price,
  });

  it("skips the AI for blocks that were already reviewed and keeps list order", async () => {
    const calls: string[] = [];
    const llm: LlmProvider = {
      name: "fake", model: "fake", health: async () => ({ ok: true, detail: "" }),
      extractJson: async (req) => {
        const user = req.messages.at(-1)!.content;
        calls.push(user);
        return { items: [item(0, "Lenovo", "V15", 1200)] };
      },
    };
    // the reviewer already confirmed blocks 0 and 2 on an earlier list
    const reviewed = (brand: string, model: string, raw: string, price: number): OfferDraft => ({
      ...toDraft({ ...item(0, brand, model, price), condition: "new", currency: "AED", stock_note: "" }, { index: 0, text: raw, section: null }, 0),
      include: false,
    });
    const known = new Map<string, OfferDraft[]>([
      [blockCacheKey("HP 250 G10 | i5 | 8GB | 256GB\n@1500/-"), [reviewed("HP", "250 G10", "HP 250 G10 | i5 | 8GB | 256GB\n@1500/-", 1500)]],
      [blockCacheKey("Dell  Vostro 3520 | i7 | 16GB\n@2400/-"), [reviewed("Dell", "Vostro 3520", "Dell Vostro 3520 | i7 | 16GB\n@2400/-", 2400)]],
    ]);

    let reusedBlocks = -1;
    const drafts = await parsePriceList(list, { llm, known, onReused: (n) => void (reusedBlocks = n) });

    expect(reusedBlocks).toBe(2);
    expect(calls).toHaveLength(1); // only the Lenovo block went to the model
    expect(calls[0]).toContain("Lenovo V15");
    expect(calls[0]).not.toContain("HP 250");
    expect(drafts.map((d) => d.brand)).toEqual(["HP", "Lenovo", "Dell"]);
    expect(drafts[0].include).toBe(false); // the reviewer's decision is kept
    expect(drafts[0].flags).toEqual([]);
    expect(drafts[0].productId).toBeNull(); // product matching is redone for the new list
  });
});
