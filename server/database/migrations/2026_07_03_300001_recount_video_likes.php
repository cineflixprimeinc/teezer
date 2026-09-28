<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * One-time data repair for the unlike bug: the DELETE /videos/{id}/like
     * path bulk-deleted rows without firing VideoLikeObserver::deleted, so
     * likes_count (and creators' profiles.total_likes) inflated by +1 for
     * every like→unlike cycle and never came back down.
     *
     * Restore the invariant from the source of truth:
     *   videos.likes_count       = COUNT(video_likes rows for that video)
     *   profiles.total_likes     = COUNT(video_likes rows on that user's videos)
     * (video_likes is unique per (video_id, user_id) - one user, one like.)
     */
    public function up(): void
    {
        DB::statement('
            UPDATE videos v
               SET likes_count = (SELECT COUNT(*) FROM video_likes vl WHERE vl.video_id = v.id)
        ');

        DB::statement('
            UPDATE profiles p
               SET total_likes = (
                   SELECT COUNT(*)
                     FROM video_likes vl
                     JOIN videos v ON v.id = vl.video_id
                    WHERE v.user_id = p.user_id
               )
        ');
    }

    public function down(): void
    {
        // Data repair - nothing meaningful to restore.
    }
};
