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
 * - A company is visible to its owner and to anyone with a deal there; its contacts follow the company.
 *
 * Lists filter with the SQL helpers below; detail pages and server actions check one record with `canSee*` / `assert*`.
 */
export interface Viewer {
  id: number;
  seesAll: boolean;
}

export const viewerOf = (a: Access): Viewer => ({ id: a.user.id, seesAll: a.seesAll });

/** Accounts (finance) works on every order and invoice, so it sees all of them and their files, whoever the deal belongs to. */
export const financeViewerOf = (a: Access): Viewer => ({ id: a.user.id, seesAll: a.seesAll || a.apps.includes("accounts") });

/** The signed-in person as a Viewer (for server actions and route handlers). */
export async function currentViewer(): Promise<Viewer> {
  const access = await loadAccess();
  if (!access) throw new Error("You are not signed in");
  return viewerOf(access);
}

/** SQL condition: the deal with this id is one the viewer may see. */
export function dealVisible(v: Viewer, dealId: SQLWrapper): SQL {
  if (v.seesAll) return sql`TRUE`;
  return sql`EXISTS (SELECT 1 FROM deal_assignees va WHERE va.deal_id = ${dealId} AND va.user_id = ${v.id})`;
}

/** SQL condition: the company with this id is one the viewer may see (they own it, or are on one of its deals). */
export function companyVisible(v: Viewer, companyId: SQLWrapper): SQL {
  if (v.seesAll) return sql`TRUE`;
  return sql`(EXISTS (SELECT 1 FROM companies vc WHERE vc.id = ${companyId} AND vc.owner_id = ${v.id})
    OR EXISTS (SELECT 1 FROM deals vd JOIN deal_assignees va ON va.deal_id = vd.id WHERE vd.company_id = ${companyId} AND va.user_id = ${v.id}))`;
}

/** SQL condition for a file: unlinked files are shared with everyone; linked ones follow their company / deal / order / invoice. */
export function fileVisible(v: Viewer, relatedType: SQLWrapper, relatedId: SQLWrapper): SQL {
  if (v.seesAll) return sql`TRUE`;
  return sql`(${relatedType} IS NULL
    OR (${relatedType} = 'company' AND ${companyVisible(v, relatedId)})
    OR (${relatedType} = 'deal' AND ${dealVisible(v, relatedId)})
    OR (${relatedType} = 'order' AND EXISTS (SELECT 1 FROM sales_orders fo WHERE fo.id = ${relatedId} AND ${dealVisible(v, sql`fo.deal_id`)}))
    OR (${relatedType} = 'invoice' AND EXISTS (SELECT 1 FROM invoices fi WHERE fi.id = ${relatedId} AND ${dealVisible(v, sql`fi.deal_id`)})))`;
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

export async function canSeeCompany(v: Viewer, companyId: number): Promise<boolean> {
  if (v.seesAll) return true;
  const r = await db.execute(sql`SELECT 1 WHERE ${companyVisible(v, sql`${companyId}::int`)}`);
  return r.rows.length > 0;
}

// a record you may not see reads exactly like one that does not exist
const GONE = "That record does not exist or is not assigned to you.";

/** For server actions: throws unless the signed-in person may see (and so work on) this deal. */
export async function assertDeal(dealId: number): Promise<Viewer> {
  const v = await currentViewer();
  if (!(await canSeeDeal(v, dealId))) throw new Error(GONE);
  return v;
}

export async function assertCompany(companyId: number): Promise<Viewer> {
  const v = await currentViewer();
  if (!(await canSeeCompany(v, companyId))) throw new Error(GONE);
  return v;
}

/** The deal a quote / order / deal line belongs to, so actions on them can check the deal. */
export async function dealOf(table: "quotes" | "sales_orders" | "deal_items", id: number): Promise<number | null> {
  const r = await db.execute<{ deal_id: number }>(sql`SELECT deal_id FROM ${sql.identifier(table)} WHERE id = ${id}`);
  return r.rows[0]?.deal_id ?? null;
}

export async function assertDealOf(table: "quotes" | "sales_orders" | "deal_items", id: number): Promise<Viewer> {
  const dealId = await dealOf(table, id);
  if (dealId == null) throw new Error(GONE);
  return assertDeal(dealId);
}

export async function assertContact(contactId: number): Promise<Viewer> {
  const r = await db.execute<{ company_id: number }>(sql`SELECT company_id FROM contacts WHERE id = ${contactId}`);
  const companyId = r.rows[0]?.company_id;
  if (companyId == null) throw new Error(GONE);
  return assertCompany(companyId);
}
