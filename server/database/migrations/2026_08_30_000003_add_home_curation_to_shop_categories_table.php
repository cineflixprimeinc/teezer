<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Curation of the Shop marketplace home's category grid - which of the
 * ALREADY-REAL platform categories (shop_categories) show there, and in
 * what order. Deliberately two new columns on the existing table rather
 * than a new one: this is ordering/selecting rows that already exist, not a
 * new resource. `is_active` (already on this table) still governs whether a
 * category exists at all anywhere in the app; `is_featured_home` is a
 * narrower "and also show it on the Shop home grid" on top of that.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shop_categories', function (Blueprint $table) {
            if (! Schema::hasColumn('shop_categories', 'is_featured_home')) {
                $table->boolean('is_featured_home')->default(false)->after('is_active');
            }
            if (! Schema::hasColumn('shop_categories', 'home_sort_order')) {
                $table->unsignedSmallInteger('home_sort_order')->default(0)->after('is_featured_home');
            }
        });
    }

    public function down(): void
    {
        Schema::table('shop_categories', function (Blueprint $table) {
            $cols = array_filter(
                ['is_featured_home', 'home_sort_order'],
                fn ($c) => Schema::hasColumn('shop_categories', $c),
            );
            if ($cols) {
                $table->dropColumn($cols);
            }
        });
    }
};
