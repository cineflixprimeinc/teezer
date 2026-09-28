# PostgreSQL Migration - State & Cutover Plan (resume-from-home)

**Branch:** `feat/postgres-support` (pushed to GitHub `origin`).
**Goal:** make PostgreSQL 17 the main DB for the whole platform (Laravel app + chat-server), keep MySQL intact as rollback, drop MySQL only later.

> ## ✅ CUTOVER EXECUTED - 2026-06-28 ~14:12 UTC
> Both app boxes are now **live on PostgreSQL** (`DB_CONNECTION=pgsql`, HEAD `063ee64`).
> - Final MySQL dump: `VPS-1:/root/teezer-cutover-202606281405.sql` (1.5 MB).
> - Transfer + parity: **116 tables, 9,926 rows, 0 mismatches** (Parity OK).
> - Smoke: health/trending/explore/music/ILIKE-search/feed all HTTP 200 with live data; chat-server `/socket.io/` 200; no `SQLSTATE` errors.
> - **Fix applied at cutover (was missing from prep):** `chat-server/.env` had only the MySQL `DB_*` vars, so `db.js`'s fallback `DB_PGSQL_PORT||DB_PORT` resolved to **3306** → `pg` error `received invalid response: 5b`. Copied the `DB_PGSQL_*` block from `server/.env` into `chat-server/.env` on both boxes; chat then connected. **Any future rebuild/failover must seed `chat-server/.env` with `DB_PGSQL_*`.**
> - MySQL still running on both boxes as rollback (§3). Soak before decommission (§5).
> - Side note: the live `/var/www/teezer` checkout couldn't switch onto branch `feat/postgres-support` (already used by the `/var/www/teezer-pg` worktree), so it was deployed via `git reset --hard origin/feat/postgres-support` - its local `main` ref now points at the pg commit. Rollback still works (`git reset --hard origin/main`; `origin/main` untouched).

> Secrets are NOT in this doc. The PG password is already set in each box's `server/.env`
> as `DB_PGSQL_PASSWORD` (and in your secure notes). SSH uses the deploy key
> `~/.ssh/teezer_vps_ed25519` (PowerShell: `C:\Users\DELL\.ssh\teezer_vps_ed25519`).

---

## 0. Topology / key facts
- **VPS-1 (primary):** `<SOURCE_VPS1_IP>` - MySQL **primary** (`127.0.0.1:3306`) + **PostgreSQL 17** (`127.0.0.1:5432`, localhost-only). App + git repo at `/var/www/teezer`.
- **VPS-2 (replica box):** `<SOURCE_VPS2_IP>` - MySQL **replica** (`127.0.0.1:3306`), writes tunnel to VPS-1 (`127.0.0.1:3307`). Also the worker host (pm2: teezer-web, teezer-queue, teezer-moderation, teezer-transcoding×3).
- Both app servers sit behind a Cloudflare load balancer and share ONE database. So both must flip together.
- **Single Postgres** lives on VPS-1. VPS-2 reaches it through a new SSH tunnel **`teezer-pg-tunnel.service`** → `127.0.0.1:5432` → VPS-1:5432 (mirrors the existing MySQL tunnel; separate service; enabled at boot).

---

## 1. DONE (no downtime; production untouched, still on MySQL)
1. **Code ported & committed** on `feat/postgres-support`:
   - Laravel app: pgsql connection in `config/database.php`, 16 driver-branched migrations, `2026_06_28_000001_convert_json_columns_to_jsonb`, ~39 query files rewritten (LIKE→ILIKE, DATE→::date, IF→CASE, @>, etc.), `db:transfer-to-pgsql` command (+ source-only-table guard).
   - chat-server: `db.js` mysql2→pg (compat shim), `schema.pgsql.sql` (10 chat + 4 orphan tables), SQL rewrites in `server.js`/`routes/conversations.js`, `package.json` pg.
   - Helper: `server/scripts/pg_sync_columns.php` (adds source-only columns to PG).
