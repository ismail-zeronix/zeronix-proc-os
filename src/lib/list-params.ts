/**
 * How a list's page, page size and sort travel in the URL (`?page=2&size=100&sort=due&dir=asc`), the same on every list.
 * No database and no React, so it is easy to test.
 */
export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export type SortDir = "asc" | "desc";
type Sp = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export interface ListState {
  page: number;
  size: number;
  offset: number;
  sort: string;
  dir: SortDir;
  /** What was typed in the list's search box (empty: no filter). */
  q: string;
}

/** Reads the URL. Only the columns a list offers can be sorted on; anything else falls back to its default. */
export function readList(sp: Sp, sorts: readonly string[], fallback: { sort: string; dir: SortDir }): ListState {
  const n = Number(one(sp.page));
  const page = Number.isInteger(n) && n > 1 ? n : 1;
  const s = Number(one(sp.size));
  const size = (PAGE_SIZES as readonly number[]).includes(s) ? s : DEFAULT_PAGE_SIZE;
  const asked = one(sp.sort);
  const known = !!asked && sorts.includes(asked);
  const d = one(sp.dir);
  return { page, size, offset: (page - 1) * size, sort: known ? asked : fallback.sort, dir: known && (d === "asc" || d === "desc") ? d : fallback.dir, q: (one(sp.q) ?? "").trim().slice(0, 100) };
}

/** "%text%" for ILIKE, with the wildcards a person might type taken literally. */
export const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Rows already in memory whose fields contain the search text (any case). */
export const matching = <T>(rows: readonly T[], q: string, fields: (r: T) => (string | null | undefined)[]): T[] => {
  const s = q.trim().toLowerCase();
  return s ? rows.filter((r) => fields(r).some((f) => (f ?? "").toLowerCase().includes(s))) : [...rows];
};

/** One page of rows already in memory (lists whose flags and counts are worked out across all their rows). */
export const pageOf = <T>(rows: readonly T[], l: Pick<ListState, "offset" | "size">): T[] => rows.slice(l.offset, l.offset + l.size);

/** Sorts rows in memory. Empty values always go last, and ties keep their order. */
export function sortRows<T>(rows: readonly T[], getters: Record<string, (r: T) => string | number | null | undefined>, l: Pick<ListState, "sort" | "dir">): T[] {
  const get = getters[l.sort];
  if (!get) return [...rows];
  const sign = l.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x == null || x === "") return y == null || y === "" ? 0 : 1;
    if (y == null || y === "") return -1;
    return sign * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
  });
}
