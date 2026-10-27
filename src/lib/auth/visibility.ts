import "server-only";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { loadAccess, type Access } from "./session";

/**
 * Who can see which sales records (the "Own / All" data scope used by most CRMs).
 *
 * - Admins, and users the admin set to "All data", see everything.
 * - Everybody else sees the deals they are assigned to. Several people on one deal all see it and work on it together.
 * - Everything that hangs off a deal follows the deal: its timeline, tasks, lines, quotes, orders and invoices.
 * - A company is visible to its owners and to anyone with a deal there; its contacts follow the company.
 *
 * Lists filter with the SQL helpers below; detail pages and server actions check one record with `canSee*` / `assert*`.
 */
export interface Viewer {
  id: number;
  seesAll: boolean;
}

export const viewerOf = (a: Access): Viewer => ({ id: a.user.id, seesAll: a.seesAll });

/** Accounts at the finance level works on every order and invoice, so it sees all of them and their files, whoever the deal belongs to. */
export const financeViewerOf = (a: Access): Viewer => ({ id: a.user.id, seesAll: a.seesAll || a.finance });

/** The signed-in person as a Viewer (for server actions and route handlers). `finance`: Accounts at the finance level sees every record. */
export async function currentViewer(finance = false): Promise<Viewer> {
  const access = await loadAccess();
  if (!access) throw new Error("You are not signed in");
  return finance ? financeViewerOf(access) : viewerOf(access);
}

/** SQL condition: the deal with this id is one the viewer may see. */
export function dealVisible(v: Viewer, dealId: SQLWrapper): SQL {
  if (v.seesAll) return sql`TRUE`;
  return sql`EXISTS (SELECT 1 FROM deal_assignees va WHERE va.deal_id = ${dealId} AND va.user_id = ${v.id})`;
}

/** SQL condition: the company with this id is one the viewer may see (they are one of its owners, or are on one of its deals). */
export function companyVisible(v: Viewer, companyId: SQLWrapper): SQL {
  if (v.seesAll) return sql`TRUE`;
  return sql`(EXISTS (SELECT 1 FROM companies vc WHERE vc.id = ${companyId} AND vc.owner_id = ${v.id})
    OR EXISTS (SELECT 1 FROM company_owners vco WHERE vco.company_id = ${companyId} AND vco.user_id = ${v.id})
    OR EXISTS (SELECT 1 FROM deals vd JOIN deal_assignees va ON va.deal_id = vd.id WHERE vd.company_id = ${companyId} AND va.user_id = ${v.id}))`;
}

/**
 * SQL condition: a quote the viewer may see. With a deal it follows the deal; an instant quote (no deal) is seen by its
 * salesperson and by whoever typed it.
 */
export function quoteVisible(v: Viewer, q: { dealId: SQLWrapper; ownerId: SQLWrapper; createdBy: SQLWrapper }): SQL {
  if (v.seesAll) return sql`TRUE`;
  return sql`((${q.dealId} IS NOT NULL AND ${dealVisible(v, q.dealId)}) OR (${q.dealId} IS NULL AND (${q.ownerId} = ${v.id} OR ${q.createdBy} = ${v.id})))`;
}

/** SQL condition: an order the viewer may see (by its deal, or, without one, by the quote it came from). */
export function orderVisible(v: Viewer, o: { dealId: SQLWrapper; quoteId: SQLWrapper }): SQL {
  if (v.seesAll) return sql`TRUE`;
  return sql`((${o.dealId} IS NOT NULL AND ${dealVisible(v, o.dealId)}) OR (${o.dealId} IS NULL AND EXISTS (SELECT 1 FROM quotes vq WHERE vq.id = ${o.quoteId} AND (vq.owner_id = ${v.id} OR vq.created_by = ${v.id}))))`;
}

/** SQL condition: an invoice the viewer may see (opening balances: the accounts team only, who see everything). */
export function invoiceVisible(v: Viewer, i: { dealId: SQLWrapper; orderId: SQLWrapper }): SQL {
  if (v.seesAll) return sql`TRUE`;
  return sql`((${i.dealId} IS NOT NULL AND ${dealVisible(v, i.dealId)}) OR (${i.dealId} IS NULL AND EXISTS (SELECT 1 FROM sales_orders vo WHERE vo.id = ${i.orderId} AND ${orderVisible(v, { dealId: sql`vo.deal_id`, quoteId: sql`vo.quote_id` })})))`;
}

