import type { LlmItem, OfferDraft } from "@/lib/llm/schema";
import { CATEGORIES, CONDITIONS } from "@/lib/llm/schema";
import type { Block } from "./chunk";
import { PRICE_LINE_RE } from "./chunk";

const BRANDS: Record<string, string> = {
  hp: "HP", hpe: "HPE", lenovo: "Lenovo", dell: "Dell", asus: "ASUS", acer: "Acer", apple: "Apple",
  msi: "MSI", microsoft: "Microsoft", samsung: "Samsung", lg: "LG", huawei: "Huawei",
  gigabyte: "Gigabyte", toshiba: "Toshiba", dynabook: "Dynabook", logitech: "Logitech",
  benq: "BenQ", viewsonic: "ViewSonic", aoc: "AOC", philips: "Philips", epson: "Epson",
  canon: "Canon", brother: "Brother", cisco: "Cisco", ubiquiti: "Ubiquiti", tplink: "TP-Link",
  "tp-link": "TP-Link", kingston: "Kingston", sandisk: "SanDisk", wd: "WD", seagate: "Seagate",
  intel: "Intel", amd: "AMD", nvidia: "NVIDIA", razer: "Razer", xiaomi: "Xiaomi",
};

export function normalizeBrand(b: string): string {
  const k = b.trim().toLowerCase();
  if (!k) return "";
  return BRANDS[k] ?? b.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizePartNumber(p: string): string {
  return p.toUpperCase().replace(/\s+/g, "").replace(/^[-–]+|[-–]+$/g, "");
}

export function parseRamGb(ram: string): number | null {
  const m = ram.match(/(\d+(?:\.\d+)?)\s*(tb|gb|g)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.round(/tb/i.test(m[2] ?? "") ? n * 1024 : n);
}

function digitsIn(text: string): Set<string> {
  return new Set((text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).map((d) => String(Number(d))));
}

export function toDraft(item: LlmItem, block: Block | undefined, i: number): OfferDraft {
  const raw = block?.text ?? "";
  const flags: string[] = [];

  const brand = normalizeBrand(item.brand);
  let partNumber = normalizePartNumber(item.part_number);
  let modelName = item.model_name.trim();
  // The model sometimes splits "15-FD0130WM" into model "Laptop 15" + part "FD0130WM": restore the full code.
  if (partNumber && /^[A-Z]/.test(partNumber)) {
    const esc = partNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = raw.toUpperCase().match(new RegExp(`\\b(\\d{1,3})-${esc}\\b`));
    if (m) {
      partNumber = `${m[1]}-${partNumber}`;
      modelName = modelName.replace(new RegExp(`\\s*\\b${m[1]}$`), "").trim();
    }
  }
  if (brand && modelName.toLowerCase().startsWith(brand.toLowerCase() + " ")) {
    modelName = modelName.slice(brand.length + 1);
  }
  if (partNumber && modelName.toUpperCase().includes(partNumber)) {
    modelName = modelName.replace(new RegExp(partNumber.replace(/[-]/g, "[- ]?"), "i"), "").replace(/\s*[-–]\s*$/, "").trim();
  }

  const ramGb = parseRamGb(item.ram);
  if (ramGb !== null && ramGb > 512) flags.push(`RAM looks wrong (${item.ram})`);

  const tb = item.storage.match(/(\d+)\s*TB/i);
  if (tb && Number(tb[1]) >= 16) flags.push(`Storage looks wrong (${item.storage})`);

  let price = item.price;
  if (price !== null && (!Number.isFinite(price) || price <= 0)) price = null;
  if (price !== null && raw && !digitsIn(raw).has(String(price))) {
    flags.push("Price not found in text, please check");
  }
  if (price === null && raw && PRICE_LINE_RE.test(raw)) flags.push("Text seems to contain a price");

  if (!brand) flags.push("Brand missing");
  const computer = ["laptop", "desktop", "workstation", "all-in-one"].includes(item.category);
  if (computer && !item.cpu.trim()) flags.push("CPU missing");
  if (!partNumber && !modelName) flags.push("Model missing");

  const category = (CATEGORIES as readonly string[]).includes(item.category) ? item.category : "other";
  const condition = (CONDITIONS as readonly string[]).includes(item.condition) ? item.condition : "new";
  const confidence = Math.max(0.1, Math.round((1 - flags.length * 0.2 - (partNumber ? 0 : 0.1)) * 100) / 100);

  return {
    key: `${block?.index ?? "x"}-${i}`,
    category,
    brand,
    modelName,
    partNumber,
    cpu: item.cpu.trim(),
    ramGb,
    storage: item.storage.trim(),
    display: item.display.trim(),
    gpu: item.gpu.trim(),
    os: item.os.trim(),
    extras: item.extras.trim(),
    condition,
    price,
    currency: (item.currency || "AED").trim().toUpperCase().slice(0, 3) || "AED",
    priceBasis: "",
    stockNote: item.stock_note.trim(),
    rawText: raw,
    confidence,
    flags,
    productId: null,
    productLabel: "",
    suggestedProductId: null,
    suggestedLabel: "",
    include: true,
  };
}

/** Row used when the model fails on a block, so nothing the supplier sent is silently lost. */
export function fallbackDraft(block: Block, reason: string): OfferDraft {
  return {
    key: `${block.index}-fallback`,
    category: "other",
    brand: "",
    modelName: block.text.split("\n")[0].slice(0, 120),
    partNumber: "",
    cpu: "",
    ramGb: null,
    storage: "",
    display: "",
    gpu: "",
    os: "",
    extras: "",
    condition: "new",
    price: null,
    currency: "AED",
    priceBasis: "",
    stockNote: "",
    rawText: block.text,
    confidence: 0.1,
    flags: [`AI could not read this block (${reason}). Fill in manually or untick.`],
    productId: null,
    productLabel: "",
    suggestedProductId: null,
    suggestedLabel: "",
    include: true,
  };
}
