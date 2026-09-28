<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Photo comments: an uploaded image attached to a comment, alongside the GIF
 * fields added earlier.
 *
 * Stores the R2 object key (like avatars/covers), NOT a URL - the resource runs
 * it through Storage::url on the way out, so a bucket or CDN move never rewrites
 * rows. A GIF is a remote URL from a provider; an uploaded photo is ours, hence
 * the different treatment.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_comments', function (Blueprint $table) {
            if (! Schema::hasColumn('video_comments', 'image_path')) {
                $table->string('image_path', 500)->nullable()->after('gif_provider_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('video_comments', function (Blueprint $table) {
            if (Schema::hasColumn('video_comments', 'image_path')) {
                $table->dropColumn('image_path');
            }
        });
    }
};
