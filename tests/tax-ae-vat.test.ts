import { describe, expect, it } from "vitest";
import { fromMinor, toMinor } from "@/lib/money";
import { lineTotal, totals } from "@/lib/quotation";
import { trnProblem } from "@/lib/sales";
import { aeVat } from "@/lib/tax/ae-vat";
import { regimeFor } from "@/lib/tax/regime";

describe("UAE VAT regime", () => {
  it("is the regime for AE_VAT; India is not available yet", () => {
    expect(regimeFor("AE_VAT")).toBe(aeVat);
    expect(() => regimeFor("IN_GST")).toThrow(/not available yet/);
  });

  it("gives the same VAT as today's document totals for one code", () => {
    // a spread of awkward prices: VAT is rounded once on the subtotal, as totals() does
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let doc = 0; doc < 200; doc++) {
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({ qty: 1 + Math.floor(rnd() * 9), unitPrice: Math.round(rnd() * 500000) / 100 }));
      for (const pct of [5, 0]) {
        const old = totals(lines, pct);
        const code = aeVat.codeForRate(pct);
        const r = aeVat.compute(lines.map((l) => ({ net: toMinor(lineTotal(l)), code })));
        expect(fromMinor(r.net)).toBe(old.subtotal);
        expect(fromMinor(r.tax)).toBe(old.vat);
        expect(fromMinor(r.total)).toBe(old.total);
      }
    }
  });

  it("works VAT out per code on mixed documents", () => {
    const r = aeVat.compute([
      { net: 10000, code: "SR" },
      { net: 5050, code: "SR" },
      { net: 20000, code: "ZR" },
      { net: 300, code: "OS" },
    ]);
    expect(r.byCode.find((c) => c.code === "SR")).toMatchObject({ net: 15050, tax: 753 });
    expect(r.byCode.find((c) => c.code === "ZR")).toMatchObject({ net: 20000, tax: 0 });
    expect(r).toMatchObject({ net: 35350, tax: 753, total: 36103, selfAssessed: 0 });
  });

  it("charges nothing on reverse charge and imports, but works out the VAT we self-assess", () => {
    const r = aeVat.compute([
      { net: 100000, code: "RC" },
      { net: 40000, code: "IM" },
    ]);
    expect(r).toMatchObject({ tax: 0, total: 140000, selfAssessed: 7000 });
    expect(aeVat.code("RC").boxes.purchase).toEqual(["3", "10"]);
  });

  it("knows its codes and the TRN rule", () => {
    expect(aeVat.codeForRate(5)).toBe("SR");
    expect(aeVat.codeForRate(0)).toBe("ZR");
    expect(() => aeVat.code("XX")).toThrow();
    expect(() => aeVat.compute([{ net: 1.5, code: "SR" }])).toThrow();
    expect(aeVat.validateTaxId("")).toBeNull();
    expect(aeVat.validateTaxId("100-2345-6789-0123")).toBeNull();
    expect(aeVat.validateTaxId("12345")).toMatch(/not 15 digits/);
    expect(trnProblem("12345")).toBe(aeVat.validateTaxId("12345"));
  });
});
