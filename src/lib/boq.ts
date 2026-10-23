/** Project BOQ rules: kinds of line, units, section order and totals. Safe for client components. */
import { lineTotal, round2 } from "@/lib/quotation";

export const LINE_TYPES = [
  { key: "material", label: "Material", hint: "Something we buy and supply (Find price works here)" },
  { key: "labour", label: "Labour", hint: "Our technicians' time: installation, cabling, programming" },
  { key: "service", label: "Service", hint: "Testing, commissioning, training, support, survey" },
  { key: "lump_sum", label: "Lump sum", hint: "One price for a whole piece of work" },
] as const;

export type LineType = (typeof LINE_TYPES)[number]["key"];
export const isLineType = (k: string): k is LineType => LINE_TYPES.some((t) => t.key === k);
export const lineTypeLabel = (k: string) => LINE_TYPES.find((t) => t.key === k)?.label ?? k;

/** Units offered on a BOQ line; "" means pieces and prints as nothing. */
export const UNITS = ["nos", "m", "set", "lot", "day", "hour", "roll", "box", "pair"] as const;

/** The unit a new line of this type starts with. */
export const defaultUnit = (type: string) => (type === "labour" ? "day" : type === "lump_sum" || type === "service" ? "lot" : "nos");

/** "Not in a section": lines with no heading (e.g. lines added before the deal became a project). */
export const NO_SECTION = "";

export interface BoqLine {
  id: number;
  section: string;
  position: number;
  qty: number;
  unitPriceAed: number;
  costAed: number | null;
  optional: boolean;
}

/**
 * Lines grouped in the project's section order. Lines whose section is not in the list (or empty) come first under
 * "Not in a section", so nothing ever disappears.
 */
export function groupBoq<T extends BoqLine>(lines: T[], sections: string[]): { section: string; lines: T[] }[] {
  const known = new Set(sections);
  const loose = lines.filter((l) => !known.has(l.section));
  const groups = sections.map((s) => ({ section: s, lines: lines.filter((l) => l.section === s) }));
  const sorted = (g: { section: string; lines: T[] }) => ({ ...g, lines: [...g.lines].sort((a, b) => a.position - b.position || a.id - b.id) });
  return (loose.length ? [{ section: NO_SECTION, lines: loose }, ...groups] : groups).map(sorted);
}

/** All lines flattened in section order: the order a quote copies them in. */
export const orderedBoq = <T extends BoqLine>(lines: T[], sections: string[]): T[] => groupBoq(lines, sections).flatMap((g) => g.lines);

export interface Money {
  /** Selling total before VAT (optional lines left out). */
  sell: number;
  /** Our cost of the lines that have one. */
  cost: number;
  /** Selling total of the lines that have a cost, so margin compares like with like. */
  sellWithCost: number;
  profit: number;
  /** Profit as a share of the selling price (gross margin), null when nothing has a cost. */
  marginPct: number | null;
  /** Lines without a cost (left out of profit). */
  noCost: number;
  /** Optional extras: count and their selling total. */
  optionalCount: number;
  optionalSell: number;
}

export function boqMoney(lines: BoqLine[]): Money {
  const firm = lines.filter((l) => !l.optional);
  const extras = lines.filter((l) => l.optional);
  const withCost = firm.filter((l) => l.costAed != null);
  const sell = round2(firm.reduce((s, l) => s + lineTotal({ qty: l.qty, unitPrice: l.unitPriceAed }), 0));
  const cost = round2(withCost.reduce((s, l) => s + l.qty * (l.costAed as number), 0));
  const sellWithCost = round2(withCost.reduce((s, l) => s + lineTotal({ qty: l.qty, unitPrice: l.unitPriceAed }), 0));
  const profit = round2(sellWithCost - cost);
  return {
    sell,
    cost,
    sellWithCost,
    profit,
    marginPct: sellWithCost > 0 ? Math.round((profit / sellWithCost) * 1000) / 10 : null,
    noCost: firm.length - withCost.length,
    optionalCount: extras.length,
    optionalSell: round2(extras.reduce((s, l) => s + lineTotal({ qty: l.qty, unitPrice: l.unitPriceAed }), 0)),
  };
}

/** Cleans a section heading typed by a person: trimmed, single spaces, at most 80 characters. */
export const cleanSection = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);
