# Teezer deployment runbook

Teezer is an **independent** deployment. It has its own servers, its own
PostgreSQL database (seeded once from a dump of the source platform), its own
Backblaze B2 buckets, Redis, Centrifugo, LiveKit and Cloudflare zone. After the
one-time data copy described below, **nothing in Teezer talks to the source
platform's infrastructure** - no SSH, no database link, no licence/update server, no shared
bucket, no shared API keys.

Security rules for the whole runbook:

- Never paste passwords, keys or `.env` contents into chat, commits, tickets or screenshots.
- Real `.env` files live only on the servers. Only `.env.example` files (and the
  public-only `frontend/.env.production`, `admin/.env.production`) are committed.
- Nothing in this repository may hold source-platform credentials or connect to
  source-platform hosts.

| | |
|---|---|
| VPS1 (app) | `77.237.242.249` |
| VPS2 (workers, LiveKit) | `77.237.243.122` |
| App directory (both) | `/var/www/teezer` |
| Database | PostgreSQL 17, database `teezer`, role `teezer` |
| Ops e-mail (certbot, admin contact) | `teezerlive94@gmail.com` |
| Domain | `teezer.live` (Cloudflare, free plan) |

---

## 1. Architecture

```
                         Cloudflare (proxied, SSL Full strict)
     teezer.live / www   admin      api        cdn        realtime          livekit (DNS-only)
            |              |          |          |            |                   |
VPS1 77.237.242.249 ─ nginx :443 ─────┴──────────┴────────────┘                   |
  ├─ teezer-web    Next.js  127.0.0.1:3000   (pm2)                                |
  ├─ teezer-admin  Next.js  127.0.0.1:3001   (pm2)                                |
  ├─ APISIX gateway 127.0.0.1:9080  (docker compose, teezer-apisix.service)       |
  │     ├─ Laravel: nginx internal vhost 127.0.0.1:8091 -> php-fpm                |
  │     └─ Go API (backend-go): 127.0.0.1:8090  (systemd teezer-go)               |
  ├─ PostgreSQL 17 :5432 (local) + PgBouncer :6432                                |
  ├─ Redis :6379                                                                  |
  ├─ Centrifugo 127.0.0.1:8000  (realtime.teezer.live -> /connection/ only)       |
  ├─ NATS JetStream 127.0.0.1:4222 (Go event bus)                                 |
  ├─ Laravel scheduler (cron, www-data, VPS1 ONLY)                                |
  ├─ nginx signed media origin (cdn.teezer.live -> private Teezer B2 bucket)      |
  └─ teezer-livekit-tunnel  127.0.0.1:7880 -> VPS2:7880 (SSH)                     |
                                                                                  |
VPS2 77.237.243.122                                                               |
  ├─ pm2 queue workers (deploy/pm2/ecosystem.worker.config.js): teezer-transcoding,
  │     teezer-media-mirror, teezer-transcoding-backfill, teezer-video-transfer,
  │     teezer-moderation, teezer-queue
  │     -> reach VPS1 PostgreSQL/PgBouncer and Redis through an SSH tunnel
  ├─ LiveKit server 127.0.0.1:7880 behind nginx (livekit.teezer.live) <───────────┘
  │     + redis-livekit :6400, livekit-egress (docker)
  └─ ClickHouse (optional analytics)
```

Config files, all in `deploy/`:

| Component | Files |
|---|---|
| nginx vhosts | `deploy/nginx/teezer-*.conf` (see `deploy/nginx/README.md`) |
| APISIX | `deploy/apisix/` (`teezer-apisix.service`, `routes/*.json`) |
| Centrifugo | `deploy/centrifugo/` |
| NATS | `deploy/nats/` |
| LiveKit | `deploy/livekit/` + `deploy/nginx/teezer-livekit.conf` |
| ClickHouse | `deploy/clickhouse/` (optional) |
| pm2 | `deploy/pm2/ecosystem.config.js` (VPS1), `ecosystem.worker.config.js` (VPS2) |
| DB restore | `deploy/db/restore-db-dump.sh`, `deploy/db/post-restore-teezer.sql`, `deploy/db/rename-brand-values.sql` |
| Media copy | `deploy/b2-migration/copy-media.sh` |
| Redeploy | `deploy/vps-deploy.sh` (on VPS1), `deploy_photo.py` (from an operator PC) |

