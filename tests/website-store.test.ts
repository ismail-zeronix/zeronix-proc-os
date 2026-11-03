import { describe, expect, it } from "vitest";
import { checkoutSchema, markedUp, orderNumber, orderTotals, profileSchema } from "@/lib/website/store-core";

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
