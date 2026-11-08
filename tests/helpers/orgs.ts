/**
 * Test organisations. The app connects as zx_app, under row-level security, so it cannot add an organisation (the
 * platform console does that with its own role). Tests make theirs through the test database owner instead:
 * TEST_ADMIN_DATABASE_URL, set by vitest.config.mts. Returns rows shaped like an insert ... returning({ id }).
 */
import { Pool } from "pg";

let admin: Pool | null = null;
function pool(): Pool {
  const url = process.env.TEST_ADMIN_DATABASE_URL;
  if (!url) throw new Error("TEST_ADMIN_DATABASE_URL is not set (vitest.config.mts)");
  return (admin ??= new Pool({ connectionString: url, max: 2 }));
}

export async function createTestOrg(values: { name: string; emirate?: string; country?: string }): Promise<{ id: number }[]> {
  const r = await pool().query<{ id: number }>("INSERT INTO organizations (name, emirate, country) VALUES ($1, coalesce($2, 'dubai'), coalesce($3, 'AE')) RETURNING id", [
    values.name,
    values.emirate ?? null,
    values.country ?? null,
  ]);
  return r.rows;
}

/** Runs a query as the database owner, skipping row-level security (only for setting up or checking a test). */
export async function adminQuery<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(text, params)).rows;
}

export async function closeAdmin(): Promise<void> {
  await admin?.end();
  admin = null;
}
