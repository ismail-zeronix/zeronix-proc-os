/**
 * Posting rules: what each document puts in the ledger. Pure functions (no database), so every rule is easy to test;
 * lib/ledger/documents.ts reads the documents and posts what these return.
 *
 * Tax codes and taxable amounts sit on the line that carries the supply (the sale or the cost), and again on the VAT
 * line with its tax, so the VAT return can add up both from the ledger.
 */
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { categorySystemKey } from "./coa-templates";
import type { PostLine } from "./post";

/** What a document-level rate means on a sale that has no line codes (an order's lines): 5% is standard-rated, 0% zero-rated. */
export const taxCodeForRate = (vatPct: number) => (vatPct > 0 ? "SR" : "ZR");
/** A purchase with no VAT on it is simply outside the return: "zero-rated" is a claim about sales. */
export const purchaseTaxCode = (vatPct: number) => (vatPct > 0 ? "SR" : "OS");

/** One sales account and VAT code of a document: lines of the same kind and code post together. */
export interface SalePart {
  lineKind: "product" | "service";
  code: string;
  net: number;
}

export interface InvoiceFacts {
  companyId: number;
  orderId: number | null;
  dealId: number | null;
  parts: SalePart[];
  vatAmount: number;
  total: number;
  number: string;
}

const salesAccount = (k: SalePart["lineKind"]) => (k === "service" ? "sales_services" : "sales_products");

/** Lines of one kind and code added up, in a fixed order (products first). A credit note groups the same way as its invoice. */
export function groupSaleParts(lines: readonly SalePart[]): SalePart[] {
  const groups = new Map<string, SalePart>();
  for (const l of [...lines].sort((a, b) => a.lineKind.localeCompare(b.lineKind))) {
    const key = `${l.lineKind}:${l.code}`;
    const g = groups.get(key);
    groups.set(key, { lineKind: l.lineKind, code: l.code, net: fromMinor(toMinor(g?.net ?? 0) + toMinor(l.net)) });
  }
  return [...groups.values()].filter((g) => g.net > 0);
}

/** Customer owes the total; we earn the net (products and services apart, each VAT code apart) and owe the VAT to the FTA. */
export function invoiceLines(i: InvoiceFacts): PostLine[] {
  const dims = { orderId: i.orderId, dealId: i.dealId };
  const lines: PostLine[] = [
    { account: "ar", debit: i.total, partyType: "customer", partyId: i.companyId, description: i.number, ...dims },
    ...i.parts.map((p) => ({ account: salesAccount(p.lineKind), credit: p.net, taxCode: p.code, taxBase: p.net, description: i.number, ...dims })),
  ];
  if (i.vatAmount > 0) lines.push({ account: "vat_output", credit: i.vatAmount, taxCode: "SR", description: i.number, ...dims });
  return lines;
}

/** A credit note gives back its own lines, on its own date, so the VAT falls in the period the credit note was issued. */
export function creditNoteLines(i: InvoiceFacts & { creditNumber: string }): PostLine[] {
  const dims = { orderId: i.orderId, dealId: i.dealId };
  const note = `${i.creditNumber} for ${i.number}`;
  const lines: PostLine[] = i.parts.map((p) => ({ account: salesAccount(p.lineKind), debit: p.net, taxCode: p.code, taxBase: -p.net, description: note, ...dims }));
  if (i.vatAmount > 0) lines.push({ account: "vat_output", debit: i.vatAmount, taxCode: "SR", description: note, ...dims });
  lines.push({ account: "ar", credit: i.total, partyType: "customer", partyId: i.companyId, description: note, ...dims });
  return lines;
}

/** Goods coming back on a credit note: their cost leaves cost of goods sold and is stock again. */
export function goodsBackLines(p: { amount: number; number: string; orderId: number | null; dealId: number | null }): PostLine[] {
  const dims = { orderId: p.orderId, dealId: p.dealId };
  const description = `${p.number} goods back`;
  return [
    { account: "inventory", debit: p.amount, description, ...dims },
    { account: "cogs", credit: p.amount, description, ...dims },
  ];
}