Internal ports are kept identical to the source platform's; confirm each is free
on the VPS before enabling a service (`ss -ltnp`).

---

## 2. Cloudflare (free plan)

No Load Balancer, no paid Workers features are used.

### DNS records

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `teezer.live` | 77.237.242.249 | Proxied |
| A (or CNAME to `teezer.live`) | `www` | 77.237.242.249 | Proxied |
| A | `api` | 77.237.242.249 | Proxied |
| A | `admin` | 77.237.242.249 | Proxied |
| A | `cdn` | 77.237.242.249 | Proxied |
| A | `realtime` | 77.237.242.249 | Proxied (WebSockets work on the free plan) |
| A | `livekit` | 77.237.243.122 | **DNS only** (grey cloud) |
| A | `media` (optional alias of cdn) | 77.237.242.249 | Proxied |

- `livekit` must be DNS-only: WebRTC media (UDP 50000-60000, TCP 7881) goes
  straight to the VPS IP and cannot pass through the Cloudflare proxy.
- **Leave the existing `rtc`, `console` and `backend` records alone.** They
  belong to other services of the customer; Teezer must not use or change them.
- Free-plan proxy limit: request bodies over 100 MB are rejected by Cloudflare.
  Video uploads go directly to B2 on presigned URLs, so this only matters for
  API calls.

### SSL/TLS

- SSL/TLS mode: **Full (strict)**. Origins present real Let's Encrypt certificates.
- "Always Use HTTPS": on (after certificates exist).
- Minimum TLS 1.2.

### Certificates (certbot)

VPS1 - one certificate named `teezer.live` (path
`/etc/letsencrypt/live/teezer.live/`, used by every VPS1 vhost). DNS-01 is the
most robust behind the Cloudflare proxy and allows a wildcard:

```bash
apt install -y certbot python3-certbot-dns-cloudflare
# Cloudflare API token with Zone:DNS:Edit on teezer.live only
mkdir -p -m 700 /root/.secrets && install -m 600 /dev/null /root/.secrets/cloudflare.ini
echo 'dns_cloudflare_api_token = <token>' > /root/.secrets/cloudflare.ini
certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  --cert-name teezer.live -d teezer.live -d '*.teezer.live' \
  -m teezerlive94@gmail.com --agree-tos --no-eff-email
```

(Alternative without an API token: temporarily set the records DNS-only, run
`certbot certonly --webroot -w /var/www/html --cert-name teezer.live -d teezer.live -d www.teezer.live -d api.teezer.live -d backend.teezer.live -d cdn.teezer.live -d realtime.teezer.live -d media.teezer.live -m teezerlive94@gmail.com --agree-tos`, then re-enable the proxy.)

VPS2 - its own certificate for LiveKit (record is DNS-only, so HTTP-01 works):

```bash
certbot certonly --webroot -w /var/www/html -d livekit.teezer.live \
  -m teezerlive94@gmail.com --agree-tos --no-eff-email
```

Renewal hook on both boxes: `echo 'systemctl reload nginx' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && chmod +x $_`.

---

## 3. Server bootstrap (both VPS)

```bash
apt update && apt install -y nginx-extras git curl unzip rsync redis-server \
  php8.3-fpm php8.3-cli php8.3-pgsql php8.3-redis php8.3-xml php8.3-curl php8.3-mbstring \
  php8.3-zip php8.3-bcmath php8.3-gd php8.3-intl ffmpeg docker.io docker-compose-v2
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs && npm i -g pm2
# Composer: https://getcomposer.org/download/
```

- `nginx-extras` (not plain `nginx`) is required: the media origin uses `secure_link`.
- The committed vhosts reference `php8.2-fpm.sock`; adjust to the PHP version
  actually installed.
- PostgreSQL 17 + PgBouncer on VPS1 only: `apt install -y postgresql-17 pgbouncer`
  (PGDG repository). PgBouncer listens on `127.0.0.1:6432`.

Clone the Teezer repository to `/var/www/teezer` on both boxes.

**Outbound block of the source platform (recommended, both boxes)** - makes it
physically impossible for anything on Teezer to reach the source platform servers:

```bash
nft add table inet teezer_guard
nft add chain inet teezer_guard out '{ type filter hook output priority 0; }'
nft add rule inet teezer_guard out ip daddr '{ 167.233.204.183, 75.119.156.93, 185.193.19.86, 217.217.251.44, 217.217.249.50, 139.99.89.181, 139.99.89.10 }' drop
nft list ruleset > /etc/nftables.conf   # persist (review the file first)
```

