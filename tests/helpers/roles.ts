/**
 * The app's database role, as the tests set it up (production does the same with production/saas-db-roles.sh).
 * zx_app may read and write every table and use every sequence, but it owns nothing, is no superuser and has no
 * BYPASSRLS: row-level security always applies to it.
 */
export const TEST_APP_ROLE = "zx_app";
export const TEST_APP_PASSWORD = "zx_app_test_only";

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`Bad name: ${s}`);
  return s;
};

export function appRoleSql(role: string, password: string, database: string): string[] {
  const r = ident(role);
  const d = ident(database);
  const pw = password.replace(/'/g, "''");
  return [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${r}') THEN
         CREATE ROLE ${r} LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
       ELSE
         ALTER ROLE ${r} LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
       END IF;
     END $$`,
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
