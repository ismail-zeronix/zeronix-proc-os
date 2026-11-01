import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/** The website's own database (src/db/site.ts). `npm run db:site:generate` after changing src/db/site-schema.ts. */
export default defineConfig({
  schema: "./src/db/site-schema.ts",
  out: "./src/db/site-migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.SITE_DATABASE_URL! },
});
