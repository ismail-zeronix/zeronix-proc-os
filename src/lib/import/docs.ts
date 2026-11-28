/**
 * Pasted CSV → invoices or supplier bills, ready to review: the fields we read, rows grouped into documents, the VAT
 * arithmetic and the checks. Pure (no database, no server code), so the review table in the browser and the server action
 * that saves a document run the very same functions.
 */
import { daysBetween, TERMS_OPTIONS } from "@/lib/invoicing";
import { parseAmount } from "@/lib/ledger/opening";
import { toIsoDate } from "@/lib/prospecting/import";
import { CATEGORIES, billTax } from "@/lib/purchases";
import { round2 } from "@/lib/quotation";
import { normName } from "@/lib/sales";
import { docTax, netsFromGross, PURCHASE_TAX_CODES, SALES_TAX_CODES, type DocTax } from "@/lib/tax/doc-tax";
import { cellOf, type FieldDef, type Mapping } from "./columns";

export type ImportKind = "invoice" | "bill";
export type Basis = "net" | "gross";
export type PayMethod = "cash" | "bank";

export interface DraftLine {
  description: string;
  qty: number;
  /** Unit price as in the file: before VAT, or with VAT when the document's basis is "gross". */
  price: number;
  kind: "product" | "service";
  taxCode: string;
}

export interface DraftPaid {
  on: boolean;
  amount: number;
  date: string;
  method: PayMethod;
  bankAccountId: number | null;
  reference: string;
}

export interface DraftDoc {
  key: string;
  kind: ImportKind;
  /** Invoice number (kept as it is) or the supplier's invoice number. */
  number: string;
  date: string;
  termsDays: number;
  /** The customer or supplier name as written in the file. */
  party: string;
  /** Invoice: customer PO / subject. Bill: notes. */
  ref: string;
  address: string;
  /** Bills only. */
  category: string;
  basis: Basis;
  lines: DraftLine[];
  /** The document total in the file, to compare with what we work out. */
  csvTotal: number | null;
  /** Bills only: the VAT printed on the supplier's invoice when it differs by a few fils. */
  vatOverride: number | null;
  /** The owner accepts a total that differs from the file. */
  acceptDiff: boolean;
  paid: DraftPaid;
}

const INV_HINTS = {
  number: ["invoice number", "invoice no", "invoice", "inv no", "inv number", "number"],
  date: ["invoice date", "issue date", "date"],
  party: ["customer name", "customer", "client name", "client", "bill to"],
} as const;

const SHARED_FIELDS: FieldDef[] = [
  { key: "due", label: "Due date", hints: ["due date", "expected payment date"] },
  { key: "terms", label: "Payment terms", hints: ["payment terms", "terms", "terms days"] },
  { key: "description", label: "Line description", required: true, hints: ["item desc", "item description", "description", "product description", "product"] },
  { key: "itemName", label: "Item name", hints: ["item name", "product name", "item"] },
  { key: "qty", label: "Quantity", required: true, hints: ["quantity", "qty"] },
  { key: "price", label: "Unit price", hints: ["rate", "unit price", "unit cost", "item price", "price"] },
  { key: "lineTotal", label: "Line amount", hints: ["item total", "line total", "line amount", "item amount", "net amount", "amount"] },
  { key: "taxPct", label: "Tax %", hints: ["item tax %", "item tax", "tax %", "tax rate", "vat %", "vat rate", "tax percentage"] },
  { key: "taxAmount", label: "Tax amount", hints: ["item tax amount", "tax amount", "vat amount"] },
  { key: "total", label: "Document total", hints: ["total", "total incl vat", "invoice total", "bill total", "gross total", "total amount"] },
  { key: "inclusive", label: "Amounts include VAT", hints: ["is inclusive tax", "inclusive tax", "tax inclusive", "amounts include vat"] },
  { key: "paidAmount", label: "Amount paid", hints: ["amount collected", "amount paid", "paid amount", "paid"] },
  { key: "balance", label: "Balance", hints: ["balance", "balance due", "outstanding", "outstanding balance"] },
  { key: "paidDate", label: "Payment date", hints: ["last payment date", "payment date", "paid on", "paid date"] },
];

