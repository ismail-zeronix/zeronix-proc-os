"use server";

import { assertZeronixFeatures } from "@/lib/edition";
import { and, asc, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { importBillTx, importInvoiceTx } from "@/lib/ledger/import-docs";
import { bankAccountOptions } from "@/lib/ledger/data";
import { currentOrgId, setTxOrg } from "@/lib/org";
import { PURCHASE_TAX_CODES, SALES_TAX_CODES } from "@/lib/tax/doc-tax";
import { supplierOptions } from "@/lib/purchases-data";
import { normName } from "@/lib/sales";
import { getSetting } from "@/lib/settings";
import { parseInput, UserError } from "@/lib/user-error";
import { dayString } from "@/lib/validation";

/**
 * Importing invoices and supplier bills from a pasted CSV (Accounts › Invoices / Bills › Import). The review table in the
 * browser sends one document per call, so each is its own transaction: one that fails never undoes the others.
 */
const day = dayString("Pick a valid date");
const id = z.number().int().positive();

const paidSchema = z
  .object({
    amount: z.number().positive("The paid amount must be above zero").max(1e10),
    date: day,
    method: z.enum(["cash", "bank"]),
    bankAccountId: id.nullable().default(null),
    reference: z.string().trim().max(120).default(""),
  })
  .nullable()
  .default(null);

const lineSchema = (codes: readonly [string, ...string[]]) =>
  z.object({
    description: z.string().trim().min(1, "Describe each line").max(500),
    qty: z.number().positive("Quantity must be above zero").max(1e7),
    price: z.number().min(0, "Price cannot be below zero").max(1e10),
    kind: z.enum(["product", "service"]).default("product"),
    taxCode: z.enum(codes),
  });

const invoiceSchema = z
  .object({
    number: z.string().trim().min(1, "Enter the invoice number").max(40),
    date: day,
    termsDays: z.number().int().min(0).max(365),
    customerRef: z.string().trim().max(60).default(""),
    address: z.string().trim().max(500).default(""),
    basis: z.enum(["net", "gross"]),
    lines: z.array(lineSchema(SALES_TAX_CODES)).min(1, "Add at least one line").max(300),
    partyId: id.nullable().default(null),
    newParty: z.object({ name: z.string().trim().min(2, "Enter the customer name").max(200), address: z.string().trim().max(500).default("") }).nullable().default(null),
    paid: paidSchema,
  })
  .refine((v) => v.partyId || v.newParty, { message: "Pick the customer." });
export type ImportInvoiceActionInput = z.input<typeof invoiceSchema>;

const billSchema = z
  .object({
    number: z.string().trim().min(1, "Enter the supplier's invoice number").max(60),
    date: day,
    termsDays: z.number().int().min(0).max(365),
    category: z.string().trim().min(1, "Pick a category"),
    notes: z.string().trim().max(1000).default(""),
    basis: z.enum(["net", "gross"]),
    vatOverride: z.number().min(0).max(1e10).nullable().default(null),
    lines: z.array(lineSchema(PURCHASE_TAX_CODES)).min(1, "Add at least one line").max(200),
    partyId: id.nullable().default(null),
    newParty: z.object({ name: z.string().trim().min(2, "Enter the supplier name").max(160) }).nullable().default(null),
    paid: paidSchema,
  })
  .refine((v) => v.partyId || v.newParty, { message: "Pick the supplier." });
export type ImportBillActionInput = z.input<typeof billSchema>;

/** What the review table needs before it can check anything: today, whether invoices can be issued, bank accounts, suppliers. */
export async function importContext(kind: "invoice" | "bill") {
  assertZeronixFeatures(); // Zeronix's own feature (lib/edition.ts)
  await assertFinance();
  const orgId = await currentOrgId();
  const [trn, banks, suppliers] = await Promise.all([getSetting("quote_trn"), bankAccountOptions(orgId), kind === "bill" ? supplierOptions() : Promise.resolve([])]);
  return { today: dubaiToday(), hasOurTrn: !!trn.trim(), banks: banks.map((b) => ({ id: b.id, name: b.name, kind: b.kind })), suppliers };
}

export interface CustomerMatch {
  exact: { id: number; name: string } | null;
  maybe: { id: number; name: string }[];
}

/** For each name in the paste: the customer it is (same name once LLC, spaces and case are ignored) and a few close ones. */
export async function matchCustomers(names: string[]): Promise<Record<string, CustomerMatch>> {
  assertZeronixFeatures(); // Zeronix's own feature (lib/edition.ts)
  await assertFinance();
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 1000);
  const out: Record<string, CustomerMatch> = {};
  if (!unique.length) return out;
  const c = schema.companies;
  const norms = unique.map((n) => normName(n)).filter(Boolean);
  const same = norms.length ? await db.select({ id: c.id, name: c.name, nameNorm: c.nameNorm }).from(c).where(inArray(c.nameNorm, norms)).orderBy(asc(c.id)) : [];
  for (const name of unique) {
    const n = normName(name);
    const exact = same.find((x) => x.nameNorm === n) ?? null;
    let maybe: { id: number; name: string }[] = [];
    if (!exact && n.length >= 3) {
      const r = await db.execute(sql`select id, name from companies where similarity(name_norm, ${n}) > 0.4 order by similarity(name_norm, ${n}) desc limit 3`);
      maybe = (r.rows as { id: number; name: string }[]).map((x) => ({ id: Number(x.id), name: x.name }));
    }
    out[name] = { exact: exact ? { id: exact.id, name: exact.name } : null, maybe };
  }
  return out;
}

