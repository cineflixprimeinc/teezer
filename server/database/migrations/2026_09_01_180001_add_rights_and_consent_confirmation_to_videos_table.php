<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Real, timestamped creator attestations for a post (Media & safety's
 * "Content rights confirmed" / "Subject consent confirmed" toggles) - not
 * cosmetic checkboxes. rights_confirmed is required to publish (see
 * VideoController::completeUpload's validation and PostCameraScreenImpl.tsx's
 * submitPost) - the same "I own this or have permission to post it" gate
 * YouTube/TikTok/Instagram all require, and the actual legal record it's
 * meant to give Reelsoo: WHEN a creator attested to it, not just whether a
 * UI toggle happened to be on when the row was written. consent_confirmed
 * is the same shape for showing identifiable people, but is not a hard
 * gate (not every post has a person in it).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (!Schema::hasColumn('videos', 'rights_confirmed')) {
                $table->boolean('rights_confirmed')->default(false)->after('is_ai_generated');
                $table->timestamp('rights_confirmed_at')->nullable()->after('rights_confirmed');
            }
            if (!Schema::hasColumn('videos', 'consent_confirmed')) {
                $table->boolean('consent_confirmed')->default(false)->after('rights_confirmed_at');
                $table->timestamp('consent_confirmed_at')->nullable()->after('consent_confirmed');
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $drop = array_filter(
                ['rights_confirmed', 'rights_confirmed_at', 'consent_confirmed', 'consent_confirmed_at'],
                fn ($c) => Schema::hasColumn('videos', $c)
            );
            if ($drop) $table->dropColumn($drop);
        });
    }
};
