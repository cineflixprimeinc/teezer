# Teezer - Two-VPS Setup Plan (Single Website, Load Balanced)

**Goal:** Run one website (teezer.live) across two VPS - load split across both, with auto-failover, one shared database, and a private secure link between the servers.

**Generated:** 2026-06-23

---

## Current situation

| | |
|---|---|
| **VPS-1** | `<SOURCE_VPS1_IP>` (Hostinger) - has MySQL, DNS points here, gets all traffic |
| **VPS-2** | `<SOURCE_VPS2_IP>` (Contabo) - runs the app, connects to the shared DB, **currently gets no traffic** |
| **Media** | Cloudflare R2 (external, already shared ✅) |
| **DNS / CDN** | Cloudflare |

**Two problems being fixed by this plan:**
1. VPS-2 receives no traffic (DNS points only to VPS-1) → it's idle.
2. The cross-provider DB link is likely exposing MySQL to the public internet → security risk.

---

## Target architecture

```
                    +----------------------+
   Visitors ------> | Cloudflare Load Bal. |  (health checks + splits traffic)
                    +----------+-----------+
                  +------------+------------+
                  v                         v
        VPS-1 (<SOURCE_VPS1_IP>)      VPS-2 (<SOURCE_VPS2_IP>)
        - App (web/admin/api)      - App (web/admin/api)
        - MySQL  <----------------- DB_HOST = 10.0.0.1
        - Redis (optional) <------- REDIS_HOST = 10.0.0.1
                  +---- WireGuard private tunnel ----+
                         (10.0.0.1  <->  10.0.0.2)

        Media/uploads -> Cloudflare R2 (already shared)
```

**Golden rule of multi-server:** anything stateful must be *shared*, not duplicated.

| State | Solution | Status |
|---|---|---|
| Database | One MySQL on VPS-1, both connect over WireGuard | to set up |
| Sessions | `database` driver - shared DB makes it automatic | already shared |
| Cache / rate-limits | `database` driver (or shared Redis for performance) | already shared |
| Queue jobs | `database` driver (shared) | already shared |
| Uploaded media | Cloudflare R2 (external) | already done |
| Cron / scheduler | Must run on ONE server only | to set up |

> Because sessions, cache, and queue all use the `database` driver and the DB is shared, they are automatically consistent across both servers with no extra work. Only the DB link, the load balancer, and the scheduler rule need setup.

---

## Step 0 - SECURITY FIRST: close any public MySQL exposure (VPS-1)

Before anything, check whether yesterday's setup exposed MySQL publicly:

```bash
ss -tlnp | grep 3306          # DANGER if you see 0.0.0.0:3306
ufw status | grep 3306        # DANGER if it shows 'ALLOW Anywhere'
```

If exposed, it will be replaced by the private WireGuard tunnel below. Do not leave 3306 open to the internet.

---

## Step 1 - WireGuard private tunnel between the two VPS

Gives a private `10.0.0.x` network so DB/Redis traffic never crosses the public internet.

**On BOTH servers:**
```bash
apt update && apt install -y wireguard
wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
cat /etc/wireguard/publickey   # note each server's PUBLIC key
```

