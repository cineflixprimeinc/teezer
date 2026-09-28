<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The "affiliate" monetization programme (label "Affiliate Shop": "Earn
 * commissions by promoting products", unlocks "Product Tagging, Affiliate
 * Commission, Sales Analytics") was seeded as a coming_soon placeholder for
 * exactly the idea Teezer Shop later became - and then Shop was built as
 * its own real feature (shops/products/seller_applications tables, its own
 * admin section under /shop) without this placeholder ever being touched or
 * removed. Repurposing it rather than adding a 6th row: the `key` stays
 * `affiliate` (clients and the admin URL look programmes up by key, never
 * by id or label - see this table's own creation migration), only what an
 * admin already edits through the Monetization Control Center changes.
 *
 * `mode` moves to `enabled`: unlike the other four placeholders, Shop is a
 * real, live feature today, not a future one.
 *
 * `sort_order` moves to 2 (just below Gifts & Coins) - the other three
 * placeholders shift down by one to keep a single, gap-free ordering.
 *
 * `requirements` becomes just `followers` (1000) and `guidelines` - the
 * BASELINE list (age18, account age, etc. - see MonetizationProgram::
 * BASELINE) is merged in automatically for every programme, so it does not
 * need repeating here; that merge is also what makes "Be at least 18 years
 * old" appear without this programme asking for it directly.
 *
 * This is purely a config/display change - see
 * SellerApplicationController::show() for where it's read, and note it does
 * NOT gate application submission. Teezer Shop's application review stays
 * exactly what it already is: a human reviewing each application in
 * /shop/applications, same as before this migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('monetization_programs')) {
            return;
        }

        DB::table('monetization_programs')->where('key', 'affiliate')->update([
            'label'        => 'Sell on Teezer',
            'description'  => 'List and sell your own products directly to your audience - a marketplace built into the app.',
            'mode'         => 'enabled',
            'sort_order'   => 2,
            'requirements' => json_encode([
                ['key' => 'followers',  'label' => 'Followers',            'target' => 1000],
                ['key' => 'guidelines', 'label' => 'No active violations', 'target' => null],
            ]),
            'unlocks'    => json_encode(['Teezer Shop', 'Product Listings', 'Shop Analytics']),
            'updated_at' => now(),
        ]);

        DB::table('monetization_programs')->where('key', 'rewards')->update(['sort_order' => 3, 'updated_at' => now()]);
        DB::table('monetization_programs')->where('key', 'subscriptions')->update(['sort_order' => 4, 'updated_at' => now()]);
        DB::table('monetization_programs')->where('key', 'marketplace')->update(['sort_order' => 5, 'updated_at' => now()]);

        Cache::forget('monetization_programs:all');
    }

    public function down(): void
    {
        if (! Schema::hasTable('monetization_programs')) {
            return;
        }

        DB::table('monetization_programs')->where('key', 'affiliate')->update([
            'label'        => 'Affiliate Shop',
            'description'  => 'Earn commissions by promoting products.',
            'mode'         => 'coming_soon',
            'sort_order'   => 5,
            'requirements' => json_encode([
                ['key' => 'followers',  'label' => 'Followers',            'target' => 500],
                ['key' => 'identity',   'label' => 'Identity verified',    'target' => null],
                ['key' => 'guidelines', 'label' => 'No active violations', 'target' => null],
            ]),
            'unlocks'    => json_encode(['Product Tagging', 'Affiliate Commission', 'Sales Analytics']),
            'updated_at' => now(),
        ]);

        DB::table('monetization_programs')->where('key', 'rewards')->update(['sort_order' => 2, 'updated_at' => now()]);
        DB::table('monetization_programs')->where('key', 'subscriptions')->update(['sort_order' => 3, 'updated_at' => now()]);
        DB::table('monetization_programs')->where('key', 'marketplace')->update(['sort_order' => 4, 'updated_at' => now()]);

        Cache::forget('monetization_programs:all');
    }
};
