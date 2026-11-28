import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { lineKindOf } from "@/lib/items";
import { currentOrgId } from "@/lib/org";
import type { Tx } from "@/lib/tx";
import { UserError } from "@/lib/user-error";

/**
 * The items document lines point at, checked: each must be an item of this organisation (a foreign key alone does not
 * see the organisation). Returns their kinds, so an invoice line can follow its item (goods → product sales, service →
 * services). Lines without an item are fine.
 */
export async function lineItems(tx: Tx | typeof db, ids: readonly (number | null | undefined)[], orgId?: number): Promise<Map<number, { kind: "goods" | "service"; lineKind: "product" | "service" }>> {
  const want = [...new Set(ids.filter((i): i is number => typeof i === "number" && i > 0))];
  if (!want.length) return new Map();
  const org = orgId ?? (await currentOrgId());
  const rows = await tx.select({ id: schema.items.id, kind: schema.items.kind }).from(schema.items).where(and(eq(schema.items.organizationId, org), inArray(schema.items.id, want)));
  if (rows.length !== want.length) throw new UserError("A line points at an item that no longer exists. Pick the item again.");
  return new Map(rows.map((r) => [r.id, { kind: r.kind, lineKind: lineKindOf(r.kind) }]));
}
