import type { CSSProperties } from "react";

/**
 * The look of the customer documents (quotation, proforma, delivery note, tax invoice, credit / debit note, refund):
 * one of three ready-made templates plus the owner's changes, saved in the `doc_style` setting from
 * Accounts › Settings › Documents › Templates. Only the look: numbers, lines and amounts never depend on it, and every
 * document prints with the current style, also ones issued earlier.
 *
 * Shared by the server (print pages, PDFs) and the browser (the live preview), so nothing here touches the database.
 */

export const PRESETS_LIST = ["classic", "bold", "minimal"] as const;
export type Preset = (typeof PRESETS_LIST)[number];

export interface DocStyle {
  preset: Preset;
  /** Main colour; "" = the brand colour from Admin › Settings › Company & branding. */
  accent: string;
  /** Headings and amounts. */
  text: string;
  font: "jakarta" | "geist" | "inter" | "serif";
  size: "compact" | "normal" | "large";
  /** Logo and our details on the left, title right (split); everything on a coloured band (band); logo centred above (centered). */
  header: "split" | "band" | "centered";
  logoSize: "s" | "m" | "l";
  /** The rule under the header. */
  bar: "gradient" | "solid" | "none";
  barWidth: number;
  headFill: "accent" | "dark" | "tint" | "none";
  /** Table head text; "" = white on a dark fill, the text colour on a light one. */
  headText: string;
  rowLines: "none" | "horizontal" | "grid";
  lineColor: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
  /** A line round the whole table. */
  tableBorder: boolean;
  zebra: boolean;
  rowHeight: "compact" | "comfortable";
  /** Corner radius of the table head, panels and total, px. */
  radius: number;
  /** The customer's address panel. */
  panel: "tinted" | "outlined" | "plain";
  total: "filled" | "outlined" | "bold";
  showNumbers: boolean;
  showWords: boolean;
  showPreparedBy: boolean;
  /** The uploaded signature and stamp (Letterhead) under the totals. */
  showSignature: boolean;
  /** Left side of the footer; "" = each document's own line. */
  footerText: string;
}

