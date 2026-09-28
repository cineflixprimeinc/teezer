#!/usr/bin/env bash
# ── TEEZER: disabled. Reelsoo-only legacy script kept for reference; see ../reelsoo-legacy/README.md ──
echo "Refusing to run: $0 is a Reelsoo-only legacy script (not for Teezer)." >&2; exit 1
# ─── Reelsoo auto-failover watchdog - runs on VPS-2 ──────────────────────────
# Monitors VPS-1 (the MySQL primary). If VPS-1 is unreachable for a SUSTAINED
# period, it auto-promotes VPS-2's replica to primary via promote-vps2.sh, so
# the site keeps serving from VPS-2.  See docs/failover-runbook.md.
#
# Health logic (every CHECK_INTERVAL seconds):
#   1. Reach VPS-1's MySQL through the app's SSH tunnel (127.0.0.1:TUNNEL_PORT).
#        "mysqld is alive" OR "Access denied"  -> primary is UP (it answered).
#        "Can't connect" / timeout             -> tunnel can't reach primary.
#   2. If the tunnel can't reach it, ping the VPS-1 host directly:
#        host UP  -> it's only the tunnel that broke: restart the tunnel, no failover.
#        host DOWN -> count a real failure.
#   3. After FAIL_THRESHOLD consecutive real failures (~90 s) -> promote.
#
# Run `vps1-watchdog.sh --check` for a one-shot, side-effect-free verdict.
set -uo pipefail

VPS1_IP="<REELSOO_HOST>"
TUNNEL_PORT=3307
DEF=/etc/mysql/debian.cnf
PROMOTE=/var/www/reelsoo/deploy/scripts/promote-vps2.sh
TUNNEL_SVC=reelsoo-db-tunnel
FLAG=/var/lib/reelsoo-failover.done
FAILLOG=/var/log/reelsoo-failover.log
LOG_TAG=reelsoo-watchdog

CHECK_INTERVAL=15      # seconds between checks
FAIL_THRESHOLD=6       # consecutive real failures before failover (~90 s)

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

log(){ logger -t "$LOG_TAG" -- "$*" 2>/dev/null || true; echo "$(date -Is) [$LOG_TAG] $*"; }

# Already the writable primary? (read_only=0) -> failover already happened.
already_primary(){
  [ "$(mysql --defaults-file="$DEF" -N -e "SELECT @@read_only;" 2>/dev/null)" = "0" ]
}

# Does VPS-1's primary answer through the tunnel?  Returns 0=UP, 1=DOWN.
primary_up_via_tunnel(){
  local out
  out="$(mysqladmin --defaults-file="$DEF" -h 127.0.0.1 -P "$TUNNEL_PORT" --connect-timeout=5 ping 2>&1)"
  echo "$out" | grep -qiE "mysqld is alive|Access denied"
}

# Is the VPS-1 host itself reachable (independent of the tunnel)?
# Uses a TCP connect to SSH (:22), NOT ICMP - VPS-1's firewall drops pings from
# VPS-2 (100% loss), so ping would always fail and misclassify a tunnel-only
# outage as a host-down. SSH is always open (the DB tunnel rides over it).
vps1_host_up(){ timeout 4 bash -c "echo > /dev/tcp/$VPS1_IP/22" >/dev/null 2>&1; }

# One-shot verdict for testing / monitoring.
if [ "${1:-}" = "--check" ]; then
  if primary_up_via_tunnel; then echo "PRIMARY UP (answered via tunnel :$TUNNEL_PORT)"; exit 0; fi
  if vps1_host_up; then echo "TUNNEL BROKEN but VPS-1 host is UP (would restart $TUNNEL_SVC, NOT failover)"; exit 0; fi
  echo "VPS-1 DOWN (host TCP:22 + tunnel both failed) - sustained state would trigger failover"; exit 2
fi

fails=0
log "watchdog started (interval=${CHECK_INTERVAL}s threshold=${FAIL_THRESHOLD})"
while true; do
  if [ -f "$FLAG" ] || already_primary; then
    log "this node is already primary / failover flag present - watchdog exiting"
    exit 0
  fi

  if primary_up_via_tunnel; then
    [ "$fails" -gt 0 ] && log "primary reachable again - resetting failure counter"
    fails=0
  elif vps1_host_up; then
    # Host is up but the tunnel can't carry MySQL -> repair the tunnel, do NOT failover.
    log "primary unreachable via tunnel but VPS-1 host is UP - restarting $TUNNEL_SVC"
    systemctl restart "$TUNNEL_SVC" 2>/dev/null || true
    fails=0
  else
    fails=$((fails + 1))
    log "VPS-1 unreachable (host TCP:22 + tunnel both failed). failure ${fails}/${FAIL_THRESHOLD}"
    if [ "$fails" -ge "$FAIL_THRESHOLD" ]; then
      log "THRESHOLD REACHED - promoting VPS-2 to primary now"
      touch "$FLAG"
      bash "$PROMOTE" >>"$FAILLOG" 2>&1
      log "promotion finished (see $FAILLOG). VPS-1 must be rebuilt as a replica before returning. Watchdog exiting."
      exit 0
    fi
  fi
  sleep "$CHECK_INTERVAL"
done
