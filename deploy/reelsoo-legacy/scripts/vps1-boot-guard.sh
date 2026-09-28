#!/usr/bin/env bash
# ── TEEZER: disabled. Reelsoo-only legacy script kept for reference; see ../reelsoo-legacy/README.md ──
echo "Refusing to run: $0 is a Reelsoo-only legacy script (not for Teezer)." >&2; exit 1
# ─── Reelsoo split-brain boot guard - runs on VPS-1 at every boot ────────────
# Prevents two writable primaries.  If VPS-2 has become the LIVE primary (it was
# auto-promoted while VPS-1 was down), VPS-1 must NOT come back as a second
# writable primary.  On boot it asks VPS-2 for its role:
#
#   VPS-2 server_id=2 AND read_only=0  -> VPS-2 is the live primary.
#        => demote VPS-1 to read-only and stop its web procs so Cloudflare LB
#           routes only to VPS-2.  A human then rebuilds VPS-1 as a replica of
#           VPS-2 (see docs/failover-runbook.md).
#   VPS-2 read_only=1 (still a replica) -> normal. VPS-1 stays primary, no action.
#   VPS-2 unreachable -> fail OPEN (VPS-1 stays primary). A real failover means
#           VPS-2 is up and reachable on its public IP, so "unreachable" almost
#           always means no failover happened - staying primary avoids a
#           self-inflicted outage on a benign reboot. (2-node limit: a true
#           bidirectional partition is the documented residual risk.)
#
# Run `vps1-boot-guard.sh --check` for a side-effect-free decision printout.
set -uo pipefail

VPS2_IP="<REELSOO_HOST_2>"
KEY=/root/.ssh/cert_push
DEF=/etc/mysql/debian.cnf
LOG_TAG=reelsoo-boot-guard
MARK=/var/lib/reelsoo-demoted.flag

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

log(){ logger -t "$LOG_TAG" -- "$*" 2>/dev/null || true; echo "$(date -Is) [$LOG_TAG] $*"; }

# Echoes "<server_id> <read_only>" from VPS-2, or empty if unreachable.
vps2_role(){
  ssh -i "$KEY" -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 \
    root@"$VPS2_IP" "mysql --defaults-file=$DEF -N -e 'SELECT @@server_id, @@read_only;'" 2>/dev/null
}

demote_self(){
  log "VPS-2 is the live primary - demoting VPS-1 to read-only and stopping web."
  mysql --defaults-file="$DEF" -e "SET GLOBAL super_read_only=ON; SET GLOBAL read_only=ON;" 2>/dev/null || true
  pm2 stop reelsoo-web reelsoo-admin 2>/dev/null || true
  touch "$MARK"
  log "DEMOTED. Rebuild VPS-1 as a replica of VPS-2 before re-enabling it (docs/failover-runbook.md)."
}

CHECK_ONLY=0; [ "${1:-}" = "--check" ] && CHECK_ONLY=1

# Retry a few times - VPS-2 / network may be slow right after boot.
role=""
for _ in 1 2 3 4 5; do
  role="$(vps2_role)"
  [ -n "$role" ] && break
  sleep 5
done

if [ -z "$role" ]; then
  log "Could not reach VPS-2 to read its role - failing OPEN (VPS-1 stays primary)."
  exit 0
fi

sid="$(echo "$role" | awk '{print $1}')"
ro="$(echo "$role" | awk '{print $2}')"
log "VPS-2 role: server_id=${sid} read_only=${ro}"

if [ "$sid" = "2" ] && [ "$ro" = "0" ]; then
  if [ "$CHECK_ONLY" = "1" ]; then echo "DECISION: would DEMOTE VPS-1 (VPS-2 is live primary)"; exit 0; fi
  demote_self
else
  if [ "$CHECK_ONLY" = "1" ]; then echo "DECISION: no action - VPS-2 is a replica, VPS-1 remains primary"; exit 0; fi
  log "VPS-2 is a replica - VPS-1 remains primary, no action taken."
fi