export const INVOICE_FIELDS: FieldDef[] = [
  { key: "number", label: "Invoice number", required: true, hints: INV_HINTS.number },
  { key: "date", label: "Invoice date", required: true, hints: INV_HINTS.date },
  { key: "party", label: "Customer name", required: true, hints: INV_HINTS.party },
  { key: "ref", label: "PO / customer ref", hints: ["purchaseorder", "purchase order", "po number", "po no", "lpo", "customer ref", "customer reference"] },
  { key: "subject", label: "Subject", hints: ["subject", "notes"] },
  { key: "address", label: "Billing address", hints: ["billing address", "address"] },
  ...SHARED_FIELDS,
];

export const BILL_FIELDS: FieldDef[] = [
  { key: "number", label: "Supplier invoice no.", required: true, hints: ["bill number", "bill no", "bill", "vendor invoice", "supplier invoice no", "supplier invoice", "invoice number", "invoice no", "reference number", "reference"] },
  { key: "date", label: "Bill date", required: true, hints: ["bill date", "invoice date", "date"] },
  { key: "party", label: "Supplier name", required: true, hints: ["vendor name", "supplier name", "supplier", "vendor"] },
  { key: "category", label: "Category / account", hints: ["category", "account", "expense account", "expense category"] },
  { key: "notes", label: "Notes", hints: ["notes", "note", "remarks"] },
  ...SHARED_FIELDS,
];

export const fieldsOf = (kind: ImportKind) => (kind === "invoice" ? INVOICE_FIELDS : BILL_FIELDS);

/** Our cost category from a free-text account name ("Purchases", "Rent Expense"); `fallback` when nothing fits. */
export function guessCategory(text: string, fallback: string): string {
  const t = text.trim().toLowerCase();
  if (!t) return fallback;
  const exact = CATEGORIES.find((c) => c.key === t || c.label.toLowerCase() === t);
  if (exact) return exact.key;
  const rules: [string, RegExp][] = [
    ["cogs", /cost of goods|purchase|inventory|stock|goods/],
    ["rent", /\brent/],
    ["salaries", /salar|wage|payroll/],
    ["visa", /visa|labou?r|emirates id/],
    ["utilities", /utilit|dewa|electric|water/],
    ["telecom", /telecom|telephone|internet|mobile|etisalat/],
    ["transport", /fuel|transport|salik|parking|delivery|freight/],
    ["marketing", /marketing|advert|promotion/],
    ["office", /office|stationer/],
    ["software", /software|subscription|licen[cs]e|cloud/],
    ["bank", /bank/],
    ["fees", /professional|legal|account(ant|ing)|audit|government|trade licen/],
    ["repairs", /repair|maintenance/],
  ];
  return rules.find(([, re]) => re.test(t))?.[0] ?? fallback;
}

const pct = (s: string) => parseAmount(s.replace("%", ""));
const isCashCustomer = (name: string) => normName(name) === "cashcustomer";

/** Credit terms in days: from the due date, or "Net 30", or "Due on receipt"; else the fallback. */
function termsOf(due: string, date: string, text: string, fallback: number): number {
  if (due && date) {
    const d = daysBetween(date, due);
    if (Number.isFinite(d) && d >= 0 && d <= 365) return d;
  }
  const m = text.match(/(\d+)/);
  if (m) return Math.min(365, Number(m[1]));
  if (/receipt|cash|immediate/i.test(text)) return 0;
  return fallback;
}

/** The tax code of a line from what the file says (a rate, an amount), else standard rate. */
function codeOf(kind: ImportKind, row: readonly string[], map: Mapping): string {
  const zero = kind === "invoice" ? "ZR" : "OS";
  if (map.taxPct !== undefined && cellOf(row, map, "taxPct") !== "") return pct(cellOf(row, map, "taxPct")) > 0 ? "SR" : zero;
  if (map.taxAmount !== undefined && cellOf(row, map, "taxAmount") !== "") return parseAmount(cellOf(row, map, "taxAmount")) > 0 ? "SR" : zero;
  return "SR";
}

/**
 * Groups the rows of the paste into documents (one block per invoice number, or per supplier and number), reading the
 * header fields from the document's first row and a line from every row.
 */