---

## 4. Database: one-time copy from the source platform

The copy is a **read-only** dump taken by the operator on the source server, then
carried to Teezer by the operator. Teezer servers never receive any credential
for the source platform and never connect to it.

1. **On the source server (operator, read-only):**
   ```bash
   pg_dump -Fc --no-owner --no-acl -d <source_db> -f /root/source.dump
   sha256sum /root/source.dump
   ```
   `pg_dump` reads a consistent snapshot and does not block writers.
2. **Transfer:** the operator downloads the file to their own machine, then
   uploads it to Teezer VPS1 (`scp source.dump root@77.237.242.249:/root/`),
   and checks the sha256 matches. Delete intermediate copies afterwards - the
   dump contains user data.
3. **Restore on VPS1:**
   ```bash
   cd /var/www/teezer
   sudo bash deploy/db/restore-db-dump.sh /root/source.dump
   sudo -u postgres psql -c '\password teezer'
   ```
   The script creates role and database `teezer`, refuses to touch an existing
   non-empty database, only uses the local socket, and runs **no** migrations,
   seeders or cleanup.
4. **Post-restore review:** go through `deploy/db/post-restore-teezer.sql`
   statement by statement (it is all commented out on purpose). At minimum:
   clear the licensing tables, revoke all `personal_access_tokens` and sessions,
   wipe `integration_settings` credentials, mail/social-login secrets in
   `app_settings`, payment secrets in `admin_coin_settings`, and - after the
   media copy - rewrite absolute source-platform media URLs to `cdn.teezer.live`.
   Then run `deploy/db/rename-brand-values.sql` (idempotent) to convert
   brand-named values the code compares against.
5. **Migrations:** check only - `cd server && php artisan migrate:status`.
   Running `php artisan migrate` is a deliberate operator decision taken after a
   backup (`deploy/vps-deploy.sh --migrate`). Never run `db:seed` on this database.
6. PgBouncer: add `teezer = host=127.0.0.1 port=5432 dbname=teezer` to
   `/etc/pgbouncer/pgbouncer.ini`, add the `teezer` user to `userlist.txt`, and
   point the apps at `127.0.0.1:6432`. Use `pool_mode = session` unless you have
   verified the app is transaction-pool safe. Admin tasks (pg_dump, restore,
   migrations) go directly to 5432.

---

## 5. Application configuration

### APP_KEY decision

**Reuse the source platform's `APP_KEY`** in `server/.env`. Encrypted columns
(users' 2FA secrets, encrypted settings/credentials) were encrypted with it; a
new key would make them undecryptable and lock users out of 2FA.

Because that key is shared with the source platform, **every secret that was
stored encrypted is still the source platform's secret**. Immediately, before
opening the site:

- wipe and re-enter all integration, payment, mail, social-login, push and
  moderation credentials with **Teezer's own** accounts (section 4 step 4, then
  the admin panel);
- use new Teezer-only values for everything that is not in the database:
  `MEDIA_SIGNING_SECRET`, `CENTRIFUGO_TOKEN_SECRET`/`CENTRIFUGO_API_KEY`,
  LiveKit key/secret, APISIX admin key, B2 keys, DB passwords, Redis password.

Follow-up (recommended once stable): rotate to a fresh `APP_KEY` and put the old
one in `APP_PREVIOUS_KEYS` so existing ciphertext still decrypts.

### server/.env (VPS1, and a copy on VPS2)

Start from `server/.env.example` (already Teezer-valued) and set at least:

```ini
APP_URL=https://api.teezer.live
DB_CONNECTION=pgsql
DB_PGSQL_HOST=127.0.0.1
DB_PGSQL_PORT=6432            # PgBouncer (VPS2: the local end of its tunnel)
DB_PGSQL_DATABASE=teezer
DB_PGSQL_USERNAME=teezer
SESSION_DOMAIN=.teezer.live
CORS_ORIGIN=https://teezer.live,https://www.teezer.live,https://backend.teezer.live
MEDIA_URL=https://cdn.teezer.live
FILESYSTEM_DISK=b2            # + Teezer's own B2_* bucket/key values
LICENSE_SERVER_ENABLED=false
LICENSING_CLIENT_ENABLED=false
LICENSE_SERVER_URL=
```

