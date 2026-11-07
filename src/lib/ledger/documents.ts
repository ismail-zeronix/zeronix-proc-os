import "server-only";
import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema } from "@/db";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { addDays, lineTotal, longDay } from "@/lib/quotation";
import { lineCost } from "@/lib/purchases";
import { docTax } from "@/lib/tax/doc-tax";
import type { Tx } from "@/lib/tx";
import { postEntry, reverseEntry } from "./post";
import { advanceAppliedLines, advanceReturnedLines, billLines, cogsLines, creditNoteLines, customerRefundLines, debitNoteLines, supplierRefundLines, expenseLines, goodsBackLines, groupSaleParts, invoiceLines, receiptLines, supplierAdvanceAppliedLines, supplierAdvanceReturnedLines, supplierPaymentLines, type InvoiceFacts, type SalePart } from "./rules";
import { paymentMethodOf } from "./settings-rules";
import { ensureLedger } from "./setup";
import { UserError } from "@/lib/user-error";

/**
 * Posting documents to the ledger. Every money action calls one of these in the transaction that saves the document,
 * and "Post existing documents" (postExistingDocuments) calls the same ones, so a document posts the same way either
 * way. Nothing posts before the cut-over date (those balances come in as the opening entry from Zoho), and a document
 * that already has its entry is skipped, so calling twice is harmless.
 */

