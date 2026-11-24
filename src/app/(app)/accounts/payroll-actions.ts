"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { assertAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { takeSeriesNumber } from "@/lib/doc-numbers";
import { assertInLedgerPeriod, pickPaymentAccount } from "@/lib/ledger/documents";
import { postAdvanceDoc, postPayslipDoc, reverseAdvance, reversePayslip } from "@/lib/ledger/payroll-docs";
import { currentOrgId, setTxOrg } from "@/lib/org";
import { ABSENCE, absenceDeduction, ADVANCE_RECOVERY, isMonth, payslipTotals, suggestRecovery } from "@/lib/payroll";
import { advanceBalances, attendanceForPay, payItems } from "@/lib/payroll-data";
import { setSalary } from "@/lib/payroll-write";
import { money } from "@/lib/quotation";
import { parseInput, UserError } from "@/lib/user-error";
import { dayString, toFils } from "@/lib/validation";

/**
 * Accounts › Payroll. Everything here is for an accountant (an admin always is): salaries are private. Each action runs
 * in one transaction, so a payslip and the ledger entry it posts are saved together or not at all.
 */

const day = dayString("Pick a valid date");
const id = z.number().int().positive();
const amountSchema = z.number().min(0, "An amount cannot be below zero").max(1e9).transform(toFils);
const methodSchema = z.enum(["cash", "bank"]);

const refresh = (slipId?: number) => {
  revalidatePath("/accounts/payroll");
  if (slipId) revalidatePath(`/accounts/payroll/${slipId}`);
  revalidatePath("/accounts", "layout");
};

// ---------- salary and pay items ----------

/** Sets what a person is paid each month. Used by Admin › Add user and the Payroll table. */
export async function saveSalary(userId: number, salary: number) {
  const me = await assertAccountant();
  const base = parseInput(amountSchema, salary);
  await setSalary(userId, base, me.id);
  refresh();
}

const itemSchema = z.object({ name: z.string().trim().min(2, "Enter a name").max(40), kind: z.enum(["earning", "deduction"]) });

/** A new kind of pay line (Bonus, Overtime, Fine...). The two the portal knows (absence, advance recovery) are not added here. */
export async function addPayItem(input: z.input<typeof itemSchema>) {
  await assertAccountant();
  const d = parseInput(itemSchema, input);
  const orgId = await currentOrgId();
  const t = schema.payItemTypes;
  const row = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const have = await payItems(tx, orgId);
    if (have.some((h) => h.name.toLowerCase() === d.name.toLowerCase())) throw new UserError(`There is already a pay item called ${d.name}.`);
    const [r] = await tx.insert(t).values({ organizationId: orgId, name: d.name, kind: d.kind, sortOrder: have.length }).returning({ id: t.id, name: t.name, kind: t.kind, systemKey: t.systemKey });
    return r;
  });
  refresh();
  return row;
}

/** Switches a pay item on or off. Off ones stay on old payslips and leave the pick list. The portal's own two stay on. */
export async function setPayItemActive(itemId: number, active: boolean) {
  await assertAccountant();
  const t = schema.payItemTypes;
  const [row] = await db.select().from(t).where(eq(t.id, itemId));
  if (!row) throw new UserError("That pay item no longer exists.");
  if (row.systemKey && !active) throw new UserError(`${row.name} is used by Payroll itself and stays on.`);
  await db.update(t).set({ isActive: active }).where(eq(t.id, itemId));
  refresh();
}

// ---------- payslips ----------

const monthSchema = z.string().refine(isMonth, "Pick a month");

/**
 * Makes a draft payslip for everyone with a salary who has none for the month. Each starts from the salary, with the days
 * they were away without a reason as a suggested deduction and any advance still owed as a suggested recovery: both can be
 * changed or removed before paying.
 */
