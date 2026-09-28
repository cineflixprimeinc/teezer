<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Step 1: Soft-delete replies whose root top-level comment has been
        // soft-deleted or never existed. These are unreachable via the UI but
        // were still counted, causing the "3 comments" / empty list mismatch.
        DB::statement("
            UPDATE video_comments
            SET deleted_at = NOW()
            WHERE deleted_at IS NULL
              AND root_id IS NOT NULL
              AND root_id NOT IN (
                  SELECT valid_id FROM (
                      SELECT id AS valid_id
                      FROM video_comments
                      WHERE deleted_at IS NULL
                        AND parent_id IS NULL
                  ) AS valid_roots
              )
        ");

        // Step 2: Recalculate videos.comments_count using the corrected formula
        // (top-level visible + replies under visible top-level roots only).
        DB::statement("
            UPDATE videos
            SET comments_count = (
                SELECT COUNT(*)
                FROM video_comments vc
                WHERE vc.video_id = videos.id
                  AND vc.deleted_at IS NULL
                  AND vc.is_hidden = false
                  AND (
                      vc.parent_id IS NULL
                      OR EXISTS (
                          SELECT 1
                          FROM video_comments vc_root
                          WHERE vc_root.id = vc.root_id
                            AND vc_root.deleted_at IS NULL
                            AND vc_root.is_hidden = false
                      )
                  )
            )
        ");
    }

    public function down(): void
    {
        // Intentionally left empty - data cleanup is not reversible.
    }
};
