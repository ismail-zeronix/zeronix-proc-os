import "server-only";
import ExcelJS from "exceljs";
import type { Cell, SheetGrid } from "./excel";

const MAX_SHEETS = 40;
const MAX_ROWS = 5000;
const MAX_COLS = 40;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("text" in v) return String(v.text);
  return null;
}

export interface WorkbookFile {
  sheets: SheetGrid[];
  hiddenSheets: string[];
  /** The workbook's last-saved date, used as the default "received on". */
  modified: Date | null;
}

/** Turns an .xlsx into plain grids of strings and numbers. Formulas give their cached result. */
export async function readWorkbook(buffer: Buffer | ArrayBuffer): Promise<WorkbookFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const sheets: SheetGrid[] = [];
  const hiddenSheets: string[] = [];
  for (const ws of wb.worksheets.slice(0, MAX_SHEETS)) {
    if (ws.state !== "visible") {
      hiddenSheets.push(ws.name);
      continue;
    }
    const rows: Cell[][] = [];
    const lastRow = Math.min(ws.rowCount, MAX_ROWS);
    for (let r = 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      const cells: Cell[] = [];
      const lastCol = Math.min(Math.max(row.cellCount, row.actualCellCount), MAX_COLS);
      for (let c = 1; c <= lastCol; c++) cells.push(cellValue(row.getCell(c).value));
      rows.push(cells);
    }
    sheets.push({ name: ws.name, rows });
  }
  return { sheets, hiddenSheets, modified: wb.modified instanceof Date ? wb.modified : null };
}
