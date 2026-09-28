<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a speaker's audio lives on the Cloudflare Realtime SFU.
 *
 * A speaker publishes their mic into their own SFU session; everyone else
 * subscribes to it by (sessionId, trackName). That pair is the only thing a
 * listener needs, and it has to be readable by every other participant, so it
 * belongs on the seat rather than in the publisher's own memory.
 *
 * Media never touches this server - the app talks WebRTC straight to the
 * Cloudflare edge, and we only broker the SDP. Nothing here is bandwidth.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('space_participants', function (Blueprint $table) {
            $table->string('rtc_session_id', 128)->nullable();
            $table->string('rtc_track_name', 64)->nullable();
            // Set when a speaker's mic is actually publishing, so listeners only
            // try to subscribe to tracks that exist.
            $table->timestamp('published_at')->nullable();

            // The subscribe path reads "every publishing speaker in this room".
            $table->index(['space_id', 'published_at']);
        });
    }

    public function down(): void
    {
        Schema::table('space_participants', function (Blueprint $table) {
            $table->dropIndex(['space_id', 'published_at']);
            $table->dropColumn(['rtc_session_id', 'rtc_track_name', 'published_at']);
        });
    }
};