`backend-go/.env` is separate: set `PORT=8090`, `HOST=127.0.0.1` and the same
`DB_PGSQL_*` values (the Go service keeps its own copy).

Frontend/admin build configs are committed as `frontend/.env.production` and
`admin/.env.production` (public values only). Site keys go in
`.env.production.local` on the VPS.

### Services on VPS1

```bash
cd /var/www/teezer
# nginx vhosts (certificates from section 2 must exist first)
cp deploy/nginx/teezer-{web,admin,api,api-internal,realtime}.conf /etc/nginx/sites-available/
cp deploy/nginx/teezer-static-cache-map.conf /etc/nginx/conf.d/
for f in web admin api api-internal realtime; do ln -sf /etc/nginx/sites-available/teezer-$f.conf /etc/nginx/sites-enabled/; done
B2_DOWNLOAD_HOST=f00X.backblazeb2.com bash deploy/nginx/install.sh   # media origin (cdn.teezer.live)
# APISIX
cd deploy/apisix && cp .env.apisix.example .env && $EDITOR .env && cd ../..
cp deploy/apisix/teezer-apisix.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now teezer-apisix
bash deploy/apisix/apply-routes.sh
# Centrifugo / NATS
(cd deploy/centrifugo && cp .env.centrifugo.example .env && $EDITOR .env && docker compose --env-file .env up -d)
(cd deploy/nats && docker compose up -d)
# Next.js apps
(cd frontend && npm ci && npm run build) && (cd admin && npm ci && npm run build)
pm2 start deploy/pm2/ecosystem.config.js && pm2 save && pm2 startup
# Laravel
(cd server && composer install --no-dev -o && php artisan config:cache && php artisan route:cache)
# scheduler - VPS1 only
echo '* * * * * cd /var/www/teezer/server && php artisan schedule:run >> /dev/null 2>&1' | crontab -u www-data -
```

`teezer-go.service` (systemd, Go API on 127.0.0.1:8090):

```ini
[Unit]
Description=Teezer Go API
After=network.target postgresql.service
[Service]
User=www-data
WorkingDirectory=/var/www/teezer/backend-go
EnvironmentFile=/var/www/teezer/backend-go/.env
ExecStart=/var/www/teezer/backend-go/bin/api
Restart=on-failure
[Install]
WantedBy=multi-user.target
```
(build with `cd backend-go && go build -o bin/api ./cmd/api`.)

### Services on VPS2

- SSH tunnel VPS2 -> VPS1 for PostgreSQL/PgBouncer and Redis (a restricted key,
  `permitopen="127.0.0.1:6432",permitopen="127.0.0.1:6379"` on VPS1), exposed
  locally e.g. as `127.0.0.1:6432` and `127.0.0.1:6390`; point VPS2's
  `server/.env` at those ports.
- `pm2 start deploy/pm2/ecosystem.worker.config.js && pm2 save`.
  **No scheduler on VPS2.**
- LiveKit: follow `deploy/livekit/README.md`; webhook URL
  `https://api.teezer.live/api/v1/streamhub/webhook`; nginx vhost
  `deploy/nginx/teezer-livekit.conf`. On VPS1 install
  `deploy/livekit/teezer-livekit-tunnel.service`.
- ClickHouse (optional): `deploy/clickhouse/`. The ClickHouse database name
  is `teezer` (hardcoded in backend-go); the user is `teezer`.

---

## 6. Media (Backblaze B2)

1. Create Teezer's **own** B2 buckets (media + private documents), both
   **Private**, and Teezer application keys scoped to them.
2. Copy existing media from the source bucket, read-only, with
   `deploy/b2-migration/copy-media.sh`. On the operator machine,
   configure rclone remotes `source-ro` (a **read-only** key issued by the
   source owner) and `teezer-b2` (Teezer key). Then:
   ```bash
   SRC_BUCKET=<source> DST_BUCKET=<teezer> ./copy-media.sh          # dry run
   SRC_BUCKET=<source> DST_BUCKET=<teezer> ./copy-media.sh --run
   SRC_BUCKET=<source> DST_BUCKET=<teezer> ./copy-media.sh --check
   ```
   Repeat for the private bucket. The script only ever uses `rclone copy`.
   Once done, delete the `source-ro` remote from the operator machine.
