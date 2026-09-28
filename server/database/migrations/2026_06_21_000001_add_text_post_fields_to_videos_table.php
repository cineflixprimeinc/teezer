<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (! Schema::hasColumn('videos', 'post_type')) {
                // null/'' = regular video/photo post; 'text' = text-only post
                $table->string('post_type', 20)->nullable()->index()->after('mime_type');
            }
            if (! Schema::hasColumn('videos', 'text_content')) {
                $table->text('text_content')->nullable()->after('post_type');
            }
            if (! Schema::hasColumn('videos', 'text_style')) {
                // JSON: { backgroundId, background, font, color, alignment }
                $table->json('text_style')->nullable()->after('text_content');
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            foreach (['post_type', 'text_content', 'text_style'] as $col) {
                if (Schema::hasColumn('videos', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
