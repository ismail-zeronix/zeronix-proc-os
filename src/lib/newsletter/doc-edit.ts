import { blockDef, blockId } from "./blocks";
import type { Block, NewsDoc } from "./types";

/** Small pure changes to a newsletter design, used by the editor's canvas and toolbar. */

/** Changes one part (title or text) of one "Title | text" line. Lines are counted the way the renderer counts them: blank lines do not count. */
export function setLinePart(lines: string, idx: number, part: "title" | "text", value: string): string {
  const rows = lines
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [t, ...rest] = l.split("|");
      return { title: t.trim(), text: rest.join("|").trim() };
    });
  const clean = value.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim();
  if (rows[idx]) rows[idx][part] = clean;
  return rows.map((r) => (r.text ? `${r.title} | ${r.text}` : r.title)).join("\n");
}

/** What the canvas reports when someone types into a text. */
export interface FieldChange {
  id: string;
  key: string;
  idx: number | null;
  part: string | null;
  value: string;
}

export function setField(doc: NewsDoc, m: FieldChange): NewsDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (b.id !== m.id) return b;
      if (m.key === "lines" && m.idx !== null && (m.part === "title" || m.part === "text")) return { ...b, p: { ...b.p, lines: setLinePart(b.p.lines ?? blockDef(b.type).defaults.lines ?? "", m.idx, m.part, m.value) } };
      return { ...b, p: { ...b.p, [m.key]: m.value } };
    }),
  };
}

export function moveBlock(doc: NewsDoc, id: string, dir: -1 | 1): NewsDoc {
  const i = doc.blocks.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= doc.blocks.length) return doc;
  const blocks = [...doc.blocks];
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  return { ...doc, blocks };
}

export function removeBlock(doc: NewsDoc, id: string): NewsDoc {
  return { ...doc, blocks: doc.blocks.filter((b) => b.id !== id) };
}

/** Puts `block` after the block `afterId`, or at the end when there is no such block. */
export function insertAfter(doc: NewsDoc, afterId: string | null, block: Block): NewsDoc {
  const i = afterId ? doc.blocks.findIndex((b) => b.id === afterId) : -1;
  const at = i < 0 ? doc.blocks.length : i + 1;
  return { ...doc, blocks: [...doc.blocks.slice(0, at), block, ...doc.blocks.slice(at)] };
}

/** A copy right after the original; returns the copy's id too. */
export function duplicateBlock(doc: NewsDoc, id: string): { doc: NewsDoc; id: string | null } {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b) return { doc, id: null };
  const copy: Block = { ...b, id: blockId(), p: { ...b.p }, ...(b.ids ? { ids: [...b.ids] } : {}) };
  return { doc: insertAfter(doc, id, copy), id: copy.id };
}
