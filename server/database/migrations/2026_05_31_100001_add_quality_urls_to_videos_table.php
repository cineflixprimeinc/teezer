<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            // JSON map of quality key → R2 object key
            // e.g. {"1080":"videos/quality/1080/123/uuid.mp4","720":"..."}
            $table->json('quality_urls')->nullable()->after('video_url');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropColumn('quality_urls');
        });
    }
};
