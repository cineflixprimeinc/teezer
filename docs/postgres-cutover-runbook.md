# PostgreSQL Cutover Runbook (Stage f) - Reelsoo

> **Document only. Execute nothing against production from here without a human running each step deliberately.**
> This is the runbook for migrating the live Reelsoo backend from MySQL to PostgreSQL 17 using the
> `db:transfer-to-pgsql` artisan command. It assumes Stages (a)–(e) are complete and validated locally.

---

## 0. What is already done (do not redo)

- **Migrations are PG-compatible** - 16 migrations driver-branched (`DB::getDriverName()`), plus `2026_06_28_000001_convert_json_columns_to_jsonb`. MySQL behaviour is unchanged.
- **`config/database.php`** has a `pgsql` connection (read/write split, `DB_PGSQL_*` env namespace). Default stays `mysql`.
- **`php artisan db:transfer-to-pgsql`** exists: truncate-all-up-front (cascade-safe), tinyint(1)→boolean, json→jsonb, FK-safe load (`session_replication_role = replica`), chunked-by-id reads, identity-sequence reset, and a row-count **parity gate** (exit ≠ 0 on any mismatch). `--dry-run` runs parity only.
- Validated locally: 158 migrations apply cleanly on PG 17; transfer + parity pass (0 mismatches).

## 0.1 OPEN ITEM - must be true before cutover ⚠️

The **app-layer query rewrites** from `docs/postgres-migration-patchset.md` Part 2 (`LIKE→ILIKE`, `DATE(col)→col::date`, `IF→CASE`, `RAND→RANDOM`, `JSON_CONTAINS→@>`, `ISNULL`, `NOW()-INTERVAL`, backtick→`"`, `SUM(… IS NOT NULL)`, integer-division `::float`, `CAST … NUMERIC`) are **NOT yet applied to the codebase**. The PG application build deployed at cutover (B7) **must** contain them, or runtime queries will break on Postgres. Apply + test them on staging first (Stage A). Keep the current MySQL-compatible build tagged for rollback.

---

## 1. Prerequisites & pre-flight checklist

- [ ] PostgreSQL 17 provisioned on the target host(s), reachable from the app VPS(es). If using the read/write split, primary + replica are up.
- [ ] DB + role created: `CREATE ROLE reelsoo LOGIN PASSWORD '…'; CREATE DATABASE reelsoo OWNER reelsoo;` (the transfer command needs a role that can run `SET session_replication_role` - i.e. superuser **or** a role with the `pg_database_owner`/replication-capable grant; simplest is to run the transfer as a superuser, then hand day-to-day access to a normal role).
- [ ] `DB_PGSQL_*` env values prepared (see Appendix A) - **not** committed, set on the server.
- [ ] PG application build prepared and passing CI **with** the Part 2 query rewrites (§0.1).
- [ ] Current MySQL build artifact tagged for instant rollback (e.g. `git tag pre-pgsql-cutover`).
- [ ] A **staging MySQL** host available to restore the production dump into (never transfer directly from the live primary).
- [ ] Maintenance window scheduled; stakeholders notified.
- [ ] Backups verified restorable (test-restore the latest prod dump on staging beforehand).
- [ ] Disk space: target PG ≥ 1.5× the MySQL data size; staging MySQL ≥ dump size.

---

## 2. Stage A - Staging dress rehearsal (MANDATORY before prod)

Run the **entire** Stage B against staging first, timing each step. This is also where you confirm §0.1.

1. Restore the latest production dump into **staging MySQL**.
2. Point staging app `.env` `mysql` connection at staging MySQL, `pgsql` at a **staging Postgres**.
3. Build the staging Postgres schema:
   ```bash
   php artisan migrate --database=pgsql --force      # or migrate:fresh on an empty DB
   ```
4. Transfer + parity:
   ```bash
   php artisan db:transfer-to-pgsql --from=mysql --to=pgsql
   ```
   Must exit 0 ("Parity OK"). Investigate any mismatch before proceeding.
5. Deploy the **PG app build** on staging, set `DB_CONNECTION=pgsql`, and run the smoke suite (§B8) - especially the rewritten queries: search (`ILIKE`), analytics (`::date`/GROUP BY), feed ranking (`EXTRACT`), suggestions (`CASE`/`RANDOM`/`@>`), story upserts.
6. Record the wall-clock time of the dump→restore→transfer→parity chain. That sizes the production maintenance window.