3. **Bucket CORS** (browser uploads go straight to B2): allow origins
   `https://teezer.live`, `https://www.teezer.live`, `https://backend.teezer.live`,
   methods `GET, HEAD, PUT`, headers `*`, expose `ETag`. Easiest:
   `cd server && php artisan media:cors --dry-run` then `php artisan media:cors`
   (uses `CORS_ORIGIN`).
4. `php artisan media:refresh-b2-token` and its daily cron (see
   `deploy/nginx/README.md`):
   `17 4 * * * cd /var/www/teezer/server && php artisan media:refresh-b2-token >/dev/null 2>&1 && nginx -t -q && systemctl reload nginx`

---

## 7. Licensing and the marketplace tooling

- Licensing is **disabled**: `LICENSE_SERVER_ENABLED=false`,
  `LICENSING_CLIENT_ENABLED=false`, `LICENSE_SERVER_URL=` (empty).
- **Never install `bin/teezer`** (the marketplace updater) or run
  `install/install.sh` on Teezer servers. Both are inherited marketplace tools;
  they now refuse to run without an explicit `LICENSE_SERVER_URL`,
  and they must never be pointed at the source platform's licence/update server.

---

## 8. Redeploys

- On VPS1: `bash deploy/vps-deploy.sh` (pull, build, reload). Migrations only
  with `--migrate`, after a backup.
- From an operator PC: `python deploy_photo.py [app|workers]` - SSH key
  `~/.ssh/teezer_deploy`, targets only the two Teezer IPs, refuses the source platform server IPs,
  never runs migrations.

---

## 9. Verification checklist

- [ ] `dig +short teezer.live api.teezer.live cdn.teezer.live realtime.teezer.live` -> Cloudflare IPs; `dig +short livekit.teezer.live` -> 77.237.243.122
- [ ] `curl -sI https://teezer.live` 200, `https://backend.teezer.live` 200 (noindex header), `https://api.teezer.live/up` 200
- [ ] CORS: `curl -si -X OPTIONS https://api.teezer.live/api/v1/videos -H 'Origin: https://teezer.live' -H 'Access-Control-Request-Method: GET' | grep -i access-control-allow-origin` echoes the teezer origin
- [ ] `curl -s https://cdn.teezer.live/_health` -> `ok`; an unsigned `/hls/...` URL -> 403; a public video plays in the app
- [ ] Realtime: website console shows the Centrifugo WebSocket to `wss://realtime.teezer.live/connection/websocket` connected; `https://realtime.teezer.live/api` -> 404
- [ ] LiveKit: `lk room join --url wss://livekit.teezer.live ...` from an external box connects; Space audio works between two devices
- [ ] Login works for an existing user (new Sanctum token), 2FA codes still verify (APP_KEY reuse)
- [ ] Upload a video: goes to the Teezer bucket, transcodes on VPS2, plays
- [ ] Password-reset e-mail arrives from `@teezer.live` via Teezer's mail account
- [ ] Payments/IAP configured with Teezer's own merchant accounts (or disabled)
- [ ] `php artisan migrate:status` reviewed; no unexpected pending migrations
- [ ] `select count(*) from personal_access_tokens` was 0 right after cleanup; licensing tables empty
- [ ] `pm2 ls` on both boxes: only `teezer-*` processes; scheduler cron only on VPS1

## 10. Independence guarantees

- No committed file contains a source platform server IP as a connection
  target; `deploy_photo.py` hard-refuses them. The nftables rule in section 3 blocks them at the network level.
- No source-platform credentials anywhere: B2 bucket ids/key ids in docs are placeholders;
  the only access to source-platform data is the operator-run read-only dump and the
  read-only rclone remote, both removed after the copy.
- Licensing is off; installer/updater have no default server.
- All Sanctum tokens and sessions from the source are revoked; all third-party
  credentials re-entered with Teezer's accounts; all non-DB secrets are new.
- Database, Redis, Centrifugo, NATS, LiveKit, ClickHouse and B2 are Teezer-owned
  instances on Teezer hosts. No script runs `migrate` or `db:seed` implicitly.
- Search the repo before each release:
  `git grep -nE '167\.233\.204\.183|75\.119\.156\.93|185\.193\.19\.86|217\.217\.251\.44|217\.217\.249\.50'`
  (expected hits: the denylists in `deploy_photo.py` and this file).
