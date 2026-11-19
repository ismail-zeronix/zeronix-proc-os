import type { Block, BlockType, FontKey, NewsDoc, NewsStyle } from "./types";

/** The section types a newsletter is built from, what each one asks for, and the starting text of a new one. Pure data, shared by the editor and the renderer. */

export interface FieldSpec {
  key: string;
  label: string;
  kind: "text" | "area" | "url" | "select" | "lines";
  options?: [value: string, label: string][];
  rows?: number;
  hint?: string;
}

export interface BlockDef {
  type: BlockType;
  label: string;
  hint: string;
  fields: FieldSpec[];
  defaults: Record<string, string>;
}

const BG: FieldSpec = {
  key: "bg",
  label: "Background",
  kind: "select",
  options: [
    ["white", "White"],
    ["soft", "Soft tint"],
    ["dark", "Dark (brand colour)"],
  ],
};
const ALIGN: FieldSpec = {
  key: "align",
  label: "Alignment",
  kind: "select",
  options: [
    ["left", "Left"],
    ["center", "Centre"],
  ],
};
const FORMAT = "Blank line = new paragraph. **bold**, [link text](https://...), lines starting with - make a bullet list, {name} = the reader's first name.";

export const BLOCK_DEFS: BlockDef[] = [
  {
    type: "hero",
    label: "Banner",
    hint: "Big title with a coloured background",
    fields: [
      { key: "eyebrow", label: "Small label above the title", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Text under the title", kind: "area", rows: 3, hint: FORMAT },
      { key: "buttonLabel", label: "Button text", kind: "text" },
      { key: "buttonUrl", label: "Button link", kind: "url" },
      { key: "image", label: "Wide picture under the banner (optional)", kind: "url", hint: "Paste a picture address (https). About 1200 px wide works best." },
      {
        key: "tone",
        label: "Colour",
        kind: "select",
        options: [
          ["dark", "Dark (brand colour)"],
          ["accent", "Bright (accent colour)"],
          ["light", "Light"],
        ],
      },
      ALIGN,
    ],
    defaults: { eyebrow: "New", title: "Your headline goes here", text: "One or two lines that explain the offer.", buttonLabel: "Learn more", buttonUrl: "", image: "", tone: "dark", align: "left" },
  },
  {
    type: "heading",
    label: "Heading",
    hint: "A title for the next section",
    fields: [
      { key: "text", label: "Heading", kind: "text" },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          ["s", "Small"],
          ["m", "Medium"],
          ["l", "Large"],
        ],
      },
      ALIGN,
      BG,
    ],
    defaults: { text: "A new section", size: "m", align: "left", bg: "white" },
  },
  {
    type: "text",
    label: "Paragraph",
    hint: "Text, with bold, links and bullet lists",
    fields: [{ key: "text", label: "Text", kind: "area", rows: 6, hint: FORMAT }, ALIGN, BG],
    defaults: { text: "Write your message here.\n\nA blank line starts a new paragraph.", align: "left", bg: "white" },
  },
  {
    type: "image",
    label: "Picture",
    hint: "A picture from an address",
    fields: [
      { key: "src", label: "Picture address", kind: "url", hint: "Paste an https address ending in .jpg or .png (a website picture or your own hosting)." },
      { key: "alt", label: "Description (shown if the picture is blocked)", kind: "text" },
      { key: "href", label: "Link when clicked (optional)", kind: "url" },
      {
        key: "width",
        label: "Width",
        kind: "select",
        options: [
          ["inset", "With side margins"],
          ["full", "Full width"],
        ],
      },
    ],
    defaults: { src: "", alt: "", href: "", width: "inset" },
  },
  {
    type: "button",
    label: "Button",
    hint: "A clear call to action",
    fields: [
      { key: "label", label: "Button text", kind: "text" },
      { key: "url", label: "Link", kind: "url" },
      {
        key: "tone",
        label: "Style",
        kind: "select",
        options: [
          ["accent", "Solid (accent colour)"],
          ["dark", "Solid (brand colour)"],
          ["outline", "Outline"],
        ],
      },
      ALIGN,
    ],
    defaults: { label: "Get a quotation", url: "", tone: "accent", align: "left" },
  },
  {
    type: "points",
    label: "List of points",
    hint: "Services or benefits with short text",
    fields: [
      { key: "title", label: "Small heading (optional)", kind: "text" },
      { key: "lines", label: "Points", kind: "lines", rows: 6, hint: "One point per line: Title | short text" },
      {
        key: "look",
        label: "Look",
        kind: "select",
        options: [
          ["cards", "Cards"],
          ["numbers", "Numbered"],
          ["bar", "Side bar"],
        ],
      },
      BG,
    ],
    defaults: { title: "What we do", lines: "First point | A short line that explains it.\nSecond point | A short line that explains it.\nThird point | A short line that explains it.", look: "cards", bg: "white" },
  },
  {
    type: "stats",
    label: "Key numbers",
    hint: "Two to four big figures in a row",
    fields: [{ key: "lines", label: "Figures", kind: "lines", rows: 4, hint: "One per line: Big text | label, for example 5 | Service areas. Only use figures that are true." }],
    defaults: { lines: "1 | UAE team\n5 | Service areas\nDubai | Based in the UAE" },
  },
  {
    type: "feature",
    label: "Picture and text",
    hint: "A picture beside a short message",
    fields: [
      { key: "image", label: "Picture address", kind: "url", hint: "Leave empty for text only." },
      {
        key: "imageSide",
        label: "Picture on the",
        kind: "select",
        options: [
          ["left", "Left"],
          ["right", "Right"],
        ],
      },
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Text", kind: "area", rows: 4, hint: FORMAT },
      { key: "buttonLabel", label: "Link text (optional)", kind: "text" },
      { key: "buttonUrl", label: "Link", kind: "url" },
      BG,
    ],
    defaults: { image: "", imageSide: "left", title: "A feature or a product", text: "Say what it is and why it matters in two or three lines.", buttonLabel: "Read more", buttonUrl: "", bg: "white" },
  },
  {
    type: "callout",
    label: "Highlight box",
    hint: "An offer or an important line",
    fields: [
      { key: "text", label: "Text", kind: "text", hint: "Leave empty to hide this box." },
      {
        key: "tone",
        label: "Colour",
        kind: "select",
        options: [
          ["soft", "Soft tint"],
          ["accent", "Bright (accent colour)"],
          ["dark", "Dark (brand colour)"],
        ],
      },
    ],
    defaults: { text: "Write the offer or the important line here. Only say what is true.", tone: "soft" },
  },
  {
    type: "products",
    label: "Products",
    hint: "Cards for products from the website",
    fields: [
      { key: "title", label: "Small heading (optional)", kind: "text" },
      {
        key: "columns",
        label: "Cards per row",
        kind: "select",
        options: [
          ["2", "2"],
          ["3", "3"],
        ],
      },
      BG,
    ],
    defaults: { title: "Featured products", columns: "2", bg: "white" },
  },
  {
    type: "cta",
    label: "Call-to-action band",
    hint: "A coloured strip with a button",
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Text", kind: "area", rows: 2 },
      { key: "buttonLabel", label: "Button text", kind: "text" },
      { key: "buttonUrl", label: "Button link", kind: "url" },
      {
        key: "tone",
        label: "Colour",
        kind: "select",
        options: [
          ["accent", "Bright (accent colour)"],
          ["dark", "Dark (brand colour)"],
        ],
      },
    ],
    defaults: { title: "Ready to talk?", text: "Reply to this email or press the button and we will come back to you.", buttonLabel: "Request a quote", buttonUrl: "", tone: "accent" },
  },
  { type: "divider", label: "Divider line", hint: "A thin line between sections", fields: [], defaults: {} },
  {
    type: "spacer",
    label: "Space",
    hint: "Empty space between sections",
    fields: [
      {
        key: "size",
        label: "Height",
        kind: "select",
        options: [
          ["16", "Small"],
          ["32", "Medium"],
          ["48", "Large"],
        ],
      },
    ],
    defaults: { size: "32" },
  },
];

