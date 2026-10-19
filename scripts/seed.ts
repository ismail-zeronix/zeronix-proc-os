/** Creates the first admin user (from env) if no users exist. Safe to run repeatedly. */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { count } from "drizzle-orm";
import { db, pool, schema } from "../src/db";

async function main() {
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  if (n === 0) {
    const email = (process.env.ADMIN_EMAIL ?? "admin@zeronix.local").toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
    await db.insert(schema.users).values({
      name: "Administrator",
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "admin",
    });
    console.log(`created admin user ${email}`);
  } else {
    console.log("users already exist, skipping admin seed");
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
