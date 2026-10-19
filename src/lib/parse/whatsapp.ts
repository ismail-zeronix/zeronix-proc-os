/**
 * Split a WhatsApp "Export chat" text file into messages so one can be picked as the price list.
 * Runs in the browser and on the server.
 */
import { CHAT_HEAD } from "./chatprefix";
import { PRICE_LINE_RE } from "./chunk";

export interface ChatMessage {
  /** Local time as "YYYY-MM-DDTHH:mm", ready for a datetime-local input. */
  at: string | null;
  sender: string;
  text: string;
  /** Lines of the message that look like a price: how likely it is to be a price list. */
  priceLines: number;
}

interface Head {
  d1: number; d2: number; y: number; h: number; min: number; sender: string; rest: string;
}

function parseHead(line: string): Head | null {
  const m = line.match(CHAT_HEAD);
  if (!m) return null;
  const dateFirst = m[1] !== undefined;
  const [d1, d2, y] = (dateFirst ? [m[1], m[2], m[3]] : [m[10], m[11], m[12]]).map(Number);
  const [h, min] = (dateFirst ? [m[4], m[5]] : [m[7], m[8]]).map(Number);
  const ampm = (dateFirst ? m[6] : m[9])?.toLowerCase();
  const hour = ampm === "p" && h < 12 ? h + 12 : ampm === "a" && h === 12 ? 0 : h;
  return { d1, d2, y, h: hour, min, sender: (m[13] ?? "").trim(), rest: m[14] };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function looksLikeChatExport(text: string): boolean {
  let n = 0;
  for (const line of text.split(/\r?\n/, 40)) if (parseHead(line)) n++;
  return n >= 3;
}

/** Splits an exported chat into messages (system lines such as "Messages are end-to-end encrypted" are dropped). */
export function parseChatExport(text: string): ChatMessage[] {
  const raw: { p: Head; lines: string[] }[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const p = parseHead(line);
    if (p) raw.push({ p, lines: [p.rest] });
    else if (raw.length) raw[raw.length - 1].lines.push(line);
  }

  // 12/10 is ambiguous: a value above 12 in the second slot means the first slot is the month
  const dayFirst = !raw.some(({ p }) => p.d2 > 12 && p.d1 <= 12);

  return raw
    .filter(({ p }) => p.sender)
    .map(({ p, lines }) => {
      const [day, month] = dayFirst ? [p.d1, p.d2] : [p.d2, p.d1];
      const year = p.y < 100 ? 2000 + p.y : p.y;
      const valid = month >= 1 && month <= 12 && day >= 1 && day <= 31;
      const body = lines.join("\n").trim();
      return {
        at: valid ? `${year}-${pad(month)}-${pad(day)}T${pad(p.h)}:${pad(p.min)}` : null,
        sender: p.sender,
        text: body,
        priceLines: body.split("\n").filter((l) => PRICE_LINE_RE.test(l)).length,
      };
    })
    .filter((m) => m.text && !/^<?(media omitted|image omitted|this message was deleted)>?$/i.test(m.text));
}

/** Messages that look like price lists (several price lines), newest first. */
export function likelyPriceLists(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.priceLines >= 3).reverse();
}