export const blockDef = (t: BlockType): BlockDef => BLOCK_DEFS.find((d) => d.type === t)!;
const TYPES = new Set<string>(BLOCK_DEFS.map((d) => d.type));

let counter = 0;
export const blockId = () => `b${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function newBlock(type: BlockType, p: Record<string, string> = {}, ids?: number[]): Block {
  return { id: blockId(), type, p: { ...blockDef(type).defaults, ...p }, ...(type === "products" ? { ids: ids ?? [] } : {}) };
}

// ---------- fonts and colours ----------

export const FONTS: Record<FontKey, { label: string; stack: string }> = {
  arial: { label: "Arial (clean, neutral)", stack: "Arial,Helvetica,sans-serif" },
  segoe: { label: "Segoe UI (modern)", stack: "'Segoe UI',Tahoma,Geneva,Verdana,sans-serif" },
  verdana: { label: "Verdana (wide, easy to read)", stack: "Verdana,Geneva,sans-serif" },
  trebuchet: { label: "Trebuchet (friendly)", stack: "'Trebuchet MS',Helvetica,sans-serif" },
  georgia: { label: "Georgia (classic serif)", stack: "Georgia,'Times New Roman',serif" },
  times: { label: "Times New Roman (formal serif)", stack: "'Times New Roman',Times,serif" },
};

export interface ThemeDef {
  key: string;
  label: string;
  brand: string;
  accent: string;
  page: string;
}
export const THEMES: ThemeDef[] = [
  { key: "zeronix", label: "Zeronix navy and mint", brand: "#0F2747", accent: "#2BD9A0", page: "#E9EFF6" },
  { key: "ocean", label: "Ocean and amber", brand: "#0B3C5D", accent: "#F5B841", page: "#EAF1F6" },
  { key: "graphite", label: "Graphite and lime", brand: "#1F2933", accent: "#A3E635", page: "#EEF0F2" },
  { key: "forest", label: "Forest and gold", brand: "#123D2E", accent: "#F2C14E", page: "#EDF3EF" },
  { key: "plum", label: "Plum and coral", brand: "#3B1F5C", accent: "#FF8A7A", page: "#F1ECF6" },
  { key: "crimson", label: "Wine and sand", brand: "#4A0E1B", accent: "#E9C46A", page: "#F6EDEE" },
];

export const DEFAULT_STYLE: NewsStyle = { headingFont: "arial", bodyFont: "arial", brand: "#0F2747", accent: "#2BD9A0", page: "#E9EFF6", round: true, logo: true };

export const isHex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);

/** Anything read back from the database or a form becomes a safe design: unknown fonts, colours and sections are replaced or dropped. */
export function normDoc(raw: unknown): NewsDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { style?: Partial<NewsStyle>; blocks?: unknown };
  if (!Array.isArray(r.blocks)) return null;
  const s = r.style ?? {};
  const style: NewsStyle = {
    headingFont: s.headingFont && s.headingFont in FONTS ? s.headingFont : DEFAULT_STYLE.headingFont,
    bodyFont: s.bodyFont && s.bodyFont in FONTS ? s.bodyFont : DEFAULT_STYLE.bodyFont,
    brand: isHex(s.brand) ? s.brand : DEFAULT_STYLE.brand,
    accent: isHex(s.accent) ? s.accent : DEFAULT_STYLE.accent,
    page: isHex(s.page) ? s.page : DEFAULT_STYLE.page,
    round: s.round !== false,
    logo: s.logo !== false,
  };
  const blocks: Block[] = [];
  for (const b of r.blocks as Partial<Block>[]) {
    if (!b || typeof b.type !== "string" || !TYPES.has(b.type)) continue;
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.p ?? {})) if (typeof v === "string") p[k] = v;
    blocks.push({ id: typeof b.id === "string" && b.id ? b.id : blockId(), type: b.type, p, ...(Array.isArray(b.ids) ? { ids: b.ids.filter((n): n is number => Number.isInteger(n)).slice(0, 12) } : {}) });
  }
  return { v: 1, style, blocks };
}

/** The design with a colour theme applied (an unknown or empty key leaves it as designed). */
export function withTheme(doc: NewsDoc, key: string | null | undefined): NewsDoc {
  const t = THEMES.find((x) => x.key === key);
  return t ? { ...doc, style: { ...doc.style, brand: t.brand, accent: t.accent, page: t.page } } : doc;
}

/** Every website product used by any products section, in order, without repeats. */
export const docProductIds = (doc: NewsDoc): number[] => [...new Set(doc.blocks.flatMap((b) => (b.type === "products" ? (b.ids ?? []) : [])))];
