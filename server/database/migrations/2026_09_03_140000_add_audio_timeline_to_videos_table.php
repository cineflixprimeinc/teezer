<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The music layer's timeline - which part of a track plays, and where.
 *
 * The two audio LEVELS already existed (original_audio_volume, music_volume and
 * their mute flags), so this adds only what was missing: position. Without it a
 * track could only ever start at its own beginning and at the video's, which is
 * the difference between "add music to a video" and an editor.
 *
 * Milliseconds throughout, and integers rather than floats. videos.duration is
 * int2 - whole seconds - so a 23.21s clip is stored as 23 and a music layer
 * clipped to it runs 210ms long. That overrun is audible as a tail after the
 * picture stops. Floats would fix the precision and introduce a worse problem:
 * two clients computing the same boundary can disagree in the last bits, and an
 * edit has to be reproducible exactly, on mobile and web, months later. An
 * integer count of milliseconds is exact and compares equal everywhere.
 *
 * duration stays as it is. Plenty of code reads it, it is right for everything
 * that wants "a 23 second video", and widening it would be a rewrite of
 * unrelated queries to fix a problem only the audio timeline has.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            // The hard boundary for the whole composition: a recording's real
            // length, an upload's measured length, or a slideshow's total. The
            // music layer is clipped to this and nothing may extend past it.
            // Null on older rows, where duration (seconds) remains the truth.
            $table->unsignedInteger('project_duration_ms')->nullable();

            // WHICH part of the track plays - offsets into the source, so the
            // user can take 1:05-1:25 of a three-minute song rather than always
            // its opening.
            $table->unsignedInteger('music_source_start_ms')->nullable();
            $table->unsignedInteger('music_source_end_ms')->nullable();

            // WHERE it lands on the video. Music may start part-way through, so
            // a clip can open on speech and bring the track in afterwards.
            // Only a start: the end follows from the source length and the
            // project boundary, and storing it as well would let the two
            // disagree.
            $table->unsignedInteger('music_video_start_ms')->nullable();

            // Fades, in milliseconds. Their absence is what makes music begin
            // and end with a click - the waveform is cut mid-cycle.
            $table->unsignedSmallInteger('music_fade_in_ms')->default(0);
            $table->unsignedSmallInteger('music_fade_out_ms')->default(0);

            // Auto Mix: duck the music while there is speech underneath. Off by
            // default and always overridable, since automatic ducking on the
            // wrong material is worse than none.
            $table->boolean('music_auto_duck')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropColumn([
                'project_duration_ms',
                'music_source_start_ms',
                'music_source_end_ms',
                'music_video_start_ms',
                'music_fade_in_ms',
                'music_fade_out_ms',
                'music_auto_duck',
            ]);
        });
    }
};
