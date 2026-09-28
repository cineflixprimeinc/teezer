<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/* Recalculate two counters that were wrong after the root_id feature:
 *
 *  1. video_comments.reply_count = DIRECT replies only (parent_id = this.id)
 *     The previous implementation accumulated nested replies onto the root
 *     comment's counter, so a root with 1 direct reply and 1 nested reply
 *     showed "View 2 replies" instead of "View 1 reply".
 *
 *  2. videos.comments_count = ALL active comments at every depth.
 *     Feed icon should show total (main + all replies), not just top-level.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── 1. Reset then recalculate reply_count (direct replies only) ────
        DB::table('video_comments')->update(['reply_count' => 0]);

        DB::statement(DB::getDriverName() === 'pgsql' ? '
            UPDATE video_comments vc
            SET reply_count = counts.cnt
            FROM (SELECT parent_id, COUNT(*) AS cnt FROM video_comments
                  WHERE parent_id IS NOT NULL AND deleted_at IS NULL GROUP BY parent_id) AS counts
            WHERE counts.parent_id = vc.id
        ' : '
            UPDATE video_comments vc
            INNER JOIN (
                SELECT parent_id, COUNT(*) AS cnt
                FROM video_comments
                WHERE parent_id IS NOT NULL
                  AND deleted_at IS NULL
                GROUP BY parent_id
            ) AS counts ON counts.parent_id = vc.id
            SET vc.reply_count = counts.cnt
        ');

        // ── 2. Recalculate videos.comments_count (all depths) ──────────────
        // First set 0 everywhere, then update with real counts.
        DB::table('videos')->update(['comments_count' => 0]);

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
        // Non-reversible data correction - down() is a no-op.
    }
};
