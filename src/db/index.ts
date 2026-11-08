import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    // a database that does not answer fails the request in 10 s instead of hanging it
    connectionTimeoutMillis: 10_000,
  });

if (!globalForDb.pgPool) {
  // an idle connection dropping (Postgres restarted, network blip) is logged, never allowed to crash the server
  pool.on("error", (e) => console.error("[db] idle connection error:", e.message));
}
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
