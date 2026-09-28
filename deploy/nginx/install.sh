#!/usr/bin/env bash
#
# Install the signed media origin on VPS-1.
#
#   cd /var/www/teezer && sudo bash deploy/nginx/install.sh
#
# Idempotent: safe to re-run after fixing anything it complains about. It stops
# before touching the live nginx config if any precondition fails, so a bad run
# leaves the box exactly as it found it.
set -euo pipefail

REPO="${REPO:-/var/www/teezer}"
CONF_SRC="$REPO/deploy/nginx/teezer-media.conf"
CONF_DST="/etc/nginx/sites-available/teezer-media.conf"
CACHE_DIR="/var/cache/nginx/media"

say()  { printf '\n\033[1m>> %s\033[0m\n' "$*"; }
fail() { printf '\033[31m!! %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$CONF_SRC" ] || fail "Not found: $CONF_SRC (run from the repo, or set REPO=)"
command -v nginx >/dev/null || fail "nginx is not installed: apt install nginx"

# ── TLS ───────────────────────────────────────────────────────────────────────
# teezer-media.conf expects the certbot certificate for teezer.live (see
# DEPLOYMENT.md: one certificate covering teezer.live and its subdomains). If it
# is not there, fall back to whatever certificate an already-enabled site serves.
say "Locating the TLS certificate"
CERT=/etc/letsencrypt/live/teezer.live/fullchain.pem
KEY=/etc/letsencrypt/live/teezer.live/privkey.pem
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  CERT=$(grep -rhoP '(?<=ssl_certificate\s)\s*\K\S+(?=;)' /etc/nginx/sites-enabled/ 2>/dev/null | head -1 || true)
  KEY=$(grep -rhoP '(?<=ssl_certificate_key\s)\s*\K\S+(?=;)' /etc/nginx/sites-enabled/ 2>/dev/null | head -1 || true)
fi
[ -n "$CERT" ] && [ -f "$CERT" ] || fail "No certificate - run certbot for teezer.live first (DEPLOYMENT.md)"
[ -n "$KEY" ]  && [ -f "$KEY" ]  || fail "No certificate key - run certbot for teezer.live first (DEPLOYMENT.md)"
echo "   cert: $CERT"
echo "   key : $KEY"

# ── B2 download host ──────────────────────────────────────────────────────────
# The download host of Teezer's OWN bucket (depends on its region/cluster),
# e.g. f00X.backblazeb2.com. Replaces the __B2_DOWNLOAD_HOST__ placeholder.
B2_DOWNLOAD_HOST="${B2_DOWNLOAD_HOST:-}"
[ -n "$B2_DOWNLOAD_HOST" ] || fail "Set B2_DOWNLOAD_HOST=f00X.backblazeb2.com (the Teezer bucket's download host)"
printf '%s' "$B2_DOWNLOAD_HOST" | grep -qE '^f[0-9]{3}[.]backblazeb2[.]com$' \
  || fail "B2_DOWNLOAD_HOST must look like f00X.backblazeb2.com (got: $B2_DOWNLOAD_HOST)"
echo "   b2  : $B2_DOWNLOAD_HOST"

# ── B2 token + signing secret ────────────────────────────────────────────────
# Written before the site config is enabled: the config references map variables
# that only exist once this file does, so enabling first would fail nginx -t.
say "Minting the B2 download authorization"
( cd "$REPO/server" && php artisan media:refresh-b2-token ) \
  || fail "media:refresh-b2-token failed - check B2_* and MEDIA_SIGNING_SECRET in server/.env"

# ── Config ────────────────────────────────────────────────────────────────────
say "Installing $CONF_DST"
install -m 0644 "$CONF_SRC" "$CONF_DST"
sed -i "s#/etc/letsencrypt/live/teezer.live/fullchain.pem#${CERT//#/\\#}#" "$CONF_DST"
sed -i "s#/etc/letsencrypt/live/teezer.live/privkey.pem#${KEY//#/\\#}#" "$CONF_DST"
sed -i "s#__B2_DOWNLOAD_HOST__#${B2_DOWNLOAD_HOST}#g" "$CONF_DST"
ln -sfn "$CONF_DST" /etc/nginx/sites-enabled/teezer-media.conf

mkdir -p "$CACHE_DIR"
chown -R www-data:www-data "$CACHE_DIR"

say "Testing the config"
nginx -t || fail "nginx -t failed - nothing was reloaded, the old config is still live"

say "Reloading"
systemctl reload nginx

# ── Verify ────────────────────────────────────────────────────────────────────
say "Verifying"
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' https://cdn.teezer.live/_health || echo 000)
echo "   /_health -> $HEALTH"
[ "$HEALTH" = "200" ] || fail "Health check failed. DNS for cdn.teezer.live still points at B2 - repoint it at this server before flipping B2_SERVE_DIRECT."

UNSIGNED=$(curl -s -o /dev/null -w '%{http_code}' "https://cdn.teezer.live/hls/98/master.m3u8" || echo 000)
echo "   unsigned media -> $UNSIGNED (want 403)"

cat <<'NEXT'

Installed. Two things left, in this order:

  1. Point cdn.teezer.live DNS at THIS server (A record 77.237.242.249, proxied).
     Until then nginx is running but nothing reaches it.

  2. Then, and only then:
       - set B2_SERVE_DIRECT=false in server/.env   (nginx adds /file/<bucket>)
       - php artisan config:cache && systemctl restart php8.x-fpm (your installed version)
       - make sure the Teezer media bucket is Private in the Backblaze console

     Doing 2 before 1 takes media offline.

  Keep the token fresh (it lasts 7 days):
    17 4 * * * cd /var/www/teezer/server && php artisan media:refresh-b2-token >/dev/null 2>&1 && nginx -t -q && systemctl reload nginx

NEXT
