import "server-only";
import type { SalesDocData } from "@/components/sales-document";
import { documentDetails, getInvoice } from "@/lib/accounts-data";
import { termsLabel } from "@/lib/invoicing";
import { getOrder } from "@/lib/orders-data";
import { longDay } from "@/lib/quotation";

type Order = NonNullable<Awaited<ReturnType<typeof getOrder>>>;
type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

const items = (rows: { id: number; description: string; qty: number; unitPrice: number }[]) => rows.map((i) => ({ id: i.id, description: i.description, qty: i.qty, unitPrice: i.unitPrice }));

function customerLines(o: Order): string[] {
  return [
    o.company.emirate ? `${o.company.emirate}, United Arab Emirates` : "",
    o.contact ? `Attn: ${o.contact.name}${o.contact.jobTitle ? `, ${o.contact.jobTitle}` : ""}` : "",
    o.contact?.phone || o.company.phone || "",
  ];
}

/** Proforma invoice: for customers who pay before delivery. Not a tax invoice, says so, carries the bank details. */
export async function proformaDoc(o: Order): Promise<SalesDocData> {
  const det = await documentDetails();
  return {
    title: "PROFORMA INVOICE",
    number: o.number,
    meta: [
      ["Date", longDay(o.createdAt.toISOString().slice(0, 10))],
      ...(o.customerRef ? ([["Your PO", o.customerRef]] as [string, string][]) : []),
      ["Terms", termsLabel(o.termsDays)],
    ],
    to: { name: o.company.name, lines: customerLines(o), trn: o.company.trn },
    shipTo: o.deliveryAddress ? { label: "Deliver to", lines: [o.deliveryAddress] } : undefined,
    items: items(o.items),
    showPrices: true,
    vatPct: o.vatPct,
    subtotal: o.subtotal,
    vatAmount: o.vatAmount,
    total: o.total,
    amountInWords: true,
    notes: ["This is a proforma invoice, not a tax invoice. The tax invoice follows on delivery.", ...(o.notes ? [o.notes] : [])],
    bank: det.bank,
    stamp: o.status === "cancelled" ? "CANCELLED" : undefined,
    preparedBy: o.author?.name,
  };
}

/** Delivery note: quantities only, signature boxes for both sides. */
export function deliveryDoc(o: Order): SalesDocData {
  return {
    title: "DELIVERY NOTE",
    number: o.dnNumber ?? "(not delivered yet)",
    meta: [
      ["Date", o.deliveredOn ? longDay(o.deliveredOn) : "-"],
      ["Order", o.number],
      ...(o.customerRef ? ([["Your PO", o.customerRef]] as [string, string][]) : []),
    ],
    to: { name: o.company.name, lines: customerLines(o) },
    shipTo: o.deliveryAddress ? { label: "Delivered to", lines: [o.deliveryAddress] } : undefined,
    items: items(o.items),
    showPrices: false,
    vatPct: o.vatPct,
    subtotal: o.subtotal,
    vatAmount: o.vatAmount,
    total: o.total,
    notes: ["Please check the goods on delivery. Report anything missing or damaged within 2 working days.", ...(o.receivedBy ? [`Received by: ${o.receivedBy}`] : [])],
    signatures: ["Delivered by (Zeronix)", "Received in good condition by (customer)"],
    stamp: o.status === "cancelled" ? "CANCELLED" : undefined,
    preparedBy: o.author?.name,
  };
}

/** The tax invoice, with everything the UAE asks for: both TRNs, date of supply, VAT per line, totals in AED. */
export async function invoiceDoc(inv: Invoice): Promise<SalesDocData> {
  const det = await documentDetails();
  return {
    title: "TAX INVOICE",
    number: inv.number,
    meta: [
      ["Invoice date", longDay(inv.issueDate)],
      ["Date of supply", longDay(inv.supplyDate)],
      ["Due date", longDay(inv.dueDate)],
      ["Terms", termsLabel(inv.termsDays)],
      ...(inv.customerRef ? ([["Your PO", inv.customerRef]] as [string, string][]) : []),
      ...(inv.order?.dnNumber ? ([["Delivery note", inv.order.dnNumber]] as [string, string][]) : []),
    ],
    to: { name: inv.customerName, lines: [inv.customerAddress, inv.companyPhone], trn: inv.customerTrn },
    items: items(inv.items),
    showPrices: true,
    vatPerLine: true,
    vatPct: inv.vatPct,
    subtotal: inv.subtotal,
    vatAmount: inv.vatAmount,
    total: inv.total,
    amountInWords: true,
    notes: [`Please pay by ${longDay(inv.dueDate)} and quote ${inv.number} with your payment.`],
    bank: det.bank,
    stamp: inv.status === "cancelled" ? "CANCELLED" : undefined,
    preparedBy: inv.author?.name,
  };
}

/** The credit note that cancelled an invoice: same lines and amounts, refers to the invoice. */
export function creditDoc(inv: Invoice): SalesDocData | null {
  if (!inv.credit) return null;
  return {
    title: "TAX CREDIT NOTE",
    number: inv.credit.number,
    meta: [
      ["Date", longDay(inv.credit.issueDate)],
      ["Invoice", inv.number],
      ["Invoice date", longDay(inv.issueDate)],
    ],
    to: { name: inv.customerName, lines: [inv.customerAddress], trn: inv.customerTrn },
    items: items(inv.items),
    showPrices: true,
    vatPerLine: true,
    vatPct: inv.vatPct,
    subtotal: inv.credit.subtotal,
    vatAmount: inv.credit.vatAmount,
    total: inv.credit.total,
    amountInWords: true,
    notes: [`Reason: ${inv.credit.reason}`, `This credit note cancels invoice ${inv.number} in full.`],
  };
}
