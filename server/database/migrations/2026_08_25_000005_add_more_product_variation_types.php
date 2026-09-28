<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Expands product_variation_types from its original 14 rows (Size, Color,
 * Material, Style, Storage, Weight, Pattern, Length, Screen Size, Package
 * Quantity, Flavor, Scent, Age Group, Connectivity) with a much wider
 * catalog spanning fashion, footwear, jewelry/watches, electronics,
 * beauty, and food/health - the same "one global admin-manageable list"
 * pattern as shop_categories' own expansion migration
 * (2026_08_23_000003_add_more_shop_categories.php), added rather than
 * edited into the original migration since that one is already deployed.
 */
return new class extends Migration
{
    public function up(): void
    {
        $existing = DB::table('product_variation_types')->pluck('slug')->all();

        $presets = [
            // Fashion / apparel
            ['name' => 'Fit',              'slug' => 'fit',              'options' => ['Slim', 'Regular', 'Relaxed', 'Athletic', 'Oversized', 'Tailored']],
            ['name' => 'Sleeve Length',    'slug' => 'sleeve-length',    'options' => ['Sleeveless', 'Short Sleeve', '3/4 Sleeve', 'Long Sleeve']],
            ['name' => 'Neckline',         'slug' => 'neckline',         'options' => ['Crew Neck', 'V-Neck', 'Round Neck', 'Turtleneck', 'Collared']],
            ['name' => 'Closure Type',     'slug' => 'closure-type',     'options' => ['Zipper', 'Button', 'Velcro', 'Lace-Up', 'Slip-On', 'Buckle']],

            // Footwear
            ['name' => 'Shoe Width',       'slug' => 'shoe-width',       'options' => ['Narrow', 'Medium', 'Wide', 'Extra Wide']],
            ['name' => 'Heel Height',      'slug' => 'heel-height',      'options' => ['Flat', 'Low', 'Mid', 'High', 'Platform']],

            // Jewelry / watches
            ['name' => 'Ring Size',        'slug' => 'ring-size',        'options' => ['5', '6', '7', '8', '9', '10', '11', '12']],
            ['name' => 'Chain Length',     'slug' => 'chain-length',     'options' => ['14"', '16"', '18"', '20"', '22"', '24"']],
            ['name' => 'Metal Type',       'slug' => 'metal-type',       'options' => ['Gold', 'Silver', 'Rose Gold', 'Platinum', 'Stainless Steel', 'Titanium']],
            ['name' => 'Gemstone',         'slug' => 'gemstone',         'options' => ['Diamond', 'Ruby', 'Sapphire', 'Emerald', 'Pearl', 'None']],
            ['name' => 'Case Size',        'slug' => 'case-size',        'options' => ['38mm', '40mm', '42mm', '44mm', '46mm']],
            ['name' => 'Band Type',        'slug' => 'band-type',        'options' => ['Silicone', 'Leather', 'Metal', 'Nylon', 'Rubber']],

            // Electronics
            ['name' => 'RAM',              'slug' => 'ram',              'options' => ['4GB', '6GB', '8GB', '12GB', '16GB', '32GB']],
            ['name' => 'Processor',        'slug' => 'processor',        'options' => ['Base', 'Pro', 'Max', 'Ultra']],
            ['name' => 'Battery Capacity', 'slug' => 'battery-capacity', 'options' => ['2000mAh', '5000mAh', '10000mAh', '20000mAh']],
            ['name' => 'Voltage',          'slug' => 'voltage',          'options' => ['110V', '220V', '110-240V']],
            ['name' => 'Power (Watts)',    'slug' => 'power-watts',      'options' => ['500W', '1000W', '1500W', '2000W']],
            ['name' => 'Resolution',       'slug' => 'resolution',       'options' => ['HD', 'Full HD', '2K', '4K', '8K']],
            ['name' => 'Refresh Rate',     'slug' => 'refresh-rate',     'options' => ['60Hz', '90Hz', '120Hz', '144Hz']],
            ['name' => 'Water Resistance', 'slug' => 'water-resistance', 'options' => ['Not Rated', 'IPX4', 'IPX7', 'IP68', '30m', '100m', '200m']],
            ['name' => 'Network Type',     'slug' => 'network-type',     'options' => ['4G', '5G', 'Wi-Fi Only', 'GSM', 'CDMA']],
            ['name' => 'SIM Type',         'slug' => 'sim-type',         'options' => ['Single SIM', 'Dual SIM', 'eSIM']],
            ['name' => 'Volume',           'slug' => 'volume',           'options' => ['100ml', '250ml', '500ml', '1L', '2L', '5L']],

            // Beauty / personal care
            ['name' => 'Skin Type',        'slug' => 'skin-type',        'options' => ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive', 'All Types']],
            ['name' => 'Hair Type',        'slug' => 'hair-type',        'options' => ['Straight', 'Wavy', 'Curly', 'Coily', 'All Types']],

            // Food / health
            ['name' => 'Spice Level',      'slug' => 'spice-level',      'options' => ['Mild', 'Medium', 'Hot', 'Extra Hot']],
            ['name' => 'Dietary',          'slug' => 'dietary',          'options' => ['Vegan', 'Vegetarian', 'Gluten-Free', 'Halal', 'Kosher', 'Sugar-Free']],

            // General / catalog
            ['name' => 'Piece Count',      'slug' => 'piece-count',      'options' => ['1 Piece', '2 Piece', '3 Piece', '5 Piece', 'Set of 10']],
            ['name' => 'Finish',           'slug' => 'finish',           'options' => ['Matte', 'Glossy', 'Satin', 'Textured']],
            ['name' => 'Shape',            'slug' => 'shape',            'options' => ['Round', 'Square', 'Rectangle', 'Oval', 'Hexagon']],
            ['name' => 'Warranty',         'slug' => 'warranty',         'options' => ['No Warranty', '6 Months', '1 Year', '2 Years', 'Lifetime']],
            ['name' => 'Edition',          'slug' => 'edition',          'options' => ['Standard', 'Deluxe', 'Limited', "Collector's"]],
            ['name' => 'Platform',         'slug' => 'platform',         'options' => ['iOS', 'Android', 'Windows', 'Mac', 'Cross-Platform']],
            ['name' => 'License Type',     'slug' => 'license-type',     'options' => ['Personal', 'Commercial', 'Extended', 'Single-Use']],
        ];

        $rows = collect($presets)->reject(fn (array $p) => in_array($p['slug'], $existing, true))->values();
        if ($rows->isEmpty()) return;

        $now = now();
        $nextSort = (int) (DB::table('product_variation_types')->max('sort_order') ?? 0);

        DB::table('product_variation_types')->insert(
            $rows->map(fn (array $p, int $i) => [
                'name'       => $p['name'],
                'slug'       => $p['slug'],
                'options'    => json_encode($p['options']),
                'sort_order' => $nextSort + $i + 1,
                'is_active'  => true,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all(),
        );
    }

    public function down(): void
    {
        DB::table('product_variation_types')->whereIn('slug', [
            'fit', 'sleeve-length', 'neckline', 'closure-type',
            'shoe-width', 'heel-height',
            'ring-size', 'chain-length', 'metal-type', 'gemstone', 'case-size', 'band-type',
            'ram', 'processor', 'battery-capacity', 'voltage', 'power-watts', 'resolution',
            'refresh-rate', 'water-resistance', 'network-type', 'sim-type', 'volume',
            'skin-type', 'hair-type',
            'spice-level', 'dietary',
            'piece-count', 'finish', 'shape', 'warranty', 'edition', 'platform', 'license-type',
        ])->delete();
    }
};
