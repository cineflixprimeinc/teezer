<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets Shop Settings > Products & Inventory show a real "N products - M low
 * stock" status line. Nothing in the codebase previously defined what "low"
 * means for a product's `stock` count - this is a per-product, seller-owned
 * threshold rather than a hardcoded constant, so a seller selling
 * fast-moving items in bulk and one selling one-of-a-kind pieces don't share
 * a single magic number. Defaults to 5, a reasonable out-of-the-box value
 * that every existing product (created before this column existed) also
 * gets automatically via the column default - no backfill needed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedInteger('low_stock_threshold')->default(5)->after('stock');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('low_stock_threshold');
        });
    }
};