/** The day the ledger starts, or null while it is not switched on. */
export async function ledgerStart(tx: Tx, orgId: number): Promise<string | null> {
  const [s] = await tx.select({ cutover: schema.accountingSettings.cutoverDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
  return s?.cutover ?? null;
}

const posts = (start: string | null, date: string) => !!start && date >= start;

/** The live opening entry (posted from Zoho and not reversed), if any. */
export async function openingEntry(tx: Tx, orgId: number) {
  const e = schema.journalEntries;
  const rev = alias(schema.journalEntries, "rev");
  const [row] = await tx
    .select({ id: e.id, number: e.number, date: e.date, total: e.total })
    .from(e)
    .leftJoin(rev, eq(rev.reversalOfId, e.id))
    .where(and(eq(e.organizationId, orgId), eq(e.sourceType, "opening"), isNull(e.reversalOfId), isNull(rev.id)));
  return row ?? null;
}

/** Opening invoices and bills make up the opening entry: once it is posted they cannot change, or the two would differ. */
export async function assertOpeningOpen(tx: Tx, orgId: number): Promise<void> {
  const live = await openingEntry(tx, orgId);
  if (live) throw new UserError(`The opening balances are already posted (${live.number}). An accountant must reverse that entry before opening invoices or bills can change.`);
}

/** An opening invoice or bill is from before the portal took over: it cannot be dated on or after the cut-over. */
export async function assertOpeningDate(tx: Tx, orgId: number, date: string): Promise<void> {
  const start = await ledgerStart(tx, orgId);
  if (start && date >= start) throw new UserError(`Opening balances are for before ${longDay(start)}, when the ledger starts. Enter this as a normal document instead.`);
}

/**
 * Once the opening entry is posted, anything dated before the cut-over is part of it: adding, voiding or paying such a
 * document would change what customers and suppliers owe without changing the ledger.
 */
export async function assertInLedgerPeriod(tx: Tx, orgId: number, date: string): Promise<void> {
  const start = await ledgerStart(tx, orgId);
  if (!start || date >= start) return;
  const live = await openingEntry(tx, orgId);
  if (live) throw new UserError(`${longDay(date)} is before the ledger starts (${longDay(start)}) and the opening balances are already posted. Use a date from ${longDay(start)} on, or an accountant must reverse ${live.number} first.`);
}

/** Has the ledger anything in it that hangs on the cut-over: documents or opening balances that are posted and not reversed? */
export async function ledgerInUse(tx: Tx, orgId: number): Promise<boolean> {
  const e = schema.journalEntries;
  const rev = alias(schema.journalEntries, "rev");
  const [row] = await tx
    .select({ id: e.id })
    .from(e)
    .leftJoin(rev, eq(rev.reversalOfId, e.id))
    .where(and(eq(e.organizationId, orgId), ne(e.sourceType, "manual"), isNull(e.reversalOfId), isNull(rev.id)))
    .limit(1);
  return !!row;
}

/** This day, or the first day after the lock date when it is locked. */
async function firstOpenDay(tx: Tx, orgId: number, day: string): Promise<string> {
  const [s] = await tx.select({ lockDate: schema.accountingSettings.lockDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
  return s?.lockDate && day <= s.lockDate ? addDays(s.lockDate, 1) : day;
}

async function liveEntry(tx: Tx, orgId: number, sourceType: string, sourceId: number, purpose = "post") {
  const e = schema.journalEntries;
  const rev = alias(schema.journalEntries, "rev");
  const [row] = await tx
    .select({ id: e.id, reversedBy: rev.id })
    .from(e)
    .leftJoin(rev, eq(rev.reversalOfId, e.id))
    .where(and(eq(e.organizationId, orgId), eq(e.sourceType, sourceType), eq(e.sourceId, sourceId), eq(e.purpose, purpose)));
  return row ?? null;
}

/** The cash box or bank account a payment uses: the one saved on it, or the default of its method. */
export async function paymentAccount(tx: Tx, orgId: number, bankAccountId: number | null, method: string): Promise<{ bankAccountId: number; ledgerAccountId: number }> {
  await ensureLedger(tx, orgId);
  const b = schema.bankAccounts;
  const [row] = bankAccountId
    ? await tx.select({ id: b.id, accountId: b.accountId }).from(b).where(and(eq(b.id, bankAccountId), eq(b.organizationId, orgId)))
    : await tx
        .select({ id: b.id, accountId: b.accountId })
        .from(b)
        .where(and(eq(b.organizationId, orgId), eq(b.kind, method === "cash" ? "cash" : "bank"), eq(b.isActive, true)))
        .orderBy(sql`${b.isDefault} DESC`, asc(b.id))
        .limit(1);
  if (!row) throw new UserError(`There is no ${method === "cash" ? "cash" : "bank"} account in the books. An accountant should add one.`);
  return { bankAccountId: row.id, ledgerAccountId: row.accountId };
}

/** The account a person picked on a payment form, checked; or the default of the method when they did not pick one. */
export async function pickPaymentAccount(tx: Tx, orgId: number, bankAccountId: number | null | undefined, method: string): Promise<number> {
  if (!bankAccountId) return (await paymentAccount(tx, orgId, null, method)).bankAccountId;
  const b = schema.bankAccounts;
  const [row] = await tx.select({ id: b.id, kind: b.kind, isActive: b.isActive, name: b.name }).from(b).where(and(eq(b.id, bankAccountId), eq(b.organizationId, orgId)));
  if (!row) throw new UserError("That bank or cash account no longer exists.");
  if (!row.isActive) throw new UserError(`${row.name} is switched off.`);
  if (paymentMethodOf(row.kind) !== (method === "cash" ? "cash" : "bank")) throw new UserError(`${row.name} cannot take a ${method === "cash" ? "cash" : "bank"} payment.`);
  return row.id;
}

/** A document's own totals are what it says: if old lines add up a few fils differently, the first part takes the difference so the entry balances. */
function fitToSubtotal<T extends { net: number }>(parts: T[], subtotal: number): T[] {
  const diff = toMinor(subtotal) - sumMinor(parts.map((p) => toMinor(p.net)));
  if (diff === 0 || !parts.length) return parts;
  return parts.map((p, i) => (i === 0 ? { ...p, net: fromMinor(toMinor(p.net) + diff) } : p));
}

const saleParts = (lines: { qty: number; unitPrice: number; lineKind: SalePart["lineKind"]; taxCode: string }[], subtotal: number) => fitToSubtotal(groupSaleParts(lines.map((l) => ({ lineKind: l.lineKind, code: l.taxCode, net: lineTotal(l) }))), subtotal);

async function invoiceFacts(tx: Tx, invoiceId: number) {
  const [i] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
  if (!i) throw new UserError("That invoice no longer exists.");
  const lines = await tx.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, invoiceId));
  const facts: InvoiceFacts = {
    companyId: i.companyId,
    orderId: i.orderId,
    dealId: i.dealId,
    parts: saleParts(lines, i.subtotal),
    vatAmount: i.vatAmount,
    total: i.total,
    number: i.number,
  };
  return { inv: i, facts };
}

/** Cost of a sale's goods moved to cost of goods sold and not moved back: what can still come back on a credit note. */
export async function soldCostOf(tx: Tx, orgId: number, invoiceId: number): Promise<number> {
  const r = await tx.execute<{ cost: number }>(sql`
    SELECT coalesce(sum(l.debit - l.credit), 0)::float AS cost
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN accounts a ON a.id = l.account_id
    WHERE e.organization_id = ${orgId} AND a.system_key = 'cogs'
      AND ((e.purpose = ${`cogs:${invoiceId}`} AND e.source_type IN ('bill', 'expense') AND e.reversal_of_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reversal_of_id = e.id))
        OR (e.purpose = 'goods_back' AND e.source_type = 'credit_note' AND e.source_id IN (SELECT id FROM credit_notes WHERE invoice_id = ${invoiceId})))`);
  return Math.round(Number(r.rows[0]?.cost ?? 0) * 100) / 100;
}

/** A tax invoice: what the customer owes, our sale and the VAT; then its order's goods leave stock. */
export async function postInvoiceDoc(tx: Tx, orgId: number, invoiceId: number, userId: number | null): Promise<void> {
  const { inv, facts } = await invoiceFacts(tx, invoiceId);
  if (inv.kind !== "sale" || !posts(await ledgerStart(tx, orgId), inv.issueDate)) return;
  if (!(await liveEntry(tx, orgId, "invoice", inv.id))) {
    await postEntry(tx, { orgId, date: inv.issueDate, sourceType: "invoice", sourceId: inv.id, memo: `Invoice ${inv.number} to ${inv.customerName}`, createdBy: userId, lines: invoiceLines(facts) });
  }
  await postInvoiceCogs(tx, orgId, inv, userId);
}

type GoodsDoc = Pick<typeof schema.bills.$inferSelect, "id" | "number" | "kind" | "billDate">;
type InvoiceRow = typeof schema.invoices.$inferSelect;

/**
 * Moves what one goods bill or expense still has in Inventory to cost of goods sold, at its cost (specific
 * identification), one entry per document so voids and cancellations undo exactly that. Dated like the invoice, or like
 * the bill when that arrived later, and never in a locked period.
 */
async function moveToCogs(tx: Tx, orgId: number, doc: GoodsDoc, inv: InvoiceRow, userId: number | null) {
  const sourceType = doc.kind === "expense" ? "expense" : "bill";
  // what it put into Inventory (its posting, if not reversed), less what has already moved out and stayed out
  const amount = await inStockOf(tx, orgId, sourceType, doc.id);
  if (amount <= 0 || (await liveEntry(tx, orgId, sourceType, doc.id, `cogs:${inv.id}`))) return;
  await postEntry(tx, {
    orgId,
    date: await firstOpenDay(tx, orgId, inv.issueDate > doc.billDate ? inv.issueDate : doc.billDate),
    sourceType,
    sourceId: doc.id,
    purpose: `cogs:${inv.id}`,
    memo: `Goods of ${doc.number} sold on invoice ${inv.number}`,
    createdBy: userId,
    lines: cogsLines({ amount, billNumber: doc.number, invoiceNumber: inv.number, orderId: inv.orderId, dealId: inv.dealId }),
  });
}

/** When a sale is invoiced, the goods bought for it (bills and expenses, for its order or for the invoice itself) leave stock. */
async function postInvoiceCogs(tx: Tx, orgId: number, inv: InvoiceRow, userId: number | null) {
  const b = schema.bills;
  const docs = await tx
    .select({ id: b.id, number: b.number, kind: b.kind, billDate: b.billDate })
    .from(b)
    .where(and(inv.orderId ? or(eq(b.orderId, inv.orderId), eq(b.invoiceId, inv.id)) : eq(b.invoiceId, inv.id), inArray(b.kind, ["bill", "expense"]), eq(b.category, "cogs"), ne(b.status, "void")));
  for (const d of docs) await moveToCogs(tx, orgId, d, inv, userId);
}

/** A goods bill for a sale that is already invoiced, whatever date it carries, goes on to cost of goods sold at once. */
async function postLateGoods(tx: Tx, orgId: number, b: typeof schema.bills.$inferSelect, userId: number | null) {
  if (b.category !== "cogs" || (!b.orderId && !b.invoiceId)) return;
  const i = schema.invoices;
  const [inv] = await tx
    .select()
    .from(i)
    .where(and(b.invoiceId ? eq(i.id, b.invoiceId) : eq(i.orderId, b.orderId as number), eq(i.status, "issued"), eq(i.kind, "sale")))
    .limit(1);
  if (inv) await moveToCogs(tx, orgId, b, inv, userId);
}

/** A credit note (cancelled invoice): the sale and VAT given back on its own date; if the goods are coming back, so is their cost. */
export async function postCreditNoteDoc(tx: Tx, orgId: number, creditNoteId: number, userId: number | null): Promise<void> {
  const [cn] = await tx.select().from(schema.creditNotes).where(eq(schema.creditNotes.id, creditNoteId));
  if (!cn) throw new UserError("That credit note no longer exists.");
  const { inv, facts } = await invoiceFacts(tx, cn.invoiceId);
  if (inv.kind !== "sale" || !posts(await ledgerStart(tx, orgId), cn.issueDate)) return;
  if (!(await liveEntry(tx, orgId, "credit_note", cn.id))) {
    await postEntry(tx, {
      orgId,
      date: cn.issueDate,
      sourceType: "credit_note",
      sourceId: cn.id,
      memo: `Credit note ${cn.number} for invoice ${inv.number}`,
      createdBy: userId,
      lines: creditNoteLines({ ...facts, creditNumber: cn.number, parts: saleParts(await tx.select().from(schema.creditNoteItems).where(eq(schema.creditNoteItems.creditNoteId, cn.id)), cn.subtotal), vatAmount: cn.vatAmount, total: cn.total }),
    });
  }
  // goods kept by the customer stay a cost; goods coming back are stock again until a corrected invoice is issued
  if (!cn.goodsBack) return;
  // part of a sale: the cost that was typed on the note
  if (cn.goodsCost != null) {
    if (cn.goodsCost > 0 && !(await liveEntry(tx, orgId, "credit_note", cn.id, "goods_back"))) {
      await postEntry(tx, { orgId, date: cn.issueDate, sourceType: "credit_note", sourceId: cn.id, purpose: "goods_back", memo: `Goods back on credit note ${cn.number}`, createdBy: userId, lines: goodsBackLines({ amount: cn.goodsCost, number: cn.number, orderId: inv.orderId, dealId: inv.dealId }) });
    }
    return;
  }
  const e = schema.journalEntries;
  const rev = alias(schema.journalEntries, "rev");
  const cogs = await tx
    .select({ id: e.id })
    .from(e)
    .leftJoin(rev, eq(rev.reversalOfId, e.id))
    .where(and(eq(e.organizationId, orgId), inArray(e.sourceType, ["bill", "expense"]), eq(e.purpose, `cogs:${inv.id}`), isNull(rev.id)));
  for (const c of cogs) await reverseEntry(tx, { orgId, entryId: c.id, reason: `invoice ${inv.number} cancelled (${cn.number})`, date: cn.issueDate, createdBy: userId });
}

/**
 * Money received from a customer: what it paid on its day, and the rest as an advance. Set against an invoice on a later
 * day, an advance has its own entry (postAllocationDoc).
 */
export async function postReceiptDoc(tx: Tx, orgId: number, paymentId: number, userId: number | null): Promise<void> {
  const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  if (!p) throw new UserError("That payment no longer exists.");
  if (!posts(await ledgerStart(tx, orgId), p.paidOn) || (await liveEntry(tx, orgId, "receipt", p.id))) return;
  const a = schema.paymentAllocations;
  const allocations = await tx
    .select({ amount: a.amount, invoiceNumber: schema.invoices.number, orderId: schema.invoices.orderId, dealId: schema.invoices.dealId })
    .from(a)
    .innerJoin(schema.invoices, eq(schema.invoices.id, a.invoiceId))
    .where(and(eq(a.paymentId, p.id), isNull(a.voidedAt), eq(a.appliedOn, p.paidOn)))
    .orderBy(asc(a.id));
  const acc = await paymentAccount(tx, orgId, p.bankAccountId, p.method);
  await postEntry(tx, {
    orgId,
    date: p.paidOn,
    sourceType: "receipt",
    sourceId: p.id,
    memo: allocations.length ? `Payment ${p.number} received for ${allocations.map((x) => x.invoiceNumber).join(", ")}` : `Advance ${p.number} received`,
    createdBy: userId,
    lines: receiptLines({ bankLedgerAccountId: acc.ledgerAccountId, amount: p.amount, companyId: p.companyId, number: p.number, allocations }),
  });
}

/** An advance set against an invoice after the receipt was saved. */
export async function postAllocationDoc(tx: Tx, orgId: number, allocationId: number, userId: number | null): Promise<void> {
  const a = schema.paymentAllocations;
  const [row] = await tx
    .select({ a, paymentNumber: schema.payments.number, companyId: schema.payments.companyId, invoiceNumber: schema.invoices.number, orderId: schema.invoices.orderId, dealId: schema.invoices.dealId })
    .from(a)
    .innerJoin(schema.payments, eq(schema.payments.id, a.paymentId))
    .innerJoin(schema.invoices, eq(schema.invoices.id, a.invoiceId))
    .where(eq(a.id, allocationId));
  if (!row) throw new UserError("That payment no longer exists.");
  if (!posts(await ledgerStart(tx, orgId), row.a.appliedOn) || (await liveEntry(tx, orgId, "payment_allocation", allocationId))) return;
  await postEntry(tx, {
    orgId,
    date: row.a.appliedOn,
    sourceType: "payment_allocation",
    sourceId: allocationId,
    memo: `Advance ${row.paymentNumber} applied to ${row.invoiceNumber}`,
    createdBy: userId,
    lines: advanceAppliedLines({ amount: row.a.amount, companyId: row.companyId, paymentNumber: row.paymentNumber, invoiceNumber: row.invoiceNumber, orderId: row.orderId, dealId: row.dealId }),
  });
}

/**
 * Takes a receipt's money off an invoice, which then owes it again; the money stays with us as an advance. An advance
 * applied later just has its own entry reversed. Money that came in with the receipt itself needs an entry of its own.
 */
export async function postAllocationRemoved(tx: Tx, orgId: number, allocationId: number, reason: string, userId: number | null, date?: string): Promise<void> {
  const a = schema.paymentAllocations;
  const [row] = await tx
    .select({ a, paymentNumber: schema.payments.number, paymentId: schema.payments.id, companyId: schema.payments.companyId, invoiceNumber: schema.invoices.number, orderId: schema.invoices.orderId, dealId: schema.invoices.dealId })
    .from(a)
    .innerJoin(schema.payments, eq(schema.payments.id, a.paymentId))
    .innerJoin(schema.invoices, eq(schema.invoices.id, a.invoiceId))
    .where(eq(a.id, allocationId));
  if (!row) throw new UserError("That payment no longer exists.");
  const own = await liveEntry(tx, orgId, "payment_allocation", allocationId);
  if (own && !own.reversedBy) return reverseDocument(tx, orgId, "payment_allocation", allocationId, reason, userId);
  if (!(await liveEntry(tx, orgId, "receipt", row.paymentId))) return;
  await postEntry(tx, {
    orgId,
    date: await firstOpenDay(tx, orgId, date ?? row.a.appliedOn),
    sourceType: "payment_allocation",
    sourceId: allocationId,
    purpose: "remove",
    memo: `${row.paymentNumber} taken off ${row.invoiceNumber}: ${reason}`,
    createdBy: userId,
    lines: advanceReturnedLines({ amount: row.a.amount, companyId: row.companyId, paymentNumber: row.paymentNumber, invoiceNumber: row.invoiceNumber, orderId: row.orderId, dealId: row.dealId }),
  });
}

/** An advance handed back, to a customer or by a supplier. Before the cut-over it is part of the opening balances. */
export async function postRefundDoc(tx: Tx, orgId: number, refundId: number, userId: number | null): Promise<void> {
  const [r] = await tx.select().from(schema.advanceRefunds).where(eq(schema.advanceRefunds.id, refundId));
  if (!r) throw new UserError("That refund no longer exists.");
  if (!posts(await ledgerStart(tx, orgId), r.refundedOn) || (await liveEntry(tx, orgId, "advance_refund", r.id))) return;
  const acc = await paymentAccount(tx, orgId, r.bankAccountId, r.method);
  const base = { orgId, date: r.refundedOn, sourceType: "advance_refund", sourceId: r.id, createdBy: userId };
  if (r.party === "customer") {
    const [p] = await tx.select({ number: schema.payments.number, companyId: schema.payments.companyId }).from(schema.payments).where(eq(schema.payments.id, r.paymentId as number));
    await postEntry(tx, { ...base, memo: `Refund ${r.number} of advance ${p.number}`, lines: customerRefundLines({ amount: r.amount, companyId: p.companyId, bankLedgerAccountId: acc.ledgerAccountId, number: r.number, paymentNumber: p.number }) });
    return;
  }
  const [p] = await tx.select({ number: schema.supplierPayments.number, supplierId: schema.supplierPayments.supplierId }).from(schema.supplierPayments).where(eq(schema.supplierPayments.id, r.supplierPaymentId as number));
  await postEntry(tx, { ...base, memo: `Refund ${r.number} of advance ${p.number}`, lines: supplierRefundLines({ amount: r.amount, supplierId: p.supplierId, bankLedgerAccountId: acc.ledgerAccountId, number: r.number, paymentNumber: p.number }) });
}

/** Voiding a receipt undoes all of it: its own entry, advances applied later and money taken off invoices. */
export async function reversePayment(tx: Tx, orgId: number, paymentId: number, reason: string, userId: number | null): Promise<void> {
  await reverseDocument(tx, orgId, "receipt", paymentId, reason, userId);
  const rows = await tx.select({ id: schema.paymentAllocations.id }).from(schema.paymentAllocations).where(eq(schema.paymentAllocations.paymentId, paymentId));
  for (const r of rows) await reverseDocument(tx, orgId, "payment_allocation", r.id, reason, userId);
}

/** A document's lines as what the ledger needs per VAT code. */
function billParts(lines: { qty: number; unitCost: number; taxCode: string }[], subtotal: number) {
  return fitToSubtotal(docTax(lines.map((l) => ({ net: lineCost(l), code: l.taxCode }))).parts.filter((p) => p.net > 0), subtotal);
}

/** What one bill or expense still has in Inventory. */
async function inStockOf(tx: Tx, orgId: number, sourceType: string, sourceId: number): Promise<number> {
  const e = schema.journalEntries;
  const l = schema.journalLines;
  const rev = alias(schema.journalEntries, "rev");
  const [{ inStock }] = await tx
    .select({ inStock: sql<number>`coalesce(sum(${l.debit} - ${l.credit}), 0)::float` })
    .from(l)
    .innerJoin(e, eq(e.id, l.entryId))
    .innerJoin(schema.ledgerAccounts, eq(schema.ledgerAccounts.id, l.accountId))
    .leftJoin(rev, eq(rev.reversalOfId, e.id))
    .where(and(eq(e.organizationId, orgId), eq(e.sourceType, sourceType), eq(e.sourceId, sourceId), isNull(e.reversalOfId), isNull(rev.id), eq(schema.ledgerAccounts.systemKey, "inventory")));
  return Math.round(inStock * 100) / 100;
}

/**
 * A debit note, posted under its bill (purpose debit:<id>): what it takes out of Inventory then counts against that bill
 * when its goods later move to cost of goods sold.
 */
export async function postDebitNoteDoc(tx: Tx, orgId: number, debitNoteId: number, userId: number | null): Promise<void> {
  const [d] = await tx.select().from(schema.debitNotes).where(eq(schema.debitNotes.id, debitNoteId));
  if (!d) throw new UserError("That debit note no longer exists.");
  const [b] = await tx.select().from(schema.bills).where(eq(schema.bills.id, d.billId));
  if (!b || !posts(await ledgerStart(tx, orgId), d.issueDate)) return;
  const purpose = `debit:${d.id}`;
  if (await liveEntry(tx, orgId, "bill", b.id, purpose)) return;
  const items = await tx.select().from(schema.debitNoteItems).where(eq(schema.debitNoteItems.debitNoteId, d.id));
  await postEntry(tx, {
    orgId,
    date: d.issueDate,
    sourceType: "bill",
    sourceId: b.id,
    purpose,
    memo: `Debit note ${d.number} for bill ${b.number}`,
    createdBy: userId,
    lines: debitNoteLines({
      number: d.number,
      billNumber: b.number,
      supplierId: b.supplierId,
      category: b.category,
      orderId: b.orderId,
      dealId: b.dealId,
      parts: billParts(items, d.subtotal),
      vatAmount: d.vatAmount,
      total: d.total,
      inStock: await inStockOf(tx, orgId, "bill", b.id),
    }),
  });
}

/** A supplier bill (or an expense paid on the spot). Opening bills came in with the Zoho balances. */
export async function postBillDoc(tx: Tx, orgId: number, billId: number, userId: number | null): Promise<void> {
  const [b] = await tx.select().from(schema.bills).where(eq(schema.bills.id, billId));
  if (!b) throw new UserError("That bill no longer exists.");
  if (b.kind === "opening" || !posts(await ledgerStart(tx, orgId), b.billDate)) return;
  const sourceType = b.kind === "expense" ? "expense" : "bill";
  if (await liveEntry(tx, orgId, sourceType, b.id)) return;
  const facts = {
    number: b.number,
    supplierId: b.supplierId,
    category: b.category,
    orderId: b.orderId,
    dealId: b.dealId,
    parts: billParts(await tx.select().from(schema.billItems).where(eq(schema.billItems.billId, b.id)), b.subtotal),
    vatAmount: b.vatAmount,
    total: b.total,
  };
  const who = b.supplierId ? ((await tx.select({ name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.id, b.supplierId)))[0]?.name ?? "") : b.paidTo;
  if (b.kind === "expense") {
    const [voucher] = await tx
      .select({ bankAccountId: schema.supplierPayments.bankAccountId, method: schema.supplierPayments.method })
      .from(schema.supplierPaymentAllocations)
      .innerJoin(schema.supplierPayments, eq(schema.supplierPayments.id, schema.supplierPaymentAllocations.paymentId))
      .where(eq(schema.supplierPaymentAllocations.billId, b.id))
      .limit(1);
    const acc = await paymentAccount(tx, orgId, voucher?.bankAccountId ?? null, voucher?.method ?? "cash");
    await postEntry(tx, { orgId, date: b.billDate, sourceType, sourceId: b.id, memo: `Expense ${b.number} paid to ${who}`, createdBy: userId, lines: expenseLines({ ...facts, bankLedgerAccountId: acc.ledgerAccountId }) });
    await postLateGoods(tx, orgId, b, userId);
    return;
  }
  await postEntry(tx, { orgId, date: b.billDate, sourceType, sourceId: b.id, memo: `Bill ${b.number} from ${who}${b.supplierRef ? ` (${b.supplierRef})` : ""}`, createdBy: userId, lines: billLines(facts) });
  await postLateGoods(tx, orgId, b, userId);
}

/**
 * Paying a supplier: what it paid on its day, and the rest as an advance. An expense's own voucher is part of the
 * expense's entry, so it posts nothing here.
 */
export async function postSupplierPaymentDoc(tx: Tx, orgId: number, paymentId: number, userId: number | null): Promise<void> {
  const [p] = await tx.select().from(schema.supplierPayments).where(eq(schema.supplierPayments.id, paymentId));
  if (!p) throw new UserError("That payment no longer exists.");
  if (!posts(await ledgerStart(tx, orgId), p.paidOn) || (await liveEntry(tx, orgId, "supplier_payment", p.id))) return;
  const a = schema.supplierPaymentAllocations;
  const all = await tx
    .select({ amount: a.amount, billNumber: schema.bills.number, billKind: schema.bills.kind, appliedOn: a.appliedOn, voidedAt: a.voidedAt })
    .from(a)
    .innerJoin(schema.bills, eq(schema.bills.id, a.billId))
    .where(eq(a.paymentId, p.id))
    .orderBy(asc(a.id));
  if (all.some((x) => x.billKind === "expense")) return;
  const allocations = all.filter((x) => !x.voidedAt && x.appliedOn === p.paidOn);
  const acc = await paymentAccount(tx, orgId, p.bankAccountId, p.method);
  await postEntry(tx, {
    orgId,
    date: p.paidOn,
    sourceType: "supplier_payment",
    sourceId: p.id,
    memo: allocations.length ? `Payment ${p.number} for ${allocations.map((x) => x.billNumber).join(", ")}` : `Advance ${p.number} paid`,
    createdBy: userId,
    lines: supplierPaymentLines({ bankLedgerAccountId: acc.ledgerAccountId, amount: p.amount, supplierId: p.supplierId, number: p.number, allocations }),
  });
}

/** An advance to a supplier set against a bill after the voucher was saved. */
export async function postSupplierAllocationDoc(tx: Tx, orgId: number, allocationId: number, userId: number | null): Promise<void> {
  const a = schema.supplierPaymentAllocations;
  const [row] = await tx
    .select({ a, paymentNumber: schema.supplierPayments.number, supplierId: schema.supplierPayments.supplierId, billNumber: schema.bills.number })
    .from(a)
    .innerJoin(schema.supplierPayments, eq(schema.supplierPayments.id, a.paymentId))
    .innerJoin(schema.bills, eq(schema.bills.id, a.billId))
    .where(eq(a.id, allocationId));
  if (!row) throw new UserError("That payment no longer exists.");
  if (!posts(await ledgerStart(tx, orgId), row.a.appliedOn) || (await liveEntry(tx, orgId, "supplier_allocation", allocationId))) return;
  await postEntry(tx, {
    orgId,
    date: row.a.appliedOn,
    sourceType: "supplier_allocation",
    sourceId: allocationId,
    memo: `Advance ${row.paymentNumber} applied to ${row.billNumber}`,
    createdBy: userId,
    lines: supplierAdvanceAppliedLines({ amount: row.a.amount, supplierId: row.supplierId, paymentNumber: row.paymentNumber, billNumber: row.billNumber }),
  });
}

/** Takes a voucher's money off a bill, which is owed again; the supplier holds the money as an advance. */
export async function postSupplierAllocationRemoved(tx: Tx, orgId: number, allocationId: number, reason: string, userId: number | null, date?: string): Promise<void> {
  const a = schema.supplierPaymentAllocations;
  const [row] = await tx
    .select({ a, paymentNumber: schema.supplierPayments.number, paymentId: schema.supplierPayments.id, supplierId: schema.supplierPayments.supplierId, billNumber: schema.bills.number })
    .from(a)
    .innerJoin(schema.supplierPayments, eq(schema.supplierPayments.id, a.paymentId))
    .innerJoin(schema.bills, eq(schema.bills.id, a.billId))
    .where(eq(a.id, allocationId));
  if (!row) throw new UserError("That payment no longer exists.");
  const own = await liveEntry(tx, orgId, "supplier_allocation", allocationId);
  if (own && !own.reversedBy) return reverseDocument(tx, orgId, "supplier_allocation", allocationId, reason, userId);
  if (!(await liveEntry(tx, orgId, "supplier_payment", row.paymentId))) return;
  await postEntry(tx, {
    orgId,
    date: await firstOpenDay(tx, orgId, date ?? row.a.appliedOn),
    sourceType: "supplier_allocation",
    sourceId: allocationId,
    purpose: "remove",
    memo: `${row.paymentNumber} taken off ${row.billNumber}: ${reason}`,
    createdBy: userId,
    lines: supplierAdvanceReturnedLines({ amount: row.a.amount, supplierId: row.supplierId, paymentNumber: row.paymentNumber, billNumber: row.billNumber }),
  });
}

/** Voiding a voucher undoes all of it: its own entry, advances applied later and money taken off bills. */
export async function reverseSupplierPayment(tx: Tx, orgId: number, paymentId: number, reason: string, userId: number | null): Promise<void> {
  await reverseDocument(tx, orgId, "supplier_payment", paymentId, reason, userId);
  const rows = await tx.select({ id: schema.supplierPaymentAllocations.id }).from(schema.supplierPaymentAllocations).where(eq(schema.supplierPaymentAllocations.paymentId, paymentId));
  for (const r of rows) await reverseDocument(tx, orgId, "supplier_allocation", r.id, reason, userId);
}

/**
 * Undoes what a voided document posted (its entry, and for a goods bill any cost already moved to cost of goods
 * sold). A document from before the cut-over has nothing in the ledger, so nothing happens.
 */
export async function reverseDocument(tx: Tx, orgId: number, sourceType: string, sourceId: number, reason: string, userId: number | null): Promise<void> {
  const e = schema.journalEntries;
  const rev = alias(schema.journalEntries, "rev");
  const live = await tx
    .select({ id: e.id })
    .from(e)
    .leftJoin(rev, eq(rev.reversalOfId, e.id))
    .where(and(eq(e.organizationId, orgId), eq(e.sourceType, sourceType), eq(e.sourceId, sourceId), isNull(e.reversalOfId), isNull(rev.id), sql`(${e.purpose} IN ('post', 'remove') OR ${e.purpose} LIKE 'cogs:%')`))
    .orderBy(sql`${e.purpose} = 'post'`, asc(e.id)); // cost moves first, then the document itself
  for (const r of live) await reverseEntry(tx, { orgId, entryId: r.id, reason, createdBy: userId });
}

export interface BackfillResult {
  posted: number;
  byType: Record<string, number>;
  start: string;
}

/**
 * Posts every document dated on or after the cut-over that is not in the ledger yet, oldest first (bills before the
 * invoices of the same day, so goods are in stock when they are sold). Voided payments and bills are left out: posted
 * and reversed they would add nothing. With `dryRun` it works everything out and rolls it back, to show what would post.
 */
export async function postExistingDocuments(tx: Tx, orgId: number, userId: number | null, dryRun = false): Promise<BackfillResult> {
  const start = await ledgerStart(tx, orgId);
  if (!start) throw new UserError("Set the cut-over date first.");
  const work = async (t: Tx): Promise<BackfillResult> => {
    type Job = { date: string; order: number; id: number; type: string; run: () => Promise<void> };
    const jobs: Job[] = [];
    const before = async () => Number((await t.execute<{ n: number }>(sql`SELECT count(*)::int n FROM journal_entries WHERE organization_id = ${orgId}`)).rows[0].n);

    for (const b of await t
      .select({ id: schema.bills.id, date: schema.bills.billDate, kind: schema.bills.kind })
      .from(schema.bills)
      .where(and(gte(schema.bills.billDate, start), ne(schema.bills.status, "void"), inArray(schema.bills.kind, ["bill", "expense"]))))
      jobs.push({ date: b.date, order: 1, id: b.id, type: b.kind, run: () => postBillDoc(t, orgId, b.id, userId) });
    for (const i of await t.select({ id: schema.invoices.id, date: schema.invoices.issueDate }).from(schema.invoices).where(and(eq(schema.invoices.kind, "sale"), gte(schema.invoices.issueDate, start))))
      jobs.push({ date: i.date, order: 2, id: i.id, type: "invoice", run: () => postInvoiceDoc(t, orgId, i.id, userId) });
    for (const c of await t.select({ id: schema.creditNotes.id, date: schema.creditNotes.issueDate }).from(schema.creditNotes).where(gte(schema.creditNotes.issueDate, start)))
      jobs.push({ date: c.date, order: 3, id: c.id, type: "credit_note", run: () => postCreditNoteDoc(t, orgId, c.id, userId) });
    for (const d of await t.select({ id: schema.debitNotes.id, date: schema.debitNotes.issueDate }).from(schema.debitNotes).where(gte(schema.debitNotes.issueDate, start)))
      jobs.push({ date: d.date, order: 3, id: d.id, type: "debit_note", run: () => postDebitNoteDoc(t, orgId, d.id, userId) });
    for (const p of await t.select({ id: schema.payments.id, date: schema.payments.paidOn }).from(schema.payments).where(and(gte(schema.payments.paidOn, start), isNull(schema.payments.voidedAt))))
      jobs.push({ date: p.date, order: 4, id: p.id, type: "receipt", run: () => postReceiptDoc(t, orgId, p.id, userId) });
    for (const p of await t
      .select({ id: schema.supplierPayments.id, date: schema.supplierPayments.paidOn })
      .from(schema.supplierPayments)
      .where(and(gte(schema.supplierPayments.paidOn, start), isNull(schema.supplierPayments.voidedAt))))
      jobs.push({ date: p.date, order: 5, id: p.id, type: "supplier_payment", run: () => postSupplierPaymentDoc(t, orgId, p.id, userId) });
    // advances applied on a later day than the money came in; on the same day they are part of the receipt's entry
    for (const a of (await t.execute<{ id: number; date: string }>(sql`SELECT a.id, a.applied_on::text AS date FROM payment_allocations a JOIN payments p ON p.id = a.payment_id WHERE a.voided_at IS NULL AND a.applied_on >= ${start} AND a.applied_on > p.paid_on`)).rows)
      jobs.push({ date: a.date, order: 6, id: Number(a.id), type: "advance_applied", run: () => postAllocationDoc(t, orgId, Number(a.id), userId) });
    for (const a of (await t.execute<{ id: number; date: string }>(sql`SELECT a.id, a.applied_on::text AS date FROM supplier_payment_allocations a JOIN supplier_payments p ON p.id = a.payment_id WHERE a.voided_at IS NULL AND a.applied_on >= ${start} AND a.applied_on > p.paid_on`)).rows)
      jobs.push({ date: a.date, order: 7, id: Number(a.id), type: "supplier_advance_applied", run: () => postSupplierAllocationDoc(t, orgId, Number(a.id), userId) });

    for (const r of await t.select({ id: schema.advanceRefunds.id, date: schema.advanceRefunds.refundedOn }).from(schema.advanceRefunds).where(and(gte(schema.advanceRefunds.refundedOn, start), isNull(schema.advanceRefunds.voidedAt))))
      jobs.push({ date: r.date, order: 8, id: r.id, type: "advance_refund", run: () => postRefundDoc(t, orgId, r.id, userId) });

    jobs.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.id - b.id);
    const byType: Record<string, number> = {};
    let posted = 0;
    for (const j of jobs) {
      const n0 = await before();
      await j.run();
      const added = (await before()) - n0;
      if (added > 0) {
        posted += added;
        byType[j.type] = (byType[j.type] ?? 0) + added;
      }
    }
    return { posted, byType, start };
  };
  if (!dryRun) return work(tx);
  // a savepoint: do it all, remember what happened, undo it
  let result: BackfillResult | null = null;
  await tx
    .transaction(async (sp) => {
      result = await work(sp);
      throw new DryRunDone();
    })
    .catch((e) => {
      if (!(e instanceof DryRunDone)) throw e;
    });
  return result as unknown as BackfillResult;
}

class DryRunDone extends Error {}

/** For document pages: the journal entries a document posted (number, date, and whether reversed). */
export async function documentEntries(tx: Tx, orgId: number, refs: { sourceType: string; sourceId: number }[]) {
  if (!refs.length) return [];
  const e = schema.journalEntries;
  const rev = alias(schema.journalEntries, "rev");
  return tx
    .select({ id: e.id, number: e.number, date: e.date, purpose: e.purpose, total: e.total, reversedBy: rev.number, isReversal: sql<boolean>`${e.reversalOfId} IS NOT NULL` })
    .from(e)
    .leftJoin(rev, eq(rev.reversalOfId, e.id))
    .where(and(eq(e.organizationId, orgId), sql`(${e.sourceType}, ${e.sourceId}) IN (${sql.join(refs.map((r) => sql`(${r.sourceType}, ${r.sourceId})`), sql`, `)})`))
    .orderBy(asc(e.id));
}

