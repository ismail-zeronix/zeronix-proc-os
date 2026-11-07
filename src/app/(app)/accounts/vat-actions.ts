"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { assertAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { paymentAccount, pickPaymentAccount, reverseDocument } from "@/lib/ledger/documents";
import { postEntry } from "@/lib/ledger/post";
import { vatPaymentLines, vatSettlementLines } from "@/lib/ledger/rules";
import { ensureLedger } from "@/lib/ledger/setup";
import { vatReturnFor } from "@/lib/ledger/vat";
import { currentOrgId, orgProfile, withOrg } from "@/lib/org";
import { longDay, money } from "@/lib/quotation";
import { getSetting } from "@/lib/settings";
import { emirateKnown, vatPeriodOf } from "@/lib/tax/vat201";
import { parseInput, UserError } from "@/lib/user-error";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

const refresh = () => {
  revalidatePath("/accounts", "layout");
  revalidatePath("/accounts/vat");
};

const fileSchema = z.object({ from: day, to: day, reference: z.string().trim().max(60).default("") });

/**
 * Files a VAT period: the return is kept as it stands, the VAT accounts move into what is payable to the FTA, and the
 * books lock up to the period's end, so nothing can change a filed return. A later correction goes in a later period.
 */
export async function fileVatReturn(input: z.input<typeof fileSchema>) {
  const me = await assertAccountant();
  const d = parseInput(fileSchema, input);
  if (d.to >= dubaiToday()) throw new UserError("This period has not ended yet. File it once it is over.");
  const orgId = await currentOrgId();
  const org = await orgProfile(orgId);
  if (!(await getSetting("quote_trn")).trim()) throw new UserError("Add our TRN in Accounts › Settings › VAT registration first.");
  if (!emirateKnown(org.emirate)) throw new UserError("Pick our emirate in Accounts › Settings › VAT registration first: box 1 is reported by emirate.");
  const id = await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const [s] = await tx.select().from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId)).for("update");
    const period = vatPeriodOf(d.from, s.vatPeriodMonths, s.vatPeriodStartMonth);
    if (period.from !== d.from || period.to !== d.to) throw new UserError("That is not one of our VAT periods. Check the period length in Accounts › Settings › VAT registration.");
    const v = schema.vatReturns;
    const [last] = await tx.select({ end: v.periodEnd }).from(v).where(and(eq(v.organizationId, orgId), isNull(v.undoneAt))).orderBy(desc(v.periodEnd)).limit(1);
    if (last && d.to <= last.end) throw new UserError(`Returns up to ${longDay(last.end)} are already filed.`);
    const { boxes, difference } = await vatReturnFor(tx, orgId, d.from, d.to);
    if (difference !== 0) throw new UserError(`The VAT accounts and this return differ by ${money(difference)}: a journal touched a VAT account without a tax code. Correct it first.`);
    const [row] = await tx.insert(v).values({ organizationId: orgId, periodStart: d.from, periodEnd: d.to, boxes, payable: boxes.payable, reference: d.reference, previousLockDate: s.lockDate, filedBy: me.id }).returning({ id: v.id });
    const lines = vatSettlementLines(boxes, `VAT return ${period.label}`);
    if (lines) await postEntry(tx, { orgId, date: d.to, sourceType: "vat_settlement", sourceId: row.id, memo: `VAT return ${period.label}: ${boxes.payable >= 0 ? "payable" : "refundable"} ${money(Math.abs(boxes.payable))}`, createdBy: me.id, lines });
    if (!s.lockDate || s.lockDate < d.to) await tx.update(schema.accountingSettings).set({ lockDate: d.to, updatedAt: new Date(), updatedBy: me.id }).where(eq(schema.accountingSettings.organizationId, orgId));
    await audit(tx, { userId: me.id, action: "vat.file", entity: "vat_return", entityId: row.id, summary: `VAT return ${period.label} filed: ${boxes.payable >= 0 ? "payable" : "refundable"} ${money(Math.abs(boxes.payable))}`, after: { from: d.from, to: d.to, payable: boxes.payable, reference: d.reference, lockDate: d.to } });
    return row.id;
  });
  refresh();
  return { id };
}

