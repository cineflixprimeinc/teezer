# PostgreSQL 17 Migration - Report & Plan (Reelsoo `server/`)

**Scope:** Laravel API in `server/`. 157 migrations in `server/database/migrations/`.
**Safety:** This document is analysis only. **No production MySQL DB or live VPS is touched.** All work below is for a local/staging Postgres instance.
**Current config:** `config/database.php` default = `mysql` (utf8mb4 / utf8mb4_unicode_ci, InnoDB, read/write split, sticky). No `pgsql` connection defined yet.

---

## 1. Executive summary

| Category | Count | Verdict |
|---|---|---|
| `boolean()` columns | ~110 | ✅ Laravel auto-maps to real PG `boolean`. **But** raw SQL comparing them to `0/1` breaks (see §4). |
| `tinyInteger()` | 2 | ✅ → PG `smallint`, fine. |
| `unsignedBigInteger`/`unsigned()` | 165 across 66 files | ✅ Laravel drops "unsigned" on PG, emits `bigint`/`integer`. No edit. |
| `enum()` at create time | 50 across 39 files | ✅ Laravel emits `varchar + CHECK`. No edit. |
| **`enum` expansion via raw `ALTER … MODIFY … ENUM`** | 10 files | ❌ **Must rewrite** - MySQL-only DDL. |
| **`UPDATE … INNER JOIN … SET` data backfills** | 5 files | ❌ **Must rewrite** - MySQL multi-table UPDATE. |
| **boolean-as-int in raw SQL** (`is_hidden = 0`) | migration + app | ❌ **Must rewrite** for PG. |
| `useCurrentOnUpdate()` | 3 files | ⚠️ Silently ignored on PG (no auto-update). Behavioral. |
| `->after('col')` | 223 across 59 files | ⚠️ Silently ignored on PG (column ordering only). Cosmetic. |
| `json()` columns | 36 | ⚠️ Works as PG `json`; switch to `jsonb` so `@>`/`->>` queries work. |
| `fullText`, `set()`, `year()`, geometry, generated cols | 0 | ✅ None present. |
| Explicit `charset`/`collation`/`engine` in migrations | 0 | ✅ None - only at connection level. |
| AUTO_INCREMENT (`id()`/`increments`) | all tables | ✅ Laravel emits identity/serial. No edit. |
| **MySQL-only functions in app raw SQL** | ~40+ sites | ❌ **Must rewrite** (see §4). |
| **Case-insensitive `LIKE` reliance** | ~40+ sites | ⚠️ PG `LIKE` is case-sensitive → switch to `ILIKE`. |

**Bottom line:** Laravel's schema builder handles the *structural* MySQL-isms automatically (booleans, unsigned, enum-at-create, auto-increment). The real work is **(a)** ~15 migrations containing hand-written MySQL SQL, and **(b)** ~80 raw-SQL query sites in the app layer. See the recommended strategy in §5 (squash the schema rather than replay 157 migrations).

---

## 2. Migrations - file → issue → required change

### 2a. Must-fix: raw `ALTER … MODIFY … ENUM` (MySQL-only DDL)

These run hand-written SQL that PG cannot parse (`MODIFY`, `ENUM(...)`, backtick identifiers). Each must become a PG-compatible `CHECK`-constraint swap (drop old check, alter type/default, add new check) **or** be guarded by a driver check.

| File | Issue | Required change (PostgreSQL) |
|---|---|---|
| `2026_05_27_000001_add_harassment_to_video_reports_reason.php` | `ALTER TABLE video_reports MODIFY COLUMN reason ENUM(...)` | Drop existing CHECK on `reason`, re-add `CHECK (reason IN (...))` with the new value. |
| `2026_05_29_200001_fix_social_links_platform_column.php` | `MODIFY platform VARCHAR(50)` then `MODIFY platform ENUM(...)` | `ALTER COLUMN platform TYPE varchar(50)`; manage allowed values via CHECK constraint, not ENUM. |
| `2026_06_02_200002_add_unlisted_status_to_videos_table.php` | `MODIFY status ENUM(...)` + `UPDATE videos SET status='private' WHERE status='unlisted'` | Swap CHECK constraint on `status`; the `UPDATE` is portable as-is. |
| `2026_06_03_100001_expand_content_check_status_enum.php` | `MODIFY status ENUM(...)` | Swap CHECK constraint. |
| `2026_06_06_000003_add_step_fields_to_verification_requests.php` | `MODIFY COLUMN status ENUM(...)` | Swap CHECK constraint. |
| `2026_06_07_000002_extend_wallet_transactions_for_coins.php` | ``MODIFY COLUMN `type` VARCHAR/ENUM`` (backticks) | `ALTER COLUMN "type" TYPE varchar(50)`; CHECK constraint for values; **backticks → double quotes**. |
| `2026_06_10_000004_add_action_status_to_notifications_table.php` | `ALTER TABLE … ADD COLUMN action_status VARCHAR(20) NULL AFTER is_read` | Remove `AFTER is_read` (unsupported); plain `ADD COLUMN`. Down (`DROP COLUMN`) is portable. |
| `2026_06_10_200001_change_notifications_type_to_varchar.php` | `MODIFY COLUMN type VARCHAR(100)` / `ENUM(...)` | `ALTER COLUMN type TYPE varchar(100)`; CHECK for the reverse. |
| `2026_06_10_200001_add_social_restrictions.php` | `MODIFY restriction_type ENUM(...)` | Swap CHECK constraint. |
| `2026_06_14_000001_add_story_reply_to_direct_messages.php` | `MODIFY COLUMN message_type ENUM(...)` | Swap CHECK constraint. |