**Go/no-go:** Stage A must be fully green (parity 0 mismatches + smoke pass) before scheduling production.

---

## 3. Stage B - Production cutover

> Run top-to-bottom. Each step has a verification. Do not proceed past a failed verification - go to §4 Rollback.

### B1 - Enter maintenance mode (stop writes)
```bash
# On each app VPS:
php artisan down --render="errors::503" --retry=120
```
Verify: site returns 503; queue workers paused/stopped (`php artisan queue:restart` then stop the worker supervisor) so no background writes land in MySQL after the dump.

### B2 - Final production MySQL dump (read from a replica if available)
```bash
mysqldump \
  --single-transaction --quick --routines --triggers \
  --default-character-set=utf8mb4 \
  -h "$PROD_MYSQL_HOST" -u "$PROD_MYSQL_USER" -p \
  reelsoo > /backups/reelsoo-cutover-$(date +%Y%m%d%H%M).sql
```
Verify: dump completes without error; file size is sane vs. previous backups.

### B3 - Restore the dump into STAGING MySQL (never transfer from the live primary)
```bash
mysql -h "$STAGING_MYSQL_HOST" -u "$STAGING_MYSQL_USER" -p \
  -e "DROP DATABASE IF EXISTS reelsoo; CREATE DATABASE reelsoo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -h "$STAGING_MYSQL_HOST" -u "$STAGING_MYSQL_USER" -p reelsoo < /backups/reelsoo-cutover-*.sql
```
Verify: `SELECT COUNT(*)` on a few large tables matches the source.

### B4 - Build the empty PostgreSQL schema
On the app host with the PG build, `mysql` connection → staging MySQL, `pgsql` → production Postgres:
```bash
php artisan migrate --database=pgsql --force
```
Verify: command exits 0; `\dt` shows the expected ~103 tables; spot-check `\d users` shows `boolean` columns and the CHECK-enum constraints.
(Alternatively load `database/schema/pgsql-schema.sql` then `migrate` to apply any newer migrations.)

### B5 - Transfer the data
```bash
php artisan db:transfer-to-pgsql --from=mysql --to=pgsql --chunk=2000
```
The command truncates all PG targets up front, copies every table (tinyint→bool, json→jsonb), resets identity sequences, then prints the parity table.

### B6 - Parity gate (HARD go/no-go)
- Command must exit **0** and print **"Parity OK: all tables match."**
- If it exits non-zero, **STOP** → §4 Rollback. Do not flip the connection.
- Optional deeper check before flipping: spot-compare `MAX(id)` and a couple of `SUM`/`COUNT` aggregates per large table between source and target; confirm `pg_get_serial_sequence` next values exceed `MAX(id)` (the command already sets these).

### B7 - Flip the application to Postgres
On every app VPS:
```bash
# .env - switch the default connection; DB_PGSQL_* already set (Appendix A)
DB_CONNECTION=pgsql
# (leave the MySQL DB_* vars in place but unused, for fast rollback)
```
Deploy the **PG application build** (the one containing §0.1 query rewrites), then:
```bash
php artisan config:clear && php artisan config:cache
php artisan route:cache && php artisan event:cache
```
Verify: `php artisan db:show --database=pgsql` connects; `php artisan tinker` → `DB::connection()->getDriverName()` returns `pgsql`.

### B8 - Smoke test (before lifting maintenance)
Exercise the rewritten hotspots explicitly:
- [ ] Auth/login, session creation
- [ ] User/music/hashtag **search** (ILIKE path)
- [ ] Studio **analytics** dashboards (`::date` + GROUP BY)
- [ ] **Feed** ranking (EXTRACT/EPOCH recency)
- [ ] **Profile suggestions** (CASE/RANDOM/`@>` on `users.categories`/`interests`)
- [ ] **Story** view/reaction/report **upserts** (ON CONFLICT)
- [ ] Posting a comment / reply (counts), DM send (jsonb `deleted_for_user_ids`)
- [ ] Create a new row in a high-traffic table → confirm no PK collision (sequence sanity)
Run the automated suite too: `php artisan test` against pgsql if feasible.

