import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dealVisible, type Viewer } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { effectiveStatus, DEFAULT_MARGIN_PCT, DEFAULT_VALID_DAYS, DEFAULT_VAT_PCT } from "@/lib/quotation";
import { getSettings } from "@/lib/settings";

export interface DealItemRow {
  id: number;
  position: number;
  description: string;
  qty: number;
  supplierName: string;
  productId: number | null;
  costAed: number | null;
  marginPct: number | null;
  unitPriceAed: number;
}

/** The lines of a deal, in the order they were added. */
export async function dealItemsOf(dealId: number): Promise<DealItemRow[]> {
  return db
    .select({
      id: schema.dealItems.id,
      position: schema.dealItems.position,
      description: schema.dealItems.description,
      qty: schema.dealItems.qty,
      supplierName: schema.dealItems.supplierName,
      productId: schema.dealItems.productId,
      costAed: schema.dealItems.costAed,
      marginPct: schema.dealItems.marginPct,
      unitPriceAed: schema.dealItems.unitPriceAed,
    })
    .from(schema.dealItems)
    .where(eq(schema.dealItems.dealId, dealId))
    .orderBy(asc(schema.dealItems.position), asc(schema.dealItems.id));
}

export interface QuoteSummary {
  id: number;
  number: string;
  dealId: number;
  dealTitle: string;
  companyId: number;
  companyName: string;
  /** What is stored, and what to show (a sent quote past its date shows as expired). */
  status: string;
  shownStatus: string;
  validUntil: string;
  subtotal: number;
  total: number;
  costTotal: number | null;
  createdByName: string;
  createdAt: Date;
  sentAt: Date | null;
}

const summaryColumns = {
  id: schema.quotes.id,
  number: schema.quotes.number,
  dealId: schema.quotes.dealId,
  dealTitle: schema.deals.title,
  companyId: schema.companies.id,
  companyName: schema.companies.name,
  status: schema.quotes.status,
  validUntil: schema.quotes.validUntil,
  subtotal: schema.quotes.subtotal,
  total: schema.quotes.total,
  costTotal: schema.quotes.costTotal,
  createdByName: sql<string>`coalesce(${schema.users.name}, '')`,
  createdAt: schema.quotes.createdAt,
  sentAt: schema.quotes.sentAt,
};

function summarise<T extends { status: string; validUntil: string }>(rows: T[]): (T & { shownStatus: string })[] {
  const today = dubaiToday();
  return rows.map((r) => ({ ...r, shownStatus: effectiveStatus(r.status, r.validUntil, today) }));
}

function summaryQuery() {
  return db
    .select(summaryColumns)
    .from(schema.quotes)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.quotes.dealId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .leftJoin(schema.users, eq(schema.users.id, schema.quotes.createdBy));
}

export async function quotesOfDeal(dealId: number): Promise<QuoteSummary[]> {
  const rows = await summaryQuery().where(eq(schema.quotes.dealId, dealId)).orderBy(desc(schema.quotes.createdAt));
  return summarise(rows);
}

/** Quotes on the deals the viewer may see, newest first. */
export async function listQuotes(v: Viewer, limit = 500): Promise<QuoteSummary[]> {
  const rows = await summaryQuery().where(dealVisible(v, schema.quotes.dealId)).orderBy(desc(schema.quotes.createdAt)).limit(limit);
  return summarise(rows);
}

/** Everything the quote page needs: the quote, its lines, the customer and the person who prepared it. Null when hidden from the viewer. */
export async function getQuote(id: number, v: Viewer) {
  const [q] = await summaryQuery().where(and(eq(schema.quotes.id, id), dealVisible(v, schema.quotes.dealId)));
  if (!q) return null;
  const [full] = await db
    .select({
      terms: schema.quotes.terms,
      vatPct: schema.quotes.vatPct,
      vatAmount: schema.quotes.vatAmount,
      decidedAt: schema.quotes.decidedAt,
      createdBy: schema.quotes.createdBy,
      contactId: schema.deals.contactId,
      dealStage: schema.deals.stage,
    })
    .from(schema.quotes)
    .innerJoin(schema.deals, eq(schema.deals.id, schema.quotes.dealId))
    .where(eq(schema.quotes.id, id));
  const [items, company, contact, author] = await Promise.all([
    db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, id)).orderBy(asc(schema.quoteItems.position), asc(schema.quoteItems.id)),
    db.select().from(schema.companies).where(eq(schema.companies.id, q.companyId)).then((r) => r[0]),
    full.contactId ? db.select().from(schema.contacts).where(eq(schema.contacts.id, full.contactId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    full.createdBy
      ? db
          .select({ name: schema.users.name, email: schema.users.email, jobTitle: schema.users.jobTitle, phone: schema.users.phone, mobile: schema.users.mobile })
          .from(schema.users)
          .where(eq(schema.users.id, full.createdBy))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return { ...summarise([q])[0], ...full, items, company, contact, author };
}

/** What a new quote starts with, from Admin (or the built-in defaults). */
export async function quoteDefaults() {
  const s = await getSettings();
  const n = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v.trim() !== "" ? Number(v) : fallback);
  return {
    marginPct: n(s.quote_margin_pct, DEFAULT_MARGIN_PCT),
    validDays: Math.max(1, Math.round(n(s.quote_valid_days, DEFAULT_VALID_DAYS))),
    vatPct: n(s.quote_vat_pct, DEFAULT_VAT_PCT),
    terms: s.quote_terms,
    trn: s.quote_trn,
  };
}