### 2b. Must-fix: `UPDATE … INNER JOIN … SET` (MySQL multi-table UPDATE)

PG syntax is `UPDATE t SET … FROM other WHERE …` (no `INNER JOIN` directly after UPDATE).

| File | Issue | Required change |
|---|---|---|
| `2026_06_03_500001_add_root_id_to_video_comments.php` | 3× `UPDATE vc INNER JOIN … SET vc.x = …`; comment even cites "MySQL 1093 workaround" | Rewrite each as `UPDATE video_comments vc SET … FROM (…) counts WHERE …`. |
| `2026_06_03_600001_recalc_comment_counts.php` | `UPDATE … INNER JOIN … SET` | Same `UPDATE … FROM …` rewrite. |
| `2026_06_04_700001_fix_reply_count_total_thread.php` | `UPDATE … INNER JOIN … SET` | Same rewrite. |
| `2026_06_04_800001_final_recalc_all_comment_counts.php` | 3× `UPDATE … INNER JOIN … SET`, plus `is_hidden = 0` | `UPDATE … FROM …`; **`is_hidden = 0` → `is_hidden = false`**. |
| `2026_06_03_900001_cleanup_orphaned_replies_and_sync_comments_count.php` | Correlated subqueries OK, but `is_hidden = 0` (boolean vs int) | `is_hidden = false` (×2). Subqueries are portable. |

> Note: `2026_06_13_100001` and `2026_06_16_000001` use plain single-table `UPDATE … SET … WHERE` - **portable, no change**.

### 2c. Behavioral / cosmetic (no error, but review)

| Pattern | Files | Effect on PG | Action |
|---|---|---|---|
| `useCurrentOnUpdate()` | `2025_05_24_000021_create_creator_progress_table`, `2026_06_02_100002_create_video_scores_table`, `2026_06_02_100003_create_user_video_preferences_table` | PG has no `ON UPDATE CURRENT_TIMESTAMP`; Laravel silently ignores it. `updated_at` won't auto-bump on raw DB writes. | Rely on Eloquent timestamps, or add a PG trigger if raw writes matter. |
| `->after('column')` | 223 sites | Ignored on PG; columns land at table end. | No functional change. Safe as long as no code relies on column ordinal / `INSERT` without column list (Eloquent always names columns ✅). |
| `json()` columns | 36 sites | Creates PG `json`, not `jsonb`. `@>`/`->>` containment & indexing need `jsonb`. | Convert the JSON columns queried with containment (`users.categories`, `users.interests`, `direct_messages.deleted_for_user_ids`, `video_events.payload`) to `jsonb`; others optional. |

### 2d. Auto-handled by Laravel - **no migration edits needed**

`boolean()`, `tinyInteger()`, `unsignedBigInteger()`/`unsigned()`, `enum()` at create time (→ `varchar`+`CHECK`), `id()`/`bigIncrements` (→ identity), `decimal()`, `timestamp()`/`useCurrent()`, foreign keys & cascades. The Postgres grammar emits correct DDL for all of these.

---

## 3. Codebase - MySQL-only syntax in models/queries/raw SQL

### 3a. Must-fix functions (hard runtime errors on PG)