2. **PG 17 installed on VPS-1**; db `teezer` + role `teezer` (superuser, localhost only).
3. **PG schema built on VPS-1** from the branch (via worktree `/var/www/teezer-pg`): 158 migrations + `chat-server/schema.pgsql.sql` → **117 tables, zero errors** (matches prod).
4. **Schema-drift reconciled** (prod had drifted from migrations):
   - 14 non-Laravel tables created (chat_* + blocked_email_domains, email_verifications, signup_attempts, user_security_flags).
   - **56 enum CHECK constraints dropped** on PG (prod data had values beyond the migration enums, e.g. `rate_limits.identifier_type`).
   - **7 source-only columns added** (e.g. `user_moderation_settings.block_live_until`, `users.signup_ip`) via `pg_sync_columns.php`.
5. **Trial transfer of REAL prod data passed: 0 mismatches, 9,890 rows, 116 tables** (read-only on MySQL; no downtime).
6. **Both boxes pre-staged** for a fast flip (live still `DB_CONNECTION=mysql`):
   - `php-pgsql` installed; chat-server `pg` installed; branch fetched; `DB_PGSQL_*` added to each `server/.env`.
   - **`teezer-pg-tunnel.service` active + enabled on VPS-2; tested** (psql via tunnel → live data).

**The migration is fully prepped. Only the cutover window remains.**

---

## 2. The cutover window (when you're ready - causes downtime, ~10–20 min)

Run from your machine over SSH (deploy key). Two human gates.

### Pre-window sanity (no downtime)
```bash
# both tunnels up on VPS-2
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS2_IP> \
  'systemctl is-active teezer-pg-tunnel.service teezer-db-tunnel.service'
# PG reachable from VPS-2 (uses DB_PGSQL_PASSWORD from .env)
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS2_IP> \
  'cd /var/www/teezer/server && set -a && . ./.env && PGPASSWORD=$DB_PGSQL_PASSWORD psql -h127.0.0.1 -p5432 -U teezer -d teezer -c "select count(*) from users;"'
```

### Step A - Freeze writes (BOTH boxes)
```bash
# VPS-1 + VPS-2: maintenance mode
for H in <SOURCE_VPS1_IP> <SOURCE_VPS2_IP>; do
  ssh -i ~/.ssh/teezer_vps_ed25519 root@$H 'cd /var/www/teezer/server && php artisan down --retry=120'
done
# VPS-2: stop workers + chat-server so nothing writes to MySQL during the copy
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS2_IP> \
  'pm2 stop teezer-queue teezer-moderation teezer-transcoding teezer-web'
```

### Step B - Final MySQL backup (VPS-1 primary)
```bash
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS1_IP> 'bash -lc "
  cd /var/www/teezer/server && set -a && . ./.env
  F=/root/teezer-cutover-$(date +%Y%m%d%H%M).sql
  MYSQL_PWD=\$DB_PASSWORD mysqldump -u\$DB_USERNAME -h127.0.0.1 --single-transaction --routines --triggers --default-character-set=utf8mb4 \$DB_DATABASE > \$F
  ls -lh \$F"'
```
Confirm the file size is non-trivial.

### Step C - Transfer MySQL → Postgres (from the VPS-1 worktree)
```bash
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS1_IP> \
  'cd /var/www/teezer-pg/server && php artisan db:transfer-to-pgsql --from=mysql --to=pgsql --chunk=2000'
```
(The PG schema on VPS-1 is already drift-aligned from the trial, so this just re-truncates + reloads + resets sequences + parity.)

### ⛔ GATE 1 - review parity
The command prints a per-table table and `mismatches: 0` + `Parity OK`. **Every table must match.** If not, STOP → Rollback (§3). If OK, proceed.

### Step D - Flip both app boxes to Postgres
```bash
for H in <SOURCE_VPS1_IP> <SOURCE_VPS2_IP>; do
ssh -i ~/.ssh/teezer_vps_ed25519 root@$H 'bash -lc "
  cd /var/www/teezer
  git fetch origin feat/postgres-support
  git checkout feat/postgres-support && git reset --hard origin/feat/postgres-support
  cd server && composer dump-autoload -o
  sed -i \"s/^DB_CONNECTION=.*/DB_CONNECTION=pgsql/\" .env
  php artisan config:clear
  # chat-server already has pg installed; restart everything
"'
done
# restart services
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS1_IP> 'systemctl reload php8.2-fpm; pm2 restart all 2>/dev/null || true'
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS2_IP> 'systemctl reload php8.2-fpm 2>/dev/null; pm2 restart all'
```
Notes:
- VPS-1 `.env` PG host = `127.0.0.1:5432` (local). VPS-2 `.env` PG host = `127.0.0.1:5432` (the tunnel). Both already staged.
- chat-server (pm2) now runs on `pg` (db.js reads `DB_PGSQL_*`).

