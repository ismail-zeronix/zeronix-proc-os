/**
 * Rule-based reader for a supplier's live stock sheet: two columns, "model + specs" in one cell and the
 * price next to it, with brand/section heading rows ("ACER LAPTOPS", "DESKTOP & AIO") in between. No AI:
 * the sheet is structured, so rules are exact and instant, which matters because it is re-read every few
 * minutes on a machine with little RAM.
 */
import type { OfferDraft } from "@/lib/llm/schema";
import { parseCsv } from "./csv";
import { detectBrand } from "./excel";
import { matchKey } from "./match";
import { normalizeBrand, normalizePartNumber } from "./postfix";

type Category = OfferDraft["category"];

export interface StockSheetResult {
  drafts: OfferDraft[];
  skipped: { row: number; reason: string }[];
  warnings: string[];
}

const clean = (s: string) =>
  s.replace(/[“”]/g, '"').replace(/''/g, '"').replace(/[®™]/g, "").replace(/\s+/g, " ").trim();

function parsePriceCell(s: string): number | null {
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function currencyOf(s: string, fallback: string): string {
  if (/\$|USD/i.test(s)) return "USD";
  if (/AED|DHS?/i.test(s)) return "AED";
  if (/€|EUR/i.test(s)) return "EUR";
  if (/£|GBP/i.test(s)) return "GBP";
  return fallback;
}

// ---------- brand, model, part number ----------

const BRAND_EXCEPTIONS: Record<string, string> = { abs: "ABS", ibuypower: "iBuyPower" };

function brandFromFirstWord(title: string): string {
  const w = title.split(" ")[0] ?? "";
  return BRAND_EXCEPTIONS[w.toLowerCase()] ?? normalizeBrand(w);
}

const WORD_CASE: Record<string, string> = {
  thinkpad: "ThinkPad", ideapad: "IdeaPad", vivobook: "VivoBook", zenbook: "ZenBook", expertbook: "ExpertBook",
  rog: "ROG", tuf: "TUF", loq: "LOQ", xps: "XPS", ideacentre: "IdeaCentre", thinkcentre: "ThinkCentre",
  prodesk: "ProDesk", elitebook: "EliteBook", probook: "ProBook", omnibook: "OmniBook", aio: "AIO",
  macbook: "MacBook", chromebook: "Chromebook",
};

/** "IDEAPAD SLIM 3 15IAN8" -> "IdeaPad Slim 3 15IAN8". Text that already has lower case is left alone. */
function tidyName(s: string): string {
  if (/[a-z]/.test(s)) return s;
  return s
    .split(" ")
    .map((w) => {
      const known = WORD_CASE[w.toLowerCase()];
      if (known) return known;
      if (/\d/.test(w) || w.length <= 3) return w;
      return w[0] + w.slice(1).toLowerCase();
    })
    .join(" ");
}

const HP_CODE = /\b(\d{2}[A-Z]?)-[A-Z]{2}\d{4}[A-Z0-9]{0,3}\b/i;
const PAREN_CODE = /\(([A-Z0-9][A-Z0-9._#/-]{3,24})\)/gi;
const TRAILING_CODE = /^[A-Z0-9][A-Z0-9#._-]{5,19}$/i;

function isCodeLike(t: string): boolean {
  if (!/\d/.test(t) || !/[A-Z]/i.test(t)) return false;
  if (/^\d+(GB|TB)\b/i.test(t) || /^(DDR|LPDDR|RTX|GTX|WUXGA|FHD|QHD)/i.test(t)) return false;
  // a CPU written as one token ("I7-1355U", "5-120U") is not a part number
  return !/^[A-Z]?\d{1,2}-[A-Z]?\d{3,5}[A-Z]{0,2}$/i.test(t);
}

function findPartNumber(title: string, rest: string): string {
  const hp = title.match(HP_CODE);
  if (hp) return normalizePartNumber(hp[0]);
  for (const m of `${title} ${rest}`.matchAll(PAREN_CODE)) if (isCodeLike(m[1])) return normalizePartNumber(m[1]);
  const tokens = rest.split(",").map((t) => t.trim());
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (TRAILING_CODE.test(tokens[i]) && isCodeLike(tokens[i])) return normalizePartNumber(tokens[i]);
  }
  return "";
}

function modelNameOf(title: string, brand: string, category: Category): string {
  let m = title.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  m = m.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");

  // "ROG STRIX G16 16" WUXGA" -> drop the screen size, but keep it in "CROSSHAIR 16""
  const tail = m.match(/^(.*?)\s+\d{2}(?:\.\d)?"((?:\s+(?:WUXGA|FHD|HD|QHD|2K|3K|4K|OLED|AI|TOUCH))*)\s*$/i);
  if (tail && /\d/.test(tail[1].split(" ").pop() ?? "")) m = tail[1];
  m = m.replace(/"/g, "").trim();

  const hp = m.match(HP_CODE);
  if (hp) {
    m = m.replace(HP_CODE, "").replace(/\s+/g, " ").trim();
    m = m ? `${m} ${hp[1]}` : `${category === "laptop" ? "Laptop" : "PC"} ${hp[1]}`;
  }
  return tidyName(m).slice(0, 80);
}

// ---------- specs ----------

const capWords = (s: string) => s.replace(/[A-Z]{2,}/g, (w) => w[0] + w.slice(1).toLowerCase());

function cpuFrom(u: string): string {
  let m = u.match(/ULTRA\s*([3579])[\s-]*(\d{3}[A-Z]{0,2})(?![A-Z])/);
  if (m) return `Core Ultra ${m[1]} ${m[2]}`;
  m = u.match(/\bCORE\s*([357])[\s-]+(\d{3}[A-Z]{0,2})(?![A-Z])/);
  if (m) return `Core ${m[1]} ${m[2]}`;
  m = u.match(/\b(?:COR(?:E)?\s*)?I([3579])[\s-]*(N?\d{3,5}[A-Z]{0,2})(?![A-Z])/);
  if (m) return `Core i${m[1]}-${m[2]}`;
  m = u.match(/RYZEN\s*(?:AI\s*)?([3579])[\s-]*(?:PRO\s*)?(\d{2,4}[A-Z]{0,2})(?![A-Z])/);
  if (m) return `Ryzen ${m[1]} ${m[2]}`;
  m = u.match(/INTEL\s+(N\d{2,3})\b/);
  if (m) return `Intel ${m[1]}`;
  m = u.match(/SNAPDRAGON\s+(X\d*(?:-\d+)+|X\s+(?:PLUS|ELITE)|X\b)/);
  if (m) return `Snapdragon ${capWords(m[1])}`;
  m = u.match(/MEDIATEK\s+KOMPANIO\s*(\d+)/);
  if (m) return `MediaTek Kompanio ${m[1]}`;
  return "";
}

function ramFrom(u: string): { gb: number | null; span: string } {
  const m = u.match(/(\d{1,3})\s*GB\s*(?:LP)?DDR\d?X?/) ?? u.match(/(\d{1,3})\s*GB\s*RAM/);
  return m ? { gb: Number(m[1]), span: m[0] } : { gb: null, span: "" };
}

function storageFrom(u: string, ramSpan: string): string {
  const typed = u.match(/(\d+(?:\.\d)?)\s*(GB|TB)\s*(SSD|UFS|EMMC|EMCC|HDD|NVME)/);
  if (typed) {
    const kind = { EMMC: "eMMC", EMCC: "eMMC", NVME: "NVMe" }[typed[3]] ?? typed[3];
    return `${Number(typed[1])}${typed[2]} ${kind}`;
  }
  // "8GB DDR5 512GB DOS": a size with no type, that is not the RAM and not a graphics card's memory
  const rest = ramSpan ? u.replace(ramSpan, " ") : u;
  for (const m of rest.matchAll(/(?<![-(\d])(\d+)\s*(GB|TB)\b/g)) {
    const gb = Number(m[1]) * (m[2] === "TB" ? 1024 : 1);
    if (gb >= 64) return `${m[1]}${m[2]}`;
  }
  return "";
}

function displayFrom(text: string, u: string): string {
  const size =
    text.match(/(?<![\d.])(\d{2}(?:\.\d)?)\s*"/)?.[1] ??
    u.match(/(?<![\d.])((?:1\d|2\d|3[0-2])(?:\.\d)?)\s+(?=FHD|WUXGA|HD|QHD|2K|3K|4K)/)?.[1];
  const res = u.match(/\b(WUXGA|WQXGA|WQHD|QHD|UHD|FHD|HD\+?|2K|3K|4K)\b/)?.[1];
  const hz = u.match(/(\d{2,3})\s*HZ/)?.[1];
  const parts = [res, /OLED/.test(u) ? "OLED" : "", /TOUCH/.test(u) ? "Touch" : "", hz ? `${hz}Hz` : ""].filter(Boolean);
  if (!size && !parts.length) return "";
  return [size ? `${size}"` : "", ...parts].filter(Boolean).join(" ");
}

function gpuFrom(u: string): string {
  const mx = u.match(/GEFORCE\s+(MX\d{3})(?:\s*(\d+)\s*GB)?/);
  if (mx) return `GeForce ${mx[1]}${mx[2] ? ` ${mx[2]}GB` : ""}`;
  const m = u.match(/(RTX|GTX)\s*(\d{3,4})\s*(TI|SUPER)?(?:\s*[-(]?\s*(\d{1,2})\s*GB\)?)?/);
  if (!m) return "";
  return [m[1], m[2], m[3] ? m[3][0] + m[3].slice(1).toLowerCase() : "", m[4] ? `${m[4]}GB` : ""].filter(Boolean).join(" ");
}

function osFrom(u: string): string {
  const w = u.match(/WINDOWS\s*(\d+)\s*(HOME\s*S\b|HOME|PRO|S\b)?/) ?? u.match(/\bWIN\s*(\d+)\s*(HOME|PRO)?/);
  if (w) {
    const edition = (w[2] ?? "").trim();
    return `Win ${w[1]}${edition ? " " + capWords(edition) : ""}`;
  }
  if (/CHROME\s*OS/.test(u)) return "ChromeOS";
  if (/\bDOS\b/.test(u)) return "DOS";
  if (/UBUNTU|LINUX/.test(u)) return "Linux";
  return "";
}

function extrasFrom(u: string): string[] {
  const out: string[] = [];
  if (/\bEN\s*[/-]\s*AR\b|\bAR\s*\/\s*EN\b/.test(u)) out.push("EN/AR KB");
  else if (/\bEN\s*[/-]\s*IT\b/.test(u)) out.push("EN/IT KB");
  else if (/\bARABIC\b/.test(u)) out.push("Arabic KB");
  else if (/\bENG?\b(?!\s*[/-])/.test(u)) out.push("EN KB");
  const office = u.match(/(\d+)\s*(MONTH|YEAR)S?\s*OFFICE/);
  if (office) out.push(`Office ${office[1]}${office[2][0]}`);
  if (/(KB|KEYBOARD)\s*&\s*MOUSE/.test(u)) out.push("KB & mouse");
  return out;
}

// ---------- the sheet ----------

function categoryFor(heading: string, title: string): Category {
  if (/\bAIO\b|ALL[- ]IN[- ]ONE/i.test(title)) return "all-in-one";
  if (/desktop|\bAIO\b|all[- ]in[- ]one|\bpc\b|tower/i.test(heading)) return "desktop";
  if (/monitor/i.test(heading)) return "monitor";
  return "laptop";
}

export function parseStockSheet(csv: string, opts: { currency: string }): StockSheetResult {
  const rows = parseCsv(csv);
  const result: StockSheetResult = { drafts: [], skipped: [], warnings: [] };
  let heading = "";

  rows.forEach((r, i) => {
    const rowNo = i + 1;
    const cell = (r[0] ?? "").trim();
    const priceCell = (r[1] ?? "").trim();
    if (!cell && !priceCell) return;
    if (!cell) {
      result.skipped.push({ row: rowNo, reason: "Price without a description" });
      return;
    }
    // a one-line cell with no price is a section heading ("ACER LAPTOPS", "DESKTOP & AIO")
    if (!priceCell && !cell.includes("\n") && cell.length < 60) {
      heading = clean(cell);
      return;
    }

    const lines = cell.split(/\r?\n/).map(clean).filter(Boolean);
    const title = lines[0];
    const rest = lines.slice(1).join(" ");
    const text = clean(lines.join(" "));
    const u = text.toUpperCase();
    const price = parsePriceCell(priceCell);

    const brand = detectBrand(title) || detectBrand(heading) || brandFromFirstWord(title);
    const category = categoryFor(heading, title);
    const spec = {
      cpu: cpuFrom(u),
      ram: ramFrom(u),
    };
    const partNumber = findPartNumber(title, rest);
    const modelName = modelNameOf(title, brand, category);

    const flags: string[] = [];
    if (price == null) flags.push(priceCell ? `Price column says "${priceCell}"` : "No price in the sheet");
    if (!spec.cpu) flags.push("CPU not recognised");
    if (spec.ram.gb == null) flags.push("RAM not recognised");
    if (!modelName) flags.push("Model name missing");

    result.drafts.push({
      key: `f${rowNo}`,
      category,
      brand,
      modelName: modelName || title.slice(0, 80),
      partNumber,
      cpu: spec.cpu,
      ramGb: spec.ram.gb,
      storage: storageFrom(u, spec.ram.span),
      display: displayFrom(text, u),
      gpu: gpuFrom(u),
      os: osFrom(u),
      extras: extrasFrom(u).join(" · ").slice(0, 120),
      condition: "new",
      price,
      currency: currencyOf(priceCell, opts.currency),
      priceBasis: "",
      stockNote: "In stock",
      rawText: `${text} | ${priceCell}`.slice(0, 1200),
      confidence: Math.max(0.1, Math.round((1 - flags.length * 0.2) * 100) / 100),
      flags,
      productId: null,
      productLabel: "",
      suggestedProductId: null,
      suggestedLabel: "",
      include: true,
    });
  });

  // the same product listed twice (e.g. two keyboard layouts): keep the lowest price
  const best = new Map<string, OfferDraft>();
  let duplicates = 0;
  for (const d of result.drafts) {
    const k = matchKey(d);
    const prev = best.get(k);
    if (!prev) {
      best.set(k, d);
      continue;
    }
    duplicates++;
    if (d.price != null && (prev.price == null || d.price < prev.price)) best.set(k, d);
  }
  if (duplicates) {
    result.drafts = [...best.values()];
    result.warnings.push(`${duplicates} product${duplicates === 1 ? " is" : "s are"} listed twice; the lowest price was kept.`);
  }
  return result;
}
