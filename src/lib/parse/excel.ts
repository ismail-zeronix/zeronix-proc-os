/**
 * Rule-based reader for distributor price lists in Excel (one sheet per product category, a header
 * row, group headings, a P/N + description + price + stock layout). No AI is involved: the sheets are
 * structured, so rules are exact, instant and repeatable. Pure functions on a grid of cells so they
 * can be tested without a file; `readWorkbook` (server only) turns an .xlsx into that grid.
 */
import type { OfferDraft } from "@/lib/llm/schema";
import { normalizePartNumber } from "./postfix";

export type Cell = string | number | null;
export interface SheetGrid {
  name: string;
  /** rows[0] is Excel row 1; rows[r][0] is column A. */
  rows: Cell[][];
}

type Category = OfferDraft["category"];

export interface Columns {
  pn: number | null;
  desc: number | null;
  price: number | null;
  stock: number | null;
  model: number | null;
  remarks: number | null;
}

export interface SheetResult {
  name: string;
  category: Category;
  /** 1-based Excel row of the header, null when none was found. */
  headerRow: number | null;
  /** Header text of each detected column (1-based letters are not needed on screen). */
  columns: Record<keyof Columns, string>;
  basis: string;
  drafts: OfferDraft[];
  skipped: { row: number; reason: string }[];
  warnings: string[];
}

export interface WorkbookResult {
  sheets: SheetResult[];
  /** Price basis shared by the workbook, e.g. "FOB JA". */
  basis: string;
  brand: string;
  /** A currency written anywhere in the sheet header area, else "". */
  currencyHint: string;
}

// ---------- small helpers ----------

const text = (c: Cell | undefined) => (c == null ? "" : String(c).replace(/\s+/g, " ").trim());

function toNumber(c: Cell | undefined): number | null {
  if (typeof c === "number") return Number.isFinite(c) && c > 0 ? c : null;
  if (typeof c !== "string") return null;
  const t = c.replace(/[,\s]/g, "").replace(/^(?:usd|aed|us\$|\$|dhs?)/i, "");
  return /^\d+(?:\.\d+)?$/.test(t) && Number(t) > 0 ? Number(t) : null;
}

