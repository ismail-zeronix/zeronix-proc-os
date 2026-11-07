import type { db } from "@/db";

/** A Drizzle transaction, as handed to db.transaction(async (tx) => …). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
