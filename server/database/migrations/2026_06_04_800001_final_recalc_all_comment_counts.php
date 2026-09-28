<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
 * Definitive recalculation of all comment counts.
 *
 * Consolidates and supersedes:
 *  - 2026_06_03_600001_recalc_comment_counts
 *  - 2026_06_04_700001_fix_reply_count_total_thread
 *
 * After this migration:
 *   comment.reply_count (main comments only):
 *     = COUNT of ALL non-deleted comments whose root_id = this comment's id
 *     = full thread depth, NOT just direct children
 *
 *   video.comments_count:
 *     = COUNT of ALL non-deleted, non-hidden comments for that video
 *     = top-level + all replies at every depth
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── Step 1: Ensure root_id is correctly set for all replies ──────────
        // Top-level comments: root_id stays NULL (they ARE the root).
        // Direct replies: root_id = parent.id (when parent is top-level).
        // Nested replies: root_id = grandparent's root_id (propagated up).

        // Backfill direct replies (parent is a top-level comment)
        DB::statement(DB::getDriverName() === 'pgsql' ? '
            UPDATE video_comments vc
            SET root_id = p.id
            FROM video_comments p
            WHERE vc.parent_id = p.id
              AND vc.parent_id IS NOT NULL AND p.parent_id IS NULL
              AND (vc.root_id IS NULL OR vc.root_id != p.id)
        ' : '
            UPDATE video_comments vc
            INNER JOIN video_comments p ON vc.parent_id = p.id
            SET vc.root_id = p.id
            WHERE vc.parent_id IS NOT NULL
              AND p.parent_id IS NULL
              AND (vc.root_id IS NULL OR vc.root_id != p.id)
        ');

        // Propagate root_id for deeper nested replies (run multiple passes)
        for ($i = 0; $i < 15; $i++) {
            $affected = DB::update(DB::getDriverName() === 'pgsql' ? '
                UPDATE video_comments vc
                SET root_id = p.root_id
                FROM video_comments p
                WHERE vc.parent_id = p.id
                  AND vc.parent_id IS NOT NULL AND p.root_id IS NOT NULL
                  AND (vc.root_id IS NULL OR vc.root_id != p.root_id)
            ' : '
                UPDATE video_comments vc
                INNER JOIN video_comments p ON vc.parent_id = p.id
                SET vc.root_id = p.root_id
                WHERE vc.parent_id IS NOT NULL
                  AND p.root_id IS NOT NULL
                  AND (vc.root_id IS NULL OR vc.root_id != p.root_id)
            ');
            if ($affected === 0) break;
        }

        // ── Step 2: Reset all reply_counts ──────────────────────────────────
        DB::table('video_comments')->update(['reply_count' => 0]);

        // ── Step 3: Set main comments' reply_count = TOTAL thread depth ──────
        // Count ALL non-deleted comments where root_id = main comment's id.
        DB::statement(DB::getDriverName() === 'pgsql' ? '
            UPDATE video_comments vc
            SET reply_count = counts.cnt
            FROM (SELECT root_id, COUNT(*) AS cnt FROM video_comments
                  WHERE root_id IS NOT NULL AND deleted_at IS NULL AND is_hidden = false GROUP BY root_id) AS counts
            WHERE counts.root_id = vc.id AND vc.parent_id IS NULL
        ' : '
            UPDATE video_comments vc
            INNER JOIN (
                SELECT root_id, COUNT(*) AS cnt
                FROM video_comments
                WHERE root_id IS NOT NULL
                  AND deleted_at IS NULL
                  AND is_hidden = 0
                GROUP BY root_id
            ) AS counts ON counts.root_id = vc.id
            SET vc.reply_count = counts.cnt
            WHERE vc.parent_id IS NULL
        ');

        // ── Step 4: Reset all videos.comments_count ─────────────────────────
        DB::table('videos')->update(['comments_count' => 0]);

        // ── Step 5: Set videos.comments_count = ALL active comments (all depths) ─
        DB::statement(DB::getDriverName() === 'pgsql' ? '
            UPDATE videos v
            SET comments_count = counts.cnt
            FROM (SELECT video_id, COUNT(*) AS cnt FROM video_comments
                  WHERE deleted_at IS NULL AND is_hidden = false GROUP BY video_id) AS counts
            WHERE counts.video_id = v.id
        ' : '
            UPDATE videos v
            INNER JOIN (
                SELECT video_id, COUNT(*) AS cnt
                FROM video_comments
                WHERE deleted_at IS NULL
                  AND is_hidden = 0
                GROUP BY video_id
            ) AS counts ON counts.video_id = v.id
            SET v.comments_count = counts.cnt
        ');
    }

    public function down(): void
    {
        // Non-reversible data correction.
    }
};