/** An advance handed back to a customer: we no longer hold it, and the money leaves the bank or cash. */
export function customerRefundLines(p: { amount: number; companyId: number; bankLedgerAccountId: number; number: string; paymentNumber: string }): PostLine[] {
  const description = `${p.number} refund of ${p.paymentNumber}`;
  return [
    { account: "customer_advances", debit: p.amount, partyType: "customer", partyId: p.companyId, description },
    { account: p.bankLedgerAccountId, credit: p.amount, description },
  ];
}

/** A supplier hands an advance back: they no longer hold it, and the money comes into the bank or cash. */
export function supplierRefundLines(p: { amount: number; supplierId: number | null; bankLedgerAccountId: number; number: string; paymentNumber: string }): PostLine[] {
  const description = `${p.number} refund of ${p.paymentNumber}`;
  return [
    { account: p.bankLedgerAccountId, debit: p.amount, description },
    { account: "supplier_advances", credit: p.amount, partyType: "supplier", partyId: p.supplierId, description },
  ];
}

/** What is left of a receipt or voucher after what it paid: an advance. */
function advancePart(amount: number, allocations: readonly { amount: number }[]): number {
  return fromMinor(toMinor(amount) - sumMinor(allocations.map((a) => toMinor(a.amount))));
}

export interface InvoicePart {
  amount: number;
  invoiceNumber: string;
  orderId?: number | null;
  dealId?: number | null;
}

/**
 * Money received: into the bank or cash account, off what the customer owes per invoice. The rest is an advance: money we
 * hold for them, a liability until it is applied to an invoice.
 */
export function receiptLines(p: { bankLedgerAccountId: number; amount: number; companyId: number; number: string; allocations: readonly InvoicePart[] }): PostLine[] {
  const party = { partyType: "customer" as const, partyId: p.companyId };
  const rest = advancePart(p.amount, p.allocations);
  const lines: PostLine[] = [
    { account: p.bankLedgerAccountId, debit: p.amount, description: p.number },
    ...p.allocations.map((a) => ({ account: "ar", credit: a.amount, description: `${p.number} for ${a.invoiceNumber}`, orderId: a.orderId, dealId: a.dealId, ...party })),
  ];
  if (rest > 0) lines.push({ account: "customer_advances", credit: rest, description: `${p.number} advance`, ...party });
  return lines;
}

/** An advance set against an invoice: we no longer hold it, and the customer owes that much less. */
export function advanceAppliedLines(p: { amount: number; companyId: number; paymentNumber: string } & Omit<InvoicePart, "amount">): PostLine[] {
  const party = { partyType: "customer" as const, partyId: p.companyId };
  const description = `${p.paymentNumber} applied to ${p.invoiceNumber}`;
  return [
    { account: "customer_advances", debit: p.amount, description, ...party },
    { account: "ar", credit: p.amount, description, orderId: p.orderId, dealId: p.dealId, ...party },
  ];
}

/** A receipt's money taken off an invoice: the customer owes it again, and we hold it as an advance. */
export function advanceReturnedLines(p: { amount: number; companyId: number; paymentNumber: string } & Omit<InvoicePart, "amount">): PostLine[] {
  const party = { partyType: "customer" as const, partyId: p.companyId };
  const description = `${p.paymentNumber} taken off ${p.invoiceNumber}`;
  return [
    { account: "ar", debit: p.amount, description, orderId: p.orderId, dealId: p.dealId, ...party },
    { account: "customer_advances", credit: p.amount, description, ...party },
  ];
}

export interface BillFacts {
  number: string;
  supplierId: number | null;
  category: string;
  orderId: number | null;
  dealId: number | null;
  /** Net per VAT code, with VAT we account for ourselves on reverse charge and imports. */
  parts: { code: string; net: number; selfAssessed: number }[];
  vatAmount: number;
  total: number;
}

/**
 * Where a bill's cost goes. Goods are stock until sold: Inventory, moved to cost of goods sold when their order is
 * invoiced (documents.ts does that, also for a bill that arrives after the invoice). Services bought in go straight to
 * cost of sales, and everything else to the expense account of its category.
 */
export function billCostAccount(b: Pick<BillFacts, "category">): string {
  return b.category === "cogs" ? "inventory" : categorySystemKey(b.category);
}

