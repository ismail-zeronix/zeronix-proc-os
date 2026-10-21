import { describe, expect, it } from "vitest";
import { addDays, effectiveStatus, lineTotal, marginOf, quoteNumber, quoteWhatsApp, round2, sellPrice, totals } from "@/lib/quotation";

describe("quote numbers", () => {
  it("pads the running number and keeps the year", () => {
    expect(quoteNumber(2026, 1)).toBe("ZQ-2026-0001");
    expect(quoteNumber(2026, 42)).toBe("ZQ-2026-0042");
    expect(quoteNumber(2027, 12345)).toBe("ZQ-2027-12345");
  });
});

describe("prices", () => {
  it("adds the margin on top of cost and rounds to a whole dirham", () => {
    expect(sellPrice(1000, 10)).toBe(1100);
    expect(sellPrice(3333, 8)).toBe(3600);
    expect(sellPrice(1000, 0)).toBe(1000);
  });
  it("gives back the margin a price represents", () => {
    expect(marginOf(1000, 1100)).toBe(10);
    expect(marginOf(3333, 3600)).toBe(8);
    expect(marginOf(null, 1100)).toBeNull();
    expect(marginOf(0, 1100)).toBeNull();
    expect(marginOf(1000, 900)).toBe(-10);
  });
  it("rounds money without floating point drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(lineTotal({ qty: 3, unitPrice: 19.99 })).toBe(59.97);
  });
});

describe("totals", () => {
  const lines = [
    { qty: 5, unitPrice: 3400, cost: 3000 },
    { qty: 2, unitPrice: 1000, cost: null },
  ];
  it("adds VAT on the subtotal", () => {
    const t = totals(lines, 5);
    expect(t.subtotal).toBe(19000);
    expect(t.vat).toBe(950);
    expect(t.total).toBe(19950);
  });
  it("works out profit only from lines that have a cost, and says how many do not", () => {
    const t = totals(lines, 5);
    expect(t.cost).toBe(15000);
    expect(t.soldWithCost).toBe(17000);
    expect(t.profit).toBe(2000);
    expect(t.unpriced).toBe(1);
  });
  it("has no profit when no line has a cost", () => {
    const t = totals([{ qty: 1, unitPrice: 500 }], 5);
    expect(t.profit).toBeNull();
    expect(t.cost).toBeNull();
    expect(t.total).toBe(525);
  });
  it("handles an empty quote and zero VAT", () => {
    expect(totals([], 5).total).toBe(0);
    expect(totals([{ qty: 2, unitPrice: 100 }], 0).total).toBe(200);
  });
});

describe("dates and status", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("shows a sent quote as expired once its date has passed", () => {
    expect(effectiveStatus("sent", "2026-10-20", "2026-10-21")).toBe("expired");
    expect(effectiveStatus("sent", "2026-10-21", "2026-10-21")).toBe("sent");
    expect(effectiveStatus("accepted", "2026-10-01", "2026-10-21")).toBe("accepted");
    expect(effectiveStatus("draft", "2026-10-01", "2026-10-21")).toBe("draft");
  });
});

describe("whatsapp text", () => {
  const text = quoteWhatsApp({
    number: "ZQ-2026-0007",
    company: "ABC Trading",
    contact: "Ahmed",
    validUntil: "2026-10-28",
    vatPct: 5,
    items: [{ description: "Dell Latitude 5450 i5 16GB 512GB", qty: 5, unitPrice: 3400 }],
    subtotal: 17000,
    vatAmount: 850,
    total: 17850,
    preparedBy: "Ismail",
    brand: "Zeronix",
  });
  it("lists lines, VAT and total, and never shows cost", () => {
    expect(text).toContain("*Quotation ZQ-2026-0007* - Zeronix");
    expect(text).toContain("For: ABC Trading (Ahmed)");
    expect(text).toContain("5 x AED 3,400 = AED 17,000");
    expect(text).toContain("VAT 5%: AED 850");
    expect(text).toContain("*Total: AED 17,850*");
    expect(text).toContain("Valid until 28 Oct 2026");
    expect(text).toContain("Prepared by Ismail");
    expect(text.toLowerCase()).not.toContain("cost");
    expect(text.toLowerCase()).not.toContain("margin");
  });
});
