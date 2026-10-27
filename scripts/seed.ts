/** Administrator accounts are created through the one-time /setup wizard. */
import "dotenv/config";
import { pool } from "../src/db";

async function main() {
  console.log("Admin seeding is disabled. Complete first-run setup at /setup.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
