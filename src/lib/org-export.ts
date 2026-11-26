import "server-only";
import JSZip from "jszip";
import { sql, type SQL } from "drizzle-orm";
import { readStoredFile } from "@/lib/files-store";

/**
 * "Download all our data": one ZIP with a CSV per table (only the tables that have rows), the uploaded files and a
 * README. Used by an organisation's admin (/api/data-export, through the app's role: row-level security keeps it to
 * their own rows) and by the platform console before closing an organisation (its own role, filtered by organisation).
 * Columns that hold passwords, tokens, keys or other secrets are left out.
 */

/** Columns never exported: password and token hashes, encrypted credentials, keys. */
const HIDDEN_COLUMN = /(password|secret|token|hash|_enc$|api_key)/i;
/** Tables that are working state, not the organisation's records. */
const SKIP_TABLES = new Set(["invites", "password_resets", "export_jobs", "error_log"]);

/** The query runner: the app's db (row-level security) or the platform's (all organisations, so filtered here). */
type Exec = { execute: (q: SQL) => Promise<{ rows: Record<string, unknown>[] }> };

/** One CSV cell: quoted, and a leading = + - @ made harmless for spreadsheets (formula injection). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): { csv: string; columns: string[] } {
  const columns = Object.keys(rows[0] ?? {}).filter((c) => !HIDDEN_COLUMN.test(c) && c !== "organization_id");
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))];
  // a byte-order mark, so Excel opens Arabic and accented names correctly
  return { csv: `﻿${lines.join("\r\n")}\r\n`, columns };
}

const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";

export async function buildOrgExport(exec: Exec, orgId: number, orgName: string): Promise<{ zip: Buffer; tables: number; rows: number; files: number }> {
  const zip = new JSZip();
  const listed = await exec.execute(sql`
    SELECT c.table_name::text AS table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
    ORDER BY 1`);
  const summary: string[] = [];
  let tables = 0;
  let rows = 0;
  for (const { table_name } of listed.rows as { table_name: string }[]) {
    if (SKIP_TABLES.has(table_name) || !/^[a-z_][a-z0-9_]*$/.test(table_name)) continue;
    // the organisation filter is also what row-level security does for the app's role
    const r = await exec.execute(sql`SELECT * FROM ${sql.identifier(table_name)} WHERE organization_id = ${orgId} ORDER BY 1`);
    if (!r.rows.length) continue;
    zip.file(`tables/${table_name}.csv`, toCsv(r.rows).csv);
    summary.push(`${table_name}.csv: ${r.rows.length} row${r.rows.length === 1 ? "" : "s"}`);
    tables++;
    rows += r.rows.length;
  }
  const org = await exec.execute(sql`SELECT * FROM organizations WHERE id = ${orgId}`);
  if (org.rows.length) zip.file("tables/organization.csv", toCsv(org.rows).csv);

  const stored = (await exec.execute(sql`SELECT id, name, stored_name FROM files WHERE organization_id = ${orgId} ORDER BY id`)).rows as { id: number; name: string; stored_name: string }[];
  let files = 0;
  for (const f of stored) {
    try {
      zip.file(`files/${f.id}-${safeName(f.name)}`, await readStoredFile(f.stored_name));
      files++;
    } catch {
      summary.push(`file ${f.id} (${f.name}) could not be read`);
    }
  }
  zip.file(
    "README.txt",
    [
      `All data of ${orgName} in ZeronixOS, made ${new Date().toISOString()}.`,
      "",
      "tables/  one CSV file per kind of record (UTF-8, comma separated; open with Excel or Google Sheets).",
      "         Ids link the files together, e.g. invoices.csv company_id = companies.csv id.",
      "files/   the documents uploaded to Files, named <file id>-<name> (files.csv lists them).",
      "",
      "Passwords, sign-in tokens and stored keys are never included.",
      "",
      ...summary,
      `files/: ${files} file${files === 1 ? "" : "s"}`,
    ].join("\r\n"),
  );
  return { zip: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), tables, rows, files };
}
