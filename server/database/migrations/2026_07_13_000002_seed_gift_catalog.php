<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Seed the 200 animated gifts into the `gifts` table, priced in USD.
 *
 * This reverses the premise of 2026_07_13_000001: those 200 icons were sold as
 * COIN PACKAGES (coins for dollars). They are gifts, not packs - you buy coins
 * from the coin store, then spend coins on a gift. So here the 200 move into
 * `gifts`, and coin_packages goes back to the old 100-pack ladder.
 *
 * coin_value is derived from the USD price at the $0.01/RC base rate that
 * admin_coin_settings.coin_usd_rate and GiftCommissionService already assume
 * ($0.19 -> 19 RC … $2,000 -> 200,000 RC). Pricing gifts ON that rate is what
 * stops a cheap gift from doubling as a cheap way to mint coins.
 *
 * Nothing is ever deleted: gift_transactions restrict-FKs gifts.id and
 * coin_orders restrict-FKs coin_packages.id - both are real history. The legacy
 * 5 gifts (Rose/Heart/Crown/Rocket/Universe) are deactivated, not dropped.
 */
return new class extends Migration
{
    /** [slug, name, coin_value, cash_value_usd, icon_url, sort_order] */
    private const GIFTS = [
            ['heart-ribbon', 'Heart Ribbon', 19, 0.19, '/gifts/001-heart-ribbon.svg', 1],
            ['gold-star', 'Gold Star', 23, 0.23, '/gifts/002-gold-star.svg', 2],
            ['paper-plane', 'Paper Plane', 29, 0.29, '/gifts/003-paper-plane.svg', 3],
            ['cherry-blossom', 'Cherry Blossom', 35, 0.35, '/gifts/004-cherry-blossom.svg', 4],
            ['thumbs-up', 'Thumbs Up', 39, 0.39, '/gifts/005-thumbs-up.svg', 5],
            ['finger-heart', 'Finger Heart', 45, 0.45, '/gifts/006-finger-heart.svg', 6],
            ['heart-bubble', 'Heart Bubble', 49, 0.49, '/gifts/007-heart-bubble.svg', 7],
            ['saturn', 'Saturn', 55, 0.55, '/gifts/008-saturn.svg', 8],
            ['lollipop', 'Lollipop', 59, 0.59, '/gifts/009-lollipop.svg', 9],
            ['ice-cream', 'Ice Cream', 69, 0.69, '/gifts/010-ice-cream.svg', 10],
            ['boba-tea', 'Boba Tea', 79, 0.79, '/gifts/011-boba-tea.svg', 11],
            ['latte', 'Latte', 79, 0.79, '/gifts/012-latte.svg', 12],
            ['donut', 'Donut', 99, 0.99, '/gifts/013-donut.svg', 13],
            ['cake-slice', 'Cake Slice', 99, 0.99, '/gifts/014-cake-slice.svg', 14],
            ['macaron', 'Macaron', 99, 0.99, '/gifts/015-macaron.svg', 15],
            ['pizza-slice', 'Pizza Slice', 99, 0.99, '/gifts/016-pizza-slice.svg', 16],
            ['french-fries', 'French Fries', 99, 0.99, '/gifts/017-french-fries.svg', 17],
            ['hot-dog', 'Hot Dog', 99, 0.99, '/gifts/018-hot-dog.svg', 18],
            ['burger', 'Burger', 99, 0.99, '/gifts/019-burger.svg', 19],
            ['popcorn', 'Popcorn', 99, 0.99, '/gifts/020-popcorn.svg', 20],
            ['teddy-bear', 'Teddy Bear', 119, 1.19, '/gifts/021-teddy-bear.svg', 21],
            ['bunny', 'Bunny', 129, 1.29, '/gifts/022-bunny.svg', 22],
            ['shiba', 'Shiba', 139, 1.39, '/gifts/023-shiba.svg', 23],
            ['kitten', 'Kitten', 149, 1.49, '/gifts/024-kitten.svg', 24],
            ['chick', 'Chick', 159, 1.59, '/gifts/025-chick.svg', 25],
            ['penguin', 'Penguin', 169, 1.69, '/gifts/026-penguin.svg', 26],
            ['baby-dino', 'Baby Dino', 179, 1.79, '/gifts/027-baby-dino.svg', 27],
            ['t-rex', 'T-Rex', 189, 1.89, '/gifts/028-t-rex.svg', 28],
            ['whale', 'Whale', 209, 2.09, '/gifts/029-whale.svg', 29],
            ['octopus', 'Octopus', 219, 2.19, '/gifts/030-octopus.svg', 30],
            ['dolphin', 'Dolphin', 219, 2.19, '/gifts/031-dolphin.svg', 31],
            ['butterfly', 'Butterfly', 229, 2.29, '/gifts/032-butterfly.svg', 32],
            ['rose', 'Rose', 239, 2.39, '/gifts/033-rose.svg', 33],
            ['sunflower', 'Sunflower', 249, 2.49, '/gifts/034-sunflower.svg', 34],
            ['clover', 'Clover', 259, 2.59, '/gifts/035-clover.svg', 35],
            ['starfish', 'Starfish', 279, 2.79, '/gifts/036-starfish.svg', 36],
            ['rainbow', 'Rainbow', 279, 2.79, '/gifts/037-rainbow.svg', 37],
            ['cloud-smile', 'Happy Cloud', 279, 2.79, '/gifts/038-cloud-smile.svg', 38],
            ['crescent-moon', 'Crescent Moon', 299, 2.99, '/gifts/039-crescent-moon.svg', 39],
            ['sunny', 'Sunny', 299, 2.99, '/gifts/040-sunny.svg', 40],
            ['planet-earth', 'Planet Earth', 349, 3.49, '/gifts/041-planet-earth.svg', 41],
            ['snow-mountain', 'Snow Mountain', 359, 3.59, '/gifts/042-snow-mountain.svg', 42],
            ['palm-island', 'Palm Island', 369, 3.69, '/gifts/043-palm-island.svg', 43],
            ['camera', 'Camera', 379, 3.79, '/gifts/044-camera.svg', 44],
            ['polaroid', 'Polaroid', 389, 3.89, '/gifts/045-polaroid.svg', 45],
            ['game-controller', 'Game Controller', 399, 3.99, '/gifts/046-game-controller.svg', 46],
            ['headphones', 'Headphones', 419, 4.19, '/gifts/047-headphones.svg', 47],
            ['skateboard', 'Skateboard', 429, 4.29, '/gifts/048-skateboard.svg', 48],
            ['bicycle', 'Bicycle', 439, 4.39, '/gifts/049-bicycle.svg', 49],
            ['guitar', 'Guitar', 439, 4.39, '/gifts/050-guitar.svg', 50],
            ['microphone', 'Microphone', 449, 4.49, '/gifts/051-microphone.svg', 51],
            ['piano', 'Piano', 469, 4.69, '/gifts/052-piano.svg', 52],
            ['drum', 'Drum', 479, 4.79, '/gifts/053-drum.svg', 53],
            ['trumpet', 'Trumpet', 489, 4.89, '/gifts/054-trumpet.svg', 54],
            ['rocket', 'Rocket', 499, 4.99, '/gifts/055-rocket.svg', 55],
            ['ufo', 'UFO', 519, 5.19, '/gifts/056-ufo.svg', 56],
            ['astronaut', 'Astronaut', 519, 5.19, '/gifts/057-astronaut.svg', 57],
            ['crystal-ball', 'Crystal Ball', 559, 5.59, '/gifts/058-crystal-ball.svg', 58],
            ['telescope', 'Telescope', 559, 5.59, '/gifts/059-telescope.svg', 59],
            ['vinyl-record', 'Vinyl Record', 599, 5.99, '/gifts/060-vinyl-record.svg', 60],
            ['diamond', 'Diamond', 699, 6.99, '/gifts/061-diamond.svg', 61],
            ['crystal-shard', 'Crystal Shard', 719, 7.19, '/gifts/062-crystal-shard.svg', 62],
            ['ring', 'Ring', 779, 7.79, '/gifts/063-ring.svg', 63],
            ['crown', 'Crown', 779, 7.79, '/gifts/064-crown.svg', 64],
            ['treasure-chest', 'Treasure Chest', 819, 8.19, '/gifts/065-treasure-chest.svg', 65],
            ['money-bag', 'Money Bag', 819, 8.19, '/gifts/066-money-bag.svg', 66],
            ['cash-stack', 'Cash Stack', 839, 8.39, '/gifts/067-cash-stack.svg', 67],
            ['gold-bar', 'Gold Bar', 859, 8.59, '/gifts/068-gold-bar.svg', 68],
            ['gold-coin', 'Gold Coin', 879, 8.79, '/gifts/069-gold-coin.svg', 69],
            ['credit-card', 'Credit Card', 819, 8.19, '/gifts/070-credit-card.svg', 70],
            ['trophy', 'Trophy', 939, 9.39, '/gifts/071-trophy.svg', 71],
            ['medal', 'Medal', 959, 9.59, '/gifts/072-medal.svg', 72],
            ['badge', 'Badge', 979, 9.79, '/gifts/073-badge.svg', 73],
            ['laurel-wreath', 'Laurel Wreath', 999, 9.99, '/gifts/074-laurel-wreath.svg', 74],
            ['star-trophy', 'Star Trophy', 999, 9.99, '/gifts/075-star-trophy.svg', 75],
            ['target', 'Bullseye', 999, 9.99, '/gifts/076-target.svg', 76],
            ['hourglass', 'Hourglass', 999, 9.99, '/gifts/077-hourglass.svg', 77],
            ['scroll', 'Scroll', 999, 9.99, '/gifts/078-scroll.svg', 78],
            ['love-letter', 'Love Letter', 999, 9.99, '/gifts/079-love-letter.svg', 79],
            ['key', 'Golden Key', 999, 9.99, '/gifts/080-key.svg', 80],
            ['red-heart', 'Red Heart', 1099, 10.99, '/gifts/081-red-heart.svg', 81],
            ['balloons', 'Balloons', 1139, 11.39, '/gifts/082-balloons.svg', 82],
            ['gift-box', 'Gift Box', 1159, 11.59, '/gifts/083-gift-box.svg', 83],
            ['party-popper', 'Party Popper', 1179, 11.79, '/gifts/084-party-popper.svg', 84],
            ['birthday-cake', 'Birthday Cake', 1119, 11.19, '/gifts/085-birthday-cake.svg', 85],
            ['cupcake', 'Cupcake', 1219, 12.19, '/gifts/086-cupcake.svg', 86],
            ['soft-serve', 'Soft Serve', 1239, 12.39, '/gifts/087-soft-serve.svg', 87],
            ['bubble-tea-deluxe', 'Deluxe Bubble Tea', 1299, 12.99, '/gifts/088-bubble-tea-deluxe.svg', 88],
            ['glazed-donut', 'Glazed Donut', 1219, 12.19, '/gifts/089-glazed-donut.svg', 89],
            ['layer-cake', 'Layer Cake', 1339, 13.39, '/gifts/090-layer-cake.svg', 90],
            ['macaron-tower', 'Macaron Tower', 1339, 13.39, '/gifts/091-macaron-tower.svg', 91],
            ['pepperoni-pizza', 'Pepperoni Pizza', 1379, 13.79, '/gifts/092-pepperoni-pizza.svg', 92],
            ['double-burger', 'Double Burger', 1359, 13.59, '/gifts/093-double-burger.svg', 93],
            ['fries-deluxe', 'Deluxe Fries', 1379, 13.79, '/gifts/094-fries-deluxe.svg', 94],
            ['chili-dog', 'Chili Dog', 1499, 14.99, '/gifts/095-chili-dog.svg', 95],
            ['milkshake', 'Milkshake', 1419, 14.19, '/gifts/096-milkshake.svg', 96],
            ['wine-glass', 'Wine Glass', 1469, 14.69, '/gifts/097-wine-glass.svg', 97],
            ['champagne-bucket', 'Champagne', 1499, 14.99, '/gifts/098-champagne-bucket.svg', 98],
            ['snow-globe', 'Snow Globe', 1499, 14.99, '/gifts/099-snow-globe.svg', 99],
            ['confetti-cannon', 'Confetti Cannon', 1499, 14.99, '/gifts/100-confetti-cannon.svg', 100],
            ['taxi', 'Taxi', 1599, 15.99, '/gifts/101-taxi.svg', 101],
            ['helicopter', 'Helicopter', 1649, 16.49, '/gifts/102-helicopter.svg', 102],
            ['yacht', 'Yacht', 1699, 16.99, '/gifts/103-yacht.svg', 103],
            ['house', 'House', 1749, 17.49, '/gifts/104-house.svg', 104],
            ['castle', 'Castle', 1749, 17.49, '/gifts/105-castle.svg', 105],
            ['tour-bus', 'Tour Bus', 1849, 18.49, '/gifts/106-tour-bus.svg', 106],
            ['hot-air-balloon', 'Hot Air Balloon', 1849, 18.49, '/gifts/107-hot-air-balloon.svg', 107],
            ['ferris-wheel', 'Ferris Wheel', 1999, 19.99, '/gifts/108-ferris-wheel.svg', 108],
            ['ring-box', 'Ring Box', 2099, 20.99, '/gifts/109-ring-box.svg', 109],
            ['red-heels', 'Red Heels', 2099, 20.99, '/gifts/110-red-heels.svg', 110],
            ['perfume', 'Perfume', 2099, 20.99, '/gifts/111-perfume.svg', 111],
            ['luxury-watch', 'Luxury Watch', 2149, 21.49, '/gifts/112-luxury-watch.svg', 112],
            ['sunglasses', 'Sunglasses', 2199, 21.99, '/gifts/113-sunglasses.svg', 113],
            ['handbag', 'Handbag', 2249, 22.49, '/gifts/114-handbag.svg', 114],
            ['tuxedo', 'Tuxedo', 2299, 22.99, '/gifts/115-tuxedo.svg', 115],
            ['flame', 'Flame', 2349, 23.49, '/gifts/116-flame.svg', 116],
            ['broken-heart', 'Broken Heart', 2399, 23.99, '/gifts/117-broken-heart.svg', 117],
            ['heart-lock', 'Heart Lock', 2449, 24.49, '/gifts/118-heart-lock.svg', 118],
            ['love-potion', 'Love Potion', 2499, 24.99, '/gifts/119-love-potion.svg', 119],
            ['magic-mirror', 'Magic Mirror', 2499, 24.99, '/gifts/120-magic-mirror.svg', 120],
            ['sakura-tree', 'Sakura Tree', 2599, 25.99, '/gifts/121-sakura-tree.svg', 121],
            ['crystal-tree', 'Crystal Tree', 2699, 26.99, '/gifts/122-crystal-tree.svg', 122],
            ['golden-deer', 'Golden Deer', 2799, 27.99, '/gifts/123-golden-deer.svg', 123],
            ['arctic-fox', 'Arctic Fox', 2899, 28.99, '/gifts/124-arctic-fox.svg', 124],
            ['phoenix', 'Phoenix', 2999, 29.99, '/gifts/125-phoenix.svg', 125],
            ['portal', 'Portal', 3099, 30.99, '/gifts/126-portal.svg', 126],
            ['oasis', 'Oasis', 3299, 32.99, '/gifts/127-oasis.svg', 127],
            ['waterfall', 'Waterfall', 3299, 32.99, '/gifts/128-waterfall.svg', 128],
            ['galaxy', 'Galaxy', 3399, 33.99, '/gifts/129-galaxy.svg', 129],
            ['thunderbolt', 'Thunderbolt', 3499, 34.99, '/gifts/130-thunderbolt.svg', 130],
            ['storm-cloud', 'Storm Cloud', 3599, 35.99, '/gifts/131-storm-cloud.svg', 131],
            ['prism-heart', 'Prism Heart', 3699, 36.99, '/gifts/132-prism-heart.svg', 132],
            ['amethyst-cluster', 'Amethyst Cluster', 3799, 37.99, '/gifts/133-amethyst-cluster.svg', 133],
            ['spellbook', 'Spellbook', 3999, 39.99, '/gifts/134-spellbook.svg', 134],
            ['arcane-rune', 'Arcane Rune', 3999, 39.99, '/gifts/135-arcane-rune.svg', 135],
            ['enchanted-blade', 'Enchanted Blade', 3999, 39.99, '/gifts/136-enchanted-blade.svg', 136],
            ['aegis-shield', 'Aegis Shield', 3999, 39.99, '/gifts/137-aegis-shield.svg', 137],
            ['faberge-egg', 'Fabergé Egg', 3999, 39.99, '/gifts/138-faberge-egg.svg', 138],
            ['ancient-map', 'Ancient Map', 3999, 39.99, '/gifts/139-ancient-map.svg', 139],
            ['wishing-well', 'Wishing Well', 3999, 39.99, '/gifts/140-wishing-well.svg', 140],
            ['sky-castle', 'Sky Castle', 4999, 49.99, '/gifts/141-sky-castle.svg', 141],
            ['floating-isle', 'Floating Isle', 5199, 51.99, '/gifts/142-floating-isle.svg', 142],
            ['star-whale', 'Star Whale', 5399, 53.99, '/gifts/143-star-whale.svg', 143],
            ['cosmic-whale', 'Cosmic Whale', 5599, 55.99, '/gifts/144-cosmic-whale.svg', 144],
            ['world-tree', 'World Tree', 5799, 57.99, '/gifts/145-world-tree.svg', 145],
            ['aurora', 'Aurora', 5999, 59.99, '/gifts/146-aurora.svg', 146],
            ['crystal-palace', 'Crystal Palace', 6199, 61.99, '/gifts/147-crystal-palace.svg', 147],
            ['golden-tree', 'Golden Tree', 6399, 63.99, '/gifts/148-golden-tree.svg', 148],
            ['angel-wings', 'Angel Wings', 6599, 65.99, '/gifts/149-angel-wings.svg', 149],
            ['dark-wings', 'Dark Wings', 6799, 67.99, '/gifts/150-dark-wings.svg', 150],
            ['lion-king', 'Lion King', 6999, 69.99, '/gifts/151-lion-king.svg', 151],
            ['white-tiger', 'White Tiger', 7199, 71.99, '/gifts/152-white-tiger.svg', 152],
            ['stallion', 'Stallion', 7599, 75.99, '/gifts/153-stallion.svg', 153],
            ['pegasus', 'Pegasus', 7799, 77.99, '/gifts/154-pegasus.svg', 154],
            ['unicorn', 'Unicorn', 7999, 79.99, '/gifts/155-unicorn.svg', 155],
            ['panther', 'Panther', 7999, 79.99, '/gifts/156-panther.svg', 156],
            ['owl-sage', 'Owl Sage', 7999, 79.99, '/gifts/157-owl-sage.svg', 157],
            ['panda', 'Panda', 7999, 79.99, '/gifts/158-panda.svg', 158],
            ['corgi', 'Corgi', 7999, 79.99, '/gifts/159-corgi.svg', 159],
            ['fenrir', 'Fenrir', 7999, 79.99, '/gifts/160-fenrir.svg', 160],
            ['rose-heart', 'Rose Heart', 9999, 99.99, '/gifts/161-rose-heart.svg', 161],
            ['rose-bouquet', 'Rose Bouquet', 10499, 104.99, '/gifts/162-rose-bouquet.svg', 162],
            ['jewel-cake', 'Jewel Cake', 10999, 109.99, '/gifts/163-jewel-cake.svg', 163],
            ['eternal-rose', 'Eternal Rose', 11499, 114.99, '/gifts/164-eternal-rose.svg', 164],
            ['giant-teddy', 'Giant Teddy', 12499, 124.99, '/gifts/165-giant-teddy.svg', 165],
            ['chocolate-box', 'Chocolate Box', 12499, 124.99, '/gifts/166-chocolate-box.svg', 166],
            ['wedding-cake', 'Wedding Cake', 12999, 129.99, '/gifts/167-wedding-cake.svg', 167],
            ['carriage', 'Royal Carriage', 13499, 134.99, '/gifts/168-carriage.svg', 168],
            ['royal-crown', 'Royal Crown', 13999, 139.99, '/gifts/169-royal-crown.svg', 169],
            ['scepter', 'Scepter', 14999, 149.99, '/gifts/170-scepter.svg', 170],
            ['fairy-castle', 'Fairy Castle', 14999, 149.99, '/gifts/171-fairy-castle.svg', 171],
            ['crystal-fountain', 'Crystal Fountain', 14999, 149.99, '/gifts/172-crystal-fountain.svg', 172],
            ['diamond-stage', 'Diamond Stage', 14999, 149.99, '/gifts/173-diamond-stage.svg', 173],
            ['star-stage', 'Star Stage', 14999, 149.99, '/gifts/174-star-stage.svg', 174],
            ['disco-orb', 'Disco Orb', 14999, 149.99, '/gifts/175-disco-orb.svg', 175],
            ['red-carpet', 'Red Carpet', 19999, 199.99, '/gifts/176-red-carpet.svg', 176],
            ['firework-show', 'Firework Show', 21999, 219.99, '/gifts/177-firework-show.svg', 177],
            ['grand-finale', 'Grand Finale', 23999, 239.99, '/gifts/178-grand-finale.svg', 178],
            ['mega-yacht', 'Mega Yacht', 23999, 239.99, '/gifts/179-mega-yacht.svg', 179],
            ['private-jet', 'Private Jet', 29999, 299.99, '/gifts/180-private-jet.svg', 180],
            ['golden-vault', 'Golden Vault', 39999, 399.99, '/gifts/181-golden-vault.svg', 181],
            ['dragon-hoard', 'Dragon Hoard', 41999, 419.99, '/gifts/182-dragon-hoard.svg', 182],
            ['gold-dragon', 'Gold Dragon', 43999, 439.99, '/gifts/183-gold-dragon.svg', 183],
            ['fire-dragon', 'Fire Dragon', 45999, 459.99, '/gifts/184-fire-dragon.svg', 184],
            ['ice-dragon', 'Ice Dragon', 47999, 479.99, '/gifts/185-ice-dragon.svg', 185],
            ['serpent-god', 'Serpent God', 49999, 499.99, '/gifts/186-serpent-god.svg', 186],
            ['guardian-lion', 'Guardian Lion', 51999, 519.99, '/gifts/187-guardian-lion.svg', 187],
            ['mecha-titan', 'Mecha Titan', 53999, 539.99, '/gifts/188-mecha-titan.svg', 188],
            ['neon-city', 'Neon City', 55999, 559.99, '/gifts/189-neon-city.svg', 189],
            ['hypercar', 'Hypercar', 57999, 579.99, '/gifts/190-hypercar.svg', 190],
            ['superbike', 'Superbike', 59999, 599.99, '/gifts/191-superbike.svg', 191],
            ['time-portal', 'Time Portal', 59999, 599.99, '/gifts/192-time-portal.svg', 192],
            ['black-hole', 'Black Hole', 69999, 699.99, '/gifts/193-black-hole.svg', 193],
            ['nebula-orb', 'Nebula Orb', 74999, 749.99, '/gifts/194-nebula-orb.svg', 194],
            ['cosmos', 'Cosmos', 84999, 849.99, '/gifts/195-cosmos.svg', 195],
            ['phoenix-rebirth', 'Phoenix Rebirth', 89999, 899.99, '/gifts/196-phoenix-rebirth.svg', 196],
            ['immortal-rose', 'Immortal Rose', 89999, 899.99, '/gifts/197-immortal-rose.svg', 197],
            ['infinity-heart', 'Infinity Heart', 89999, 899.99, '/gifts/198-infinity-heart.svg', 198],
            ['king-crown', "King's Crown", 159999, 1599.99, '/gifts/199-king-crown.svg', 199],
            ['teezer-throne', 'Teezer Throne', 200000, 2000.00, '/gifts/200-teezer-throne.svg', 200],
    ];

    public function up(): void
    {
        Schema::table('gifts', function (Blueprint $table) {
            if (! Schema::hasColumn('gifts', 'slug')) {
                $table->string('slug', 64)->nullable()->unique();
            }
            if (! Schema::hasColumn('gifts', 'sort_order')) {
                $table->unsignedSmallInteger('sort_order')->default(0)->index();
            }
            if (! Schema::hasColumn('gifts', 'is_active')) {
                $table->boolean('is_active')->default(true);
            }
        });

        DB::transaction(function () {
            // Legacy 5-gift catalog (Rose/Heart/Crown/Rocket/Universe): retire it.
            // Deactivate, never delete - gift_transactions.gift_id restrict-FKs these rows.
            DB::table('gifts')->whereNull('slug')->update(['is_active' => false]);

            foreach (self::GIFTS as [$slug, $name, $coins, $price, $icon, $sort]) {
                DB::table('gifts')->updateOrInsert(
                    ['slug' => $slug],
                    [
                        'name'       => $name,
                        'icon_url'   => $icon,
                        'coin_value' => $coins,
                        'cash_value' => $price,
                        'sort_order' => $sort,
                        'is_active'  => true,
                    ],
                );
            }

            // Hand the coin store back to the old 100-package ladder: the 200 icons
            // are gifts now, so they must not also be buyable coin packs.
            //
            // The legacy ladder is "icon IS NULL" - every gift-pack row stores its slug
            // in `icon`. Do NOT reach for whereNotIn('icon', $giftSlugs) here: the legacy
            // rows have a NULL icon, and `NULL NOT IN (...)` is UNKNOWN, not TRUE, so it
            // matches nothing and leaves the coin store with zero active packages.
            DB::table('coin_packages')->whereNotNull('icon')
                ->update(['is_active' => false, 'is_front_visible' => false, 'updated_at' => now()]);
            DB::table('coin_packages')->whereNull('icon')
                ->update(['is_active' => true, 'updated_at' => now()]);
            DB::table('coin_packages')->whereNull('icon')
                ->whereIn('sort_order', [1, 9, 14, 18, 24, 34])
                ->update(['is_front_visible' => true, 'updated_at' => now()]);
        });
    }

    public function down(): void
    {
        DB::transaction(function () {
            DB::table('gifts')->whereIn('slug', array_column(self::GIFTS, 0))->update(['is_active' => false]);
            DB::table('gifts')->whereNull('slug')->update(['is_active' => true]);
        });
    }
};
