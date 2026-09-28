<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\ProductCollection;
use App\Models\Shop;
use App\Models\ShopReview;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Sample storefront data so the Shop tab has something to show. There is no
 * seller product-management UI yet, so this is the only way to populate a
 * shop today - run manually with:
 *   php artisan db:seed --class=ShopDemoSeeder
 * Attaches to DemoDataSeeder's `demo_creator` account rather than a random
 * user, so it's always findable.
 */
class ShopDemoSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::where('username', 'demo_creator')->first();
        if (!$user) {
            $this->command?->warn('demo_creator not found - run DemoDataSeeder first.');
            return;
        }

        $shop = Shop::updateOrCreate(
            ['user_id' => $user->id],
            ['shop_name' => 'Luna Studio', 'tagline' => 'Premium & Trendy Fashion', 'is_live' => true, 'sold_count' => 12500]
        );

        $collections = [
            ['name' => 'Summer Collection', 'sort_order' => 1],
            ['name' => 'New Arrivals', 'sort_order' => 2],
            ['name' => 'Best Sellers', 'sort_order' => 3],
        ];
        $collectionRows = [];
        foreach ($collections as $c) {
            $collectionRows[$c['name']] = ProductCollection::updateOrCreate(
                ['shop_id' => $shop->id, 'name' => $c['name']],
                ['sort_order' => $c['sort_order']]
            );
        }

        $products = [
            ['name' => 'Oversized Cotton Shirt',   'price' => 1899, 'badge' => 'bestseller', 'sold_count' => 2300, 'rating_avg' => 4.8, 'rating_count' => 340, 'colors' => ['#8a8a8a', '#8a7cd6', '#f4c9d6'], 'collection' => 'Best Sellers'],
            ['name' => 'Minimal Shoulder Bag',      'price' => 2399, 'badge' => 'new',        'sold_count' => 1800, 'rating_avg' => 4.9, 'rating_count' => 210, 'colors' => ['#cdeccb', '#f7c9c0', '#f4c9d6'], 'collection' => 'New Arrivals'],
            ['name' => 'Classic White Sneakers',    'price' => 3299, 'badge' => null,         'sold_count' => 890,  'rating_avg' => 4.7, 'rating_count' => 150, 'colors' => ['#cbb9e0', '#a9825a', '#3a3a6a'], 'collection' => null],
            ['name' => 'Floral Puff Dress',         'price' => 2899, 'badge' => null,         'sold_count' => 1200, 'rating_avg' => 4.8, 'rating_count' => 180, 'colors' => ['#f4c9d6', '#e8d9a0', '#c9e0c4'], 'collection' => 'Summer Collection'],
            ['name' => 'Layered Pendant Necklace',  'price' => 1299, 'badge' => null,         'sold_count' => 3100, 'rating_avg' => 4.7, 'rating_count' => 260, 'colors' => [],                                     'collection' => null],
            ['name' => 'Heart Phone Case',          'price' => 699,  'badge' => null,         'sold_count' => 2500, 'rating_avg' => 4.6, 'rating_count' => 190, 'colors' => ['#3a3a6a', '#a9d6e0', '#f4dcd6', '#e0d9c9'], 'collection' => null],
        ];
        foreach ($products as $i => $p) {
            Product::updateOrCreate(
                ['shop_id' => $shop->id, 'name' => $p['name']],
                [
                    'collection_id' => $p['collection'] ? $collectionRows[$p['collection']]->id : null,
                    'price'         => $p['price'],
                    'badge'         => $p['badge'],
                    'sold_count'    => $p['sold_count'],
                    'rating_avg'    => $p['rating_avg'],
                    'rating_count'  => $p['rating_count'],
                    'colors'        => array_map(fn ($hex) => ['label' => $hex, 'hex' => $hex], $p['colors']),
                    'sort_order'    => $i,
                ]
            );
        }

        // A handful of reviews from other seeded users, if any exist - the
        // model's saved hook recomputes the shop's rating_avg/rating_count.
        $reviewers = User::where('id', '!=', $user->id)->limit(3)->get();
        $sampleRatings = [5, 5, 4];
        foreach ($reviewers as $i => $reviewer) {
            ShopReview::updateOrCreate(
                ['shop_id' => $shop->id, 'user_id' => $reviewer->id],
                ['rating' => $sampleRatings[$i] ?? 5, 'comment' => 'Great quality, fast shipping!']
            );
        }

        $this->command?->info("Shop seeded for @{$user->username} (shop_id={$shop->id}).");
    }
}
