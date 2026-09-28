#!/usr/bin/env bash
# ── TEEZER: disabled. Reelsoo-only legacy script kept for reference; see ../reelsoo-legacy/README.md ──
echo "Refusing to run: $0 is a Reelsoo-only legacy script (not for Teezer)." >&2; exit 1
# Promote VPS-2's MySQL replica to PRIMARY when VPS-1 is down.
# Run this ON VPS-2.  See docs/failover-runbook.md for the full procedure and the
# IMPORTANT note about VPS-1 being stale when it returns (do not just restart it as primary).
set -euo pipefail

ENV=/var/www/reelsoo/server/.env
DEF=/etc/mysql/debian.cnf

echo "==> Verifying this host is the replica..."
mysql --defaults-file="$DEF" -N -e "SELECT @@server_id;" | grep -qx 2 || {
  echo "ERROR: @@server_id is not 2 - this does not look like the VPS-2 replica. Aborting."
  exit 1
}

echo "==> Making the replica writable (promote to primary)..."
mysql --defaults-file="$DEF" <<'SQL'
STOP REPLICA;
SET GLOBAL super_read_only = OFF;
SET GLOBAL read_only       = OFF;
SQL

echo "==> Repointing the app at the LOCAL database (DB_PORT 3307 -> 3306)..."
cp "$ENV" "$ENV.bak.failover"
sed -i 's/^DB_PORT=.*/DB_PORT=3306/' "$ENV"

echo "==> Re-caching config and restarting processes..."
cd /var/www/reelsoo/server
php artisan config:cache
pm2 restart all

echo
echo "DONE. VPS-2 is now serving on its local (now-primary) database."
echo "Next: send traffic to VPS-2 - Cloudflare LB does this automatically if configured,"
echo "      otherwise point the DNS A record to <REELSOO_HOST_2>."
echo
echo "WARNING: when VPS-1 returns it is STALE. Do NOT restart it as primary."
echo "         Rebuild it as a replica of VPS-2 (see docs/failover-runbook.md)."
