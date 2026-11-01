/**
 * Reads a keyword list (Website › SEO › Import). Our own research file (website/content/keywords.csv) and a Google
 * Keyword Planner export both work: the columns are found by name, and Keyword Planner's "Avg. monthly searches" and
 * "Competition (indexed value)" become volume and difficulty. No database here, so it can be tested.
 */

export interface KeywordRow {
  keyword: string;
  cluster: string;
  intent: "commercial" | "transactional" | "informational" | "navigational";
  industry: string;
  category: string;
  priority: number;
  volume: number | null;
  difficulty: number | null;
  target: string;
  status: "idea" | "planned" | "writing" | "draft" | "published";
  plannedFor: string | null;
  notes: string;
}

/** Splits CSV text into rows, with quoted fields, doubled quotes and newlines inside quotes. Tabs work too (Keyword Planner). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  // the header line decides the separator (Keyword Planner puts title lines above it)
  const lines = src.split(/\r?\n/, 10);
  const firstLine = lines.find((l) => /(^|[\t,])"?keyword"?([\t,]|$)/i.test(l)) ?? lines[0] ?? "";
  const sep = firstLine.split("\t").length > firstLine.split(",").length ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const INTENTS = ["commercial", "transactional", "informational", "navigational"] as const;
const STATUSES = ["idea", "planned", "writing", "draft", "published"] as const;

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return v && v.trim() && Number.isFinite(n) ? Math.round(n) : null;
};

/** Keyword Planner gives a range such as "1K – 10K": take the low end. */
const volumeOf = (v: string | undefined) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^([\d.,]+)\s*([KkMm])?/);
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(base) ? Math.round(base * (m[2]?.toLowerCase() === "k" ? 1000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1)) : null;
};

/** Rows to keywords. Unknown columns are ignored; a row without a keyword is skipped. */
export function keywordsFromCsv(text: string): { rows: KeywordRow[]; skipped: number } {
  const all = parseCsv(text);
  // Keyword Planner puts two title lines above the header: start at the line that has a "keyword" column
  const headAt = all.findIndex((r) => r.some((c) => /^keyword$/i.test(c.trim())));
  if (headAt < 0) return { rows: [], skipped: all.length };
  const head = all[headAt].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const at = {
    keyword: col("keyword"),
    cluster: col("cluster", "group", "topic"),
    intent: col("intent"),
    industry: col("industry"),
    category: col("category"),
    priority: col("priority"),
    volume: col("volume", "avg. monthly searches", "search volume"),
    difficulty: col("difficulty", "kd", "competition (indexed value)"),
    target: col("target", "target page", "url"),
    status: col("status"),
    plannedFor: col("planned_for", "planned for", "date"),
    notes: col("notes", "note"),
  };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const rows: KeywordRow[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of all.slice(headAt + 1)) {
    const keyword = get(r, at.keyword).toLowerCase().replace(/\s+/g, " ").slice(0, 200);
    if (!keyword || seen.has(keyword)) {
      skipped++;
      continue;
    }
    seen.add(keyword);
    const intent = get(r, at.intent).toLowerCase();
    const status = get(r, at.status).toLowerCase();
    const date = get(r, at.plannedFor);
    const target = get(r, at.target);
    rows.push({
      keyword,
      cluster: get(r, at.cluster).slice(0, 120),
      intent: (INTENTS as readonly string[]).includes(intent) ? (intent as KeywordRow["intent"]) : "commercial",
      industry: get(r, at.industry).toLowerCase(),
      category: get(r, at.category).toLowerCase(),
      priority: Math.min(3, Math.max(1, num(get(r, at.priority)) ?? 2)),
      volume: at.volume >= 0 ? volumeOf(get(r, at.volume)) : null,
      difficulty: at.difficulty >= 0 ? num(get(r, at.difficulty)) : null,
      target: target.startsWith("/") ? target.slice(0, 300) : "",
      status: (STATUSES as readonly string[]).includes(status) ? (status as KeywordRow["status"]) : "idea",
      plannedFor: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      notes: get(r, at.notes).slice(0, 1000),
    });
  }
  return { rows, skipped };
}
