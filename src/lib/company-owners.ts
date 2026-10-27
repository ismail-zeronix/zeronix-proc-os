import "server-only";
import { eq, sql, type SQLWrapper } from "drizzle-orm";
import { db, schema } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface Owner {
  id: number;
  name: string;
}

/**
 * SQL for a company's owners as a JSON array of {id, name}, main owner first. Companies nobody has shared yet have no
 * company_owners rows, so they fall back to companies.owner_id.
 */
export function ownersJson(companyId: SQLWrapper, ownerId: SQLWrapper) {
  return sql<Owner[]>`coalesce(
    (SELECT json_agg(json_build_object('id', ou.id, 'name', ou.name) ORDER BY oo.position) FROM company_owners oo JOIN users ou ON ou.id = oo.user_id WHERE oo.company_id = ${companyId}),
    (SELECT json_agg(json_build_object('id', ou.id, 'name', ou.name)) FROM users ou WHERE ou.id = ${ownerId}),
    '[]'::json)`;
}

/** Replaces a company's owners. The first one becomes the main owner (companies.owner_id). */
export async function saveCompanyOwners(tx: Tx, companyId: number, userIds: number[]) {
  await tx.delete(schema.companyOwners).where(eq(schema.companyOwners.companyId, companyId));
  if (userIds.length) await tx.insert(schema.companyOwners).values(userIds.map((userId, position) => ({ companyId, userId, position })));
  await tx.update(schema.companies).set({ ownerId: userIds[0] ?? null }).where(eq(schema.companies.id, companyId));
}

/** A company's owners in order (with the owner_id fallback). */
export async function companyOwners(companyId: number): Promise<Owner[]> {
  const r = await db.execute<{ owners: Owner[] }>(sql`SELECT ${ownersJson(sql`c.id`, sql`c.owner_id`)} AS owners FROM companies c WHERE c.id = ${companyId}`);
  return r.rows[0]?.owners ?? [];
}
