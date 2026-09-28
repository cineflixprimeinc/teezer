<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tracks the fallback leg of a job separately from the primary leg
 * (started_at/completed_at, from the original 2026_08_31_000001 migration).
 * A job that never falls back leaves both null; one that does has both leg
 * pairs populated, so "how long did api.video take before we gave up" and
 * "how long did the ffmpeg fallback take" are each answerable without
 * inferring one from the other.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_processing_jobs', function (Blueprint $table) {
            $table->timestamp('fallback_started_at')->nullable()->after('completed_at');
            $table->timestamp('fallback_completed_at')->nullable()->after('fallback_started_at');
        });
    }

    public function down(): void
    {
        Schema::table('video_processing_jobs', function (Blueprint $table) {
            $table->dropColumn(['fallback_started_at', 'fallback_completed_at']);
        });
    }
};
