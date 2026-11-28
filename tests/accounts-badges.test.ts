import "dotenv/config";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { db, schema } = await import("@/db");
const D = await import("drizzle-orm");
const { accountsBadges, listInvoices } = await import("@/lib/accounts-data");
const { billsDueCount } = await import("@/lib/purchases-data");
const { dubaiToday } = await import("@/lib/dates");

const tag = `BDG${Date.now()}`;
const shift = (day: string, days: number) => new Date(Date.parse(day + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
const made = { invoices: [] as number[], bills: [] as number[], payments: [] as number[], supplierPayments: [] as number[], company: 0, supplier: 0 };

/** The badge numbers worked out the slow way: every invoice and bill through invoiceState() / billState(). */
async function bySlowWay() {
  return { overdue: (await listInvoices()).filter((i) => i.state.key === "overdue").length, billsDue: await billsDueCount() };
}

afterAll(async () => {
  if (made.payments.length) await db.delete(schema.paymentAllocations).where(D.inArray(schema.paymentAllocations.paymentId, made.payments));
  if (made.payments.length) await db.delete(schema.payments).where(D.inArray(schema.payments.id, made.payments));
  if (made.supplierPayments.length) await db.delete(schema.supplierPaymentAllocations).where(D.inArray(schema.supplierPaymentAllocations.paymentId, made.supplierPayments));
  if (made.supplierPayments.length) await db.delete(schema.supplierPayments).where(D.inArray(schema.supplierPayments.id, made.supplierPayments));
  if (made.bills.length) await db.delete(schema.bills).where(D.inArray(schema.bills.id, made.bills));
  if (made.invoices.length) await db.delete(schema.invoices).where(D.inArray(schema.invoices.id, made.invoices));
  if (made.company) await db.delete(schema.companies).where(D.eq(schema.companies.id, made.company));
  if (made.supplier) await db.delete(schema.suppliers).where(D.eq(schema.suppliers.id, made.supplier));
});

describe("the Accounts sidebar badges (one query)", () => {
  it("count exactly what the invoice and bill lists call overdue or due within a week", async () => {
    const today = dubaiToday();
    const past = shift(today, -10);
    const [sqlBefore, slowBefore] = await Promise.all([accountsBadges(), bySlowWay()]);
    expect({ overdue: sqlBefore.overdue, billsDue: sqlBefore.billsDue }).toEqual(slowBefore);

    made.company = (await db.insert(schema.companies).values({ name: `${tag} C`, nameNorm: `${tag.toLowerCase()} c` }).returning({ id: schema.companies.id }))[0].id;
    made.supplier = (await db.insert(schema.suppliers).values({ name: `${tag} S` }).returning({ id: schema.suppliers.id }))[0].id;
    let n = 0;
    const invoice = async (p: { due: string; paid?: number; voidedPaid?: number; credited?: number; status?: string }) => {
      n++;
      const [i] = await db
        .insert(schema.invoices)
        .values({ number: `${tag}-${n}`, companyId: made.company, issueDate: past, supplyDate: past, termsDays: 0, dueDate: p.due, customerName: tag, vatPct: 5, subtotal: 1000, vatAmount: 50, total: 1050, creditedTotal: p.credited ?? 0, status: p.status ?? "issued" })
        .returning({ id: schema.invoices.id });
      made.invoices.push(i.id);
      for (const [amount, voided] of [[p.paid, false], [p.voidedPaid, true]] as const) {
        if (!amount) continue;
        const [pay] = await db
          .insert(schema.payments)
          .values({ year: 2098, seq: 70000 + made.payments.length, number: `${tag}-R${made.payments.length}`, companyId: made.company, paidOn: past, amount, method: "cash", voidedAt: voided ? new Date() : null })
          .returning({ id: schema.payments.id });
        made.payments.push(pay.id);
        await db.insert(schema.paymentAllocations).values({ paymentId: pay.id, invoiceId: i.id, amount, appliedOn: past, voidedAt: voided ? new Date() : null });
      }
    };
    const bill = async (p: { due: string; kind?: "bill" | "expense"; status?: string; paid?: number }) => {
      n++;
      const [b] = await db
        .insert(schema.bills)
        .values({ year: 2098, seq: 70000 + n, number: `${tag}-B${n}`, kind: p.kind ?? "bill", supplierId: made.supplier, supplierRef: `${tag}-${n}`, billDate: past, dueDate: p.due, category: "cogs", vatPct: 5, subtotal: 1000, vatAmount: 50, total: 1050, status: p.status ?? "open" })
        .returning({ id: schema.bills.id });
      made.bills.push(b.id);
      if (p.paid) {
        const [pay] = await db
          .insert(schema.supplierPayments)
          .values({ year: 2098, seq: 70000 + n, number: `${tag}-P${n}`, billId: b.id, supplierId: made.supplier, paidOn: past, amount: p.paid, method: "cash" })
          .returning({ id: schema.supplierPayments.id });
        made.supplierPayments.push(pay.id);
        await db.insert(schema.supplierPaymentAllocations).values({ paymentId: pay.id, billId: b.id, amount: p.paid, appliedOn: past });
      }
    };

    await invoice({ due: past }); // overdue
    await invoice({ due: past, paid: 100 }); // part paid, overdue
    await invoice({ due: past, paid: 1050 }); // paid
    await invoice({ due: past, credited: 1050 }); // credited in full
    await invoice({ due: past, status: "cancelled" });
    await invoice({ due: past, voidedPaid: 1050 }); // its payment was voided: still overdue
    await invoice({ due: shift(today, 5) }); // not due yet
    await bill({ due: past }); // overdue
    await bill({ due: shift(today, 3) }); // due within a week
    await bill({ due: shift(today, 7) }); // due in exactly a week: counts
    await bill({ due: shift(today, 20) }); // later
    await bill({ due: past, status: "void" });
    await bill({ due: past, paid: 1050 }); // paid
    await bill({ due: past, kind: "expense" }); // expenses are not on this badge

    const [sqlAfter, slowAfter] = await Promise.all([accountsBadges(), bySlowWay()]);
    expect({ overdue: sqlAfter.overdue, billsDue: sqlAfter.billsDue }).toEqual(slowAfter);
    expect(sqlAfter.overdue - sqlBefore.overdue).toBe(3);
    expect(sqlAfter.billsDue - sqlBefore.billsDue).toBe(3);
  });
});
