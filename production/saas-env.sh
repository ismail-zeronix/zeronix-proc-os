#!/usr/bin/env bash
# Makes .env.saas for the SaaS install with fresh random secrets, once. Never overwrites an existing file.
#   /srv/docker/zeronix-saas/production/saas-env.sh
#   /srv/docker/zeronix-saas/production/saas-env.sh --add-missing   an existing .env.saas gets what later versions
#                                                                     added (a new OFFSITE_PASSPHRASE, empty mailbox
#                                                                     and Object Storage settings); nothing is changed
# The values are printed nowhere; they live only in .env.saas (mode 600). Keep a copy of DATA_KEY and
# OFFSITE_PASSPHRASE somewhere safe: saved mailbox passwords and the off-server backups cannot be read without them.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
FILE=".env.saas"
rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }

# settings added after the first version: [name]=default (OFFSITE_PASSPHRASE is generated)
later_settings() {
  cat <<EOF
# the platform's own mailbox (invitations, "forgot password", trial requests, reminders): see production/SAAS.md
PLATFORM_SMTP_HOST=
PLATFORM_SMTP_PORT=465
PLATFORM_SMTP_USER=
PLATFORM_SMTP_PASS=
PLATFORM_MAIL_FROM=ZeronixOS <no-reply@zeronixos.online>
PLATFORM_NOTIFY_EMAIL=
PLATFORM_SUPPORT_EMAIL=support@zeronixos.online
# off-server backup copies, encrypted with OFFSITE_PASSPHRASE (production/saas-offsite.sh)
OFFSITE_S3_ENDPOINT=
OFFSITE_S3_REGION=
OFFSITE_S3_BUCKET=
OFFSITE_S3_ACCESS_KEY=
OFFSITE_S3_SECRET_KEY=
OFFSITE_PASSPHRASE=$(rand 60)
OFFSITE_KEEP_DAYS=30
EOF
}

if [ "${1:-}" = "--add-missing" ]; then
  [ -f "$FILE" ] || { echo "$FILE does not exist: run without --add-missing first" >&2; exit 1; }
  added=0
  while IFS= read -r line; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    name="${line%%=*}"
    if ! grep -qE "^$name=" "$FILE"; then
      printf '%s\n' "$line" >> "$FILE"
      added=$((added + 1))
      echo "added $name"
    fi
  done < <(later_settings)
  chmod 600 "$FILE"
  echo "$added setting(s) added to $FILE; nothing else changed."
  exit 0
fi

[ -e "$FILE" ] && { echo "$FILE already exists; nothing changed (use --add-missing for newer settings)" >&2; exit 1; }
{
  cat <<EOF
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
  later_settings
} > "$FILE"
chmod 600 "$FILE"
echo "$FILE written (mode 600)."
