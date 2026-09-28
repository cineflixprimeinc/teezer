<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AdminCoinSetting;
use App\Models\CoinOrder;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Services\IapService;
use App\Services\CouponService;
use App\Services\PlanAvailabilityService;
use App\Services\PayPalService;
use App\Services\PlanPricingService;
use App\Services\PremiumBonusService;
use App\Services\PricingService;
use App\Services\RazorpayService;
use App\Services\StripeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StudioSubscriptionController extends Controller
{
    /* ────────────────────────────────────────────────────────────────────────
       GET /v1/studio/subscriptions
       Returns the user's current active subscription (or null).
    ──────────────────────────────────────────────────────────────────────── */
    public function current(Request $request): JsonResponse
    {
        $sub = Subscription::where('user_id', $request->user()->id)
            ->where('status', 'active')
            ->where('expires_at', '>', now())
            ->latest()
            ->first();

        return response()->json([
            'success' => true,
            'data'    => $sub ? $this->formatSubscription($sub) : null,
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/subscriptions/intent
       Creates a pending order and returns payment data for the chosen method.
    ──────────────────────────────────────────────────────────────────────── */
    public function createIntent(Request $request): JsonResponse
    {
        $request->validate([
            'plan'           => ['required', Rule::in(['monthly', 'annual'])],
            'payment_method' => ['required', Rule::in(['card', 'paypal', 'upi', 'bank'])],
            /* Which tier. OPTIONAL, and deliberately so: the shipped clients
               send only `plan`, and those purchases must keep working exactly
               as they do today. When absent, the legacy flat price is used. */
            'plan_key'       => ['nullable', 'string', 'max:64'],
            // The CODE only. The discount it is worth is computed here, never
            // taken from the client - a coupon the frontend "already applied"
            // is still re-validated and re-priced server-side.
            'coupon_code'    => ['nullable', 'string', 'max:32'],
        ]);

        $user      = $request->user();
        $plan      = $request->plan;
        $method    = $request->payment_method;
        $reference = 'SUB-' . strtoupper(Str::random(12));

        /**
         * The amount is decided HERE, server-side, from the tier and the
         * server-detected country. Nothing about the price is read from the
         * request - a client sends which tier it wants, never what it costs.
         *
         * This closes a real gap: display read subscription_plans.base_price_usd
         * while this method charged a flat AdminCoinSetting value that knew
         * nothing about tiers, so Pro showed $12.99 and charged $4.99. Both now
         * go through PlanPricingService.
         */
        $planKey  = $request->input('plan_key');
        $tier     = $planKey ? SubscriptionPlan::where('key', $planKey)->where('is_enabled', true)->first() : null;
        $priceSrc = 'legacy_setting';

        if ($planKey && ! $tier) {
            return response()->json(['success' => false, 'message' => 'That plan is not available.'], 422);
        }

        if ($tier) {
            $pricing = app(PricingService::class);
            // Server-detected, never request-supplied: detectCountry prefers a
            // saved preference and Cloudflare's edge header over anything the
            // caller can set.
            $country  = $pricing->detectCountry($request);
            $currency = $pricing->currencyForCountry($country);
            $cycle    = $plan === 'annual' ? 'year' : 'month';

            /**
             * Availability is enforced HERE, not only on the page.
             *
             * /premium already returns can_purchase and a reason, but that is
             * presentation - it stops a button being drawn, not a request being
             * made. Without this check a caller in an excluded country could
             * POST straight to this endpoint and be charged for a plan they are
             * not allowed to buy, which is exactly the case "available in
             * selected countries" exists to prevent.
             *
             * The same resolver the page used, so the refusal and the reason
             * are identical on both sides rather than two rules that can drift.
             */
            $verdict = app(PlanAvailabilityService::class)->purchasable($tier, $user, [
                'platform' => $request->query('platform'),
                'country'  => $country,
            ]);

            if (! $verdict['ok']) {
                return response()->json([
                    'success' => false,
                    'message' => $verdict['message'] ?? 'This plan is not available to you.',
                    'reason'  => $verdict['reason'],
                ], 422);
            }

            $charge   = app(PlanPricingService::class)->chargeFor($tier, $country, $currency, $cycle);
            $price    = round($charge['usd'], 2);
            $priceSrc = $charge['source'];

            // A tier that resolves to nothing has no sellable price; charging 0
            // would hand out a subscription for free.
            if ($price <= 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'This plan has no price configured for your region yet.',
                ], 422);
            }
        } else {
            // Unchanged legacy path for clients that send no plan_key.
            $price = $plan === 'annual'
                ? (float) AdminCoinSetting::getValue('subscription_annual_price', 39.99)
                : (float) AdminCoinSetting::getValue('subscription_monthly_price', 4.99);
        }

        /**
         * Coupon. Validated and priced HERE so the amount charged is the
         * discounted one - showing a reduced total and charging full price
         * would be worse than not offering coupons at all.
         *
         * The code is stored on the order but NOT redeemed yet: redemption is
         * recorded when the payment actually succeeds, so an abandoned checkout
         * does not consume one of a limited coupon's uses.
         */
        $couponCode = $request->input('coupon_code');
        $discount = 0.0;

        if ($couponCode) {
            $check = app(CouponService::class)->validate($couponCode, $user, $tier?->key, $price, 'USD');
            if (! $check['ok']) {
                return response()->json(['success' => false, 'message' => $check['message']], 422);
            }
            $discount = (float) $check['discount'];
            // Never below zero, and never free by accident: a 100% coupon
            // lands on 0 and the payment providers reject a zero charge, so it
            // is floored at a cent rather than sent as 0.
            $price = max(0.01, round($price - $discount, 2));
        }

        $order = CoinOrder::create([
            'user_id'           => $user->id,
            'package_id'        => null,
            'coins'             => 0,
            'price_usd'         => $price,
            'currency'          => 'USD',
            'payment_method'    => $method === 'upi' ? 'upi' : $method,
            'payment_status'    => 'pending',
            'payment_reference' => $reference,
            // plan_key and price_source recorded on the order so a later
            // question about why someone was charged what they were has an
            // answer in the row itself, not in whatever the code did that day.
            'payment_meta'      => [
                'subscription_plan' => $plan,
                'type' => 'subscription',
                'plan_key' => $tier?->key,
                'price_source' => $priceSrc,
                'coupon_code' => $couponCode ? strtoupper($couponCode) : null,
                'coupon_discount' => $discount ?: null,
            ],
        ]);

        try {
            switch ($method) {
                case 'card':
                    $intent = app(StripeService::class)->createPaymentIntent(
                        $price, 'USD', $reference,
                        ['user_id' => (string) $user->id, 'order_id' => (string) $order->id, 'plan' => $plan]
                    );
                    $order->update([
                        'payment_reference' => $intent->id,
                        'payment_meta'      => array_merge($order->payment_meta ?? [], ['stripe_intent_id' => $intent->id]),
                    ]);
                    return response()->json([
                        'success' => true,
                        'data'    => [
                            'method'        => 'card',
                            'client_secret' => $intent->client_secret,
                            'order_id'      => $order->id,
                            'plan'          => $plan,
                            'price'         => $price,
                        ],
                    ], 201);

                case 'paypal':
                    $paypalOrderId = app(PayPalService::class)->createOrder(
                        $price, 'USD', $reference,
                        ucfirst($plan) . ' Subscription - Teezer',
                    );
                    $order->update([
                        'payment_meta' => array_merge($order->payment_meta ?? [], ['paypal_order_id' => $paypalOrderId]),
                    ]);
                    return response()->json([
                        'success' => true,
                        'data'    => [
                            'method'          => 'paypal',
                            'paypal_order_id' => $paypalOrderId,
                            'order_id'        => $order->id,
                            'plan'            => $plan,
                            'price'           => $price,
                        ],
                    ], 201);

                case 'upi':
                    $rzpOrder = app(RazorpayService::class)->createOrder($price, 'USD', $reference);
                    $order->update([
                        'payment_meta' => array_merge($order->payment_meta ?? [], ['razorpay_order_id' => $rzpOrder['id']]),
                    ]);
                    return response()->json([
                        'success' => true,
                        'data'    => [
                            'method'            => 'upi',
                            'razorpay_order_id' => $rzpOrder['id'],
                            'order_id'          => $order->id,
                            'plan'              => $plan,
                            'price'             => $price,
                            'key_id'            => (string) (AdminCoinSetting::getValue('razorpay_key_id') ?: ''),
                        ],
                    ], 201);

                case 'bank':
                    $bankRef = 'BANK-' . strtoupper(Str::random(12));
                    $order->update(['payment_reference' => $bankRef]);
                    return response()->json([
                        'success' => true,
                        'data'    => [
                            'method'      => 'bank',
                            'order_id'    => $order->id,
                            'reference'   => $bankRef,
                            'plan'        => $plan,
                            'price'       => $price,
                            'bank_details'=> [
                                'account_holder' => (string) (AdminCoinSetting::getValue('bank_account_holder') ?: ''),
                                'bank_name'      => (string) (AdminCoinSetting::getValue('bank_name') ?: ''),
                                'account_number' => (string) (AdminCoinSetting::getValue('bank_account_number') ?: ''),
                                'routing_number' => (string) (AdminCoinSetting::getValue('bank_routing_number') ?: ''),
                                'swift_code'     => (string) (AdminCoinSetting::getValue('bank_swift_code') ?: ''),
                                'instructions'   => (string) (AdminCoinSetting::getValue('bank_enabled_instructions') ?: ''),
                            ],
                        ],
                    ], 201);
            }
        } catch (\Throwable $e) {
            $order->delete();
            return response()->json([
                'success' => false,
                'message' => 'Failed to initialise payment: ' . $e->getMessage(),
            ], 502);
        }

        // Should never reach here
        return response()->json(['success' => false, 'message' => 'Invalid payment method.'], 422);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/subscriptions/capture/stripe
    ──────────────────────────────────────────────────────────────────────── */
    public function captureStripe(Request $request): JsonResponse
    {
        $request->validate([
            'order_id'          => 'required|integer',
            'payment_intent_id' => 'required|string',
        ]);

        $user  = $request->user();
        $order = CoinOrder::where('id', $request->order_id)
            ->where('user_id', $user->id)
            ->where('payment_status', 'pending')
            ->firstOrFail();

        /*
         * SECURITY - the intent must be the one WE created for THIS order.
         *
         * This check was missing, and its absence was a free-subscription hole: the code
         * simply retrieved whatever payment_intent_id the CLIENT sent and granted the plan
         * if Stripe said "succeeded". Any succeeded intent worked - including the
         * attacker's own $0.99 coin purchase, replayed indefinitely.
         *
         * The coin-order capture has always done this correctly
         * (StudioWalletCoinsController::captureStripePayment). This is the same guard.
         */
        $storedIntentId = data_get($order->payment_meta, 'stripe_intent_id');
        if (! $storedIntentId || ! hash_equals((string) $storedIntentId, (string) $request->payment_intent_id)) {
            return response()->json(['success' => false, 'message' => 'Invalid Stripe payment reference.'], 422);
        }

        try {
            $intent = app(StripeService::class)->retrievePaymentIntent($storedIntentId);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'Failed to retrieve Stripe payment.'], 502);
        }

        if ($intent->status !== 'succeeded') {
            return response()->json([
                'success' => false,
                'message' => 'Payment not completed. Status: ' . $intent->status,
            ], 422);
        }

        // The amount Stripe actually received must cover the order. Otherwise a $0.50
        // intent buys a $39.99 annual plan.
        $paidUsd = ((int) $intent->amount_received) / 100;
        if ($paidUsd + 0.001 < (float) $order->price_usd) {
            return response()->json([
                'success' => false,
                'message' => 'The amount paid is less than the plan price.',
            ], 422);
        }

        $plan = data_get($order->payment_meta, 'subscription_plan', 'monthly');

        $subscription = DB::transaction(function () use ($order, $user, $intent, $plan) {
            // Lock the order and re-check its status INSIDE the transaction. Two concurrent
            // captures would otherwise both pass the outer where() and both grant a
            // subscription - a duplicate charge and a duplicate row.
            $locked = CoinOrder::whereKey($order->id)->lockForUpdate()->first();
            if (! $locked || $locked->payment_status !== 'pending') {
                return null; // already captured by a concurrent request
            }

            $locked->update([
                'payment_status' => 'paid',
                'paid_at'        => now(),
                'payment_meta'   => array_merge($locked->payment_meta ?? [], [
                    'stripe_capture' => ['id' => $intent->id, 'status' => $intent->status],
                ]),
            ]);

            $this->redeemOrderCoupon($locked, $user->id);
            return $this->createOrRenewSubscription($user->id, $plan, (float) $locked->price_usd);
        });

        if (! $subscription) {
            return response()->json([
                'success' => false,
                'message' => 'This payment has already been processed.',
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst($plan) . ' subscription activated.',
            'data'    => ['subscription' => $this->formatSubscription($subscription)],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/subscriptions/capture/paypal
    ──────────────────────────────────────────────────────────────────────── */
    public function capturePaypal(Request $request): JsonResponse
    {
        $request->validate([
            'order_id'        => 'required|integer',
            'paypal_order_id' => 'required|string',
        ]);

        $user  = $request->user();
        $order = CoinOrder::where('id', $request->order_id)
            ->where('user_id', $user->id)
            ->where('payment_status', 'pending')
            ->firstOrFail();

        $storedPaypalId = data_get($order->payment_meta, 'paypal_order_id');
        if ($storedPaypalId !== $request->paypal_order_id) {
            return response()->json(['success' => false, 'message' => 'Invalid PayPal order reference.'], 422);
        }

        try {
            $capture = app(PayPalService::class)->captureOrder($request->paypal_order_id);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'PayPal capture request failed.'], 502);
        }

        if (($capture['status'] ?? '') !== 'COMPLETED') {
            return response()->json([
                'success' => false,
                'message' => 'Payment not completed. Status: ' . ($capture['status'] ?? 'unknown'),
            ], 422);
        }

        $plan = data_get($order->payment_meta, 'subscription_plan', 'monthly');

        $subscription = DB::transaction(function () use ($order, $user, $capture, $plan) {
            $order->update([
                'payment_status' => 'paid',
                'paid_at'        => now(),
                'payment_meta'   => array_merge($order->payment_meta ?? [], ['paypal_capture' => $capture]),
            ]);

            $this->redeemOrderCoupon($order, $user->id);
            return $this->createOrRenewSubscription($user->id, $plan, (float) $order->price_usd);
        });

        return response()->json([
            'success' => true,
            'message' => ucfirst($plan) . ' subscription activated.',
            'data'    => ['subscription' => $this->formatSubscription($subscription)],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/subscriptions/capture/razorpay
    ──────────────────────────────────────────────────────────────────────── */
    public function captureRazorpay(Request $request): JsonResponse
    {
        $request->validate([
            'order_id'           => 'required|integer',
            'razorpay_payment_id'=> 'required|string',
            'razorpay_order_id'  => 'required|string',
            'razorpay_signature' => 'required|string',
        ]);

        $user  = $request->user();
        $order = CoinOrder::where('id', $request->order_id)
            ->where('user_id', $user->id)
            ->where('payment_status', 'pending')
            ->firstOrFail();

        /*
         * SECURITY - verify against the order id WE stored, not the one the client sent.
         *
         * This verified the signature against $request->razorpay_order_id, which the
         * attacker controls. A valid (order_id, payment_id, signature) triple from ANY
         * real payment - a ₹1 coin purchase, say - passed, and granted a subscription.
         * The signature was real; it just wasn't for this order.
         *
         * The coin capture does this correctly (StudioWalletCoinsController). Same guard.
         */
        $storedRzpOrderId = data_get($order->payment_meta, 'razorpay_order_id');
        if (! $storedRzpOrderId || ! hash_equals((string) $storedRzpOrderId, (string) $request->razorpay_order_id)) {
            return response()->json(['success' => false, 'message' => 'Invalid payment reference.'], 422);
        }

        $valid = app(RazorpayService::class)->verifySignature(
            $storedRzpOrderId,
            $request->razorpay_payment_id,
            $request->razorpay_signature
        );

        if (!$valid) {
            return response()->json(['success' => false, 'message' => 'Invalid payment signature.'], 422);
        }

        $plan = data_get($order->payment_meta, 'subscription_plan', 'monthly');

        $subscription = DB::transaction(function () use ($order, $user, $request, $plan) {
            $order->update([
                'payment_status' => 'paid',
                'paid_at'        => now(),
                'payment_meta'   => array_merge($order->payment_meta ?? [], [
                    'razorpay_payment_id' => $request->razorpay_payment_id,
                    'razorpay_order_id'   => $request->razorpay_order_id,
                ]),
            ]);

            $this->redeemOrderCoupon($order, $user->id);
            return $this->createOrRenewSubscription($user->id, $plan, (float) $order->price_usd);
        });

        return response()->json([
            'success' => true,
            'message' => ucfirst($plan) . ' subscription activated.',
            'data'    => ['subscription' => $this->formatSubscription($subscription)],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/subscriptions/cancel
    ──────────────────────────────────────────────────────────────────────── */
    public function cancel(Request $request): JsonResponse
    {
        $sub = Subscription::where('user_id', $request->user()->id)
            ->where('status', 'active')
            ->latest()
            ->first();

        if (!$sub) {
            return response()->json(['success' => false, 'message' => 'No active subscription found.'], 404);
        }

        $sub->update([
            'status'       => 'cancelled',
            'cancelled_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Subscription cancelled. Access continues until ' . $sub->expires_at?->toDateString() . '.',
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       GET /studio/subscriptions/iap/products
       What the app can actually sell, on this platform, right now.
    ──────────────────────────────────────────────────────────────────────── */
    public function iapProducts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform' => ['required', Rule::in(['ios', 'android'])],
        ]);

        $platform = $data['platform'];
        $iap      = app(IapService::class);
        $enabled  = $iap->subsEnabled($platform);

        $products = [];
        if ($enabled) {
            foreach (['monthly', 'annual'] as $plan) {
                // Namespaced premium_* so we don't collide with the verification
                // badge plans, which also use "monthly"/"annual" as keys.
                $productId = $iap->productIdFor($platform, "premium_{$plan}");
                if (!$productId) {
                    continue; // Not configured in the store yet - don't offer it.
                }

                $products[] = [
                    'plan'       => $plan,
                    'product_id' => $productId,
                    'price'      => $this->priceFor($plan),
                ];
            }
        }

        return response()->json([
            'success' => true,
            'data'    => ['enabled' => $enabled && $products !== [], 'products' => $products],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /studio/subscriptions/iap/verify
       The store has taken the money; verify the receipt and grant Premium.
    ──────────────────────────────────────────────────────────────────────── */
    public function verifyIap(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform' => ['required', Rule::in(['ios', 'android'])],
            'plan'     => ['required', Rule::in(['monthly', 'annual'])],
            // Which tier was bought. Optional: the single legacy Premium product
            // sends no plan_key, and those purchases must keep working exactly
            // as before.
            'plan_key' => ['nullable', 'string', 'max:64'],
            'receipt'  => ['required', 'string'], // iOS: base64 receipt. Android: purchase token.
        ]);

        $user     = $request->user();
        $platform = $data['platform'];
        $plan     = $data['plan'];
        $iap      = app(IapService::class);

        if (! $iap->subsEnabled($platform)) {
            return response()->json([
                'success' => false,
                'message' => 'Premium is not available for purchase in the app right now.',
            ], 422);
        }

        /**
         * Resolve what was bought SERVER-SIDE.
         *
         * The client says which tier it thinks it bought; it never says what
         * that costs or which store product it maps to. Both come from the
         * subscription_plans row, and the receipt is then verified against that
         * product id - so a client claiming "studio" while holding a Starter
         * receipt fails verification instead of being granted Studio.
         *
         * Same discipline the single-product path already used with
         * IapService::productIdFor; this only widens where the id comes from.
         */
        $planKey  = $data['plan_key'] ?? null;
        $tier     = null;
        $price    = null;
        $currency = null;

        if ($planKey !== null) {
            $tier = SubscriptionPlan::where('key', $planKey)->where('is_enabled', true)->first();
            if (! $tier) {
                return response()->json([
                    'success' => false,
                    'message' => 'That plan is not available.',
                ], 422);
            }

            $productId = $tier->productIdFor($platform);
            $price     = (float) $tier->price;
            $currency  = $tier->currency;

            // A tier priced per year must not be recorded as a monthly one.
            $plan = $tier->period === 'year' ? 'annual' : 'monthly';
        } else {
            $productId = $iap->productIdFor($platform, "premium_{$plan}");
        }

        if (! $productId) {
            return response()->json([
                'success' => false,
                'message' => 'This plan is not offered in the app.',
            ], 422);
        }

        try {
            $result = $platform === 'ios'
                ? $iap->verifyApple($data['receipt'], $productId)
                : $iap->verifyGoogle($data['receipt'], $productId);
        } catch (\Throwable $e) {
            Log::warning('Premium IAP verification failed', [
                'user_id' => $user->id,
                'plan'    => $plan,
                'error'   => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'We could not verify that purchase with the store.',
            ], 422);
        }

        $transactionId = $result['transaction_id'];
        if ($transactionId === '') {
            return response()->json(['success' => false, 'message' => 'The store returned no transaction id.'], 422);
        }

        // Replay guard. Apple reuses original_transaction_id across renewals of the
        // same subscription, so the same receipt sent twice must not mint a second
        // subscription - or a second helping of bonus coins.
        $existing = Subscription::where('iap_transaction_id', $transactionId)->first();
        if ($existing) {
            return response()->json([
                'success' => true,
                'message' => 'Subscription already active.',
                'data'    => ['subscription' => $this->formatSubscription($existing)],
            ]);
        }

        // A tier carries its own price and currency; the legacy product falls
        // back to the settings pair it has always used.
        $extra = ['iap_transaction_id' => $transactionId, 'iap_platform' => $platform];
        if ($tier) {
            $extra['plan_key'] = $tier->key;
            $extra['currency'] = $currency;
        }

        $subscription = $this->createOrRenewSubscription(
            $user->id,
            $plan,
            $price ?? $this->priceFor($plan),
            // The store, not us, decides when it lapses - trust its expiry when it gives one.
            $result['expires_at'] ? \Illuminate\Support\Carbon::createFromTimestamp($result['expires_at']) : null,
            $extra,
        );

        return response()->json([
            'success' => true,
            'message' => ($tier ? $tier->name : ucfirst($plan)) . ' subscription activated.',
            'data'    => ['subscription' => $this->formatSubscription($subscription)],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       Helpers
    ──────────────────────────────────────────────────────────────────────── */
    private function priceFor(string $plan): float
    {
        return $plan === 'annual'
            ? (float) AdminCoinSetting::getValue('subscription_annual_price', 39.99)
            : (float) AdminCoinSetting::getValue('subscription_monthly_price', 4.99);
    }

    /**
     * @param \Illuminate\Support\Carbon|null $expiresAt When the STORE says it lapses.
     *        Only IAP knows this; the web gateways pass null and we derive it.
     * @param array $extra iap_transaction_id / iap_platform, when bought in-app.
     */
    /**
     * Record a coupon redemption, once, after the payment succeeded.
     *
     * Deliberately not done at intent time: an abandoned checkout must not
     * consume one of a limited coupon's uses. CouponService::redeem re-validates
     * everything and takes a row lock, so two confirmations racing on the last
     * remaining use cannot both succeed.
     *
     * Never allowed to break the confirmation it follows - the customer has
     * already paid, and their subscription must be created whether or not this
     * bookkeeping row lands.
     */
    private function redeemOrderCoupon(object $order, int $userId): void
    {
        $raw = $order->payment_meta ?? null;
        $meta = is_array($raw) ? $raw : (array) json_decode((string) ($raw ?: '[]'), true);

        $code = $meta['coupon_code'] ?? null;
        if (! $code) {
            return;
        }

        try {
            $user = \App\Models\User::find($userId);
            if (! $user) {
                return;
            }
            // Pre-discount amount, so the recorded discount matches what was
            // actually taken off rather than being recomputed from the paid total.
            $gross = (float) $order->price_usd + (float) ($meta['coupon_discount'] ?? 0);
            app(CouponService::class)->redeem($code, $user, $meta['plan_key'] ?? null, $gross, 'USD');
        } catch (\Throwable $e) {
            Log::warning('Coupon redemption failed after payment', [
                'order' => $order->id ?? null, 'code' => $code, 'error' => $e->getMessage(),
            ]);
        }
    }

    private function createOrRenewSubscription(
        int $userId,
        string $plan,
        float $price,
        ?\Illuminate\Support\Carbon $expiresAt = null,
        array $extra = [],
    ): Subscription {
        /**
         * Read the current expiry BEFORE cancelling, or the time being
         * preserved is already gone by the time we try to extend from it.
         */
        $current = Subscription::where('user_id', $userId)
            ->where('status', 'active')
            ->orderByDesc('expires_at')
            ->first();

        // Cancel any existing active subscription
        Subscription::where('user_id', $userId)
            ->where('status', 'active')
            ->update(['status' => 'cancelled', 'cancelled_at' => now()]);

        /**
         * Renewing EXTENDS; it does not restart.
         *
         * This used to be `now()->addMonth()` unconditionally, so anyone who
         * renewed before their term ended lost the remainder: a subscription
         * expiring on the 31st, renewed on the 8th, came back expiring on the
         * 8th of the next month rather than the 31st - 23 paid-for days
         * deleted. Extending from whichever is later, today or what they
         * already had, is what makes an early renewal safe.
         *
         * `copy()` matters: Carbon is mutable, and addMonth() on the model's
         * own attribute would edit the row we just read.
         *
         * Only when the caller gave no date. The IAP path passes the STORE's
         * expiry, and Apple and Google own that number - extending it here
         * would hand out time nobody paid for and drift from the receipt.
         */
        if ($expiresAt === null) {
            $from = ($current?->expires_at && $current->expires_at->isFuture())
                ? $current->expires_at->copy()
                : now();

            $expiresAt = $plan === 'annual' ? $from->addYear() : $from->addMonth();
        }

        $subscription = Subscription::create(array_merge([
            'user_id'    => $userId,
            'plan'       => $plan,
            'status'     => 'active',
            'price'      => $price,
            'currency'   => 'USD',
            'started_at' => now(),
            'expires_at' => $expiresAt,
        ], $extra));

        // Pay the first month's coin bonus straight away - a member who has just
        // paid should not have to wait a day for the scheduler to notice them.
        // Never let this fail the purchase: the payment has already been captured
        // by this point, and the daily command will pick up anything missed.
        try {
            app(PremiumBonusService::class)->grantDue($subscription);
        } catch (\Throwable $e) {
            Log::error('Premium signup bonus failed', [
                'subscription_id' => $subscription->id,
                'error'           => $e->getMessage(),
            ]);
        }

        return $subscription;
    }

    private function formatSubscription(Subscription $sub): array
    {
        return [
            'id'           => $sub->id,
            'plan'         => $sub->plan,
            // Null on every pre-tier subscription, which is honest: those
            // predate Starter/Pro/Studio and belong to the single old product.
            'plan_key'     => $sub->plan_key,
            'status'       => $sub->status,
            'price'        => (float) $sub->price,
            'currency'     => $sub->currency,
            'started_at'   => $sub->started_at?->toIso8601String(),
            'expires_at'   => $sub->expires_at?->toIso8601String(),
            'cancelled_at' => $sub->cancelled_at?->toIso8601String(),
            'is_active'    => $sub->isActive(),
        ];
    }
}
