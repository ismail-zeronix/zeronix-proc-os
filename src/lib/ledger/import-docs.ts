/**
 * Saving one imported invoice or supplier bill (with its receipt or payment voucher when it was already paid), inside the
 * transaction the caller opens. The same rules and ledger postings as the forms, with the differences an import needs:
 * the invoice keeps the number it already has, dates in the past are fine, and no tasks or timeline notes are made.
 * Called one document at a time by app/(app)/accounts/import-actions.ts, so a document that fails never undoes another.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { dubaiToday } from "@/lib/dates";
import { nextSeq } from "@/lib/doc-numbers";
import { finalizeDoc, type Basis, type DraftLine, type PayMethod } from "@/lib/import/docs";
import { dueDateFor, yearNumber } from "@/lib/invoicing";
import { assertInLedgerPeriod, pickPaymentAccount, postBillDoc, postInvoiceDoc, postReceiptDoc, postSupplierPaymentDoc } from "@/lib/ledger/documents";
import { toMinor } from "@/lib/money";
import { isCategory } from "@/lib/purchases";
import { money } from "@/lib/quotation";
import { normName, trnProblem } from "@/lib/sales";
import { sellerSnapshot } from "@/lib/seller";
import type { Tx } from "@/lib/tx";
import { UserError } from "@/lib/user-error";

export interface ImportPaid {
  amount: number;
  date: string;
  method: PayMethod;
  bankAccountId: number | null;
  reference: string;
}

export interface ImportInvoiceInput {
  number: string;
  date: string;
  termsDays: number;
  customerRef: string;
  address: string;
  basis: Basis;
  lines: DraftLine[];
  /** An existing customer, or null and `newParty` says who to add. */
  partyId: number | null;
  newParty: { name: string; address: string } | null;
  paid: ImportPaid | null;
}

export interface ImportBillInput {
  /** The supplier's own invoice number. */
  number: string;
  date: string;
  termsDays: number;
  category: string;
  notes: string;
  basis: Basis;
  vatOverride: number | null;
  lines: DraftLine[];
  partyId: number | null;
  newParty: { name: string } | null;
  paid: ImportPaid | null;
}

export interface ImportResult {
  id: number;
  number: string;
  partyId: number;
  partyName: string;
  /** The receipt or payment voucher made for it, when it was paid. */
  paymentNumber: string | null;
}

/** The customer with this name (same spelling rules as everywhere: LLC, spaces, case ignored), or a new one. */
async function customerFor(tx: Tx, userId: number, input: Pick<ImportInvoiceInput, "partyId" | "newParty">) {
  const c = schema.companies;
  if (input.partyId) {
    const [row] = await tx.select().from(c).where(eq(c.id, input.partyId));
    if (!row) throw new UserError("That customer no longer exists.");
    return row;
  }
  const name = input.newParty?.name.replace(/\s+/g, " ").trim() ?? "";
  if (name.length < 2) throw new UserError("Enter the customer name.");
  const [same] = await tx.select().from(c).where(eq(c.nameNorm, normName(name))).limit(1);
  if (same) return same;
  const [row] = await tx.insert(c).values({ name, nameNorm: normName(name), address: input.newParty?.address ?? "", isCustomer: true, ownerId: userId }).returning();
  return row;
}

/** The supplier with this name (case ignored), or a new one. */
async function supplierFor(tx: Tx, input: Pick<ImportBillInput, "partyId" | "newParty" | "termsDays">) {
  const s = schema.suppliers;
  if (input.partyId) {
    const [row] = await tx.select().from(s).where(eq(s.id, input.partyId));
    if (!row) throw new UserError("That supplier no longer exists.");
    return row;
  }
  const name = input.newParty?.name.replace(/\s+/g, " ").trim() ?? "";
  if (name.length < 2) throw new UserError("Enter the supplier name.");
  const [same] = await tx.select().from(s).where(sql`lower(${s.name}) = lower(${name})`).limit(1);
  if (same) return same;
  const [row] = await tx.insert(s).values({ name, termsDays: input.termsDays }).returning();
  return row;
}