/** SQL condition for a file: unlinked files are shared with everyone; linked ones follow their company / deal / order / invoice. */
export function fileVisible(v: Viewer, relatedType: SQLWrapper, relatedId: SQLWrapper): SQL {
  if (v.seesAll) return sql`TRUE`;
  return sql`(${relatedType} IS NULL
    OR (${relatedType} = 'company' AND ${companyVisible(v, relatedId)})
    OR (${relatedType} = 'deal' AND ${dealVisible(v, relatedId)})
    OR (${relatedType} = 'order' AND EXISTS (SELECT 1 FROM sales_orders fo WHERE fo.id = ${relatedId} AND ${orderVisible(v, { dealId: sql`fo.deal_id`, quoteId: sql`fo.quote_id` })}))
    OR (${relatedType} = 'invoice' AND EXISTS (SELECT 1 FROM invoices fi WHERE fi.id = ${relatedId} AND ${invoiceVisible(v, { dealId: sql`fi.deal_id`, orderId: sql`fi.order_id` })})))`;
}

export async function canSeeFile(v: Viewer, fileId: number): Promise<boolean> {
  if (v.seesAll) return true;
  const r = await db.execute(sql`SELECT 1 FROM files f WHERE f.id = ${fileId} AND ${fileVisible(v, sql`f.related_type`, sql`f.related_id`)}`);
  return r.rows.length > 0;
}

export async function canSeeDeal(v: Viewer, dealId: number): Promise<boolean> {
  if (v.seesAll) return true;
  const r = await db.execute(sql`SELECT 1 FROM deal_assignees WHERE deal_id = ${dealId} AND user_id = ${v.id} LIMIT 1`);
  return r.rows.length > 0;
}

export async function canSeeQuote(v: Viewer, quoteId: number): Promise<boolean> {
  if (v.seesAll) return true;
  const r = await db.execute(sql`SELECT 1 FROM quotes q WHERE q.id = ${quoteId} AND ${quoteVisible(v, { dealId: sql`q.deal_id`, ownerId: sql`q.owner_id`, createdBy: sql`q.created_by` })}`);
  return r.rows.length > 0;
}

export async function canSeeOrder(v: Viewer, orderId: number): Promise<boolean> {
  if (v.seesAll) return true;
  const r = await db.execute(sql`SELECT 1 FROM sales_orders o WHERE o.id = ${orderId} AND ${orderVisible(v, { dealId: sql`o.deal_id`, quoteId: sql`o.quote_id` })}`);
  return r.rows.length > 0;
}

export async function canSeeCompany(v: Viewer, companyId: number): Promise<boolean> {
  if (v.seesAll) return true;
  const r = await db.execute(sql`SELECT 1 WHERE ${companyVisible(v, sql`${companyId}::int`)}`);
  return r.rows.length > 0;
}

// a record you may not see reads exactly like one that does not exist
const GONE = "That record does not exist or is not assigned to you.";

/** For server actions: throws unless the signed-in person may see (and so work on) this deal. */
export async function assertDeal(dealId: number, finance = false): Promise<Viewer> {
  const v = await currentViewer(finance);
  if (!(await canSeeDeal(v, dealId))) throw new Error(GONE);
  return v;
}

export async function assertCompany(companyId: number, finance = false): Promise<Viewer> {
  const v = await currentViewer(finance);
  if (!(await canSeeCompany(v, companyId))) throw new Error(GONE);
  return v;
}

/** The deal a quote / order / deal line belongs to, so actions on them can check the deal. */
export async function dealOf(table: "quotes" | "sales_orders" | "deal_items", id: number): Promise<number | null> {
  const r = await db.execute<{ deal_id: number }>(sql`SELECT deal_id FROM ${sql.identifier(table)} WHERE id = ${id}`);
  return r.rows[0]?.deal_id ?? null;
}

/**
 * For actions on a quote, order or deal line: throws unless the viewer may work on it. With a deal it follows the deal;
 * an instant quote (and the order made from it) follows its salesperson and whoever typed it.
 */
export async function assertDealOf(table: "quotes" | "sales_orders" | "deal_items", id: number, finance = false): Promise<Viewer> {
  const exists = await db.execute(sql`SELECT 1 FROM ${sql.identifier(table)} WHERE id = ${id}`);
  if (!exists.rows.length) throw new Error(GONE);
  const dealId = await dealOf(table, id);
  if (dealId != null) return assertDeal(dealId, finance);
  const v = await currentViewer(finance);
  if (v.seesAll) return v;
  const cond =
    table === "quotes"
      ? sql`SELECT 1 FROM quotes q WHERE q.id = ${id} AND (q.owner_id = ${v.id} OR q.created_by = ${v.id})`
      : sql`SELECT 1 FROM sales_orders o JOIN quotes q ON q.id = o.quote_id WHERE o.id = ${id} AND (q.owner_id = ${v.id} OR q.created_by = ${v.id})`;
  if (table === "deal_items" || !(await db.execute(cond)).rows.length) throw new Error(GONE);
  return v;
}

export async function assertContact(contactId: number): Promise<Viewer> {
  const r = await db.execute<{ company_id: number }>(sql`SELECT company_id FROM contacts WHERE id = ${contactId}`);
  const companyId = r.rows[0]?.company_id;
  if (companyId == null) throw new Error(GONE);
  return assertCompany(companyId);
}
