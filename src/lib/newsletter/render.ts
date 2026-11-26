import { blockDef, FONTS, normDoc } from "./blocks";
import { renderCustom } from "./custom";
import { EDIT_CSS, EDIT_JS } from "./edit-script";
import type { Block, NewsStyle, RenderInput, ResolvedProduct } from "./types";

/**
 * Turns a newsletter design (a list of sections plus a style) into one email: a 600 px table layout with inline styles, which
 * is what Outlook, Gmail, Apple Mail and phones all handle, plus a plain-text copy. Pure (no server code), so the editor's
 * live preview is made by the very function that builds the mail that is sent. Everything typed by a person is escaped,
 * only http(s) links are used, and the legal footer (company, address, Unsubscribe) cannot be removed.
 */

// ---------- colour and text helpers ----------

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v * (1 - t) + y[i] * t));
};
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onColor = (bg: string) => (lum(bg) > 0.4 ? "#081A31" : "#FFFFFF");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isUrl = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());
/** Only http(s) links go into a mail; anything else becomes "#". */
const href = (u: string) => (isUrl(u) ? esc(u.trim()) : "#");
const personal = (s: string, first: string) => s.replace(/\{name\}/gi, first || "there");

const INK = "#0E1A2B";
const MUTED = "#5A6577";
const LINE = "#DDE3EC";

interface Theme {
  brand: string;
  brandDark: string;
  accent: string;
  onAccent: string;
  onBrand: string;
  soft: string;
  page: string;
  title: string;
  link: string;
  hf: string;
  bf: string;
  r: number;
  logo: boolean;
}
function theme(s: NewsStyle): Theme {
  const title = lum(s.brand) < 0.3 ? s.brand : INK;
  return {
    brand: s.brand,
    brandDark: mix(s.brand, "#000000", 0.35),
    accent: s.accent,
    onAccent: onColor(s.accent),
    onBrand: onColor(s.brand),
    soft: mix(s.brand, "#FFFFFF", 0.94),
    page: s.page,
    title,
    link: title,
    hf: FONTS[s.headingFont].stack,
    bf: FONTS[s.bodyFont].stack,
    r: s.round ? 8 : 0,
    logo: s.logo,
  };
}

interface Pal {
  bg: string;
  ink: string;
  muted: string;
  title: string;
  card: string;
  link: string;
  dark: boolean;
}
function pal(T: Theme, bg: string | undefined): Pal {
  if (bg === "dark") return { bg: T.brand, ink: "#FFFFFF", muted: mix("#FFFFFF", T.brand, 0.28), title: "#FFFFFF", card: mix(T.brand, "#FFFFFF", 0.1), link: T.accent, dark: true };
  if (bg === "soft") return { bg: T.soft, ink: INK, muted: MUTED, title: T.title, card: "#FFFFFF", link: T.link, dark: false };
  return { bg: "#FFFFFF", ink: INK, muted: MUTED, title: T.title, card: T.soft, link: T.link, dark: false };
}

const row = (inner: string, bg = "#FFFFFF", pad = "14px 40px") => `<tr><td class="px" bgcolor="${bg}" style="background:${bg};padding:${pad}">${inner}</td></tr>`;

/** **bold** and [text](https://link) inside already-escaped text. */
function inline(s: string, linkColor: string): string {
  return esc(s)
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t: string, u: string) => `<a href="${u}" style="color:${linkColor};text-decoration:underline">${t}</a>`);
}

/** Blank-line separated paragraphs; a paragraph of "- " lines becomes a bullet list. */
function paras(text: string, o: { size: number; color: string; link: string; font: string; align: string }): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
      const css = `font:${o.size}px/1.65 ${o.font};color:${o.color};text-align:${o.align}`;
      if (lines.every((l) => /^[-•]\s+/.test(l))) return `<ul style="margin:0 0 14px;padding-left:20px;${css}">${lines.map((l) => `<li style="margin:0 0 6px">${inline(l.replace(/^[-•]\s+/, ""), o.link)}</li>`).join("")}</ul>`;
      return `<p style="margin:0 0 14px;${css}">${lines.map((l) => inline(l, o.link)).join("<br>")}</p>`;
    })
    .join("");
}

