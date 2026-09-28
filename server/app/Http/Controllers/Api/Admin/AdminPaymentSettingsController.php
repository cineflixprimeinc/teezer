<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\AdminCoinSetting;
use App\Services\PayPalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

class AdminPaymentSettingsController extends Controller
{
    private const SECRET_MASK = '••••••••';

    /* ────────────────────────────────────────────────────────────────────────
       GET /v1/admin/payment-settings
    ──────────────────────────────────────────────────────────────────────── */
    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => [
                'paypal' => [
                    'enabled'        => (bool)   AdminCoinSetting::getValue('paypal_enabled', 1),
                    'mode'           => (string) (AdminCoinSetting::getValue('paypal_mode') ?: 'sandbox'),
                    'client_id'      => (string) (AdminCoinSetting::getValue('paypal_client_id') ?: ''),
                    // Never expose the secret - return masked placeholder if set
                    'client_secret'  => AdminCoinSetting::getValue('paypal_client_secret') ? self::SECRET_MASK : '',
                    'secret_is_set'  => (bool)   AdminCoinSetting::getValue('paypal_client_secret'),
                ],
                'stripe' => [
                    'enabled'            => (bool)   AdminCoinSetting::getValue('stripe_enabled', 1),
                    'mode'               => (string) (AdminCoinSetting::getValue('stripe_mode') ?: 'test'),
                    'publishable_key'    => (string) (AdminCoinSetting::getValue('stripe_publishable_key') ?: ''),
                    'secret_key'         => AdminCoinSetting::getValue('stripe_secret_key') ? self::SECRET_MASK : '',
                    'secret_key_is_set'  => (bool)   AdminCoinSetting::getValue('stripe_secret_key'),
                    'webhook_secret'     => AdminCoinSetting::getValue('stripe_webhook_secret') ? self::SECRET_MASK : '',
                    'webhook_is_set'     => (bool)   AdminCoinSetting::getValue('stripe_webhook_secret'),
                ],
                'razorpay' => [
                    'enabled'       => (bool)   AdminCoinSetting::getValue('razorpay_enabled', 1),
                    'key_id'        => (string) (AdminCoinSetting::getValue('razorpay_key_id') ?: ''),
                    'key_secret'    => AdminCoinSetting::getValue('razorpay_key_secret') ? self::SECRET_MASK : '',
                    'secret_is_set' => (bool)   AdminCoinSetting::getValue('razorpay_key_secret'),
                ],

                /*
                 * Apps - Apple In-App Purchase and Google Play Billing.
                 *
                 * Both stores REQUIRE their own billing for digital goods, and a
                 * verification badge is digital goods. Card/PayPal are for the website;
                 * these are for the apps, and they are not interchangeable.
                 *
                 * The product ids must match what was created in App Store Connect and the
                 * Play Console exactly - hence they are configured here rather than
                 * hard-coded, since whoever set up the store chose the names.
                 */
                'apple_iap' => [
                    'enabled'           => (bool)   AdminCoinSetting::getValue('apple_iap_enabled', 0),
                    'bundle_id'         => (string) (AdminCoinSetting::getValue('apple_bundle_id') ?: ''),
                    'shared_secret'     => AdminCoinSetting::getValue('apple_shared_secret') ? self::SECRET_MASK : '',
                    'secret_is_set'     => (bool)   AdminCoinSetting::getValue('apple_shared_secret'),
                    'product_basic'     => (string) (AdminCoinSetting::getValue('apple_product_basic') ?: ''),
                    'product_plus'      => (string) (AdminCoinSetting::getValue('apple_product_plus') ?: ''),
                    'product_business'  => (string) (AdminCoinSetting::getValue('apple_product_business') ?: ''),
                    // Coins are sold through IAP separately from the verification badge:
                    // Apple requires StoreKit for digital content, so the iOS app cannot use
                    // the card / PayPal / UPI / bank checkout that serves the web. Per-pack
                    // product ids live on coin_packages.ios_product_id.
                    'coins_enabled'     => (bool)   AdminCoinSetting::getValue('apple_coin_iap_enabled', 0),
                    'coin_products_set' => (int)    \App\Models\CoinPackage::whereNotNull('ios_product_id')->count(),
                ],
                'google_iap' => [
                    'enabled'           => (bool)   AdminCoinSetting::getValue('google_iap_enabled', 0),
                    'package_name'      => (string) (AdminCoinSetting::getValue('google_package_name') ?: ''),
                    'service_account'   => AdminCoinSetting::getValue('google_service_account_json') ? self::SECRET_MASK : '',
                    'service_account_is_set' => (bool) AdminCoinSetting::getValue('google_service_account_json'),
                    'product_basic'     => (string) (AdminCoinSetting::getValue('google_product_basic') ?: ''),
                    'product_plus'      => (string) (AdminCoinSetting::getValue('google_product_plus') ?: ''),
                    'product_business'  => (string) (AdminCoinSetting::getValue('google_product_business') ?: ''),
                ],
                'bank' => [
                    'enabled'        => (bool)   AdminCoinSetting::getValue('bank_enabled', 1),
                    'account_holder' => (string) (AdminCoinSetting::getValue('bank_account_holder') ?: ''),
                    'bank_name'      => (string) (AdminCoinSetting::getValue('bank_name') ?: ''),
                    'account_number' => (string) (AdminCoinSetting::getValue('bank_account_number') ?: ''),
                    'routing_number' => (string) (AdminCoinSetting::getValue('bank_routing_number') ?: ''),
                    'swift_code'     => (string) (AdminCoinSetting::getValue('bank_swift_code') ?: ''),
                    'instructions'   => (string) (AdminCoinSetting::getValue('bank_enabled_instructions') ?: ''),
                ],
                'pricing' => [
                    'subscription_monthly' => (float) AdminCoinSetting::getValue('subscription_monthly_price', 4.99),
                    'subscription_annual'  => (float) AdminCoinSetting::getValue('subscription_annual_price', 39.99),
                    'badge_price'          => (float) AdminCoinSetting::getValue('badge_price', 9.99),
                ],
                'methods' => [
                    'card'      => (bool) AdminCoinSetting::getValue('card_enabled', 1),
                    'paypal'    => (bool) AdminCoinSetting::getValue('paypal_enabled', 1),
                    'applepay'  => (bool) AdminCoinSetting::getValue('applepay_enabled', 1),
                    'googlepay' => (bool) AdminCoinSetting::getValue('googlepay_enabled', 1),
                    'upi'       => (bool) AdminCoinSetting::getValue('upi_enabled', 1),
                    'bank'      => (bool) AdminCoinSetting::getValue('bank_enabled', 1),
                ],
                'coins' => [
                    'commission_rate'    => (float) AdminCoinSetting::getValue('commission_rate', 30),
                    'min_withdrawal_usd' => (float) AdminCoinSetting::getValue('min_withdrawal_usd', 10),
                    'coin_usd_rate'      => (int)   AdminCoinSetting::getValue('coin_usd_rate', 100),
                ],
            ],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/admin/payment-settings
       Accepts a flat key→value map. Unknown keys are ignored.
    ──────────────────────────────────────────────────────────────────────── */
    public function update(Request $request): JsonResponse
    {
        $request->validate([
            // PayPal
            'paypal_mode'          => ['sometimes', 'nullable', Rule::in(['sandbox', 'live'])],
            'paypal_client_id'     => ['sometimes', 'nullable', 'string', 'max:500'],
            'paypal_client_secret' => ['sometimes', 'nullable', 'string', 'max:500'],
            'paypal_enabled'       => ['sometimes', 'boolean'],
            // Stripe
            'stripe_enabled'           => ['sometimes', 'boolean'],
            'stripe_mode'              => ['sometimes', 'nullable', Rule::in(['test', 'live'])],
            'stripe_publishable_key'   => ['sometimes', 'nullable', 'string', 'max:500'],
            'stripe_secret_key'        => ['sometimes', 'nullable', 'string', 'max:500'],
            'stripe_webhook_secret'    => ['sometimes', 'nullable', 'string', 'max:500'],
            // Razorpay
            'razorpay_enabled'   => ['sometimes', 'boolean'],
            'razorpay_key_id'    => ['sometimes', 'nullable', 'string', 'max:500'],
            'razorpay_key_secret'=> ['sometimes', 'nullable', 'string', 'max:500'],
            // Apps - Apple IAP
            'apple_iap_enabled'      => ['sometimes', 'boolean'],
            'apple_coin_iap_enabled' => ['sometimes', 'boolean'],
            'google_coin_iap_enabled'=> ['sometimes', 'boolean'],
            'apple_bundle_id'        => ['sometimes', 'nullable', 'string', 'max:255'],
            'apple_shared_secret'    => ['sometimes', 'nullable', 'string', 'max:500'],
            'apple_product_basic'    => ['sometimes', 'nullable', 'string', 'max:255'],
            'apple_product_plus'     => ['sometimes', 'nullable', 'string', 'max:255'],
            'apple_product_business' => ['sometimes', 'nullable', 'string', 'max:255'],
            // Apps - Google Play Billing. The service account JSON is a whole file, hence
            // the generous limit.
            'google_iap_enabled'          => ['sometimes', 'boolean'],
            'google_package_name'         => ['sometimes', 'nullable', 'string', 'max:255'],
            'google_service_account_json' => ['sometimes', 'nullable', 'string', 'max:8000'],
            'google_product_basic'        => ['sometimes', 'nullable', 'string', 'max:255'],
            'google_product_plus'         => ['sometimes', 'nullable', 'string', 'max:255'],
            'google_product_business'     => ['sometimes', 'nullable', 'string', 'max:255'],
            // Bank
            'bank_enabled'              => ['sometimes', 'boolean'],
            'bank_name'                 => ['sometimes', 'nullable', 'string', 'max:255'],
            'bank_account_holder'       => ['sometimes', 'nullable', 'string', 'max:255'],
            'bank_account_number'       => ['sometimes', 'nullable', 'string', 'max:255'],
            'bank_routing_number'       => ['sometimes', 'nullable', 'string', 'max:255'],
            'bank_swift_code'           => ['sometimes', 'nullable', 'string', 'max:50'],
            'bank_enabled_instructions' => ['sometimes', 'nullable', 'string', 'max:2000'],
            // Pricing
            'subscription_monthly_price'=> ['sometimes', 'nullable', 'numeric', 'min:0'],
            'subscription_annual_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'badge_price'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            // Methods
            'card_enabled'     => ['sometimes', 'boolean'],
            'applepay_enabled' => ['sometimes', 'boolean'],
            'googlepay_enabled'=> ['sometimes', 'boolean'],
            'upi_enabled'      => ['sometimes', 'boolean'],
            // Coins
            'commission_rate'    => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'min_withdrawal_usd' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'coin_usd_rate'      => ['sometimes', 'nullable', 'numeric', 'min:1'],
        ]);

        $updatedKeys = [];

        $allowed = [
            // PayPal
            'paypal_mode', 'paypal_client_id', 'paypal_enabled',
            // Stripe (non-secret)
            'stripe_enabled', 'stripe_mode', 'stripe_publishable_key',
            // Razorpay (non-secret)
            'razorpay_enabled', 'razorpay_key_id',
            // Bank
            'bank_enabled', 'bank_name', 'bank_account_holder',
            'bank_account_number', 'bank_routing_number', 'bank_swift_code',
            'bank_enabled_instructions',
            // Pricing
            'subscription_monthly_price', 'subscription_annual_price', 'badge_price',
            // Methods
            'card_enabled', 'applepay_enabled', 'googlepay_enabled', 'upi_enabled',
            // Coins
            'commission_rate', 'min_withdrawal_usd', 'coin_usd_rate',
            // Apps - non-secret. The Apple shared secret and the Google service account
            // JSON are handled below, with the other secrets.
            'apple_iap_enabled', 'apple_bundle_id',
            'apple_product_basic', 'apple_product_plus', 'apple_product_business',
            'google_iap_enabled', 'google_package_name',
            'google_product_basic', 'google_product_plus', 'google_product_business',
            // Coin IAP - the switch that lets the apps sell coins through the stores.
            'apple_coin_iap_enabled', 'google_coin_iap_enabled',
        ];

        foreach ($allowed as $key) {
            if ($request->has($key)) {
                AdminCoinSetting::setValue($key, $request->input($key));
                $updatedKeys[] = $key;
            }
        }

        // Apps: the Apple shared secret and the Google service account JSON are secrets, so
        // they follow the same rule as every other secret here - a value equal to the mask
        // means the admin didn't touch the field, and must not overwrite the real one with
        // a row of dots.
        foreach (['apple_shared_secret', 'google_service_account_json'] as $key) {
            if ($request->has($key)) {
                $secret = (string) $request->input($key);
                if ($secret !== self::SECRET_MASK && $secret !== '') {
                    AdminCoinSetting::setValue($key, $secret);
                    $updatedKeys[] = $key;
                }
            }
        }

        // Handle secrets separately - skip if the value is the mask (user didn't change it)
        if ($request->has('paypal_client_secret')) {
            $secret = $request->input('paypal_client_secret');
            if ($secret !== self::SECRET_MASK && $secret !== '') {
                AdminCoinSetting::setValue('paypal_client_secret', $secret);
                $updatedKeys[] = 'paypal_client_secret';
                PayPalService::flushTokenCache();
            }
        }

        if ($request->has('stripe_secret_key')) {
            $secret = $request->input('stripe_secret_key');
            if ($secret !== self::SECRET_MASK && $secret !== '') {
                AdminCoinSetting::setValue('stripe_secret_key', $secret);
                $updatedKeys[] = 'stripe_secret_key';
            }
        }

        if ($request->has('stripe_webhook_secret')) {
            $secret = $request->input('stripe_webhook_secret');
            if ($secret !== self::SECRET_MASK && $secret !== '') {
                AdminCoinSetting::setValue('stripe_webhook_secret', $secret);
                $updatedKeys[] = 'stripe_webhook_secret';
            }
        }

        if ($request->has('razorpay_key_secret')) {
            $secret = $request->input('razorpay_key_secret');
            if ($secret !== self::SECRET_MASK && $secret !== '') {
                AdminCoinSetting::setValue('razorpay_key_secret', $secret);
                $updatedKeys[] = 'razorpay_key_secret';
            }
        }

        // Flush PayPal token cache on mode/id change
        if (array_intersect(['paypal_mode', 'paypal_client_id'], $updatedKeys)) {
            PayPalService::flushTokenCache();
        }

        if ($updatedKeys) {
            AdminActionLog::record(
                admin: $request->user(),
                action: 'update_payment_settings',
                target: null,
                description: 'Updated payment settings: ' . implode(', ', $updatedKeys),
                metadata: ['keys' => $updatedKeys],
            );
        }

        return response()->json(['success' => true, 'message' => 'Payment settings saved.']);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/admin/payment-settings/paypal/test
       Tests the stored PayPal credentials by hitting the token endpoint.
    ──────────────────────────────────────────────────────────────────────── */
    public function testPaypal(Request $request): JsonResponse
    {
        $service = app(PayPalService::class);
        $ok      = $service->testConnection();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'test_paypal_connection',
            target: null,
            description: $ok ? 'PayPal connection test: OK' : 'PayPal connection test: FAILED',
        );

        return response()->json([
            'success' => true,
            'data'    => [
                'connected' => $ok,
                'message'   => $ok
                    ? 'PayPal credentials are valid. Connection successful.'
                    : 'Could not authenticate with PayPal. Check Client ID and Client Secret.',
            ],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/admin/payment-settings/stripe/test
       Tests the stored Stripe credentials by retrieving the account balance.
    ──────────────────────────────────────────────────────────────────────── */
    public function testStripe(Request $request): JsonResponse
    {
        try {
            \Stripe\Stripe::setApiKey(
                AdminCoinSetting::getValue('stripe_secret_key') ?: ''
            );
            \Stripe\Balance::retrieve();

            AdminActionLog::record(
                admin: $request->user(),
                action: 'test_stripe_connection',
                target: null,
                description: 'Stripe connection test: OK',
            );

            return response()->json([
                'success' => true,
                'data'    => ['connected' => true, 'message' => 'Stripe credentials valid.'],
            ]);
        } catch (\Throwable $e) {
            AdminActionLog::record(
                admin: $request->user(),
                action: 'test_stripe_connection',
                target: null,
                description: 'Stripe connection test: FAILED - ' . $e->getMessage(),
            );

            return response()->json([
                'success' => true,
                'data'    => ['connected' => false, 'message' => 'Stripe error: ' . $e->getMessage()],
            ]);
        }
    }
}