export function buildDrafts(kind: ImportKind, rows: readonly string[][], map: Mapping, opts: { defaultCategory?: string } = {}): { docs: DraftDoc[]; skipped: number } {
  const groups = new Map<string, string[][]>();
  let skipped = 0;
  for (const row of rows) {
    const number = cellOf(row, map, "number");
    if (!number) {
      skipped++;
      continue;
    }
    const k = kind === "bill" ? `${normName(cellOf(row, map, "party"))}|${number.toLowerCase()}` : number.toLowerCase();
    const g = groups.get(k);
    if (g) g.push([...row]);
    else groups.set(k, [[...row]]);
  }
  const docs: DraftDoc[] = [];
  for (const g of groups.values()) {
    const h = g[0];
    const party = cellOf(h, map, "party").replace(/\s+/g, " ");
    const date = toIsoDate(cellOf(h, map, "date"));
    const total = cellOf(h, map, "total");
    const inclusive = /^(true|yes|1)$/i.test(cellOf(h, map, "inclusive"));
    const lines: DraftLine[] = g.map((r) => {
      const qtyText = cellOf(r, map, "qty");
      const qty = map.qty === undefined || qtyText === "" ? 1 : parseAmount(qtyText);
      const priceText = cellOf(r, map, "price");
      const amountText = cellOf(r, map, "lineTotal");
      const price = priceText !== "" ? parseAmount(priceText) : amountText !== "" && qty > 0 ? round2(parseAmount(amountText) / qty) : 0;
      return {
        description: cellOf(r, map, "description") || cellOf(r, map, "itemName"),
        qty,
        price,
        kind: "product",
        taxCode: codeOf(kind, r, map),
      };
    });
    const totalNum = total === "" ? null : parseAmount(total);
    const paidFromFile = cellOf(h, map, "paidAmount") !== "" ? parseAmount(cellOf(h, map, "paidAmount")) : cellOf(h, map, "balance") !== "" && totalNum != null ? round2(totalNum - parseAmount(cellOf(h, map, "balance"))) : 0;
    const paidAmount = paidFromFile > 0.004 ? round2(paidFromFile) : 0;
    const fallbackTerms = kind === "invoice" ? (isCashCustomer(party) ? 0 : 30) : 30;
    docs.push({
      key: `${kind}:${docs.length}`,
      kind,
      number: cellOf(h, map, "number"),
      date,
      termsDays: termsOf(toIsoDate(cellOf(h, map, "due")), date, cellOf(h, map, "terms"), fallbackTerms),
      party,
      ref: kind === "invoice" ? cellOf(h, map, "ref") || cellOf(h, map, "subject") : cellOf(h, map, "notes"),
      address: cellOf(h, map, "address").replace(/\s*\n\s*/g, ", "),
      category: kind === "bill" ? guessCategory(cellOf(h, map, "category"), opts.defaultCategory ?? "cogs") : "",
      basis: inclusive ? "gross" : "net",
      lines,
      csvTotal: totalNum,
      vatOverride: null,
      acceptDiff: false,
      paid: {
        on: paidAmount > 0,
        amount: paidAmount,
        date: toIsoDate(cellOf(h, map, "paidDate")) || date,
        method: kind === "invoice" && isCashCustomer(party) ? "cash" : "bank",
        bankAccountId: null,
        reference: "",
      },
    });
  }
  return { docs, skipped };
}

export interface FinalLine {
  description: string;
  qty: number;
  /** Net unit price to the fil, what the invoice or bill saves. */
  unitPrice: number;
  /** What the line comes to before VAT, as the database will work it out (qty × unit price). */
  net: number;
  kind: "product" | "service";
  taxCode: string;
}

/**
 * The lines as they will be saved, and the VAT of the document. A VAT-inclusive file is converted to net per tax code
 * (nets add up to the code's net, the VAT adds back to the amount in the file); totals come from docTax / billTax, the
 * same functions the real forms use.
 */
export function finalizeDoc(doc: Pick<DraftDoc, "kind" | "basis" | "lines" | "vatOverride">): { lines: FinalLine[]; tax: DocTax } {
  const gross = doc.basis === "gross";
  const asFiled = doc.lines.map((l) => round2(l.qty * l.price));
  const nets = gross ? netsFromGross(doc.lines.map((l, i) => ({ gross: asFiled[i], code: l.taxCode }))) : asFiled;
  const lines = doc.lines.map((l, i): FinalLine => {
    const unitPrice = l.qty > 0 ? round2(nets[i] / l.qty) : 0;
    return { description: l.description.trim(), qty: l.qty, unitPrice, net: round2(l.qty * unitPrice), kind: l.kind, taxCode: l.taxCode };
  });
  const parts = lines.map((l) => ({ net: l.net, code: l.taxCode }));
  const tax = doc.kind === "bill" ? billTax(lines.map((l) => ({ qty: l.qty, unitCost: l.unitPrice, taxCode: l.taxCode })), doc.vatOverride) : docTax(parts);
  return { lines, tax };
}

