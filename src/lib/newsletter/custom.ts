import type { RenderInput } from "./types";

/**
 * Pasted HTML code (from an email builder, a designer or an AI tool) becomes a sendable newsletter: dangerous parts are
 * removed, {name} and {unsubscribe_url} are filled in, and our legal footer (company, address, working Unsubscribe link)
 * is always added so the mail follows the rules whatever was pasted. The preview frame is sandboxed (no scripts), which is
 * the real protection; the clean-up here keeps scripts and trackers out of what is sent.
 */

export const MAX_HTML = 300_000;

const UNSUB_TOKEN = /\{\{\{?\s*unsubscribe(?:_url|_link)?\s*\}?\}\}|\{\s*unsubscribe(?:_url|_link)?\s*\}|\*\|UNSUB\|\*|%unsubscribe(?:_url)?%/gi;
const NAME_TOKEN = /\{\{\s*(?:first_?name|name)\s*\}\}|\{\s*(?:first_?name|name)\s*\}|\*\|FNAME\|\*/gi;

/** True when the code already places the unsubscribe link itself. */
export const hasUnsubToken = (html: string) => new RegExp(UNSUB_TOKEN.source, "i").test(html);

export function sanitizeHtml(src: string): string {
  let h = src.slice(0, MAX_HTML);
  h = h.replace(/<!--[\s\S]*?-->/g, (m) => (/^<!--\[if|^<!\[endif|^<!--<!\[endif/i.test(m) ? m : "")); // keep Outlook conditionals
  h = h.replace(/<(script|iframe|object|embed|applet|frameset|frame|form|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "");
  h = h.replace(/<(script|iframe|object|embed|applet|frameset|frame|form|input|button|select|textarea|base|noscript|template)\b[^>]*>/gi, "");
  h = h.replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "");
  h = h.replace(/<link\b(?![^>]*\bhref\s*=\s*["']?https:)[^>]*>/gi, "");
  h = h.replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  h = h.replace(/\b(href|src|background)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, attr: string, q: string, a?: string, b?: string) => {
    const v = (a ?? b ?? "").trim();
    const ok = attr.toLowerCase() === "href" ? /^(https?:|mailto:|tel:|#|\{|\*\||%)/i.test(v) : /^(https?:|cid:|data:image\/(png|jpe?g|gif|webp);|\{)/i.test(v);
    return ok ? m : `${attr}=${q[0]}#${q[0]}`;
  });
  return h;
}

const entities: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&zwnj;": "", "&rsquo;": "'", "&lsquo;": "'", "&ndash;": "-", "&mdash;": "-" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, u: string, t: string) => {
      const label = t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!/^(https?:|mailto:|tel:)/i.test(u)) return label;
      return !label || label === u ? u : `${label} (${u})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => entities[e.toLowerCase()] ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The email as HTML and plain text. `footer` is our legal block (with the unsubscribe link) and `legal` the same without the link. */
export function renderCustom(i: RenderInput, footer: { full: string; legal: string }): { html: string; text: string } {
  const first = i.firstName || "there";
  const raw = sanitizeHtml(i.html ?? "");
  const own = hasUnsubToken(raw);
  const unsub = i.unsubUrl.replace(/"/g, "&quot;");
  let body = raw.replace(UNSUB_TOKEN, unsub).replace(NAME_TOKEN, first.replace(/[<>&"]/g, ""));
  const add = own ? footer.legal : footer.full;

  const pre = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${i.preheader.replace(/[<>&]/g, "")}${"&nbsp;&zwnj;".repeat(40)}</div>`;
  if (/<\/body\s*>/i.test(body)) body = body.replace(/<\/body\s*>/i, `${add}</body>`);
  else body += add;
  if (/<body\b[^>]*>/i.test(body)) body = body.replace(/<body\b[^>]*>/i, (m) => m + pre);
  else body = pre + body;

  const html = /<html[\s>]/i.test(body)
    ? /^\s*<!doctype/i.test(body)
      ? body
      : `<!doctype html>${body}`
    : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${i.subject.replace(/[<>&]/g, "")}</title></head><body style="margin:0;padding:0">${body}</body></html>`;

  // the footer's link shows up in the text as "Unsubscribe (https://...)", so the plain-text part carries it too
  return { html, text: htmlToText(html) };
}
