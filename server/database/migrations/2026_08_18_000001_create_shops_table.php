<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One shop per creator. `shop_name`/`tagline` are shop-specific copy -
 * deliberately separate from the user's own display name, since a seller's
 * storefront brand (e.g. "Luna Studio") is not the same thing as their
 * personal profile name. Everything else about the storefront (avatar,
 * handle, verified badge) is read straight off the owning `users` row rather
 * than duplicated here - a shop always looks like its creator.
 *
 * `is_live`, `rating_avg`, `rating_count` and `sold_count` are the shop-level
 * aggregates the storefront header renders; `rating_avg`/`rating_count` are
 * denormalised from `shop_reviews` (recomputed on write, not queried live) and
 * `sold_count` is a running total maintained by whatever order flow lands
 * later - both are 0 until real data exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shops', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('shop_name');
            $table->string('tagline')->nullable();
            $table->boolean('is_live')->default(false);
            $table->decimal('rating_avg', 3, 2)->default(0);
            $table->unsignedInteger('rating_count')->default(0);
            $table->unsignedInteger('sold_count')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shops');
    }
};
