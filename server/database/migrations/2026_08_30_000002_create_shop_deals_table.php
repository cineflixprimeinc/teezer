<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Deals of the day" on the Shop marketplace home - admin picks ONE real,
 * existing product (via the admin-only cross-shop search - see
 * AdminShopDealController::searchProducts) and sets a deal price + time
 * window. This deliberately sidesteps the fact that there is still no
 * public cross-seller "browse all products" endpoint: nothing here lists
 * products, it just points at one that already exists.
 *
 * `deal_price`/`discount_percent` are stored, not derived at read time -
 * the product's own price can change later without silently rewriting a
 * deal that was already advertised at a specific price.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shop_deals')) {
            Schema::create('shop_deals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
                $table->decimal('deal_price', 12, 2);
                $table->unsignedTinyInteger('discount_percent');
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
        Schema::dropIfExists('shop_deals');
    }
};
