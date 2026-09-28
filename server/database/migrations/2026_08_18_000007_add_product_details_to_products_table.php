<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fields the seller-facing "Add New Product" form needs that the original
 * products table didn't have yet - this table only supported admin-seeded
 * demo products until now.
 *
 * `images` is a JSON array of up to 8 URLs (the form's "Add up to 8 photos");
 * `image_url` (existing column) stays as the storefront card's single
 * thumbnail, kept in sync as `images[0]` by the controller rather than
 * computed on every read - the mobile ProductCard already renders
 * `image_url` and doesn't need to change.
 *
 * `variations` is a JSON array of {name, options[]} - "Add Variation" lets a
 * seller add e.g. {name: "Size", options: ["S","M","L"]} - deliberately not
 * a variants table with its own price/stock per combination; that is a
 * different, larger feature than this form asks for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->text('description')->nullable()->after('name');
            $table->string('sku')->nullable()->after('description');
            $table->decimal('compare_at_price', 10, 2)->nullable()->after('price');
            $table->unsignedInteger('stock')->default(0)->after('sold_count');
            $table->json('images')->nullable()->after('image_url');
            $table->json('variations')->nullable()->after('colors');
            $table->string('shipping_type')->nullable()->after('variations');
            $table->boolean('is_digital')->default(false)->after('shipping_type');
            $table->boolean('allow_cod')->default(true)->after('is_digital');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn([
                'description', 'sku', 'compare_at_price', 'stock', 'images',
                'variations', 'shipping_type', 'is_digital', 'allow_cod',
            ]);
        });
    }
};
