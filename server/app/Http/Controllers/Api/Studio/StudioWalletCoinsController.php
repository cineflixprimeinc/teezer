<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AdminCoinSetting;
use App\Models\CoinGift;
use App\Models\CoinOrder;
use App\Models\CoinPackage;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\GiftCommissionService;
use App\Services\IapService;
use App\Services\PayPalService;
use App\Services\RazorpayService;
use App\Services\StorageService;
use App\Services\StripeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StudioWalletCoinsController extends Controller
{
    /* ────────────────────────────────────────────────────────────────────────
       GET /v1/studio/wallets-coins
    ──────────────────────────────────────────────────────────────────────── */
    public function index(Request $request): JsonResponse
    {
        $user   = $request->user();
        $wallet = Wallet::firstOrCreate(['user_id' => $user->id], [
            'balance'               => 0,
            'coins_balance'         => 0,
            'bonus_coin_balance'    => 0,
            'earned_coin_balance'   => 0,
            'wallet_balance_usd'    => 0,
            'pending_balance_usd'   => 0,
            'gift_earnings'         => 0,
            'subscription_earnings' => 0,
            'ad_earnings'           => 0,
            'total_withdrawn'       => 0,
        ]);

        $commissionRate = (float) AdminCoinSetting::getValue('commission_rate', 30);
        $minWithdrawal  = (float) AdminCoinSetting::getValue('min_withdrawal_usd', 10);
        $coinUsdRate    = (int)   AdminCoinSetting::getValue('coin_usd_rate', 100);

        return response()->json([
            'success' => true,
            'data'    => [
                'wallet' => [
                    'coin_balance'            => (int) $wallet->coins_balance,
                    'bonus_coin_balance'      => (int) $wallet->bonus_coin_balance,
                    'earned_coin_balance'     => (int) $wallet->earned_coin_balance,
                    'wallet_balance_usd'      => (float) $wallet->wallet_balance_usd,
                    'pending_balance_usd'     => (float) $wallet->pending_balance_usd,
                    'total_received_coins'    => (int) $wallet->total_received_coins,
                    'total_commission_coins'  => (int) $wallet->total_commission_coins,
                    'total_net_earned_coins'  => (int) $wallet->total_net_earned_coins,
                    'total_spent_coins'       => (int) $wallet->total_spent_coins,
                    'total_purchased_coins'   => (int) $wallet->total_purchased_coins,
                ],
                'commission' => [
                    'rate'               => $commissionRate,
                    'min_withdrawal_usd' => $minWithdrawal,
                    'coin_usd_rate'      => $coinUsdRate,
                ],
                'payment_methods' => [
                    'card'      => (bool) AdminCoinSetting::getValue('card_enabled', 1),
                    'paypal'    => (bool) AdminCoinSetting::getValue('paypal_enabled', 1),
                    'applepay'  => (bool) AdminCoinSetting::getValue('applepay_enabled', 1),
                    'googlepay' => (bool) AdminCoinSetting::getValue('googlepay_enabled', 1),
                    'upi'       => (bool) AdminCoinSetting::getValue('upi_enabled', 1),
                    'bank'      => (bool) AdminCoinSetting::getValue('bank_enabled', 1),
                ],
            ],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       GET /v1/studio/wallets-coins/packages
    ──────────────────────────────────────────────────────────────────────── */
    public function packages(Request $request): JsonResponse
    {
        $query = CoinPackage::active()->ordered();

        if (!$request->boolean('all')) {
            $query->front();
        }

        $packages = $query->get()->map(fn ($p) => [
            'id'               => $p->id,
            'plan_name'        => $p->plan_name,
            'coins'            => $p->coins,
            'price_usd'        => (float) $p->price_usd,
            'badge'            => $p->badge,
            'icon'             => $p->icon,
            // Admin-uploaded artwork. When present the client must prefer it over the
            // static SVG named by `icon` - otherwise changing an icon in the admin
            // panel would silently do nothing.
            'icon_url'         => $p->icon_url
                ? \Illuminate\Support\Facades\Storage::disk(config('filesystems.default'))->url($p->icon_url)
                : null,
            // Bonus, as the model derives it. The SAME payload the admin panel
            // and the app read, so a pack cannot be advertised with one bonus
            // here and credited with another at capture.
            'bonus'            => $p->bonusPayload(),
            'is_front_visible' => $p->is_front_visible,
            'sort_order'       => $p->sort_order,
            'per_coin_usd'     => round($p->price_usd / max($p->coins, 1), 6),
        ]);

        return response()->json(['success' => true, 'data' => $packages]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       GET /v1/studio/wallets-coins/transactions
    ──────────────────────────────────────────────────────────────────────── */
    public function transactions(Request $request): JsonResponse
    {
        $user   = $request->user();
        $wallet = Wallet::where('user_id', $user->id)->first();

        if (!$wallet) {
            return response()->json(['success' => true, 'data' => [], 'meta' => ['total' => 0]]);
        }

        $query = WalletTransaction::where('wallet_id', $wallet->id)
            ->orderByDesc('created_at');

        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }

        $perPage = min((int) $request->query('per_page', 20), 50);
        $items   = $query->paginate($perPage);

        /*
         * Attach the other person to gift rows.
         *
         * wallet_transactions stores only a description string, so the ledger
         * could name nobody - "Gift received: Macaron" and nothing about who
         * sent it. coin_gifts has the pair, and both tables carry the same
         * reference on the receiver's row, so one keyed lookup joins them
         * without an N+1.
         */
        $refs  = $items->pluck('reference_id')->filter()->values();
        $gifts = $refs->isEmpty()
            ? collect()
            : CoinGift::with([
                    'sender:id,username,name,avatar,is_verified',
                    'receiver:id,username,name,avatar,is_verified',
                ])
                ->whereIn('reference_id', $refs)
                ->get()
                ->keyBy('reference_id');

        $shape = fn ($u) => $u ? [
            'id'          => $u->id,
            'username'    => $u->username,
            'name'        => $u->name,
            'avatar'      => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
            'is_verified' => (bool) $u->is_verified,
        ] : null;

        $data = $items->map(function ($t) use ($gifts, $shape, $user) {
            $g = $t->reference_id ? $gifts->get($t->reference_id) : null;
            // Whoever isn't you. A sent gift names the receiver, a received one
            // names the sender.
            $other = $g
                ? ((int) $g->sender_id === (int) $user->id ? $g->receiver : $g->sender)
                : null;

            return [
            'counterparty'             => $shape($other),
            'gift_name'                => $g?->gift_name,
            'id'                       => $t->id,
            'type'                     => $t->type,
            'description'              => $t->description,
            'gross_coins'              => (int) $t->gross_coins,
            'commission_coins'         => (int) $t->commission_coins,
            'net_coins'                => (int) $t->net_coins,
            'amount_usd'               => (float) $t->amount,
            'balance_after_coins'      => (int) $t->balance_after_coins,
            'wallet_balance_after_usd' => (float) $t->wallet_balance_after_usd,
            'status'                   => $t->status ?? 'completed',
            'reference_id'             => $t->reference_id,
            'created_at'               => $t->created_at?->toIso8601String(),
            ];
        });

        return response()->json([
            'success' => true,
            'data'    => $data,
            'meta'    => [
                'current_page' => $items->currentPage(),
                'last_page'    => $items->lastPage(),
                'per_page'     => $items->perPage(),
                'total'        => $items->total(),
            ],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/wallets-coins/orders
       Creates a coin purchase order.
       For PayPal: also creates a PayPal order and returns paypal_order_id.
       Coins are only credited after payment is captured and verified.
    ──────────────────────────────────────────────────────────────────────── */
    public function createOrder(Request $request): JsonResponse
    {
        $request->validate([
            'package_id'     => 'required|integer|exists:coin_packages,id',
            'payment_method' => ['required', 'string', Rule::in([
                'card', 'paypal', 'applepay', 'googlepay', 'upi', 'bank',
            ])],
        ]);

        $user      = $request->user();
        $package   = CoinPackage::active()->findOrFail($request->package_id);
        $reference = 'ORD-' . strtoupper(Str::random(10));

        $order = CoinOrder::create([
            'user_id'           => $user->id,
            'package_id'        => $package->id,
            'coins'             => $package->coins,
            'price_usd'         => $package->price_usd,
            'currency'          => 'USD',
            'payment_method'    => $request->payment_method,
            'payment_status'    => 'pending',
            'payment_reference' => $reference,
        ]);

        $responseData = [
            'order_id'       => $order->id,
            'reference'      => $order->payment_reference,
            'coins'          => $order->coins,
            'price_usd'      => (float) $order->price_usd,
            'payment_method' => $order->payment_method,
            'payment_status' => $order->payment_status,
        ];

        if ($request->payment_method === 'paypal') {
            try {
                $paypalOrderId = app(PayPalService::class)->createOrder(
                    (float) $package->price_usd,
                    'USD',
                    $reference,
                    "{$package->coins} RC - Teezer Coin Package",
                );

                $order->update(['payment_meta' => ['paypal_order_id' => $paypalOrderId]]);

                $responseData['paypal_order_id'] = $paypalOrderId;
            } catch (\Throwable $e) {
                $order->delete();
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to initialise PayPal payment. Please try again.',
                ], 502);
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Order created. Complete payment to receive coins.',
            'data'    => $responseData,
        ], 201);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/wallets-coins/orders/paypal/capture
       Verifies buyer approval with PayPal and credits coins on success.
    ──────────────────────────────────────────────────────────────────────── */
    public function capturePaypalOrder(Request $request): JsonResponse
    {
        $request->validate([
            'order_id'        => 'required|integer|exists:coin_orders,id',
            'paypal_order_id' => 'required|string',
        ]);

        $user  = $request->user();
        $order = CoinOrder::where('id', $request->order_id)
            ->where('user_id', $user->id)
            ->where('payment_status', 'pending')
            ->where('payment_method', 'paypal')
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

        // SECURITY: the order id is already pinned above, but that only proves
        // THIS capture belongs to THIS order - it doesn't prove PayPal actually
        // captured the order's price. Re-check the captured amount/currency the
        // same way Stripe/Razorpay do, straight from PayPal's own capture
        // response, not anything client-supplied.
        $capturedAmount   = data_get($capture, 'purchase_units.0.payments.captures.0.amount.value');
        $capturedCurrency = data_get($capture, 'purchase_units.0.payments.captures.0.amount.currency_code');
        $expectedAmount   = number_format((float) $order->price_usd, 2, '.', '');
        if ($capturedAmount === null
            || number_format((float) $capturedAmount, 2, '.', '') !== $expectedAmount
            || strtolower((string) $capturedCurrency) !== strtolower((string) $order->currency)) {
            return response()->json(['success' => false, 'message' => 'Payment amount mismatch.'], 422);
        }

        // Lock + re-check inside the transaction to prevent concurrent double-credit.
        $credited = false;
        DB::transaction(function () use ($order, $user, $capture, &$credited) {
            $locked = CoinOrder::whereKey($order->id)->lockForUpdate()->first();
            if (!$locked || $locked->payment_status !== 'pending') {
                return;
            }
            $locked->update([
                'payment_status' => 'paid',
                'paid_at'        => now(),
                'payment_meta'   => array_merge($locked->payment_meta ?? [], ['paypal_capture' => $capture]),
            ]);

            app(GiftCommissionService::class)
                ->creditPurchasedCoins($user->id, $locked->coins, $locked->id, $this->bonusForOrder($locked));
            $credited = true;
        });

        if (!$credited) {
            return response()->json([
                'success' => true,
                'message' => 'Payment already processed.',
                'data'    => ['coins_added' => 0],
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "{$order->coins} RC added to your account.",
            'data'    => ['coins_added' => $order->coins],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/wallets-coins/orders/stripe/intent
       Creates a Stripe PaymentIntent for coin purchase.
    ──────────────────────────────────────────────────────────────────────── */
    public function createStripeIntent(Request $request): JsonResponse
    {
        $request->validate([
            'package_id' => 'required|integer|exists:coin_packages,id',
        ]);

        $user      = $request->user();
        $package   = CoinPackage::active()->findOrFail($request->package_id);
        $reference = 'ORD-' . strtoupper(Str::random(10));

        $order = CoinOrder::create([
            'user_id'           => $user->id,
            'package_id'        => $package->id,
            'coins'             => $package->coins,
            'price_usd'         => $package->price_usd,
            'currency'          => 'USD',
            'payment_method'    => 'card',
            'payment_status'    => 'pending',
            'payment_reference' => $reference,
        ]);

        try {
            $intent = app(StripeService::class)->createPaymentIntent(
                (float) $package->price_usd,
                'USD',
                $reference,
                ['user_id' => (string) $user->id, 'order_id' => (string) $order->id]
            );

            $order->update([
                'payment_reference' => $intent->id,
                'payment_meta'      => ['stripe_intent_id' => $intent->id, 'original_reference' => $reference],
            ]);

            return response()->json([
                'success' => true,
                'data'    => [
                    'client_secret' => $intent->client_secret,
                    'order_id'      => $order->id,
                    'amount'        => (float) $package->price_usd,
                    'coins'         => $package->coins,
                ],
            ], 201);
        } catch (\Throwable $e) {
            $order->delete();
            return response()->json([
                'success' => false,
                'message' => 'Failed to initialise Stripe payment: ' . $e->getMessage(),
            ], 502);
        }
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/wallets-coins/orders/stripe/capture
       Verifies Stripe payment and credits coins.
    ──────────────────────────────────────────────────────────────────────── */
    public function captureStripePayment(Request $request): JsonResponse
    {
        $request->validate([
            'order_id'          => 'required|integer',
            'payment_intent_id' => 'required|string',
        ]);

        $user  = $request->user();
        $order = CoinOrder::where('id', $request->order_id)
            ->where('user_id', $user->id)
            ->where('payment_status', 'pending')
            ->where('payment_method', 'card')
            ->firstOrFail();

        // SECURITY: the PaymentIntent must be the one created for THIS order.
        // Without this, a single real "succeeded" intent could be replayed
        // against unlimited other orders to mint coins for free.
        $storedIntentId = data_get($order->payment_meta, 'stripe_intent_id');
        if (!$storedIntentId || !hash_equals((string) $storedIntentId, (string) $request->payment_intent_id)) {
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

        // SECURITY: the amount actually paid must match the order price
        // (Stripe amounts are in cents; currency is lower-cased by the service).
        $expectedCents = (int) round(((float) $order->price_usd) * 100);
        if ((int) $intent->amount !== $expectedCents
            || strtolower((string) $intent->currency) !== strtolower((string) $order->currency)) {
            return response()->json(['success' => false, 'message' => 'Payment amount mismatch.'], 422);
        }

        // Lock the order inside the transaction and re-check it is still pending
        // so two concurrent captures can never double-credit the same order.
        $credited = false;
        DB::transaction(function () use ($order, $user, $intent, &$credited) {
            $locked = CoinOrder::whereKey($order->id)->lockForUpdate()->first();
            if (!$locked || $locked->payment_status !== 'pending') {
                return; // already processed by a concurrent/earlier request
            }
            $locked->update([
                'payment_status' => 'paid',
                'paid_at'        => now(),
                'payment_meta'   => array_merge($locked->payment_meta ?? [], [
                    'stripe_capture' => [
                        'id'       => $intent->id,
                        'status'   => $intent->status,
                        'amount'   => $intent->amount,
                        'currency' => $intent->currency,
                    ],
                ]),
            ]);

            app(GiftCommissionService::class)
                ->creditPurchasedCoins($user->id, $locked->coins, $locked->id, $this->bonusForOrder($locked));
            $credited = true;
        });

        if (!$credited) {
            return response()->json([
                'success' => true,
                'message' => 'Payment already processed.',
                'data'    => ['coins_added' => 0],
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "{$order->coins} RC added to your account.",
            'data'    => ['coins_added' => $order->coins],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/wallets-coins/orders/razorpay/create
       Creates a Razorpay order for coin purchase.
    ──────────────────────────────────────────────────────────────────────── */
    public function createRazorpayOrder(Request $request): JsonResponse
    {
        $request->validate([
            'package_id' => 'required|integer|exists:coin_packages,id',
        ]);

        $user      = $request->user();
        $package   = CoinPackage::active()->findOrFail($request->package_id);
        $reference = 'ORD-' . strtoupper(Str::random(10));

        $order = CoinOrder::create([
            'user_id'           => $user->id,
            'package_id'        => $package->id,
            'coins'             => $package->coins,
            'price_usd'         => $package->price_usd,
            'currency'          => 'USD',
            'payment_method'    => 'upi',
            'payment_status'    => 'pending',
            'payment_reference' => $reference,
        ]);

        try {
            $rzpOrder = app(RazorpayService::class)->createOrder(
                (float) $package->price_usd,
                'USD',
                $reference
            );

            $order->update([
                'payment_meta' => ['razorpay_order_id' => $rzpOrder['id'], 'original_reference' => $reference],
            ]);

            return response()->json([
                'success' => true,
                'data'    => [
                    'razorpay_order_id' => $rzpOrder['id'],
                    'order_id'          => $order->id,
                    'amount'            => (float) $package->price_usd,
                    'coins'             => $package->coins,
                    'key_id'            => (string) (AdminCoinSetting::getValue('razorpay_key_id') ?: ''),
                ],
            ], 201);
        } catch (\Throwable $e) {
            $order->delete();
            return response()->json([
                'success' => false,
                'message' => 'Failed to initialise Razorpay payment: ' . $e->getMessage(),
            ], 502);
        }
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/wallets-coins/orders/razorpay/capture
       Verifies Razorpay signature and credits coins.
    ──────────────────────────────────────────────────────────────────────── */
    public function captureRazorpayPayment(Request $request): JsonResponse
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
            ->where('payment_method', 'upi')
            ->firstOrFail();

        // SECURITY: the Razorpay order must be the one we created server-side for
        // THIS coin order (which carries the correct price). Verifying the
        // signature against a client-supplied order id would let a valid signature
        // from a cheap payment be replayed to pay off an expensive order.
        $storedRzpOrderId = data_get($order->payment_meta, 'razorpay_order_id');
        if (!$storedRzpOrderId || !hash_equals((string) $storedRzpOrderId, (string) $request->razorpay_order_id)) {
            return response()->json(['success' => false, 'message' => 'Invalid Razorpay order reference.'], 422);
        }

        $valid = app(RazorpayService::class)->verifySignature(
            $storedRzpOrderId,
            $request->razorpay_payment_id,
            $request->razorpay_signature
        );

        if (!$valid) {
            return response()->json(['success' => false, 'message' => 'Invalid payment signature.'], 422);
        }

        // Lock + re-check inside the transaction to prevent concurrent double-credit.
        $credited = false;
        DB::transaction(function () use ($order, $user, $request, $storedRzpOrderId, &$credited) {
            $locked = CoinOrder::whereKey($order->id)->lockForUpdate()->first();
            if (!$locked || $locked->payment_status !== 'pending') {
                return;
            }
            $locked->update([
                'payment_status' => 'paid',
                'paid_at'        => now(),
                'payment_meta'   => array_merge($locked->payment_meta ?? [], [
                    'razorpay_payment_id' => $request->razorpay_payment_id,
                    'razorpay_order_id'   => $storedRzpOrderId,
                ]),
            ]);

            app(GiftCommissionService::class)
                ->creditPurchasedCoins($user->id, $locked->coins, $locked->id, $this->bonusForOrder($locked));
            $credited = true;
        });

        if (!$credited) {
            return response()->json([
                'success' => true,
                'message' => 'Payment already processed.',
                'data'    => ['coins_added' => 0],
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "{$order->coins} RC added to your account.",
            'data'    => ['coins_added' => $order->coins],
        ]);
    }

    /* ────────────────────────────────────────────────────────────────────────
       POST /v1/studio/wallets-coins/orders/bank/create
       Creates a bank transfer order and returns payment instructions.
    ──────────────────────────────────────────────────────────────────────── */
    public function createBankTransferOrder(Request $request): JsonResponse
    {
        $request->validate([
            'package_id' => 'required|integer|exists:coin_packages,id',
        ]);

        $user      = $request->user();
        $package   = CoinPackage::active()->findOrFail($request->package_id);
        $reference = 'BANK-' . strtoupper(Str::random(12));

        $order = CoinOrder::create([
            'user_id'           => $user->id,
            'package_id'        => $package->id,
            'coins'             => $package->coins,
            'price_usd'         => $package->price_usd,
            'currency'          => 'USD',
            'payment_method'    => 'bank',
            'payment_status'    => 'pending',
            'payment_reference' => $reference,
        ]);

        $bankDetails = [
            'account_holder' => (string) (AdminCoinSetting::getValue('bank_account_holder') ?: ''),
            'bank_name'      => (string) (AdminCoinSetting::getValue('bank_name') ?: ''),
            'account_number' => (string) (AdminCoinSetting::getValue('bank_account_number') ?: ''),
            'routing_number' => (string) (AdminCoinSetting::getValue('bank_routing_number') ?: ''),
            'swift_code'     => (string) (AdminCoinSetting::getValue('bank_swift_code') ?: ''),
            'instructions'   => (string) (AdminCoinSetting::getValue('bank_enabled_instructions') ?: ''),
        ];

        return response()->json([
            'success' => true,
            'message' => 'Bank transfer order created. Send payment using the details below.',
            'data'    => [
                'order_id'    => $order->id,
                'reference'   => $reference,
                'bank_details'=> $bankDetails,
                'amount'      => (float) $package->price_usd,
                'coins'       => $package->coins,
            ],
        ], 201);
    }

    /* ────────────────────────────────────────────────────────────────────────
       IN-APP PURCHASE (coins)

       Apple requires In-App Purchase for digital content (Review Guideline 3.1.1),
       and coins are digital content - so inside the iOS app, coins are bought through
       StoreKit, not through the card / PayPal / UPI / bank checkout that serves the web.
       Apple Pay is NOT an alternative here: it is for physical goods and services, and
       shipping it for coins is a rejection.

       Only packages with a store product id configured are offered in the app, so the
       store can launch with a handful of coin products rather than all 200.
    ──────────────────────────────────────────────────────────────────────── */

    /** GET /v1/studio/wallets-coins/iap/products?platform=ios */
    public function iapProducts(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform' => ['required', Rule::in(['ios', 'android'])],
        ]);

        $platform = $data['platform'];
        $column   = $platform === 'ios' ? 'ios_product_id' : 'android_product_id';
        $iap      = app(IapService::class);

        $enabled = $iap->coinsEnabled($platform);

        $packages = $enabled
            ? CoinPackage::active()->ordered()->whereNotNull($column)->get()
            : collect();

        return response()->json([
            'success' => true,
            'data'    => [
                'enabled'  => $enabled,
                'products' => $packages->map(fn ($p) => [
                    'package_id' => $p->id,
                    'product_id' => $p->{$column},
                    'plan_name'  => $p->plan_name,
                    'coins'      => (int) $p->coins,
                    'price_usd'  => (float) $p->price_usd,
                    'badge'      => $p->badge,
                    'icon'       => $p->icon,
                    'sort_order' => (int) $p->sort_order,
                    // Same derived payload as the web list, so the in-app pack
                    // shows the bonus the wallet will actually be credited.
                    'bonus'      => $p->bonusPayload(),
                ])->values(),
            ],
        ]);
    }

    /** POST /v1/studio/wallets-coins/iap/verify - the store receipt becomes coins. */
    public function iapVerify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform'   => ['required', Rule::in(['ios', 'android'])],
            'product_id' => ['required', 'string', 'max:191'],
            'receipt'    => ['required', 'string'],
        ]);

        $user     = $request->user();
        $platform = $data['platform'];
        $column   = $platform === 'ios' ? 'ios_product_id' : 'android_product_id';
        $iap      = app(IapService::class);

        if (! $iap->coinsEnabled($platform)) {
            return response()->json(['success' => false, 'message' => 'In-app coin purchases are not enabled.'], 422);
        }

        // The COINS come from our package, never from the client. The receipt only proves
        // that a given product was paid for; how much that product is worth is our call.
        $package = CoinPackage::active()->where($column, $data['product_id'])->first();
        if (! $package) {
            return response()->json(['success' => false, 'message' => 'Unknown coin pack.'], 404);
        }

        try {
            $result = $platform === 'ios'
                ? $iap->verifyAppleConsumable($data['receipt'], $data['product_id'])
                : $iap->verifyGoogle($data['receipt'], $data['product_id']);
        } catch (\Throwable $e) {
            Log::warning('Coin IAP verification failed', [
                'user_id'    => $user->id,
                'platform'   => $platform,
                'product_id' => $data['product_id'],
                'error'      => $e->getMessage(),
            ]);

            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }

        // The store's transaction id is the idempotency key. It is unique per PURCHASE (not
        // per product), so buying the same pack twice credits twice - while the store
        // retrying the same purchase, or the app calling this endpoint again, credits once.
        $reference = $platform . ':' . $result['transaction_id'];

        // StoreKit lets a consumable be bought N at a time, and the receipt says how many.
        // Take it from the RECEIPT, never from the client - and honour it, or a buyer
        // charged for 3 packs would be credited 1.
        $qty      = max(1, (int) ($result['quantity'] ?? 1));
        $coins    = (int) $package->coins * $qty;
        $priceUsd = (float) $package->price_usd * $qty;

        $credited = 0;
        $orderId  = null;

        DB::transaction(function () use ($user, $package, $reference, $platform, $result, $qty, $coins, $priceUsd, &$credited, &$orderId) {
            // Claim the transaction id first. The unique index on payment_reference is what
            // actually makes this safe against two concurrent calls, not the check.
            $existing = CoinOrder::where('payment_reference', $reference)->lockForUpdate()->first();
            if ($existing) {
                $orderId = $existing->id;
                return; // already processed - do not credit again
            }

            $order = CoinOrder::create([
                'user_id'           => $user->id,
                'package_id'        => $package->id,
                'coins'             => $coins,
                'price_usd'         => $priceUsd,
                'currency'          => 'USD',
                'payment_method'    => $platform === 'ios' ? 'apple_iap' : 'google_iap',
                'payment_status'    => 'paid',
                'payment_reference' => $reference,
                'payment_meta'      => [
                    'iap' => [
                        'platform'       => $platform,
                        'product_id'     => $result['product_id'],
                        'transaction_id' => $result['transaction_id'],
                        'quantity'       => $qty,
                    ],
                ],
                'paid_at'           => now(),
            ]);

            app(GiftCommissionService::class)
                ->creditPurchasedCoins($user->id, $coins, $order->id, $this->bonusForOrder($order));

            $credited = $coins;
            $orderId  = $order->id;
        });

        if ($credited === 0) {
            return response()->json([
                'success' => true,
                'message' => 'This purchase was already credited.',
                'data'    => ['coins_added' => 0, 'order_id' => $orderId],
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "{$credited} RC added to your account.",
            'data'    => ['coins_added' => $credited, 'order_id' => $orderId],
        ]);
    }

    /**
     * The bonus owed on an order, resolved from the package it points at.
     *
     * Read from the database at capture time, never from the request: the
     * client says which package it bought, the server decides what that is
     * worth. Re-reading here also means a bonus that expired between the
     * intent and the capture is not paid, which is the correct answer to
     * "the campaign ended while I was on the checkout page".
     *
     * Returns 0 for an order with no package (custom top-ups), which is the
     * safe direction to fail: nobody is under-credited what they paid for.
     */
    /**
     * Bonus coins owed for an order, scaled by how many packs it bought.
     *
     * The quantity is read from the ORDER rather than passed in by each caller,
     * so all four credit paths are correct without having to remember it. Web
     * orders carry no quantity and default to 1; only StoreKit can buy several
     * consumables in one transaction.
     *
     * This is where the bug was: `coins` on the order is already base x
     * quantity, but the bonus was returned per-pack. A buyer who paid for three
     * 15+10 packs was credited 45 base and 10 bonus instead of 45 and 30 -
     * charged for three bonuses and given one.
     *
     * The count comes from the RECEIPT, recorded on the order at verification
     * time, never from the client - the same rule the coins themselves follow.
     */
    private function bonusForOrder($order): int
    {
        $packageId = $order->package_id ?? null;
        if (! $packageId) {
            return 0;
        }

        $package = \App\Models\CoinPackage::find($packageId);
        if (! $package || ! $package->hasBonus()) {
            return 0;
        }

        $qty = max(1, (int) data_get($order->payment_meta, 'iap.quantity', 1));

        return $package->bonusCoins() * $qty;
    }
}
