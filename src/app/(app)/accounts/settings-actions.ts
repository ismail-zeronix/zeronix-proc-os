"use server";

import { and, desc, eq, isNull, like, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { assertAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { invoiceNumber, TERMS_OPTIONS } from "@/lib/invoicing";
import { ledgerInUse } from "@/lib/ledger/documents";
import { MAPPABLE_KEYS, paymentMethodOf } from "@/lib/ledger/settings-rules";
import { ensureLedger } from "@/lib/ledger/setup";
import { currentOrgId, withOrg } from "@/lib/org";
import { longDay } from "@/lib/quotation";
import { trnProblem } from "@/lib/sales";
import { getSettings, setSetting } from "@/lib/settings";
import { parseInput, UserError } from "@/lib/user-error";

const parseOr = <T,>(s: z.ZodType<T>, input: unknown, fallback: string): T => {
  const r = s.safeParse(input);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? fallback);
  return r.data;
};

function refresh() {
  revalidatePath("/accounts", "layout");
  revalidatePath("/admin", "layout");
}

const vatSchema = z.object({
  trn: z.string().trim().max(30),
  emirate: z.string().trim().min(1, "Pick the emirate").max(40),
  vatPeriodMonths: z.union([z.literal(1), z.literal(3)]),
  vatPeriodStartMonth: z.number().int().min(1).max(12),
});

/** Our VAT registration: the TRN printed on every tax invoice, the emirate and the length of the VAT period. */
export async function saveVatRegistration(input: z.input<typeof vatSchema>) {
  const me = await assertAccountant();
  const d = parseOr(vatSchema, input, "Check the VAT details.");
  const bad = trnProblem(d.trn);
  if (bad) throw new UserError(bad);
  const orgId = await currentOrgId();
  const before = await getSettings();
  await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const [org] = await tx.select({ emirate: schema.organizations.emirate }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
    const [s] = await tx.select({ months: schema.accountingSettings.vatPeriodMonths, start: schema.accountingSettings.vatPeriodStartMonth }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
    await tx.update(schema.organizations).set({ emirate: d.emirate, updatedAt: new Date() }).where(eq(schema.organizations.id, orgId));
    await tx.update(schema.accountingSettings).set({ vatPeriodMonths: d.vatPeriodMonths, vatPeriodStartMonth: d.vatPeriodStartMonth, updatedAt: new Date(), updatedBy: me.id }).where(eq(schema.accountingSettings.organizationId, orgId));
    await audit(tx, {
      userId: me.id,
      action: "settings.vat_registration",
      entity: "settings",
      summary: before.quote_trn === d.trn ? "VAT registration changed" : "Our TRN changed",
      before: { trn: before.quote_trn, emirate: org?.emirate, vatPeriodMonths: s?.months, vatPeriodStartMonth: s?.start },
      after: d,
    });
  });
  await setSetting("quote_trn", d.trn);
  refresh();
}

/** The month the financial year starts. Fixed once the ledger holds anything: entries are numbered and reported by it. */
export async function saveFiscalYear(startMonth: number) {
  const me = await assertAccountant();
  const m = parseInput(z.number().int().min(1).max(12), startMonth);
  const orgId = await currentOrgId();
  await withOrg(orgId, async (tx) => {
    const [org] = await tx.select({ m: schema.organizations.fiscalYearStartMonth }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
    if (org?.m === m) return;
    if (await ledgerInUse(tx, orgId)) throw new UserError("The financial year cannot change once the ledger holds entries: they are numbered and reported by it.");
    await tx.update(schema.organizations).set({ fiscalYearStartMonth: m, updatedAt: new Date() }).where(eq(schema.organizations.id, orgId));
    await audit(tx, { userId: me.id, action: "settings.fiscal_year", entity: "settings", summary: `Financial year now starts in month ${m}`, before: { fiscalYearStartMonth: org?.m }, after: { fiscalYearStartMonth: m } });
  });
  refresh();
}

/**
 * Closes the books up to a day: nothing can be posted on or before it, by anyone (the database refuses too). A filed VAT
 * return or a finished year stays as it was filed. Empty opens everything again, which needs a reason in the audit trail.
 */
export async function setLockDate(date: string | null, reason: string) {
  const me = await assertAccountant();
  const day = date ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date").parse(date) : null;
  const why = parseInput(z.string().trim().max(300), reason);
  if (day && day > dubaiToday()) throw new UserError("The lock date cannot be in the future: that would stop today's work.");
  const orgId = await currentOrgId();
  await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const [s] = await tx.select({ lockDate: schema.accountingSettings.lockDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
    const before = s?.lockDate ?? null;
    if (before === day) return;
    // moving back reopens closed work, so say why
    if (before && (!day || day < before) && why.length < 3) throw new UserError("Say why the books are being reopened.");
    const [filed] = await tx
      .select({ end: schema.vatReturns.periodEnd })
      .from(schema.vatReturns)
      .where(and(eq(schema.vatReturns.organizationId, orgId), isNull(schema.vatReturns.undoneAt)))
      .orderBy(desc(schema.vatReturns.periodEnd))
      .limit(1);
    if (filed && (!day || day < filed.end)) throw new UserError(`The VAT return up to ${longDay(filed.end)} is filed, so that period stays locked. Undo the filing in Accounts › VAT return first.`);
    await tx.update(schema.accountingSettings).set({ lockDate: day, updatedAt: new Date(), updatedBy: me.id }).where(eq(schema.accountingSettings.organizationId, orgId));
    await audit(tx, {
      userId: me.id,
      action: "settings.lock_date",
      entity: "settings",
      summary: day ? `Books locked up to ${longDay(day)}${why ? `: ${why}` : ""}` : `Books unlocked: ${why}`,
      before: { lockDate: before },
      after: { lockDate: day, reason: why },
    });
  });
  refresh();
}

const bankSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  kind: z.enum(["bank", "cash", "card", "petty"]),
  bankName: z.string().trim().max(120).default(""),
  accountNumber: z.string().trim().max(60).default(""),
  iban: z.string().trim().max(40).default(""),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type BankAccountInput = z.input<typeof bankSchema>;

/**
 * Adds or changes a bank account or cash box. Each one has its own account in the ledger, under Cash and bank. One of
 * each payment method (cash, bank transfer) is the default on payment forms. One holding money cannot be switched off.
 */
export async function saveBankAccount(id: number | null, input: BankAccountInput) {
  const me = await assertAccountant();
  const d = parseOr(bankSchema, input, "Check the account.");
  const orgId = await currentOrgId();
  const b = schema.bankAccounts;
  const a = schema.ledgerAccounts;
  await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const method = paymentMethodOf(d.kind);
    let rowId = id;
    if (id) {
      const [row] = await tx.select().from(b).where(and(eq(b.id, id), eq(b.organizationId, orgId)));
      if (!row) throw new UserError("That account no longer exists.");
      if (paymentMethodOf(row.kind) !== method) throw new UserError("A cash box cannot become a bank account, or the other way round: add a new one.");
      if (row.isActive && !d.isActive) {
        const [{ bal }] = await tx.select({ bal: sql<number>`coalesce(sum(${schema.journalLines.debit} - ${schema.journalLines.credit}), 0)::float` }).from(schema.journalLines).where(eq(schema.journalLines.accountId, row.accountId));
        if (Math.abs(bal) >= 0.005) throw new UserError(`${row.name} still holds money. Move it first, then switch the account off.`);
        if (row.isDefault) throw new UserError(`${row.name} is the default. Make another account the default first.`);
      }
      await tx.update(b).set({ name: d.name, kind: d.kind, bankName: d.bankName, accountNumber: d.accountNumber, iban: d.iban, isActive: d.isActive }).where(eq(b.id, id));
      // the ledger account shows the same name in the reports
      await tx.update(a).set({ name: d.name, isActive: d.isActive }).where(eq(a.id, row.accountId));
      await audit(tx, { userId: me.id, action: "bank_account.update", entity: "bank_account", entityId: id, summary: `Account ${d.name} changed`, before: { name: row.name, bankName: row.bankName, accountNumber: row.accountNumber, iban: row.iban, isActive: row.isActive }, after: d });
    } else {
      const [group] = await tx.select({ id: a.id, code: a.code }).from(a).where(and(eq(a.organizationId, orgId), eq(a.code, "1100"), eq(a.isGroup, true)));
      const [any] = group ? [group] : await tx.select({ id: a.parentId, code: sql<string>`''` }).from(a).where(and(eq(a.organizationId, orgId), eq(a.systemKey, method === "cash" ? "cash" : "bank")));
      if (!any?.id) throw new UserError("The chart of accounts has no Cash and bank group.");
      const taken = await tx.select({ code: a.code }).from(a).where(and(eq(a.organizationId, orgId), like(a.code, "11%")));
      const codes = new Set(taken.map((c) => c.code));
      let n = method === "cash" ? 1130 : 1160;
      while (codes.has(String(n))) n++;
      const [acc] = await tx
        .insert(a)
        .values({ organizationId: orgId, code: String(n), name: d.name, type: "asset", subtype: method === "cash" ? "cash" : "bank", parentId: any.id })
        .returning({ id: a.id });
      const [row] = await tx.insert(b).values({ organizationId: orgId, accountId: acc.id, name: d.name, kind: d.kind, bankName: d.bankName, accountNumber: d.accountNumber, iban: d.iban }).returning({ id: b.id });
      rowId = row.id;
      await audit(tx, { userId: me.id, action: "bank_account.create", entity: "bank_account", entityId: row.id, summary: `Account ${d.name} added as ledger account ${n}`, after: d });
    }
    if (d.isDefault && rowId) {
      if (!d.isActive) throw new UserError("An account that is switched off cannot be the default.");
      const kinds = method === "cash" ? (["cash", "petty"] as const) : (["bank", "card"] as const);
      for (const k of kinds) await tx.update(b).set({ isDefault: false }).where(and(eq(b.organizationId, orgId), eq(b.kind, k), ne(b.id, rowId)));
      await tx.update(b).set({ isDefault: true }).where(eq(b.id, rowId));
    }
  });
  refresh();
}

