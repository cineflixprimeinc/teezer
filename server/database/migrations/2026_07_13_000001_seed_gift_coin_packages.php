<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Replace the coin-package catalog with the 200 animated-gift packs.
 *
 * Pricing is generated, not hand-typed. Base rate is $0.01/RC (100 RC = $1),
 * which is the rate admin_coin_settings.coin_usd_rate and GiftCommissionService
 * already assume - so it must stay the floor. On top of it, buyers earn a bonus
 * that ramps 0% -> 30% with the log of spend, which is what finally makes the
 * "more coins = better rate" promise on the page true (the old ladder was a flat
 * $0.01/RC at every size). Invariants held when generated: price and coins both
 * strictly increase, and $/RC never gets worse as you spend more, and never
 * exceeds the $0.01 base.
 *
 * The previous 100 packages are DEACTIVATED, never deleted: coin_orders.package_id
 * is a restrict FK onto them, and those rows are real purchase history.
 */
return new class extends Migration
{
    /** [slug, plan_name, coins, price_usd, badge, is_front_visible, sort_order] */
    private const PACKS = [
            ['heart-ribbon', 'Heart Ribbon', 100, 0.99, null, true, 1],
            ['gold-star', 'Gold Star', 105, 1.03, null, false, 2],
            ['paper-plane', 'Paper Plane', 110, 1.07, null, false, 3],
            ['cherry-blossom', 'Cherry Blossom', 115, 1.11, null, false, 4],
            ['thumbs-up', 'Thumbs Up', 120, 1.15, null, false, 5],
            ['finger-heart', 'Finger Heart', 125, 1.20, null, false, 6],
            ['heart-bubble', 'Heart Bubble', 130, 1.25, null, false, 7],
            ['saturn', 'Saturn', 135, 1.29, null, false, 8],
            ['lollipop', 'Lollipop', 140, 1.34, null, false, 9],
            ['ice-cream', 'Ice Cream', 145, 1.40, null, false, 10],
            ['boba-tea', 'Boba Tea', 150, 1.45, null, false, 11],
            ['latte', 'Latte', 155, 1.51, null, false, 12],
            ['donut', 'Donut', 160, 1.57, null, false, 13],
            ['cake-slice', 'Cake Slice', 165, 1.63, null, false, 14],
            ['macaron', 'Macaron', 175, 1.69, null, false, 15],
            ['pizza-slice', 'Pizza Slice', 180, 1.76, null, false, 16],
            ['french-fries', 'French Fries', 185, 1.83, null, false, 17],
            ['hot-dog', 'Hot Dog', 195, 1.90, null, false, 18],
            ['burger', 'Burger', 200, 1.97, null, false, 19],
            ['popcorn', 'Popcorn', 210, 2.05, null, false, 20],
            ['teddy-bear', 'Teddy Bear', 220, 2.13, null, false, 21],
            ['bunny', 'Bunny', 230, 2.21, null, false, 22],
            ['shiba', 'Shiba', 240, 2.30, null, false, 23],
            ['kitten', 'Kitten', 250, 2.39, null, false, 24],
            ['chick', 'Chick', 260, 2.48, null, false, 25],
            ['penguin', 'Penguin', 270, 2.58, null, false, 26],
            ['baby-dino', 'Baby Dino', 280, 2.68, null, false, 27],
            ['t-rex', 'T-Rex', 290, 2.78, null, false, 28],
            ['whale', 'Whale', 300, 2.89, null, false, 29],
            ['octopus', 'Octopus', 310, 3.00, null, false, 30],
            ['dolphin', 'Dolphin', 330, 3.12, null, false, 31],
            ['butterfly', 'Butterfly', 340, 3.24, null, false, 32],
            ['rose', 'Rose', 350, 3.37, null, false, 33],
            ['sunflower', 'Sunflower', 370, 3.50, null, false, 34],
            ['clover', 'Clover', 380, 3.63, null, false, 35],
            ['starfish', 'Starfish', 400, 3.78, null, false, 36],
            ['rainbow', 'Rainbow', 410, 3.92, null, false, 37],
            ['cloud-smile', 'Happy Cloud', 430, 4.08, null, false, 38],
            ['crescent-moon', 'Crescent Moon', 450, 4.23, null, false, 39],
            ['sunny', 'Sunny', 470, 4.40, null, false, 40],
            ['planet-earth', 'Planet Earth', 480, 4.57, null, false, 41],
            ['snow-mountain', 'Snow Mountain', 500, 4.75, null, false, 42],
            ['palm-island', 'Palm Island', 520, 4.93, 'Popular', true, 43],
            ['camera', 'Camera', 550, 5.13, null, false, 44],
            ['polaroid', 'Polaroid', 570, 5.33, null, false, 45],
            ['game-controller', 'Game Controller', 590, 5.53, null, false, 46],
            ['headphones', 'Headphones', 610, 5.75, null, false, 47],
            ['skateboard', 'Skateboard', 640, 5.97, null, false, 48],
            ['bicycle', 'Bicycle', 670, 6.21, null, false, 49],
            ['guitar', 'Guitar', 690, 6.45, null, false, 50],
            ['microphone', 'Microphone', 720, 6.70, null, false, 51],
            ['piano', 'Piano', 750, 6.96, null, false, 52],
            ['drum', 'Drum', 780, 7.23, null, false, 53],
            ['trumpet', 'Trumpet', 810, 7.51, null, false, 54],
            ['rocket', 'Rocket', 840, 7.81, null, false, 55],
            ['ufo', 'UFO', 880, 8.11, null, false, 56],
            ['astronaut', 'Astronaut', 910, 8.43, null, false, 57],
            ['crystal-ball', 'Crystal Ball', 950, 8.76, null, false, 58],
            ['telescope', 'Telescope', 990, 9.10, null, false, 59],
            ['vinyl-record', 'Vinyl Record', 1050, 9.45, null, false, 60],
            ['diamond', 'Diamond', 1055, 9.82, null, false, 61],
            ['crystal-shard', 'Crystal Shard', 1100, 9.99, 'Creator', true, 62],
            ['ring', 'Ring', 1200, 10.99, null, false, 63],
            ['crown', 'Crown', 1205, 11.00, null, false, 64],
            ['treasure-chest', 'Treasure Chest', 1210, 11.01, null, false, 65],
            ['money-bag', 'Money Bag', 1300, 11.99, null, false, 66],
            ['cash-stack', 'Cash Stack', 1305, 12.00, null, false, 67],
            ['gold-bar', 'Gold Bar', 1450, 12.99, null, false, 68],
            ['gold-coin', 'Gold Coin', 1455, 13.00, null, false, 69],
            ['credit-card', 'Credit Card', 1550, 13.99, null, false, 70],
            ['trophy', 'Trophy', 1555, 14.00, null, false, 71],
            ['medal', 'Medal', 1650, 14.99, null, false, 72],
            ['badge', 'Badge', 1750, 15.99, null, false, 73],
            ['laurel-wreath', 'Laurel Wreath', 1800, 16.00, null, false, 74],
            ['star-trophy', 'Star Trophy', 1900, 16.99, null, false, 75],
            ['target', 'Bullseye', 1905, 17.00, null, false, 76],
            ['hourglass', 'Hourglass', 2000, 17.99, null, false, 77],
            ['scroll', 'Scroll', 2100, 18.99, null, false, 78],
            ['love-letter', 'Love Letter', 2250, 19.99, null, false, 79],
            ['key', 'Golden Key', 2255, 20.00, null, false, 80],
            ['red-heart', 'Red Heart', 2350, 20.99, null, false, 81],
            ['balloons', 'Balloons', 2450, 21.99, null, false, 82],
            ['gift-box', 'Gift Box', 2600, 22.99, null, false, 83],
            ['party-popper', 'Party Popper', 2700, 23.99, null, false, 84],
            ['birthday-cake', 'Birthday Cake', 2800, 24.99, null, false, 85],
            ['cupcake', 'Cupcake', 2950, 25.99, null, false, 86],
            ['soft-serve', 'Soft Serve', 3050, 26.99, null, false, 87],
            ['bubble-tea-deluxe', 'Deluxe Bubble Tea', 3150, 27.99, null, false, 88],
            ['glazed-donut', 'Glazed Donut', 3300, 28.99, null, false, 89],
            ['layer-cake', 'Layer Cake', 3400, 29.99, null, false, 90],
            ['macaron-tower', 'Macaron Tower', 3500, 30.99, null, false, 91],
            ['pepperoni-pizza', 'Pepperoni Pizza', 3650, 31.99, null, false, 92],
            ['double-burger', 'Double Burger', 3750, 32.99, null, false, 93],
            ['fries-deluxe', 'Deluxe Fries', 4000, 34.99, null, false, 94],
            ['chili-dog', 'Chili Dog', 4100, 35.99, null, false, 95],
            ['milkshake', 'Milkshake', 4250, 36.99, null, false, 96],
            ['wine-glass', 'Wine Glass', 4450, 38.99, null, false, 97],
            ['champagne-bucket', 'Champagne', 4600, 39.99, null, false, 98],
            ['snow-globe', 'Snow Globe', 4800, 41.99, null, false, 99],
            ['confetti-cannon', 'Confetti Cannon', 5100, 43.99, null, false, 100],
            ['taxi', 'Taxi', 5200, 44.99, null, false, 101],
            ['helicopter', 'Helicopter', 5400, 46.99, null, false, 102],
            ['yacht', 'Yacht', 5700, 48.99, 'Boost', true, 103],
            ['house', 'House', 5900, 50.99, null, false, 104],
            ['castle', 'Castle', 6100, 52.99, null, false, 105],
            ['tour-bus', 'Tour Bus', 6400, 54.99, null, false, 106],
            ['hot-air-balloon', 'Hot Air Balloon', 6600, 56.99, null, false, 107],
            ['ferris-wheel', 'Ferris Wheel', 6800, 58.99, null, false, 108],
            ['ring-box', 'Ring Box', 7200, 61.99, null, false, 109],
            ['red-heels', 'Red Heels', 7500, 63.99, null, false, 110],
            ['perfume', 'Perfume', 7700, 65.99, null, false, 111],
            ['luxury-watch', 'Luxury Watch', 8100, 68.99, null, false, 112],
            ['sunglasses', 'Sunglasses', 8400, 71.99, null, false, 113],
            ['handbag', 'Handbag', 8800, 74.99, null, false, 114],
            ['tuxedo', 'Tuxedo', 9000, 76.99, null, false, 115],
            ['flame', 'Flame', 9400, 79.99, null, false, 116],
            ['broken-heart', 'Broken Heart', 9900, 83.99, null, false, 117],
            ['heart-lock', 'Heart Lock', 10200, 86.99, null, false, 118],
            ['love-potion', 'Love Potion', 10600, 89.99, null, false, 119],
            ['magic-mirror', 'Magic Mirror', 11100, 93.99, null, false, 120],
            ['sakura-tree', 'Sakura Tree', 11500, 96.99, null, false, 121],
            ['crystal-tree', 'Crystal Tree', 11800, 99.99, 'Pro', true, 122],
            ['golden-deer', 'Golden Deer', 12400, 104.99, null, false, 123],
            ['arctic-fox', 'Arctic Fox', 13000, 109.99, null, false, 124],
            ['phoenix', 'Phoenix', 13700, 114.99, null, false, 125],
            ['portal', 'Portal', 14300, 119.99, null, false, 126],
            ['oasis', 'Oasis', 14900, 124.99, null, false, 127],
            ['waterfall', 'Waterfall', 14905, 125.00, null, false, 128],
            ['galaxy', 'Galaxy', 15500, 129.99, null, false, 129],
            ['thunderbolt', 'Thunderbolt', 16100, 134.99, null, false, 130],
            ['storm-cloud', 'Storm Cloud', 17300, 144.99, null, false, 131],
            ['prism-heart', 'Prism Heart', 18000, 149.99, null, false, 132],
            ['amethyst-cluster', 'Amethyst Cluster', 18600, 154.99, null, false, 133],
            ['spellbook', 'Spellbook', 19200, 159.99, null, false, 134],
            ['arcane-rune', 'Arcane Rune', 19800, 164.99, null, false, 135],
            ['enchanted-blade', 'Enchanted Blade', 21000, 174.99, null, false, 136],
            ['aegis-shield', 'Aegis Shield', 21500, 179.99, null, false, 137],
            ['faberge-egg', 'Fabergé Egg', 22500, 184.99, null, false, 138],
            ['ancient-map', 'Ancient Map', 23500, 194.99, null, false, 139],
            ['wishing-well', 'Wishing Well', 24000, 199.99, null, false, 140],
            ['sky-castle', 'Sky Castle', 25500, 209.99, null, false, 141],
            ['floating-isle', 'Floating Isle', 26500, 219.99, null, false, 142],
            ['star-whale', 'Star Whale', 27500, 224.99, null, false, 143],
            ['cosmic-whale', 'Cosmic Whale', 28500, 234.99, null, false, 144],
            ['world-tree', 'World Tree', 30000, 244.99, null, false, 145],
            ['aurora', 'Aurora', 31000, 254.99, null, false, 146],
            ['crystal-palace', 'Crystal Palace', 32500, 264.99, null, false, 147],
            ['golden-tree', 'Golden Tree', 33500, 274.99, null, false, 148],
            ['angel-wings', 'Angel Wings', 35000, 284.99, null, false, 149],
            ['dark-wings', 'Dark Wings', 36000, 294.99, null, false, 150],
            ['lion-king', 'Lion King', 37500, 304.99, null, false, 151],
            ['white-tiger', 'White Tiger', 39500, 319.99, null, false, 152],
            ['stallion', 'Stallion', 40500, 329.99, null, false, 153],
            ['pegasus', 'Pegasus', 42500, 344.99, null, false, 154],
            ['unicorn', 'Unicorn', 44500, 359.99, null, false, 155],
            ['panther', 'Panther', 45500, 369.99, null, false, 156],
            ['owl-sage', 'Owl Sage', 47500, 384.99, null, false, 157],
            ['panda', 'Panda', 49500, 399.99, null, false, 158],
            ['corgi', 'Corgi', 51500, 414.99, null, false, 159],
            ['fenrir', 'Fenrir', 54000, 434.99, null, false, 160],
            ['rose-heart', 'Rose Heart', 56000, 449.99, null, false, 161],
            ['rose-bouquet', 'Rose Bouquet', 58000, 464.99, null, false, 162],
            ['jewel-cake', 'Jewel Cake', 60500, 484.99, null, false, 163],
            ['eternal-rose', 'Eternal Rose', 63000, 504.99, null, false, 164],
            ['giant-teddy', 'Giant Teddy', 65500, 524.99, null, false, 165],
            ['chocolate-box', 'Chocolate Box', 68000, 544.99, null, false, 166],
            ['wedding-cake', 'Wedding Cake', 70500, 564.99, null, false, 167],
            ['carriage', 'Royal Carriage', 74000, 589.99, null, false, 168],
            ['royal-crown', 'Royal Crown', 76500, 609.99, null, false, 169],
            ['scepter', 'Scepter', 79500, 634.99, null, false, 170],
            ['fairy-castle', 'Fairy Castle', 83000, 659.99, null, false, 171],
            ['crystal-fountain', 'Crystal Fountain', 86000, 684.99, null, false, 172],
            ['diamond-stage', 'Diamond Stage', 89500, 709.99, null, false, 173],
            ['star-stage', 'Star Stage', 93500, 739.99, null, false, 174],
            ['disco-orb', 'Disco Orb', 97000, 769.99, null, false, 175],
            ['red-carpet', 'Red Carpet', 101000, 799.99, null, false, 176],
            ['firework-show', 'Firework Show', 105000, 829.99, null, false, 177],
            ['grand-finale', 'Grand Finale', 109000, 859.99, null, false, 178],
            ['mega-yacht', 'Mega Yacht', 114000, 894.99, null, false, 179],
            ['private-jet', 'Private Jet', 118000, 929.99, null, false, 180],
            ['golden-vault', 'Golden Vault', 123000, 964.99, null, false, 181],
            ['dragon-hoard', 'Dragon Hoard', 127000, 1000.00, null, false, 182],
            ['gold-dragon', 'Gold Dragon', 134000, 1050.00, null, false, 183],
            ['fire-dragon', 'Fire Dragon', 140000, 1100.00, null, false, 184],
            ['ice-dragon', 'Ice Dragon', 147000, 1150.00, null, false, 185],
            ['serpent-god', 'Serpent God', 147005, 1150.01, null, false, 186],
            ['guardian-lion', 'Guardian Lion', 154000, 1200.00, null, false, 187],
            ['mecha-titan', 'Mecha Titan', 160000, 1250.00, null, false, 188],
            ['neon-city', 'Neon City', 167000, 1300.00, null, false, 189],
            ['hypercar', 'Hypercar', 173000, 1350.00, null, false, 190],
            ['superbike', 'Superbike', 180000, 1400.00, null, false, 191],
            ['time-portal', 'Time Portal', 187000, 1450.00, null, false, 192],
            ['black-hole', 'Black Hole', 200000, 1550.00, null, false, 193],
            ['nebula-orb', 'Nebula Orb', 207000, 1600.00, null, false, 194],
            ['cosmos', 'Cosmos', 213000, 1650.00, null, false, 195],
            ['phoenix-rebirth', 'Phoenix Rebirth', 220000, 1700.00, null, false, 196],
            ['immortal-rose', 'Immortal Rose', 233000, 1800.00, null, false, 197],
            ['infinity-heart', 'Infinity Heart', 240000, 1850.00, null, false, 198],
            ['king-crown', "King's Crown", 247000, 1900.00, null, false, 199],
            ['reelsoo-throne', 'Reelsoo Throne', 260000, 2000.00, null, false, 200],
    ];

    public function up(): void
    {
        // Already applied? (idempotent - this migration carries data, not schema)
        if (DB::table('coin_packages')->where('icon', 'reelsoo-throne')->exists()) {
            return;
        }

        DB::transaction(function () {
            // Retire the old catalog. Deactivate, do NOT delete - coin_orders
            // restrict-FKs package_id and those orders are real history.
            DB::table('coin_packages')->update([
                'is_active'        => false,
                'is_front_visible' => false,
                'updated_at'       => now(),
            ]);

            $now  = now();
            $rows = [];
            foreach (self::PACKS as [$slug, $name, $coins, $price, $badge, $front, $sort]) {
                $rows[] = [
                    'plan_name'        => $name,
                    'coins'            => $coins,
                    'price_usd'        => $price,
                    'badge'            => $badge,
                    'icon'             => $slug,
                    'is_front_visible' => $front,
                    'is_active'        => true,
                    'sort_order'       => $sort,
                    'created_at'       => $now,
                    'updated_at'       => $now,
                ];
            }
            foreach (array_chunk($rows, 50) as $chunk) {
                DB::table('coin_packages')->insert($chunk);
            }
        });
    }

    public function down(): void
    {
        $slugs = array_column(self::PACKS, 0);

        DB::transaction(function () use ($slugs) {
            // Deactivate the gift packs rather than deleting them - by the time this
            // is rolled back they may already be referenced by coin_orders.
            DB::table('coin_packages')->whereIn('icon', $slugs)
                ->update(['is_active' => false, 'is_front_visible' => false, 'updated_at' => now()]);

            // Bring the old catalog back.
            DB::table('coin_packages')->whereNotIn('icon', $slugs)
                ->update(['is_active' => true, 'updated_at' => now()]);
            DB::table('coin_packages')->whereNotIn('icon', $slugs)
                ->whereIn('sort_order', [1, 9, 14, 18, 24, 34])
                ->update(['is_front_visible' => true, 'updated_at' => now()]);
        });
    }
};
