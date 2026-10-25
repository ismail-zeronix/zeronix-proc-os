import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export async function ollamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${process.env.OLLAMA_URL ?? "http://localhost:11434"}/api/tags`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const data = (await res.json()) as { models?: { name: string; size: number }[] };
    return (data.models ?? []).map((m) => m.name).sort();
  } catch {
    return [];
  }
}

/** When a started AI looks at the queue next (ISO), or null when stopped or already due. */
export function nextLook(s: { ai_running: string; ai_last_run_at: string; ai_interval_minutes: string }, now = Date.now()): string | null {
  const last = Date.parse(s.ai_last_run_at);
  const at = last + (Number(s.ai_interval_minutes) || 5) * 60_000;
  return s.ai_running === "true" && Number.isFinite(last) && at > now ? new Date(at).toISOString() : null;
}

export function listUsers() {
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      isActive: schema.users.isActive,
      apps: schema.users.apps,
      dataScope: schema.users.dataScope,
      jobTitle: schema.users.jobTitle,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.name));
}

export function queueCounts() {
  return db
    .select({ status: schema.priceLists.status, n: sql<number>`count(*)::int` })
    .from(schema.priceLists)
    .where(sql`${schema.priceLists.status} IN ('queued', 'parsing')`)
    .groupBy(schema.priceLists.status);
}

export function listFeeds() {
  return db
    .select({
      supplierId: schema.supplierFeeds.supplierId,
      supplier: schema.suppliers.name,
      intervalMinutes: schema.supplierFeeds.intervalMinutes,
      enabled: schema.supplierFeeds.enabled,
      lastCheckedAt: schema.supplierFeeds.lastCheckedAt,
      lastStatus: schema.supplierFeeds.lastStatus,
      lastMessage: schema.supplierFeeds.lastMessage,
    })
    .from(schema.supplierFeeds)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierFeeds.supplierId))
    .orderBy(asc(schema.suppliers.name));
}