/** The cost per VAT code, the VAT we reclaim, and reverse-charge VAT: owed and reclaimed by us alone, the supplier sees none of it. */
function costAndVatLines(b: BillFacts): PostLine[] {
  const dims = { orderId: b.orderId, dealId: b.dealId };
  const lines: PostLine[] = b.parts.map((p) => ({ account: billCostAccount(b), debit: p.net, taxCode: p.code, taxBase: p.net, description: b.number, ...dims }));
  if (b.vatAmount > 0) lines.push({ account: "vat_input", debit: b.vatAmount, taxCode: "SR", description: b.number, ...dims });
  for (const p of b.parts) {
    if (p.selfAssessed <= 0) continue;
    lines.push({ account: "vat_input_rc", debit: p.selfAssessed, taxCode: p.code, description: b.number, ...dims });
    lines.push({ account: "vat_output_rc", credit: p.selfAssessed, taxCode: p.code, description: b.number, ...dims });
  }
  return lines;
}

/** A supplier bill: the cost (and the VAT we reclaim) against what we owe the supplier. */
export function billLines(b: BillFacts): PostLine[] {
  return [...costAndVatLines(b), { account: "ap", credit: b.total, partyType: "supplier", partyId: b.supplierId, description: b.number, orderId: b.orderId, dealId: b.dealId }];
}

/** An expense paid on the spot: the cost and VAT, straight out of the bank or cash. */
export function expenseLines(b: BillFacts & { bankLedgerAccountId: number }): PostLine[] {
  return [...costAndVatLines(b), { account: b.bankLedgerAccountId, credit: b.total, description: b.number }];
}

export interface DebitNoteFacts {
  number: string;
  billNumber: string;
  supplierId: number | null;
  category: string;
  orderId: number | null;
  dealId: number | null;
  parts: { code: string; net: number; selfAssessed: number }[];
  vatAmount: number;
  total: number;
  /** What the bill still has in Inventory: goods sent back come out of stock first, the rest out of cost of goods sold. */
  inStock: number;
}

/** A debit note takes a bill back: we owe less, the cost and the VAT we reclaim fall, on the note's own date. */
export function debitNoteLines(d: DebitNoteFacts): PostLine[] {
  const dims = { orderId: d.orderId, dealId: d.dealId };
  const description = `${d.number} for ${d.billNumber}`;
  const lines: PostLine[] = [{ account: "ap", debit: d.total, partyType: "supplier", partyId: d.supplierId, description, ...dims }];
  let stock = toMinor(d.category === "cogs" ? d.inStock : 0);
  for (const p of d.parts) {
    const net = toMinor(p.net);
    const fromStock = Math.min(Math.max(stock, 0), net);
    stock -= fromStock;
    const taxed = { taxCode: p.code, description, ...dims };
    if (fromStock > 0) lines.push({ account: "inventory", credit: fromMinor(fromStock), taxBase: fromMinor(-fromStock), ...taxed });
    if (net > fromStock) lines.push({ account: d.category === "cogs" ? "cogs" : billCostAccount(d), credit: fromMinor(net - fromStock), taxBase: fromMinor(fromStock - net), ...taxed });
  }
  if (d.vatAmount > 0) lines.push({ account: "vat_input", credit: d.vatAmount, taxCode: "SR", description, ...dims });
  for (const p of d.parts) {
    if (p.selfAssessed <= 0) continue;
    lines.push({ account: "vat_output_rc", debit: p.selfAssessed, taxCode: p.code, description, ...dims });
    lines.push({ account: "vat_input_rc", credit: p.selfAssessed, taxCode: p.code, description, ...dims });
  }
  return lines;
}

/** Paying a supplier: off what we owe them per bill, out of the bank or cash. The rest is an advance: money they hold for us. */
export function supplierPaymentLines(p: { bankLedgerAccountId: number; amount: number; supplierId: number | null; number: string; allocations: readonly { amount: number; billNumber: string }[] }): PostLine[] {
  const party = { partyType: "supplier" as const, partyId: p.supplierId };
  const rest = advancePart(p.amount, p.allocations);
  const lines: PostLine[] = p.allocations.map((a) => ({ account: "ap", debit: a.amount, description: `${p.number} for ${a.billNumber}`, ...party }));
  if (rest > 0) lines.push({ account: "supplier_advances", debit: rest, description: `${p.number} advance`, ...party });
  lines.push({ account: p.bankLedgerAccountId, credit: p.amount, description: p.number });
  return lines;
}

