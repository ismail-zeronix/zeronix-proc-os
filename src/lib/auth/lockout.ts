import "server-only";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** After this many wrong passwords for one email inside the window, that email cannot sign in until the window passes. */
export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 15;

/** Minutes until this email may try again, or 0 when it is not locked. */
export async function lockedMinutes(email: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
  const rows = await db
    .select({ at: schema.loginFailures.at })
    .from(schema.loginFailures)
    .where(and(eq(schema.loginFailures.email, email), gt(schema.loginFailures.at, since)))
    .orderBy(schema.loginFailures.at);
  if (rows.length < MAX_FAILURES) return 0;
  // locked until the oldest counted failure leaves the window
  const freeAt = rows[rows.length - MAX_FAILURES].at.getTime() + WINDOW_MINUTES * 60_000;
  return Math.max(1, Math.ceil((freeAt - now.getTime()) / 60_000));
}

export async function recordFailure(email: string, ip: string) {
  await db.insert(schema.loginFailures).values({ email, ip: ip.slice(0, 64) });
  console.warn(`[login] wrong password for ${email} from ${ip || "unknown address"}`);
  // keep the table small: drop entries older than a day
  await db.delete(schema.loginFailures).where(lt(schema.loginFailures.at, sql`now() - interval '1 day'`));
}

/** A successful sign-in clears the count for that email. */
export async function clearFailures(email: string) {
  await db.delete(schema.loginFailures).where(eq(schema.loginFailures.email, email));
}