export async function generatePayslips(month: string): Promise<{ made: number; skipped: number }> {
  const me = await assertAccountant();
  const m = parseInput(monthSchema, month);
  if (m > dubaiToday().slice(0, 7)) throw new UserError("That month has not started yet.");
  const orgId = await currentOrgId();
  const people = await db
    .select({ id: schema.users.id, name: schema.users.name, jobTitle: schema.users.jobTitle, base: schema.employeePay.baseSalary })
    .from(schema.users)
    .innerJoin(schema.employeePay, eq(schema.employeePay.userId, schema.users.id))
    .where(and(eq(schema.users.isActive, true), sql`${schema.employeePay.baseSalary} > 0`));
  const balances = await advanceBalances();
  const live = await db.select({ userId: schema.payslips.userId }).from(schema.payslips).where(and(eq(schema.payslips.month, m), ne(schema.payslips.status, "void")));
  const have = new Set(live.map((l) => l.userId));
  const todo = people.filter((p) => !have.has(p.id));
  const att = new Map(await Promise.all(todo.map(async (p) => [p.id, await attendanceForPay(p.id, m)] as const)));

  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const items = await payItems(tx, orgId);
    const absence = items.find((i) => i.systemKey === ABSENCE);
    const recovery = items.find((i) => i.systemKey === ADVANCE_RECOVERY);
    for (const p of todo) {
      const { number } = await takeSeriesNumber(tx, { orgId, key: "payslip", prefix: "PSL", fiscalYear: Number(m.slice(0, 4)) });
      const a = att.get(p.id)!;
      const [slip] = await tx
        .insert(schema.payslips)
        .values({ organizationId: orgId, number, userId: p.id, month: m, employeeName: p.name, jobTitle: p.jobTitle, baseSalary: p.base, attendance: a, createdBy: me.id })
        .returning({ id: schema.payslips.id });
      const lines: (typeof schema.payslipLines.$inferInsert)[] = [];
      const away = absenceDeduction(p.base, a.absent);
      if (absence && away > 0) lines.push({ organizationId: orgId, payslipId: slip.id, typeId: absence.id, label: absence.name, kind: "deduction", systemKey: ABSENCE, amount: away, note: `${a.absent} day${a.absent === 1 ? "" : "s"} away with no reason (salary ÷ 30 per day)`, sortOrder: 1 });
      const back = suggestRecovery(balances.get(p.id)?.balance ?? 0, p.base - away);
      if (recovery && back > 0) lines.push({ organizationId: orgId, payslipId: slip.id, typeId: recovery.id, label: recovery.name, kind: "deduction", systemKey: ADVANCE_RECOVERY, amount: back, note: "Advance paid earlier", sortOrder: 2 });
      if (lines.length) await tx.insert(schema.payslipLines).values(lines);
    }
    await audit(tx, { userId: me.id, action: "payslip.generate", entity: "payslip", entityId: 0, summary: `${todo.length} draft payslip${todo.length === 1 ? "" : "s"} made for ${m}` });
  });
  refresh();
  return { made: todo.length, skipped: people.length - todo.length };
}

const lineSchema = z.object({ typeId: id, amount: z.number().positive("Enter an amount above zero").max(1e9).transform(toFils), note: z.string().trim().max(200).default("") });
const slipSchema = z.object({ baseSalary: amountSchema, notes: z.string().trim().max(500).default(""), lines: z.array(lineSchema).max(40) });

/** Saves a draft: the salary for this month and every line. A paid or voided payslip cannot be changed. */
export async function savePayslip(slipId: number, input: z.input<typeof slipSchema>) {
  const me = await assertAccountant();
  const d = parseInput(slipSchema, input);
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [p] = await tx.select().from(schema.payslips).where(eq(schema.payslips.id, slipId)).for("update");
    if (!p) throw new UserError("That payslip no longer exists.");
    if (p.status !== "draft") throw new UserError(p.status === "paid" ? "This payslip is paid. Void it to correct it." : "This payslip was voided.");
    const types = new Map((await payItems(tx, orgId)).map((t) => [t.id, t]));
    const rows = d.lines.map((l, i) => {
      const t = types.get(l.typeId);
      if (!t) throw new UserError("One of the pay items no longer exists.");
      return { organizationId: orgId, payslipId: slipId, typeId: t.id, label: t.name, kind: t.kind, systemKey: t.systemKey, amount: l.amount, note: l.note, sortOrder: i };
    });
    const totals = payslipTotals(d.baseSalary, rows);
    if (totals.net < 0) throw new UserError(`The deductions (${money(totals.deductions)}) are more than the pay (${money(totals.gross)}).`);
    const owed = (await advanceBalances()).get(p.userId)?.balance ?? 0;
    if (totals.advanceRecovery > owed + 0.001) throw new UserError(`Only ${money(Math.max(0, owed))} of advance is still owed, but ${money(totals.advanceRecovery)} is taken back.`);
    await tx.delete(schema.payslipLines).where(eq(schema.payslipLines.payslipId, slipId));
    if (rows.length) await tx.insert(schema.payslipLines).values(rows);
    await tx.update(schema.payslips).set({ baseSalary: d.baseSalary, notes: d.notes, gross: totals.gross, deductions: totals.deductions, net: totals.net }).where(eq(schema.payslips.id, slipId));
    await audit(tx, { userId: me.id, action: "payslip.save", entity: "payslip", entityId: slipId, summary: `${p.number} saved: net ${money(totals.net)}` });
  });
  refresh(slipId);
}

