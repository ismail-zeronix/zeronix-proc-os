import { NextResponse, type NextRequest } from "next/server";
import { hasApp } from "@/lib/auth/session";
import { readWorkbook } from "@/lib/parse/excel-read";
import { guessMapping, parseCsv } from "@/lib/prospecting/import";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 2000;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Reads an uploaded prospect list (.csv, or the first visible sheet of an .xlsx) and returns its header row, the rows and
 * a guess of which column is which. Nothing is stored here; `commitImport` stores the rows after the person checks them.
 */
export async function POST(req: NextRequest) {
  if (!(await hasApp("prospecting"))) return fail("Unauthorized", 401);

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return fail("Upload the file as multipart form data.", 400);
  }
  if (!(file instanceof File)) return fail("Choose a CSV or Excel file.", 400);
  if (file.size > MAX_BYTES) return fail("That file is over 10 MB. Split it and try again.", 413);

  let grid: string[][];
  try {
    if (/\.csv$|\.txt$/i.test(file.name)) {
      grid = parseCsv(await file.text());
    } else if (/\.xlsx$/i.test(file.name)) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return fail("This does not look like a valid .xlsx file.", 422);
      const wb = await readWorkbook(buffer);
      const sheet = wb.sheets.find((s) => s.rows.some((r) => r.some((c) => c != null && String(c).trim() !== "")));
      if (!sheet) return fail("The workbook has no rows.", 422);
      grid = sheet.rows.map((r) => r.map((c) => (c == null ? "" : String(c)))).filter((r) => r.some((c) => c.trim() !== ""));
    } else {
      return fail("Only .csv and .xlsx files are supported. Save old .xls files as .xlsx first.", 415);
    }
  } catch (e) {
    console.error("[prospect import]", e);
    return fail("Could not read this file. Is it a valid, unprotected CSV or .xlsx?", 422);
  }

  if (grid.length < 2) return fail("The file needs a header row and at least one company.", 422);
  const width = Math.min(40, Math.max(...grid.map((r) => r.length)));
  const headers = Array.from({ length: width }, (_, i) => String(grid[0][i] ?? "").trim() || `Column ${i + 1}`);
  const body = grid.slice(1);
  return NextResponse.json({
    fileName: file.name,
    headers,
    rows: body.slice(0, MAX_ROWS).map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? "").slice(0, 4000))),
    total: body.length,
    truncated: body.length > MAX_ROWS,
    mapping: guessMapping(headers),
  });
}
