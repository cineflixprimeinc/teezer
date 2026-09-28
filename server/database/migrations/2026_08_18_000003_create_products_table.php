<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A shop's product listings. `colors` is JSON (array of {label, hex}) rather
 * than a variants table - a product-option system with its own stock/price
 * per variant is a different, larger feature; this is the swatch row the
 * storefront card shows today, nothing more.
 *
 * `badge` is a plain nullable string ('bestseller' | 'new') rather than a DB
 * enum, matching this project's existing convention (see
 * MonetizationProgram::MODES) of validating small fixed sets at the app layer
 * instead of a DB constraint.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shop_id')->constrained()->cascadeOnDelete();
            $table->foreignId('collection_id')->nullable()
                ->constrained('product_collections')->nullOnDelete();
            $table->string('name');
            $table->decimal('price', 10, 2);
            $table->string('currency', 8)->default('NPR');
            $table->string('image_url')->nullable();
            $table->string('badge', 20)->nullable();
            $table->decimal('rating_avg', 3, 2)->default(0);
            $table->unsignedInteger('rating_count')->default(0);
            $table->unsignedInteger('sold_count')->default(0);
            $table->json('colors')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('shop_id', 'idx_products_shop_id');
            $table->index('collection_id', 'idx_products_collection_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
