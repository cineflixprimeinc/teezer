<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminCoinSetting;
use App\Models\VerificationPayment;
use App\Models\VerificationRequest;
use App\Services\PayPalService;
use App\Services\StripeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Paying for a Blue Verified subscription.
 *
 * Deliberately a mirror of StudioWalletCoinsController's flow - same gateways, same
 * create-then-capture shape, same toggles - because a second, subtly different payment
 * path is how one of them ends up with a security hole the other already fixed.
 *
 * The rule that governs everything here: a payment is only ever marked paid after the
 * SERVER has asked the gateway. The client telling us "it worked" means nothing.
 */
class VerificationPaymentController extends Controller
{
    private const METHODS = ['card', 'paypal', 'applepay', 'googlepay', 'upi', 'bank'];

    /* ── GET /verification/payment/methods ─────────────────────────────────── */

    /**
     * Which gateways are on, and what this creator owes.
     *
     * Reuses the same AdminCoinSetting toggles the coins page uses, so an admin turning
     * PayPal off turns it off everywhere rather than in one place and not the other.
     */
    public function methods(Request $request): JsonResponse
    {
        $user = $request->user();

        $draft = VerificationRequest::where('user_id', $user->id)
            ->whereIn('status', ['draft', 'rejected'])
            ->latest()
            ->first();

        $planId = $draft?->plan_id;
        $price  = VerificationPayment::priceFor($planId);

        return response()->json([
            'success' => true,
            'data'    => [
                'plan_id'   => $planId,
                'amount_usd'=> $price,
                'currency'  => 'USD',
                'methods'   => [
                    'card'      => (bool) AdminCoinSetting::getValue('card_enabled', 1),
                    'paypal'    => (bool) AdminCoinSetting::getValue('paypal_enabled', 1),
                    'applepay'  => (bool) AdminCoinSetting::getValue('applepay_enabled', 1),
                    'googlepay' => (bool) AdminCoinSetting::getValue('googlepay_enabled', 1),
                    'upi'       => (bool) AdminCoinSetting::getValue('upi_enabled', 1),
                    'bank'      => (bool) AdminCoinSetting::getValue('bank_enabled', 1),
                ],
                // A payment already settled for this application - the client uses this to
                // skip straight to Submit rather than charging someone twice.
                'paid'      => $draft ? $this->paidFor($draft) !== null : false,

                // Store product ids for the APPS. Sent from here rather than hard-coded in
                // the app, because they must match App Store Connect / the Play Console
                // exactly and are configured by whoever set the store up.
                'iap_enabled' => [
                    'ios'     => app(\App\Services\IapService::class)->isEnabled('ios'),
                    'android' => app(\App\Services\IapService::class)->isEnabled('android'),
                ],
                'iap_products' => $this->iapProducts($planId),
            ],
        ]);
    }

    /** The store product id for this creator's plan, per platform. */
    private function iapProducts(?string $planId): array
    {
        if (! $planId) return [];

        $iap = app(\App\Services\IapService::class);

        return [
            'ios'     => $iap->productIdFor('ios', $planId),
            'android' => $iap->productIdFor('android', $planId),
        ];
    }

    /** The settled payment for an application, if there is one. */
    private function paidFor(VerificationRequest $req): ?VerificationPayment
    {
        return VerificationPayment::where('verification_request_id', $req->id)
            ->where('purpose', VerificationPayment::PURPOSE_APPLICATION)
            ->paid()
            ->latest()
            ->first();
    }

    /* ── POST /verification/payment/order ──────────────────────────────────── */

    /**
     * Start a payment for the current application.
     *
     * The amount comes from the PLAN on the server. The client picks a gateway; it does
     * not get to name a price.
     */
    public function createOrder(Request $request): JsonResponse
    {
        $request->validate([
            'payment_method' => ['required', 'string', Rule::in(self::METHODS)],
        ]);

        $user = $request->user();

        $draft = VerificationRequest::where('user_id', $user->id)
            ->where('status', 'draft')
            ->where('verification_step', 'documents_uploaded')
            ->latest()
            ->first();

        if (! $draft) {
            return response()->json([
                'success' => false,
                'message' => 'Upload your documents before paying.',
            ], 422);
        }

        if ($this->paidFor($draft)) {
            return response()->json([
                'success' => false,
                'message' => 'This application is already paid. You can submit it for review.',
            ], 422);
        }

        $amount = VerificationPayment::priceFor($draft->plan_id);
        if ($amount === null) {
            return response()->json([
                'success' => false,
                'message' => 'No price is configured for your plan. Please choose a plan again.',
            ], 422);
        }

        if (! (bool) AdminCoinSetting::getValue("{$request->payment_method}_enabled", 1)) {
            return response()->json([
                'success' => false,
                'message' => 'That payment method is currently unavailable.',
            ], 422);
        }

        $reference = 'BV-' . strtoupper(Str::random(10));

        $payment = VerificationPayment::create([
            'user_id'                 => $user->id,
            'verification_request_id' => $draft->id,
            'purpose'                 => VerificationPayment::PURPOSE_APPLICATION,
            'plan_id'                 => $draft->plan_id,
            'amount_usd'              => $amount,
            'currency'                => 'USD',
            'payment_method'          => $request->payment_method,
            'payment_status'          => 'pending',
            'payment_reference'       => $reference,
        ]);

        $data = [
            'payment_id'     => $payment->id,
            'reference'      => $reference,
            'amount_usd'     => (float) $amount,
            'payment_method' => $payment->payment_method,
            'payment_status' => $payment->payment_status,
        ];

        if ($request->payment_method === 'paypal') {
            try {
                $paypalOrderId = app(PayPalService::class)->createOrder(
                    (float) $amount,
                    'USD',
                    $reference,
                    'Teezer Blue Verified - ' . ucfirst((string) $draft->plan_id),
                );

                $payment->update(['payment_meta' => ['paypal_order_id' => $paypalOrderId]]);
                $data['paypal_order_id'] = $paypalOrderId;
            } catch (\Throwable) {
                // Don't leave a pending row behind for a payment that never started.
                $payment->delete();

                return response()->json([
                    'success' => false,
                    'message' => 'Couldn\'t start the PayPal payment. Please try again.',
                ], 502);
            }
        }

        return response()->json(['success' => true, 'data' => $data], 201);
    }

