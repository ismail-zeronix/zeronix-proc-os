/**
 * Reads a distributor Excel price list and prints what the importer would create, without touching
 * the database.   npm run try-excel -- "C:\path\to\list.xlsx" [rows-per-sheet] [USD|AED]
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { parseWorkbook, type Cell, type SheetGrid } from "../src/lib/parse/excel";

function cell(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if ("result" in v) return cell(v.result as ExcelJS.CellValue);
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("text" in v) return String(v.text);
  return null;
}

async function main() {
  const [file, perSheet = "3", currency = "USD"] = process.argv.slice(2);
  if (!file) throw new Error('Usage: npm run try-excel -- "<file.xlsx>" [rows-per-sheet] [currency]');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(file) as unknown as ArrayBuffer);

  const sheets: SheetGrid[] = wb.worksheets
    .filter((ws) => ws.state === "visible")
    .map((ws) => ({
      name: ws.name,
      rows: Array.from({ length: ws.rowCount }, (_, r) => {
        const row = ws.getRow(r + 1);
        return Array.from({ length: Math.min(row.cellCount, 40) }, (_, c) => cell(row.getCell(c + 1).value));
      }),
    }));

  const res = parseWorkbook(sheets, { fileName: file.split(/[\\/]/).pop() ?? file, currency });
  console.log(`basis: ${res.basis || "(none)"} | brand: ${res.brand || "(none)"} | currency in sheet: ${res.currencyHint || "(not stated)"}`);
  for (const s of res.sheets) {
    console.log(`\n## ${s.name} -> ${s.category} | header row ${s.headerRow ?? "none"} | ${s.drafts.length} rows | ${s.skipped.length} skipped`);
    console.log("   columns:", JSON.stringify(s.columns));
    for (const w of s.warnings) console.log("   warning:", w);
    for (const d of s.drafts.slice(0, Number(perSheet))) {
      console.log(
        "  ",
        JSON.stringify({
          pn: d.partNumber, model: d.modelName, cpu: d.cpu, ram: d.ramGb, storage: d.storage, display: d.display,
          os: d.os, extras: d.extras, price: d.price, stock: d.stockNote, flags: d.flags,
        }),
      );
    }
  }
  const all = res.sheets.flatMap((s) => s.drafts);
  const flagged = all.filter((d) => d.flags.length);
  for (const d of flagged) console.log(`CHECK ${d.partNumber}: ${d.flags.join("; ")}`);
  console.log(`\nTOTAL ${all.length} rows | ${all.filter((d) => d.price != null).length} with price | ${flagged.length} flagged`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
