import "server-only";
import { desc, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";

const r = schema.advanceRefunds;
const fields = {
  id: r.id,
  number: r.number,
  party: r.party,
  refundedOn: r.refundedOn,
  amount: r.amount,
  method: r.method,
  reference: r.reference,
  reason: r.reason,
  voidedAt: r.voidedAt,
  voidReason: r.voidReason,
  customerPayment: schema.payments.number,
  supplierPayment: schema.supplierPayments.number,
  companyId: schema.payments.companyId,
  supplierId: schema.supplierPayments.supplierId,
};

const base = () =>
  db
    .select(fields)
    .from(r)
    .leftJoin(schema.payments, eq(schema.payments.id, r.paymentId))
    .leftJoin(schema.supplierPayments, eq(schema.supplierPayments.id, r.supplierPaymentId));

export type RefundRow = Awaited<ReturnType<typeof listRefunds>>[number];

/** The refunds of one customer's or supplier's advances, newest first, voided ones too. */
export async function listRefunds(who: { companyId?: number; supplierId?: number }) {
  const rows = await base()
    .where(or(who.companyId ? eq(schema.payments.companyId, who.companyId) : undefined, who.supplierId ? eq(schema.supplierPayments.supplierId, who.supplierId) : undefined))
    .orderBy(desc(r.refundedOn), desc(r.id));
  return rows.map((x) => ({ ...x, voidedAt: x.voidedAt?.toISOString() ?? null, paymentNumber: x.customerPayment ?? x.supplierPayment ?? "" }));
}

export async function getRefund(id: number) {
  const [x] = await base().where(eq(r.id, id));
  if (!x) return null;
  const who = x.companyId
    ? (await db.select({ name: schema.companies.name, address: schema.companies.address, trn: schema.companies.trn }).from(schema.companies).where(eq(schema.companies.id, x.companyId)))[0]
    : x.supplierId
      ? (await db.select({ name: schema.suppliers.name, address: schema.suppliers.address, trn: schema.suppliers.trn }).from(schema.suppliers).where(eq(schema.suppliers.id, x.supplierId)))[0]
      : undefined;
  return { ...x, paymentNumber: x.customerPayment ?? x.supplierPayment ?? "", who: who ?? { name: "", address: "", trn: "" } };
}
