<?php

use App\Models\AdminCoinSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Premium through the app stores.
 *
 * A subscription is digital content, so on a phone it MUST be sold by StoreKit /
 * Play Billing - a card checkout in-app is an App Store 3.1.1 rejection, and so
 * is linking out to the web for it. Until now the only way to buy Premium was the
 * web gateways, which means it could not be sold in the app at all.
 *
 * `iap_transaction_id` is the idempotency key. Apple keys a subscription on
 * `original_transaction_id`, which every renewal of the same subscription shares -
 * exactly the identity we want, so a replayed receipt cannot mint a second row.
 *
 * The product ids are settings rather than constants because they have to match
 * what was created in App Store Connect and the Play Console by hand, and those
 * are named by whoever set them up. They are namespaced `premium_*` to avoid
 * colliding with the verification badge plans, which already use `monthly` and
 * `annual` as plan keys against the same productIdFor() lookup.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->string('iap_transaction_id')->nullable()->after('currency');
            $table->string('iap_platform', 10)->nullable()->after('iap_transaction_id');
            $table->unique('iap_transaction_id');
        });

        $settings = [
            'apple_sub_iap_enabled'          => ['value' => '0',  'description' => 'Sell Premium through StoreKit on iOS'],
            'google_sub_iap_enabled'         => ['value' => '0',  'description' => 'Sell Premium through Play Billing on Android'],
            'apple_product_premium_monthly'  => ['value' => '',   'description' => 'App Store product id for Premium monthly'],
            'apple_product_premium_annual'   => ['value' => '',   'description' => 'App Store product id for Premium annual'],
            'google_product_premium_monthly' => ['value' => '',   'description' => 'Play product id for Premium monthly'],
            'google_product_premium_annual'  => ['value' => '',   'description' => 'Play product id for Premium annual'],
        ];

        foreach ($settings as $key => $row) {
            AdminCoinSetting::updateOrCreate(['key' => $key], $row);
        }
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropUnique(['iap_transaction_id']);
            $table->dropColumn(['iap_transaction_id', 'iap_platform']);
        });

        AdminCoinSetting::whereIn('key', [
            'apple_sub_iap_enabled', 'google_sub_iap_enabled',
            'apple_product_premium_monthly', 'apple_product_premium_annual',
            'google_product_premium_monthly', 'google_product_premium_annual',
        ])->delete();
    }
};
