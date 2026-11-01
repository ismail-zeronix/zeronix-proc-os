/**
 * Applies migrations (pg_trgm first). Used by `npm run db:migrate` and the Docker entrypoint. When SITE_DATABASE_URL is
 * set it also migrates the website's own database (src/db/site-migrations), so deploys need no extra step.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await migrate(drizzle(pool), { migrationsFolder: "./src/db/migrations" });
  await pool.end();
  console.log("migrations applied");

  if (process.env.SITE_DATABASE_URL) {
    const site = new Pool({ connectionString: process.env.SITE_DATABASE_URL });
    await migrate(drizzle(site), { migrationsFolder: "./src/db/site-migrations" });
    await site.end();
    console.log("website database migrations applied");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