/** Reads attendance again (someone added an absence reason, or the month moved on). Does not touch the lines. */
export async function refreshPayslipAttendance(slipId: number) {
  await assertAccountant();
  const [p] = await db.select().from(schema.payslips).where(eq(schema.payslips.id, slipId));
  if (!p) throw new UserError("That payslip no longer exists.");
  if (p.status !== "draft") throw new UserError("Only a draft can be refreshed.");
  await db.update(schema.payslips).set({ attendance: await attendanceForPay(p.userId, p.month) }).where(eq(schema.payslips.id, slipId));
  refresh(slipId);
}

const paySchema = z.object({ paidOn: day, method: methodSchema, bankAccountId: id.nullable(), reference: z.string().trim().max(80).default("") });

/** Pays a draft: totals are fixed, the ledger gets the salary cost, the advance taken back and the money out. */
export async function markPayslipPaid(slipId: number, input: z.input<typeof paySchema>) {
  const me = await assertAccountant();
  const d = parseInput(paySchema, input);
  if (d.paidOn > dubaiToday()) throw new UserError("The payment date cannot be in the future.");
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [p] = await tx.select().from(schema.payslips).where(eq(schema.payslips.id, slipId)).for("update");
    if (!p) throw new UserError("That payslip no longer exists.");
    if (p.status !== "draft") throw new UserError(p.status === "paid" ? "This payslip is already paid." : "This payslip was voided.");
    const lines = await tx.select().from(schema.payslipLines).where(eq(schema.payslipLines.payslipId, slipId));
    const totals = payslipTotals(p.baseSalary, lines);
    if (totals.gross <= 0) throw new UserError("There is nothing to pay: the salary is zero.");
    if (totals.net < 0) throw new UserError("The deductions are more than the pay.");
    const owed = (await advanceBalances()).get(p.userId)?.balance ?? 0;
    if (totals.advanceRecovery > owed + 0.001) throw new UserError(`Only ${money(Math.max(0, owed))} of advance is still owed, but ${money(totals.advanceRecovery)} is taken back.`);
    await assertInLedgerPeriod(tx, orgId, d.paidOn);
    const bankAccountId = await pickPaymentAccount(tx, orgId, d.bankAccountId, d.method);
    await tx.update(schema.payslips).set({ status: "paid", paidOn: d.paidOn, method: d.method, bankAccountId, reference: d.reference, gross: totals.gross, deductions: totals.deductions, net: totals.net }).where(eq(schema.payslips.id, slipId));
    await postPayslipDoc(tx, orgId, slipId, me.id);
    await audit(tx, { userId: me.id, action: "payslip.pay", entity: "payslip", entityId: slipId, summary: `${p.number} paid to ${p.employeeName}: ${money(totals.net)} on ${d.paidOn}`, after: { net: totals.net, advanceRecovery: totals.advanceRecovery } });
  });
  refresh(slipId);
}

/** Voids a payslip (kept, crossed out). If it was paid, its ledger entry is reversed and any advance it took back is owed again. */
export async function voidPayslip(slipId: number, reason: string) {
  const me = await assertAccountant();
  const why = parseInput(z.string().trim().min(3, "Say why it is voided").max(300), reason);
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [p] = await tx.select().from(schema.payslips).where(eq(schema.payslips.id, slipId)).for("update");
    if (!p) throw new UserError("That payslip no longer exists.");
    if (p.status === "void") throw new UserError("This payslip is already voided.");
    if (p.paidOn) await assertInLedgerPeriod(tx, orgId, p.paidOn);
    await tx.update(schema.payslips).set({ status: "void", voidedAt: new Date(), voidReason: why }).where(eq(schema.payslips.id, slipId));
    if (p.status === "paid") await reversePayslip(tx, orgId, slipId, `payslip ${p.number} voided: ${why}`, me.id);
    await audit(tx, { userId: me.id, action: "payslip.void", entity: "payslip", entityId: slipId, summary: `${p.number} voided: ${why}`, before: { status: p.status, net: p.net } });
  });
  refresh(slipId);
}