### B9 - Lift maintenance
```bash
php artisan up
# restart queue workers / horizon / supervisor
```
Verify: live traffic healthy; error rate normal; watch logs for `SQLSTATE` errors for the first ~30–60 min.

---

## 4. Rollback procedure

MySQL is **untouched and authoritative** throughout B1–B6 (we only ever read it). Rollback is fast as long as you have not accepted writes on Postgres.

**If failure occurs before B7 (schema/transfer/parity):**
1. Nothing to undo on the app - `DB_CONNECTION` is still `mysql`.
2. `php artisan up` (and restart workers) to restore service on MySQL.
3. Triage the parity/transfer failure on staging; reschedule.

**If failure occurs at/after B7 (already flipped to pgsql):**
1. Decide quickly: if Postgres has accepted **writes** since the flip, those writes will be lost on rollback (acceptable only if the window is tiny / data reconcilable). Prefer to roll back immediately on any serious failure during B8 smoke, before real user writes accumulate.
2. Re-enter maintenance: `php artisan down`.
3. Revert env: set `DB_CONNECTION=mysql` (MySQL `DB_*` vars are still present).
4. Redeploy the **previous MySQL-compatible build** (`git checkout pre-pgsql-cutover` artifact) - required because the PG build contains PG-only SQL (`ILIKE`, `::date`, `@>`).
5. `php artisan config:clear && php artisan config:cache`; restart workers.
6. `php artisan up`. Verify on MySQL.
7. Post-mortem the PG failure on staging before retrying.

**Rollback gate:** keep the pre-cutover MySQL build artifact deployable for the entire soak period (§5).

---

## 5. Post-cutover

- **Soak (1–2 weeks):** keep production MySQL running, read-only, as the fallback source of truth. Keep the MySQL build tagged.
- Monitor: slow-query log, error rates, sequence health, autovacuum.
- Add Postgres-appropriate indexes for ILIKE search paths if needed (`gin_trgm_ops` / functional `lower()` indexes) - deferred item from the patch set.
- After the soak with no rollback needed: decommission MySQL, remove `DB_*` (mysql) env vars, and optionally drop the driver branches from migrations in a later cleanup.

---

## Appendix A - Production `.env` (Postgres) keys
```
DB_CONNECTION=pgsql
DB_PGSQL_HOST=<pg-primary-host>
DB_PGSQL_PORT=5432
DB_PGSQL_DATABASE=reelsoo
DB_PGSQL_USERNAME=reelsoo
DB_PGSQL_PASSWORD=<secret>
DB_PGSQL_SSLMODE=require
# Optional read/write split (mirrors the mysql setup):
DB_PGSQL_READ_HOST=<pg-replica-host>
DB_PGSQL_WRITE_HOST=<pg-primary-host>
DB_PGSQL_SEARCH_PATH=public
# Leave the existing MySQL DB_* vars in place (unused) for fast rollback.
```
> The transfer command's source/target connection names default to `mysql`/`pgsql`. Ensure the `mysql` connection on the transfer host points at the **staging** restore, not the live primary.

## Appendix B - Command reference
```bash
php artisan db:transfer-to-pgsql                          # full transfer + parity
php artisan db:transfer-to-pgsql --dry-run                # parity check only (no writes)
php artisan db:transfer-to-pgsql --from=mysql --to=pgsql --chunk=2000
```
- Truncates all PG targets up front (cascade-safe), copies every table except `migrations`.
- Coerces tinyint(1)→boolean; passes json text into jsonb columns.
- Loads with `session_replication_role = replica` (FK/identity triggers off), restored to `DEFAULT` in a `finally`.
- Resets every `id` sequence to `MAX(id)+1`.
- Exits non-zero if any table's row count differs → use as the cutover go/no-go gate.

## Appendix C - Timing & sizing notes
- Wall-clock is dominated by the dump→restore→copy chain; measure it in Stage A and add margin.
- For very large tables, raise `--chunk`; the copy is single-process - if it's too slow, shard by running table subsets in parallel shells (the command currently copies all tables; a future `--only=table1,table2` flag would help - not implemented).
- The parity gate reads `COUNT(*)` on every table twice (source+target); negligible vs. the copy.
```
