import { NextResponse, type NextRequest } from "next/server";
import { hasApp } from "@/lib/auth/session";
import { parseWorkbook } from "@/lib/parse/excel";
import { readWorkbook } from "@/lib/parse/excel-read";

const MAX_BYTES = 15 * 1024 * 1024;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Reads an uploaded Excel price list and returns what was found, sheet by sheet, for the person to
 * confirm. Nothing is stored here; `createExcelPriceList` stores it after the confirmation.
 */
export async function POST(req: NextRequest) {
  if (!(await hasApp("procurement"))) return fail("Unauthorized", 401);

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return fail("Upload the file as multipart form data.", 400);
  }
  if (!(file instanceof File)) return fail("Choose an Excel file.", 400);
  if (file.size > MAX_BYTES) return fail("That file is over 15 MB. Remove images or unused sheets and try again.", 413);
  if (/\.xls$/i.test(file.name)) return fail("Old .xls files are not supported. Open it in Excel and Save As .xlsx.", 415);
  if (!/\.xlsx$/i.test(file.name)) return fail("Only .xlsx Excel files are supported.", 415);

  const buffer = Buffer.from(await file.arrayBuffer());
  // an .xlsx is a zip archive; anything else renamed to .xlsx is rejected before it reaches the parser
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return fail("This does not look like a valid .xlsx file.", 422);
  }

  try {
    const wb = await readWorkbook(buffer);
    if (!wb.sheets.length) return fail("The workbook has no visible sheets.", 422);
    const parsed = parseWorkbook(wb.sheets, { fileName: file.name, currency: "USD" });
    return NextResponse.json({
      fileName: file.name,
      modified: wb.modified?.toISOString() ?? null,
      hiddenSheets: wb.hiddenSheets,
      ...parsed,
    });
  } catch (e) {
    console.error("[excel import]", e);
    return fail("Could not read this file. Is it a valid, unprotected .xlsx?", 422);
  }
}
