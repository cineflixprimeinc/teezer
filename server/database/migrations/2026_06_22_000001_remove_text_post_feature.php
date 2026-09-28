<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Removes the text-post feature entirely.
 *
 * Text posts carried no R2 media (the styled text was the whole content), so a
 * plain DB delete fully removes them - there are no orphaned files to clean up.
 * Then the three text-only columns are dropped from the videos table.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('videos', 'post_type')) {
            // Hard-delete every text post (bypasses soft-delete; nothing else references them).
            DB::table('videos')->where('post_type', 'text')->delete();
        }

        Schema::table('videos', function (Blueprint $table) {
            foreach (['text_style', 'text_content', 'post_type'] as $col) {
                if (Schema::hasColumn('videos', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (! Schema::hasColumn('videos', 'post_type')) {
                $table->string('post_type', 20)->nullable()->index()->after('mime_type');
            }
            if (! Schema::hasColumn('videos', 'text_content')) {
                $table->text('text_content')->nullable()->after('post_type');
            }
            if (! Schema::hasColumn('videos', 'text_style')) {
                $table->json('text_style')->nullable()->after('text_content');
            }
        });
    }
};
