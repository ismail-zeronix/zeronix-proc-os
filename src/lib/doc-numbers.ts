import "server-only";
import { eq, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { db as Db } from "@/db";
import { schema } from "@/db";
import { invoiceNumber } from "@/lib/invoicing";
import { SETTING_DEFAULTS } from "@/lib/settings";
import { UserError } from "@/lib/user-error";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/** One lock key per series, so two people saving at the same moment wait for each other instead of taking the same number. */
const LOCKS = { order: 7021, delivery: 7022, invoice: 7023, credit: 7024, debit: 7032, refund: 7033, receipt: 7025, bill: 7026, voucher: 7027, project: 7031 } as const;

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

export interface SeriesSpec {
  orgId: number;
  /** "journal", ... one series per key per organisation. */
  key: string;
  /** Printed before the number: JV → JV-2026-0001 (yearly) or JV-0001 (fiscalYear 0). */
  prefix: string;
  /** The fiscal year the series restarts in; 0 = one running series. */
  fiscalYear?: number;
  digits?: number;
}

/** JV-2026-0007, or JV-0007 when the series does not restart each year. */
export function seriesNumber(prefix: string, fiscalYear: number, seq: number, digits = 4): string {
  const n = String(seq).padStart(digits, "0");
  return fiscalYear ? `${prefix}-${fiscalYear}-${n}` : `${prefix}-${n}`;
}

/**
 * The next number of a series kept in doc_series (per organisation, key and fiscal year). Call it inside the transaction
 * that saves the document: the one upsert moves the series on and row-locks it, so two saves at the same moment wait for
 * each other, and a save that fails rolls the number back (no gaps). Prefix and digits are fixed by the first use.
 */
export async function takeSeriesNumber(tx: Tx, spec: SeriesSpec): Promise<{ seq: number; number: string }> {
  const fy = spec.fiscalYear ?? 0;
  const res = await tx.execute<{ seq: number; prefix: string; digits: number }>(sql`
    INSERT INTO doc_series (organization_id, key, fiscal_year, prefix, next_number, digits)
    VALUES (${spec.orgId}, ${spec.key}, ${fy}, ${spec.prefix}, 2, ${spec.digits ?? 4})
    ON CONFLICT (organization_id, key, fiscal_year)
    DO UPDATE SET next_number = doc_series.next_number + 1, updated_at = now()
    RETURNING next_number - 1 AS seq, prefix, digits`);
  const row = res.rows[0];
  return { seq: Number(row.seq), number: seriesNumber(row.prefix, fy, Number(row.seq), Number(row.digits)) };
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
  if (taken) throw new UserError(`Invoice number ${number} is already used. An accountant should set the next invoice number in Accounts › Settings › Document numbers.`);
  await tx
    .insert(schema.settings)
    .values({ key: "invoice_next_number", value: String(next + 1) })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: String(next + 1), updatedAt: new Date() } });
  return number;
}
