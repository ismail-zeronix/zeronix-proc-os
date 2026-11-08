import "server-only";
import type { SalesDocData } from "@/components/sales-document";
import { documentDetails, getInvoice } from "@/lib/accounts-data";
import { termsLabel } from "@/lib/invoicing";
import { getOrder } from "@/lib/orders-data";
import { getBill } from "@/lib/purchases-data";
import { longDay, money, round2 } from "@/lib/quotation";
import { bankFor } from "@/lib/seller";

type Order = NonNullable<Awaited<ReturnType<typeof getOrder>>>;
type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

const items = (rows: { id: number; description: string; qty: number; unitPrice: number; taxCode?: string }[]) => rows.map((i) => ({ id: i.id, description: i.description, qty: i.qty, unitPrice: i.unitPrice, taxCode: i.taxCode }));

function customerLines(o: Order): string[] {
  return [
    o.company.address || (o.company.emirate ? `${o.company.emirate}, United Arab Emirates` : ""),
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
    signatures: ["Delivered by", "Received in good condition by (customer)"],
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
    bank: bankFor(det.bank, inv.sellerSnapshot),
    stamp: inv.status === "cancelled" ? "CANCELLED" : undefined,
    preparedBy: inv.author?.name,
  };
}

/**
 * A tax credit note: refers to the invoice it adjusts, says why, and shows what the invoice is worth afterwards.
 * `creditId` picks one when an invoice has several; left out, the latest.
 */
export function creditDoc(inv: Invoice, creditId?: number): SalesDocData | null {
  const c = inv.credits.find((x) => x.id === creditId) ?? inv.credits.at(-1);
  if (!c) return null;
  const upToThis = inv.credits.filter((x) => x.id <= c.id);
  const after = round2(inv.total - upToThis.reduce((s, x) => s + x.total, 0));
  return {
    title: "TAX CREDIT NOTE",
    number: c.number,
    meta: [
      ["Date", longDay(c.issueDate)],
      ["Invoice", inv.number],
      ["Invoice date", longDay(inv.issueDate)],
      ["Invoice value", money(inv.total)],
      ["Value after this note", money(after)],
    ],
    to: { name: inv.customerName, lines: [inv.customerAddress], trn: inv.customerTrn },
    items: items(c.items),
    showPrices: true,
    vatPerLine: true,
    vatPct: inv.vatPct,
    subtotal: c.subtotal,
    vatAmount: c.vatAmount,
    total: c.total,
    amountInWords: true,
    notes: [`Reason: ${c.reason}`, ...(c.eventDate ? [`Goods returned or price agreed on ${longDay(c.eventDate)}.`] : []), after <= 0 ? `This credit note cancels invoice ${inv.number} in full.` : `This credit note adjusts invoice ${inv.number}.`],
  };
}

/** A debit note to a supplier: what we take back off their bill, and why. */
export function debitDoc(b: NonNullable<Awaited<ReturnType<typeof getBill>>>, debitId: number): SalesDocData | null {
  const d = b.debitNotes.find((x) => x.id === debitId);
  if (!d) return null;
  const after = round2(b.total - b.debitNotes.filter((x) => x.id <= d.id).reduce((s, x) => s + x.total, 0));
  return {
    title: "DEBIT NOTE",
    partyLabel: "Supplier",
    number: d.number,
    meta: [
      ["Date", longDay(d.issueDate)],
      ["Your invoice", b.supplierRef || b.number],
      ["Invoice date", longDay(b.billDate)],
      ...(d.supplierRef ? ([["Your credit note", d.supplierRef]] as [string, string][]) : []),
      ["Value after this note", money(after)],
    ],
    to: { name: b.payee, lines: [b.supplier?.address ?? ""], trn: b.supplier?.trn ?? "" },
    items: d.items.map((i) => ({ id: i.id, description: i.description, qty: i.qty, unitPrice: i.unitCost, taxCode: i.taxCode })),
    showPrices: true,
    vatPerLine: true,
    vatPct: b.vatPct,
    subtotal: d.subtotal,
    vatAmount: d.vatAmount,
    total: d.total,
    amountInWords: true,
    notes: [`Reason: ${d.reason}`],
  };
}
