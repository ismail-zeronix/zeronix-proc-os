/** The email that carries a quote: subject and message templates with {placeholders}. Pure, so it is easy to test. */
import { longDay, money, type QuoteDoc } from "@/lib/quotation";

export const DEFAULT_QUOTE_EMAIL_SUBJECT = "Quotation {quote_number} | {customer} | {our_company}";

export const DEFAULT_QUOTE_EMAIL_BODY = `Dear {contact},

Greetings from {our_company}.

Thank you for your enquiry. Please find attached our quotation {quote_number} for your review.

{items}

Total: {total} (including VAT)
Valid until: {valid_until}

Please feel free to contact us if you have any questions or would like to go ahead with the order.

Best regards,`;

/** Placeholders an admin can use, with what each one becomes. */
export const QUOTE_EMAIL_FIELDS: { key: string; meaning: string }[] = [
  { key: "customer", meaning: "customer company" },
  { key: "contact", meaning: "contact name (or Sir/Madam)" },
  { key: "first_name", meaning: "contact first name" },
  { key: "quote_number", meaning: "ZQ-2026-0001" },
  { key: "deal", meaning: "deal title" },
  { key: "items", meaning: "numbered list of items and quantities" },
  { key: "total", meaning: "total with VAT" },
  { key: "valid_until", meaning: "validity date" },
  { key: "my_name", meaning: "the person sending" },
  { key: "our_company", meaning: "our company name" },
];

export interface QuoteEmailVars {
  quote: Pick<QuoteDoc, "number" | "company" | "contact" | "validUntil" | "total" | "items">;
  deal: string;
  myName: string;
  ourCompany: string;
}

export function quoteEmailValues(v: QuoteEmailVars): Record<string, string> {
  const contact = v.quote.contact.trim();
  return {
    customer: v.quote.company,
    contact: contact || "Sir/Madam",
    first_name: contact.split(/\s+/)[0] || "Sir/Madam",
    quote_number: v.quote.number,
    deal: v.deal,
    items: v.quote.items.map((i, n) => `${n + 1}. ${i.description} (Qty ${i.qty}${i.unit ? ` ${i.unit}` : ""})`).join("\n"),
    total: money(v.quote.total),
    valid_until: longDay(v.quote.validUntil),
    my_name: v.myName,
    our_company: v.ourCompany,
  };
}

/** Replaces {name} with its value. Unknown placeholders are left as typed, so a typo is visible before sending. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

/** A safe file name for the attached PDF: "Quotation ZQ-2026-0001 - Customer.pdf" (or "Proposal ..." for a project). */
export function quotePdfName(number: string, company: string, kind: "Quotation" | "Proposal" = "Quotation"): string {
  const clean = company.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${kind} ${number}${clean ? ` - ${clean}` : ""}.pdf`;
}
