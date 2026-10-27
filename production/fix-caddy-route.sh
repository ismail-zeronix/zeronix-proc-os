#!/usr/bin/env bash
# Safely align the live Caddy route with docker-compose.prod.yml.
# Run on the VPS from the repository root:
#   sudo bash production/fix-caddy-route.sh
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run as root: sudo bash production/fix-caddy-route.sh" >&2
  exit 1
fi

CADDYFILE="/srv/docker/proxy/Caddyfile"
APP="zeronix-app"
NETWORK="proxy-net"

command -v docker >/dev/null || { echo "Docker is not installed." >&2; exit 1; }
[[ -f "$CADDYFILE" ]] || { echo "Caddyfile not found: $CADDYFILE" >&2; exit 1; }
docker inspect "$APP" >/dev/null 2>&1 || { echo "Container $APP is not running/existing." >&2; exit 1; }
docker network inspect "$NETWORK" >/dev/null 2>&1 || { echo "Docker network $NETWORK does not exist." >&2; exit 1; }

BACKUP="${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
cp -p "$CADDYFILE" "$BACKUP"
echo "Backup created: $BACKUP"

# The production Compose file declares zeronix-app on proxy-net.
# Attach only this app if the running container is unexpectedly missing that network.
APP_NETWORKS="$(docker inspect --format '{{json .NetworkSettings.Networks}}' "$APP")"
if ! grep -q '"proxy-net"' <<<"$APP_NETWORKS"; then
  docker network connect "$NETWORK" "$APP"
  echo "Connected $APP to $NETWORK."
else
  echo "$APP is already connected to $NETWORK."
fi

python3 - "$CADDYFILE" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text()
block = """zeronixos.online, www.zeronixos.online {
    reverse_proxy zeronix-app:3000
}"""

pattern = re.compile(
    r"(?ms)^[ \t]*zeronixos\.online,[ \t]*www\.zeronixos\.online[ \t]*\{.*?^[ \t]*\}"
)
if pattern.search(text):
    updated = pattern.sub(block, text, count=1)
elif re.search(r"(?m)^\s*(?:zeronixos\.online|www\.zeronixos\.online)\b", text):
    raise SystemExit("Found a Zeronix domain entry in an unexpected format; left the Caddyfile unchanged.")
else:
    updated = text.rstrip() + "\n\n" + block + "\n"

if updated != text:
    path.write_text(updated)
    print("Updated Zeronix route to zeronix-app:3000.")
else:
    print("Zeronix route already matches zeronix-app:3000.")
PY

if ! docker exec caddy caddy validate --config /etc/caddy/Caddyfile; then
  cp -p "$BACKUP" "$CADDYFILE"
  echo "Validation failed; original Caddyfile restored." >&2
  exit 1
fi

if ! docker exec caddy caddy reload --config /etc/caddy/Caddyfile; then
  cp -p "$BACKUP" "$CADDYFILE"
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile || true
  echo "Reload failed; original Caddyfile restored." >&2
  exit 1
fi

echo "=== Live endpoint checks ==="
curl -sS -o /dev/null -w 'Homepage: HTTP %{http_code}\n' https://zeronixos.online
curl -sS -o /dev/null -w 'Setup: HTTP %{http_code}\n' https://zeronixos.online/setup
echo "Caddy route update complete. Souqfeed's block was not modified."
