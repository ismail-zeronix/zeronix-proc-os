import "server-only";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";

/** Returns true once the first administrator account exists. */
export async function isSetupComplete(): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  return n > 0;
}
