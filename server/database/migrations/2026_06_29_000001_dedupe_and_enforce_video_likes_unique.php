<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Corrective, idempotent migration for the "one user = one like" guarantee.
 *
 * The video_likes table was created WITH a unique (video_id, user_id) index, but
 * the MySQL→PostgreSQL cutover transferred data rather than re-running schema, so
 * on PG the index could be missing. Without it, the like() check-then-create path
 * can race and insert duplicate rows, and VideoLikeObserver increments
 * videos.likes_count once per row → an inflated, non-unique like count.
 *
 * This migration:
 *   1. removes duplicate (video_id, user_id) like rows, keeping the earliest,
 *   2. (re)creates the unique index if it's missing (driver-aware, IF NOT EXISTS),
 *   3. recomputes videos.likes_count from the now-unique rows.
 *
 * Safe to run on a healthy DB (dedupe + recount become no-ops).
 */
return new class extends Migration
{
    // Run each statement on its own (autocommit) instead of inside one wrapping
    // transaction. The app DB is behind PgBouncer in transaction-pooling mode,
    // where a single hiccup inside a multi-statement transaction aborts the whole
    // block (SQLSTATE 25P02 - "current transaction is aborted") and takes the
    // CREATE INDEX / recount down with it. Autocommit keeps the steps independent.
    public $withinTransaction = false;

    public function up(): void
    {
        $driver = DB::getDriverName();

        // 1) Drop duplicate likes, keeping the earliest row per (video_id, user_id).
        //    The extra derived table ("keep") is required so MySQL doesn't reject
        //    selecting from the same table it deletes from.
        DB::statement('
            DELETE FROM video_likes
            WHERE id NOT IN (
                SELECT min_id FROM (
                    SELECT MIN(id) AS min_id
                    FROM video_likes
                    GROUP BY video_id, user_id
                ) AS keep
            )
        ');

        // 2) Ensure the unique index exists (may have been lost in the PG cutover).
        $index = 'video_likes_video_id_user_id_unique';
        if ($driver === 'pgsql') {
            DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS {$index} ON video_likes (video_id, user_id)");
        } elseif ($driver === 'mysql' || $driver === 'mariadb') {
            $exists = DB::table('information_schema.statistics')
                ->where('table_schema', DB::raw('DATABASE()'))
                ->where('table_name', 'video_likes')
                ->where('index_name', $index)
                ->exists();
            if (!$exists) {
                DB::statement("ALTER TABLE video_likes ADD UNIQUE {$index} (video_id, user_id)");
            }
        }

        // 3) Recompute the denormalised like count from the unique rows.
        DB::statement('
            UPDATE videos
            SET likes_count = COALESCE((
                SELECT COUNT(*) FROM video_likes WHERE video_likes.video_id = videos.id
            ), 0)
        ');
    }

    public function down(): void
    {
        // Irreversible data repair - no-op. The unique index is owned by the
        // original create_video_likes_table migration.
    }
};
