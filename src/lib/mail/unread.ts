import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Unread emails among the saved latest messages (checked every few minutes), for the Mail tile badge. */
export async function unreadCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.mailMessages)
    .where(and(eq(schema.mailMessages.userId, userId), eq(schema.mailMessages.seen, false)));
  return row?.n ?? 0;
}