**On VPS-1** - `/etc/wireguard/wg0.conf` (uses VPS-2's public key):
```ini
[Interface]
Address = 10.0.0.1/24
PrivateKey = <VPS-1 privatekey>
ListenPort = 51820

[Peer]
PublicKey = <VPS-2 publickey>
AllowedIPs = 10.0.0.2/32
Endpoint = <SOURCE_VPS2_IP>:51820
PersistentKeepalive = 25
```

**On VPS-2** - `/etc/wireguard/wg0.conf` (uses VPS-1's public key):
```ini
[Interface]
Address = 10.0.0.2/24
PrivateKey = <VPS-2 privatekey>
ListenPort = 51820

[Peer]
PublicKey = <VPS-1 publickey>
AllowedIPs = 10.0.0.1/32
Endpoint = <SOURCE_VPS1_IP>:51820
PersistentKeepalive = 25
```

**On BOTH** - allow the WG port to each other, then start:
```bash
# VPS-1:  ufw allow from <SOURCE_VPS2_IP> to any port 51820 proto udp
# VPS-2:  ufw allow from <SOURCE_VPS1_IP> to any port 51820 proto udp
systemctl enable --now wg-quick@wg0
ping -c2 10.0.0.1   # run from VPS-2 - should reply
```

---

## Step 2 - Bind MySQL to the tunnel (VPS-1)

```bash
# Edit /etc/mysql/mysql.conf.d/mysqld.cnf  ->  set:
#   bind-address = 127.0.0.1,10.0.0.1
systemctl restart mysql

# Allow the app user to connect from VPS-2 over the tunnel:
mysql -u root -e "CREATE USER IF NOT EXISTS 'teezer'@'10.0.0.2' IDENTIFIED BY 'STRONG_DB_PASSWORD'; \
GRANT ALL PRIVILEGES ON teezer.* TO 'teezer'@'10.0.0.2'; FLUSH PRIVILEGES;"

# Firewall: allow ONLY VPS-2 over the tunnel; public 3306 stays closed
ufw allow from 10.0.0.2 to any port 3306
ufw status | grep 3306   # must NOT show 'Anywhere'
```

---

## Step 3 - Point VPS-2's app at the tunnel

In **VPS-2's** `/var/www/teezer/server/.env`:
```
DB_HOST=10.0.0.1
DB_USERNAME=teezer
DB_PASSWORD=STRONG_DB_PASSWORD
```

Then on VPS-2:
```bash
php artisan config:cache
php artisan migrate:status   # confirms it reads the shared DB
```

Sessions/cache/queue stay on `database` - no change needed.

---

## Step 4 - Cloudflare Load Balancer

Cloudflare dashboard -> **Traffic -> Load Balancing**:

1. **Create an origin pool** with two origins: `<SOURCE_VPS1_IP>` and `<SOURCE_VPS2_IP>`.
2. **Health check (monitor):** Type `HTTPS`, Path `/api/v1/health`, expected code `200`, interval 60s. Cloudflare auto-removes a server that fails.
3. **Session affinity:** ON (cookie) - keeps each visitor on one server.
4. **Attach the LB** to `teezer.live`, `www`, and `api` hostnames. The LB replaces the single A record.

Ensure **both** servers' Nginx serves all hostnames (web, admin, api) and has the origin TLS cert, since traffic can now land on either.

---

## Step 5 - Scheduler on ONE server only

The app has 4 scheduled jobs (token purge, analytics aggregation, sanctum prune, restrictions:expire). If both servers run them, they fire twice.

```bash
# VPS-1 - KEEP this cron entry:
* * * * * cd /var/www/teezer/server && php artisan schedule:run >> /dev/null 2>&1

# VPS-2 - REMOVE that cron line entirely (crontab -e).
# Queue workers may run on both servers safely.
```

---

## Step 6 - Deploy to BOTH servers from now on

Every future deploy must hit both. Save as `deploy.sh`:

```bash
for H in <SOURCE_VPS1_IP> <SOURCE_VPS2_IP>; do
  ssh root@$H 'cd /var/www/teezer && git pull && \
    cd server && composer install --no-dev -o && php artisan migrate --force && php artisan config:cache && \
    cd ../frontend && npm ci && npm run build && pm2 reload teezer-web && \
    cd ../admin && npm ci && npm run build && pm2 reload teezer-admin'
done
```

`migrate` is idempotent - the second run simply reports nothing to migrate.

---

## Recommended order

1. **Step 0** - close any public MySQL exposure (security first).
2. **Step 1** - WireGuard tunnel; verify `ping 10.0.0.1` works.
3. **Step 2** - bind DB, grant user, firewall.
4. **Step 3** - repoint VPS-2 `.env`; confirm it reads the DB.
5. **Step 4** - Cloudflare Load Balancer; VPS-2 finally gets traffic.
6. **Step 5** - scheduler fix.
7. **Step 6** - adopt the two-server deploy script.

---

## Verification checklist

- [ ] `ping 10.0.0.1` from VPS-2 replies (tunnel up)
- [ ] VPS-1 `ss -tlnp | grep 3306` shows `127.0.0.1` and `10.0.0.1` only - NOT `0.0.0.0`
- [ ] VPS-1 `ufw status` does NOT show `3306 ALLOW Anywhere`
- [ ] VPS-2 `php artisan migrate:status` reads the shared DB
- [ ] Cloudflare LB health check is green for both origins
- [ ] Cron `schedule:run` exists on VPS-1 only
- [ ] A test request lands on each server (check Nginx access logs on both)

---

## High availability - status

- **MySQL replication** - ✅ DONE. VPS-2 runs a read replica (`server_id=2`, `super_read_only`) of VPS-1's
  primary, replicating its binlog through the SSH tunnel. Verified `Seconds_Behind_Source: 0`.
- **Redis** - ✅ DONE. Each server has its OWN local Redis for cache/sessions (LB cookie affinity pins a
  user to one box, so per-server sessions are fine; API is token-based).
- **Automated failover for the DB** - ✅ DONE (2026-06-24). `teezer-watchdog.service` on VPS-2 promotes
  the replica if VPS-1 is unreachable for ~90s; `teezer-boot-guard.service` on VPS-1 self-demotes on
  return to prevent split-brain. Installed by `deploy/scripts/install-failover.sh`. See
  `docs/failover-runbook.md`. NOTE: the watchdog's host check is **TCP to :22**, not ICMP - VPS-1's
  firewall drops pings from VPS-2.

## Read/write split (2026-06-24) - IMPORTANT for site speed

Problem found: VPS-2 was sending **every** query through the SSH tunnel to VPS-1's primary
(~**1000 ms/query** due to inter-provider latency × per-connection handshakes), while its own local
replica answers in ~70 ms. Because the Cloudflare LB sends ~half of users to VPS-2, half the traffic
was crawling.

Fix: `server/config/database.php` now defines a read/write split with `sticky => true`:
- **reads** → `DB_READ_HOST`/`DB_READ_PORT`, **writes** → `DB_WRITE_HOST`/`DB_WRITE_PORT`.
- Both fall back to `DB_HOST`/`DB_PORT` when unset, so **VPS-1 is unchanged** (everything local).
- **VPS-2 `.env`** sets `DB_READ_HOST=127.0.0.1`, `DB_READ_PORT=3306` (local replica) while
  `DB_PORT=3307` keeps writes on the primary via the tunnel.
- `sticky` keeps post-write reads on the primary within a request, so a user always sees data they
  just created even though the replica is normally 0s behind. Queue jobs rely on the same guarantee
  plus retries, so worker read-after-write across jobs is safe in practice.

Future option for even lower write latency / removing the 1-core bottleneck: move the write-primary
onto the larger box (VPS-2, 6-core/12 GB) or upgrade VPS-1.

---

*Teezer infrastructure plan. Keep this document private - it describes server topology.*