/** An advance to a supplier set against a bill. */
export function supplierAdvanceAppliedLines(p: { amount: number; supplierId: number | null; paymentNumber: string; billNumber: string }): PostLine[] {
  const party = { partyType: "supplier" as const, partyId: p.supplierId };
  const description = `${p.paymentNumber} applied to ${p.billNumber}`;
  return [
    { account: "ap", debit: p.amount, description, ...party },
    { account: "supplier_advances", credit: p.amount, description, ...party },
  ];
}

/** A voucher's money taken off a bill: we owe the bill again, and the supplier holds the money as an advance. */
export function supplierAdvanceReturnedLines(p: { amount: number; supplierId: number | null; paymentNumber: string; billNumber: string }): PostLine[] {
  const party = { partyType: "supplier" as const, partyId: p.supplierId };
  const description = `${p.paymentNumber} taken off ${p.billNumber}`;
  return [
    { account: "supplier_advances", debit: p.amount, description, ...party },
    { account: "ap", credit: p.amount, description, ...party },
  ];
}

/** A line on whichever side an amount needs: a negative debit is a credit. */
const onSide = (account: string, debit: number, description: string): PostLine => (debit >= 0 ? { account, debit, description } : { account, credit: -debit, description });

/**
 * Filing a VAT return empties the four VAT accounts of that period into what is payable to the FTA (or refundable, which
 * leaves that account in debit). Null when the return is nil.
 */
export function vatSettlementLines(v: { outputStandard: number; outputSelfAssessed: number; inputStandard: number; inputSelfAssessed: number; payable: number }, description: string): PostLine[] | null {
  const lines = [onSide("vat_output", v.outputStandard, description), onSide("vat_output_rc", v.outputSelfAssessed, description), onSide("vat_input", -v.inputStandard, description), onSide("vat_input_rc", -v.inputSelfAssessed, description), onSide("vat_payable", -v.payable, description)].filter((l) => (l.debit ?? l.credit ?? 0) !== 0);
  return lines.length ? lines : null;
}

/** VAT paid to the FTA, or a refund received from it. */
export function vatPaymentLines(p: { amount: number; bankLedgerAccountId: number; description: string }): PostLine[] {
  const abs = Math.abs(p.amount);
  return p.amount >= 0
    ? [
        { account: "vat_payable", debit: abs, description: p.description },
        { account: p.bankLedgerAccountId, credit: abs, description: p.description },
      ]
    : [
        { account: p.bankLedgerAccountId, debit: abs, description: p.description },
        { account: "vat_payable", credit: abs, description: p.description },
      ];
}

/**
 * The month-end stock count: what Inventory says against what the stock is really worth. Less stock than the books means
 * goods were sold or lost, so the difference is a cost; more means the opposite. Null when they already agree.
 */
export function closingStockLines(bookValue: number, counted: number, description: string): PostLine[] | null {
  const diff = toMinor(bookValue) - toMinor(counted);
  if (diff === 0) return null;
  const amount = fromMinor(Math.abs(diff));
  return diff > 0
    ? [
        { account: "cogs", debit: amount, description },
        { account: "inventory", credit: amount, description },
      ]
    : [
        { account: "inventory", debit: amount, description },
        { account: "cogs", credit: amount, description },
      ];
}

/** Goods leave stock when their order is invoiced: cost of goods sold up, inventory down (per bill, at its cost). */
export function cogsLines(p: { amount: number; billNumber: string; invoiceNumber: string; orderId: number | null; dealId: number | null }): PostLine[] {
  const description = `${p.billNumber} sold on ${p.invoiceNumber}`;
  return [
    { account: "cogs", debit: p.amount, description, orderId: p.orderId, dealId: p.dealId },
    { account: "inventory", credit: p.amount, description, orderId: p.orderId, dealId: p.dealId },
  ];
}
