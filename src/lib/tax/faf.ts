/**
 * The FTA Audit File (FAF), version 1.0.0: one CSV with the company, its purchases, its supplies and the general ledger.
 * Layout taken from software vendors' published FAF guides; the FTA's own specification could not be read, so the
 * accountant should compare a sample against what the FTA asks for before relying on it. Pure, so it is easy to test.
 */

export interface FafCompany {
  nameEn: string;
  nameAr: string;
  trn: string;
  agencyName: string;
  tan: string;
  agentName: string;
  taan: string;
  from: string;
  to: string;
  created: string;
  product: string;
}

export interface FafPurchase {
  supplier: string;
  country: string;
  trn: string;
  invoiceDate: string;
  invoiceNo: string;
  permitNo: string;
  transactionId: string;
  lineNo: number;
  description: string;
  value: number;
  vat: number;
  taxCode: string;
}

export interface FafSupply {
  customer: string;
  country: string;
  trn: string;
  invoiceDate: string;
  invoiceNo: string;
  transactionId: string;
  lineNo: number;
  description: string;
  value: number;
  vat: number;
  taxCode: string;
}

export interface FafLedgerLine {
  date: string;
  accountId: string;
  accountName: string;
  description: string;
  name: string;
  transactionId: string;
  sourceId: string;
  sourceType: string;
  debit: number;
  credit: number;
  balance: number;
}

/** The FTA asks for commas replaced by semicolons and no line breaks inside a field. */
export const fafText = (s: string | number | null | undefined) => String(s ?? "").replace(/,/g, ";").replace(/[\r\n]+/g, " ").trim();

const amt = (n: number) => n.toFixed(2);
const row = (cells: readonly (string | number)[]) => cells.map(fafText).join(",");
const fafDate = (d: string) => (d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
const sum = (xs: readonly number[]) => Math.round(xs.reduce((s, x) => s + Math.round(x * 100), 0)) / 100;

/**
 * A document carries its VAT as one figure; the file wants it per line. Each standard-rated line takes its share of the
 * running total, so the lines always add up to exactly the document's VAT.
 */
export function splitVat(lines: readonly { doc: string; code: string; net: number; vat: number }[]): number[] {
  const m = (x: number) => Math.round(x * 100);
  const base = new Map<string, number>();
  for (const l of lines) if (l.code === "SR") base.set(l.doc, (base.get(l.doc) ?? 0) + m(l.net));
  const seen = new Map<string, number>();
  const given = new Map<string, number>();
  return lines.map((l) => {
    const whole = base.get(l.doc) ?? 0;
    if (l.code !== "SR" || !whole) return 0;
    const upTo = (seen.get(l.doc) ?? 0) + m(l.net);
    seen.set(l.doc, upTo);
    const target = Math.round((m(l.vat) * upTo) / whole);
    const part = target - (given.get(l.doc) ?? 0);
    given.set(l.doc, target);
    return part / 100;
  });
}

export function buildFaf(c: FafCompany, purchases: readonly FafPurchase[], supplies: readonly FafSupply[], ledger: readonly FafLedgerLine[]): string {
  const out: string[] = [];
  out.push("Company Information Table Start");
  out.push("TaxablePersonNameEn,TaxablePersonNameAr,TRN,TaxAgencyName,TAN,TaxAgentName,TAAN,PeriodStart,PeriodEnd,FAFCreationDate,ProductVersion,FAFVersion");
  out.push(row([c.nameEn, c.nameAr, c.trn, c.agencyName, c.tan, c.agentName, c.taan, fafDate(c.from), fafDate(c.to), fafDate(c.created), c.product, "FAFv1.0.0"]));
  out.push("Company Information Table End");
  out.push("");
  out.push("Supplier Purchase Listing Table Start");
  out.push("SupplierName,SupplierCountry,SupplierTRN,InvoiceDate,InvoiceNo,PermitNo,TransactionID,LineNo,ProductDescription,PurchaseValueAED,VATValueAED,TaxCode,FCYCode,PurchaseFCY,VATFCY");
  for (const p of purchases) out.push(row([p.supplier, p.country, p.trn, fafDate(p.invoiceDate), p.invoiceNo, p.permitNo, p.transactionId, p.lineNo, p.description, amt(p.value), amt(p.vat), p.taxCode, "", "", ""]));
  out.push("Supplier Purchase Listing Table End");
  out.push("SupplyTotalAED,VATTotalAED,TransactionCountTotal");
  out.push(row([amt(sum(purchases.map((p) => p.value))), amt(sum(purchases.map((p) => p.vat))), purchases.length]));
  out.push("");
  out.push("Customer Supply Listing Table Start");
  out.push("CustomerName,CustomerCountry,CustomerTRN,InvoiceDate,InvoiceNo,TransactionID,LineNo,ProductDescription,SupplyValueAED,VATValueAED,TaxCode,Country,FCYCode,SupplyFCY,VATFCY");
  for (const s of supplies) out.push(row([s.customer, s.country, s.trn, fafDate(s.invoiceDate), s.invoiceNo, s.transactionId, s.lineNo, s.description, amt(s.value), amt(s.vat), s.taxCode, s.country, "", "", ""]));
  out.push("Customer Supply Listing Table End");
  out.push("SupplyTotalAED,VATTotalAED,TransactionCountTotal");
  out.push(row([amt(sum(supplies.map((s) => s.value))), amt(sum(supplies.map((s) => s.vat))), supplies.length]));
  out.push("");
  out.push("General Ledger Table Start");
  out.push("TransactionDate,AccountID,AccountName,TransactionDescription,Name,TransactionID,SourceDocumentID,SourceType,Debit,Credit,Balance");
  for (const l of ledger) out.push(row([fafDate(l.date), l.accountId, l.accountName, l.description, l.name, l.transactionId, l.sourceId, l.sourceType, amt(l.debit), amt(l.credit), amt(l.balance)]));
  out.push("General Ledger Table End");
  out.push("TotalDebit,TotalCredit,TransactionCountTotal,GLTCurrency");
  out.push(row([amt(sum(ledger.map((l) => l.debit))), amt(sum(ledger.map((l) => l.credit))), ledger.length, "AED"]));
  return out.join("\r\n") + "\r\n";
}
