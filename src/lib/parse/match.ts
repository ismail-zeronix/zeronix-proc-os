/** Normalised token: lowercase, alphanumerics only. "15-FD0130WM" -> "15fd0130wm". */
export function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The CPU model number, which is what really distinguishes configurations:
 * "Core i5-13420H" -> "13420h", "Core Ultra 5 226V" -> "226v", "Core i3-N305" -> "n305".
 * Returns "" when only a tier is given ("U7", "Core Ultra 7").
 */
export function cpuToken(cpu: string | null | undefined): string {
  const tokens = (cpu ?? "").toLowerCase().split(/[^a-z0-9]+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^[a-z]?\d{3,5}[a-z]{0,3}$/.test(tokens[i])) return tokens[i];
  }
  return "";
}

export interface MatchFields {
  brand: string;
  partNumber: string;
  modelName: string;
  cpu: string;
  ramGb: number | null;
  storage: string;
}

/**
 * Canonical identity of a product across suppliers.
 * Part numbers like Lenovo "15IRH10" cover several configurations, so CPU model + RAM are part of the key.
 *   with part number:    "hp|fm0013dx|226v|16"
 *   without part number: "lenovo|v15gen5|13420h|16|512gb"
 */
export function matchKey(f: MatchFields): string {
  const brand = norm(f.brand) || "unknown";
  const pn = norm(f.partNumber);
  const cpu = cpuToken(f.cpu);
  const ram = f.ramGb ?? "";
  if (pn.length >= 4) return [brand, pn, cpu, ram].join("|");
  return [brand, norm(f.modelName), cpu, ram, norm(f.storage)].join("|");
}

/** Same part number and no conflicting CPU / RAM (unknown values are compatible). */
export function compatible(
  a: { cpu: string; ramGb: number | null },
  b: { cpu: string; ramGb: number | null },
): boolean {
  const ca = cpuToken(a.cpu);
  const cb = cpuToken(b.cpu);
  if (ca && cb && ca !== cb) return false;
  if (a.ramGb != null && b.ramGb != null && a.ramGb !== b.ramGb) return false;
  return true;
}

export function specSummary(f: {
  cpu: string; ramGb: number | null; storage: string; display: string; gpu: string; os: string;
}): string {
  return [f.cpu, f.ramGb ? `${f.ramGb}GB` : "", f.storage, f.display, f.gpu, f.os]
    .filter(Boolean)
    .join(" | ");
}
