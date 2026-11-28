/**
 * Items: what a company sells or buys again and again (schema.items). Rules in one place, no database here, so the
 * browser forms and the server actions agree. A trader's goods can be tracked by quantity and serial number; a service
 * provider only has services (lib/apps.ts BusinessType).
 */
import type { BusinessType } from "@/lib/apps";

export type ItemKind = "goods" | "service";

export const ITEM_KINDS: readonly { key: ItemKind; label: string }[] = [
  { key: "goods", label: "Goods" },
  { key: "service", label: "Service" },
];

/** Units offered in the form; anything else typed in is kept as it is. */
export const GOODS_UNITS = ["pcs", "box", "set", "pack", "m", "roll", "lot"] as const;
export const SERVICE_UNITS = ["job", "hour", "day", "visit", "month", "year"] as const;
export const unitsFor = (kind: ItemKind): readonly string[] => (kind === "service" ? SERVICE_UNITS : GOODS_UNITS);
export const defaultUnit = (kind: ItemKind) => (kind === "service" ? "job" : "pcs");

/** A part number as it is matched: lower case, letters and digits only ("15FD-0130WM" → "15fd0130wm"). */
export const partNorm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Goods are sold on the "Sales, products" account, services on "Sales, services" (invoice_items.line_kind). */
export const lineKindOf = (kind: ItemKind): "product" | "service" => (kind === "service" ? "service" : "product");

export const SKU_PREFIX = "ITM";

export interface ItemFlags {
  kind: ItemKind;
  trackStock: boolean;
  trackSerials: boolean;
}

/**
 * What an item may be, whatever the form sent: a service is never in stock, serials need stock, and a company that is
 * not a trader keeps no stock at all.
 */
export function itemFlags(input: ItemFlags, business: BusinessType | null): ItemFlags {
  const kind: ItemKind = input.kind === "service" ? "service" : "goods";
  const stock = business === "trader" && kind === "goods" && input.trackStock;
  return { kind, trackStock: stock, trackSerials: stock && input.trackSerials };
}

/** Starter categories offered on an empty list, by what the company does. */
/** A category an industry template or the "Add starter categories" button offers. */
export interface StarterCategory {
  name: string;
  kind: ItemKind;
  trackStock?: boolean;
  trackSerials?: boolean;
  unit?: string;
}

export const STARTER_CATEGORIES: Record<BusinessType, readonly StarterCategory[]> = {
  trader: [
    { name: "Laptops", kind: "goods", trackStock: true, trackSerials: true },
    { name: "Desktops", kind: "goods", trackStock: true, trackSerials: true },
    { name: "Monitors", kind: "goods", trackStock: true, trackSerials: true },
    { name: "Printers", kind: "goods", trackStock: true, trackSerials: true },
    { name: "Networking", kind: "goods", trackStock: true },
    { name: "Accessories", kind: "goods", trackStock: true },
    { name: "Software and licences", kind: "goods" },
    { name: "Services", kind: "service", unit: "job" },
  ],
  services: [
    { name: "Consulting", kind: "service", unit: "hour" },
    { name: "Installation", kind: "service", unit: "job" },
    { name: "Maintenance and AMC", kind: "service", unit: "year" },
    { name: "Support", kind: "service", unit: "month" },
    { name: "Training", kind: "service", unit: "day" },
  ],
};

/* ---------- CSV import ---------- */

/** Columns of the item CSV, in the order of the template. Only name is required. */
export const ITEM_CSV_COLUMNS = ["sku", "name", "category", "brand", "part_number", "unit", "kind", "sale_price", "purchase_price", "vat_code", "track_stock", "serials", "reorder_level", "description"] as const;

export interface ItemCsvRow {
  sku: string;
  name: string;
  category: string;
  brand: string;
  partNumber: string;
  unit: string;
  kind: ItemKind;
  salePrice: number | null;
  purchasePrice: number | null;
  taxCode: string;
  trackStock: boolean;
  trackSerials: boolean;
  reorderLevel: number | null;
  description: string;
}

/** One CSV line into cells: commas, quotes ("a, b" and "" for a quote) as Excel saves them. */
export function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const yes = (v: string) => /^(y|yes|true|1|x)$/i.test(v.trim());
const amount = (v: string): number | null => {
  const t = v.replace(/[, ]|aed/gi, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

/**
 * Reads an item CSV (with a header row naming the columns, any order, extra columns ignored). Returns the rows and the
 * problems by line number, so nothing half-read is saved.
 */
export function parseItemsCsv(text: string): { rows: ItemCsvRow[]; problems: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], problems: ["The file is empty."] };
  const head = csvCells(lines[0]).map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  const col = (name: string) => head.indexOf(name);
  if (col("name") < 0) return { rows: [], problems: ['The first row must name the columns, with at least "name".'] };
  const rows: ItemCsvRow[] = [];
  const problems: string[] = [];
  lines.slice(1).forEach((line, i) => {
    const c = csvCells(line);
    const get = (name: string) => (col(name) >= 0 ? (c[col(name)] ?? "") : "");
    const n = i + 2;
    const name = get("name");
    if (!name) return problems.push(`Line ${n}: no name.`);
    const kind: ItemKind = /^serv/i.test(get("kind")) ? "service" : "goods";
    const sale = amount(get("sale_price"));
    const purchase = amount(get("purchase_price"));
    const reorder = amount(get("reorder_level"));
    if ([sale, purchase, reorder].some((v) => Number.isNaN(v))) return problems.push(`Line ${n} (${name}): a price or reorder level is not a number.`);
    const taxCode = (get("vat_code") || "SR").toUpperCase();
    if (!["SR", "ZR", "EX", "OS"].includes(taxCode)) return problems.push(`Line ${n} (${name}): VAT code must be SR, ZR, EX or OS.`);
    const serials = yes(get("serials"));
    rows.push({
      sku: get("sku"),
      name: name.slice(0, 200),
      category: get("category"),
      brand: get("brand"),
      partNumber: get("part_number"),
      unit: get("unit") || defaultUnit(kind),
      kind,
      salePrice: sale,
      purchasePrice: purchase,
      taxCode,
      trackStock: kind === "goods" && (serials || yes(get("track_stock"))),
      trackSerials: kind === "goods" && serials,
      reorderLevel: reorder,
      description: get("description"),
    });
  });
  const skus = rows.map((r) => r.sku.toLowerCase()).filter(Boolean);
  const twice = skus.filter((s, i) => skus.indexOf(s) !== i);
  if (twice.length) problems.push(`The same SKU is on more than one line: ${[...new Set(twice)].slice(0, 5).join(", ")}.`);
  return { rows, problems };
}

/** The template a person downloads to fill in. */
export const ITEM_CSV_TEMPLATE = `${ITEM_CSV_COLUMNS.join(",")}\n,Lenovo ThinkPad E14 Gen 6,Laptops,Lenovo,21M7002XAD,pcs,goods,3450,2980,SR,yes,yes,2,"Core i5, 16 GB, 512 GB SSD"\n,Laptop setup and data transfer,Services,,,job,service,150,,SR,,,,\n`;
