<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_comments', function (Blueprint $table) {
            if (! Schema::hasColumn('video_comments', 'gif_url')) {
                $table->string('gif_url', 500)->nullable()->after('body');
            }
            if (! Schema::hasColumn('video_comments', 'gif_preview_url')) {
                $table->string('gif_preview_url', 500)->nullable()->after('gif_url');
            }
            if (! Schema::hasColumn('video_comments', 'gif_provider')) {
                $table->string('gif_provider', 50)->nullable()->after('gif_preview_url');
            }
            if (! Schema::hasColumn('video_comments', 'gif_provider_id')) {
                $table->string('gif_provider_id', 100)->nullable()->after('gif_provider');
            }
        });
    }

    public function down(): void
    {
        Schema::table('video_comments', function (Blueprint $table) {
            foreach (['gif_url', 'gif_preview_url', 'gif_provider', 'gif_provider_id'] as $col) {
                if (Schema::hasColumn('video_comments', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
