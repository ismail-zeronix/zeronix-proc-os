/**
 * VAT of a whole document from its lines, in AED: what the forms show and the actions save. Worked out once per code on
 * the net of all lines with that code, so a document with one code gives exactly what it gave before line codes.
 * Only standard-rated lines charge VAT on the document; reverse charge and imports are VAT we account for ourselves.
 */
import { fromMinor, pctOf, toMinor } from "@/lib/money";
import { aeVat } from "./ae-vat";

export const SALES_TAX_CODES = ["SR", "ZR", "EX", "OS"] as const;
export const PURCHASE_TAX_CODES = ["SR", "ZR", "EX", "RC", "IM", "OS"] as const;

/** The options of a tax code picker. */
export const taxCodeOptions = (codes: readonly string[]) => codes.map((c) => ({ code: c, label: aeVat.code(c).label, hint: aeVat.code(c).hint }));
export const taxCodeLabel = (code: string) => aeVat.codes.find((c) => c.code === code)?.label ?? code;
export const taxCodeRate = (code: string) => aeVat.codes.find((c) => c.code === code)?.ratePct ?? 0;
/** The VAT that shows on a document line: self-assessed VAT is not charged on it. */
export const chargedRate = (code: string) => (aeVat.codes.find((c) => c.code === code)?.selfAssessed ? 0 : taxCodeRate(code));

export interface TaxPart {
  code: string;
  net: number;
  /** Charged on the document. */
  tax: number;
  /** VAT we account for ourselves (reverse charge, imports): not paid to the supplier. */
  selfAssessed: number;
}

export interface DocTax {
  parts: TaxPart[];
  subtotal: number;
  vat: number;
  selfAssessed: number;
  total: number;
  /** The rate printed for a document charging one rate; 0 when nothing is charged. */
  vatPct: number;
}

/** `vatOverride`: the VAT printed on a supplier's invoice when it differs by a few fils. Only standard-rated lines carry VAT, so it replaces theirs. */
export function docTax(lines: readonly { net: number; code: string }[], vatOverride?: number | null): DocTax {
  const r = aeVat.compute(lines.map((l) => ({ net: toMinor(l.net), code: l.code })));
  const override = vatOverride == null ? null : toMinor(vatOverride);
  const minor = r.byCode.map((g) => ({ code: g.code, net: g.net, tax: override != null && g.tax > 0 ? override : g.tax, selfAssessed: g.selfAssessed }));
  const net = minor.reduce((s, g) => s + g.net, 0);
  const tax = minor.reduce((s, g) => s + g.tax, 0);
  const self = minor.reduce((s, g) => s + g.selfAssessed, 0);
  return {
    parts: minor.map((g) => ({ code: g.code, net: fromMinor(g.net), tax: fromMinor(g.tax), selfAssessed: fromMinor(g.selfAssessed) })),
    subtotal: fromMinor(net),
    vat: fromMinor(tax),
    selfAssessed: fromMinor(self),
    total: fromMinor(net + tax),
    vatPct: minor.some((g) => g.tax > 0) ? Math.max(...minor.filter((g) => g.tax > 0).map((g) => aeVat.code(g.code).ratePct)) : 0,
  };
}

/**
 * The VAT a credit or debit note gives back. Worked out on what it credits, but never past what is left of the document's
 * VAT, and when it clears everything standard-rated it takes exactly what is left, so fils never remain after several notes.
 */
export function noteVat(note: readonly { net: number; code: string }[], remaining: { standardNet: number; vat: number }): number {
  const standard = toMinor(note.filter((l) => l.code === "SR").reduce((s, l) => s + l.net, 0));
  const left = toMinor(remaining.vat);
  if (standard === 0) return 0;
  if (standard >= toMinor(remaining.standardNet)) return fromMinor(left);
  return fromMinor(Math.min(pctOf(standard, 5), left));
}
