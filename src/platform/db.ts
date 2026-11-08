import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

/**
 * The platform console's own database connection: PLATFORM_DATABASE_URL, a role with BYPASSRLS (zx_platform) that sees
 * every organisation. Only src/platform and the /platform pages may import it (eslint.config.mjs); the tenant app always
 * goes through @/db, scoped to one organisation. Without PLATFORM_DATABASE_URL it falls back to DATABASE_URL: a
 * single-company install (owner role) still works, and a SaaS install without it simply sees no organisations.
 */
const g = globalThis as unknown as { platformPool?: Pool };

const pool =
  g.platformPool ??
  new Pool({ connectionString: process.env.PLATFORM_DATABASE_URL ?? process.env.DATABASE_URL, max: Number(process.env.PLATFORM_DB_POOL_MAX ?? 3), connectionTimeoutMillis: 10_000 });
if (!g.platformPool) pool.on("error", (e) => console.error("[platform-db] idle connection error:", e.message));
if (process.env.NODE_ENV !== "production") g.platformPool = pool;

export const platformDb = drizzle(pool, { schema });
export const platformPool = pool;
export { schema };
