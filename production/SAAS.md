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
   Keep a copy of `DATA_KEY` and `OFFSITE_PASSPHRASE` from `.env.saas` somewhere safe. Saved mailbox passwords and
   the off-server backups cannot be read without them. An `.env.saas` from an older version gets the newer settings
   with `bash production/saas-env.sh --add-missing`, which changes nothing that is already there.
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
6. **Backups** (cron as root, `sudo crontab -e`):
   ```
   30 2 * * * /bin/bash /srv/docker/zeronix-saas/production/saas-backup.sh >> /var/log/zxsaas-backup.log 2>&1
   0 4 1 * *  /bin/bash /srv/docker/zeronix-saas/production/saas-restore-test.sh --offsite >> /var/log/zxsaas-restore-test.log 2>&1
   ```
   Nightly backup with its encrypted off-server copy (below); a restore test on the 1st of every month.

## Platform mailbox (no-reply@zeronixos.online)

Invitations, "Forgot password?", trial requests and payment reminders are emailed from the platform's own mailbox.
Without it nothing is emailed: invitation links are shown to copy, and "Forgot password?" is hidden.

1. Add zeronixos.online to the email host (Hostinger, like zeronix.ae) and create `no-reply@zeronixos.online`.
2. Add the DNS records the email host lists (MX, SPF, DKIM, DMARC) at Spaceship, or the emails land in spam.
3. In `.env.saas`: `PLATFORM_SMTP_HOST=smtp.hostinger.com`, `PLATFORM_SMTP_PORT=465`,
   `PLATFORM_SMTP_USER=no-reply@zeronixos.online`, `PLATFORM_SMTP_PASS=...`; optionally `PLATFORM_NOTIFY_EMAIL`
   (where new trial requests and unpaid notices go; default: the platform admins) and `PLATFORM_SUPPORT_EMAIL`.
4. `sudo bash production/saas-deploy.sh`, then try "Forgot password?" with your own test account.

## Billing (manual invoices)

New organisations get a 30-day trial. In the console (organisation › Billing):
- **Record payment** when it arrives (1, 3, 6 or 12 months, with the invoice number): "paid until" moves on, counted
  from the later of today and the current end, and a company paused for being unpaid is active again.
- **Plan, dates, price** can be set by hand. Free = never ends (no reminders).

The billing job reminds a company's admins 7, 3 and 1 days before the date (bell and email) and once after it; it
pauses the company 7 days after an unpaid date and tells the platform. Admins also see a notice across the top in the
last week, and their plan in Admin. Invoices come from Zeronix's own Accounts (zeronixos.online).

## Trial requests

"Request a free trial" on the sign-in page. Requests appear on the console's home page: **Review and approve** fills
New organisation from the request; creating it marks the request approved and emails the invitation. **Decline** keeps
a private reason and emails nothing.

## Closing a company

Organisation › Close the company:
1. **Download all its data** (ZIP: every record as CSV, every file).
2. Pause it (Pause card), type its name, **Schedule deletion in 30 days**. It can be cancelled until then.
3. On or after that day, **Delete for good now**: every row and file goes. The platform's audit trail keeps the record.

A company nobody ever joined can be deleted at once. A company's admin can download its own data any time in
Admin › Settings › Your data.

## Off-server backups (OVH Object Storage)

Each nightly backup is encrypted on the server (AES-256, `OFFSITE_PASSPHRASE`) and streamed to Object Storage by a
throwaway rclone container (`production/saas-offsite.sh`). Copies older than 30 days are removed from the bucket.
1. OVH control panel › Public Cloud › Object Storage: create a container (bucket) such as `zeronix-saas-backups`, in
   a region near the server (e.g. GRA); then Users & Roles: an S3 user with access to it, and its S3 access key.
2. In `.env.saas` (after `--add-missing`): `OFFSITE_S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net`,
   `OFFSITE_S3_REGION=gra`, `OFFSITE_S3_BUCKET=zeronix-saas-backups`, `OFFSITE_S3_ACCESS_KEY=...`,
   `OFFSITE_S3_SECRET_KEY=...`. Keep a copy of `OFFSITE_PASSPHRASE` with `DATA_KEY`, off the server.
3. Test: `sudo bash production/saas-backup.sh` (ends with "off-server copy: ..."), then
   `sudo bash production/saas-restore-test.sh --offsite` (ends with "RESTORE TEST OK").

To restore for real from a copy: `rclone cat` it (see saas-offsite.sh), decrypt with
`openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:OFFSITE_PASSPHRASE`, and `pg_restore` it.

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
  support email. The terms should state the plans, prices and the 7-day pause after an unpaid date.
- Security: an external penetration test.
- Operations: the platform mailbox, the off-server bucket and both cron lines set up (above), and one restore test run
  by hand and timed.
- Built: billing by manual invoice, trial requests (approved by hand), data download, closing a company.
  Not built: card payments, open self sign-up.
