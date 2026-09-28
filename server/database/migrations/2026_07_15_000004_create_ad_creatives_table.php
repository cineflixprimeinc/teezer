<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The rendered ad unit. `video_id` set = boost an existing published video; otherwise the
 * creative is an uploaded R2 asset (`asset_key`). Creative copy (headline/body/cta/url) is
 * moderated independently of the campaign.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_creatives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ad_group_id')->constrained('ad_groups')->cascadeOnDelete();
            $table->foreignId('video_id')->nullable()->constrained('videos')->nullOnDelete();

            $table->string('type', 20)->default('video'); // video | image | carousel

            // Uploaded asset (R2) when not boosting an existing video
            $table->string('asset_key', 255)->nullable();
            $table->string('media_url', 500)->nullable();
            $table->string('thumbnail_url', 500)->nullable();
            $table->unsignedInteger('duration')->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();

            // Ad copy
            $table->string('headline', 120)->nullable();
            $table->string('body', 300)->nullable();
            $table->string('cta_type', 40)->nullable();          // learn_more | shop_now | sign_up | download | ...
            $table->string('destination_url', 500)->nullable();
            $table->string('display_name', 120)->nullable();

            // Moderation
            $table->string('review_status', 30)->default('pending'); // pending | approved | rejected
            $table->jsonb('moderation')->nullable();
            $table->text('rejection_reason')->nullable();

            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->index('ad_group_id');
            $table->index('video_id');
            $table->index('review_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_creatives');
    }
};
