# Reelsoo - Database Failover Runbook

_Keep private. Describes DB topology and the manual failover procedure._

## Topology

```
VPS-1 (167.233.204.183, Hostinger)            VPS-2 (75.119.156.93, Contabo)
  - App (web/admin/api) + Redis               - Workers (transcoding/moderation/queue)
  - MySQL PRIMARY  (server_id=1)  ──binlog──▶  - MySQL REPLICA (server_id=2, read-only)
        ▲                                            connects via SSH tunnel 127.0.0.1:3307
        └──────── reelsoo-db-tunnel (SSH -L 3307:127.0.0.1:3306) ────────┘
```

- **Primary**: VPS-1 MySQL on `127.0.0.1:3306`. All writes happen here.
- **Replica**: VPS-2 MySQL on `127.0.0.1:3306` (`server_id=2`, `super_read_only=ON`). It pulls
  the primary's binlog through the existing SSH tunnel (`127.0.0.1:3307`) using the `repl` user.
- Classic binlog-position replication (no GTID). `binlog_format=ROW`, 30-day binlog retention on primary.
- Both `mysql` and `reelsoo-db-tunnel` are enabled on boot; replication auto-resumes after a restart.

## Health checks

On VPS-2:
```bash
mysql --defaults-file=/etc/mysql/debian.cnf -e "SHOW REPLICA STATUS\G" \
  | grep -E 'Replica_IO_Running:|Replica_SQL_Running:|Seconds_Behind_Source:|Last_(IO|SQL)_Error:'
```
Healthy = both `Running: Yes`, `Seconds_Behind_Source: 0`, empty errors.

Quick consistency spot-check (run on each box, compare):
```bash
mysql --defaults-file=/etc/mysql/debian.cnf -N -e "SELECT COUNT(*) FROM reelsoo.users;"
```

## Automatic failover (watchdog + boot guard)

Failover is now **automatic**. Two units, installed by `deploy/scripts/install-failover.sh`
(picks the right one by `@@server_id`):

- **`reelsoo-watchdog.service` on VPS-2** (`deploy/scripts/vps1-watchdog.sh`) - checks VPS-1
  every 15 s. A check fails only when BOTH the MySQL tunnel (`127.0.0.1:3307`) and a direct host
  ping to `167.233.204.183` fail. If just the tunnel is down it restarts `reelsoo-db-tunnel` instead.
  After **6 consecutive real failures (~90 s)** it runs `promote-vps2.sh` and exits. A
  `mysqladmin ping` that returns *"Access denied"* still counts as UP (the server answered).
- **`reelsoo-boot-guard.service` on VPS-1** (`deploy/scripts/vps1-boot-guard.sh`) - runs once at
  boot. It SSHes to VPS-2 (`/root/.ssh/cert_push`) and reads VPS-2's role. If VPS-2 is the live
  primary (`server_id=2, read_only=0`) it demotes VPS-1 to read-only and stops `reelsoo-web`/`-admin`
  so the LB keeps routing to VPS-2. Otherwise VPS-1 stays primary. If VPS-2 is unreachable it
  **fails open** (stays primary) to avoid a self-inflicted outage on a benign reboot.

Test the verdicts safely anytime (no side effects):
```bash
# on VPS-2
/var/www/reelsoo/deploy/scripts/vps1-watchdog.sh --check    # expect: PRIMARY UP
# on VPS-1
/var/www/reelsoo/deploy/scripts/vps1-boot-guard.sh --check  # expect: no action (VPS-2 is a replica)
```

Watchdog flag (`/var/lib/reelsoo-failover.done`) and demotion marker
(`/var/lib/reelsoo-demoted.flag`) are left behind after a failover; remove them once VPS-1 has
been rebuilt as a replica and the cluster is healthy again.

**Residual risk (2-node limit):** a true bidirectional network partition (each box alive but unable
to see the other) can still produce a brief split-brain - the watchdog would promote VPS-2 while
VPS-1 keeps serving. Eliminating this entirely needs a 3rd arbiter node for quorum.

## Failover: VPS-1 (primary) is DOWN - manual fallback

If you ever need to do it by hand, run the promote script **on VPS-2**:
```bash
bash /var/www/reelsoo/deploy/scripts/promote-vps2.sh
```
It makes the replica writable, repoints the VPS-2 app at its local DB (`DB_PORT 3307 → 3306`),
re-caches config, and restarts processes. Then send traffic to VPS-2 (Cloudflare LB does this
automatically if configured; otherwise update the DNS A record to `75.119.156.93`).

What it does, manually:
```sql
-- on VPS-2
STOP REPLICA;
SET GLOBAL super_read_only = OFF;
SET GLOBAL read_only      = OFF;
```
```bash
# point the app at the local (now-primary) DB and reload
sed -i 's/^DB_PORT=.*/DB_PORT=3306/' /var/www/reelsoo/server/.env
cd /var/www/reelsoo/server && php artisan config:cache && pm2 restart all
```

## ⚠️ When VPS-1 comes back

VPS-1's database is now **stale and diverged** - it missed every write that happened on VPS-2
during the outage. **Do NOT just start it back up as the primary** (that causes split-brain /
data loss). Instead, rebuild VPS-1 as a fresh replica of VPS-2:

1. On VPS-1: stop the app, `SET GLOBAL super_read_only=ON`.
2. Re-seed VPS-1 from a fresh dump of VPS-2 (`mysqldump --single-transaction --source-data=2`).
3. Configure VPS-1 to replicate from VPS-2, start replica, verify `Seconds_Behind_Source: 0`.
4. Optionally fail back later during a maintenance window (reverse the roles).

## Rebuilding the replica from scratch (if it breaks)

On VPS-2:
```bash
mysql --defaults-file=/etc/mysql/debian.cnf -e "STOP REPLICA; RESET REPLICA ALL;"
# re-dump from primary through the tunnel and re-import, then CHANGE REPLICATION SOURCE TO ... START REPLICA;
```
See the original setup steps in the project history / this repo's deploy notes.

## Notes
- The `repl` MySQL user and the replication password live only on the servers (not in git).
- The replica is for **failover**, not for offloading worker reads - worker job-chains read rows
  they just wrote, so they must stay on the primary to avoid replication-lag misses. The read/write
  split is for the web tier only, and only once VPS-2 also serves web traffic (load-balancer phase).