/** Which ledger account each sales type and expense category posts to. Leaving one out goes back to its usual account. */
export async function saveAccountMap(input: Record<string, number | null>) {
  const me = await assertAccountant();
  const orgId = await currentOrgId();
  const a = schema.ledgerAccounts;
  await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const accounts = await tx.select({ id: a.id, code: a.code, name: a.name, type: a.type, isGroup: a.isGroup, isActive: a.isActive, systemKey: a.systemKey }).from(a).where(eq(a.organizationId, orgId));
    const byId = new Map(accounts.map((x) => [x.id, x]));
    const map: Record<string, number> = {};
    for (const [key, id] of Object.entries(input)) {
      const def = MAPPABLE_KEYS.find((m) => m.key === key);
      if (!def) throw new UserError(`Unknown setting ${key}.`);
      if (id == null) continue;
      const acc = byId.get(id);
      if (!acc) throw new UserError("One of those accounts no longer exists.");
      if (acc.isGroup) throw new UserError(`${acc.code} ${acc.name} is a group: pick one of the accounts under it.`);
      if (!acc.isActive) throw new UserError(`${acc.code} ${acc.name} is switched off.`);
      if (acc.type !== def.type) throw new UserError(`${def.label} must post to ${def.type === "income" ? "an income" : "an expense"} account, and ${acc.code} ${acc.name} is not one.`);
      // the account it already goes to needs no entry
      if (acc.systemKey !== key) map[key] = id;
    }
    const [s] = await tx.select({ m: schema.accountingSettings.accountMap }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
    await tx.update(schema.accountingSettings).set({ accountMap: map, updatedAt: new Date(), updatedBy: me.id }).where(eq(schema.accountingSettings.organizationId, orgId));
    await audit(tx, { userId: me.id, action: "settings.default_accounts", entity: "settings", summary: "Default accounts changed", before: s?.m ?? {}, after: map });
  });
  refresh();
}

