import "server-only";
import { eq, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { db as Db } from "@/db";
import { schema } from "@/db";
import { invoiceNumber } from "@/lib/invoicing";
import { SETTING_DEFAULTS } from "@/lib/settings";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/** One lock key per series, so two people saving at the same moment wait for each other instead of taking the same number. */
const LOCKS = { order: 7021, delivery: 7022, invoice: 7023, credit: 7024, receipt: 7025, bill: 7026, voucher: 7027, project: 7031 } as const;

/** The next running number of a per-year series (orders, delivery notes, credit notes, receipts). Call inside the transaction that saves it. */
export async function nextSeq(tx: Tx, series: keyof typeof LOCKS, table: PgTable, yearCol: PgColumn, seqCol: PgColumn, year: number): Promise<number> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCKS[series]})`);
  const [r] = await tx
    .select({ n: sql<number>`coalesce(max(${seqCol}), 0)::int` })
    .from(table)
    .where(eq(yearCol, year));
  return r.n + 1;
}

async function readSetting(tx: Tx, key: "invoice_prefix" | "invoice_next_number" | "invoice_digits"): Promise<string> {
  const [row] = await tx.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value ?? SETTING_DEFAULTS[key];
}

/**
 * Takes the next invoice number from the Admin series and moves the series on by one, in the same transaction that saves
 * the invoice: if saving fails, the number is not used up, so there are no gaps.
 */
export async function takeInvoiceNumber(tx: Tx): Promise<string> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCKS.invoice})`);
  const prefix = await readSetting(tx, "invoice_prefix");
  const next = Math.max(1, Math.floor(Number(await readSetting(tx, "invoice_next_number")) || 1));
  const digits = Math.floor(Number(await readSetting(tx, "invoice_digits")) || 5);
  const number = invoiceNumber(prefix, next, digits);
  const [taken] = await tx.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.number, number));
  if (taken) throw new Error(`Invoice number ${number} is already used. An admin should set the next invoice number in Admin → Settings → Documents.`);
  await tx
    .insert(schema.settings)
    .values({ key: "invoice_next_number", value: String(next + 1) })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: String(next + 1), updatedAt: new Date() } });
  return number;
}