| Construct | Location(s) | Fix |
|---|---|---|
| `TIMESTAMPDIFF(HOUR, created_at, NOW())` | `app/Services/FeedService.php:58` | `EXTRACT(EPOCH FROM (NOW() - created_at))/3600` |
| `JSON_UNQUOTE(JSON_EXTRACT(payload,"$.completion_pct"))` | `app/Jobs/UpdateVideoScoreJob.php:33` | `(payload->>'completion_pct')::float` |
| `JSON_CONTAINS(col, ?)` | `app/Services/ProfileSuggestionService.php:373-374`, `app/Http/Controllers/Api/MessageController.php:190` | `col @> ?::jsonb` (requires `jsonb` column) |
| `IF(cond, a, b)` | `ProfileSuggestionService.php:115-116,1056`, `MessageController.php:64` | `CASE WHEN cond THEN a ELSE b END` |
| `ISNULL(pin_order)` | `app/Http/Controllers/Api/CommentController.php:52` | `pin_order IS NULL` (or `ORDER BY pin_order ASC NULLS FIRST`) |
| `RAND()` | `ProfileSuggestionService.php:116,1056` | `RANDOM()` |
| `DATE(col)` (as fn) | ~21 sites across `AdminUser360Controller`, `StudioAnalyticsController`, `StudioInsightsController`, `StudioMonetizationController`, `AdminApiController` | `col::date` or `DATE_TRUNC('day', col)` (and add to `GROUP BY` identically) |
| `NOW() - INTERVAL 1 DAY` | `app/Http/Controllers/Api/HashtagController.php:185` | `NOW() - INTERVAL '1 day'` |
| backtick identifier `` `group` `` | `app/Http/Controllers/Api/Admin/AdminSettingsController.php:155` | double-quote: `"group"` |
| `SUM(followed_at IS NOT NULL)` (bool→int) | `app/Http/Controllers/Api/SuggestionController.php:154` | `SUM(CASE WHEN followed_at IS NOT NULL THEN 1 ELSE 0 END)` or `COUNT(followed_at)` |
| `CAST(x AS DECIMAL(10,2))` | `HashtagController.php:205` | `CAST(x AS NUMERIC(10,2))` / `x::numeric(10,2)` |
| boolean compared to int (`is_verified = 1`, `is_hidden = 0`) | `ProfileSuggestionService.php`, comment-recalc migrations | `is_verified = true` / `is_hidden = false` |

### 3b. Case-insensitivity: `LIKE` → `ILIKE`

MySQL `LIKE` is case-insensitive (utf8mb4_unicode_ci); PG `LIKE` is case-sensitive. Search/autocomplete will silently return fewer rows. Affected (non-exhaustive): `MentionController.php:44-48`, `MusicLibraryController.php` (~10), `AudioController.php:22,166`, `StoryController.php:407`, `UserController.php:471`, `ExploreController.php:101,110`, `LocationFeedController.php:104`, `SearchService.php:344,363`, `AdminVideoController.php:34,52,54`, `AdminReportsController.php:41,45`, and Dashboard/Admin controllers. **Fix:** change the operator string `'like'` → `'ilike'` (and raw `LIKE` → `ILIKE`).

### 3c. `GROUP BY` strictness

PG enforces `ONLY_FULL_GROUP_BY` always. Audit every `selectRaw(...)->groupBy(...)`: any selected non-aggregate column must appear in `GROUP BY`. Spot-check passed for the analytics queries reviewed (they group by the same derived expression they select), but the `DATE(col)` rewrites in §3a must keep the `GROUP BY` expression byte-identical to the `SELECT` expression.

### 3d. `upsert()` / `insertOrIgnore()` - need real unique constraints

`upsert()` and `insertOrIgnore()` work on PG **only if** a matching unique index/constraint exists on the conflict target. Verify before cutover:

| Site | Conflict target | Unique constraint must exist on |
|---|---|---|
| `StoryController.php:329` `insertOrIgnore` | `story_views` | (`story_id`, `viewer_id`) |
| `StoryController.php:490` `upsert` | `story_reactions` | (`story_id`, `user_id`) |
| `StoryController.php:616` `upsert` | `story_reports` | (`story_id`, `reporter_id`) |
| `Models/UserVideoPreference.php:32` `upsert` | `user_video_preferences` | (`user_id`, `pref_type`, `pref_value`) |

### 3e. Compatible (no change) - verified

`LEAST()`/`GREATEST()`, `COALESCE()`, `NOW()`, `GROUP_CONCAT`/`FIND_IN_SET`/`ON DUPLICATE KEY` (grep: **none present**), Eloquent `$casts => 'array'`/`'json'` (driver-agnostic). Division by columns (`watch_duration / v.duration`) - wrap denominators in `NULLIF(...,0)` to match MySQL's NULL-on-divide-by-zero behavior (PG raises an error).

---

## 4. Config change required

Add a `pgsql` connection to `config/database.php` (driver `pgsql`, port 5432, `search_path=public`, `sslmode`, charset `utf8`). Drop MySQL-only `engine`/`collation` keys for that connection. **Do not** point it at any production host. Set `DB_CONNECTION=pgsql` only in the local/staging `.env`.

---

## 5. Migration plan

### Strategy decision (read first)
Replaying all 157 migrations on Postgres forces you to make ~15 hand-written-SQL migrations cross-DB compatible - including historical "recalc comment counts" data corrections that are meaningless on an empty DB but **still error** on MySQL syntax. **Recommended primary path: schema squash.** Generate one consolidated current-schema, port *that* to Postgres, and import data from the MySQL dump. Keep per-migration conversion (§2) only as a fallback / for keeping `migrate:fresh` working long-term. Both paths are described.

