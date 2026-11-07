import "server-only";
import { and, asc, desc, eq, isNull, like } from "drizzle-orm";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { nextSeq } from "@/lib/doc-numbers";
import { yearNumber } from "@/lib/invoicing";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { lineCost } from "@/lib/purchases";
import { lineTotal, money, round2 } from "@/lib/quotation";
import { noteVat } from "@/lib/tax/doc-tax";
import type { Tx } from "@/lib/tx";
import { UserError } from "@/lib/user-error";
import { postAllocationDoc, postAllocationRemoved, postCreditNoteDoc, postDebitNoteDoc, postSupplierAllocationDoc, postSupplierAllocationRemoved, soldCostOf } from "./documents";

/**
 * Credit notes (customer) and debit notes (supplier): all or part of a document given back, line by line. A note never
 * changes the document: it has its own number, date and entry, and the document remembers how much has been credited.
 */

export interface NoteLineInput {
  /** The document's line. */
  itemId: number;
  qty: number;
  /** Per unit, before VAT: the line's own price, or less for a price reduction. */
  unitPrice: number;
}

type Invoice = typeof schema.invoices.$inferSelect;
type Bill = typeof schema.bills.$inferSelect;

export const collectTitle = (number: string) => `Collect payment: ${number}`;

/** What is left of each line after earlier notes, keyed by the document's line id. */
function leftPerLine(items: readonly { id: number; net: number }[], credited: readonly { itemId: number | null; net: number }[]) {
  const left = new Map(items.map((i) => [i.id, toMinor(i.net)]));
  for (const c of credited) if (c.itemId != null && left.has(c.itemId)) left.set(c.itemId, (left.get(c.itemId) as number) - toMinor(c.net));
  return left;
}

/** Every line that still has value, at what is left of it: what a note cancelling the rest of a document gives back. */
const wholeRest = (items: readonly { id: number; qty: number; unitPrice: number; net: number }[], left: Map<number, number>): NoteLineInput[] =>
  items
    .map((i) => ({ i, rest: left.get(i.id) ?? 0 }))
    .filter((x) => x.rest > 0)
    .map(({ i, rest }) => (rest === toMinor(i.net) ? { itemId: i.id, qty: i.qty, unitPrice: i.unitPrice } : { itemId: i.id, qty: 1, unitPrice: fromMinor(rest) }));

export interface CreditNoteResult {
  id: number;
  number: string;
  subtotal: number;
  vat: number;
  total: number;
  /** It reached the invoice's whole value: the invoice is cancelled. */
  cleared: boolean;
  /** Money already paid that no longer has an invoice to pay: it is now an advance. */
  toAdvance: number;
}

/**
 * Writes a credit note and posts it. `lines` null gives back everything still left on the invoice. What was already paid
 * beyond the new value of the invoice comes off it and stays with the customer as an advance.
 */
