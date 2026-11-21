import { describe, expect, it } from "vitest";
import { loginCodeEmail, orderPlacedEmail, orderStatusEmail, renderStoreEmail, staffOrderEmail, type MailOrder } from "@/lib/website/store-email-core";

const SITE = "https://zeronixtech.com";
const order: MailOrder = {
  number: "WEB-00042",
  name: "Aisha Khan",
  email: "aisha@example.com",
  phone: "+971 50 123 4567",
  company: "Bay Realty",
  delivery: "delivery",
  address: { emirate: "Dubai", area: "Business Bay", street: "Bay Square 3, office 401" },
  payment: "bank",
  notes: "",
  items: [{ name: "Lenovo ThinkPad E14 <Gen 7>", mpn: "21U2009MIG", qty: 2, unitPrice: "4489.00" }],
  deliveryFee: "35.00",
  subtotal: "8584.76",
  vat: "429.24",
  total: "9014.00",
};
const store = { bankDetails: "Zeronix Technology LLC\nIBAN AE00 0000", deliveryNote: "Delivery across the UAE in 2–4 working days." };

describe("store emails", () => {
  it("renders the branded layout with an HTML and a plain-text part", () => {
    const { html, text } = renderStoreEmail({ preheader: "Hi", title: "Hello & welcome", paragraphs: ["Line one"], button: { label: "Open", href: `${SITE}/account` } }, SITE);
    expect(html).toContain("#0f9d58"); // green header bar
    expect(html).toContain(`${SITE}/icon-email.png`); // the logo as a PNG (mail apps do not show SVG)
    expect(html).toContain("Hello &amp; welcome"); // escaped
    expect(html).toContain(`href="${SITE}/account"`);
    expect(text).toContain("Open: https://zeronixtech.com/account");
    expect(text).toContain("zeronixtech.com");
  });

  it("escapes anything that came from a customer", () => {
    const { html } = orderPlacedEmail({ ...order, name: `<script>alert(1)</script>` }, store, SITE);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;Gen 7&gt;");
  });

  it("sends the sign-in code in the subject, the box and the text", () => {
    const m = loginCodeEmail("123456", SITE);
    expect(m.subject).toBe("123456 is your Zeronix Tech sign-in code");
    expect(m.html).toContain("123456");
    expect(m.text).toContain("123456");
  });

  it("confirms an order with lines, totals and the bank details", () => {
    const m = orderPlacedEmail(order, store, SITE);
    expect(m.subject).toBe("Your Zeronix Tech order WEB-00042");
    expect(m.text).toContain("Lenovo ThinkPad E14 <Gen 7> (2 × AED 4,489.00 · 21U2009MIG): AED 8,978.00");
    expect(m.text).toContain("Delivery: AED 35.00");
    expect(m.text).toContain("Total: AED 9,014.00");
    expect(m.text).toContain("with WEB-00042 as the reference");
    expect(m.text).toContain("IBAN AE00 0000");
  });

  it("says payment received for a card order and leaves out the bank details", () => {
    const m = orderPlacedEmail({ ...order, payment: "card" }, store, SITE);
    expect(m.subject).toBe("Payment received: Zeronix Tech order WEB-00042");
    expect(m.text).not.toContain("IBAN");
  });

  it("gives the team the customer's contact details", () => {
    const m = staffOrderEmail(order, SITE);
    expect(m.subject).toBe("New web order WEB-00042: AED 9,014.00");
    expect(m.text).toContain("aisha@example.com");
    expect(m.text).toContain("Website › Orders");
  });

  it("writes a status update for each step", () => {
    expect(orderStatusEmail(order, "confirmed", store, SITE).text).toContain("IBAN"); // still owes a bank transfer
    expect(orderStatusEmail(order, "shipped", store, SITE).subject).toBe("Order WEB-00042 is on its way");
    expect(orderStatusEmail({ ...order, delivery: "pickup" }, "shipped", store, SITE).subject).toBe("Order WEB-00042 is ready to collect");
    const tracked = orderStatusEmail({ ...order, tracking: { courier: "Aramex", number: "123", url: "https://track.example/123" } }, "shipped", store, SITE);
    expect(tracked.text).toContain("Tracking: Aramex · 123");
    expect(tracked.html).toContain("https://track.example/123");
    expect(orderStatusEmail(order, "delivered", store, SITE).subject).toBe("Order WEB-00042 has been delivered");
    const cancelled = orderStatusEmail(order, "cancelled", store, SITE);
    expect(cancelled.subject).toBe("Order WEB-00042 has been cancelled");
    expect(cancelled.text).not.toContain("Total:");
    expect(orderStatusEmail(order, "paid", store, SITE).subject).toBe("Payment received for order WEB-00042");
  });
});
