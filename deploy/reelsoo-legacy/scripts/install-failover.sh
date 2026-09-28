#!/usr/bin/env bash
# ── TEEZER: disabled. Reelsoo-only legacy script kept for reference; see ../reelsoo-legacy/README.md ──
echo "Refusing to run: $0 is a Reelsoo-only legacy script (not for Teezer)." >&2; exit 1
# Installs the auto-failover automation on whichever box this is run on:
#   server_id=1 (VPS-1, primary)  -> split-brain boot guard
#   server_id=2 (VPS-2, replica)  -> auto-failover watchdog
# Idempotent. Enables units for boot; the watchdog is also started immediately.
set -euo pipefail
DEF=/etc/mysql/debian.cnf
SRC=/var/www/reelsoo/deploy

SID="$(mysql --defaults-file="$DEF" -N -e "SELECT @@server_id;" 2>/dev/null || echo "?")"
chmod +x "$SRC"/scripts/vps1-watchdog.sh "$SRC"/scripts/vps1-boot-guard.sh "$SRC"/scripts/promote-vps2.sh 2>/dev/null || true

install_unit(){ cp "$SRC/systemd/$1" "/etc/systemd/system/$1"; }

case "$SID" in
  1)
    echo "==> server_id=1 (VPS-1 primary): installing split-brain boot guard"
    install_unit reelsoo-boot-guard.service
    systemctl daemon-reload
    systemctl enable reelsoo-boot-guard.service
    echo "==> dry-run decision (no side effects):"
    "$SRC/scripts/vps1-boot-guard.sh" --check
    ;;
  2)
    echo "==> server_id=2 (VPS-2 replica): installing auto-failover watchdog"
    install_unit reelsoo-watchdog.service
    systemctl daemon-reload
    systemctl enable reelsoo-watchdog.service
    echo "==> dry-run health verdict (no side effects):"
    "$SRC/scripts/vps1-watchdog.sh" --check || true
    echo "==> starting watchdog"
    systemctl restart reelsoo-watchdog.service
    systemctl --no-pager status reelsoo-watchdog.service | head -n 8
    ;;
  *)
    echo "Unexpected @@server_id='$SID' - refusing to install. Check MySQL." >&2
    exit 1
    ;;
esac
echo "==> done."
