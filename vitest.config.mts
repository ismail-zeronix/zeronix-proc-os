import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests run on their own database (tests/setup-test-db.ts), never on the dev data. They connect as zx_app, the SaaS
 * app's role, so row-level security applies to every query; TEST_ADMIN_DATABASE_URL is the owner, for making test
 * organisations only (tests/helpers/orgs.ts).
 */
function testDatabaseUrl(): Record<string, string> {
  const url = process.env.DATABASE_URL;
  if (!url) return {};
  const admin = new URL(url);
  admin.pathname = "/procurement_test";
  const app = new URL(admin.toString());
  app.username = "zx_app";
  app.password = "zx_app_test_only";
  return { DATABASE_URL: app.toString(), TEST_ADMIN_DATABASE_URL: admin.toString() };
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
