import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

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
      isAccountant: schema.users.isAccountant,
      jobTitle: schema.users.jobTitle,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.name));
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
