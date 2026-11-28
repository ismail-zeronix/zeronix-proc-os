import { describe, expect, it } from "vitest";
import { avgCost, cleanSerials, putIn, serialNorm, settleOrder, shareOf, takeOut, type StockState } from "@/lib/inventory/costing";
import { journalProblem } from "@/lib/ledger/journal";
import { stockAdjustLines, stockBackLines, stockOutLines, stockReceiptLines } from "@/lib/ledger/rules";

describe("weighted average cost", () => {
  it("takes units out at the average, and the last units take exactly what is left", () => {
    let s: StockState = { qty: 0, value: 0 };
    s = putIn(s, 3, 1000).next; // 333.33...
    const a = takeOut(s, 1);
    expect(a).toMatchObject({ costed: 1, uncosted: 0, value: 333.33 });
    const b = takeOut(a.next, 2);
    expect(b.value).toBe(666.67);
    expect(b.next).toEqual({ qty: 0, value: 0 });
  });

  it("sells beyond stock as uncosted units, and the next units in give them their cost", () => {
    let s: StockState = { qty: 1, value: 100 };
    const out = takeOut(s, 3);
    expect(out).toMatchObject({ costed: 1, uncosted: 2, value: 100 });
    s = out.next;
    expect(s).toEqual({ qty: -2, value: 0 });
    const inn = putIn(s, 5, 600);
    expect(inn).toMatchObject({ settled: 2, settledValue: 240 });
    expect(inn.next).toEqual({ qty: 3, value: 360 });
    expect(avgCost(inn.next)).toBe(120);
    // nothing in stock: the last known average is kept
    expect(avgCost({ qty: 0, value: 0 }, 120)).toBe(120);
  });

  it("splits uncosted units over sales oldest first", () => {
    expect(settleOrder(3, [{ id: 1, uncosted: 2 }, { id: 2, uncosted: 2 }])).toEqual([{ id: 1, qty: 2 }, { id: 2, qty: 1 }]);
    expect(settleOrder(1, [])).toEqual([]);
    expect(shareOf(100, 1, 3)).toBe(33.33);
    expect(shareOf(100, 3, 3)).toBe(100);
  });

  it("keeps its promises over any mix of moves (value never negative, zero units zero value, short = uncosted)", () => {
    // a small deterministic random walk, so a failure can be replayed
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let run = 0; run < 200; run++) {
      let s: StockState = { qty: 0, value: 0 };
      let uncosted = 0;
      for (let step = 0; step < 30; step++) {
        const qty = 1 + Math.floor(rnd() * 5);
        if (rnd() < 0.5) {
          const value = Math.round(rnd() * 100000) / 100;
          const r = putIn(s, qty, value);
          uncosted = Math.round((uncosted - r.settled) * 100) / 100;
          s = r.next;
        } else {
          const r = takeOut(s, qty);
          expect(r.value).toBeGreaterThanOrEqual(0);
          uncosted = Math.round((uncosted + r.uncosted) * 100) / 100;
          s = r.next;
        }
        expect(s.value).toBeGreaterThanOrEqual(0);
        if (s.qty <= 0) expect(s.value).toBe(0);
        expect(uncosted).toBe(Math.max(0, -s.qty));
      }
    }
  });
});

describe("serial numbers", () => {
  it("are matched in upper case without spaces, and a line cannot list one twice", () => {
    expect(serialNorm(" pf3a 9x1 ")).toBe("PF3A9X1");
    expect(cleanSerials(["A1", " ", "b2"]).serials).toEqual(["A1", "b2"]);
    expect(cleanSerials(["a1", "A 1"]).problem).toMatch(/twice/);
  });
});

describe("stock journal lines", () => {
  it("all balance, and post nothing for nothing", () => {
    const r = stockReceiptLines({ parts: [{ amount: 300, fromAccount: "inventory" }, { amount: 200, fromAccount: "inventory" }, { amount: 50, fromAccount: "exp_office" }], description: "x" })!;
    expect(journalProblem(r)).toBeNull();
    expect(r.map((l) => [l.account, l.debit ?? -(l.credit ?? 0)])).toEqual([
      ["inventory_items", 550],
      ["inventory", -500],
      ["exp_office", -50],
    ]);
    expect(r.every((l) => !l.taxCode)).toBe(true);
    expect(journalProblem(stockOutLines({ amount: 120.5, description: "x" })!)).toBeNull();
    expect(stockOutLines({ amount: 0, description: "x" })).toBeNull();
    expect(journalProblem(stockBackLines({ amount: 10, description: "x" })!)).toBeNull();
    const adj = stockAdjustLines({ valueIn: 100, valueOut: 40, offset: "stock_adjustments", description: "x" })!;
    expect(journalProblem(adj)).toBeNull();
    expect(stockAdjustLines({ valueIn: 0, valueOut: 0, offset: "stock_adjustments", description: "x" })).toBeNull();
  });
});