export async function writeCreditNote(tx: Tx, orgId: number, userId: number, inv: Invoice, d: { date: string; eventDate?: string; reason: string; goodsBack: boolean; goodsCost?: number | null; lines: NoteLineInput[] | null }): Promise<CreditNoteResult> {
  const items = (await tx.select().from(schema.invoiceItems).where(eq(schema.invoiceItems.invoiceId, inv.id)).orderBy(asc(schema.invoiceItems.position), asc(schema.invoiceItems.id))).map((i) => ({ ...i, net: lineTotal(i) }));
  const n = schema.creditNotes;
  const earlier = await tx.select({ id: n.id, vat: n.vatAmount }).from(n).where(eq(n.invoiceId, inv.id));
  const cItems = schema.creditNoteItems;
  const credited = (await tx.select({ itemId: cItems.invoiceItemId, qty: cItems.qty, unitPrice: cItems.unitPrice, code: cItems.taxCode }).from(cItems).innerJoin(n, eq(n.id, cItems.creditNoteId)).where(eq(n.invoiceId, inv.id))).map((c) => ({ ...c, net: lineTotal(c) }));
  const left = leftPerLine(items, credited);
  const wanted = (d.lines ?? wholeRest(items, left)).filter((l) => l.qty > 0 && l.unitPrice > 0);
  if (!wanted.length) throw new UserError("Pick at least one line with a quantity and a price.");

  const lines = wanted.map((w) => {
    const item = items.find((i) => i.id === w.itemId);
    if (!item) throw new UserError("That line is not on this invoice.");
    const net = lineTotal({ qty: w.qty, unitPrice: w.unitPrice });
    if (toMinor(net) > (left.get(item.id) ?? 0)) throw new UserError(`"${item.description}" has ${money(fromMinor(left.get(item.id) ?? 0))} left to credit, less than the ${money(net)} on this note.`);
    left.set(item.id, (left.get(item.id) ?? 0) - toMinor(net));
    return { item, qty: w.qty, unitPrice: round2(w.unitPrice), net };
  });

  const cleared = [...left.values()].every((v) => v <= 0);
  const standardItems = items.filter((i) => i.taxCode === "SR");
  const remainingStandard = fromMinor(sumMinor(standardItems.map((i) => toMinor(i.net))) - sumMinor(credited.filter((c) => c.code === "SR").map((c) => toMinor(c.net))));
  const vatLeft = round2(inv.vatAmount - earlier.reduce((s, e) => s + e.vat, 0));
  const vat = cleared ? vatLeft : noteVat(lines.map((l) => ({ net: l.net, code: l.item.taxCode })), { standardNet: remainingStandard, vat: vatLeft });
  // clearing the invoice gives back exactly its own totals, whatever old lines add up to
  const subtotal = cleared ? round2(inv.subtotal - inv.creditedNet) : fromMinor(sumMinor(lines.map((l) => toMinor(l.net))));
  const total = round2(subtotal + vat);

  if (d.goodsCost != null) {
    const sold = await soldCostOf(tx, orgId, inv.id);
    if (d.goodsBack && round2(d.goodsCost) > sold) throw new UserError(`Only ${money(sold)} of this sale's cost is in cost of goods sold, less than the ${money(d.goodsCost)} entered as coming back.`);
  }

  const year = Number(d.date.slice(0, 4));
  const seq = await nextSeq(tx, "credit", n, n.year, n.seq, year);
  const number = yearNumber("ZCN", year, seq);
  // a note cancelling a whole untouched invoice sends every cost back; otherwise only what is said to be coming back
  const goodsCost = d.goodsBack ? (d.goodsCost != null ? round2(d.goodsCost) : cleared && !earlier.length ? null : await soldCostOf(tx, orgId, inv.id)) : null;
  const [cn] = await tx.insert(n).values({ year, seq, number, invoiceId: inv.id, issueDate: d.date, eventDate: d.eventDate ?? d.date, reason: d.reason, subtotal, vatAmount: vat, total, goodsBack: d.goodsBack, goodsCost, createdBy: userId }).returning({ id: n.id });
  await tx.insert(cItems).values(lines.map((l, position) => ({ organizationId: orgId, creditNoteId: cn.id, invoiceItemId: l.item.id, position, description: l.item.description, qty: l.qty, unitPrice: l.unitPrice, lineKind: l.item.lineKind, taxCode: l.item.taxCode })));
  await tx
    .update(schema.invoices)
    .set({ creditedNet: round2(inv.creditedNet + subtotal), creditedTotal: round2(inv.creditedTotal + total), ...(cleared ? { status: "cancelled" } : {}) })
    .where(eq(schema.invoices.id, inv.id));
  await postCreditNoteDoc(tx, orgId, cn.id, userId);

  const toAdvance = await releaseCustomerMoney(tx, orgId, userId, inv, round2(inv.total - inv.creditedTotal - total), d.date, number);

  if (cleared) {
    if (inv.orderId) await tx.update(schema.salesOrders).set({ status: "delivered" }).where(eq(schema.salesOrders.id, inv.orderId));
    await tx.delete(schema.tasks).where(and(eq(schema.tasks.status, "open"), like(schema.tasks.title, `${collectTitle(inv.number)}%`)));
  } else if (round2(inv.total - inv.creditedTotal - total) <= (await paidOn(tx, inv.id))) {
    await tx.update(schema.tasks).set({ status: "done", doneAt: new Date() }).where(and(eq(schema.tasks.status, "open"), like(schema.tasks.title, `${collectTitle(inv.number)}%`)));
  }
  return { id: cn.id, number, subtotal, vat, total, cleared, toAdvance };
}