export interface DocContext {
  today: string;
  /** The invoice number (or this supplier's invoice number) is already in the system. */
  exists: boolean;
  /** Another document of this paste has the same number (and supplier). */
  duplicateInBatch: boolean;
  /** The customer or supplier is picked, or will be created. */
  partyReady: boolean;
  /** Invoices: our own TRN is set in Accounts › Settings. */
  hasOurTrn: boolean;
}

export interface DocCheck {
  errors: string[];
  warnings: string[];
  lines: FinalLine[];
  tax: DocTax;
  /** Our total less the file's total, when the file has one. */
  difference: number | null;
}

/** What stops a document being saved (errors) and what only deserves a look (warnings). */
export function checkDoc(doc: DraftDoc, ctx: DocContext): DocCheck {
  const { lines, tax } = finalizeDoc(doc);
  const errors: string[] = [];
  const warnings: string[] = [];
  const codes: readonly string[] = doc.kind === "invoice" ? SALES_TAX_CODES : PURCHASE_TAX_CODES;
  if (!doc.number.trim()) errors.push(doc.kind === "invoice" ? "Invoice number is missing." : "The supplier's invoice number is missing.");
  if (!doc.date) errors.push("The date is missing or not readable.");
  else if (doc.date > ctx.today) errors.push("The date is in the future.");
  if (!doc.party.trim()) errors.push(doc.kind === "invoice" ? "Customer name is missing." : "Supplier name is missing.");
  else if (!ctx.partyReady) errors.push(doc.kind === "invoice" ? "Pick the customer or choose to add them." : "Pick the supplier or choose to add them.");
  if (ctx.exists) errors.push(doc.kind === "invoice" ? `Invoice ${doc.number} is already in the system.` : `This supplier invoice (${doc.number}) is already entered.`);
  if (ctx.duplicateInBatch) errors.push(`${doc.number} appears twice in this paste.`);
  if (!doc.lines.length) errors.push("There are no lines.");
  doc.lines.forEach((l, i) => {
    const n = i + 1;
    if (!l.description.trim()) errors.push(`Line ${n}: add a description.`);
    if (!(l.qty > 0)) errors.push(`Line ${n}: quantity must be above zero.`);
    if (!(l.price >= 0)) errors.push(`Line ${n}: price cannot be below zero.`);
    if (!codes.includes(l.taxCode)) errors.push(`Line ${n}: VAT code ${l.taxCode} cannot be used on ${doc.kind === "invoice" ? "an invoice" : "a bill"}.`);
  });
  if (doc.lines.length && !(tax.total > 0)) errors.push("The total must be above zero.");
  if (doc.kind === "invoice" && !ctx.hasOurTrn) errors.push("Our TRN is not set (Admin › Settings › Company & branding): a tax invoice needs it.");
  const difference = doc.csvTotal == null ? null : round2(tax.total - doc.csvTotal);
  if (difference != null && Math.abs(difference) > 0.005 && !doc.acceptDiff) errors.push(`Total ${tax.total.toFixed(2)} differs from the file's ${doc.csvTotal!.toFixed(2)} by ${Math.abs(difference).toFixed(2)}. Fix the lines or accept the difference.`);
  if (doc.kind === "invoice" && !doc.address.trim()) warnings.push("No billing address in the file.");
  if (doc.paid.on) {
    if (!(doc.paid.amount > 0)) errors.push("Paid amount must be above zero.");
    else if (doc.paid.amount > tax.total + 0.005) errors.push("Paid amount is more than the total.");
    if (!doc.paid.date) errors.push("The payment date is missing.");
    else if (doc.date && doc.paid.date < doc.date) errors.push("The payment date is before the document date.");
    else if (doc.paid.date > ctx.today) errors.push("The payment date is in the future.");
  }
  return { errors, warnings, lines, tax, difference };
}

export const termsChoices = (days: number): number[] => (TERMS_OPTIONS.includes(days as (typeof TERMS_OPTIONS)[number]) ? [...TERMS_OPTIONS] : [...TERMS_OPTIONS, days].sort((a, b) => a - b));
