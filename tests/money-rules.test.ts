import { describe, expect, it } from "vitest";
import { lineTotal, round2, totals } from "@/lib/quotation";
import { docTax } from "@/lib/tax/doc-tax";
import { isDay, toFils } from "@/lib/validation";

describe("one rounding rule for quotes, orders and invoices", () => {
  it("rounds half away from zero to the fil", () => {
    expect(round2(2.135)).toBe(2.14);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-2.135)).toBe(-2.14);
    expect(round2(0)).toBe(0);
  });

  it("gives the same VAT through a quote as on a direct invoice (AED 42.70 → 2.14)", () => {
    expect(totals([{ qty: 1, unitPrice: 42.7 }], 5).vat).toBe(2.14);
    expect(docTax([{ net: 42.7, code: "SR" }]).vat).toBe(2.14);
  });

  it("agrees with docTax on every subtotal from 0.01 to 2,000.00", () => {
    const bad: number[] = [];
    for (let fils = 1; fils <= 200_000; fils++) {
      const net = fils / 100;
      const a = totals([{ qty: 1, unitPrice: net }], 5);
      const b = docTax([{ net, code: "SR" }]);
      if (a.vat !== b.vat || a.total !== b.total) bad.push(net);
      if (bad.length > 5) break;
    }
    expect(bad).toEqual([]);
  });

  it("lines add up to the subtotal once prices are kept to the fil (100 × 10.555)", () => {
    const unitPrice = toFils(10.555);
    expect(unitPrice).toBe(10.56);
    const t = totals([{ qty: 100, unitPrice }], 5);
    expect(t.subtotal).toBe(lineTotal({ qty: 100, unitPrice }));
    expect(t.subtotal).toBe(1056);
  });
});

describe("isDay", () => {
  it("accepts real days only", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-02-31")).toBe(false);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("26-01-01")).toBe(false);
    expect(isDay(null)).toBe(false);
  });
});

describe("VAT printed per line", () => {
  it("adds up to the document VAT", async () => {
    const { lineVats } = await import("@/lib/tax/doc-tax");
    const lines = [0.3, 0.3, 0.3].map((net) => ({ net, ratePct: 5 }));
    const vat = docTax(lines.map((l) => ({ net: l.net, code: "SR" }))).vat;
    expect(vat).toBe(0.05);
    const parts = lineVats(lines, vat);
    expect(round2(parts.reduce((s, x) => s + x, 0))).toBe(0.05);
    expect(lineVats([{ net: 100, ratePct: 5 }, { net: 50, ratePct: 0 }], 5)).toEqual([5, 0]);
    expect(lineVats([{ net: 100, ratePct: 0 }], 0)).toEqual([0]);
  });
});