/** A draft that was made by mistake goes away completely (nothing was paid or posted). */
export async function deleteDraftPayslip(slipId: number) {
  const me = await assertAccountant();
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [p] = await tx.select().from(schema.payslips).where(and(eq(schema.payslips.id, slipId), isNull(schema.payslips.paidOn))).for("update");
    if (!p) throw new UserError("That payslip no longer exists.");
    if (p.status !== "draft") throw new UserError("Only a draft can be deleted. Void a paid one.");
    await tx.delete(schema.payslipLines).where(eq(schema.payslipLines.payslipId, slipId));
    await tx.delete(schema.payslips).where(eq(schema.payslips.id, slipId));
    await audit(tx, { userId: me.id, action: "payslip.delete", entity: "payslip", entityId: slipId, summary: `Draft ${p.number} for ${p.employeeName} deleted` });
  });
  refresh();
}

// ---------- advances ----------

const advanceSchema = z.object({ userId: id, paidOn: day, amount: z.number().positive("Enter an amount above zero").max(1e9).transform(toFils), method: methodSchema, bankAccountId: id.nullable(), reference: z.string().trim().max(80).default(""), notes: z.string().trim().max(300).default("") });

/** Money paid to an employee ahead of salary. It posts to Employee advances and is suggested back on the next payslips. */
export async function recordAdvance(input: z.input<typeof advanceSchema>) {
  const me = await assertAccountant();
  const d = parseInput(advanceSchema, input);
  if (d.paidOn > dubaiToday()) throw new UserError("The payment date cannot be in the future.");
  const orgId = await currentOrgId();
  const row = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [u] = await tx.select({ name: schema.users.name, isActive: schema.users.isActive }).from(schema.users).where(eq(schema.users.id, d.userId));
    if (!u) throw new UserError("That user no longer exists.");
    await assertInLedgerPeriod(tx, orgId, d.paidOn);
    const bankAccountId = await pickPaymentAccount(tx, orgId, d.bankAccountId, d.method);
    const { number } = await takeSeriesNumber(tx, { orgId, key: "advance", prefix: "ADV", fiscalYear: Number(d.paidOn.slice(0, 4)) });
    const [a] = await tx
      .insert(schema.employeeAdvances)
      .values({ organizationId: orgId, number, userId: d.userId, employeeName: u.name, paidOn: d.paidOn, amount: d.amount, method: d.method, bankAccountId, reference: d.reference, notes: d.notes, createdBy: me.id })
      .returning({ id: schema.employeeAdvances.id, number: schema.employeeAdvances.number });
    await postAdvanceDoc(tx, orgId, a.id, me.id);
    await audit(tx, { userId: me.id, action: "advance.create", entity: "employee_advance", entityId: a.id, summary: `${a.number}: ${money(d.amount)} advance to ${u.name}`, after: { amount: d.amount, paidOn: d.paidOn } });
    return a;
  });
  refresh();
  return row;
}

export async function voidAdvance(advanceId: number, reason: string) {
  const me = await assertAccountant();
  const why = parseInput(z.string().trim().min(3, "Say why it is voided").max(300), reason);
  const orgId = await currentOrgId();
  await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    const [a] = await tx.select().from(schema.employeeAdvances).where(eq(schema.employeeAdvances.id, advanceId)).for("update");
    if (!a) throw new UserError("That advance no longer exists.");
    if (a.voidedAt) throw new UserError("This advance is already voided.");
    await assertInLedgerPeriod(tx, orgId, a.paidOn);
    const b = (await advanceBalances()).get(a.userId);
    if ((b?.balance ?? 0) - a.amount < -0.001) throw new UserError(`${money(b?.recovered ?? 0)} of this person's advances has already been taken back from salary. Void that payslip first.`);
    await tx.update(schema.employeeAdvances).set({ voidedAt: new Date(), voidReason: why }).where(eq(schema.employeeAdvances.id, advanceId));
    await reverseAdvance(tx, orgId, advanceId, `advance ${a.number} voided: ${why}`, me.id);
    await audit(tx, { userId: me.id, action: "advance.void", entity: "employee_advance", entityId: advanceId, summary: `${a.number} voided: ${why}` });
  });
  refresh();
}

