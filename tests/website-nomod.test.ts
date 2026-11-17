import { describe, expect, it } from "vitest";
import { nomodCheckoutBody, nomodPhone, returnUrl } from "@/lib/website/nomod-core";
import { checkoutSchema, orderTotals } from "@/lib/website/store-core";

const order = {
  number: "WEB-00012",
  name: "Aisha Khan Al Mansoori",
  email: "aisha@example.com",
  phone: "050 123 4567",
  company: "Gulf Realty LLC",
  items: [
    { slug: "lenovo-thinkpad-e14", mpn: "21JK0045GR", name: "Lenovo ThinkPad E14", qty: 2, unitPrice: "3499.00" },
    { slug: "dell-p2425h", mpn: "", name: "Dell P2425H", qty: 1, unitPrice: "649.50" },
  ],
  deliveryFee: "25.00",
  total: "7672.50",
};
const urls = { success: "https://zeronixtech.com/ok", failure: "https://zeronixtech.com/fail", cancelled: "https://zeronixtech.com/cancel" };

describe("Nomod checkout body", () => {
  it("sends the order total in AED with items that add up to it, delivery as its own item", () => {
    const b = nomodCheckoutBody(order, urls, "zeronixtech.com");
    expect(b).toMatchObject({ reference_id: "WEB-00012", amount: "7672.50", currency: "AED", success_url: urls.success, failure_url: urls.failure, cancelled_url: urls.cancelled });
    expect(b.items.map((i) => [i.item_id, i.quantity, i.unit_amount, i.total_amount])).toEqual([
      ["21JK0045GR", 2, "3499.00", "6998.00"],
      ["dell-p2425h", 1, "649.50", "649.50"],
      ["delivery", 1, "25.00", "25.00"],
    ]);
    expect(b.items.reduce((s, i) => s + Number(i.total_amount), 0).toFixed(2)).toBe(b.amount);
    expect(b.metadata).toEqual({ order: "WEB-00012", site: "zeronixtech.com" });
  });

  it("matches the shop's own total, so Nomod charges exactly what the order says", () => {
    const t = orderTotals([...order.items, { qty: 1, unitPrice: order.deliveryFee }]);
    expect(t.total).toBe(order.total);
  });

  it("leaves out a free delivery and splits the customer's name", () => {
    const b = nomodCheckoutBody({ ...order, deliveryFee: "0.00", company: "" }, urls);
    expect(b.items.some((i) => i.item_id === "delivery")).toBe(false);
    expect(b.customer).toEqual({ first_name: "Aisha", last_name: "Khan Al Mansoori", email: "aisha@example.com", phone_number: "+971501234567" });
    expect(b.metadata).toEqual({ order: "WEB-00012" });
  });

  it("writes UAE phone numbers as +971 and drops ones it cannot read", () => {
    expect(nomodPhone("+971 50 123 4567")).toBe("+971501234567");
    expect(nomodPhone("00971501234567")).toBe("+971501234567");
    expect(nomodPhone("0501234567")).toBe("+971501234567");
    expect(nomodPhone("501234567")).toBe("+971501234567");
    expect(nomodPhone("04 123 4567")).toBe("+97141234567");
    expect(nomodPhone("call me")).toBeUndefined();
  });

  it("brings the customer back to the order page with the number, token and result", () => {
    const u = new URL(returnUrl("https://zeronixtech.com", "WEB-00012", "abc_123", "cancelled"));
    expect(u.pathname).toBe("/checkout/done");
    expect(Object.fromEntries(u.searchParams)).toEqual({ n: "WEB-00012", t: "abc_123", pay: "card", r: "cancelled" });
  });

  it("accepts card as a way to pay at checkout", () => {
    const base = { items: [{ slug: "x", qty: 1 }], name: "Aisha", email: "a@example.com", phone: "+971501234567", company: "", trn: "", delivery: "pickup" as const, address: { emirate: "" as const, area: "", street: "" }, notes: "" };
    expect(checkoutSchema.safeParse({ ...base, payment: "card" }).success).toBe(true);
  });
});
