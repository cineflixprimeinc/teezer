<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminCoinSetting;
use App\Models\CreatorEarning;
use App\Models\CreatorWallet;
use App\Models\MonetizationProgram;
use App\Models\Product;
use App\Models\Shop;
use App\Models\ShopOrder;
use App\Models\ShopOrderItem;
use App\Services\RazorpayService;
use App\Services\StripeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Checkout for Teezer Shop products - the first real order/payment system
 * for the Shop (see the 2026_08_19_000007 migration's docblock: before this,
 * `sold_count` had never been written and no order/cart table existed at
 * all).
 *
 * Deliberately mirrors StudioWalletCoinsController's Stripe/Razorpay
 * create->capture pattern method-for-method (same security checks: the
 * client-supplied gateway id is hash_equals()-verified against what the
 * server stored at creation, the gateway is independently re-queried rather
 * than trusted, and the row is re-locked + re-checked "still pending" inside
 * the crediting transaction so two concurrent captures can't double-credit)
 * - reusing the exact tested pattern rather than inventing a new one for
 * real money.
 *
 * A Shop purchase pays with the product's own real currency directly, never
 * with Teezer Coins, so this is a parallel system to CoinOrder rather than
 * built on it. Cash-on-delivery (`Product.allow_cod`) is not wired here yet
 * - it needs a seller-facing "mark delivered" surface that doesn't exist in
 * the app, and is out of scope for this pass; only the two gateway methods
 * settle automatically without any further seller action.
 */
class ShopOrderController extends Controller
{
    /* ── Shared checkout validation / resolution ───────────────────────── */

    private function validateCheckout(Request $request): array
    {
        return $request->validate([
            'product_id'              => ['required', 'integer', 'exists:products,id'],
            'quantity'                => ['sometimes', 'integer', 'min:1', 'max:99'],
            'variation'               => ['nullable', 'array'],
            'shipping_address'        => ['nullable', 'array'],
            'shipping_address.name'   => ['required_with:shipping_address', 'string', 'max:120'],
            'shipping_address.phone'  => ['required_with:shipping_address', 'string', 'max:30'],
            'shipping_address.line1'  => ['required_with:shipping_address', 'string', 'max:200'],
            'shipping_address.city'   => ['required_with:shipping_address', 'string', 'max:100'],
            'shipping_address.country'=> ['required_with:shipping_address', 'string', 'max:100'],
            'buyer_note'              => ['nullable', 'string', 'max:255'],
        ]);
    }

    /** @return array{0: Shop, 1: Product, 2: int, 3: float} */
    private function resolveCheckout(array $data, $user): array
    {
        $product = Product::with('shop')->findOrFail($data['product_id']);
        $shop = $product->shop;

        abort_unless($shop && $shop->isApproved(), 422, 'This shop is not open for purchases.');
        abort_unless($product->is_active, 422, 'This product is not available.');
        abort_if($shop->user_id === $user->id, 422, 'You cannot buy from your own shop.');

        $qty = max(1, (int) ($data['quantity'] ?? 1));
        abort_if($product->stock < $qty, 422, 'Not enough stock available.');

        if (!$product->is_digital && empty($data['shipping_address'])) {
            abort(422, 'A shipping address is required for this product.');
        }

        $lineTotal = round((float) $product->price * $qty, 2);

        return [$shop, $product, $qty, $lineTotal];
    }

    /**
     * The rate actually applied. The "Sell on Teezer" programme's own
     * commission_rate (admin panel -> Monetization Control Center) wins when
     * an admin has set one - it was a real column nobody consumed before
     * this; falling back to a dedicated global setting otherwise, same
     * pattern as commission_rate/coin_usd_rate for gifts.
     */
    private function commissionRateFor(): float
    {
        $program = MonetizationProgram::where('key', 'affiliate')->first();
        if ($program && $program->commission_rate !== null) {
            return (float) $program->commission_rate;
        }
        return (float) AdminCoinSetting::getValue('shop_commission_rate', 15);
    }

    private function createPendingOrder(Shop $shop, Product $product, int $qty, float $lineTotal, array $data, string $method, string $reference): ShopOrder
    {
        $rate       = $this->commissionRateFor();
        $commission = round($lineTotal * $rate / 100, 2);
        $net        = round($lineTotal - $commission, 2);

        $order = ShopOrder::create([
            'shop_id'           => $shop->id,
            'buyer_id'          => request()->user()->id,
            'status'            => ShopOrder::STATUS_PENDING,
            'payment_method'    => $method,
            'payment_reference' => $reference,
            'currency'          => $product->currency,
            'subtotal'          => $lineTotal,
            'commission_rate'   => $rate,
            'commission_amount' => $commission,
            'net_amount'        => $net,
            'shipping_address'  => $data['shipping_address'] ?? null,
            'buyer_note'        => $data['buyer_note'] ?? null,
        ]);

        ShopOrderItem::create([
            'order_id'     => $order->id,
            'product_id'   => $product->id,
            'product_name' => $product->name,
            'unit_price'   => $product->price,
            'quantity'     => $qty,
            'variation'    => $data['variation'] ?? null,
            'line_total'   => $lineTotal,
        ]);

        return $order;
    }

    /**
     * Credits the seller once an order has settled. Called from inside the
     * caller's own DB::transaction(), after the order row is already locked
     * and re-checked as still pending - this function does no locking of its
     * own beyond CreatorWallet::increment(), which is a safe atomic UPDATE
     * for a pure additive credit (see GiftCommissionService's own note on why
     * that never needs lockForUpdate()).
     */
    private function creditSeller(ShopOrder $order): void
    {
        $order->loadMissing('items', 'shop');

        foreach ($order->items as $item) {
            if (!$item->product_id) {
                continue;
            }
            // Best-effort atomic decrement (UPDATE ... WHERE stock >= qty).
            // A shortfall here is a fulfilment problem for the seller to
            // resolve manually - it must never block crediting money that has
            // already been captured from the buyer.
            Product::where('id', $item->product_id)->where('stock', '>=', $item->quantity)
                ->decrement('stock', $item->quantity);
            Product::where('id', $item->product_id)->increment('sold_count', $item->quantity);
        }

        $order->shop->increment('sold_count', (int) $order->items->sum('quantity'));

        $sellerId = $order->shop->user_id;
        $wallet = CreatorWallet::firstOrCreate(
            ['user_id' => $sellerId],
            ['available_balance' => 0, 'pending_balance' => 0, 'lifetime_earnings' => 0],
        );
        $wallet->increment('available_balance', $order->net_amount);
        $wallet->increment('lifetime_earnings', $order->net_amount);

        $firstItem = $order->items->first();
        CreatorEarning::create([
            'user_id'   => $sellerId,
            'video_id'  => null,
            'source'    => 'shop',
            'amount'    => $order->net_amount,
            'currency'  => $order->currency,
            'status'    => 'paid',
            'note'      => $firstItem
                ? 'Sale: ' . $firstItem->product_name . ($order->items->count() > 1 ? ' +' . ($order->items->count() - 1) . ' more' : '')
                : 'Shop sale',
            'earned_at' => now(),
        ]);
    }

    /* ── POST /shop/orders/stripe/intent ───────────────────────────────── */
    public function createStripeIntent(Request $request): JsonResponse
    {
        $data = $this->validateCheckout($request);
        [$shop, $product, $qty, $lineTotal] = $this->resolveCheckout($data, $request->user());

        $reference = 'SHOP-' . strtoupper(Str::random(10));
        $order = $this->createPendingOrder($shop, $product, $qty, $lineTotal, $data, ShopOrder::METHOD_STRIPE, $reference);

        try {
            $intent = app(StripeService::class)->createPaymentIntent(
                $lineTotal,
                $product->currency,
                $reference,
                ['user_id' => (string) $request->user()->id, 'order_id' => (string) $order->id],
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
                    'amount'        => $lineTotal,
                    'currency'      => $product->currency,
                ],
            ], 201);
        } catch (\Throwable $e) {
            $order->delete();
            return response()->json(['success' => false, 'message' => 'Failed to initialise Stripe payment: ' . $e->getMessage()], 502);
        }
    }

    /* ── POST /shop/orders/stripe/capture ──────────────────────────────── */
    public function captureStripePayment(Request $request): JsonResponse
    {
        $request->validate([
            'order_id'          => 'required|integer',
            'payment_intent_id' => 'required|string',
        ]);

        $user  = $request->user();
        $order = ShopOrder::where('id', $request->order_id)
            ->where('buyer_id', $user->id)
            ->where('status', ShopOrder::STATUS_PENDING)
            ->where('payment_method', ShopOrder::METHOD_STRIPE)
            ->firstOrFail();

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
            return response()->json(['success' => false, 'message' => 'Payment not completed. Status: ' . $intent->status], 422);
        }

        $expectedCents = (int) round(((float) $order->subtotal) * 100);
        if ((int) $intent->amount !== $expectedCents || strtolower((string) $intent->currency) !== strtolower((string) $order->currency)) {
            return response()->json(['success' => false, 'message' => 'Payment amount mismatch.'], 422);
        }

        $credited = false;
        DB::transaction(function () use ($order, $intent, &$credited) {
            $locked = ShopOrder::whereKey($order->id)->lockForUpdate()->first();
            if (!$locked || $locked->status !== ShopOrder::STATUS_PENDING) {
                return;
            }
            $locked->update([
                'status'       => ShopOrder::STATUS_PAID,
                'paid_at'      => now(),
                'payment_meta' => array_merge($locked->payment_meta ?? [], [
                    'stripe_capture' => [
                        'id' => $intent->id, 'status' => $intent->status,
                        'amount' => $intent->amount, 'currency' => $intent->currency,
                    ],
                ]),
            ]);
            $this->creditSeller($locked);
            $credited = true;
        });

        return response()->json([
            'success' => true,
            'message' => $credited ? 'Payment successful.' : 'Payment already processed.',
            'data'    => ['order_id' => $order->id],
        ]);
    }

    /* ── POST /shop/orders/razorpay/create ─────────────────────────────── */
    public function createRazorpayOrder(Request $request): JsonResponse
    {
        $data = $this->validateCheckout($request);
        [$shop, $product, $qty, $lineTotal] = $this->resolveCheckout($data, $request->user());

        $reference = 'SHOP-' . strtoupper(Str::random(10));
        $order = $this->createPendingOrder($shop, $product, $qty, $lineTotal, $data, ShopOrder::METHOD_RAZORPAY, $reference);

        try {
            $rzpOrder = app(RazorpayService::class)->createOrder($lineTotal, $product->currency, $reference);

            $order->update([
                'payment_meta' => ['razorpay_order_id' => $rzpOrder['id'], 'original_reference' => $reference],
            ]);

            return response()->json([
                'success' => true,
                'data'    => [
                    'razorpay_order_id' => $rzpOrder['id'],
                    'order_id'          => $order->id,
                    'amount'            => $lineTotal,
                    'currency'          => $product->currency,
                    'key_id'            => (string) (AdminCoinSetting::getValue('razorpay_key_id') ?: ''),
                ],
            ], 201);
        } catch (\Throwable $e) {
            $order->delete();
            return response()->json(['success' => false, 'message' => 'Failed to initialise Razorpay payment: ' . $e->getMessage()], 502);
        }
    }

    /* ── POST /shop/orders/razorpay/capture ────────────────────────────── */
    public function captureRazorpayPayment(Request $request): JsonResponse
    {
        $request->validate([
            'order_id'            => 'required|integer',
            'razorpay_payment_id' => 'required|string',
            'razorpay_order_id'   => 'required|string',
            'razorpay_signature'  => 'required|string',
        ]);

        $user  = $request->user();
        $order = ShopOrder::where('id', $request->order_id)
            ->where('buyer_id', $user->id)
            ->where('status', ShopOrder::STATUS_PENDING)
            ->where('payment_method', ShopOrder::METHOD_RAZORPAY)
            ->firstOrFail();

        $storedRzpOrderId = data_get($order->payment_meta, 'razorpay_order_id');
        if (!$storedRzpOrderId || !hash_equals((string) $storedRzpOrderId, (string) $request->razorpay_order_id)) {
            return response()->json(['success' => false, 'message' => 'Invalid Razorpay order reference.'], 422);
        }

        $valid = app(RazorpayService::class)->verifySignature(
            $storedRzpOrderId,
            $request->razorpay_payment_id,
            $request->razorpay_signature,
        );
        if (!$valid) {
            return response()->json(['success' => false, 'message' => 'Invalid payment signature.'], 422);
        }

        $credited = false;
        DB::transaction(function () use ($order, $request, $storedRzpOrderId, &$credited) {
            $locked = ShopOrder::whereKey($order->id)->lockForUpdate()->first();
            if (!$locked || $locked->status !== ShopOrder::STATUS_PENDING) {
                return;
            }
            $locked->update([
                'status'       => ShopOrder::STATUS_PAID,
                'paid_at'      => now(),
                'payment_meta' => array_merge($locked->payment_meta ?? [], [
                    'razorpay_payment_id' => $request->razorpay_payment_id,
                    'razorpay_order_id'   => $storedRzpOrderId,
                ]),
            ]);
            $this->creditSeller($locked);
            $credited = true;
        });

        return response()->json([
            'success' => true,
            'message' => $credited ? 'Payment successful.' : 'Payment already processed.',
            'data'    => ['order_id' => $order->id],
        ]);
    }

    /* ── GET /shop/orders ───────────────────────────────────────────────
       The buyer's own purchase history. */
    public function myOrders(Request $request): JsonResponse
    {
        $orders = ShopOrder::where('buyer_id', $request->user()->id)
            ->whereIn('status', ShopOrder::SETTLED_STATUSES)
            ->with(['items', 'shop.user:id,username,name,avatar'])
            ->orderByDesc('created_at')
            ->paginate($request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data'    => collect($orders->items())->map(fn (ShopOrder $o) => $this->toClientArray($o))->values(),
            'meta'    => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),
                'total'        => $orders->total(),
            ],
        ]);
    }

    /** GET /shop/orders/{id} - the buyer's own order detail. */
    public function show(Request $request, int $id): JsonResponse
    {
        $order = ShopOrder::where('id', $id)
            ->where('buyer_id', $request->user()->id)
            ->with(['items', 'shop.user:id,username,name,avatar'])
            ->firstOrFail();

        return response()->json(['success' => true, 'data' => $this->toClientArray($order)]);
    }

    /* ── Seller-facing order management (Shop Settings > Selling > Orders & Returns) ──
       Everything above this point is the BUYER's checkout/purchase-history
       surface (myOrders/show are buyer_id-scoped). These three are the
       seller's own view of orders placed against THEIR shop - a total gap
       until now, see ShopOrderController's class docblock. */

    /** GET /shop/seller/orders - the seller's own shop's orders, optionally filtered by status. */
    public function sellerOrders(Request $request): JsonResponse
    {
        $shop = Shop::where('user_id', $request->user()->id)->firstOrFail();

        $query = ShopOrder::where('shop_id', $shop->id)
            ->with(['items', 'buyer:id,username,name,avatar']);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $orders = $query->orderByDesc('created_at')->paginate($request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data'    => collect($orders->items())->map(fn (ShopOrder $o) => $this->toSellerArray($o))->values(),
            'meta'    => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),
                'total'        => $orders->total(),
            ],
        ]);
    }

    /** GET /shop/seller/orders/{id} - the seller's own order detail. */
    public function sellerOrderShow(Request $request, int $id): JsonResponse
    {
        $shop = Shop::where('user_id', $request->user()->id)->firstOrFail();

        $order = ShopOrder::where('id', $id)
            ->where('shop_id', $shop->id)
            ->with(['items', 'buyer:id,username,name,avatar'])
            ->firstOrFail();

        return response()->json(['success' => true, 'data' => $this->toSellerArray($order)]);
    }

    /**
     * PATCH /shop/seller/orders/{id}/status - mark an order fulfilled or
     * cancelled. Deliberately uses ONLY the existing ShopOrder status enum
     * (no "shipped"/"refunded" invented) - fulfilled is the seller's own
     * "I've sent this" signal, cancelled is theirs to call before an order
     * settles. A settled order's money has already been credited via
     * creditSeller() at capture time (see the Stripe/Razorpay capture
     * methods above), so cancelling a paid/fulfilled order here does NOT
     * reverse that credit - actual refunds are a real-money gateway
     * operation this pass deliberately does not build (see the plan's
     * "explicitly not building" - same reasoning that already excused COD
     * fulfilment as future work in this controller's own class docblock).
     */
    public function updateOrderStatus(Request $request, int $id): JsonResponse
    {
        $shop = Shop::where('user_id', $request->user()->id)->firstOrFail();

        $data = $request->validate([
            'status' => ['required', 'string', 'in:' . ShopOrder::STATUS_FULFILLED . ',' . ShopOrder::STATUS_CANCELLED],
        ]);

        $order = ShopOrder::where('id', $id)->where('shop_id', $shop->id)->firstOrFail();

        if ($data['status'] === ShopOrder::STATUS_FULFILLED) {
            abort_unless(in_array($order->status, ShopOrder::SETTLED_STATUSES, true) || $order->status === ShopOrder::STATUS_COD_PENDING, 422, 'Only a paid order can be marked fulfilled.');
            $order->update(['status' => ShopOrder::STATUS_FULFILLED, 'fulfilled_at' => now()]);
        } else {
            abort_if(in_array($order->status, [ShopOrder::STATUS_FULFILLED, ShopOrder::STATUS_CANCELLED], true), 422, 'This order can no longer be cancelled.');
            $order->update(['status' => ShopOrder::STATUS_CANCELLED]);
        }

        return response()->json(['success' => true, 'data' => $this->toSellerArray($order->fresh(['items', 'buyer']))]);
    }

    private function toSellerArray(ShopOrder $order): array
    {
        return [
            'id'                => $order->id,
            'status'            => $order->status,
            'payment_method'    => $order->payment_method,
            'currency'          => $order->currency,
            'subtotal'          => (float) $order->subtotal,
            'commission_amount' => (float) $order->commission_amount,
            'net_amount'        => (float) $order->net_amount,
            'shipping_address'  => $order->shipping_address,
            'buyer_note'        => $order->buyer_note,
            'paid_at'           => $order->paid_at?->toIso8601String(),
            'fulfilled_at'      => $order->fulfilled_at?->toIso8601String(),
            'created_at'        => $order->created_at?->toIso8601String(),
            'buyer' => [
                'username' => $order->buyer?->username,
                'name'     => $order->buyer?->name,
                'avatar'   => $order->buyer?->avatar ? Storage::url($order->buyer->avatar) : null,
            ],
            'items' => $order->items->map(fn (ShopOrderItem $i) => [
                'product_id'   => $i->product_id,
                'product_name' => $i->product_name,
                'unit_price'   => (float) $i->unit_price,
                'quantity'     => $i->quantity,
                'variation'    => $i->variation,
                'line_total'   => (float) $i->line_total,
            ])->values(),
        ];
    }

    private function toClientArray(ShopOrder $order): array
    {
        return [
            'id'              => $order->id,
            'status'          => $order->status,
            'payment_method'  => $order->payment_method,
            'currency'        => $order->currency,
            'subtotal'        => (float) $order->subtotal,
            'commission_amount' => (float) $order->commission_amount,
            'net_amount'      => (float) $order->net_amount,
            'shipping_address'=> $order->shipping_address,
            'paid_at'         => $order->paid_at?->toIso8601String(),
            'created_at'      => $order->created_at?->toIso8601String(),
            'shop' => [
                'username' => $order->shop?->user?->username,
                'name'     => $order->shop?->shop_name,
                'avatar'   => $order->shop?->user?->avatar ? Storage::url($order->shop->user->avatar) : null,
            ],
            'items' => $order->items->map(fn (ShopOrderItem $i) => [
                'product_id'   => $i->product_id,
                'product_name' => $i->product_name,
                'unit_price'   => (float) $i->unit_price,
                'quantity'     => $i->quantity,
                'variation'    => $i->variation,
                'line_total'   => (float) $i->line_total,
            ])->values(),
        ];
    }
}
