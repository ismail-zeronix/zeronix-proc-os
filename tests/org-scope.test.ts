import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

/**
 * Multi-tenancy (SaaS, Phase 3): every table belongs to an organisation and carries the org_isolation row-level-security
 * policy, which the database enforces for the app's role. A new table without them fails here.
 *
 * Only platform tables are left out: the organisations themselves (their own org_self policy) and failed sign-ins (kept
 * by email and address before anyone is signed in to an organisation).
 */
const PLATFORM = new Set(["organizations", "login_failures"]);
/** Rows that may belong to no organisation (an error on the sign-in page): nullable organization_id. */
const NULLABLE = new Set(["error_log"]);

const tables = Object.values(schema as Record<string, unknown>)
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => getTableConfig(t));

describe("every table belongs to an organisation", () => {
  it("carries organization_id and the org_isolation policy", () => {
    const problems: string[] = [];
    for (const t of tables) {
      if (PLATFORM.has(t.name)) continue;
      const col = t.columns.find((c) => c.name === "organization_id");
      if (!col) problems.push(`${t.name}: no organization_id (use orgId())`);
      else if (!col.notNull && !NULLABLE.has(t.name)) problems.push(`${t.name}: organization_id must be NOT NULL`);
      if (!t.policies.some((p) => p.name === "org_isolation")) problems.push(`${t.name}: no org_isolation policy (use orgPolicy())`);
    }
    expect(problems).toEqual([]);
  });

  it("organisations see only their own row", () => {
    const orgs = tables.find((t) => t.name === "organizations");
    expect(orgs?.policies.map((p) => p.name)).toEqual(["org_self"]);
  });

  it("numbers and names are unique per organisation, not across all of them", () => {
    // a plain .unique() on a document number or a name would stop a second tenant using INV-0001 or the same supplier
    const global: string[] = [];
    for (const t of tables) {
      if (PLATFORM.has(t.name)) continue;
      for (const c of t.columns) if (c.isUnique && ["number", "name", "dn_number", "match_key", "key", "value", "email", "domain"].includes(c.name)) global.push(`${t.name}.${c.name}`);
    }
    // users.email stays global: one sign-in per email; prospect_sources.key is a fixed list of sources
    expect(global.sort()).toEqual(["prospect_sources.key", "users.email"]);
  });
});
