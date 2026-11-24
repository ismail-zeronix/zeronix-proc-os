import "server-only";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { advancePostLines, payslipPostLines, type PayLine } from "@/lib/payroll";
import type { Tx } from "@/lib/tx";
import { UserError } from "@/lib/user-error";
import { ledgerStart, liveEntry, paymentAccount, posts, reverseDocument } from "./documents";
import { postEntry } from "./post";

/**
 * What Payroll puts in the ledger (Accounts › Payroll). Called inside the transaction that marks a payslip paid or saves
 * an advance, so the document and its entry succeed or fail together. A date before the cut-over posts nothing, like every
 * other document.
 */

/** Salary paid: the cost, any advance taken back, and the money out of the bank or cash box it was paid from. */
export async function postPayslipDoc(tx: Tx, orgId: number, payslipId: number, userId: number | null): Promise<void> {
  const [p] = await tx.select().from(schema.payslips).where(eq(schema.payslips.id, payslipId));
  if (!p || p.status !== "paid" || !p.paidOn) throw new UserError("That payslip is not paid.");
  if (!posts(await ledgerStart(tx, orgId), p.paidOn) || (await liveEntry(tx, orgId, "payslip", p.id))) return;
  const rows = await tx.select().from(schema.payslipLines).where(eq(schema.payslipLines.payslipId, p.id));
  const lines: PayLine[] = rows.map((l) => ({ label: l.label, kind: l.kind, amount: l.amount, systemKey: l.systemKey }));
  const acc = await paymentAccount(tx, orgId, p.bankAccountId, p.method ?? "bank");
  await postEntry(tx, {
    orgId,
    date: p.paidOn,
    sourceType: "payslip",
    sourceId: p.id,
    memo: `Salary ${p.number} for ${p.employeeName}, ${p.month}`,
    createdBy: userId,
    lines: payslipPostLines({ number: p.number, employee: p.employeeName, bankLedgerAccountId: acc.ledgerAccountId, base: p.baseSalary, lines }),
  });
}

/** An advance paid to an employee. */
export async function postAdvanceDoc(tx: Tx, orgId: number, advanceId: number, userId: number | null): Promise<void> {
  const [a] = await tx.select().from(schema.employeeAdvances).where(eq(schema.employeeAdvances.id, advanceId));
  if (!a) throw new UserError("That advance no longer exists.");
  if (!posts(await ledgerStart(tx, orgId), a.paidOn) || (await liveEntry(tx, orgId, "employee_advance", a.id))) return;
  const acc = await paymentAccount(tx, orgId, a.bankAccountId, a.method);
  await postEntry(tx, {
    orgId,
    date: a.paidOn,
    sourceType: "employee_advance",
    sourceId: a.id,
    memo: `Advance ${a.number} paid to ${a.employeeName}`,
    createdBy: userId,
    lines: advancePostLines({ number: a.number, employee: a.employeeName, bankLedgerAccountId: acc.ledgerAccountId, amount: a.amount }),
  });
}

export const reversePayslip = (tx: Tx, orgId: number, id: number, reason: string, userId: number | null) => reverseDocument(tx, orgId, "payslip", id, reason, userId);
export const reverseAdvance = (tx: Tx, orgId: number, id: number, reason: string, userId: number | null) => reverseDocument(tx, orgId, "employee_advance", id, reason, userId);
