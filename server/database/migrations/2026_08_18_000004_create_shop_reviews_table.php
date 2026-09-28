<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shop-level reviews (a seller rating, like a marketplace's "125 reviews" on
 * the storefront header) rather than per-product reviews - the storefront's
 * Reviews tab is a single feed for the whole shop, not one per product.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shop_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shop_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->timestamps();

            $table->index('shop_id', 'idx_shop_reviews_shop_id');
            // One review per buyer per shop - editing an existing review is an
            // update, not a second row.
            $table->unique(['shop_id', 'user_id'], 'uniq_shop_reviews_shop_user');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_reviews');
    }
};
