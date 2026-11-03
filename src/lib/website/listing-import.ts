/**
 * "Import listing" (Website › Products): reads a shop's category-page JSON pasted by the owner and turns each item into
 * the facts we keep: part number, brand, our short name, specs read from the title, category and reference price.
 * Pictures, links, ids and seller names in the listing are ignored. No database here, so it can be tested.
 */

export interface ListingItem {
  mpn: string;
  brand: string;
  /** Our name: "Lenovo ThinkPad E14 Gen 7, Core Ultra 5 226V, 16GB RAM, 512GB SSD". */
  name: string;
  /** Our category slug, or "" when the listing's category has no match. */
  category: string;
  /** The listing's own category name, for the warning when it has no match. */
  sourceCategory: string;
  /** AED with VAT, "4149.00"; null when the listing has no price. */
  price: string | null;
  specs: Record<string, string>;
  keyboard: string;
  highlights: string[];
  /** The listing's product page; the worker reads its picture gallery. "" when the listing has none. */
  pageUrl: string;
}

export interface ListingRead {
  items: ListingItem[];
  /** Lines that could not be used, with the reason. */
  skipped: string[];
}

/** Splits text holding one or more JSON values pasted one after another (several category pages) and parses each. */
export function parseJsonValues(text: string): unknown[] {
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          throw new Error("Part of the pasted text is not valid JSON. Copy the whole response again.");
        }
        start = -1;
      }
      if (depth < 0) throw new Error("The pasted JSON has an extra closing bracket.");
    }
  }
  if (depth !== 0) throw new Error("The pasted JSON is cut off: it does not close. Copy the whole response again.");
  return out;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Series names that stand in for the brand at the start of a title ("ThinkPad X1 Carbon …"). */
const SERIES: Record<string, string> = {
  thinkpad: "Lenovo",
  thinkbook: "Lenovo",
  thinkcentre: "Lenovo",
  thinkstation: "Lenovo",
  thinkvision: "Lenovo",
  ideapad: "Lenovo",
  ideacentre: "Lenovo",
  yoga: "Lenovo",
  legion: "Lenovo",
  loq: "Lenovo",
  probook: "HP",
  elitebook: "HP",
  omnibook: "HP",
  victus: "HP",
  omen: "HP",
  envy: "HP",
  pavilion: "HP",
  latitude: "Dell",
  inspiron: "Dell",
  vostro: "Dell",
  precision: "Dell",
  alienware: "Dell",
  xps: "Dell",
  macbook: "Apple",
  imac: "Apple",
  zenbook: "ASUS",
  vivobook: "ASUS",
  rog: "ASUS",
  tuf: "ASUS",
  aspire: "Acer",
  nitro: "Acer",
  predator: "Acer",
  swift: "Acer",
};

/** The listing's category name → our category slug. Order matters: "Mobile Workstations" is a workstation, not a laptop. */
const CATEGORY_RULES: [RegExp, string][] = [
  [/workstation/i, "workstations"],
  [/laptop|notebook|chromebook|macbook/i, "laptops"],
  [/all.in.one|desktop|mini pc|tower/i, "desktops"],
  [/monitor|display/i, "monitors"],
  [/server/i, "servers"],
  [/software|operating system|office|antivirus|licen[cs]e/i, "software"],
  [/dock|mouse|mice|keyboard|headset|headphone|bag|backpack|sleeve|adapter|charger|cable|webcam|hub|presenter|stand|accessor/i, "accessories"],
];

export function categoryFor(name: string): string {
  return CATEGORY_RULES.find(([re]) => re.test(name))?.[1] ?? "";
}

