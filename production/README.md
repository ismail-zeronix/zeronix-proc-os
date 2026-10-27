# ZeronixOS production (OVH)

How the portal runs on the OVH server and how to deploy, back up and roll back. Nothing in this repository manages
Caddy, DNS, the firewall or SouqFeed.

## 1. Architecture

```
Internet ──► :80/:443  caddy (separate stack, already running)
                          │  proxy-net (external Docker network, shared with SouqFeed)
                          ▼
                  zeronix-app:3000   Next.js standalone server, non-root, + background worker
                          │  zeronixos_backend (internal Docker network, no outside route)
                          ▼
                  zeronix-postgres:5432   PostgreSQL 16, named volume zeronixos_pgdata
```

| Service | Container | Networks | Host ports | Data |
|---|---|---|---|---|
| App (Next.js) | `zeronix-app` | `backend`, `proxy-net` | none | volume `zeronixos_files` (uploads) |
| PostgreSQL 16 | `zeronix-postgres` | `backend` only | none | volume `zeronixos_pgdata` |

There is **no Redis**. Background jobs (mail sync, feeds, AI queue) run inside the app process, and chat uses
PostgreSQL LISTEN/NOTIFY. There is **no Ollama** on the server. AI will go through a hosted model API later, and
memory and context stay in the application's PostgreSQL database.

No Frappe, ERPNext, Frappe CRM, MariaDB, bench, workers, scheduler or websocket services are part of this stack, and
the repository contains no Frappe deployment files.

### Public and private

| Port | Who listens | Reachable from |
|---|---|---|
| 80, 443 | Caddy | the internet (only public entry) |
| 3000 | zeronix-app | Docker networks only (Caddy over proxy-net) |
| 5432 | zeronix-postgres | the app only (internal `backend` network) |

Service names are prefixed `zeronix-` because Docker adds each service name as a DNS alias on every network it joins.
A plain `app` on `proxy-net` could collide with another stack's `app`.

## 2. Local development (Windows)

Use the normal Node workflow. The production Docker stack is not needed for day-to-day work.

```bash
npm install
cp .env.example .env               # local values work as they are
docker compose up -d db            # local PostgreSQL on 127.0.0.1:5433 (or use your own Postgres)
npm run db:migrate && npm run db:seed
npm run dev                        # http://localhost:3100
```

The root `docker-compose.yml` is the **local / office stack** (db, web on `WEB_PORT`, optional Ollama and nightly
backup profiles). It is separate from production.

## 3. Production Docker setup

- `Dockerfile`: multi-stage. `deps` runs `npm ci`; `build` runs `next build` with `NEXT_OUTPUT=standalone` and bundles
  `scripts/migrate.ts` to plain JS with esbuild; `run` is `node:22-alpine` with Chromium (for
  PDF quotes), the standalone server, static files and migrations only. It runs as the `node` user and listens on
  `0.0.0.0:3000` with `NODE_ENV=production`. No secrets are baked in, and `.env` is excluded by `.dockerignore`.
- `docker-compose.prod.yml`: project name `zeronixos`, services `zeronix-app` and `zeronix-postgres`, restart
  `unless-stopped`, healthchecks, named volumes, log rotation (10 MB × 5 per container), `proxy-net` external.
- `next.config.ts` turns on `output: "standalone"` only when `NEXT_OUTPUT=standalone` (the Docker build), so local
  `npm run build` / `npm run start` behave as before.

Build only: `docker compose -f docker-compose.prod.yml build`

## 4. Environment variables

All configuration comes from `/srv/docker/zeronix/.env` (never committed). Start from `.env.example`. These must be
set on the server, and compose refuses to start without the ones marked required:

| Variable | Required | Notes |
|---|---|---|
| `COMPOSE_FILE=docker-compose.prod.yml` | recommended | lets plain `docker compose ...` use the production file |
| `POSTGRES_USER`, `POSTGRES_DB` | yes | e.g. `zeronix`, `zeronixos` |
| `POSTGRES_PASSWORD` | yes | URL-safe random: `openssl rand -hex 24` (it goes into `DATABASE_URL`) |
| `AUTH_SECRET` | yes | `openssl rand -base64 32`; also encrypts saved mailbox passwords, so don't rotate it casually |
| `COOKIE_SECURE` | no | defaults to `true` in production (HTTPS through Caddy) |
| `MAIL_*` | no | Hostinger defaults |
| `DB_POOL_MAX` | no | default 10 |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS` | no | backup script, default `/srv/backups/zeronix`, 14 days |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` | later | hosted AI API, not wired up yet |

`DATABASE_URL` is built by the compose file from the `POSTGRES_*` values and points at `zeronix-postgres:5432`.

## 5. Database

PostgreSQL 16 with **Drizzle ORM** (`src/db/schema.ts`). Prisma is not used and should not be added. Data lives in
the named volume `zeronixos_pgdata`. The database is never published to the host. For a one-off SQL shell:

