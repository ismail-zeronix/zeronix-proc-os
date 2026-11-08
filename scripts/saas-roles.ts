/**
 * Creates or updates the SaaS database roles (src/db/roles.ts) after the migrations, as the database owner:
 *   DATABASE_URL=<owner> ZX_APP_PASSWORD=... ZX_PLATFORM_PASSWORD=... node scripts/saas-roles.js
 * Run on every deploy of a multi-tenant install (production/saas-deploy.sh does): new tables get their grants.
 */
import "dotenv/config";
import { Client } from "pg";
import { appRoleSql, platformRoleSql } from "../src/db/roles";

async function main() {
  const url = process.env.DATABASE_URL;
  const app = process.env.ZX_APP_PASSWORD;
  const platform = process.env.ZX_PLATFORM_PASSWORD;
  if (!url || !app || !platform) throw new Error("Set DATABASE_URL (the owner), ZX_APP_PASSWORD and ZX_PLATFORM_PASSWORD");
  if (app.length < 16 || platform.length < 16) throw new Error("Use passwords of at least 16 characters");
  const db = new Client({ connectionString: url });
  await db.connect();
  const database = new URL(url).pathname.slice(1);
  try {
    for (const stmt of [...appRoleSql("zx_app", app, database), ...platformRoleSql("zx_platform", platform, database)]) await db.query(stmt);
    console.log("roles zx_app and zx_platform ready");
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
