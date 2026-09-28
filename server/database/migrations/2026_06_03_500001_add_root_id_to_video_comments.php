<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_comments', function (Blueprint $table) {
            if (! Schema::hasColumn('video_comments', 'root_id')) {
                // root_id points to the top-level comment this reply belongs to.
                // null = this IS the root comment.
                $table->unsignedBigInteger('root_id')->nullable()->index()->after('parent_id');
            }
        });

        $isPg = DB::getDriverName() === 'pgsql';

        // ── Backfill root_id ──────────────────────────────────────────────────
        // Level-1 replies: parent is a top-level comment (parent.parent_id IS NULL)
        DB::statement($isPg ? '
            UPDATE video_comments vc
            SET root_id = p.id
            FROM video_comments p
            WHERE vc.parent_id = p.id
              AND vc.parent_id IS NOT NULL AND p.parent_id IS NULL AND vc.root_id IS NULL
        ' : '
            UPDATE video_comments vc
            INNER JOIN video_comments p ON vc.parent_id = p.id
            SET vc.root_id = p.id
            WHERE vc.parent_id IS NOT NULL
              AND p.parent_id IS NULL
              AND vc.root_id IS NULL
        ');

        // Level 2-10 replies: propagate root_id upward (repeat until stable)
        for ($i = 0; $i < 10; $i++) {
            $affected = DB::update($isPg ? '
                UPDATE video_comments vc
                SET root_id = p.root_id
                FROM video_comments p
                WHERE vc.parent_id = p.id
                  AND vc.parent_id IS NOT NULL AND p.root_id IS NOT NULL AND vc.root_id IS NULL
            ' : '
                UPDATE video_comments vc
                INNER JOIN video_comments p ON vc.parent_id = p.id
                SET vc.root_id = p.root_id
                WHERE vc.parent_id IS NOT NULL
                  AND p.root_id IS NOT NULL
                  AND vc.root_id IS NULL
            ');
            if ($affected === 0) break;
        }

        // ── Fix reply_count using derived tables ───────────────────────────
        // MySQL forbids a subquery that references the target table directly;
        // both engines use a pre-aggregated derived table instead.

        // 1. Reset all root comments to 0.
        DB::table('video_comments')->whereNull('parent_id')->update(['reply_count' => 0]);

        // 2. Set root comments' reply_count = total nested replies in their thread.
        DB::statement($isPg ? '
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

        // 3. Reset all non-root comments to 0.
        DB::table('video_comments')->whereNotNull('parent_id')->update(['reply_count' => 0]);

        // 4. Set non-root comments' reply_count = their direct-reply count only.
        DB::statement($isPg ? '
            UPDATE video_comments vc
            SET reply_count = counts.cnt
            FROM (SELECT parent_id, COUNT(*) AS cnt FROM video_comments
                  WHERE parent_id IS NOT NULL AND deleted_at IS NULL GROUP BY parent_id) AS counts
            WHERE counts.parent_id = vc.id AND vc.parent_id IS NOT NULL
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
            WHERE vc.parent_id IS NOT NULL
        ');
    }

    public function down(): void
    {
        Schema::table('video_comments', function (Blueprint $table) {
            if (Schema::hasColumn('video_comments', 'root_id')) {
                $table->dropIndex(['root_id']);
                $table->dropColumn('root_id');
            }
        });
    }
};
