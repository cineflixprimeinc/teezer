<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Shop marketplace home's promo carousel - admin-authored, not tied to
 * any shop/product. `image_url` is nullable because a banner can be pure
 * gradient + copy (the reference design's own "Season Sale" card); when set,
 * it renders behind the gradient instead of a Blade/CSS one.
 *
 * `starts_at`/`ends_at` mirror `ad_campaigns.start_at`/`end_at`'s nullable
 * timestamp window shape rather than inventing a new one - null on either
 * side means "no start/end limit" (open-ended in that direction), same
 * convention.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shop_promo_banners')) {
            Schema::create('shop_promo_banners', function (Blueprint $table) {
                $table->id();
                $table->string('title', 80);
                $table->string('subtitle', 160)->nullable();
                $table->string('description', 255)->nullable();
                $table->string('image_url')->nullable();
                $table->string('gradient_start', 9)->nullable();
                $table->string('gradient_end', 9)->nullable();
                $table->string('cta_label', 40)->default('Shop now');
                $table->string('cta_link', 500)->nullable();
                $table->boolean('is_active')->default(true);
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamp('starts_at')->nullable();
                $table->timestamp('ends_at')->nullable();
                $table->timestamps();

                $table->index(['is_active', 'sort_order']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_promo_banners');
    }
};
