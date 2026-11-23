import "server-only";
import { siteDbConfigured } from "@/db/site";
import { listOrders, orderCounts } from "./store";
import type { OrderStatus } from "./store-core";

/**
 * Web shop orders for the Claude connector (lib/mcp): counts per status and one status's newest orders. Lives here
 * because only Website code may open the website database. Null when that database is not set up on this server.
 */
export async function webOrdersSnapshot(status: OrderStatus, limit: number) {
  if (!siteDbConfigured()) return null;
  const [counts, rows] = await Promise.all([orderCounts(), listOrders(status, 1, limit)]);
  return {
    counts,
    orders: rows.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      customer: o.name,
      company: o.company,
      email: o.email,
      phone: o.phone,
      totalAed: Number(o.total),
      payment: o.payment,
      placed: o.createdAt.toISOString().slice(0, 16),
    })),
  };
}

/** Just the counts per status, for the business overview; null when the website database is not set up or not reachable. */
export async function webOrderCounts(): Promise<Record<string, number> | null> {
  if (!siteDbConfigured()) return null;
  return orderCounts().catch(() => null);
}
