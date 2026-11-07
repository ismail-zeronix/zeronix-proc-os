/**
 * UAE VAT (Federal Decree-Law No. 8 of 2017). Codes and the VAT 201 boxes they feed:
 *   SR standard 5%     sales box 1 (by emirate), purchases box 9
 *   ZR zero-rated 0%   sales box 4 (exports, qualifying supplies); nothing to reclaim on purchases
 *   EX exempt          sales box 5
 *   RC reverse charge  purchases of imported services: box 3 (tax due) and box 10 (recovered)
 *   IM imports         goods imported through customs: box 6 and box 10
 *   OS out of scope    not reported (government fees passed on, salaries, ...)
 * VAT is worked out once per code on the net of all lines with that code (FTA allows rounding at invoice level), so a
 * document with one code gives exactly what totals() in lib/quotation.ts gives today.
 */
import { pctOf, sumMinor } from "@/lib/money";
import type { TaxByCode, TaxCodeDef, TaxLineInput, TaxRegime, TaxResult } from "./regime";

const VAT = [{ key: "vat", label: "VAT", share: 1 }];

const CODES: readonly TaxCodeDef[] = [
  { code: "SR", label: "Standard 5%", hint: "Most sales and purchases in the UAE", ratePct: 5, selfAssessed: false, boxes: { sale: ["1"], purchase: ["9"] }, components: VAT },
  { code: "ZR", label: "Zero-rated 0%", hint: "Exports outside the GCC, international transport, some education and health", ratePct: 0, selfAssessed: false, boxes: { sale: ["4"], purchase: [] }, components: VAT },
  { code: "EX", label: "Exempt", hint: "Residential rent, bare land, some financial services", ratePct: 0, selfAssessed: false, boxes: { sale: ["5"], purchase: [] }, components: VAT },
  { code: "RC", label: "Reverse charge 5%", hint: "Services bought from abroad (software, cloud, ads): we account for the VAT", ratePct: 5, selfAssessed: true, boxes: { sale: [], purchase: ["3", "10"] }, components: VAT },
  { code: "IM", label: "Import via customs 5%", hint: "Goods imported through UAE customs under our TRN", ratePct: 5, selfAssessed: true, boxes: { sale: [], purchase: ["6", "10"] }, components: VAT },
  { code: "OS", label: "Out of scope", hint: "No VAT and not on the return: government fees, fines, salaries", ratePct: 0, selfAssessed: false, boxes: { sale: [], purchase: [] }, components: VAT },
];

const byCode = new Map(CODES.map((c) => [c.code, c]));

export const aeVat: TaxRegime = {
  key: "AE_VAT",
  label: "UAE VAT",
  taxName: "VAT",
  taxIdLabel: "TRN",
  codes: CODES,

  code(code) {
    const c = byCode.get(code);
    if (!c) throw new Error(`Unknown VAT code "${code}"`);
    return c;
  },

  codeForRate(ratePct) {
    return ratePct > 0 ? "SR" : "ZR";
  },

  validateTaxId(id) {
    const t = id.replace(/[\s-]/g, "");
    return !t || /^\d{15}$/.test(t) ? null : `TRN "${id}" is not 15 digits.`;
  },

  compute(lines: readonly TaxLineInput[]): TaxResult {
    const groups = new Map<string, number>();
    for (const l of lines) {
      if (!Number.isInteger(l.net)) throw new Error("Line amounts must be in minor units");
      aeVat.code(l.code);
      groups.set(l.code, (groups.get(l.code) ?? 0) + l.net);
    }
    const out: TaxByCode[] = [...groups].map(([code, net]) => {
      const def = aeVat.code(code);
      const vat = pctOf(net, def.ratePct);
      const tax = def.selfAssessed ? 0 : vat;
      const selfAssessed = def.selfAssessed ? vat : 0;
      return { code, net, tax, selfAssessed, components: [{ key: "vat", amount: tax + selfAssessed }] };
    });
    const net = sumMinor(out.map((g) => g.net));
    const tax = sumMinor(out.map((g) => g.tax));
    return { net, tax, total: net + tax, selfAssessed: sumMinor(out.map((g) => g.selfAssessed)), byCode: out };
  },
};