/** Plain-text version of formatted text: **bold** and [label](url) lose their marks. */
const plain = (s: string) => s.replace(/\*\*([^*]+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");

/** A button that works in Outlook too (the colour sits on the cell, not on the link). `wrap` lets the editor mark the label as typeable. */
function button(label: string, url: string, o: { bg: string; fg: string; border?: string; align: string; font: string; r: number }, wrap: (s: string) => string = (s) => s): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${o.align}" style="margin:4px ${o.align === "center" ? "auto" : "0"} 8px"><tr><td bgcolor="${o.bg}" style="background:${o.bg};border-radius:${o.r}px;${o.border ? `border:2px solid ${o.border};` : ""}"><a href="${href(url)}" style="display:inline-block;padding:14px 30px;font:bold 15px ${o.font};color:${o.fg};text-decoration:none;border-radius:${o.r}px">${wrap(esc(label))}</a></td></tr></table>`;
}

const parsePoints = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [t, ...rest] = l.split("|");
      return { title: t.trim(), text: rest.join("|").trim() };
    });

const label = (text: string, color: string, font: string, wrap: (s: string) => string = (s) => s) => (text ? `<div style="font:bold 12px ${font};letter-spacing:1.5px;text-transform:uppercase;color:${color};margin:0 0 14px">${wrap(esc(text))}</div>` : "");

/**
 * In the editor, text that can be typed on directly is wrapped so the canvas can find it. Never present in a sent mail
 * (`edit` is only set by the editor's preview).
 */
function ed(c: { edit: boolean }, key: string, raw: string, inner: string, o: { tag?: "span" | "div"; single?: boolean; idx?: number; part?: string } = {}): string {
  if (!c.edit) return inner;
  const t = o.tag ?? "span";
  return `<${t} data-nl-field="${key}" data-raw="${esc(raw)}"${o.single ? " data-single" : ""}${o.idx !== undefined ? ` data-idx="${o.idx}" data-part="${o.part}"` : ""}>${inner}</${t}>`;
}

// ---------- products ----------

function productCell(p: ResolvedProduct | undefined, cols: number, T: Theme): string {
  const w = cols === 3 ? "33%" : "50%";
  if (!p) return `<td class="col" width="${w}" valign="top" style="padding:0 6px 14px">&nbsp;</td>`;
  const iw = cols === 3 ? 160 : 248;
  const img = p.image ? `<a href="${href(p.url)}"><img src="${esc(p.image)}" width="${iw}" alt="${esc(p.name)}" style="display:block;width:100%;max-width:${iw}px;height:auto;border:0;margin:0 auto 10px"></a>` : "";
  return `<td class="col" width="${w}" valign="top" style="padding:0 6px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border:1px solid ${LINE};border-radius:${T.r}px"><tr><td style="padding:14px;text-align:center">${img}${
    p.brand ? `<div style="font:11px/1.4 ${T.bf};color:${MUTED};text-transform:uppercase;letter-spacing:.6px">${esc(p.brand)}</div>` : ""
  }<div style="font:bold 15px/1.4 ${T.hf};color:${INK};margin:2px 0 6px"><a href="${href(p.url)}" style="color:${INK};text-decoration:none">${esc(p.name)}</a></div><div style="font:14px/1.4 ${T.bf};color:${INK};margin-bottom:8px">${
    p.price ? `<strong>${esc(p.price)}</strong>` : "Request a quote"
  }</div><a href="${href(p.url)}" style="font:bold 13px ${T.bf};color:${T.link};text-decoration:underline">View product</a></td></tr></table></td>`;
}

// ---------- sections ----------

interface Ctx {
  T: Theme;
  first: string;
  products: Map<number, ResolvedProduct>;
  /** Editor preview: keep {name} as typed and mark typeable text. */
  edit: boolean;
}
interface Out {
  html: string;
  text: string[];
}

