import { supplierType } from "@/lib/supplier-types";
import type { ProductHit } from "@/lib/search";

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // stop spreadsheet formula injection from supplier-controlled text
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADER = [
  "Product", "Category", "Brand", "Model", "Part number", "Supplier", "Supplier type", "Price", "Currency",
  "Price basis", "Price AED", "Best price AED", "Diff vs best AED", "CPU", "RAM GB", "Storage", "Display", "GPU",
  "OS", "Extras", "Condition", "Stock / notes", "Received", "Old offer",
];

/** One row per offer. UTF-8 with BOM so Excel opens it correctly. */
export function offersToCsv(products: ProductHit[]): string {
  const rows: unknown[][] = [HEADER];
  for (const p of products) {
    const aedBest = p.bestCurrency === "AED" ? p.bestPrice : null;
    for (const o of p.offers) {
      rows.push([
        p.label, p.category, p.brand, p.modelName, p.partNumber, o.supplierName, supplierType(o.supplierType).label,
        o.price ?? "", o.currency, o.priceBasis, o.priceAed ?? "", aedBest ?? "",
        o.priceAed != null && aedBest != null ? Math.round((o.priceAed - aedBest) * 100) / 100 : "",
        o.cpu, o.ramGb ?? "", o.storage, o.display, o.gpu, o.os, o.extras, o.condition, o.stockNote,
        o.receivedAt.slice(0, 10), o.stale ? "yes" : "",
      ]);
    }
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function line(o: ProductHit["offers"][number]) {
  const native = `${o.currency} ${fmt(o.price!)}${o.priceBasis ? ` ${o.priceBasis}` : ""}`;
  const aed = o.currency !== "AED" && o.priceAed != null ? ` (about AED ${fmt(Math.round(o.priceAed))})` : "";
  return `${o.supplierName}: ${native}${aed}`;
}

/** Plain-text quote that can be pasted into WhatsApp or an email. */
export function quoteText(p: ProductHit, staleDays: number): string {
  const fresh = p.offers.filter((o) => !o.stale && o.price != null);
  const best = fresh.find((o) => o.id === p.bestOfferId) ?? fresh[0];
  const lines = [p.label];
  if (p.specSummary) lines.push(p.specSummary);
  if (best) lines.push(`Best: ${line(best)}`);
  else lines.push("Price on request");
  for (const o of fresh.filter((o) => o !== best).slice(0, 3)) lines.push(line(o));
  lines.push(`Prices from the last ${staleDays} days, subject to stock.`);
  return lines.join("\n");
}
