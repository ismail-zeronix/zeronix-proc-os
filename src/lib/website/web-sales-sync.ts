import "server-only";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { siteDb, siteSchema } from "@/db/site";
import { dubaiToday } from "@/lib/dates";
import { invoiceState } from "@/lib/invoicing";
import { paidByInvoice } from "@/lib/orders-data";

const O = siteSchema.siteOrders;

/**
 * Brings Sales back to the web orders linked to it (the worker, every 5 minutes): the Sales order delivered → the web
 * order Delivered; its invoice paid in full → Paid (unless it is already further along). A cancelled Sales order is not
 * copied over: the web order gets a note for the team to decide. Returns the web orders whose status changed.
 */
export async function syncFromSales(): Promise<{ id: number; number: string; status: "paid" | "delivered" }[]> {
  const open = await siteDb
    .select({ id: O.id, number: O.number, status: O.status, salesOrderId: O.salesOrderId, syncNote: O.syncNote })
    .from(O)
    .where(and(isNotNull(O.salesOrderId), inArray(O.status, ["new", "confirmed", "paid", "shipped"])));
  if (!open.length) return [];
  const ids = open.map((o) => o.salesOrderId!);
  const [orders, invs] = await Promise.all([
    db.select({ id: schema.salesOrders.id, number: schema.salesOrders.number, status: schema.salesOrders.status, deliveredOn: schema.salesOrders.deliveredOn }).from(schema.salesOrders).where(inArray(schema.salesOrders.id, ids)),
    db
      .select({ id: schema.invoices.id, orderId: schema.invoices.orderId, status: schema.invoices.status, total: schema.invoices.total, creditedTotal: schema.invoices.creditedTotal, dueDate: schema.invoices.dueDate })
      .from(schema.invoices)
      .where(and(inArray(schema.invoices.orderId, ids), ne(schema.invoices.status, "cancelled"))),
  ]);
  const paid = await paidByInvoice(invs.map((i) => i.id));
  const today = dubaiToday();
  const changed: { id: number; number: string; status: "paid" | "delivered" }[] = [];
  for (const w of open) {
    const so = orders.find((x) => x.id === w.salesOrderId);
    if (!so || so.status === "cancelled") {
      const note = so ? `Sales order ${so.number} was cancelled. Cancel this web order too, or make a new Sales order.` : "The Sales order no longer exists.";
      if (w.syncNote !== note) await siteDb.update(O).set({ syncNote: note, updatedAt: new Date() }).where(eq(O.id, w.id));
      continue;
    }
    const inv = invs.find((i) => i.orderId === so.id);
    const isPaid = inv ? invoiceState(inv, paid.get(inv.id) ?? 0, today).key === "paid" : false;
    const isDelivered = Boolean(so.deliveredOn);
    // delivered wins: it is the last step; paid moves an order that is not yet shipped or delivered
    const next = isDelivered ? "delivered" : isPaid && (w.status === "new" || w.status === "confirmed") ? "paid" : null;
    if (next && next !== w.status) {
      await siteDb.update(O).set({ status: next, syncNote: "", updatedAt: new Date() }).where(eq(O.id, w.id));
      changed.push({ id: w.id, number: w.number, status: next });
    }
  }
  return changed;
}
