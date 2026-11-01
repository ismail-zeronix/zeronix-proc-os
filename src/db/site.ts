import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as siteSchema from "./site-schema";

/**
 * The website's own database (zeronix-site-db, SITE_DATABASE_URL; WEBSITE-PLAN.md section 2). Only the Website code
 * imports this: src/lib/website, src/app/api/site, src/app/(app)/website and the worker's website jobs. The pool opens
 * on first use, so the rest of ZeronixOS starts and runs the same whether this database is set up, down or missing.
 */
export type SiteDb = NodePgDatabase<typeof siteSchema>;

export class SiteDbUnavailable extends Error {
  constructor(message = "The website database is not set up (SITE_DATABASE_URL)") {
    super(message);
    this.name = "SiteDbUnavailable";
  }
}

const g = globalThis as unknown as { siteDb?: SiteDb };

export function siteDbConfigured(): boolean {
  return Boolean(process.env.SITE_DATABASE_URL);
}

function connect(): SiteDb {
  if (g.siteDb) return g.siteDb;
  const url = process.env.SITE_DATABASE_URL;
  if (!url) throw new SiteDbUnavailable();
  const pool = new Pool({ connectionString: url, max: Number(process.env.SITE_DB_POOL_MAX ?? 5), connectionTimeoutMillis: 5000 });
  // an idle connection dropping (site-db restarted) must not take the portal down with it
  pool.on("error", (e) => console.error("[site-db]", e.message));
  g.siteDb = drizzle(pool, { schema: siteSchema });
  return g.siteDb;
}

/** Use like `db`. Throws SiteDbUnavailable on first use when SITE_DATABASE_URL is not set. */
export const siteDb = new Proxy({} as SiteDb, {
  get(_, key) {
    const real = connect();
    const value = Reflect.get(real, key);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** True when the website database answers; Website › Overview and the layout use it to explain an outage. */
export async function siteDbReachable(): Promise<{ ok: boolean; detail: string }> {
  if (!siteDbConfigured()) return { ok: false, detail: "SITE_DATABASE_URL is not set" };
  try {
    await connect().execute("select 1");
    return { ok: true, detail: "Connected" };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export { siteSchema };
