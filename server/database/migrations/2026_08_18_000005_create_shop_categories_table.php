<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Platform-wide product categories (Fashion, Beauty, Electronics...),
 * admin-managed from the "Reelsoo Shop" admin section - NOT per-shop. Every
 * shop's product grid filters against this same list, the way the storefront
 * carousel's [All] [Fashion] [Beauty]... pills work.
 *
 * Seeded with a starting set here (same reasoning as
 * monetization_programs: the client reads this table directly, so an empty
 * table is an empty carousel) - the admin panel is what actually manages it
 * going forward.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('shop_categories')) {
            return;
        }

        Schema::create('shop_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        $now = now();
        DB::table('shop_categories')->insert(array_map(
            fn (array $r) => $r + ['is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            [
                ['name' => 'Fashion',     'slug' => 'fashion',     'sort_order' => 1],
                ['name' => 'Beauty',      'slug' => 'beauty',      'sort_order' => 2],
                ['name' => 'Electronics', 'slug' => 'electronics', 'sort_order' => 3],
                ['name' => 'Home',        'slug' => 'home',        'sort_order' => 4],
                ['name' => 'Shoes',       'slug' => 'shoes',       'sort_order' => 5],
            ],
        ));
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_categories');
    }
};
