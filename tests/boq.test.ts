import { describe, expect, it } from "vitest";
import { boqMoney, cleanSection, defaultUnit, groupBoq, orderedBoq } from "@/lib/boq";
import { quoteWhatsApp } from "@/lib/quotation";

const line = (id: number, section: string, position: number, qty: number, price: number, cost: number | null, optional = false) => ({
  id,
  section,
  position,
  qty,
  unitPriceAed: price,
  costAed: cost,
  optional,
});

describe("groupBoq", () => {
  const sections = ["Cameras", "Cabling", "Installation"];
  const lines = [line(1, "Cabling", 0, 300, 3, 2), line(2, "Cameras", 1, 8, 400, 300), line(3, "Cameras", 2, 1, 900, 700), line(4, "", 3, 1, 50, null), line(5, "Old name", 4, 1, 10, null)];

  it("follows the section order, with loose lines first", () => {
    const g = groupBoq(lines, sections);
    expect(g.map((x) => x.section)).toEqual(["", "Cameras", "Cabling", "Installation"]);
    expect(g[0].lines.map((l) => l.id)).toEqual([4, 5]);
    expect(g[1].lines.map((l) => l.id)).toEqual([2, 3]);
    expect(g[3].lines).toEqual([]);
  });

  it("flattens in that order for the quote", () => {
    expect(orderedBoq(lines, sections).map((l) => l.id)).toEqual([4, 5, 2, 3, 1]);
  });
});

describe("boqMoney", () => {
  it("leaves optional lines out of the total and margin", () => {
    const m = boqMoney([line(1, "A", 0, 2, 150, 100), line(2, "A", 1, 1, 500, null), line(3, "A", 2, 1, 1000, 800, true)]);
    expect(m.sell).toBe(800);
    expect(m.cost).toBe(200);
    expect(m.sellWithCost).toBe(300);
    expect(m.profit).toBe(100);
    expect(m.marginPct).toBe(50);
    expect(m.noCost).toBe(1);
    expect(m.optionalCount).toBe(1);
    expect(m.optionalSell).toBe(1000);
  });

  it("has no margin when nothing has a cost", () => {
    expect(boqMoney([line(1, "A", 0, 1, 100, null)]).marginPct).toBeNull();
    expect(boqMoney([]).sell).toBe(0);
  });
});

describe("small rules", () => {
  it("cleans section names", () => {
    expect(cleanSection("  Alarm   system ")).toBe("Alarm system");
    expect(cleanSection("x".repeat(100))).toHaveLength(80);
  });

  it("gives each kind of line a sensible unit", () => {
    expect(defaultUnit("material")).toBe("nos");
    expect(defaultUnit("labour")).toBe("day");
    expect(defaultUnit("lump_sum")).toBe("lot");
  });

  it("prints sections and units in the WhatsApp text", () => {
    const text = quoteWhatsApp({
      number: "ZQ-2026-0001",
      company: "Villa",
      contact: "",
      validUntil: "2026-11-01",
      vatPct: 5,
      items: [
        { description: "Dome camera", qty: 8, unitPrice: 400, section: "CCTV", unit: "nos" },
        { description: "Cat6 cable", qty: 300, unitPrice: 3, section: "CCTV", unit: "m" },
        { description: "Alarm panel", qty: 1, unitPrice: 1200, section: "Alarm", unit: "set" },
      ],
      subtotal: 5300,
      vatAmount: 265,
      total: 5565,
      preparedBy: "",
      brand: "Zeronix",
    });
    expect(text.match(/\*CCTV\*/g)).toHaveLength(1);
    expect(text).toContain("*Alarm*");
    expect(text).toContain("300 m x AED 3");
  });
});
