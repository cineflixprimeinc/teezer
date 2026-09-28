<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Platform-wide variation presets (Size: S/M/L/XL, Color: Black/White/Red...)
 * offered as a dropdown on Add Product's "Add Variation" sheet, same pattern
 * as shop_categories - one global, admin-manageable list every seller draws
 * from, rather than each seller typing "Size" and "Small, Medium, Large" by
 * hand from scratch every time. Still purely a convenience: the free-text
 * name/options fields the sheet always had are unchanged and still work for
 * anything not in this list.
 *
 * `options` is a JSON string array rather than a child table - these are
 * flat, ordered display strings with no other attributes (no id/slug/icon
 * per option), the same shape Product.variations itself already stores
 * picks in, so a second relational table here would just be more joins for
 * data that's never queried on its own.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_variation_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 40);
            $table->string('slug', 40)->unique();
            $table->json('options');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $presets = [
            ['name' => 'Size',              'slug' => 'size',              'options' => ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']],
            ['name' => 'Color',             'slug' => 'color',             'options' => ['Black', 'White', 'Gray', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Brown', 'Beige', 'Navy', 'Gold', 'Silver']],
            ['name' => 'Material',          'slug' => 'material',          'options' => ['Cotton', 'Polyester', 'Leather', 'Faux Leather', 'Denim', 'Wool', 'Silk', 'Linen', 'Nylon', 'Suede', 'Canvas']],
            ['name' => 'Style',             'slug' => 'style',             'options' => ['Casual', 'Formal', 'Sport', 'Vintage', 'Streetwear', 'Classic', 'Slim Fit', 'Regular Fit', 'Oversized']],
            ['name' => 'Storage',           'slug' => 'storage',           'options' => ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB']],
            ['name' => 'Weight',            'slug' => 'weight',            'options' => ['100g', '250g', '500g', '1kg', '2kg', '5kg', '10kg']],
            ['name' => 'Pattern',           'slug' => 'pattern',           'options' => ['Solid', 'Striped', 'Checked', 'Floral', 'Polka Dot', 'Graphic Print', 'Camouflage']],
            ['name' => 'Length',            'slug' => 'length',            'options' => ['Short', 'Regular', 'Long', 'Extra Long']],
            ['name' => 'Screen Size',       'slug' => 'screen-size',       'options' => ['13"', '14"', '15.6"', '17"', '24"', '27"', '32"', '43"', '55"', '65"']],
            ['name' => 'Package Quantity',  'slug' => 'package-quantity',  'options' => ['Single', '2-Pack', '3-Pack', '5-Pack', '10-Pack', '12-Pack', '24-Pack']],
            ['name' => 'Flavor',            'slug' => 'flavor',            'options' => ['Original', 'Chocolate', 'Vanilla', 'Strawberry', 'Mint', 'Mango', 'Unflavored']],
            ['name' => 'Scent',             'slug' => 'scent',             'options' => ['Unscented', 'Lavender', 'Rose', 'Citrus', 'Vanilla', 'Ocean Breeze', 'Sandalwood']],
            ['name' => 'Age Group',         'slug' => 'age-group',         'options' => ['Infant', 'Toddler', 'Kids', 'Teen', 'Adult']],
            ['name' => 'Connectivity',      'slug' => 'connectivity',      'options' => ['Wired', 'Bluetooth', 'Wi-Fi', 'USB-C', 'Lightning', 'NFC']],
        ];

        $now = now();
        DB::table('product_variation_types')->insert(
            collect($presets)->values()->map(fn (array $p, int $i) => [
                'name'       => $p['name'],
                'slug'       => $p['slug'],
                'options'    => json_encode($p['options']),
                'sort_order' => $i + 1,
                'is_active'  => true,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all(),
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variation_types');
    }
};
