# Off-server backup copies for the SaaS install, sourced by saas-backup.sh and saas-restore-test.sh (not run alone).
# Object Storage over S3 (OVH Object Storage, owner's choice 2026-11-26) through a throwaway rclone container, so
# nothing is installed on the server. Files are encrypted on this server before they leave it
# (openssl AES-256, key OFFSITE_PASSPHRASE), and streamed: no extra copy on disk. Settings, in .env.saas or the environment:
#   OFFSITE_S3_ENDPOINT    https://s3.gra.io.cloud.ovh.net   (the bucket's region endpoint)
#   OFFSITE_S3_REGION      gra
#   OFFSITE_S3_BUCKET      zeronix-saas-backups              (or bucket/folder)
#   OFFSITE_S3_ACCESS_KEY, OFFSITE_S3_SECRET_KEY             (an S3 user with access to that bucket only)
#   OFFSITE_PASSPHRASE     made by saas-env.sh; keep a copy with DATA_KEY: the copies cannot be read without it
#   OFFSITE_KEEP_DAYS      30
#   OFFSITE_DOCKER_NETWORK (testing only: a docker network where a local S3 server runs)
# Needs ROOT (the checkout) set by the caller.

RCLONE_IMAGE="rclone/rclone:1.68.2"

offsite_value() {
  local v="${!1:-}"
  if [ -z "$v" ] && [ -f "$ROOT/.env.saas" ]; then v="$(grep -E "^$1=" "$ROOT/.env.saas" | tail -n 1 | cut -d= -f2- || true)"; fi
  printf '%s' "$v"
}

OFFSITE_S3_ENDPOINT="$(offsite_value OFFSITE_S3_ENDPOINT)"
OFFSITE_S3_REGION="$(offsite_value OFFSITE_S3_REGION)"
OFFSITE_S3_BUCKET="$(offsite_value OFFSITE_S3_BUCKET)"
OFFSITE_S3_ACCESS_KEY="$(offsite_value OFFSITE_S3_ACCESS_KEY)"
OFFSITE_S3_SECRET_KEY="$(offsite_value OFFSITE_S3_SECRET_KEY)"
OFFSITE_PASSPHRASE="$(offsite_value OFFSITE_PASSPHRASE)"
OFFSITE_KEEP_DAYS="$(offsite_value OFFSITE_KEEP_DAYS)"; OFFSITE_KEEP_DAYS="${OFFSITE_KEEP_DAYS:-30}"
OFFSITE_DOCKER_NETWORK="$(offsite_value OFFSITE_DOCKER_NETWORK)"

# rclone reads its remote from these (names only on the docker command line, so the keys never show in `ps`)
export RCLONE_CONFIG_OFFSITE_TYPE=s3
export RCLONE_CONFIG_OFFSITE_PROVIDER=Other
export RCLONE_CONFIG_OFFSITE_ENDPOINT="$OFFSITE_S3_ENDPOINT"
export RCLONE_CONFIG_OFFSITE_REGION="${OFFSITE_S3_REGION:-us-east-1}"
export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$OFFSITE_S3_ACCESS_KEY"
export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$OFFSITE_S3_SECRET_KEY"
export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true
export OFFSITE_PASSPHRASE

offsite_ready() {
  [ -n "$OFFSITE_S3_ENDPOINT" ] && [ -n "$OFFSITE_S3_BUCKET" ] && [ -n "$OFFSITE_S3_ACCESS_KEY" ] && [ -n "$OFFSITE_S3_SECRET_KEY" ] && [ -n "$OFFSITE_PASSPHRASE" ]
}

rclone_run() {
  docker run --rm -i ${OFFSITE_DOCKER_NETWORK:+--network "$OFFSITE_DOCKER_NETWORK"} \
    -e RCLONE_CONFIG_OFFSITE_TYPE -e RCLONE_CONFIG_OFFSITE_PROVIDER -e RCLONE_CONFIG_OFFSITE_ENDPOINT -e RCLONE_CONFIG_OFFSITE_REGION \
    -e RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID -e RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY -e RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET \
    "$RCLONE_IMAGE" "$@"
}

# encrypt / decrypt a stream with the passphrase (from the environment, never on the command line)
offsite_encrypt() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:OFFSITE_PASSPHRASE; }
offsite_decrypt() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:OFFSITE_PASSPHRASE; }

# offsite_put <name>  (stdin: the encrypted bytes)
offsite_put() { rclone_run rcat "offsite:$OFFSITE_S3_BUCKET/$1"; }
# offsite_cat <name>  (stdout: the encrypted bytes)
offsite_cat() { rclone_run cat "offsite:$OFFSITE_S3_BUCKET/$1"; }
# offsite_latest <glob>  the newest name matching (names carry their date, so the last in order is the newest)
offsite_latest() { rclone_run lsf "offsite:$OFFSITE_S3_BUCKET" --include "$1" | sort | tail -n 1; }
# offsite_prune <days>  copies older than that go
offsite_prune() { rclone_run delete "offsite:$OFFSITE_S3_BUCKET" --min-age "${1}d" --include 'zxsaas-*'; }