function renderBlock(b: Block, c: Ctx): Out {
  const { T } = c;
  const d = blockDef(b.type).defaults;
  const raw = (k: string) => b.p[k] ?? d[k] ?? "";
  const g = (k: string) => (c.edit ? raw(k).trim() : personal(raw(k), c.first).trim());
  const e = (k: string, inner: string, o: { tag?: "span" | "div"; single?: boolean } = {}) => ed(c, k, raw(k), inner, o);
  const al = g("align") === "center" ? "center" : "left";
  const P = pal(T, g("bg"));

  switch (b.type) {
    case "hero": {
      const tone = g("tone");
      const bg = tone === "accent" ? T.accent : tone === "light" ? T.soft : T.brand;
      const fg = tone === "accent" ? T.onAccent : tone === "light" ? T.title : "#FFFFFF";
      const sub = tone === "dark" ? mix("#FFFFFF", T.brand, 0.2) : tone === "accent" ? T.onAccent : MUTED;
      const btn = tone === "accent" ? { bg: T.brand, fg: T.onBrand } : { bg: T.accent, fg: T.onAccent };
      const eyebrow = g("eyebrow")
        ? tone === "dark"
          ? `<div style="margin:0 0 18px;text-align:${al}"><span style="display:inline-block;padding:5px 12px;border-radius:${T.r ? 999 : 0}px;background:${T.accent};font:bold 11px ${T.bf};letter-spacing:1.4px;text-transform:uppercase;color:${T.onAccent}">${e("eyebrow", esc(g("eyebrow")), { single: true })}</span></div>`
          : `<div style="margin:0 0 14px;font:bold 12px ${T.bf};letter-spacing:1.5px;text-transform:uppercase;color:${fg};text-align:${al}">${e("eyebrow", esc(g("eyebrow")), { single: true })}</div>`
        : "";
      const html =
        row(
          eyebrow +
            (g("title") ? `<h1 class="h1" style="margin:0 0 14px;font:bold 34px/1.18 ${T.hf};color:${fg};text-align:${al}">${e("title", esc(g("title")), { single: true })}</h1>` : "") +
            (g("text") ? e("text", paras(g("text"), { size: 17, color: sub, link: fg, font: T.bf, align: al }), { tag: "div" }) : "") +
            (g("buttonLabel") ? `<div style="padding-top:6px">${button(g("buttonLabel"), g("buttonUrl"), { ...btn, align: al, font: T.bf, r: T.r }, (x) => e("buttonLabel", x, { single: true }))}</div>` : ""),
          bg,
          "48px 40px 40px",
        ) +
        (isUrl(g("image")) ? `<tr><td bgcolor="${bg}" style="background:${bg};padding:0"><img src="${esc(g("image"))}" width="600" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>` : "") +
        (tone === "dark" ? `<tr><td height="4" bgcolor="${T.accent}" style="background:${T.accent};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>` : "");
      return { html, text: [[g("eyebrow").toUpperCase(), g("title"), plain(g("text")), g("buttonLabel") && isUrl(g("buttonUrl")) ? `${g("buttonLabel")}: ${g("buttonUrl")}` : ""].filter(Boolean).join("\n")] };
    }

    case "heading": {
      const px = { s: 20, m: 26, l: 32 }[g("size") as "s" | "m" | "l"] ?? 26;
      if (!g("text")) return { html: "", text: [] };
      return { html: row(`<h2 class="h2" style="margin:0;font:bold ${px}px/1.25 ${T.hf};color:${P.title};text-align:${al}">${e("text", esc(g("text")), { single: true })}</h2>`, P.bg, "26px 40px 8px"), text: [g("text").toUpperCase()] };
    }

    case "text": {
      if (!g("text")) return { html: "", text: [] };
      return { html: row(e("text", paras(g("text"), { size: 16, color: P.ink, link: P.link, font: T.bf, align: al }), { tag: "div" }), P.bg, "12px 40px 0"), text: [plain(g("text"))] };
    }

    case "image": {
      if (!isUrl(g("src"))) return { html: "", text: [] };
      const full = g("width") === "full";
      const img = `<img src="${esc(g("src"))}" width="${full ? 600 : 520}" alt="${esc(g("alt"))}" style="display:block;width:100%;height:auto;border:0;${full ? "" : `border-radius:${T.r}px`}">`;
      return { html: row(isUrl(g("href")) ? `<a href="${href(g("href"))}">${img}</a>` : img, "#FFFFFF", full ? "0" : "14px 40px"), text: [] };
    }

    case "button": {
      if (!g("label")) return { html: "", text: [] };
      const tone = g("tone");
      const o = tone === "dark" ? { bg: T.brand, fg: T.onBrand } : tone === "outline" ? { bg: "#FFFFFF", fg: T.title, border: T.title } : { bg: T.accent, fg: T.onAccent };
      return { html: row(button(g("label"), g("url"), { ...o, align: al, font: T.bf, r: T.r }, (x) => e("label", x, { single: true })), "#FFFFFF", "10px 40px 6px"), text: [isUrl(g("url")) ? `${g("label")}: ${g("url")}` : g("label")] };
    }

    case "points": {
      const pts = parsePoints(c.edit ? (b.p.lines ?? d.lines ?? "") : personal(b.p.lines ?? d.lines ?? "", c.first));
      if (!pts.length) return { html: "", text: [] };
      const look = g("look");
      const items = pts
        .map((p, n) => {
          const body = `<div style="font:bold 16px/1.4 ${T.hf};color:${P.title}">${ed(c, "lines", p.title, esc(p.title), { single: true, idx: n, part: "title" })}</div>${p.text ? `<div style="font:15px/1.55 ${T.bf};color:${P.muted};margin-top:3px">${ed(c, "lines", p.text, esc(p.text), { single: true, idx: n, part: "text" })}</div>` : ""}`;
          if (look === "numbers")
            return `<tr><td width="48" valign="top" style="padding:0 0 18px"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="34" height="34" align="center" valign="middle" bgcolor="${T.accent}" style="background:${T.accent};border-radius:17px;font:bold 15px ${T.bf};color:${T.onAccent}">${n + 1}</td></tr></table></td><td valign="top" style="padding:2px 0 18px">${body}</td></tr>`;
          if (look === "bar")
            return `<tr><td width="4" bgcolor="${T.accent}" style="background:${T.accent};font-size:0;line-height:0">&nbsp;</td><td style="padding:2px 0 2px 16px">${body}</td></tr><tr><td colspan="2" height="16" style="font-size:0;line-height:0">&nbsp;</td></tr>`;
          return `<tr><td style="padding:0 0 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="${P.card}" style="background:${P.card};border-left:4px solid ${T.accent};border-radius:${T.r}px;padding:16px 18px">${body}</td></tr></table></td></tr>`;
        })
        .join("");
      return {
        html: row(label(g("title"), P.muted, T.bf, (x) => e("title", x, { single: true })) + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${items}</table>`, P.bg, "20px 40px 8px"),
        text: [[g("title").toUpperCase(), ...pts.map((p) => `- ${p.title}${p.text ? `: ${p.text}` : ""}`)].filter(Boolean).join("\n")],
      };
    }

    case "stats": {
      const st = parsePoints(b.p.lines ?? d.lines ?? "").slice(0, 4);
      if (!st.length) return { html: "", text: [] };
      const w = Math.floor(100 / st.length);
      const cells = st
        .map((s, n) => `<td align="center" valign="top" width="${w}%" style="padding:6px 6px"><div class="big" style="font:bold 34px/1.1 ${T.hf};color:${T.accent}">${ed(c, "lines", s.title, esc(s.title), { single: true, idx: n, part: "title" })}</div><div style="font:13px/1.4 ${T.bf};color:${mix("#FFFFFF", T.brand, 0.25)};margin-top:5px">${ed(c, "lines", s.text, esc(s.text), { single: true, idx: n, part: "text" })}</div></td>`)
        .join("");
      return { html: row(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${cells}</tr></table>`, T.brand, "28px 20px"), text: [st.map((s) => `${s.title} ${s.text}`.trim()).join("  |  ")] };
    }

    case "feature": {
      const img = isUrl(g("image")) ? g("image") : "";
      const text =
        (g("title") ? `<h3 style="margin:0 0 8px;font:bold 22px/1.25 ${T.hf};color:${P.title}">${e("title", esc(g("title")), { single: true })}</h3>` : "") +
        e("text", paras(g("text"), { size: 15, color: P.ink, link: P.link, font: T.bf, align: "left" }), { tag: "div" }) +
        (g("buttonLabel") && isUrl(g("buttonUrl")) ? `<a href="${href(g("buttonUrl"))}" style="font:bold 14px ${T.bf};color:${P.link};text-decoration:underline">${e("buttonLabel", esc(g("buttonLabel")), { single: true })} &rarr;</a>` : "");
      const lines = [g("title"), plain(g("text")), g("buttonLabel") && isUrl(g("buttonUrl")) ? `${g("buttonLabel")}: ${g("buttonUrl")}` : ""].filter(Boolean).join("\n");
      if (!img) return { html: row(text, P.bg, "20px 40px 12px"), text: [lines] };
      const imgTd = `<td class="col" width="240" valign="top" style="padding:0 ${g("imageSide") === "right" ? "0 0 24px" : "24px 0 0"}"><img src="${esc(img)}" width="240" alt="${esc(g("title"))}" style="display:block;width:100%;height:auto;border:0;border-radius:${T.r}px"></td>`;
      const txtTd = `<td class="col" valign="top" style="padding:0">${text}</td>`;
      return { html: row(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${g("imageSide") === "right" ? txtTd + imgTd : imgTd + txtTd}</tr></table>`, P.bg, "22px 40px 14px"), text: [lines] };
    }

    case "callout": {
      if (!g("text")) return { html: "", text: [] };
      const tone = g("tone");
      const o = tone === "accent" ? { bg: T.accent, fg: T.onAccent, bar: T.brand } : tone === "dark" ? { bg: T.brand, fg: "#FFFFFF", bar: T.accent } : { bg: T.soft, fg: T.title, bar: T.accent };
      return { html: row(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="${o.bg}" style="background:${o.bg};border-left:5px solid ${o.bar};border-radius:${T.r}px;padding:18px 22px;font:bold 17px/1.5 ${T.hf};color:${o.fg}">${e("text", inline(g("text"), o.fg), { single: true })}</td></tr></table>`, "#FFFFFF", "14px 40px"), text: [plain(g("text"))] };
    }

    case "products": {
      const items = (b.ids ?? []).map((id) => c.products.get(id)).filter((p): p is ResolvedProduct => !!p);
      if (!items.length) return { html: "", text: [] };
      const cols = g("columns") === "3" ? 3 : 2;
      const rows: string[] = [];
      for (let n = 0; n < items.length; n += cols) rows.push(`<tr>${Array.from({ length: cols }, (_, k) => productCell(items[n + k], cols, T)).join("")}</tr>`);
      return {
        html: row(label(g("title"), P.muted, T.bf, (x) => e("title", x, { single: true })) + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows.join("")}</table>`, P.bg, "20px 34px 6px"),
        text: [[g("title").toUpperCase(), ...items.map((p) => `- ${p.name}${p.brand ? ` (${p.brand})` : ""} - ${p.price ?? "Request a quote"}\n  ${p.url}`)].filter(Boolean).join("\n")],
      };
    }

    case "cta": {
      const accent = g("tone") !== "dark";
      const bg = accent ? T.accent : T.brand;
      const fg = accent ? T.onAccent : "#FFFFFF";
      const btn = accent ? { bg: T.brand, fg: T.onBrand } : { bg: T.accent, fg: T.onAccent };
      const html = row(
        (g("title") ? `<h2 class="h2" style="margin:0 0 10px;font:bold 26px/1.25 ${T.hf};color:${fg};text-align:center">${e("title", esc(g("title")), { single: true })}</h2>` : "") +
          (g("text") ? e("text", paras(g("text"), { size: 16, color: fg, link: fg, font: T.bf, align: "center" }), { tag: "div" }) : "") +
          (g("buttonLabel") ? button(g("buttonLabel"), g("buttonUrl"), { ...btn, align: "center", font: T.bf, r: T.r }, (x) => e("buttonLabel", x, { single: true })) : ""),
        bg,
        "40px 40px 34px",
      );
      return { html, text: [[g("title"), plain(g("text")), g("buttonLabel") && isUrl(g("buttonUrl")) ? `${g("buttonLabel")}: ${g("buttonUrl")}` : ""].filter(Boolean).join("\n")] };
    }

    case "divider":
      return { html: row(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td height="1" style="border-top:1px solid ${LINE};font-size:0;line-height:0">&nbsp;</td></tr></table>`, "#FFFFFF", "12px 40px"), text: [] };

    case "spacer": {
      const h = Math.min(96, Math.max(8, Number(g("size")) || 32));
      return { html: `<tr><td height="${h}" bgcolor="#FFFFFF" style="background:#FFFFFF;height:${h}px;font-size:0;line-height:0">&nbsp;</td></tr>`, text: [] };
    }
  }
}

// ---------- legal footer ----------

const reasonOf = (i: RenderInput) => i.reason.trim() || "You are receiving this email because you are a contact of our company.";
const contactOf = (i: RenderInput) => [i.brand.phone, i.brand.email, i.brand.website].filter(Boolean);

/** The footer of a pasted-code newsletter: neutral, so it sits under any design. `full` has the Unsubscribe link, `legal` leaves it out (the pasted code placed it). */
function customFooter(i: RenderInput) {
  const f = "Arial,Helvetica,sans-serif";
  const head = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#F4F5F7" style="background:#F4F5F7"><tr><td align="center" style="padding:22px 16px;font:12px/1.6 ${f};color:${MUTED}"><div style="font:bold 13px ${f};color:${INK}">${esc(i.brand.company)}</div>${i.brand.address ? `<div>${esc(i.brand.address)}</div>` : ""}${contactOf(i).length ? `<div>${contactOf(i).map(esc).join(" &nbsp;·&nbsp; ")}</div>` : ""}<div style="margin-top:10px">${esc(reasonOf(i))}`;
  return { full: `${head} <a href="${href(i.unsubUrl)}" style="color:${INK};text-decoration:underline">Unsubscribe</a> at any time and we will not email you again.</div></td></tr></table>`, legal: `${head}</div></td></tr></table>` };
}

function docFooter(i: RenderInput, T: Theme): string {
  const muted = mix("#FFFFFF", T.brandDark, 0.3);
  const contact = contactOf(i).map(esc).join(" &nbsp;·&nbsp; ");
  return (
    `<tr><td class="px" bgcolor="${T.brandDark}" style="background:${T.brandDark};padding:30px 40px;font:13px/1.6 ${T.bf};color:${muted}">` +
    `<div style="font:bold 15px ${T.hf};color:#FFFFFF;margin-bottom:4px">${esc(i.brand.company)}</div>` +
    (i.brand.address ? `<div>${esc(i.brand.address)}</div>` : "") +
    (contact ? `<div style="margin-top:4px">${contact}</div>` : "") +
    `<div style="margin-top:16px;border-top:1px solid ${mix(T.brandDark, "#FFFFFF", 0.18)};padding-top:14px;font-size:12px;color:${mix("#FFFFFF", T.brandDark, 0.4)}">${esc(reasonOf(i))} <a href="${href(i.unsubUrl)}" style="color:#FFFFFF;text-decoration:underline">Unsubscribe</a> at any time and we will not email you again.</div></td></tr>`
  );
}

// ---------- the email ----------

/** The email as HTML and as plain text, for a block design (`doc`) or pasted code (`html`). */
export function renderEmail(i: RenderInput): { html: string; text: string } {
  if (i.html !== undefined) return renderCustom(i, customFooter(i));
  const doc = normDoc(i.doc) ?? normDoc({ blocks: [] })!;
  const T = theme(doc.style);
  const edit = !!i.edit;
  const ctx: Ctx = { T, first: edit ? "" : i.firstName, products: new Map(i.products.map((p) => [p.id, p])), edit };
  const parts = doc.blocks.map((b) => renderBlock(b, ctx));

  const logo = i.logoSrc
    ? `<img src="${esc(i.logoSrc)}" height="34" alt="${esc(i.brand.company)}" style="display:block;border:0;height:34px;width:auto">`
    : `<span style="font:bold 22px ${T.hf};color:#FFFFFF;letter-spacing:.5px">${esc(i.brand.company)}</span>`;

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(i.subject)}</title>` +
    `<style>@media (max-width:620px){.w{width:100%!important}.px{padding-left:22px!important;padding-right:22px!important}.col{display:block!important;width:100%!important;padding:0 0 14px!important}.h1{font-size:26px!important}.h2{font-size:22px!important}.big{font-size:26px!important}}${edit ? EDIT_CSS : ""}</style></head>` +
    `<body style="margin:0;padding:0;background:${T.page}">${edit ? `<div id="nl-root" data-selected="${esc(i.edit?.selectedId ?? "")}">` : ""}<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(i.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${T.page}" style="background:${T.page}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" class="w" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;${T.r ? "border-radius:12px;overflow:hidden;" : ""}">` +
    (T.logo ? `<tr><td class="px" bgcolor="${T.brandDark}" style="background:${T.brandDark};padding:20px 40px">${logo}</td></tr>` : "") +
    (edit
      ? doc.blocks
          .map((b, n) => {
            const def = blockDef(b.type);
            const empty = `<tr><td class="px" bgcolor="#FFFFFF" style="background:#FFFFFF;padding:18px 40px;font:italic 13px Arial,sans-serif;color:#8A94A6;text-align:center;border:1px dashed #C9D2DF">${esc(def.label)}: nothing to show yet. Open Settings to fill it in.</td></tr>`;
            return `<tbody data-nl-block="${esc(b.id)}" data-nl-label="${esc(def.label)}">${parts[n].html || empty}</tbody>`;
          })
          .join("")
      : parts.map((p) => p.html).join("")) +
    docFooter(i, T) +
    `</table></td></tr></table>${edit ? `</div><div id="nl-ui"></div><script>${EDIT_JS}</script>` : ""}</body></html>`;

  const contact = contactOf(i).join(" | ");
  const text = [
    ...parts.flatMap((p) => p.text),
    ["--", i.brand.company, i.brand.address, contact].filter(Boolean).join("\n"),
    `${reasonOf(i)} Unsubscribe: ${i.unsubUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { html, text };
}
