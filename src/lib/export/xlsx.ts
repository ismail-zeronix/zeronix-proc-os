import "server-only";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import type { Cell, Column, Report } from "@/lib/reports";

const MONEY = "#,##0.00;(#,##0.00)";
const ACCENT = "FFEFF3F6";

/** A real date for Excel from YYYY-MM-DD (noon UTC, so no time zone can move it to another day). */
const toDate = (s: string) => new Date(`${s}T12:00:00Z`);

/**
 * The report as a real Excel workbook: company and period on top, then each table with its headers, numbers as numbers
 * and dates as dates, bold totals and indented account trees. Text goes in as text, so a value starting with "=" stays
 * words and is never run as a formula.
 *
 * Rows are written out as they are made instead of being kept in memory, and the work pauses often: a long report (the
 * limit is 200,000 rows) shares this process with the web server, and must not hold up anyone's screen.
 */
export async function reportToXlsx(r: Report, company: string, generated: string): Promise<Buffer> {
  const breathe = () => new Promise((done) => setImmediate(done));
  const chunks: Buffer[] = [];
  const out = new PassThrough();
  out.on("data", (c: Buffer) => chunks.push(c));
  const ended = new Promise((done, fail) => {
    out.on("end", done);
    out.on("error", fail);
  });
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
  wb.creator = company;
  wb.created = new Date();

  // the top lines come before any table, so the header row to freeze is known before the first row is written
  const topLines = 4 + (r.notice ? 1 : 0) + 1 + (r.kpis.length ? r.kpis.length + 1 : 0);
  const single = r.tables.length === 1;
  const ws = wb.addWorksheet(r.title.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Report", {
    pageSetup: { paperSize: 9, orientation: r.landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: single ? [{ state: "frozen", ySplit: topLines + 1 }] : undefined,
  });

  // column widths from what is in them (titles and notes on top are left to run over); they must be set before the first row
  const widest = Math.max(2, ...r.tables.map((t) => t.columns.length));
  const widths: { width: number }[] = [];
  for (let j = 1; j <= widest; j++) {
    let w = 10;
    for (const t of r.tables) {
      const c = t.columns[j - 1];
      if (!c) continue;
      w = Math.max(w, c.label.length + 2);
      for (const [i, row] of [...t.rows, ...(t.total ? [t.total] : [])].entries()) {
        const v = row[j - 1];
        const len = typeof v === "number" ? 16 : c.kind === "date" ? 12 : String(v ?? "").length;
        w = Math.max(w, Math.min(len + 2, 60));
        if (i % 20000 === 19999) await breathe();
      }
    }
    widths.push({ width: w });
  }
  ws.columns = widths;

  const line = (text: string, opts: { bold?: boolean; size?: number; muted?: boolean } = {}) => {
    const row = ws.addRow([text]);
    row.getCell(1).font = { bold: opts.bold, size: opts.size, color: opts.muted ? { argb: "FF666666" } : undefined };
    row.commit();
  };
  const blank = () => ws.addRow([]).commit();
  line(company, { bold: true, size: 14 });
  line(r.title, { bold: true, size: 12 });
  line(r.period);
  line(generated, { muted: true });
  if (r.notice) line(r.notice, { muted: true });
  blank();

  if (r.kpis.length) {
    for (const k of r.kpis) {
      const row = ws.addRow([k.label, k.value]);
      row.getCell(2).numFmt = k.kind === "money" ? MONEY : k.kind === "pct" ? '0.00"%"' : "#,##0";
      row.commit();
    }
    blank();
  }

  const put = (cell: ExcelJS.Cell, v: Cell, c: Column | undefined) => {
    if (v == null || v === "") return;
    if (c?.kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      cell.value = toDate(v);
      cell.numFmt = "dd-mmm-yyyy";
      return;
    }
    cell.value = v;
    if (typeof v === "number") cell.numFmt = c?.kind === "money" ? MONEY : c?.kind === "pct" ? '0.00"%"' : "#,##0";
  };

  for (const t of r.tables) {
    if (!single) line(t.title, { bold: true, size: 11 });
    const head = ws.addRow(t.columns.map((c) => c.label));
    head.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
      cell.border = { bottom: { style: "thin" } };
      const k = t.columns[col - 1]?.kind;
      if (k === "money" || k === "pct" || k === "int") cell.alignment = { horizontal: "right" };
    });
    head.commit();
    const strong = new Set(t.strong ?? []);
    for (const [i, values] of t.rows.entries()) {
      const row = ws.addRow([]);
      values.forEach((v, j) => put(row.getCell(j + 1), v, t.columns[j]));
      if (t.levels?.[i]) row.getCell(1).alignment = { indent: t.levels[i] };
      if (strong.has(i)) row.eachCell((cell) => (cell.font = { bold: true }));
      row.commit();
      if (i % 200 === 199) await breathe();
    }
    if (t.total) {
      const row = ws.addRow([]);
      t.total.forEach((v, j) => put(row.getCell(j + 1), v, t.columns[j]));
      for (let j = 1; j <= t.columns.length; j++) {
        const cell = row.getCell(j);
        cell.font = { bold: true };
        cell.border = { top: { style: "thin" }, bottom: { style: "double" } };
      }
      row.commit();
    }
    if (t.note) line(t.note, { muted: true });
    blank();
  }
  ws.commit();
  await wb.commit();
  await ended;
  return Buffer.concat(chunks);
}
