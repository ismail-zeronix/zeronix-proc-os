/**
 * The database roles of a multi-tenant (SaaS) install, as SQL to run as the owner after the migrations:
 *   zx_app       what the app connects as: no owner, no superuser, no BYPASSRLS, so row-level security always applies.
 *                It may read and write every tenant table, never the platform admins, and only read its support visits.
 *   zx_platform  the platform console's role (PLATFORM_DATABASE_URL): BYPASSRLS, so it sees every organisation.
 * Idempotent: running it again resets the passwords and grants. Used by scripts/saas-roles.ts and the tests.
 */
const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`Bad name: ${s}`);
  return s;
};
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

function ensureRole(role: string, password: string, attrs: string): string {
  const r = ident(role);
  return `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${r}') THEN
      CREATE ROLE ${r} LOGIN PASSWORD ${literal(password)} ${attrs};
    ELSE
      ALTER ROLE ${r} LOGIN PASSWORD ${literal(password)} ${attrs};
    END IF;
  END $$`;
}

export function appRoleSql(role: string, password: string, database: string): string[] {
  const r = ident(role);
  const d = ident(database);
  return [
    ensureRole(r, password, "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"),
    `GRANT CONNECT ON DATABASE ${d} TO ${r}`,
    `GRANT USAGE ON SCHEMA public TO ${r}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r}`,
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${r}`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${r}`,
    // platform admins are the platform role's alone; tenants may read their support visits, never change them
    `REVOKE ALL ON platform_admins FROM ${r}`,
    `REVOKE INSERT, UPDATE, DELETE ON platform_audit_log FROM ${r}`,
    // the migration table is the owner's alone
    `REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM ${r}`,
  ];
}

export function platformRoleSql(role: string, password: string, database: string): string[] {
  const r = ident(role);
  const d = ident(database);
  return [
    ensureRole(r, password, "NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE"),
    `GRANT CONNECT ON DATABASE ${d} TO ${r}`,
    `GRANT USAGE ON SCHEMA public TO ${r}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r}`,
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${r}`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${r}`,
  ];
}
