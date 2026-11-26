/** Which pasted column holds which field, guessed from the header names. Pure: runs in the browser and in tests. */

export interface FieldDef<K extends string = string> {
  key: K;
  label: string;
  required?: boolean;
  /** Header names (lower case) that mean this field. The longest matching hint wins. */
  hints: readonly string[];
}

/** Column index per field; a field left out is not in the file. */
export type Mapping<K extends string = string> = Partial<Record<K, number>>;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_\-.:#()/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Exact header matches first; then a header that contains a hint (hints under 4 letters only match exactly, so "po"
 * never picks "description"). Each column is used once, and the longest hint is placed first, so "Item Total" goes to the
 * line amount and not to the document total.
 */
export function guessColumns<K extends string>(headers: readonly string[], fields: readonly FieldDef<K>[]): Mapping<K> {
  const h = headers.map(norm);
  const used = new Set<number>();
  const map: Mapping<K> = {};
  for (const pass of ["exact", "partial"] as const) {
    const hits: { field: K; col: number; len: number }[] = [];
    for (const f of fields) {
      h.forEach((col, idx) => {
        if (!col) return;
        for (const hint of f.hints) {
          if (pass === "exact" ? col === hint : hint.length >= 4 && col.includes(hint)) hits.push({ field: f.key, col: idx, len: hint.length });
        }
      });
    }
    hits.sort((a, b) => b.len - a.len);
    for (const hit of hits) {
      if (map[hit.field] !== undefined || used.has(hit.col)) continue;
      map[hit.field] = hit.col;
      used.add(hit.col);
    }
  }
  return map;
}

/** The required fields no column was found for. */
export function missingFields<K extends string>(fields: readonly FieldDef<K>[], map: Mapping<K>): FieldDef<K>[] {
  return fields.filter((f) => f.required && map[f.key] === undefined);
}

/** The cell of a field in a row, trimmed; "" when the field is not mapped or the row is short. */
export function cellOf<K extends string>(row: readonly string[], map: Mapping<K>, key: K): string {
  const i = map[key];
  return i === undefined ? "" : (row[i] ?? "").trim();
}
