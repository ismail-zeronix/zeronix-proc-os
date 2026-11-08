import "server-only";
import { headers } from "next/headers";
import { ipFromHeaders } from "@/lib/client-ip";
import { db, schema } from "@/db";
import type { Tx } from "@/lib/tx";

export interface AuditEntry {
  userId: number | null;
  /** "invoice.issue", "payment.void", "bill.create" ... */
  action: string;
  entity: string;
  entityId?: number | null;
  /** One line for people reading the trail. */
  summary?: string;
  before?: unknown;
  after?: unknown;
  orgId?: number;
}

async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return ipFromHeaders(h);
  } catch {
    return ""; // scripts and tests have no request
  }
}

/**
 * Writes one row of the audit trail. Call it inside the transaction that makes the change, so the trail and the change
 * are saved (or rolled back) together.
 */
export async function audit(tx: Tx | typeof db, e: AuditEntry): Promise<void> {
  await tx.insert(schema.auditLog).values({
    // left out: the current organisation (the column default reads app.org_id)
    ...(e.orgId ? { organizationId: e.orgId } : {}),
    userId: e.userId,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    summary: e.summary ?? "",
    before: e.before ?? null,
    after: e.after ?? null,
    ip: await clientIp(),
  });
}
