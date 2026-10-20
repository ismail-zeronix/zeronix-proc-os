/** Pure helpers for writing an email: recipients, subjects, and turning typed text into email HTML. */

export interface Recipient {
  name: string;
  email: string;
}

const EMAIL = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]{2,}$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL.test(s);

/**
 * Splits "a@x.com, Bob <b@x.com>; c@x.com" into addresses. Returns the valid ones and the text of any that are not,
 * so the form can say exactly which one is wrong.
 */
export function parseRecipients(input: string): { ok: Recipient[]; bad: string[] } {
  const ok: Recipient[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  // commas inside quoted names ("Khan, Ahmed" <a@x.com>) must not split
  const parts = input.match(/(?:"[^"]*"|[^,;\n])+/g) ?? [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^(.*?)<\s*([^<>]+?)\s*>$/.exec(part);
    const email = (m ? m[2] : part).trim();
    const name = m ? m[1].trim().replace(/^"|"$/g, "").trim() : "";
    if (!isEmail(email)) {
      bad.push(part);
      continue;
    }
    if (seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    ok.push({ name, email });
  }
  return { ok, bad };
}

/** "Ahmed Khan <a@x.com>" for a form field; a name with a comma or quote is wrapped in quotes so it can be split again. */
export function formatRecipient(r: Recipient): string {
  if (!r.name) return r.email;
  const name = r.name.replace(/"/g, "");
  return /[,;<>]/.test(name) ? `"${name}" <${r.email}>` : `${name} <${r.email}>`;
}

/** "Re: Quote" for a reply, "Fwd: Quote" for a forward, without stacking "Re: Re: Re:". */
export function subjectFor(mode: "reply" | "replyall" | "forward" | "new", original: string): string {
  if (mode === "new") return "";
  const base = original.replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, "").trim();
  return `${mode === "forward" ? "Fwd" : "Re"}: ${base}`;
}

/**
 * Who a reply goes to. Reply: the sender (or their Reply-To). Reply all: also everyone else on To and Cc,
 * except you. Returns To and Cc lists with no duplicates.
 */
export function replyRecipients(
  mode: "reply" | "replyall",
  m: { from: Recipient; replyTo: Recipient | null; to: Recipient[]; cc: Recipient[] },
  myEmail: string,
) {
  const me = myEmail.toLowerCase();
  const first = m.replyTo ?? m.from;
  const to: Recipient[] = [first];
  const cc: Recipient[] = [];
  if (mode === "replyall") {
    const taken = new Set([first.email.toLowerCase(), me]);
    for (const r of [...m.to, ...m.cc]) {
      const k = r.email.toLowerCase();
      if (taken.has(k)) continue;
      taken.add(k);
      (m.to.includes(r) ? to : cc).push(r);
    }
  }
  return { to, cc };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Escapes typed text and keeps its line breaks. Lines starting with ">" become an indented quote block. */
export function textToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (quote.length) {
      out.push(
        `<blockquote style="margin:0 0 0 4px;padding-left:10px;border-left:3px solid #cccccc;color:#555555">${quote.join("<br>")}</blockquote>`,
      );
      quote = [];
    }
  };
  for (const line of lines) {
    if (/^>/.test(line)) quote.push(esc(line.replace(/^>\s?/, "")));
    else {
      flush();
      out.push(esc(line) + "<br>");
    }
  }
  flush();
  return out.join("");
}

export const MAX_RECIPIENTS = 50;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_FILES = 10;
export const DAILY_RECIPIENT_LIMIT = 200;
