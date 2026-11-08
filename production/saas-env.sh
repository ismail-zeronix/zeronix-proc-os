#!/usr/bin/env bash
# Makes .env.saas for the SaaS install with fresh random secrets, once. Never overwrites an existing file.
#   /srv/docker/zeronix-saas/production/saas-env.sh
# The values are printed nowhere; they live only in .env.saas (mode 600). Keep a copy of DATA_KEY somewhere safe:
# saved mailbox passwords cannot be read without it.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
FILE=".env.saas"
[ -e "$FILE" ] && { echo "$FILE already exists; nothing changed" >&2; exit 1; }
rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }
cat > "$FILE" <<EOF
# SaaS install (demo.zeronixos.online), made by production/saas-env.sh on $(date -u +%Y-%m-%d). See production/SAAS.md.
POSTGRES_USER=zx_owner
POSTGRES_PASSWORD=$(rand 40)
POSTGRES_DB=zeronix_saas
ZX_APP_PASSWORD=$(rand 40)
ZX_PLATFORM_PASSWORD=$(rand 40)
AUTH_SECRET=$(rand 60)
DATA_KEY=$(rand 60)
APP_PUBLIC_URL=https://demo.zeronixos.online
COOKIE_SECURE=true
BACKUP_DIR=/srv/backups/zeronix-saas
BACKUP_KEEP_DAYS=14
EOF
chmod 600 "$FILE"
echo "$FILE written (mode 600)."
