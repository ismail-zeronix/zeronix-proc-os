import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { completeItem, llmOutJsonSchema, parsePrice } from "@/lib/llm/schema";
import { PRICE_LINE_RE, toBatches, toBlocks } from "@/lib/parse/chunk";
import { compatible, cpuToken, matchKey } from "@/lib/parse/match";
import { toDraft } from "@/lib/parse/postfix";
import { detectSupplierName, preclean } from "@/lib/parse/preclean";
import { searchTerms } from "@/lib/search";

const sample = readFileSync("tests/fixtures/aman-star-2026-10-19.txt", "utf8");

describe("preclean", () => {
  it("strips WhatsApp formatting, emojis and trademarks", () => {
    expect(preclean("🎊 *HP ProBook 440 G11* 🎊")).toBe("HP ProBook 440 G11");
    expect(preclean("Core™️ i5-13420H | *8GB*  | 512GB")).toBe("Core i5-13420H | 8GB | 512GB");
    expect(preclean("Intel *Core i3-N305* | 8GB")).toBe("Intel Core i3-N305 | 8GB");
  });

  it("detects the supplier signature", () => {
    expect(detectSupplierName(sample)).toBe("Aman Star IT DXB");
    expect(detectSupplierName("HP 250 G10 @1500")).toBeNull();
  });
});

describe("chunking", () => {
  const blocks = toBlocks(sample);

  it("finds one block per product and skips headings and signature", () => {
    expect(blocks).toHaveLength(23);
    expect(blocks[0].text).toContain("FM0013DX");
    expect(blocks.some((b) => /Supplier/i.test(b.text))).toBe(false);
    expect(blocks.some((b) => /Limited Stocks/i.test(b.text))).toBe(false);
  });

  it("carries the section heading as a category hint", () => {
    const tower = blocks.find((b) => b.text.includes("QCT1250"))!;
    expect(tower.section).toBe("Desktops");
    expect(blocks[0].section).toBeNull();
  });

  it("batches blocks to keep each LLM call small", () => {
    const batches = toBatches(blocks);
    expect(batches.length).toBe(3);
    expect(batches.flatMap((b) => b.blocks)).toHaveLength(23);
  });

  it("splits a long list that has no blank lines after each price", () => {
    const lines = Array.from({ length: 30 }, (_, i) => [`HP 250 G${i}`, `i5 | 8GB | 512GB`, `@${1500 + i}/-`]).flat();
    const b = toBlocks(lines.join("\n"));
    expect(b.length).toBeGreaterThanOrEqual(10);
    expect(b.every((x) => PRICE_LINE_RE.test(x.text))).toBe(true);
  });
});

describe("prices", () => {
  it("recognises the usual WhatsApp price notations", () => {
    for (const s of ["@2850/-", "AED 1,500", "1500/-", "Price: 2100", "$450", "2,150 AED"]) {
      expect(PRICE_LINE_RE.test(s), s).toBe(true);
    }
    expect(PRICE_LINE_RE.test("Core i5-13420H | 8GB | 512GB")).toBe(false);
    expect(parsePrice("@2,850/-")).toBe(2850);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice(3800)).toBe(3800);
  });
});

describe("post-processing", () => {
  const base = {
    block: 0, category: "laptop", brand: "hp", model_name: "HP OmniBook X Flip 14 FM0013DX",
    part_number: "fm0013dx", cpu: "Core Ultra 5 226V", ram: "16GB", storage: "512GB SSD",
    display: "", gpu: "", os: "Win11 Home", extras: "", price: 2850 as number | string | null,
  };
  const block = { index: 0, text: "HP Omni Book X Flip 2-in-1 14 - FM0013DX\nUltra 5 226V | 16GB RAM | 512GB SSD\n@2850/-", section: null };

  it("normalises brand, part number, RAM and model name", () => {
    const d = toDraft(completeItem(base, block.text), block, 0);
    expect(d.brand).toBe("HP");
    expect(d.partNumber).toBe("FM0013DX");
    expect(d.modelName).toBe("OmniBook X Flip 14");
    expect(d.ramGb).toBe(16);
    expect(d.currency).toBe("AED");
    expect(d.flags).toEqual([]);
  });

  it("restores a part number the model split into model + code", () => {
    const b = { index: 0, text: "HP laptop 15-FD0130WM\nIntel Core i3-N305 | 8GB | 256GB\n@1650/-", section: null };
    const d = toDraft(completeItem({ ...base, model_name: "Laptop 15", part_number: "FD0130WM", price: 1650 }, b.text), b, 0);
    expect(d.partNumber).toBe("15-FD0130WM");
    expect(d.modelName).toBe("Laptop");
  });

  it("flags impossible storage and a price that is not in the text", () => {
    const d = toDraft(completeItem({ ...base, storage: "512TB SSD", price: 9999 }, block.text), block, 0);
    expect(d.flags.join(" ")).toMatch(/Storage looks wrong/);
    expect(d.flags.join(" ")).toMatch(/Price not found/);
    expect(d.confidence).toBeLessThan(0.7);
  });

  it("flags a missing price when the text has one", () => {
    const d = toDraft(completeItem({ ...base, price: null }, block.text), block, 0);
    expect(d.flags.join(" ")).toMatch(/contain a price/);
  });

  it("detects currency, condition and stock by rules", () => {
    const it = completeItem(base, "Refurb HP 840 G8 i5 8/256 USD 210 5 pcs");
    expect(it.currency).toBe("USD");
    expect(it.condition).toBe("refurbished");
    expect(it.stock_note).toBe("5 pcs");
  });

  it("asks the model for a grammar-constrained object", () => {
    expect((llmOutJsonSchema as { type: string }).type).toBe("object");
  });
});

describe("matching", () => {
  it("extracts the CPU model number", () => {
    expect(cpuToken("Core i5-13420H")).toBe("13420h");
    expect(cpuToken("Core Ultra 5 226V")).toBe("226v");
    expect(cpuToken("Core i3-N305")).toBe("n305");
    expect(cpuToken("Core Ultra 7")).toBe("");
  });

  it("keeps different configurations of a family code apart", () => {
    const a = { brand: "Lenovo", partNumber: "15IRH10", modelName: "IdeaPad Slim 3", cpu: "Core i5-13420H", ramGb: 8, storage: "512GB" };
    const b = { ...a, cpu: "Core i7-13620H", ramGb: 16 };
    expect(matchKey(a)).not.toBe(matchKey(b));
    expect(compatible(a, b)).toBe(false);
  });

  it("treats a vaguer quote of the same SKU as compatible", () => {
    expect(compatible({ cpu: "Core Ultra 7 256V", ramGb: 16 }, { cpu: "U7", ramGb: 16 })).toBe(true);
    expect(compatible({ cpu: "Core Ultra 7 256V", ramGb: 16 }, { cpu: "", ramGb: null })).toBe(true);
  });

  it("builds a key without part number from model + specs", () => {
    expect(matchKey({ brand: "Lenovo", partNumber: "", modelName: "V15 Gen 5", cpu: "i5-13420H", ramGb: 16, storage: "512GB" })).toBe(
      "lenovo|v15gen5|13420h|16|512gb",
    );
  });
});

describe("search terms", () => {
  it("joins short numbers to the word before them", () => {
    expect(searchTerms("core 7 150u")).toEqual(["core7", "150u"]);
    expect(searchTerms("Ultra 7  16GB")).toEqual(["ultra7", "16gb"]);
    expect(searchTerms("i5-13420H")).toEqual(["i513420h"]);
    expect(searchTerms("15-FD0130WM")).toEqual(["15fd0130wm"]);
  });
});
