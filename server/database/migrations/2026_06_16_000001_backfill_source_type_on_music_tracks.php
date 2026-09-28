<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Rows with a source_video_id were created automatically from a user video
        // upload - they are user original audio, not library music.
        DB::statement("
            UPDATE music_tracks
            SET source_type = 'original'
            WHERE source_video_id IS NOT NULL
        ");
    }

    public function down(): void
    {
        DB::statement("
            UPDATE music_tracks
            SET source_type = 'library'
            WHERE source_video_id IS NOT NULL
        ");
    }
};