```bash
docker compose -f docker-compose.prod.yml exec zeronix-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## 6. Migrations

- Create in development: change `src/db/schema.ts`, then `npm run db:generate` (writes `src/db/migrations/NNNN_*.sql`),
  then `npm run db:migrate` locally. Commit the SQL and `meta/` files.
- Production: `production/deploy.sh` backs up the database first, then runs `node scripts/migrate.js` (enables
  `pg_trgm`, applies pending migrations) in a one-off container from the **new** image, before the new app starts. No
  admin is seeded: on an empty database the portal sends the first visitor to `/setup` to create the administrator. The app container does not migrate on start (`MIGRATE_ON_START=false`).
- Migrations only go forward. Write them so the previous app version still works where possible (add columns before
  dropping old ones), which keeps an image rollback safe.

## 7. Caddy integration

Caddy is managed outside this repository. When the switch happens, the Caddy site block becomes:

```
zeronixos.online, www.zeronixos.online {
    reverse_proxy zeronix-app:3000
}
```

The only thing this repository does is join `zeronix-app` to the external `proxy-net` network. Do not add a Caddy
service here.

## 8. Deployment

First time on the server (when approved):

```bash
sudo mkdir -p /srv/docker/zeronix /srv/backups/zeronix
git clone -b main <repo-url> /srv/docker/zeronix
cd /srv/docker/zeronix
cp .env.example .env && nano .env      # fill in the [prod] values, uncomment COMPOSE_FILE
chmod 600 .env
bash production/deploy.sh
```

Every later deploy:

```bash
bash /srv/docker/zeronix/production/deploy.sh
```

`deploy.sh` runs these steps in order:

1. Pre-flight: `.env` exists, `proxy-net` exists, on `main`, clean tree, compose config valid.
2. `git pull --ff-only origin main`.
3. Build `zeronix-app:<commit>`.
4. Tag the running image `zeronix-app:previous`.
5. Start postgres, back up, migrate, seed.
6. `up -d` the app.
7. Wait for `healthy`, then check `/api/health/db`.

It never runs `docker system prune` or deletes images or volumes. Clean up old `zeronix-app:<commit>` images by hand
now and then, keeping at least `latest` and `previous`.

## 9. Backups

```bash
bash /srv/docker/zeronix/production/backup-postgres.sh
```

Each run writes `zeronix-db-YYYYMMDD-HHMMSS.dump` (pg_dump custom format, compressed) and `zeronix-files-….tar.gz`
(uploads) to `BACKUP_DIR`. The dump runs inside the postgres container over its local socket, so no password appears in
commands or output. Files are only renamed into place after they are complete and the dump is checked with
`pg_restore --list`. Backups older than `BACKUP_KEEP_DAYS` (matching these names only) are removed after a successful
run. A lock prevents two runs at once.

Recommended (set up by hand, not automatic):

- Nightly cron, e.g. `crontab -e` → `30 2 * * * bash /srv/docker/zeronix/production/backup-postgres.sh >> /srv/backups/zeronix/backup.log 2>&1`
- Copy `BACKUP_DIR` off the server daily (OVH Object Storage, rclone to Google Drive, or another machine).
- Test a restore into a throwaway database once a month.

Restore (stop the app first so nothing writes during the restore):

```bash
cd /srv/docker/zeronix
docker compose stop zeronix-app
docker compose exec -T zeronix-postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < /srv/backups/zeronix/zeronix-db-YYYYMMDD-HHMMSS.dump
docker compose run --rm --no-deps --entrypoint sh zeronix-app -c 'tar xzf - -C /app/data/files' < /srv/backups/zeronix/zeronix-files-YYYYMMDD-HHMMSS.tar.gz
docker compose start zeronix-app
```

## 10. Rollback

Each deploy keeps the image that was running as `zeronix-app:previous`, and every build stays as
`zeronix-app:<commit>`. Nothing deletes them automatically.

```bash
bash /srv/docker/zeronix/production/rollback.sh            # back to zeronix-app:previous
bash /srv/docker/zeronix/production/rollback.sh 51793c4    # or a specific build (docker images zeronix-app)
```

This switches only the app container. If the failed deploy applied a migration the old code cannot handle, restore
the backup that `deploy.sh` made just before migrating (section 9, newest `zeronix-db-*.dump`), then roll back the
image. Fix forward on `dev`, merge to `main`, and deploy again.

## 11. Health checks

| Endpoint | Auth | Response | Used by |
|---|---|---|---|
| `GET /api/health` | public | `{"status":"ok"}`, no database access | Docker healthcheck, uptime monitor |
| `GET /api/health/db` | public | `{"status":"ok","database":"ok"}` or 503 | deploy script, optional monitor |

PostgreSQL has its own `pg_isready` healthcheck, and the app waits for it before starting.

## 12. Git workflow

- `dev`: development and testing. All work lands here first.
- `main`: production. The server only ever runs `main` (`git pull --ff-only`).
- Release: merge `dev` into `main` (reviewed), push, then run `deploy.sh` on the server. Nothing pushes, merges or
  deploys automatically.
- The server checkout must stay clean. Configuration lives only in the untracked `.env`.

## 13. Before the first production deploy

- The current zeronixos.online runs on Frappe. Before switching, list its containers, volumes and directory on the
  server (`docker ps -a`, `docker volume ls`), and confirm nothing already uses the names `zeronix-app`,
  `zeronix-postgres`, the project name `zeronixos` or the directory `/srv/docker/zeronix`.
- Decide whether any data moves over from Frappe/ERPNext (customers, items, invoices). If so, it needs a one-off import.
- Point Caddy at `zeronix-app:3000` only after the app reports healthy on `proxy-net`.
