import { describe, expect, it } from "vitest";
import { newBlock } from "@/lib/newsletter/blocks";
import { duplicateBlock, insertAfter, moveBlock, removeBlock, setField, setLinePart } from "@/lib/newsletter/doc-edit";
import { renderEmail } from "@/lib/newsletter/render";
import { TEMPLATES, withSamples } from "@/lib/newsletter/templates";
import { buildPrompt } from "@/lib/newsletter/prompt";
import type { NewsBrand, NewsDoc, RenderInput } from "@/lib/newsletter/types";

const brand: NewsBrand = { company: "Zeronix Tech LLC", address: "Office 1, Dubai, UAE", website: "zeronixtech.com", phone: "+971 4 000 0000", email: "sales@example.ae" };
const base = (doc: NewsDoc, over: Partial<RenderInput> = {}): RenderInput => ({ doc, subject: "S", preheader: "P", products: [], brand, logoSrc: "", firstName: "Sara", unsubUrl: "https://portal.example/unsubscribe/abc", reason: "", ...over });
const intro = TEMPLATES.find((t) => t.key === "intro")!.doc;

describe("doc edits", () => {
  const a = newBlock("text", { text: "A" });
  const b = newBlock("text", { text: "B" });
  const doc: NewsDoc = { ...intro, blocks: [a, b] };

  it("moves, inserts, duplicates and removes sections", () => {
    expect(moveBlock(doc, a.id, 1).blocks.map((x) => x.p.text)).toEqual(["B", "A"]);
    expect(moveBlock(doc, a.id, -1)).toBe(doc);
    const c = newBlock("heading", { text: "C" });
    expect(insertAfter(doc, a.id, c).blocks.map((x) => x.id)).toEqual([a.id, c.id, b.id]);
    expect(insertAfter(doc, null, c).blocks.at(-1)!.id).toBe(c.id);
    const d = duplicateBlock(doc, a.id);
    expect(d.doc.blocks).toHaveLength(3);
    expect(d.doc.blocks[1].id).toBe(d.id);
    expect(d.id).not.toBe(a.id);
    expect(removeBlock(doc, a.id).blocks).toHaveLength(1);
  });

  it("changes one text, and one part of one list line", () => {
    expect(setField(doc, { id: a.id, key: "text", idx: null, part: null, value: "New" }).blocks[0].p.text).toBe("New");
    expect(setLinePart("One | first\nTwo | second", 1, "title", "2nd")).toBe("One | first\n2nd | second");
    expect(setLinePart("One | first\n\nTwo | second", 1, "text", "x | y\nz")).toBe("One | first\nTwo | x y z");
    expect(setLinePart("One", 0, "text", "")).toBe("One");
  });
});

describe("editable preview", () => {
  it("marks typeable text and sections only in the editor preview", () => {
    const doc = withSamples(intro);
    const editor = renderEmail(base(doc, { edit: { selectedId: doc.blocks[0].id } })).html;
    expect(editor).toContain("data-nl-field=");
    expect(editor).toContain("data-nl-block=");
    expect(editor).toContain("<script>");
    const sent = renderEmail(base(doc)).html;
    expect(sent).not.toMatch(/data-nl-|<script|contenteditable|nl-root/);
  });

  it("keeps {name} as typed in the editor and fills it in sent mail", () => {
    const doc: NewsDoc = { ...intro, blocks: [newBlock("text", { text: "Hello {name}," })] };
    expect(renderEmail(base(doc, { edit: {} })).html).toContain("Hello {name},");
    expect(renderEmail(base(doc)).html).toContain("Hello Sara,");
  });

  it("shows a placeholder for an empty section so it can still be selected", () => {
    const doc: NewsDoc = { ...intro, blocks: [newBlock("callout", { text: "" })] };
    expect(renderEmail(base(doc, { edit: {} })).html).toContain("nothing to show yet");
    expect(renderEmail(base(doc)).html).not.toContain("nothing to show yet");
  });

  it("escapes the raw text it stores for editing", () => {
    const doc: NewsDoc = { ...intro, blocks: [newBlock("heading", { text: 'a"><img src=x onerror=alert(1)>' })] };
    const html = renderEmail(base(doc, { edit: {} })).html;
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("data-raw=\"a&quot;&gt;&lt;img src=x onerror=alert(1)&gt;\"");
  });
});

describe("AI prompt for pasted code", () => {
  it("names the company, the merge tags and the safety rules", () => {
    const p = buildPrompt(brand, "CCTV for warehouses", "");
    for (const part of ["Zeronix Tech LLC", "CCTV for warehouses", "{name}", "{unsubscribe_url}", "Office 1, Dubai, UAE", "600 px", "Outlook", "Do not invent prices"]) expect(p).toContain(part);
  });
});
