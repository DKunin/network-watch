#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
SITE="network.kunini.ru"
SITE_SOURCE="$PROJECT_DIR/ops/nginx/${SITE}.conf"
SITE_TARGET="/etc/nginx/sites-available/${SITE}.conf"
SITE_ENABLED="/etc/nginx/sites-enabled/${SITE}.conf"
BACKUP_DIR="$PROJECT_DIR/backups/nginx"

if sudo test -f "$SITE_TARGET"; then
  mkdir -p "$BACKUP_DIR"
  sudo cp -a "$SITE_TARGET" "$BACKUP_DIR/${SITE}-$(date -u +%Y%m%dT%H%M%SZ).conf"
fi

sudo install -o root -g root -m 0644 "$SITE_SOURCE" "$SITE_TARGET"
sudo ln -sfn "$SITE_TARGET" "$SITE_ENABLED"
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  --keep-until-expiring \
  -d "$SITE"

sudo nginx -t
sudo systemctl reload nginx

echo "Nginx and HTTPS configured for https://${SITE}"
