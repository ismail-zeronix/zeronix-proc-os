import { describe, expect, it } from "vitest";
import { totals } from "@/lib/quotation";
import { checkoutSchema, deliveryFee, markedUp, orderNumber, orderTotals, profileSchema, salesLinesForWebOrder } from "@/lib/website/store-core";

const checkout = {
  items: [{ slug: "lenovo-thinkpad-e14", qty: 2 }],
  name: "Aisha Khan",
  email: "aisha@example.com",
  phone: "+971 50 123 4567",
  company: "",
  trn: "",
  delivery: "delivery" as const,
  address: { emirate: "Dubai" as const, area: "Business Bay", street: "Bay Square 3, office 401" },
  payment: "bank" as const,
  notes: "",
};

describe("store", () => {
  it("adds the markup and rounds up to a price ending in 9", () => {
    expect(markedUp("4149.00", 8)).toBe("4489.00");
    expect(markedUp(655, 8)).toBe("709.00");
    expect(markedUp(4149, 0)).toBe("4149.00");
    expect(markedUp(3332.99, 0)).toBe("3339.00");
    expect(markedUp(1000, 10)).toBe("1109.00");
  });

  it("splits the VAT out of VAT-inclusive totals, in whole fils", () => {
    expect(orderTotals([{ qty: 2, unitPrice: "4489.00" }, { qty: 1, unitPrice: "709.00" }])).toEqual({ subtotal: "9225.71", vat: "461.29", total: "9687.00" });
    expect(orderTotals([{ qty: 1, unitPrice: "105.00" }])).toEqual({ subtotal: "100.00", vat: "5.00", total: "105.00" });
  });

  it("numbers web orders", () => {
    expect(orderNumber(12)).toBe("WEB-00012");
  });

  it("checks the checkout form", () => {
    expect(checkoutSchema.safeParse(checkout).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...checkout, items: [] }).error?.issues[0].message).toBe("Your cart is empty");
    expect(checkoutSchema.safeParse({ ...checkout, address: { emirate: "", area: "", street: "" } }).error?.issues[0].message).toBe("Please fill in the delivery address");
    expect(checkoutSchema.safeParse({ ...checkout, delivery: "pickup", address: { emirate: "", area: "", street: "" } }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...checkout, trn: "12345" }).error?.issues[0].message).toBe("A UAE TRN has 15 digits");
    expect(checkoutSchema.safeParse({ ...checkout, trn: "100 2345 6789 0003" }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...checkout, payment: "card" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...checkout, items: [{ slug: "x", qty: 101 }] }).success).toBe(false);
  });

  it("checks the profile", () => {
    expect(profileSchema.safeParse({ name: "", phone: "", company: "", trn: "", address: { emirate: "", area: "", street: "" } }).success).toBe(true);
    expect(profileSchema.safeParse({ name: "A", phone: "abc", company: "", trn: "", address: { emirate: "", area: "", street: "" } }).success).toBe(false);
  });
});

describe("delivery charge", () => {
  const rules = { fee: 35, freeAbove: 5000, emirateFees: { Fujairah: 50 } };

  it("charges the flat fee below the free-delivery amount", () => {
    expect(deliveryFee(rules, "1418.00", "delivery", "Dubai")).toBe("35.00");
  });
  it("uses the emirate's own fee when there is one", () => {
    expect(deliveryFee(rules, 1418, "delivery", "Fujairah")).toBe("50.00");
  });
  it("is free at or above the free-delivery amount, emirate fee or not", () => {
    expect(deliveryFee(rules, 5000, "delivery", "Dubai")).toBe("0.00");
    expect(deliveryFee(rules, 6589, "delivery", "Fujairah")).toBe("0.00");
  });
  it("is always free when collecting from the office", () => {
    expect(deliveryFee(rules, 10, "pickup", "Dubai")).toBe("0.00");
  });
  it("is free with no rules saved yet (old settings rows), and a flat fee needs no free amount", () => {
    expect(deliveryFee(undefined, 10, "delivery", "Dubai")).toBe("0.00");
    expect(deliveryFee({ fee: 25, freeAbove: 0, emirateFees: {} }, 99999, "delivery")).toBe("25.00");
  });
  it("adds the charge into the order total, VAT included", () => {
    const t = orderTotals([
      { qty: 2, unitPrice: "709.00" },
      { qty: 1, unitPrice: "35.00" },
    ]);
    expect(t.total).toBe("1453.00");
    expect((Number(t.subtotal) + Number(t.vat)).toFixed(2)).toBe("1453.00");
    expect(t.vat).toBe("69.19");
  });
});

describe("web order into Sales lines", () => {
  const totalOf = (lines: { qty: number; unitPrice: number }[]) => totals(lines, 5).total;
  const line = (name: string, qty: number, unitPrice: string, mpn = "") => ({ name, mpn, qty, unitPrice });

  it("takes the VAT out of each price and adds delivery as its own line", () => {
    const r = salesLinesForWebOrder([line("ThinkPad", 1, "4489.00", "21U2009MIG")], "35.00", "4524.00", totalOf);
    expect(r.lines.map((l) => l.description)).toEqual(["ThinkPad (part no. 21U2009MIG)", "Delivery"]);
    expect(r.lines[0].unitPriceAed).toBeCloseTo(4275.24, 2);
    expect(r.total).toBe(4524);
    expect(r.diff).toBe(0);
  });

  it("lands on the web total, or 1 fils from it when VAT on the subtotal cannot hit it", () => {
    const prices = ["709.00", "3799.01", "4240.01", "6589.00", "11989.00", "99.99", "1.05", "2349.00"];
    for (const a of prices)
      for (const b of prices)
        for (const qty of [1, 2, 3, 7]) {
          const items = [line("A", qty, a), line("B", 1, b)];
          const web = orderTotals(items.map((i) => ({ qty: i.qty, unitPrice: i.unitPrice })));
          const r = salesLinesForWebOrder(items, "0", web.total, totalOf);
          expect(Math.abs(r.diff), `${qty} × ${a} + ${b}`).toBeLessThanOrEqual(0.01);
        }
  });

  it("reports what is left over when no line can take the rounding", () => {
    const items = [line("A", 3, "3799.01")];
    const web = orderTotals([{ qty: 3, unitPrice: "3799.01" }]);
    const r = salesLinesForWebOrder(items, "0", web.total, totalOf);
    expect(Math.abs(r.diff)).toBeLessThanOrEqual(0.05);
    expect(r.total + r.diff).toBeCloseTo(Number(web.total), 2);
  });
});