const paySchema = z.object({
  paidOn: day,
  method: z.enum(["cash", "bank"]).default("bank"),
  bankAccountId: z.number().int().positive().nullable().optional(),
  reference: z.string().trim().max(120).default(""),
});

/** The money itself: VAT paid to the FTA, or a refund received. */
export async function payVatReturn(returnId: number, input: z.input<typeof paySchema>) {
  const me = await assertAccountant();
  const d = parseInput(paySchema, input);
  if (d.paidOn > dubaiToday()) throw new UserError("The payment date cannot be in the future.");
  const orgId = await currentOrgId();
  await withOrg(orgId, async (tx) => {
    const v = schema.vatReturns;
    const [r] = await tx.select().from(v).where(and(eq(v.id, returnId), eq(v.organizationId, orgId))).for("update");
    if (!r || r.undoneAt) throw new UserError("That VAT return no longer exists.");
    if (r.paidOn) throw new UserError(`This return was already settled on ${longDay(r.paidOn)}.`);
    if (r.payable === 0) throw new UserError("Nothing is payable or refundable on this return.");
    if (d.paidOn <= r.periodEnd) throw new UserError("The payment comes after the period it pays for.");
    const bankAccountId = await pickPaymentAccount(tx, orgId, d.bankAccountId, d.method);
    const acc = await paymentAccount(tx, orgId, bankAccountId, d.method);
    const what = r.payable > 0 ? "VAT paid to the FTA" : "VAT refund from the FTA";
    await postEntry(tx, { orgId, date: d.paidOn, sourceType: "vat_payment", sourceId: r.id, memo: `${what}, period to ${longDay(r.periodEnd)}${d.reference ? ` (${d.reference})` : ""}`, createdBy: me.id, lines: vatPaymentLines({ amount: r.payable, bankLedgerAccountId: acc.ledgerAccountId, description: what }) });
    await tx.update(v).set({ paidOn: d.paidOn, paymentReference: d.reference, bankAccountId }).where(eq(v.id, r.id));
    await audit(tx, { userId: me.id, action: "vat.pay", entity: "vat_return", entityId: r.id, summary: `${what}: ${money(Math.abs(r.payable))}`, after: { paidOn: d.paidOn, reference: d.reference, bankAccountId } });
  });
  refresh();
}

/** A filing made by mistake: only the latest one, and only if the FTA has not got it. Its entries are reversed and the old lock date comes back. */
export async function undoVatFiling(returnId: number, reason: string) {
  const me = await assertAccountant();
  const why = parseInput(z.string().trim().min(3, "Say why the filing is undone").max(300), reason);
  const orgId = await currentOrgId();
  await withOrg(orgId, async (tx) => {
    const v = schema.vatReturns;
    const [r] = await tx.select().from(v).where(and(eq(v.id, returnId), eq(v.organizationId, orgId))).for("update");
    if (!r || r.undoneAt) throw new UserError("That VAT return no longer exists.");
    const [last] = await tx.select({ id: v.id }).from(v).where(and(eq(v.organizationId, orgId), isNull(v.undoneAt))).orderBy(desc(v.periodEnd)).limit(1);
    if (last?.id !== r.id) throw new UserError("Only the latest filing can be undone.");
    const [s] = await tx.select({ lockDate: schema.accountingSettings.lockDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId)).for("update");
    if (s?.lockDate === r.periodEnd) await tx.update(schema.accountingSettings).set({ lockDate: r.previousLockDate, updatedAt: new Date(), updatedBy: me.id }).where(eq(schema.accountingSettings.organizationId, orgId));
    await reverseDocument(tx, orgId, "vat_payment", r.id, `VAT filing undone: ${why}`, me.id);
    await reverseDocument(tx, orgId, "vat_settlement", r.id, `VAT filing undone: ${why}`, me.id);
    await tx.update(v).set({ undoneAt: new Date(), undoReason: why }).where(eq(v.id, r.id));
    await audit(tx, { userId: me.id, action: "vat.undo", entity: "vat_return", entityId: r.id, summary: `VAT filing to ${longDay(r.periodEnd)} undone: ${why}`, before: { payable: r.payable, reference: r.reference, paidOn: r.paidOn }, after: { lockDate: r.previousLockDate } });
  });
  refresh();
}
