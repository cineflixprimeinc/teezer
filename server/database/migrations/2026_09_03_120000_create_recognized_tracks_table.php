<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Music recognised inside an uploaded video, and the per-video result.
 *
 * Deliberately NOT stored in music_tracks. That table is Teezer's own library:
 * every row is an audio file we host in R2, created by an admin, offered in the
 * upload picker and playable in the app. A recognised track is the opposite - an
 * identification of somebody else's recording, with no audio we host and no
 * right to offer it as a sound. Putting them in one table would either leak
 * commercial records into the picker or scatter `where source != 'recognized'`
 * across every query that reads it.
 *
 * The uniqueness story is the other reason: a library track is unique because an
 * admin uploaded it once, while a recognised track is unique by ISRC or Shazam
 * id and is written concurrently by however many uploads happen to contain the
 * same song.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recognized_tracks', function (Blueprint $table) {
            $table->id();

            // ── Identity, in priority order ──────────────────────────────
            // ISRC first: it identifies a RECORDING, which is what was heard.
            // Title+artist is never the key - "Blinding Lights / The Weeknd"
            // covers the single, the album cut, a remaster and a live version,
            // and collapsing those loses the distinction the whole feature is
            // about. Both are nullable because a provider may return only one,
            // and both are unique so a race ends in a duplicate-key error we
            // can recover from rather than two rows for one recording.
            $table->string('isrc', 20)->nullable()->unique();
            $table->string('shazam_id', 64)->nullable()->unique();

            $table->string('title');
            $table->string('artist_name');
            $table->string('album_title')->nullable();
            $table->string('artwork_url', 1024)->nullable();

            // Stored, never constructed. A guessed Apple Music URL 404s, and a
            // dead "Play on Apple Music" button is worse than none at all.
            $table->string('apple_music_id', 64)->nullable();
            $table->string('apple_music_url', 1024)->nullable();
            $table->string('shazam_web_url', 1024)->nullable();

            $table->string('genre', 120)->nullable();
            $table->boolean('explicit')->default(false);

            // Which SDK/service identified this first, for when a provider's
            // metadata turns out to be wrong and has to be traced back.
            $table->string('source', 32)->default('shazamkit');

            $table->timestamps();

            $table->index(['artist_name']);
        });

        Schema::table('videos', function (Blueprint $table) {
            // Where this video's recognition got to. NULL means the video
            // predates the feature, which reads as "no attribution", not as a
            // failure - see MusicAttribution.
            //
            //   processing      submitted, no answer yet
            //   recognized      confident match, recognized_track_id is set
            //   no_match        definitively nothing in the catalog
            //   low_confidence  matched, but not well enough to name an artist
            //   failed          the attempt itself broke; retryable
            //
            // A string, not a Postgres enum: adding a state to an enum needs a
            // migration and a table rewrite, and this list will grow.
            $table->string('recognition_status', 24)->nullable()->index();

            $table->foreignId('recognized_track_id')->nullable()
                ->constrained('recognized_tracks')->nullOnDelete();

            // 0..1, as reported by the provider. Kept even for rejected matches:
            // without it there is no way to tell a threshold that is too strict
            // from a catalog that genuinely lacks the song.
            $table->decimal('recognition_confidence', 4, 3)->nullable();

            // Where in the video the match was found, for a future rights or
            // moderation review that needs to hear the same few seconds.
            $table->unsignedInteger('matched_offset_seconds')->nullable();
            $table->unsignedInteger('matched_duration_seconds')->nullable();

            $table->timestamp('recognized_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('recognized_track_id');
            $table->dropColumn([
                'recognition_status',
                'recognition_confidence',
                'matched_offset_seconds',
                'matched_duration_seconds',
                'recognized_at',
            ]);
        });

        Schema::dropIfExists('recognized_tracks');
    }
};