/** What the template editor offers for each choice field, with labels. */
export const OPTIONS = {
  font: [
    ["jakarta", "Plus Jakarta Sans"],
    ["inter", "Inter"],
    ["geist", "Geist"],
    ["serif", "Source Serif"],
  ],
  size: [
    ["compact", "Compact"],
    ["normal", "Normal"],
    ["large", "Large"],
  ],
  header: [
    ["split", "Split"],
    ["band", "Colour band"],
    ["centered", "Centred"],
  ],
  logoSize: [
    ["s", "S"],
    ["m", "M"],
    ["l", "L"],
  ],
  bar: [
    ["gradient", "Fading"],
    ["solid", "Solid"],
    ["none", "None"],
  ],
  headFill: [
    ["accent", "Colour"],
    ["dark", "Dark"],
    ["tint", "Light"],
    ["none", "None"],
  ],
  rowLines: [
    ["horizontal", "Rows"],
    ["grid", "Grid"],
    ["none", "None"],
  ],
  lineStyle: [
    ["solid", "Solid"],
    ["dashed", "Dashed"],
    ["dotted", "Dotted"],
  ],
  rowHeight: [
    ["compact", "Compact"],
    ["comfortable", "Roomy"],
  ],
  panel: [
    ["tinted", "Tinted"],
    ["outlined", "Outlined"],
    ["plain", "Plain"],
  ],
  total: [
    ["filled", "Filled"],
    ["outlined", "Outlined"],
    ["bold", "Bold text"],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

export const LIMITS = { barWidth: [0, 8], lineWidth: [0.5, 2], radius: [0, 12] } as const;

/** Classic is exactly the look the documents had before templates. */
export const PRESETS: Record<Preset, DocStyle> = {
  classic: {
    preset: "classic",
    accent: "",
    text: "#171717",
    font: "jakarta",
    size: "normal",
    header: "split",
    logoSize: "m",
    bar: "gradient",
    barWidth: 3,
    headFill: "accent",
    headText: "",
    rowLines: "horizontal",
    lineColor: "#e5e5e5",
    lineWidth: 1,
    lineStyle: "solid",
    tableBorder: false,
    zebra: true,
    rowHeight: "compact",
    radius: 8,
    panel: "tinted",
    total: "filled",
    showNumbers: true,
    showWords: true,
    showPreparedBy: true,
    showSignature: false,
    footerText: "",
  },
  bold: {
    preset: "bold",
    accent: "",
    text: "#111827",
    font: "inter",
    size: "normal",
    header: "band",
    logoSize: "m",
    bar: "none",
    barWidth: 3,
    headFill: "dark",
    headText: "",
    rowLines: "horizontal",
    lineColor: "#e2e8f0",
    lineWidth: 1,
    lineStyle: "solid",
    tableBorder: false,
    zebra: true,
    rowHeight: "comfortable",
    radius: 4,
    panel: "outlined",
    total: "filled",
    showNumbers: true,
    showWords: true,
    showPreparedBy: true,
    showSignature: false,
    footerText: "",
  },
  minimal: {
    preset: "minimal",
    accent: "",
    text: "#111111",
    font: "geist",
    size: "normal",
    header: "split",
    logoSize: "s",
    bar: "solid",
    barWidth: 1,
    headFill: "none",
    headText: "",
    rowLines: "horizontal",
    lineColor: "#d4d4d4",
    lineWidth: 0.5,
    lineStyle: "solid",
    tableBorder: false,
    zebra: false,
    rowHeight: "comfortable",
    radius: 0,
    panel: "plain",
    total: "bold",
    showNumbers: false,
    showWords: true,
    showPreparedBy: true,
    showSignature: false,
    footerText: "",
  },
};

export const PRESET_LABELS: Record<Preset, { label: string; hint: string }> = {
  classic: { label: "Classic", hint: "Logo left, coloured table head, tinted panels" },
  bold: { label: "Bold", hint: "Colour band across the top, dark table head" },
  minimal: { label: "Minimal", hint: "Black and white, thin rules, colour only on the title" },
};

/** The saved setting: one style for every document, and optionally a different one for quotations. */
export interface DocStyles {
  all: DocStyle;
  quote: DocStyle | null;
}

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const oneOf = <T extends string>(v: unknown, list: readonly (readonly [T, string])[], d: T): T => (list.some(([k]) => k === v) ? (v as T) : d);
const num = (v: unknown, [min, max]: readonly [number, number], d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Cleans a style from anywhere (saved JSON, form state): missing or bad values come from its preset. */
export function normalizeDocStyle(raw: unknown): DocStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const preset: Preset = (PRESETS_LIST as readonly unknown[]).includes(r.preset) ? (r.preset as Preset) : "classic";
  const d = PRESETS[preset];
  return {
    preset,
    accent: r.accent === "" ? "" : isHex(r.accent) ? r.accent : d.accent,
    text: isHex(r.text) ? r.text : d.text,
    font: oneOf(r.font, OPTIONS.font, d.font),
    size: oneOf(r.size, OPTIONS.size, d.size),
    header: oneOf(r.header, OPTIONS.header, d.header),
    logoSize: oneOf(r.logoSize, OPTIONS.logoSize, d.logoSize),
    bar: oneOf(r.bar, OPTIONS.bar, d.bar),
    barWidth: num(r.barWidth, LIMITS.barWidth, d.barWidth),
    headFill: oneOf(r.headFill, OPTIONS.headFill, d.headFill),
    headText: r.headText === "" ? "" : isHex(r.headText) ? r.headText : d.headText,
    rowLines: oneOf(r.rowLines, OPTIONS.rowLines, d.rowLines),
    lineColor: isHex(r.lineColor) ? r.lineColor : d.lineColor,
    lineWidth: num(r.lineWidth, LIMITS.lineWidth, d.lineWidth),
    lineStyle: oneOf(r.lineStyle, OPTIONS.lineStyle, d.lineStyle),
    tableBorder: bool(r.tableBorder, d.tableBorder),
    zebra: bool(r.zebra, d.zebra),
    rowHeight: oneOf(r.rowHeight, OPTIONS.rowHeight, d.rowHeight),
    radius: num(r.radius, LIMITS.radius, d.radius),
    panel: oneOf(r.panel, OPTIONS.panel, d.panel),
    total: oneOf(r.total, OPTIONS.total, d.total),
    showNumbers: bool(r.showNumbers, d.showNumbers),
    showWords: bool(r.showWords, d.showWords),
    showPreparedBy: bool(r.showPreparedBy, d.showPreparedBy),
    showSignature: bool(r.showSignature, d.showSignature),
    footerText: typeof r.footerText === "string" ? r.footerText.slice(0, 160) : d.footerText,
  };
}

/** The `doc_style` setting as saved ("" or bad JSON = Classic for everything). */
export function parseDocStyles(json: string): DocStyles {
  let raw: Record<string, unknown> = {};
  try {
    const v = JSON.parse(json || "{}");
    if (v && typeof v === "object") raw = v;
  } catch {
    // a broken value prints Classic rather than failing the document
  }
  return { all: normalizeDocStyle(raw.all), quote: raw.quote ? normalizeDocStyle(raw.quote) : null };
}

/** The style one kind of document prints with. */
export const styleFor = (s: DocStyles, kind: "quote" | "invoice"): DocStyle => (kind === "quote" && s.quote ? s.quote : s.all);

// ---- turning a style into what the parts draw ----

export const DEFAULT_ACCENT = "#048b3e";
export const safeColor = (c: string) => (isHex(c) ? c : DEFAULT_ACCENT);
/** A colour mixed into white, for soft panels that still print. */
export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;

/** Black or white, whichever reads better on `bg`. */
export function onColor(bg: string): string {
  const h = safeColor(bg).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#111111" : "#ffffff";
}

/** The style with its accent filled in (the brand colour when the style has none). */
export const withAccent = (s: DocStyle, brandColor: string): DocStyle => ({ ...s, accent: safeColor(s.accent || brandColor) });

/**
 * CSS custom properties on the sheet; the table rules in globals.css (.zx-doc) read them, so the parts need no
 * per-cell styling. `s.accent` must already be filled in (withAccent).
 */
export function docStyleVars(s: DocStyle): CSSProperties {
  const a = safeColor(s.accent);
  const thBg = s.headFill === "accent" ? a : s.headFill === "dark" ? "#1f2937" : s.headFill === "tint" ? tint(a, 12) : "transparent";
  const thFg = s.headText || (s.headFill === "accent" ? onColor(a) : s.headFill === "dark" ? "#ffffff" : s.text);
  return {
    "--doc-accent": a,
    "--doc-text": s.text,
    "--doc-th-bg": thBg,
    "--doc-th-fg": thFg,
    "--doc-line": s.lineColor,
    "--doc-lw": `${s.lineWidth}px`,
    "--doc-ls": s.lineStyle,
    "--doc-radius": `${s.radius}px`,
    "--doc-zebra": s.zebra ? "#fafbfa" : "transparent",
    "--doc-py": s.rowHeight === "compact" ? "0.375rem" : "0.5625rem",
    zoom: s.size === "compact" ? 0.94 : s.size === "large" ? 1.06 : undefined,
  } as CSSProperties;
}

/** Class of each document typeface (@font-face rules in globals.css, files in public/fonts). */
export const DOC_FONTS: Record<DocStyle["font"], string> = { jakarta: "zx-font-jakarta", geist: "zx-font-geist", inter: "zx-font-inter", serif: "zx-font-serif" };

export const LOGO_SIZE = { s: "max-h-10 max-w-40", m: "max-h-14 max-w-52", l: "max-h-18 max-w-64" } as const;
