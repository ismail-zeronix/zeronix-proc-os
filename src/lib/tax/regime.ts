/**
 * A tax regime is everything country-specific about tax: the codes, how tax is worked out, how the tax number looks and
 * (later) the return and audit file. UAE VAT is the first; India GST plugs into the same shape (Phase G of the accounts
 * plan). Code outside src/lib/tax never asks "which country?": it asks the organisation's regime.
 *
 * Amounts here are minor units (fils, paise): see lib/money.ts.
 */
import { aeVat } from "./ae-vat";
import { UserError } from "@/lib/user-error";

export type TaxRegimeKey = "AE_VAT" | "IN_GST";

/** One part of a tax: UAE VAT has one ("vat"); GST splits into CGST + SGST, or IGST. */
export interface TaxComponentDef {
  key: string;
  label: string;
  /** Share of the code's rate this component takes (CGST 0.5 + SGST 0.5; IGST 1; UAE VAT 1). */
  share: number;
}

export interface TaxCodeDef {
  code: string;
  label: string;
  /** Plain-words hint for people picking it. */
  hint: string;
  ratePct: number;
  /** Tax the buyer accounts for themselves (reverse charge, imports): nothing is charged on the document. */
  selfAssessed: boolean;
  /** Return boxes this code feeds: on sales and on purchases (UAE VAT 201 box numbers). Empty = not reported. */
  boxes: { sale: string[]; purchase: string[] };
  components: TaxComponentDef[];
}

export interface TaxLineInput {
  /** Net amount (before tax) in minor units. */
  net: number;
  code: string;
}

export interface TaxByCode {
  code: string;
  net: number;
  /** Tax charged on the document. */
  tax: number;
  /** Reverse-charge / import tax the buyer self-assesses (0 for normal codes). */
  selfAssessed: number;
  components: { key: string; amount: number }[];
}

export interface TaxResult {
  net: number;
  tax: number;
  total: number;
  selfAssessed: number;
  byCode: TaxByCode[];
}

/** Facts some regimes need (GST: is the supply within one state?). UAE VAT ignores it. */
export interface TaxContext {
  supplierState?: string;
  placeOfSupply?: string;
}

export interface TaxRegime {
  key: TaxRegimeKey;
  label: string;
  /** "VAT", "GST" */
  taxName: string;
  /** "TRN", "GSTIN" */
  taxIdLabel: string;
  codes: readonly TaxCodeDef[];
  code(code: string): TaxCodeDef;
  /** The code a document-level rate means (UAE: 5 → SR, 0 → ZR), for documents saved before line tax codes. */
  codeForRate(ratePct: number): string;
  /** Null when fine; empty = not registered. */
  validateTaxId(id: string): string | null;
  compute(lines: readonly TaxLineInput[], ctx?: TaxContext): TaxResult;
}

const REGIMES: Partial<Record<TaxRegimeKey, TaxRegime>> = { AE_VAT: aeVat };

export function regimeFor(key: TaxRegimeKey): TaxRegime {
  const r = REGIMES[key];
  if (!r) throw new UserError(`The ${key} tax setup is not available yet.`);
  return r;
}
