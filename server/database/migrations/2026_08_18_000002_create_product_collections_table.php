<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A shop's curated product groupings (e.g. "Summer Collection", "Best
 * Sellers") shown at the bottom of the storefront. `sort_order` controls
 * display order since a seller cares which collection leads their page more
 * than when it was created.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_collections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shop_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('cover_image_url')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('shop_id', 'idx_product_collections_shop_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_collections');
    }
};