const numberingSchema = z.object({
  invoice_prefix: z.string().trim().max(20),
  invoice_next_number: z.number().int().min(1, "The next number must be 1 or more").max(100_000_000),
  invoice_digits: z.number().int().min(1).max(10),
});

/** The invoice series. It can continue the numbers used before the portal, but never reuse one already issued. */
export async function saveNumbering(input: z.input<typeof numberingSchema>) {
  const me = await assertAccountant();
  const d = parseOr(numberingSchema, input, "Check the numbering.");
  const next = invoiceNumber(d.invoice_prefix, d.invoice_next_number, d.invoice_digits);
  const [used] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.number, next));
  if (used) throw new UserError(`Invoice ${next} already exists. Pick a higher next number.`);
  const before = await getSettings();
  for (const [k, v] of Object.entries(d)) await setSetting(k as "invoice_prefix", String(v));
  await audit(db, { userId: me.id, action: "settings.numbering", entity: "settings", summary: `Next invoice will be ${next}`, before: { invoice_prefix: before.invoice_prefix, invoice_next_number: before.invoice_next_number, invoice_digits: before.invoice_digits }, after: d });
  refresh();
}

const documentSchema = z.object({
  default_terms_days: z.number().refine((n) => (TERMS_OPTIONS as readonly number[]).includes(n), "Pick the credit terms"),
  bank_name: z.string().trim().max(120),
  bank_account_name: z.string().trim().max(120),
  bank_account_number: z.string().trim().max(60),
  bank_iban: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => v === "" || /^AE\d{21}$/.test(v) || /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v), "That IBAN does not look right (UAE IBANs are AE + 21 digits)"),
  bank_swift: z.string().trim().max(11),
});

/** What invoices print about paying: the credit terms and our bank details. Bank details are what auditors look at first. */
export async function saveDocumentDetails(input: z.input<typeof documentSchema>) {
  const me = await assertAccountant();
  const d = parseOr(documentSchema, input, "Check the details.");
  const before = await getSettings();
  const changed = Object.entries(d).filter(([k, v]) => before[k as keyof typeof before] !== String(v));
  if (!changed.length) return;
  for (const [k, v] of changed) await setSetting(k as "bank_name", String(v));
  await audit(db, {
    userId: me.id,
    action: "settings.documents",
    entity: "settings",
    summary: `Document settings changed: ${changed.map(([k]) => k).join(", ")}`,
    before: Object.fromEntries(changed.map(([k]) => [k, before[k as keyof typeof before]])),
    after: Object.fromEntries(changed),
  });
  refresh();
}
