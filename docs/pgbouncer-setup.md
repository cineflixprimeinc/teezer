# PgBouncer - Teezer

Connection pooler in front of Postgres. Installed live 2026-06-28. At current scale it's **preparatory** (pooling pays off at hundreds of concurrent connections); it removes the "PHP-FPM opens a PG connection per request → exhausts `max_connections`" failure mode before it can happen.

## Topology
```
VPS-1 Laravel ──► 127.0.0.1:6432 (PgBouncer)  ──► Postgres 127.0.0.1:5432
VPS-2 Laravel ──► tunnel 127.0.0.1:5432       ──► VPS-1:6432 (PgBouncer) ──► Postgres
chat-server   ──► 127.0.0.1:5432 (direct)     ──► Postgres   (left direct: small fixed node-pg pool)
```
- PgBouncer runs **only on VPS-1** (where Postgres is), `listen_addr=127.0.0.1:6432` (localhost only).
- VPS-1 Laravel `.env`: `DB_PGSQL_PORT=6432`.
- VPS-2 routes through it via a systemd **override** on `teezer-pg-tunnel.service` that retargets the tunnel's remote end to `:6432` (VPS-2 `.env` unchanged, still `DB_PGSQL_PORT=5432`).

## Config (`/etc/pgbouncer/pgbouncer.ini` on VPS-1)
- `pool_mode = transaction` - max multiplexing; a server conn is returned to the pool at COMMIT, not at disconnect.
- `max_prepared_statements = 200` - **required for Laravel/PDO**: PDO uses server-side prepared statements; PgBouncer ≥1.21 makes them work transparently in transaction mode (we run 1.25.2). Without this you'd get `prepared statement "…" does not exist`.
- `auth_type = scram-sha-256`, `auth_file = /etc/pgbouncer/userlist.txt` (`"teezer" "<pw>"`, mode 640, owner postgres).
- `ignore_startup_parameters = extra_float_digits,options,search_path,application_name` - Laravel sends these at connect; PgBouncer must ignore unknowns or it rejects the connection.
- `default_pool_size = 25`, `max_client_conn = 2000`, `reserve_pool_size = 5`.

## Verified
- psql + app through `:6432` → all hot endpoints HTTP 200 (3× each, prepared-stmt reuse clean), no `prepared statement`/`SQLSTATE` errors.
- `SHOW POOLS` → 5 client conns multiplexed onto a 5-conn server pool; `pg_stat_activity` for `teezer` stays ~5 backends.
- `counters:flush` (writes in txns) works through the pool.

## Caveats of transaction mode (already handled / be aware)
- No session-level state across statements: `SET`, session advisory locks, `LISTEN/NOTIFY`, `WITH HOLD` cursors won't persist across pooled transactions. Laravel doesn't rely on these in request handling. If you add code that does, route it to a direct `:5432` connection.
- Migrations/`artisan` that need session features can be run against `:5432` directly if ever needed.

## Rollback (instant, non-destructive)
```bash
# VPS-1: point Laravel back at Postgres directly
ssh VPS1 'cd /var/www/teezer/server && sed -i "s/^DB_PGSQL_PORT=.*/DB_PGSQL_PORT=5432/" .env && php artisan config:clear && systemctl reload php8.2-fpm'
# VPS-2: revert the tunnel to target 5432
ssh VPS2 'rm /etc/systemd/system/teezer-pg-tunnel.service.d/override.conf && systemctl daemon-reload && systemctl restart teezer-pg-tunnel.service'
# (optionally) systemctl stop pgbouncer on VPS-1
```
A pre-change `.env.bak-prepgbouncer` was left on VPS-1.

## Not done (future)
- Route chat-server through PgBouncer (low value now; node-pg already bounds its pool).
- Tune `default_pool_size` from real `SHOW POOLS` `cl_waiting` once traffic grows.
