<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saved sounds for the compose flow's sound browser.
 *
 * Deliberately NOT audio_favorites: that table is keyed to audio_track_id and
 * belongs to the older audio_tracks catalog. The sound browser reads
 * music_tracks, a separate table, so its ids cannot be stored there without
 * breaking that foreign key. Two catalogs, two favourite tables.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('music_favorites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('music_track_id')->constrained('music_tracks')->cascadeOnDelete();
            $table->timestamps();

            // Makes the toggle idempotent at the database level, so a double
            // tap racing itself cannot leave two rows behind.
            $table->unique(['user_id', 'music_track_id']);

            // The "my saved sounds" listing reads by user, newest first.
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('music_favorites');
    }
};