/** One comma part of the title → which spec it is. Order matters: "Intel Arc Graphics" is graphics, not the processor. */
const SPEC_RULES: [string, RegExp][] = [
  ["keyboard", /\bk\/b\b|keyboard/i],
  ["os", /^(windows|win\s?1[01]|no os|free\s?dos|dos|macos|chrome\s?os)\b/i],
  ["graphics", /graphics|geforce|\brtx\b|\bgtx\b|radeon|\bgpu\b/i],
  ["memory", /\bram\b|\d+\s?gb\s+(lp)?ddr/i],
  ["storage", /\b(ssd|hdd|emmc|ufs)\b/i],
  ["display", /"|display|\d\s?hz\b|\boled\b|\bips\b|\bfhd\b|wuxga|\bqhd\b|\buhd\b|\b[2-8]k\b/i],
  ["processor", /\b(intel|amd|ryzen|core|snapdragon|apple m\d|mediatek|celeron|pentium|xeon)\b/i],
];

/** "Lenovo ThinkPad E14 Gen 7 Laptop, 14" WUXGA …, Black | 21U2009MIG" → our facts. */
export function readTitle(title: string): Omit<ListingItem, "category" | "sourceCategory" | "price" | "pageUrl"> | { problem: string } {
  const bar = title.lastIndexOf("|");
  if (bar < 0) return { problem: "no part number in the title (after |)" };
  const mpn = title
    .slice(bar + 1)
    .split("/")[0]
    .trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9#.-]{3,40}$/.test(mpn)) return { problem: `"${mpn}" does not look like a part number` };
  const [first, ...rest] = title
    .slice(0, bar)
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const firstWord = first.split(/\s+/)[0];
  const seriesBrand = SERIES[firstWord.toLowerCase()];
  const brand = seriesBrand ?? firstWord;
  let base = first.replace(/\s+(gaming\s+)?(laptop|notebook|desktop pc|desktop)$/i, "").trim();
  if (seriesBrand) base = `${seriesBrand} ${base}`;

  const specs: Record<string, string> = {};
  const extras: string[] = [];
  let keyboard = "";
  for (const part of rest) {
    const key = SPEC_RULES.find(([, re]) => re.test(part))?.[0];
    if (key === "keyboard") keyboard ||= part.replace(/\bk\/b\b/i, "keyboard");
    else if (key && !specs[key]) specs[key] = part.replace(/\s+display$/i, "").replace(/\s+ram$/i, "");
    else extras.push(part);
  }

  const isPc = Boolean(specs.processor);
  if (isPc) {
    // the last short word-only part is the colour ("Black", "Luna Grey")
    const last = extras.at(-1);
    if (last && last.length <= 24 && !/\d/.test(last)) specs.colour = extras.pop()!;
    const cpu = specs.processor.replace(/^(intel|amd|apple|qualcomm)\s+/i, "");
    const parts = [cpu, specs.memory && `${specs.memory} RAM`, specs.storage].filter(Boolean);
    return { mpn, brand, name: [base, ...parts].join(", ").slice(0, 160), specs, keyboard, highlights: extras.slice(0, 8) };
  }
  // docks, monitors, mice: the title's parts say what matters, so they become the highlights
  return { mpn, brand, name: base.slice(0, 160), specs: {}, keyboard, highlights: rest.slice(0, 8) };
}

/**
 * The product's own gallery on a listing product page: the zoom links (`lightbox-opener`) in page order, large size,
 * each picture once. Related-product pictures elsewhere on the page are not zoom links, so they are left out.
 */
export function galleryLinks(html: string, max = 10): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\blightbox-opener\b[^>]*>/g)) {
    const href = m[0].match(/\bhref="(https:\/\/[^"]+\.(?:jpe?g|png|webp))"/i)?.[1];
    if (href && !out.includes(href)) out.push(href);
    if (out.length >= max) break;
  }
  return out;
}

function priceOf(p: Json): string | null {
  const n = Number(obj(p.prices).current ?? obj(p.active_offer).price);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** Every product in the pasted values: arrays of {category, products}, one such object, or plain product arrays. */
export function readListing(values: unknown[]): ListingRead {
  const items: ListingItem[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  const visit = (v: unknown, groupCategory: string) => {
    if (Array.isArray(v)) return v.forEach((x) => visit(x, groupCategory));
    const o = obj(v);
    if (Array.isArray(o.products)) return visit(o.products, str(obj(o.category).title) || groupCategory);
    const title = str(o.title);
    if (!title) return;
    const read = readTitle(title);
    if ("problem" in read) return void skipped.push(`${title.slice(0, 60)}…: ${read.problem}`);
    if (seen.has(read.mpn.toLowerCase())) return;
    seen.add(read.mpn.toLowerCase());
    const sourceCategory = str(obj((o.categories as unknown[] | undefined)?.[0]).name) || groupCategory;
    const pageUrl = /^https:\/\/[^\s"]{4,490}$/.test(str(o.url)) ? str(o.url) : "";
    items.push({ ...read, sourceCategory, category: categoryFor(sourceCategory) || categoryFor(groupCategory), price: priceOf(o), pageUrl });
  };
  values.forEach((v) => visit(v, ""));
  return { items, skipped };
}
