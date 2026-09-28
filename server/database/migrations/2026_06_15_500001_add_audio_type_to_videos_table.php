<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            // Stores which sound type is the clickable main sound for this video.
            // library_music = user selected a track from the Reelsoo library.
            // original_audio = video's own embedded audio becomes the sound page.
            $table->enum('audio_type', ['library_music', 'original_audio'])
                ->nullable()
                ->after('music_track_id');

            $table->index('audio_type');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex(['audio_type']);
            $table->dropColumn('audio_type');
        });
    }
};
