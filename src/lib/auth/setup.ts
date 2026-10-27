import "server-only";
import { count } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";

/** Returns true once the first administrator account exists. */
export async function isSetupComplete(): Promise<boolean> {
  // Request time only: the Docker build has no database, so /login and /setup must not prerender this query.
  await connection();
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  return n > 0;
}
