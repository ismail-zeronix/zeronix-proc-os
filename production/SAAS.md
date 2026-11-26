# ZeronixOS SaaS: demo.zeronixos.online

The multi-tenant install, built from the **`saas`** branch. It runs beside Zeronix's own install on the same OVH server
and shares nothing with it except the server and Caddy's `proxy-net` network: its own checkout, containers, database,
volumes, secrets and backups.

| | Zeronix's own install | SaaS install |
|---|---|---|
| Branch | `main` | `saas` |
| Folder | `/srv/docker/zeronix-proc-os` | `/srv/docker/zeronix-saas` |
| Compose | `docker-compose.prod.yml`, `.env` | `docker-compose.saas.yml`, `.env.saas` |
| Containers | `zeronix-app`, `zeronix-worker`, `zeronix-postgres`, ... | `zxsaas-app`, `zxsaas-worker`, `zxsaas-postgres` |
| Image | `zeronix-app` | `zeronix-saas` |
| Address | zeronixos.online | demo.zeronixos.online |
| Backups | `/srv/backups/zeronix` | `/srv/backups/zeronix-saas` |

## How it is put together

- **Organisations** (tenants) are separated by Postgres row-level security on every table. The app connects as
  `zx_app` (no owner, no superuser, no BYPASSRLS), and the connection pool names the organisation for every query.
- **Three database roles.** `zx_owner` runs the migrations. `zx_app` is the app. `zx_platform` is the platform
  console, with BYPASSRLS, so it sees every organisation. `zxsaas-migrate` creates and updates the two roles on every
  deploy (`scripts/saas-roles.js`).
- **`MULTI_TENANT=true`.** There is no fallback organisation and no `/setup` page. A request without a session sees
  nothing.
- **Platform console** at `/platform`. Platform admins are not users of any organisation. They sign in with a password
  and a 6-digit authenticator code. They can:
  - create organisations, with an invitation link for the first admin;
  - pause organisations;
  - set each organisation's apps and user limit;
  - open an organisation read-only through the support view. Changes need a typed reason. Every visit is recorded and
    shown to that organisation's admin.
- **Apps for organisations (v1):** CRM, Sales, Accounts, Projects, Tasks, Files and Chat.

## First setup (once)

1. **DNS** (owner): add an `A` record `demo.zeronixos.online → 57.131.160.147`.
2. **Caddy** (owner, `/srv/docker/proxy/Caddyfile`): add this block, then reload Caddy:
   ```
   demo.zeronixos.online {
       reverse_proxy zxsaas-app:3000
   }
   ```
3. **Checkout and secrets.** Run as `ubuntu`:
   ```
   cd /srv/docker && git clone -b saas https://github.com/ismail-zeronix/zeronix-proc-os.git zeronix-saas
   cd zeronix-saas && bash production/saas-env.sh      # .env.saas with fresh secrets, mode 600
   ```
   Keep a copy of `DATA_KEY` from `.env.saas` somewhere safe. Saved mailbox passwords cannot be read without it.
4. **Deploy**, the same command every time:
   ```
   sudo bash production/saas-deploy.sh
   ```
5. **First platform admin.** Run this on the server, never from the web:
   ```
   sudo docker exec -it zxsaas-app node scripts/platform-admin.js add --email you@zeronix.ae --name "Your Name"
   ```
   It prints a password and an authenticator secret. Add the secret to an authenticator app at once; it is not shown
   again. Then sign in at https://demo.zeronixos.online/platform.
6. **Nightly backup** (cron as root): `30 2 * * * /srv/docker/zeronix-saas/production/saas-backup.sh >> /var/log/zxsaas-backup.log 2>&1`.
   Copy the backups off the server too.

## Every deploy

```
cd /srv/docker/zeronix-saas && git pull --ff-only     # as ubuntu, before the deploy
sudo bash production/saas-deploy.sh
```

If it goes wrong: `sudo bash production/saas-rollback.sh`, which puts back `zeronix-saas:previous`. Migrations are not
undone: they only ever add.

## Platform admins

| Task | Command |
|---|---|
| Add | `docker exec -it zxsaas-app node scripts/platform-admin.js add --email x --name "Y"` |
| New password and authenticator secret | `... platform-admin.js reset --email x` |
| Remove access | `... platform-admin.js off --email x` |

## Bringing dev into saas

Work happens in its own folder, a git worktree of this branch (`E:\ZERONIX PORTAL\zeronix-saas`), so the `dev` folder
is never switched. Each time `dev` is merged in:

1. **Migrations.** `saas` has its own migrations between dev's, so dev's new ones get the next free numbers here:
   - rename the `.sql` file and its `meta/NNNN_snapshot.json`;
   - point the first one's `prevId` at the last snapshot here;
   - append them to `meta/_journal.json`, keeping each one's `when` (the demo database runs a migration only if its
     `when` is later than the last one applied).
   - The 2026-11-26 merge, for example, put dev's 0064-0071 at 0066-0073, after 0064_tenancy and 0065_platform.
2. **New tables.** A new table from dev must have `orgId()` and `orgPolicy()`; `tests/org-scope.test.ts` fails
   otherwise.
   - dev makes them with `DEFAULT 1`: add a catch-up migration that sets the default to the session organisation and
     forces the policy (as `0074_tenancy_catchup` does).
   - An `onConflict` target on a per-organisation unique key must include `organizationId`.
3. **Zeronix's own features.** `src/lib/edition.ts` keeps them off here:
   - the proxy answers 404 for their addresses;
   - menu items are marked `zeronixOnly`;
   - their server actions start with `assertZeronixFeatures()`.
   - A new Zeronix-only page, menu item or action from dev needs the same.
   - Organisations only ever get `TENANT_CORE_APPS`.
4. Test against a throwaway Postgres (never the shared dev one): `npx vitest run` with `DATABASE_URL` pointing at it.
   Then simulate the demo's upgrade: migrate a database with the old `saas` migrations, then with the new ones.

## Before taking money from customers

- Legal: approve the terms and privacy text (`src/content/legal.ts`, `approved: true`), the operator name and the
  support email.
- Security: an external penetration test.
- Operations: a timed restore drill from a backup, and off-server backup copies.
- Billing and self sign-up are not built (invite only).
