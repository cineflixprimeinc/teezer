#!/usr/bin/env bash
#
# One-shot Teezer VPS1 deploy (/var/www/teezer): pull latest main, rebuild, reload.
# Run on the server from the repo root:   bash deploy/vps-deploy.sh [--migrate]
#
# Database migrations are OPT-IN. Without --migrate this script never runs
# `php artisan migrate` - the Teezer database is restored from a dump, and an
# unreviewed migration against it must be a deliberate operator decision.
# Review first:  cd server && php artisan migrate:status  (and --pretend)
#
# Lives in a script so console paste never has to carry "&&" (some VNC/serial
# keymaps mangle Shift+7, turning "&&" into "77").
set -euo pipefail

RUN_MIGRATE=0
for arg in "$@"; do
  case "$arg" in
    --migrate) RUN_MIGRATE=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg (only --migrate is accepted)" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "==> Deploying from $ROOT"

echo "==> [1/5] git pull origin main"
git pull origin main

echo "==> [2/5] backend: composer + (optional) migrate + caches"
cd "$ROOT/server"
if command -v composer >/dev/null 2>&1; then
  composer install --no-dev --optimize-autoloader
fi
if [ "$RUN_MIGRATE" = "1" ]; then
  echo "!!  WARNING: running 'php artisan migrate --force' against the LIVE database."
  echo "!!  Make sure a fresh pg_dump backup exists. Ctrl-C within 10s to abort."
  sleep 10
  php artisan migrate --force
else
  echo "    (skipping migrations - pass --migrate to run them; pending:)"
  php artisan migrate:status --pending 2>/dev/null || php artisan migrate:status || true
fi
php artisan config:cache
php artisan route:cache
# Refresh open-source moderation lists (profanity + disposable email). Best
# effort - built-in seed lists keep the filters working if the fetch fails.
php artisan moderation:update-lists || true

echo "==> [3/5] frontend: install + build"
cd "$ROOT/frontend"
# React 19 vs @stripe/react-stripe-js peer range → must use legacy-peer-deps.
if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps; fi
# Pin BUILD_ID to the deployed commit so every origin behind the load balancer
# produces identical asset/Server-Action ids (no cross-origin chunk 404s).
export NEXT_BUILD_ID="$(git -C "$ROOT" rev-parse HEAD)"
echo "    NEXT_BUILD_ID=$NEXT_BUILD_ID"
# Appends ?dpl=<id> to every /_next/static URL, so each deploy gets a fresh
# CDN cache key. next.config.ts has always read this, but nothing ever set
# it - which is why a 500 cached against a bare asset URL during a rebuild
# window kept serving for its full one-year TTL with no way to displace it.
export NEXT_DEPLOYMENT_ID="$(git -C "$ROOT" rev-parse --short HEAD)"
echo "    NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID"
npm run build

echo "==> [4/5] restart web (pm2)"
cd "$ROOT"
pm2 restart teezer-web --update-env || pm2 restart all --update-env || true

echo "==> [5/5] reload php-fpm"
FPM="$(systemctl list-units --type=service --no-legend 2>/dev/null | grep -oE 'php[0-9.]+-fpm' | head -1 || true)"
if [ -n "$FPM" ]; then systemctl reload "$FPM" || true; fi

echo "==> Done. Deployed $(git -C "$ROOT" rev-parse --short HEAD)"
