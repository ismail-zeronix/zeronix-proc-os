import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { resolveScope } from "./org-context";
import * as schema from "./schema";

/**
 * The connection pool. Every connection it hands out first tells Postgres which organisation (tenant) it works for
 * (app.org_id), taken from runAsOrg() or the signed-in user's session (db/org-context.ts). The row-level-security
 * policies on every table then show and accept that organisation's rows only; with no organisation the setting is
 * empty and they show nothing. So the hundreds of queries in the app never name the organisation themselves.
 * The setting is only sent again when a connection changes organisation.
 */
class OrgPool extends Pool {
  // pg-pool calls connect(callback) from query(); drizzle calls connect() for transactions. Both go through here.
  connect(): Promise<PoolClient>;
  connect(callback: (err: Error | undefined, client: PoolClient | undefined, done: (release?: unknown) => void) => void): void;
  connect(callback?: (err: Error | undefined, client: PoolClient | undefined, done: (release?: unknown) => void) => void): Promise<PoolClient> | void {
    const scope = resolveScope();
    const scoped = async (client: PoolClient) => {
      const { org, readOnly } = await scope;
      const value = String(org ?? "");
      const ro = readOnly ? "on" : "off";
      const c = client as PoolClient & { __zxOrg?: string };
      if (c.__zxOrg !== `${value}|${ro}`) {
        // a read-only support visit: Postgres itself refuses every write made for this request
        await client.query("SELECT set_config('app.org_id', $1, false), set_config('default_transaction_read_only', $2, false)", [value, ro]);
        c.__zxOrg = `${value}|${ro}`;
      }
      return client;
    };
    if (!callback) {
      return super.connect().then(async (client) => {
        try {
          return await scoped(client);
        } catch (e) {
          client.release(e as Error);
          throw e;
        }
      });
    }
    super.connect((err, client, done) => {
      if (err || !client) return callback(err, client, done);
      scoped(client).then(
        () => callback(undefined, client, done),
        (e: Error) => {
          done(e);
          callback(e, undefined, () => {});
        },
      );
    });
  }
}

const globalForDb = globalThis as unknown as { pgPool?: Pool };

const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  // a database that does not answer fails the request in 10 s instead of hanging it
  connectionTimeoutMillis: 10_000,
};

export const pool: Pool = globalForDb.pgPool ?? new OrgPool(config);

if (!globalForDb.pgPool) {
  // an idle connection dropping (Postgres restarted, network blip) is logged, never allowed to crash the server
  pool.on("error", (e) => console.error("[db] idle connection error:", e.message));
}
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
export { runAsOrg } from "./org-context";