async function paidOn(tx: Tx, invoiceId: number) {
  const a = schema.paymentAllocations;
  const rows = await tx.select({ amount: a.amount }).from(a).where(and(eq(a.invoiceId, invoiceId), isNull(a.voidedAt)));
  return fromMinor(sumMinor(rows.map((r) => toMinor(r.amount))));
}

/** Takes money off an invoice, newest payment first, until no more than `newValue` is set against it. */
async function releaseCustomerMoney(tx: Tx, orgId: number, userId: number, inv: Invoice, newValue: number, date: string, noteNumber: string): Promise<number> {
  const a = schema.paymentAllocations;
  const rows = await tx.select().from(a).where(and(eq(a.invoiceId, inv.id), isNull(a.voidedAt))).orderBy(desc(a.appliedOn), desc(a.id)).for("update");
  let excess = sumMinor(rows.map((r) => toMinor(r.amount))) - toMinor(newValue);
  if (excess <= 0) return 0;
  const released = excess;
  for (const r of rows) {
    if (excess <= 0) break;
    const amount = toMinor(r.amount);
    const take = Math.min(amount, excess);
    excess -= take;
    await tx.update(a).set({ voidedAt: new Date() }).where(eq(a.id, r.id));
    await postAllocationRemoved(tx, orgId, r.id, `${noteNumber} gave back part of ${inv.number}`, userId, date);
    if (take < amount) {
      const [again] = await tx.insert(a).values({ paymentId: r.paymentId, invoiceId: inv.id, amount: fromMinor(amount - take), appliedOn: date, createdBy: userId }).returning({ id: a.id });
      await postAllocationDoc(tx, orgId, again.id, userId);
    }
  }
  await audit(tx, { userId, action: "payment.unapply", entity: "invoice", entityId: inv.id, summary: `${money(fromMinor(released))} already paid on ${inv.number} is now an advance (${noteNumber})`, after: { noteNumber, amount: fromMinor(released) } });
  return fromMinor(released);
}

export interface DebitNoteResult {
  id: number;
  number: string;
  subtotal: number;
  vat: number;
  total: number;
  toAdvance: number;
}

