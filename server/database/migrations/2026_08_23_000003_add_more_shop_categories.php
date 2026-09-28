<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Expands shop_categories from its original 5 rows (Fashion, Beauty,
 * Electronics, Home, Shoes) to a fuller marketplace list, for the new
 * dedicated category-picker page (ShopCategoryPickerScreen, mobile) - 5
 * options read fine as inline chips but not as a real picker page. Every
 * shop's category_id already just points at this table by id
 * (ShopSettingsController/SellerApplicationController both validate against
 * it, ShopController joins it for display), so adding rows here needs no
 * other schema change - the picker's list is exactly whatever this table
 * holds.
 */
return new class extends Migration
{
    public function up(): void
    {
        $existing = DB::table('shop_categories')->pluck('slug')->all();

        $rows = [
            ['name' => 'Sports & Outdoors',      'slug' => 'sports-outdoors',      'sort_order' => 6],
            ['name' => 'Toys & Games',            'slug' => 'toys-games',            'sort_order' => 7],
            ['name' => 'Books & Stationery',      'slug' => 'books-stationery',      'sort_order' => 8],
            ['name' => 'Health & Wellness',       'slug' => 'health-wellness',       'sort_order' => 9],
            ['name' => 'Groceries & Food',        'slug' => 'groceries-food',        'sort_order' => 10],
            ['name' => 'Baby & Kids',             'slug' => 'baby-kids',             'sort_order' => 11],
            ['name' => 'Automotive',              'slug' => 'automotive',            'sort_order' => 12],
            ['name' => 'Jewelry & Accessories',   'slug' => 'jewelry-accessories',   'sort_order' => 13],
            ['name' => 'Pet Supplies',            'slug' => 'pet-supplies',          'sort_order' => 14],
            ['name' => 'Art & Crafts',            'slug' => 'art-crafts',            'sort_order' => 15],
            ['name' => 'Music & Instruments',     'slug' => 'music-instruments',     'sort_order' => 16],
            ['name' => 'Furniture',               'slug' => 'furniture',             'sort_order' => 17],
            ['name' => 'Garden & Outdoor Living', 'slug' => 'garden-outdoor-living', 'sort_order' => 18],
            ['name' => 'Office Supplies',         'slug' => 'office-supplies',       'sort_order' => 19],
            ['name' => 'Digital Goods',           'slug' => 'digital-goods',         'sort_order' => 20],
        ];

        $now = now();
        $insert = [];
        foreach ($rows as $row) {
            if (in_array($row['slug'], $existing, true)) {
                continue; // already there (e.g. re-run on a box that got these another way) - never duplicate
            }
            $insert[] = $row + ['is_active' => true, 'created_at' => $now, 'updated_at' => $now];
        }

        if ($insert) {
            DB::table('shop_categories')->insert($insert);
        }
    }

    public function down(): void
    {
        DB::table('shop_categories')->whereIn('slug', [
            'sports-outdoors', 'toys-games', 'books-stationery', 'health-wellness',
            'groceries-food', 'baby-kids', 'automotive', 'jewelry-accessories',
            'pet-supplies', 'art-crafts', 'music-instruments', 'furniture',
            'garden-outdoor-living', 'office-supplies', 'digital-goods',
        ])->delete();
    }
};