    /* ── POST /verification/payment/stripe/intent ──────────────────────────── */

    public function stripeIntent(Request $request): JsonResponse
    {
        $request->validate(['payment_id' => 'required|integer']);

        $payment = $this->ownedPending($request, ['card', 'applepay', 'googlepay']);
        if ($payment instanceof JsonResponse) return $payment;

        try {
            $intent = app(StripeService::class)->createPaymentIntent(
                (float) $payment->amount_usd,
                'USD',
                (string) $payment->payment_reference,
                ['user_id' => (string) $payment->user_id, 'verification_payment_id' => (string) $payment->id],
            );

            $payment->update([
                'payment_meta' => array_merge($payment->payment_meta ?? [], [
                    'stripe_intent_id' => $intent->id,
                ]),
            ]);

            return response()->json([
                'success' => true,
                'data'    => [
                    'client_secret' => $intent->client_secret,
                    'payment_id'    => $payment->id,
                    'amount_usd'    => (float) $payment->amount_usd,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Couldn\'t start the card payment. Please try again.',
            ], 502);
        }
    }

    /* ── POST /verification/payment/stripe/capture ─────────────────────────── */

    public function stripeCapture(Request $request): JsonResponse
    {
        $request->validate([
            'payment_id'        => 'required|integer',
            'payment_intent_id' => 'required|string',
        ]);

        $payment = $this->ownedPending($request, ['card', 'applepay', 'googlepay']);
        if ($payment instanceof JsonResponse) return $payment;

        // SECURITY: the intent must be the one WE created for THIS payment. Without this,
        // one genuinely-succeeded intent could be replayed against unlimited other
        // payments to get verified for free. (Same guard as the coin orders.)
        $stored = data_get($payment->payment_meta, 'stripe_intent_id');
        if (! $stored || ! hash_equals((string) $stored, (string) $request->payment_intent_id)) {
            return response()->json(['success' => false, 'message' => 'Invalid payment reference.'], 422);
        }

        try {
            $intent = app(StripeService::class)->retrievePaymentIntent($stored);
        } catch (\Throwable) {
            return response()->json(['success' => false, 'message' => 'Couldn\'t verify the payment.'], 502);
        }

        if ($intent->status !== 'succeeded') {
            return $this->markFailed($payment, 'Card payment not completed (' . $intent->status . ').');
        }

        // The gateway's amount must match what we asked for. A client that can pay less
        // than the plan price is a client that pays one cent for a $20 badge.
        $paidUsd = ((int) $intent->amount_received) / 100;
        if ($paidUsd + 0.001 < (float) $payment->amount_usd) {
            return $this->markFailed($payment, 'The amount paid was less than the plan price.');
        }

        return $this->markPaid($payment);
    }

    /* ── POST /verification/payment/paypal/capture ─────────────────────────── */

    public function paypalCapture(Request $request): JsonResponse
    {
        $request->validate([
            'payment_id'      => 'required|integer',
            'paypal_order_id' => 'required|string',
        ]);

        $payment = $this->ownedPending($request, ['paypal']);
        if ($payment instanceof JsonResponse) return $payment;

        $stored = data_get($payment->payment_meta, 'paypal_order_id');
        if (! $stored || ! hash_equals((string) $stored, (string) $request->paypal_order_id)) {
            return response()->json(['success' => false, 'message' => 'Invalid payment reference.'], 422);
        }

        try {
            $result = app(PayPalService::class)->captureOrder($stored);
        } catch (\Throwable) {
            return $this->markFailed($payment, 'PayPal could not capture this payment.');
        }

        if (($result['status'] ?? null) !== 'COMPLETED') {
            return $this->markFailed($payment, 'PayPal payment not completed.');
        }

        return $this->markPaid($payment, ['paypal_capture' => $result]);
    }

    /* ── POST /verification/payment/iap/verify ─────────────────────────────── */

    /**
     * Apple In-App Purchase / Google Play Billing.
     *
     * The app buys through the store SDK and hands us the receipt. That receipt proves
     * nothing until Apple or Google says so - a client can post any string - so the server
     * asks the store, every time, before a single row is marked paid.
     *
     * No amount is sent by the client here either: the STORE holds the price. We only
     * check that the receipt is genuine, is for the product mapped to this creator's plan,
     * and hasn't already been used.
     */
    public function verifyIap(Request $request): JsonResponse
    {
        $request->validate([
            'platform' => ['required', 'string', Rule::in(['ios', 'android'])],
            'receipt'  => ['required', 'string'],   // iOS: base64 receipt. Android: purchase token.
        ]);

        $user     = $request->user();
        $platform = $request->string('platform')->toString();
        $iap      = app(\App\Services\IapService::class);

        if (! $iap->isEnabled($platform)) {
            return response()->json([
                'success' => false,
                'message' => 'In-app purchases are not available right now.',
            ], 422);
        }

        $draft = VerificationRequest::where('user_id', $user->id)
            ->where('status', 'draft')
            ->where('verification_step', 'documents_uploaded')
            ->latest()
            ->first();

        if (! $draft) {
            return response()->json([
                'success' => false,
                'message' => 'Upload your documents before paying.',
            ], 422);
        }

        if ($this->paidFor($draft)) {
            return response()->json([
                'success' => false,
                'message' => 'This application is already paid.',
            ], 422);
        }

        $productId = $iap->productIdFor($platform, (string) $draft->plan_id);
        if (! $productId) {
            return response()->json([
                'success' => false,
                'message' => 'This plan is not available for in-app purchase.',
            ], 422);
        }

        try {
            $result = $platform === 'ios'
                ? $iap->verifyApple($request->string('receipt')->toString(), $productId)
                : $iap->verifyGoogle($request->string('receipt')->toString(), $productId);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }

        // REPLAY GUARD. One purchase, one badge. Without this the same genuine receipt
        // could be posted from any number of accounts - every one of them verified, for
        // the price of a single subscription.
        $already = VerificationPayment::where('payment_reference', $result['transaction_id'])
            ->where('payment_status', 'paid')
            ->exists();

        if ($already) {
            return response()->json([
                'success' => false,
                'message' => 'This purchase has already been used.',
            ], 422);
        }

        $payment = VerificationPayment::create([
            'user_id'                 => $user->id,
            'verification_request_id' => $draft->id,
            'purpose'                 => VerificationPayment::PURPOSE_APPLICATION,
            'plan_id'                 => $draft->plan_id,
            // The store took the money at ITS price. We record the plan price for our own
            // books, and do not pretend to have charged it ourselves.
            'amount_usd'              => VerificationPayment::priceFor($draft->plan_id) ?? 0,
            'currency'                => 'USD',
            'payment_method'          => $platform === 'ios' ? 'apple_iap' : 'google_iap',
            'payment_status'          => 'paid',
            'payment_reference'       => $result['transaction_id'],
            'payment_meta'            => [
                'platform'   => $platform,
                'product_id' => $result['product_id'],
                'expires_at' => $result['expires_at'],
            ],
            'paid_at'                 => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Purchase verified. You can now submit your application.',
            'data'    => ['payment_id' => $payment->id, 'payment_status' => 'paid'],
        ]);
    }

    /* ── Shared ────────────────────────────────────────────────────────────── */

    /** The caller's own pending payment, or a 4xx response. Never someone else's. */
    private function ownedPending(Request $request, array $methods): VerificationPayment|JsonResponse
    {
        $payment = VerificationPayment::where('id', $request->integer('payment_id'))
            ->where('user_id', $request->user()->id)
            ->whereIn('payment_method', $methods)
            ->first();

        if (! $payment) {
            return response()->json(['success' => false, 'message' => 'Payment not found.'], 404);
        }

        if ($payment->isPaid()) {
            return response()->json(['success' => false, 'message' => 'This payment is already complete.'], 422);
        }

        return $payment;
    }

    private function markPaid(VerificationPayment $payment, array $meta = []): JsonResponse
    {
        $payment->update([
            'payment_status' => 'paid',
            'paid_at'        => now(),
            'failed_at'      => null,
            'failure_reason' => null,
            'payment_meta'   => array_merge($payment->payment_meta ?? [], $meta),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Payment received. You can now submit your application.',
            'data'    => ['payment_id' => $payment->id, 'payment_status' => 'paid'],
        ]);
    }

    /**
     * A failed payment stays on the record and the user goes back to the payment step.
     *
     * 422, not 500: nothing broke - the payment simply didn't go through, and the client
     * should show the reason and let them try another method.
     */
    private function markFailed(VerificationPayment $payment, string $reason): JsonResponse
    {
        $payment->update([
            'payment_status' => 'failed',
            'failed_at'      => now(),
            'failure_reason' => $reason,
        ]);

        return response()->json([
            'success' => false,
            'message' => $reason,
            'data'    => ['payment_id' => $payment->id, 'payment_status' => 'failed'],
        ], 422);
    }
}