/** Writes a supplier debit note and posts it. What was already paid beyond the new value of the bill becomes an advance with the supplier. */
export async function writeDebitNote(tx: Tx, orgId: number, userId: number, b: Bill, d: { date: string; reason: string; supplierRef: string; lines: NoteLineInput[] }): Promise<DebitNoteResult> {
  const items = (await tx.select().from(schema.billItems).where(eq(schema.billItems.billId, b.id)).orderBy(asc(schema.billItems.position), asc(schema.billItems.id))).map((i) => ({ ...i, net: lineCost(i) }));
  const n = schema.debitNotes;
  const cItems = schema.debitNoteItems;
  const earlier = await tx.select({ vat: n.vatAmount }).from(n).where(eq(n.billId, b.id));
  const credited = (await tx.select({ itemId: cItems.billItemId, qty: cItems.qty, unitCost: cItems.unitCost, code: cItems.taxCode }).from(cItems).innerJoin(n, eq(n.id, cItems.debitNoteId)).where(eq(n.billId, b.id))).map((c) => ({ ...c, net: lineCost(c) }));
  const left = leftPerLine(items, credited);
  const wanted = d.lines.filter((l) => l.qty > 0 && l.unitPrice > 0);
  if (!wanted.length) throw new UserError("Pick at least one line with a quantity and a price.");
  const lines = wanted.map((w) => {
    const item = items.find((i) => i.id === w.itemId);
    if (!item) throw new UserError("That line is not on this bill.");
    const net = lineCost({ qty: w.qty, unitCost: w.unitPrice });
    if (toMinor(net) > (left.get(item.id) ?? 0)) throw new UserError(`"${item.description}" has ${money(fromMinor(left.get(item.id) ?? 0))} left to take back, less than the ${money(net)} on this note.`);
    left.set(item.id, (left.get(item.id) ?? 0) - toMinor(net));
    return { item, qty: w.qty, unitCost: round2(w.unitPrice), net };
  });
  const cleared = [...left.values()].every((v) => v <= 0);
  const vatLeft = round2(b.vatAmount - earlier.reduce((s, e) => s + e.vat, 0));
  const remainingStandard = fromMinor(sumMinor(items.filter((i) => i.taxCode === "SR").map((i) => toMinor(i.net))) - sumMinor(credited.filter((c) => c.code === "SR").map((c) => toMinor(c.net))));
  const vat = cleared ? vatLeft : noteVat(lines.map((l) => ({ net: l.net, code: l.item.taxCode })), { standardNet: remainingStandard, vat: vatLeft });
  const subtotal = cleared ? round2(b.subtotal - b.creditedNet) : fromMinor(sumMinor(lines.map((l) => toMinor(l.net))));
  const total = round2(subtotal + vat);

  const year = Number(d.date.slice(0, 4));
  const seq = await nextSeq(tx, "debit", n, n.year, n.seq, year);
  const number = yearNumber("ZDB", year, seq);
  const [dn] = await tx.insert(n).values({ organizationId: orgId, year, seq, number, billId: b.id, issueDate: d.date, reason: d.reason, supplierRef: d.supplierRef, subtotal, vatAmount: vat, total, createdBy: userId }).returning({ id: n.id });
  await tx.insert(cItems).values(lines.map((l, position) => ({ organizationId: orgId, debitNoteId: dn.id, billItemId: l.item.id, position, description: l.item.description, qty: l.qty, unitCost: l.unitCost, taxCode: l.item.taxCode })));
  await tx.update(schema.bills).set({ creditedNet: round2(b.creditedNet + subtotal), creditedTotal: round2(b.creditedTotal + total) }).where(eq(schema.bills.id, b.id));
  await postDebitNoteDoc(tx, orgId, dn.id, userId);
  const toAdvance = await releaseSupplierMoney(tx, orgId, userId, b, round2(b.total - b.creditedTotal - total), d.date, number);
  return { id: dn.id, number, subtotal, vat, total, toAdvance };
}

async function releaseSupplierMoney(tx: Tx, orgId: number, userId: number, b: Bill, newValue: number, date: string, noteNumber: string): Promise<number> {
  const a = schema.supplierPaymentAllocations;
  const rows = await tx.select().from(a).where(and(eq(a.billId, b.id), isNull(a.voidedAt))).orderBy(desc(a.appliedOn), desc(a.id)).for("update");
  let excess = sumMinor(rows.map((r) => toMinor(r.amount))) - toMinor(newValue);
  if (excess <= 0) return 0;
  const released = excess;
  for (const r of rows) {
    if (excess <= 0) break;
    const amount = toMinor(r.amount);
    const take = Math.min(amount, excess);
    excess -= take;
    await tx.update(a).set({ voidedAt: new Date() }).where(eq(a.id, r.id));
    await postSupplierAllocationRemoved(tx, orgId, r.id, `${noteNumber} took back part of ${b.number}`, userId, date);
    if (take < amount) {
      const [again] = await tx.insert(a).values({ paymentId: r.paymentId, billId: b.id, amount: fromMinor(amount - take), appliedOn: date, createdBy: userId }).returning({ id: a.id });
      await postSupplierAllocationDoc(tx, orgId, again.id, userId);
    }
  }
  await audit(tx, { userId, action: "supplier_payment.unapply", entity: "bill", entityId: b.id, summary: `${money(fromMinor(released))} already paid on ${b.number} is now an advance (${noteNumber})`, after: { noteNumber, amount: fromMinor(released) } });
  return fromMinor(released);
}
