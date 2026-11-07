import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Tests run on their own database (tests/setup-test-db.ts), never on the dev data. */
function testDatabaseUrl(): Record<string, string> {
  const url = process.env.DATABASE_URL;
  if (!url) return {};
  const u = new URL(url);
  u.pathname = "/procurement_test";
  return { DATABASE_URL: u.toString() };
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15 * 60_000,
    // one file at a time: several share settings such as the invoice series
    fileParallelism: false,
    globalSetup: ["./tests/setup-test-db.ts"],
    env: testDatabaseUrl(),
  },
});
