import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema } from "@/db";
import { addDays } from "@/lib/quotation";
import type { Tx } from "@/lib/tx";

/**
 * Small ledger reads shared by document posting (documents.ts) and stock posting (stock-docs.ts): when the ledger
 * starts, the first open day after the lock date, a document's live entry, and what a bill still has in Inventory.
 */

/** The day the ledger starts, or null while it is not switched on. */
export async function ledgerStart(tx: Tx, orgId: number): Promise<string | null> {
  const [s] = await tx.select({ cutover: schema.accountingSettings.cutoverDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
  return s?.cutover ?? null;
}

export const posts = (start: string | null, date: string) => !!start && date >= start;

/** This day, or the first day after the lock date when it is locked. */
export async function firstOpenDay(tx: Tx, orgId: number, day: string): Promise<string> {
  const [s] = await tx.select({ lockDate: schema.accountingSettings.lockDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
  return s?.lockDate && day <= s.lockDate ? addDays(s.lockDate, 1) : day;
}

export async function liveEntry(tx: Tx, orgId: number, sourceType: string, sourceId: number, purpose = "post") {
  const e = schema.journalEntries;
  const rev = alias(schema.journalEntries, "rev");
  const [row] = await tx
    .select({ id: e.id, reversedBy: rev.id })
    .from(e)
    .leftJoin(rev, eq(rev.reversalOfId, e.id))
    .where(and(eq(e.organizationId, orgId), eq(e.sourceType, sourceType), eq(e.sourceId, sourceId), eq(e.purpose, purpose)));
  return row ?? null;
}

/**
 * What one bill or expense still has in Inventory (1310, goods not tracked by item): what it posted there, less what has
 * moved on to cost of goods sold or into item stock (1330), net of reversals.
 */
export async function inStockOf(tx: Tx, orgId: number, sourceType: string, sourceId: number): Promise<number> {
  const e = schema.journalEntries;
  const l = schema.journalLines;
  const rev = alias(schema.journalEntries, "rev");
  const [{ inStock }] = await tx
    .select({ inStock: sql<number>`coalesce(sum(${l.debit} - ${l.credit}), 0)::float` })
    .from(l)
    .innerJoin(e, eq(e.id, l.entryId))
    .innerJoin(schema.ledgerAccounts, eq(schema.ledgerAccounts.id, l.accountId))
    .leftJoin(rev, eq(rev.reversalOfId, e.id))
    .where(and(eq(e.organizationId, orgId), eq(e.sourceType, sourceType), eq(e.sourceId, sourceId), isNull(e.reversalOfId), isNull(rev.id), eq(schema.ledgerAccounts.systemKey, "inventory")));
  return Math.round(inStock * 100) / 100;
}
