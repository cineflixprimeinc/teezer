<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/* Fix reply_count so main comments show TOTAL thread count (all nested replies),
 * not just direct replies.
 *
 * After this:
 * - Main comments (parent_id = null): reply_count = total nested replies (NOT including self)
 * - Non-root comments (parent_id != null): reply_count = 0 or direct replies only (for UI clarity)
 *
 * This fixes the bug where "View 1 reply" shows when 2 replies exist.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── Reset reply_count for all comments ────────────────────────────
        DB::table('video_comments')->update(['reply_count' => 0]);

        // ── Set main comments' reply_count = TOTAL thread depth
        // For each main comment, count ALL comments where root_id = this.id
        DB::statement(DB::getDriverName() === 'pgsql' ? '
            UPDATE video_comments vc
            SET reply_count = counts.cnt
            FROM (SELECT root_id, COUNT(*) AS cnt FROM video_comments
                  WHERE root_id IS NOT NULL AND deleted_at IS NULL GROUP BY root_id) AS counts
            WHERE counts.root_id = vc.id AND vc.parent_id IS NULL
        ' : '
            UPDATE video_comments vc
            INNER JOIN (
                SELECT root_id, COUNT(*) AS cnt
                FROM video_comments
                WHERE root_id IS NOT NULL
                  AND deleted_at IS NULL
                GROUP BY root_id
            ) AS counts ON counts.root_id = vc.id
            SET vc.reply_count = counts.cnt
            WHERE vc.parent_id IS NULL
        ');

        // ── Non-root comments get 0 (or direct replies if you prefer, but 0 is cleaner) ────
        // These are comments that are replies themselves.
        // They don't show "View X replies" in the UI, so their count doesn't matter for display,
        // but keeping it 0 avoids confusion.
        // If you want nested comments to also show their direct reply counts, change to a JOIN similar above.
    }

    public function down(): void
    {
        // Non-reversible - this is a bug fix.
    }
};
