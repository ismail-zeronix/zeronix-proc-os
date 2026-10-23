import { describe, expect, it } from "vitest";
import { BLOCK_TYPES, blockLabel, blocksSchema, bullets, cloneBlock, defaultProposal, docText, headingNumbers, newBlock, para, richDoc, splitByPercent } from "@/lib/proposal";

describe("proposal blocks", () => {
  it("every kind of new block is valid", () => {
    const all = BLOCK_TYPES.map((t) => newBlock(t.key));
    expect(blocksSchema.safeParse(all).success).toBe(true);
  });

  const input = {
    typeKey: "cctv",
    typeLabel: "CCTV",
    dealTitle: "Villa in Ajman",
    requirement: "16 cameras\nalarm for 2 doors",
    customer: "Glance Star LLC",
    site: "Health Care City, Dubai",
    company: "Zeronix Technology LLC",
    boq: [
      { section: "Cameras", lines: [{ qty: 19, unit: "nos", description: "Hikvision 4MP dome camera", optional: false }, { qty: 1, unit: "nos", description: "PTZ", optional: true }] },
      { section: "Cabling", lines: [{ qty: 2, unit: "box", description: "Cat6 cable", optional: false }] },
      { section: "Empty", lines: [] },
    ],
  };

  it("the standard proposal follows Zeronix's layout and fills in the project", () => {
    const blocks = defaultProposal(input);
    expect(blocksSchema.safeParse(blocks).success).toBe(true);
    expect(blocks[0]).toMatchObject({ type: "cover", data: { title: "CCTV project proposal", subtitle: "Villa in Ajman", customerAddress: "" } });
    expect(blocks[1].type).toBe("quote_header");
    const headings = blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.data.text : ""));
    expect(headings).toEqual(["Introduction", "Scope of Work", "Proposed Solution", "Exclusions and Customer Responsibilities", "Deliverables", "Quotation", "Terms and Conditions"]);
    const intro = blocks.find((b) => b.type === "text" && docText(b.data.doc).includes("Glance Star LLC"));
    expect(intro && intro.type === "text" && docText(intro.data.doc)).toContain("Health Care City");
    // the proposed solution lists each section's firm items; optional and empty ones are left out
    const spec = blocks.find((b) => b.type === "table");
    expect(spec && spec.type === "table" && spec.data.style).toBe("spec");
    expect(spec && spec.type === "table" && spec.data.rows).toEqual([
      ["Cameras", "19 x Hikvision 4MP dome camera"],
      ["Cabling", "2 box Cat6 cable"],
      ["Services", "Installation, configuration, testing, commissioning and handover"],
    ]);
    expect(blocks.some((b) => b.type === "bank")).toBe(true);
    const terms = blocks.filter((b) => b.type === "text").map((b) => (b.type === "text" ? docText(b.data.doc, 3000) : "")).join(" ");
    expect(terms).toContain("valid for 14 days");
    expect(terms).toContain("property of Zeronix Technology LLC");
    expect(terms).toContain("Recording days");
    expect(blocks.at(-1)).toMatchObject({ type: "signature", data: { ourLabel: "For Zeronix Technology LLC" } });
  });

  it("numbers the main headings, leaving hand-numbered ones alone", () => {
    const blocks = defaultProposal(input);
    const nums = headingNumbers(blocks);
    const first = blocks.find((b) => b.type === "heading")!;
    expect(nums.get(first.id)).toBe(1);
    expect(nums.size).toBe(7);
    expect(headingNumbers([{ id: "a", type: "heading", data: { text: "1. Already", level: 1 } }, { id: "b", type: "heading", data: { text: "Next", level: 1 } }]).get("b")).toBe(1);
  });

  it("older proposals without the new fields still validate", () => {
    const old = [
      { id: "c", type: "cover", data: { title: "T", subtitle: "" } },
      { id: "t", type: "table", data: { header: true, rows: [["a"]] } },
    ];
    const parsed = blocksSchema.parse(old);
    expect(parsed[0]).toMatchObject({ data: { customerAddress: "" } });
    expect(parsed[1]).toMatchObject({ data: { style: "grid" } });
  });

  it("refuses repeated ids, unknown kinds, bad rich text and oversized documents", () => {
    const b = newBlock("heading");
    expect(blocksSchema.safeParse([b, b]).success).toBe(false);
    expect(blocksSchema.safeParse([{ id: "x", type: "script", data: {} }]).success).toBe(false);
    expect(blocksSchema.safeParse([{ id: "x", type: "text", data: { style: "plain", doc: { type: "html", content: [] } } }]).success).toBe(false);
    const huge = { ...newBlock("table"), data: { header: false, rows: Array.from({ length: 100 }, () => Array(8).fill("x".repeat(1000))) } };
    expect(blocksSchema.safeParse([huge]).success).toBe(false);
  });

  it("a copy gets a new id", () => {
    const b = newBlock("text");
    const c = cloneBlock(b);
    expect(c.id).not.toBe(b.id);
    expect(c.data).toEqual(b.data);
  });

  it("names blocks for the outline", () => {
    expect(blockLabel({ ...newBlock("heading"), data: { text: "Scope of work", level: 1 } } as never)).toBe("Scope of work");
    expect(blockLabel(newBlock("page_break"))).toBe("Page break");
    expect(blockLabel({ id: "t", type: "text", data: { style: "plain", doc: richDoc(para("Hello ", { text: "there", bold: true }), bullets("one", "two")) } })).toBe("Hello there one two");
  });
});

describe("splitByPercent", () => {
  it("adds up exactly to the total when the shares make 100%", () => {
    const parts = splitByPercent(16821, [50, 40, 10]);
    expect(parts).toEqual([8410.5, 6728.4, 1682.1]);
    expect(parts.reduce((s, p) => s + p, 0)).toBeCloseTo(16821, 2);
    const odd = splitByPercent(1000, [33.33, 33.33, 33.34]);
    expect(Math.round(odd.reduce((s, p) => s + p, 0) * 100)).toBe(100000);
  });

  it("does not force a schedule that is not 100% to the total", () => {
    expect(splitByPercent(1000, [50, 40])).toEqual([500, 400]);
  });
});
