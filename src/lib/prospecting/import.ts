/** Reading prospect lists (CSV or the first sheet of an Excel file): column guessing and row cleaning. No database here. */

import { domainOf, isGenericEmail } from "./constants";

/** The fields a column can be mapped to. */
export const IMPORT_FIELDS = [
  { key: "name", label: "Company name", hints: ["company", "company name", "name", "business name", "organisation", "organization", "trade name", "entity", "legal name"] },
  { key: "website", label: "Website", hints: ["website", "web", "url", "site", "domain", "web site"] },
  { key: "email", label: "Email", hints: ["email", "e-mail", "mail", "email address", "contact email"] },
  { key: "phone", label: "Phone", hints: ["phone", "telephone", "tel", "mobile", "contact number", "phone number"] },
  { key: "emirate", label: "Emirate / city", hints: ["emirate", "city", "location", "region"] },
  { key: "freeZone", label: "Free zone", hints: ["free zone", "freezone", "zone", "jurisdiction", "authority"] },
  { key: "activity", label: "Activity", hints: ["activity", "activities", "business activity", "licensed activity", "category", "sector", "industry", "description"] },
  { key: "licenseNo", label: "Licence no.", hints: ["licence", "license", "licence no", "license no", "license number", "licence number", "registration no", "registration number"] },
  { key: "licenseDate", label: "Licence date", hints: ["licence date", "license date", "issue date", "date", "registration date", "issue date", "incorporation date", "established"] },
  { key: "address", label: "Address", hints: ["address", "office", "location address"] },
  { key: "linkedinUrl", label: "LinkedIn", hints: ["linkedin", "linkedin url", "linkedin page"] },
  { key: "personName", label: "Person name", hints: ["contact", "contact name", "contact person", "person", "full name", "first name"] },
  { key: "personTitle", label: "Person title", hints: ["title", "job title", "designation", "position", "role"] },
  { key: "notes", label: "Notes", hints: ["notes", "note", "comments", "remarks"] },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
/** Column index per field (-1 = not used). */
export type ImportMapping = Partial<Record<ImportField, number>>;

/** Splits CSV text into rows (RFC 4180: quoted fields, doubled quotes, newlines inside quotes). Also reads ; and tab files. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_\-.:#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Best guess of which column holds which field, from the header names. Exact header matches come first; then the
 * longest matching hint wins, so "License Issue Date" is the licence date and not the licence number.
 */
export function guessMapping(headers: string[]): ImportMapping {
  const h = headers.map(norm);
  const used = new Set<number>();
  const map: ImportMapping = {};
  for (const pass of ["exact", "partial"] as const) {
    const hits: { field: ImportField; col: number; len: number }[] = [];
    for (const f of IMPORT_FIELDS) {
      h.forEach((col, idx) => {
        if (!col) return;
        for (const hint of f.hints) if (pass === "exact" ? col === hint : col.includes(hint)) hits.push({ field: f.key, col: idx, len: hint.length });
      });
    }
    // field order breaks ties, so the company name is placed before a person name
    hits.sort((x, y) => y.len - x.len);
    for (const hit of hits) {
      if (map[hit.field] !== undefined || used.has(hit.col)) continue;
      map[hit.field] = hit.col;
      used.add(hit.col);
    }
  }
  return map;
}

export interface ImportedProspect {
  name: string;
  website: string;
  domain: string;
  email: string;
  phone: string;
  emirate: string;
  freeZone: string;
  activity: string;
  licenseNo: string;
  /** yyyy-mm-dd or "" */
  licenseDate: string;
  address: string;
  linkedinUrl: string;
  personName: string;
  personTitle: string;
  notes: string;
}

/** Excel serials, dd/mm/yyyy (UAE order), yyyy-mm-dd and "12 Oct 2026" to yyyy-mm-dd. Anything else gives "". */
export function toIsoDate(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400_000);
    return d.toISOString().slice(0, 10);
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /[a-z]/i.test(s)) {
    const d = new Date(t);
    return valid(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return "";
}

function valid(y: number, mo: number, d: number): string {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1950 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return dt.toISOString().slice(0, 10);
}

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** One sheet row to a clean prospect, or null when there is no company name. */
export function rowToProspect(row: string[], map: ImportMapping): ImportedProspect | null {
  const get = (f: ImportField, max = 200) => {
    const i = map[f];
    return i === undefined || i < 0 ? "" : clip(String(row[i] ?? ""), max);
  };
  const name = get("name", 160);
  if (name.length < 2) return null;
  const email = get("email", 254).toLowerCase();
  const website = get("website");
  return {
    name,
    website,
    domain: domainOf(website) || domainOf(email),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    phone: get("phone", 40),
    emirate: get("emirate", 40),
    freeZone: get("freeZone", 80),
    activity: get("activity", 300),
    licenseNo: get("licenseNo", 60),
    licenseDate: toIsoDate(get("licenseDate", 40)),
    address: get("address", 300),
    linkedinUrl: get("linkedinUrl"),
    personName: get("personName", 120),
    personTitle: get("personTitle", 80),
    notes: get("notes", 2000),
  };
}

/** How sure we are of an imported email: a published shared inbox is "generic", a named person's address is "likely". */
export const importedEmailStatus = (email: string) => (isGenericEmail(email) ? "generic" : "likely");
