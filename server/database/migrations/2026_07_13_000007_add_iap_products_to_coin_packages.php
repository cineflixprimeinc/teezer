<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Store product ids for coin packages, so coins can be sold through Apple IAP.
 *
 * Apple requires In-App Purchase for digital content (App Store Review Guideline 3.1.1).
 * Coins are digital content, so the card / PayPal / UPI / bank checkout that serves the
 * WEB cannot be used inside the iOS app - that is a rejection, not a shortcut. Apple Pay
 * is not an escape hatch either: it is for physical goods and services.
 *
 * A product id may be set per package. Packages without one are simply not offered in the
 * app - which is what lets us ship with a handful of coin products in App Store Connect
 * instead of registering all 200 on day one.
 *
 * Unique, because two packages sharing a product id would make crediting ambiguous: a
 * receipt would no longer say how many coins to grant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('coin_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('coin_packages', 'ios_product_id')) {
                $table->string('ios_product_id', 191)->nullable()->unique();
            }
            if (! Schema::hasColumn('coin_packages', 'android_product_id')) {
                $table->string('android_product_id', 191)->nullable()->unique();
            }
        });

        // Settings the admin panel edits (Settings › Payment Methods Settings). The Apple
        // keys themselves - bundle id and shared secret - already exist for verification
        // badges and are reused here; only the coin-specific switch is new.
        $now = now();
        foreach ([
            ['key' => 'apple_coin_iap_enabled', 'value' => '0', 'description' => 'Sell coins through Apple In-App Purchase (iOS)'],
            ['key' => 'google_coin_iap_enabled', 'value' => '0', 'description' => 'Sell coins through Google Play Billing (Android)'],
        ] as $row) {
            if (! DB::table('admin_coin_settings')->where('key', $row['key'])->exists()) {
                DB::table('admin_coin_settings')->insert($row + ['created_at' => $now, 'updated_at' => $now]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('coin_packages', function (Blueprint $table) {
            $table->dropColumn(['ios_product_id', 'android_product_id']);
        });

        DB::table('admin_coin_settings')
            ->whereIn('key', ['apple_coin_iap_enabled', 'google_coin_iap_enabled'])
            ->delete();
    }
};
