<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per transcoding-provider attempt for a video - distinct from
 * hls_status/hls_master_key/hls_ready_at on videos itself, which stay the
 * single source of truth for "is this video playable" (read by
 * HlsPlaylistController, PublicMediaMirrorService, the player) regardless of
 * which pipeline produced the ladder. This table exists purely for
 * orchestration: which provider handled a video, its remote job id (for the
 * webhook handler to look the row up by), attempt/retry counts, and
 * error detail - none of which the existing videos columns had room for.
 *
 * media_content_checks (2026_06_02_210001) is NOT the same thing - that
 * table is a content-moderation scan log, unrelated to transcoding.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_processing_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('video_id')->constrained('videos')->cascadeOnDelete();
            $table->string('provider', 32);
            $table->string('provider_job_id')->nullable();
            $table->string('status', 20)->default('queued');
            $table->unsignedTinyInteger('attempt')->default(1);
            $table->json('requested_outputs')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->string('error_code')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index('video_id');
            $table->index('provider_job_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_processing_jobs');
    }
};
