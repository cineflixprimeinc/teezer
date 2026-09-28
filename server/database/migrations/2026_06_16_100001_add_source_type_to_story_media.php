<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('story_media', function (Blueprint $table) {
            $table->string('source_type', 20)->default('upload')->after('media_type');
            $table->unsignedBigInteger('shared_video_id')->nullable()->after('source_type');
            $table->foreign('shared_video_id')->references('id')->on('videos')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('story_media', function (Blueprint $table) {
            $table->dropForeign(['shared_video_id']);
            $table->dropColumn(['source_type', 'shared_video_id']);
        });
    }
};
