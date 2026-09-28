<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Denormalized pointer to the current/most-recent processing_provider +
 * provider_job_id, so the webhook handler (which only knows a provider's own
 * job id from the payload) can find the right video with one indexed lookup
 * instead of joining through video_processing_jobs on every webhook delivery.
 * video_processing_jobs remains the source of truth for attempt history;
 * these two columns are just a fast-path cache of its latest row.
 *
 * hls_status keeps its existing vocabulary (processing/ready/failed/
 * unavailable, from 2026_07_29_120000) - "queued" is added to it here only
 * as a new value that column already accepts (varchar(20)), not a schema
 * change, for "dispatched to a provider, waiting on webhooks" - the gap
 * between complete-upload and the first quality-completed webhook.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->string('processing_provider', 32)->nullable()->after('public_mirror_hls_ready_at');
            $table->string('provider_job_id')->nullable()->after('processing_provider');
        });

        Schema::table('videos', function (Blueprint $table) {
            $table->index('provider_job_id', 'videos_provider_job_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex('videos_provider_job_id_index');
            $table->dropColumn(['processing_provider', 'provider_job_id']);
        });
    }
};
