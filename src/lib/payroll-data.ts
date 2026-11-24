import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { monthAttendance } from "@/lib/attendance-data";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { ADVANCE_RECOVERY, DEFAULT_PAY_ITEMS, payslipTotals } from "@/lib/payroll";
import type { Tx } from "@/lib/tx";

/** Reads for Accounts › Payroll. Only admins and accountants reach these (the pages and actions check). */

/** The pay item types, created the first time Payroll is opened. */
export async function payItems(tx: Pick<Tx, "select" | "insert"> = db, orgId = DEFAULT_ORG_ID) {
  const t = schema.payItemTypes;
  const have = await tx.select().from(t).where(eq(t.organizationId, orgId)).orderBy(asc(t.sortOrder), asc(t.id));
  if (have.length) return have;
  await tx
    .insert(t)
    .values(DEFAULT_PAY_ITEMS.map((d, i) => ({ organizationId: orgId, name: d.name, kind: d.kind, systemKey: d.systemKey, sortOrder: i })))
    .onConflictDoNothing();
  return tx.select().from(t).where(eq(t.organizationId, orgId)).orderBy(asc(t.sortOrder), asc(t.id));
}

export interface Employee {
  id: number;
  name: string;
  jobTitle: string;
  email: string;
  baseSalary: number;
}

/** Everyone who can be paid: active users with their salary (0 = none set yet). */
export async function employees(): Promise<Employee[]> {
  return db
    .select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle, email: schema.users.email, baseSalary: sql<number>`coalesce(${schema.employeePay.baseSalary}, 0)::float` })
    .from(schema.users)
    .leftJoin(schema.employeePay, eq(schema.employeePay.userId, schema.users.id))
    .where(eq(schema.users.isActive, true))
    .orderBy(asc(schema.users.name));
}

/** What each person was paid ahead and has not paid back yet. */
export async function advanceBalances(): Promise<Map<number, { paid: number; recovered: number; balance: number }>> {
  const rows = await db.execute<{ user_id: number; paid: number; recovered: number }>(sql`
    SELECT u.id AS user_id,
      coalesce((SELECT sum(a.amount) FROM employee_advances a WHERE a.user_id = u.id AND a.voided_at IS NULL), 0)::float AS paid,
      coalesce((SELECT sum(l.amount) FROM payslip_lines l JOIN payslips s ON s.id = l.payslip_id WHERE s.user_id = u.id AND s.status = 'paid' AND l.system_key = ${ADVANCE_RECOVERY}), 0)::float AS recovered
    FROM users u`);
  return new Map(rows.rows.map((r) => [Number(r.user_id), { paid: Number(r.paid), recovered: Number(r.recovered), balance: Math.round((Number(r.paid) - Number(r.recovered)) * 100) / 100 }]));
}

export interface SlipRow {
  id: number;
  number: string;
  userId: number;
  month: string;
  employeeName: string;
  status: "draft" | "paid" | "void";
  gross: number;
  net: number;
  paidOn: string | null;
}

/** The month's payslips with live totals (a draft's totals come from its lines). Voided ones are left out. */
export async function monthSlips(month: string): Promise<SlipRow[]> {
  const s = schema.payslips;
  const rows = await db.select().from(s).where(and(eq(s.month, month), ne(s.status, "void"))).orderBy(asc(s.employeeName));
  if (!rows.length) return [];
  const lines = await db.select().from(schema.payslipLines).where(sql`${schema.payslipLines.payslipId} IN (${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)})`);
  return rows.map((r) => {
    const t = payslipTotals(r.baseSalary, lines.filter((l) => l.payslipId === r.id));
    return { id: r.id, number: r.number, userId: r.userId, month: r.month, employeeName: r.employeeName, status: r.status, gross: t.gross, net: t.net, paidOn: r.paidOn };
  });
}

export async function getPayslip(id: number) {
  const s = schema.payslips;
  const [p] = await db.select().from(s).where(eq(s.id, id));
  if (!p) return null;
  const lines = await db.select().from(schema.payslipLines).where(eq(schema.payslipLines.payslipId, id)).orderBy(asc(schema.payslipLines.sortOrder), asc(schema.payslipLines.id));
  const [bank] = p.bankAccountId ? await db.select({ name: schema.bankAccounts.name }).from(schema.bankAccounts).where(eq(schema.bankAccounts.id, p.bankAccountId)) : [];
  const balance = (await advanceBalances()).get(p.userId)?.balance ?? 0;
  return { ...p, lines, bankName: bank?.name ?? "", totals: payslipTotals(p.baseSalary, lines), advanceBalance: balance };
}
export type PayslipView = NonNullable<Awaited<ReturnType<typeof getPayslip>>>;

export async function advancesList() {
  const a = schema.employeeAdvances;
  return db.select().from(a).orderBy(desc(a.paidOn), desc(a.id)).limit(200);
}

/** Attendance for a payslip: what to show and the days away with no reason, which the absence deduction is suggested from. */
export async function attendanceForPay(userId: number, month: string) {
  const m = await monthAttendance(userId, month);
  return { daysIn: m.counts.present + m.counts.late, late: m.counts.late, absent: m.counts.absent, medical: m.counts.medical, other: m.counts.other, hours: Math.round((m.totalMinutes / 60) * 10) / 10 };
}

