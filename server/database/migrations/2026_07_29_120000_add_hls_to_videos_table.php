<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adaptive-bitrate playback state for a video.
 *
 * hls_master_key holds the object key of the master playlist, e.g.
 * hls/{videoId}/master.m3u8 - a key, not a URL, exactly like video_url and
 * thumbnail_url. Keeping keys in the database means the CDN hostname can change
 * without rewriting every row, and it is why nothing here has to move when
 * media.reelsoo.com becomes cdn.reelsoo.com.
 *
 * hls_status tracks the transcode so the app can tell "still processing" apart
 * from "this video will never have HLS" - a distinction that decides whether
 * the player waits or falls straight back to the progressive original.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->string('hls_master_key')->nullable()->after('quality_urls');
            $table->string('hls_status', 20)->nullable()->after('hls_master_key');
            $table->timestamp('hls_ready_at')->nullable()->after('hls_status');
        });

        // Partial index: the backfill command and the "needs transcoding" query
        // both scan for rows without a finished HLS ladder. On a table that is
        // mostly finished videos, indexing only the unfinished ones keeps the
        // index tiny and the scan cheap as the library grows.
        Schema::table('videos', function (Blueprint $table) {
            $table->index(['hls_status'], 'videos_hls_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex('videos_hls_status_index');
            $table->dropColumn(['hls_master_key', 'hls_status', 'hls_ready_at']);
        });
    }
};