const HEADER = {
  pn: /^(p\/?n|part\s*(no\.?|number|#)|sku|mpn|item\s*(code|no\.?)|code)$/i,
  desc: /desc|product|particulars|item\b/i,
  price: /price|\brate\b|\bdp\b|\bfob\b|\bcost\b|\bexw\b|\bamount\b/i,
  stock: /stock|status|avail|\beta\b/i,
  model: /^model$/i,
  remarks: /remark|note|comment/i,
};

const STOCK_VALUE = /stock|order|\beta\b|alloc|avail|\boos\b/i;

export function normalizeStock(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/out of stock|no stock|\boos\b/i.test(t)) return "Out of stock";
  if (/in\s*stock/i.test(t)) return "In stock";
  if (/on\s*order/i.test(t)) return "On order";
  const eta = t.match(/\beta\b[:\s-]*(.*)$/i);
  if (eta) return `ETA ${eta[1]}`.trim();
  if (/alloc/i.test(t)) return "Allocation only";
  return t.slice(0, 40);
}

/** "LIST PRICE FOB JA" -> "FOB JA"; "Price ex-VAT" -> "ex-VAT". */
export function detectBasis(header: string): string {
  const m = header.match(/(fob\s*[a-z.]+(?:\s+[a-z]+)?|ex[- ]?works|\bexw\b|cif\s*\w+|ex[- ]?vat|incl\.?\s*vat|ddp)/i);
  if (!m) return "";
  const b = m[1].replace(/\s+/g, " ").trim();
  return /^fob/i.test(b) ? b.toUpperCase().replace(/\.$/, "") : /^ex[- ]?vat/i.test(b) ? "ex-VAT" : b;
}

// ---------- category ----------

const SHEET_CATEGORY: [RegExp, Category][] = [
  [/workstation/i, "workstation"],
  [/monitor|display/i, "monitor"],
  [/accessor|peripheral|bag|cable|dock|keyboard|mouse/i, "accessory"],
  [/all[- ]?in[- ]?one|\baio\b/i, "all-in-one"],
  [/desktop|tiny|tower|\bsff\b|mini ?pc/i, "desktop"],
  [/laptop|notebook|thinkpad|elitebook|probook|latitude|ideapad|chromebook|tablet/i, "laptop"],
  [/printer|toner|ink/i, "printer"],
  [/network|router|switch|wifi|access point/i, "networking"],
  [/storage|ssd|hdd|nas|drive/i, "storage"],
  [/component|memory|\bram\b|cpu|processor|graphic/i, "component"],
];

export function categoryFromSheetName(name: string): Category | null {
  for (const [re, cat] of SHEET_CATEGORY) if (re.test(name)) return cat;
  return null;
}

function categoryFromRow(desc: string): Category {
  if (/monitor|display\b/i.test(desc)) return "monitor";
  if (/\b(TWR|SFF|USFF|tiny|tower|desktop)\b/i.test(desc)) return "desktop";
  if (/(core|ryzen|ultra|\bU[3579][- ]?\d{3})/i.test(desc) && /\d{2}(\.\d)?\s*["”]/.test(desc)) return "laptop";
  return "other";
}

// ---------- brand ----------

const BRAND_LINES: [RegExp, string][] = [
  [/\b(ThinkPad|ThinkCentre|ThinkStation|ThinkVision|IdeaPad|IdeaCentre|Legion|Yoga|Lenovo)\b/i, "Lenovo"],
  [/\b(EliteBook|ProBook|EliteDesk|ProDesk|ZBook|Pavilion|OMEN|Victus|Envy|HP)\b/i, "HP"],
  [/\b(Latitude|Vostro|Inspiron|OptiPlex|XPS|Precision|Alienware|UltraSharp|Dell)\b/i, "Dell"],
  [/\b(VivoBook|ExpertBook|ZenBook|ROG|TUF|ProArt|ASUS)\b/i, "ASUS"],
  [/\b(Aspire|Swift|Nitro|Predator|TravelMate|Acer)\b/i, "Acer"],
  [/\b(MacBook|iMac|Mac mini|Apple)\b/i, "Apple"],
  [/\b(MSI|Samsung|LG|Huawei|Microsoft|Surface|Gigabyte|BenQ|ViewSonic|AOC|Philips)\b/i, ""],
];

const BRAND_FIX: Record<string, string> = { msi: "MSI", lg: "LG", benq: "BenQ", viewsonic: "ViewSonic", aoc: "AOC", surface: "Microsoft" };

export function detectBrand(...parts: string[]): string {
  const t = parts.join(" ");
  for (const [re, brand] of BRAND_LINES) {
    const m = t.match(re);
    if (!m) continue;
    if (brand) return brand;
    const w = m[1].toLowerCase();
    return BRAND_FIX[w] ?? m[1][0].toUpperCase() + m[1].slice(1);
  }
  return "";
}

// ---------- description parsing ----------

/** Splits on commas that are not inside brackets: "Core Ultra 7 (up to 4.6GHz, 30MB), 16GB". */
function splitSpec(desc: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of desc) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((t) => t.replace(/[®™©]/g, "").replace(/\s+/g, " ").trim()).filter((t) => t && t !== "-");
}

export interface Spec {
  modelToken: string;
  cpu: string;
  ramGb: number | null;
  storage: string;
  display: string;
  gpu: string;
  os: string;
  extras: string[];
  /** True when the string followed the "model,cpu,ram,storage,..." layout. */
  structured: boolean;
}

function cpuOf(t: string): string {
  let m = t.match(/^UX([579])[\s-]?(\d{3}[A-Z]{0,2})$/i);
  if (m) return `Core Ultra X${m[1]} ${m[2].toUpperCase()}`;
  m = t.match(/^U([3579])[\s-]?(\d{3}[A-Z]{0,2})$/i);
  if (m) return `Core Ultra ${m[1]} ${m[2].toUpperCase()}`;
  m = t.match(/(?:core\s+)?ultra\s+([3579])\s+(\d{3}[A-Z]{0,2})/i);
  if (m) return `Core Ultra ${m[1]} ${m[2].toUpperCase()}`;
  m = t.match(/\b(i[3579])[- ](\d{4,5}[A-Z]{0,2})\b/i);
  if (m) return `Core ${m[1].toLowerCase()}-${m[2].toUpperCase()}`;
  m = t.match(/\bryzen\s+([3579])\s+(?:pro\s+)?(\d{4}[A-Z]{0,2})\b/i);
  if (m) return `Ryzen ${m[1]} ${m[2].toUpperCase()}`;
  m = t.match(/\b(?:core\s+)?(i[3579])\b/i);
  return m && /^(?:intel\s+)?(?:core\s+)?i[3579]$/i.test(t) ? `Core ${m[1].toLowerCase()}` : "";
}

const STORAGE_RE = /(?:\d+\s*x\s*)?(\d+(?:\.\d+)?)\s*(GB|TB)\s*(SSD|HDD|NVMe|eMMC)/i;
const OS_RE = /^(win(?:dows)?\s*\d+(?:\s*(?:pro|home|s))?|no\s*(?:os|operating system)|free\s*dos|dos|linux|ubuntu)/i;
const DISPLAY_RE = /(\d{2}(?:[.,]\d)?)\s*(?:"|”|inch|-inch)?\s*(WUXGA|WQXGA|WQUXGA|WQHD|FHD|QHD|UHD|OLED|2\.8K|3K|2K|4K|HD\+?)/i;

export function parseSpec(desc: string): Spec {
  const tokens = splitSpec(desc);
  const spec: Spec = { modelToken: tokens[0] ?? "", cpu: "", ramGb: null, storage: "", display: "", gpu: "", os: "", extras: [], structured: false };
  let warranty = "";
  let keyboard = "";
  const bundle: string[] = [];

  tokens.slice(1).forEach((t) => {
    const storage = t.match(STORAGE_RE);
    if (storage) {
      spec.storage ||= `${Number(storage[1])}${storage[2].toUpperCase()} ${storage[3].toUpperCase() === "NVME" ? "NVMe" : storage[3].toUpperCase()}`;
      return;
    }
    const cpu = cpuOf(t);
    if (cpu) {
      spec.cpu ||= cpu;
      return;
    }
    const ram = t.match(/^(\d+(?:\.\d+)?)\s*GB\b/i);
    if (ram && !/ssd|hdd|nvme|nits|hz/i.test(t)) {
      spec.ramGb ??= Math.round(Number(ram[1]));
      return;
    }
    if (!spec.os && OS_RE.test(t)) {
      const os = t.match(OS_RE)![1].replace(/\s+/g, " ");
      spec.os = /^no/i.test(os) ? "No OS" : /^(free\s*)?dos$/i.test(os) ? "DOS" : os.replace(/^windows/i, "Win");
      return;
    }
    const disp = t.match(DISPLAY_RE);
    if (disp && !spec.display) {
      spec.display = `${disp[1].replace(",", ".").replace(/\.0$/, "")}" ${disp[2].toUpperCase()}`;
      return;
    }
    if (!spec.gpu && /^(integrated|intel\s+(arc|graphics|uhd|iris)|uhd|nvidia|geforce|rtx|gtx|radeon|amd radeon|quadro)/i.test(t)) {
      spec.gpu = /^integrated/i.test(t) ? "Integrated" : t.slice(0, 30);
      return;
    }
    if (!warranty) {
      const w = t.match(/(\d)\s*y(?:ea)?r?s?\.?\s*(carry-?in|on-?site|premier|depot|pickup)/i);
      if (w) {
        warranty = `${w[1]}Y ${w[2].toLowerCase().replace("carry-in", "Carry-in").replace("carryin", "Carry-in").replace(/on-?site/, "On-site").replace("premier", "Premier").replace("depot", "Depot").replace("pickup", "Pickup")}`;
        return;
      }
    }
    if (!keyboard) {
      const k = t.match(/\b(?:KB|keyboard|TRD|TRADITIONAL)\b[\s_-]*(arabic|english|ara|eng|uk-?eng|us)?/i) ?? t.match(/\b(arabic|english)\b.*\b(?:KB|keyboard)\b/i);
      if (k && /KB|keyboard|TRD/i.test(t)) {
        const lang = (k[1] ?? "").toLowerCase();
        keyboard = /^ara|arabic/.test(lang) ? "Arabic KB" : /eng|uk|us/.test(lang) ? "English KB" : "";
        if (!keyboard && /arabic/i.test(t)) keyboard = "Arabic KB";
        if (!keyboard && /english/i.test(t)) keyboard = "English KB";
        if (keyboard) return;
      }
    }
    if (/\b(topload|case|bag|backpack|mouse)\b/i.test(t) && t.length < 30) bundle.push(t.toLowerCase());
  });

  spec.structured = tokens.length >= 5 && (spec.ramGb != null || !!spec.storage) && !!(spec.cpu || spec.storage);
  spec.extras = [warranty, keyboard, ...bundle].filter(Boolean);
  return spec;
}

/** "L14 PTL" -> "L14", "E14 G7 LNL" -> "E14 Gen 7"; adds the generation from the heading when the code lacks it. */
export function laptopModel(token: string, heading: string): string {
  let base = token
    .replace(/\b(PTL|LNL|ARL|MTL|ADL|RPL|TWR|SFF|USFF|TINY|AMD|INTEL)\b/gi, "")
    .replace(/\bG(\d{1,2})\b/g, "Gen $1")
    .replace(/\s+/g, " ")
    .trim();
  const family = heading.match(/^(ThinkPad|ThinkCentre|ThinkStation|IdeaPad|IdeaCentre|Legion|Yoga)\b/i)?.[1] ?? "";
  if (!/\bGen\s*\d/i.test(base)) {
    const gen = heading.match(/\bGen\s*(\d+)/i);
    if (gen && new RegExp(`\\b${base.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(heading)) base += ` Gen ${gen[1]}`;
  }
  return [family && !new RegExp(`^${family}`, "i").test(base) ? family : "", base].filter(Boolean).join(" ").trim();
}

const ACCESSORY_TYPES: Record<string, string> = {
  adap: "adapter", audio: "audio", bag: "bag", cable: "cable", dock: "dock", kb: "keyboard", mouse: "mouse", ms: "mouse",
};

/** Monitors and accessories: free text, so pull out the model code and the few facts that matter. */
function parseFreeText(desc: string, category: Category, modelCol: string, brand: string) {
  // catalogue prefixes such as "CASE_BO " or "KB MICE_BO " mean nothing to a buyer
  const clean = desc.replace(/\s+/g, " ").replace(/^(?:[A-Z]+\s+)?[A-Z]+_BO\s+/, "").trim();
  const code = clean.match(/\b([STPELQ]\d{2}[A-Za-z]{0,2}-\d{1,2}[A-Za-z]?)\b/);
  const family =
    clean.match(/\b(ThinkVision|ThinkCentre|ThinkPad|UltraSharp|ProDisplay)\b/i)?.[1] ??
    (category === "monitor" && brand === "Lenovo" && code ? "ThinkVision" : "");
  const head = clean.split(/\s[-–]\s|,|\(/)[0].trim();
  let modelName = code ? [family, code[1]].filter(Boolean).join(" ") : head.slice(0, 60);
  if (category === "accessory") modelName = head.slice(0, 60);
  const size = clean.match(/(\d{2}(?:[.,]\d)?)\s*(?:"|”|inch|-inch)/i);
  const res =
    clean.match(/\b(WUXGA|WQHD|QHD|2K|4K|UHD|FHD|WQXGA)\b/i)?.[1] ??
    (/3840\s*x\s*2160/.test(clean) ? "4K" : /2560\s*x\s*1440/.test(clean) ? "QHD" : /1920\s*x\s*1080/.test(clean) ? "FHD" : "");
  const display =
    category === "monitor" && size ? `${size[1].replace(",", ".")}"${res ? " " + res.toUpperCase() : ""}` : "";
  const panel = clean.match(/\b(IPS|VA|TN|OLED)\b/i)?.[1]?.toUpperCase();
  const hz = clean.match(/(\d{2,3})\s*Hz/i)?.[1];
  const extras: string[] = [];
  if (category === "monitor") {
    if (panel || hz) extras.push([panel, hz && `${hz}Hz`].filter(Boolean).join(" "));
    if (/usb-?c/i.test(clean)) extras.push("USB-C");
  }
  if (category === "accessory" && modelCol) extras.push(ACCESSORY_TYPES[modelCol.toLowerCase()] ?? modelCol.toLowerCase());
  return { modelName, display, extras };
}

// ---------- sheet reading ----------

function findHeader(rows: Cell[][]): number {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = rows[r].map(text);
    const hasPn = cells.some((c) => HEADER.pn.test(c));
    const hasOther = cells.some((c) => HEADER.desc.test(c) || HEADER.price.test(c));
    if (hasPn && hasOther) return r;
  }
  return -1;
}

const PN_RE = /^[A-Za-z0-9][A-Za-z0-9#\-/.]{3,29}$/;
const looksLikePn = (s: string) => PN_RE.test(s) && /\d/.test(s);

function pickColumns(rows: Cell[][], headerIdx: number): { cols: Columns; headerText: Record<keyof Columns, string> } {
  const header = headerIdx >= 0 ? rows[headerIdx].map(text) : [];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const body = rows.slice(headerIdx + 1);
  const dataRows = body.filter((r) => looksLikePn(text(r[0])) || r.some((c) => toNumber(c) != null));
  const numericCount = (col: number) => dataRows.filter((r) => toNumber(r[col]) != null).length;
  const stockCount = (col: number) => dataRows.filter((r) => STOCK_VALUE.test(text(r[col])) && text(r[col]).length < 30).length;
  const idxs = (re: RegExp) => header.map((h, i) => (re.test(h) ? i : -1)).filter((i) => i >= 0);

  const cols: Columns = { pn: null, desc: null, price: null, stock: null, model: null, remarks: null };
  cols.pn = idxs(HEADER.pn)[0] ?? 0;
  cols.desc = idxs(HEADER.desc).find((i) => i !== cols.pn) ?? (width > 1 ? 1 : null);

  // price: of the "price" headers (a merged sheet can repeat them) take the one that holds numbers; else the numeric column
  const priceCandidates = idxs(HEADER.price).filter((i) => numericCount(i) > 0);
  cols.price = priceCandidates.length
    ? priceCandidates.reduce((best, i) => (numericCount(i) >= numericCount(best) ? i : best))
    : [...Array(width).keys()]
        .filter((i) => i !== cols.pn && i !== cols.desc && numericCount(i) > 0)
        .sort((a, b) => numericCount(b) - numericCount(a) || a - b)[0] ?? null;

  const stockCandidates = idxs(HEADER.stock).filter((i) => i !== cols.price && stockCount(i) > 0);
  cols.stock = stockCandidates.length
    ? stockCandidates.reduce((best, i) => (stockCount(i) >= stockCount(best) ? i : best))
    : [...Array(width).keys()].filter((i) => i !== cols.price && stockCount(i) > 0).sort((a, b) => stockCount(b) - stockCount(a))[0] ?? null;

  const free = (re: RegExp) => idxs(re).find((i) => i !== cols.pn && i !== cols.desc && i !== cols.price && i !== cols.stock) ?? null;
  cols.model = free(HEADER.model);
  cols.remarks = free(HEADER.remarks);

  // show the sheet's own header text only when it really names that role; otherwise say it came from the data
  const headerText = Object.fromEntries(
    (Object.keys(cols) as (keyof Columns)[]).map((k) => {
      const i = cols[k];
      if (i == null) return [k, ""];
      return [k, header[i] && HEADER[k].test(header[i]) ? header[i] : "(from the data)"];
    }),
  ) as Record<keyof Columns, string>;
  return { cols, headerText };
}

export interface ParseOptions {
  currency: string;
  /** Overrides the basis found in the sheet header. */
  basis?: string;
  /** Brand when the description does not say (e.g. from the file name). */
  brand?: string;
}

export function parseSheet(grid: SheetGrid, sheetNo: number, opts: ParseOptions): SheetResult {
  const rows = grid.rows;
  const headerIdx = findHeader(rows);
  const { cols, headerText } = pickColumns(rows, headerIdx);
  const sheetCategory = categoryFromSheetName(grid.name);
  const basis = opts.basis ?? detectBasis(headerText.price);
  const result: SheetResult = {
    name: grid.name.trim(),
    category: sheetCategory ?? "other",
    headerRow: headerIdx >= 0 ? headerIdx + 1 : null,
    columns: headerText,
    basis,
    drafts: [],
    skipped: [],
    warnings: [],
  };
  if (cols.desc == null) {
    result.warnings.push("No description column found, this sheet was skipped.");
    return result;
  }
  if (headerIdx < 0) result.warnings.push("No header row found, columns were guessed from the data. Check the rows.");
  if (cols.price == null) result.warnings.push("No price column found. Rows are imported without prices.");

  let heading = "";
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNo = r + 1;
    const pn = text(row[cols.pn ?? 0]);
    const desc = text(row[cols.desc]);
    const priceCell = cols.price != null ? row[cols.price] : null;
    const price = toNumber(priceCell);

    if (!pn || !looksLikePn(pn)) {
      // a lone text cell = group heading ("ThinkPad L14 Gen 7"); anything else is blank or a note
      if (desc && price == null && row.filter((c) => text(c)).length <= 2) heading = desc;
      else if (desc || row.some((c) => text(c))) result.skipped.push({ row: rowNo, reason: "No part number" });
      continue;
    }
    if (!desc) {
      result.skipped.push({ row: rowNo, reason: "No description" });
      continue;
    }

    const category = sheetCategory ?? categoryFromRow(desc);
    const modelCol = cols.model != null ? text(row[cols.model]) : "";
    const stockRaw = cols.stock != null ? text(row[cols.stock]) : "";
    const remarks = cols.remarks != null ? text(row[cols.remarks]) : "";
    const spec = parseSpec(desc);
    const flags: string[] = [];
    const brand = detectBrand(desc, heading) || opts.brand || "";

    let modelName: string;
    let display = spec.display;
    let extras = spec.extras;
    if (spec.structured) {
      modelName = laptopModel(spec.modelToken, heading) || spec.modelToken;
    } else {
      const free = parseFreeText(desc, category, modelCol, brand);
      modelName = free.modelName;
      display = display || free.display;
      extras = [...free.extras, ...extras];
    }
    if (remarks && remarks.length < 40 && !/^qty$/i.test(remarks)) extras = [...extras, remarks];

    if (price == null) {
      const t = typeof priceCell === "string" ? priceCell.trim() : "";
      flags.push(t ? `Price column says "${t}"` : "No price in the sheet");
    }
    if (!brand) flags.push("Brand missing");
    if (["laptop", "desktop", "workstation"].includes(category) && spec.structured && !spec.cpu) flags.push("CPU not recognised");

    result.drafts.push({
      key: `x${sheetNo}-${rowNo}`,
      category,
      brand,
      modelName: modelName.replace(new RegExp(`^${brand}\\s+`, "i"), "").slice(0, 80),
      partNumber: normalizePartNumber(pn),
      cpu: spec.cpu,
      ramGb: spec.ramGb,
      storage: spec.storage,
      display,
      gpu: spec.gpu,
      os: spec.os,
      extras: extras.join(" · ").slice(0, 120),
      condition: "new",
      price,
      currency: opts.currency,
      priceBasis: basis,
      stockNote: normalizeStock(stockRaw),
      rawText: `[${result.name}] ${pn} | ${desc} | ${price ?? ""} | ${stockRaw}`.slice(0, 1200),
      confidence: Math.max(0.1, Math.round((1 - flags.length * 0.2) * 100) / 100),
      flags,
      productId: null,
      productLabel: "",
      suggestedProductId: null,
      suggestedLabel: "",
      include: true,
    });
  }
  if (!result.drafts.length) result.warnings.push("No product rows found in this sheet.");
  return result;
}

/** Reads every sheet and works out the shared basis, brand and currency. */
export function parseWorkbook(grids: SheetGrid[], opts: { fileName: string; currency: string; basis?: string; brand?: string }): WorkbookResult {
  const fileBrand = detectBrand(opts.fileName.replace(/[_\-.]+/g, " "));
  const headerArea = grids.flatMap((g) => g.rows.slice(0, 8).flat()).map(text).join(" ");
  const cur = headerArea.match(/\b(USD|US\$|AED|EUR|GBP)\b/i);
  const currencyHint = cur ? (/^us\$/i.test(cur[1]) ? "USD" : cur[1].toUpperCase()) : "";

  let sheets = grids.map((g, i) => parseSheet(g, i, { currency: opts.currency, basis: opts.basis, brand: opts.brand || fileBrand }));
  // a sheet without a header text (e.g. a short WorkStation sheet) inherits the workbook's most common basis
  const counts = new Map<string, number>();
  for (const s of sheets) if (s.basis) counts.set(s.basis, (counts.get(s.basis) ?? 0) + s.drafts.length);
  const basis = opts.basis ?? [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  sheets = sheets.map((s) => (s.basis === basis ? s : { ...s, basis, drafts: s.drafts.map((d) => ({ ...d, priceBasis: basis })) }));
  return { sheets, basis, brand: opts.brand || fileBrand, currencyHint };
}
