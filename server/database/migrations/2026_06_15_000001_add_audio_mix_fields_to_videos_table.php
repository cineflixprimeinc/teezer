<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->unsignedTinyInteger('original_audio_volume')->default(100)->after('custom_audio_name');
            $table->unsignedTinyInteger('music_volume')->default(50)->after('original_audio_volume');
            $table->boolean('is_original_audio_muted')->default(false)->after('music_volume');
            $table->boolean('is_music_muted')->default(false)->after('is_original_audio_muted');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropColumn(['original_audio_volume', 'music_volume', 'is_original_audio_muted', 'is_music_muted']);
        });
    }
};