### Step E - Lift maintenance + smoke
```bash
for H in <SOURCE_VPS1_IP> <SOURCE_VPS2_IP>; do
  ssh -i ~/.ssh/teezer_vps_ed25519 root@$H 'cd /var/www/teezer/server && php artisan up'
done
```

### ⛔ GATE 2 - smoke test (live)
Exercise: login, feed, upload, comments, **search (ILIKE)**, studio **analytics (::date)**, profile **suggestions (@>/RANDOM)**, **chat** send/read + a call. Watch logs ~30–60 min:
```bash
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS1_IP> 'tail -n 100 /var/www/teezer/server/storage/logs/laravel.log'
```
If healthy → done. If not → Rollback (§3).

---

## 3. Rollback (MySQL is untouched throughout)
```bash
for H in <SOURCE_VPS1_IP> <SOURCE_VPS2_IP>; do
ssh -i ~/.ssh/teezer_vps_ed25519 root@$H 'bash -lc "
  cd /var/www/teezer
  php artisan down 2>/dev/null || true
  git checkout main && git reset --hard origin/main
  cd server && composer dump-autoload -o
  sed -i \"s/^DB_CONNECTION=.*/DB_CONNECTION=mysql/\" .env
  php artisan config:clear && php artisan up
"'
done
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS1_IP> 'systemctl reload php8.2-fpm; pm2 restart all'
ssh -i ~/.ssh/teezer_vps_ed25519 root@<SOURCE_VPS2_IP> 'systemctl reload php8.2-fpm; pm2 restart all'
```
One-liner essence: **`DB_CONNECTION=mysql` + `git checkout main` + redeploy.** Postgres writes made after the flip would be lost - roll back fast during Gate 2 if needed.

---

## 4. If the PG schema is ever rebuilt from scratch (e.g. fresh `migrate:fresh`)
The drift fixes must be re-applied IN THIS ORDER before transferring:
```bash
cd /var/www/teezer-pg/server
php artisan migrate --database=pgsql --force                       # 1. Laravel schema
PGPASSWORD=... psql -h127.0.0.1 -p5432 -U teezer -d teezer \
  -f /var/www/teezer-pg/chat-server/schema.pgsql.sql              # 2. chat + orphan tables
# 3. drop enum CHECK constraints (prod data drifted beyond migration enums):
PGPASSWORD=... psql -h127.0.0.1 -p5432 -U teezer -d teezer -c \
  "DO \$\$ DECLARE r record; BEGIN FOR r IN SELECT conrelid::regclass t, conname FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.t, r.conname); END LOOP; END \$\$;"
php scripts/pg_sync_columns.php                                    # 4. add source-only columns
php artisan db:transfer-to-pgsql --from=mysql --to=pgsql           # 5. data + parity
```

---

## 5. After you're confident (decommission MySQL - LATER, your call)
- Soak 1–2 weeks with MySQL running read-only as fallback; keep the `main` build tag deployable.
- Then: stop/disable MySQL on both boxes, remove the `teezer-db-tunnel.service` (VPS-2), drop the old `DB_*` (mysql) vars, merge `feat/postgres-support` → `main`.
- Optionally re-add corrected CHECK constraints and downgrade the `teezer` PG role from SUPERUSER to a normal owner.

---

## 6. Security TODO (do soon - these were exposed in chat)
- Rotate both **VPS root passwords**.
- Rotate the **GitHub PAT** embedded in the VPS `origin` remote (`ghp_…`).
- Optionally rotate the PG `teezer` password (update `DB_PGSQL_PASSWORD` in both `.env`).
