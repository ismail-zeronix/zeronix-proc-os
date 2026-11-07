/**
 * Runs once before the test files: makes a fresh, empty `procurement_test` database on the same Postgres server and
 * migrates it. Every test file gets it as DATABASE_URL (vitest.config.mts), so tests can never touch the dev data.
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export const TEST_DB = "procurement_test";

export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) return; // no database here: the tests that need one skip themselves
  const onDb = (name: string) => {
    const u = new URL(url);
    u.pathname = `/${name}`;
    return u.toString();
  };
  const admin = new Pool({ connectionString: onDb("postgres") });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const pool = new Pool({ connectionString: onDb(TEST_DB) });
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL("../src/db/migrations", import.meta.url)) });
  await pool.end();
}
