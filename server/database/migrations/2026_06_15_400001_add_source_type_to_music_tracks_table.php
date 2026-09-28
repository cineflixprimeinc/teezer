<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('music_tracks', function (Blueprint $table) {
            $table->enum('source_type', ['library', 'original'])->default('library')->after('created_by_admin_id');
            // No FK constraint - avoids circular dependency with videos table
            $table->unsignedBigInteger('source_video_id')->nullable()->after('source_type');
            $table->index('source_type');
        });
    }

    public function down(): void
    {
        Schema::table('music_tracks', function (Blueprint $table) {
            $table->dropIndex(['source_type']);
            $table->dropColumn(['source_type', 'source_video_id']);
        });
    }
};