/** Which of these are already in the system: invoice numbers, or "supplierId|their invoice number" for bills. */
export async function existingDocs(kind: "invoice" | "bill", items: { number: string; partyId?: number | null }[]): Promise<string[]> {
  assertZeronixFeatures(); // Zeronix's own feature (lib/edition.ts)
  await assertFinance();
  const numbers = [...new Set(items.map((i) => i.number.trim()).filter(Boolean))].slice(0, 2000);
  if (!numbers.length) return [];
  if (kind === "invoice") {
    const rows = await db.select({ number: schema.invoices.number }).from(schema.invoices).where(inArray(schema.invoices.number, numbers));
    return rows.map((r) => r.number);
  }
  const b = schema.bills;
  const rows = await db
    .select({ supplierId: b.supplierId, ref: b.supplierRef })
    .from(b)
    .where(and(inArray(b.supplierRef, numbers), ne(b.status, "void")));
  return rows.filter((r) => r.supplierId != null).map((r) => `${r.supplierId}|${r.ref.toLowerCase()}`);
}

function refresh() {
  revalidatePath("/accounts", "layout");
  revalidatePath("/sales", "layout");
}

/** Saves one imported invoice (with its receipt if it was paid), keeping its number. */
export async function importInvoice(input: ImportInvoiceActionInput) {
  assertZeronixFeatures(); // Zeronix's own feature (lib/edition.ts)
  const me = await assertFinance();
  const d = parseInput(invoiceSchema, input);
  if (!(await getSetting("quote_trn")).trim()) throw new UserError("Add our TRN in Accounts › Settings › VAT registration first: a tax invoice must show it.");
  const orgId = await currentOrgId();
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    return importInvoiceTx(tx, orgId, me.id, d);
  });
  refresh();
  return r;
}

/** Saves one imported supplier bill (with its payment voucher if it was paid). */
export async function importBill(input: ImportBillActionInput) {
  assertZeronixFeatures(); // Zeronix's own feature (lib/edition.ts)
  const me = await assertFinance();
  const d = parseInput(billSchema, input);
  const orgId = await currentOrgId();
  const r = await db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    return importBillTx(tx, orgId, me.id, d);
  });
  refresh();
  return r;
}