### Stage (a) - Convert the schema/migrations
- **Path A (recommended - squash):**
  1. On a **local copy** of MySQL (never prod), `php artisan schema:dump` to capture the current structure, or introspect the live schema from a backup restore.
  2. Translate that single schema into Postgres DDL: booleans stay boolean, enums → `varchar + CHECK`, `unsigned` dropped, identity columns, `json`→`jsonb` for the four queried columns (§2c), add the unique constraints from §3d.
  3. Add a `pgsql`-targeted squashed schema file so `migrate` on Postgres loads the schema in one shot; mark all 157 historical migrations as already-run.
- **Path B (convert in place):** Edit the ~15 files in §2a/§2b to branch on `DB::getDriverName()` (`mysql` vs `pgsql`), and fix the boolean-as-int comparisons. More work, but keeps `migrate:fresh` portable.
- Either path: apply the app-layer fixes from §3 (these are required regardless - they run at request time, not migrate time).

### Stage (b) - Stand up Postgres 17 locally
- Run Postgres 17 in Docker locally (e.g. `postgres:17`), a throwaway dev DB. Create DB `reelsoo`, role, `search_path=public`.
- Add the `pgsql` connection (§4). Point a **local/staging `.env`** at the container. Confirm `php artisan db:show --database=pgsql` connects.

### Stage (c) - Run converted migrations on empty Postgres, fix errors
- `php artisan migrate --database=pgsql` against the empty container.
- Iterate on failures (expected: any missed enum/raw-SQL spot). Re-run from clean each time (`migrate:fresh`).
- **Gate:** schema builds with zero errors; `\d+` spot-checks show booleans as `boolean`, enums as CHECK constraints, the four `jsonb` columns, and all unique constraints from §3d present.

### Stage (d) - Data transfer from a MySQL backup dump
- Work from a **dump/backup file**, never a live connection to prod.
- Use **pgloader** (handles tinyint(1)→bool, unsigned, charset, type coercion in one pass) against a *restored local copy* of the MySQL dump → the local Postgres. Alternative: `mysqldump --no-create-info --compatible` + sed, but pgloader is far less error-prone here.
- Load order: pgloader resolves FK ordering; if doing manual COPY, disable FK triggers during load and re-enable after.
- After load: **reset identity sequences** to `MAX(id)+1` for every table (the #1 post-pgload footgun - otherwise new inserts collide).
- Re-validate the four `jsonb` columns parsed correctly.

### Stage (e) - Verification (row counts must match)
- **Row-count parity:** script `SELECT COUNT(*)` per table on source MySQL copy vs target Postgres; assert every table matches exactly. (Information_schema-driven loop over all tables; fail loudly on any mismatch.)
- **Spot integrity:** checksums/`MAX(id)` per table; FK orphan check; verify a sample of `jsonb`, boolean, and enum/CHECK columns hold expected values.
- **Functional smoke:** run the app against Postgres and exercise the §3 hotspots - feed ranking (TIMESTAMPDIFF), profile suggestions (IF/RAND/JSON_CONTAINS), studio analytics (DATE/GROUP BY), search (ILIKE), story upserts. Run the test suite with `DB_CONNECTION=pgsql`.
- **Gate:** 100% table row-count parity + green smoke tests before considering cutover.

### Stage (f) - Cutover & rollback
- **Cutover (staging first, then prod only when you choose):**
  1. Announce/short maintenance window. Stop writes (maintenance mode).
  2. Take a final MySQL dump; pgload the delta into the prepared Postgres.
  3. Re-run Stage (e) parity on the final data.
  4. Flip `DB_CONNECTION=pgsql` (and remove MySQL read/write-split env), deploy app build with §3 fixes, reset sequences, warm caches.
  5. Smoke-test live, then lift maintenance mode.
- **Rollback:** MySQL is left **untouched and running** through cutover. Rollback = flip `DB_CONNECTION` back to `mysql` and redeploy the previous app build. Keep MySQL as source of truth (read-only) for a defined soak period (e.g. 1–2 weeks) before decommissioning. Because the app build contains PG-specific raw SQL (`ILIKE`, `::date`, `@>`), keep the prior MySQL-compatible build artifact tagged for instant redeploy.

---

## 6. Open items to verify before starting
1. Confirm unique constraints in §3d actually exist in current schema (grep migrations for `unique(` on those tables).
2. Decide json vs jsonb scope - minimum is the 4 queried columns; converting all 36 is cleaner long-term.
3. Confirm no app code relies on MySQL column ordering (none expected - Eloquent names columns).
4. Inventory any queues/seeders/console commands with raw SQL beyond `app/` (Stage c will surface these).