function checkPaid(paid: ImportPaid, doc: { date: string; total: number }) {
  if (!(paid.amount > 0)) throw new UserError("The paid amount must be above zero.");
  if (toMinor(paid.amount) > toMinor(doc.total)) throw new UserError(`The paid amount ${money(paid.amount)} is more than the total ${money(doc.total)}.`);
  if (paid.date < doc.date) throw new UserError("The payment date cannot be before the document date.");
  if (paid.date > dubaiToday()) throw new UserError("The payment date cannot be in the future.");
}

/** One imported tax invoice, keeping its number, and the receipt for what was already paid. */
export async function importInvoiceTx(tx: Tx, orgId: number, userId: number, d: ImportInvoiceInput): Promise<ImportResult> {
  if (d.date > dubaiToday()) throw new UserError("The invoice date cannot be in the future.");
  const { lines, tax } = finalizeDoc({ kind: "invoice", basis: d.basis, lines: d.lines, vatOverride: null });
  if (!(tax.total > 0)) throw new UserError("The invoice total must be above zero.");
  await assertInLedgerPeriod(tx, orgId, d.date);
  const [taken] = await tx.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.number, d.number));
  if (taken) throw new UserError(`Invoice ${d.number} is already in the system.`);
  const company = await customerFor(tx, userId, d);
  const badTrn = trnProblem(company.trn);
  if (badTrn) throw new UserError(`${company.name}: ${badTrn}`);
  if (!company.isCustomer) await tx.update(schema.companies).set({ isCustomer: true }).where(eq(schema.companies.id, company.id));
  const snap = await sellerSnapshot();
  const address = d.address || company.address || (company.emirate ? `${company.emirate}, United Arab Emirates` : "");
  const [inv] = await tx
    .insert(schema.invoices)
    .values({
      sellerSnapshot: snap,
      number: d.number,
      kind: "sale",
      companyId: company.id,
      issueDate: d.date,
      supplyDate: d.date,
      termsDays: d.termsDays,
      dueDate: dueDateFor(d.date, d.termsDays),
      customerName: company.name,
      customerAddress: address,
      customerTrn: company.trn,
      customerRef: d.customerRef,
      vatPct: tax.vatPct,
      subtotal: tax.subtotal,
      vatAmount: tax.vat,
      total: tax.total,
      status: "issued",
      createdBy: userId,
    })
    .returning({ id: schema.invoices.id });
  await tx.insert(schema.invoiceItems).values(lines.map((l, position) => ({ invoiceId: inv.id, position, description: l.description, qty: l.qty, unitPrice: l.unitPrice, lineKind: l.kind, taxCode: l.taxCode })));
  await postInvoiceDoc(tx, orgId, inv.id, userId);
  let paymentNumber: string | null = null;
  if (d.paid) {
    checkPaid(d.paid, { date: d.date, total: tax.total });
    await assertInLedgerPeriod(tx, orgId, d.paid.date);
    const year = Number(d.paid.date.slice(0, 4));
    const seq = await nextSeq(tx, "receipt", schema.payments, schema.payments.year, schema.payments.seq, year);
    paymentNumber = yearNumber("ZRV", year, seq);
    const [p] = await tx
      .insert(schema.payments)
      .values({
        sellerSnapshot: snap,
        year,
        seq,
        number: paymentNumber,
        companyId: company.id,
        paidOn: d.paid.date,
        amount: d.paid.amount,
        method: d.paid.method,
        bankAccountId: await pickPaymentAccount(tx, orgId, d.paid.bankAccountId, d.paid.method),
        reference: d.paid.reference || "Import",
        notes: "",
        createdBy: userId,
      })
      .returning({ id: schema.payments.id });
    await tx.insert(schema.paymentAllocations).values({ paymentId: p.id, invoiceId: inv.id, amount: d.paid.amount, appliedOn: d.paid.date, createdBy: userId });
    await postReceiptDoc(tx, orgId, p.id, userId);
  }
  await audit(tx, {
    userId,
    action: "invoice.import",
    entity: "invoice",
    entityId: inv.id,
    summary: `${d.number} imported for ${company.name}: ${money(tax.total)}${paymentNumber ? `, paid ${money(d.paid!.amount)} (${paymentNumber})` : ""}`,
    after: { number: d.number, issueDate: d.date, subtotal: tax.subtotal, vatAmount: tax.vat, total: tax.total, paymentNumber },
  });
  return { id: inv.id, number: d.number, partyId: company.id, partyName: company.name, paymentNumber };
}

