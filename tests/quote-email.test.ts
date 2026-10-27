import { describe, expect, it } from "vitest";
import { DEFAULT_QUOTE_EMAIL_BODY, DEFAULT_QUOTE_EMAIL_SUBJECT, fillTemplate, quoteEmailValues, quotePdfName } from "@/lib/quote-email";

const values = quoteEmailValues({
  quote: {
    number: "ZQ-2026-0003",
    company: "ZAMAN ALHULOL TRADING L.L.C",
    contact: "Ahmed Khan",
    validUntil: "2026-10-28",
    total: 118912.5,
    items: [
      { description: "Lenovo ThinkPad X1 Carbon Gen 13", qty: 15, unitPrice: 7550 },
      { description: "Dock", qty: 2, unitPrice: 400 },
    ],
  },
  deal: "Laptops for head office",
  myName: "Ismail",
  ourCompany: "ZERONIX TECHNOLOGY LLC",
});

describe("quote email templates", () => {
  it("fills the default subject from the customer, quote and our company", () => {
    expect(fillTemplate(DEFAULT_QUOTE_EMAIL_SUBJECT, values)).toBe("Quotation ZQ-2026-0003 | ZAMAN ALHULOL TRADING L.L.C | ZERONIX TECHNOLOGY LLC");
  });

  it("fills the default message with contact, items, total and validity", () => {
    const body = fillTemplate(DEFAULT_QUOTE_EMAIL_BODY, values);
    expect(body).toContain("Dear Ahmed Khan,");
    expect(body).toContain("1. Lenovo ThinkPad X1 Carbon Gen 13 (Qty 15)\n2. Dock (Qty 2)");
    expect(body).toContain("Total: AED 118,912.50");
    expect(body).toContain("Valid until: 28 Oct 2026");
    expect(body).not.toMatch(/\{[a-z_]+\}/);
  });

  it("greets Sir/Madam when there is no contact, and leaves unknown placeholders visible", () => {
    const v = quoteEmailValues({ quote: { number: "ZQ-1", company: "X", contact: " ", validUntil: "2026-01-01", total: 1, items: [] }, deal: "", myName: "", ourCompany: "" });
    expect(fillTemplate("Dear {contact} / {first_name} {typo}", v)).toBe("Dear Sir/Madam / Sir/Madam {typo}");
  });

  it("makes a safe PDF file name", () => {
    expect(quotePdfName("ZQ-2026-0003", 'A/B: "Trading"\n LLC')).toBe("Quotation ZQ-2026-0003 - A B Trading LLC.pdf");
  });
});
