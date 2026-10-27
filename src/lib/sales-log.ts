import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Writes an email sent from the Mail app onto a deal's timeline. Server-only on purpose (not a server action),
 * so a browser cannot call it directly; the send route calls it after a successful send.
 */
export async function logEmailOnDeal(dealId: number, userId: number, subject: string, to: string) {
  const [deal] = await db.select({ companyId: schema.deals.companyId }).from(schema.deals).where(eq(schema.deals.id, dealId));
  if (!deal) return;
  await db.insert(schema.activities).values({
    type: "email",
    body: `Sent "${subject || "(no subject)"}" to ${to}.`,
    dealId,
    companyId: deal.companyId,
    userId,
  });
}