/** One imported supplier bill (our number ZBL-year-0001, theirs in "supplier invoice no."), and the voucher for what was already paid. */
export async function importBillTx(tx: Tx, orgId: number, userId: number, d: ImportBillInput): Promise<ImportResult> {
  if (d.date > dubaiToday()) throw new UserError("The bill date cannot be in the future.");
  if (!d.number.trim()) throw new UserError("Enter the supplier's invoice number, so the same bill is never entered twice.");
  if (!isCategory(d.category)) throw new UserError("Pick a category.");
  const { lines, tax } = finalizeDoc({ kind: "bill", basis: d.basis, lines: d.lines, vatOverride: d.vatOverride });
  if (!(tax.total > 0)) throw new UserError("The bill total must be above zero.");
  await assertInLedgerPeriod(tx, orgId, d.date);
  const supplier = await supplierFor(tx, d);
  const b = schema.bills;
  const [dup] = await tx.select({ number: b.number }).from(b).where(and(eq(b.supplierId, supplier.id), eq(b.supplierRef, d.number), ne(b.status, "void")));
  if (dup) throw new UserError(`${supplier.name} invoice ${d.number} is already entered as ${dup.number}.`);
  const year = Number(d.date.slice(0, 4));
  const seq = await nextSeq(tx, "bill", b, b.year, b.seq, year);
  const number = yearNumber("ZBL", year, seq);
  const [row] = await tx
    .insert(b)
    .values({
      year,
      seq,
      number,
      kind: "bill",
      supplierId: supplier.id,
      supplierRef: d.number,
      billDate: d.date,
      termsDays: d.termsDays,
      dueDate: dueDateFor(d.date, d.termsDays),
      category: d.category,
      vatPct: tax.vatPct,
      subtotal: tax.subtotal,
      vatAmount: tax.vat,
      total: tax.total,
      notes: d.notes,
      createdBy: userId,
    })
    .returning({ id: b.id });
  await tx.insert(schema.billItems).values(lines.map((l, position) => ({ billId: row.id, position, description: l.description, qty: l.qty, unitCost: l.unitPrice, taxCode: l.taxCode })));
  await postBillDoc(tx, orgId, row.id, userId);
  let paymentNumber: string | null = null;
  if (d.paid) {
    checkPaid(d.paid, { date: d.date, total: tax.total });
    await assertInLedgerPeriod(tx, orgId, d.paid.date);
    const pyear = Number(d.paid.date.slice(0, 4));
    const pseq = await nextSeq(tx, "voucher", schema.supplierPayments, schema.supplierPayments.year, schema.supplierPayments.seq, pyear);
    paymentNumber = yearNumber("ZPV", pyear, pseq);
    const [p] = await tx
      .insert(schema.supplierPayments)
      .values({
        sellerSnapshot: await sellerSnapshot(),
        year: pyear,
        seq: pseq,
        number: paymentNumber,
        supplierId: supplier.id,
        paidOn: d.paid.date,
        amount: d.paid.amount,
        method: d.paid.method,
        bankAccountId: await pickPaymentAccount(tx, orgId, d.paid.bankAccountId, d.paid.method),
        reference: d.paid.reference || "Import",
        notes: "",
        createdBy: userId,
      })
      .returning({ id: schema.supplierPayments.id });
    await tx.insert(schema.supplierPaymentAllocations).values({ paymentId: p.id, billId: row.id, amount: d.paid.amount, appliedOn: d.paid.date, createdBy: userId });
    await postSupplierPaymentDoc(tx, orgId, p.id, userId);
  }
  await audit(tx, {
    userId,
    action: "bill.import",
    entity: "bill",
    entityId: row.id,
    summary: `${number} imported from ${supplier.name} (${d.number}): ${money(tax.total)}${paymentNumber ? `, paid ${money(d.paid!.amount)} (${paymentNumber})` : ""}`,
    after: { number, supplierRef: d.number, billDate: d.date, category: d.category, subtotal: tax.subtotal, vatAmount: tax.vat, total: tax.total, paymentNumber },
  });
  return { id: row.id, number, partyId: supplier.id, partyName: supplier.name, paymentNumber };
}

