/**
 * Deterministic clean-up of a pasted WhatsApp message before it reaches the LLM.
 * Goal: fewer tokens, fewer distractions, no information loss.
 */
import { stripChatPrefix } from "./chatprefix";

// Emoji & pictographs, variation selectors, zero-width joiners, keycaps.
const EMOJI_RE =
  /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}]/gu;

export function precleanLine(line: string): string {
  return (
    stripChatPrefix(line)
      .replace(EMOJI_RE, "")
      .replace(/[™®©]/g, "")
      // WhatsApp formatting markers: *bold* _italic_ ~strike~ ```mono```
      .replace(/```/g, "")
      .replace(/(^|[\s|/(])[*_~]+(?=\S)/g, "$1")
      .replace(/(?<=\S)[*_~]+(?=$|[\s|/),:])/g, "")
      .replace(/\*/g, "")
      .replace(/ /g, " ")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

export function preclean(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(precleanLine);
  // collapse 2+ blank lines into one
  const out: string[] = [];
  for (const l of lines) {
    if (l === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

const SUPPLIER_RE =
  /^(?:supplier|vendor|from|regards|thanks\s*(?:&|and)\s*regards|company)\s*[:\-–]\s*(.{2,80})$/i;

/** Finds a signature like "Supplier : Aman Star IT DXB" to pre-select the supplier. */
export function detectSupplierName(text: string): string | null {
  const lines = preclean(text).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(SUPPLIER_RE);
    if (m) return m[1].trim();
  }
  return null;
}
