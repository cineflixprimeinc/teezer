<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AdLedgerEntry;
use App\Services\Ads\AdAccountService;
use App\Services\Ads\AdBillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Advertiser wallet (read-only in Phase 1). Top-up + charging land in Phase 5.
 */
class StudioAdAccountController extends Controller
{
    public function __construct(private AdAccountService $accounts) {}

    public function show(Request $request): JsonResponse
    {
        $account = $this->accounts->forUser($request->user()->id);

        $ledger = AdLedgerEntry::where('ad_account_id', $account->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        // TRUE spendable balance = real ledger money in − out. We do NOT surface the
        // raw balance_cents column: admin campaign approval inflates it to cover
        // committed budgets (a delivery grant, not funds the advertiser paid), which
        // would otherwise show a balance the user never added.
        $realBalance = max(0, (int) AdLedgerEntry::where('ad_account_id', $account->id)->sum('amount_cents'));

        return response()->json(['success' => true, 'data' => [
            'account'        => $account,
            // The stable, public Ad Account number (same in admin + ads.teezer.live).
            'account_number' => $account->accountNumber(),
            'balance_cents'  => $realBalance,
            // REAL lifetime spend = actual ad-delivery charges (0 until ads deliver),
            // not a committed-budget figure. Same number the admin + website show.
            'lifetime_spent_cents' => (int) $account->lifetime_spent_cents,
            'currency'       => $account->currency,
            'ledger'         => $ledger,
        ]]);
    }

    /**
     * PATCH /studio/ad-account/settings - persist the advertiser's Business
     * Information + Billing Preferences (edited in the app's Billing screen) to the
     * server so the SAME values show in the admin console (User 360 → Ads & Control).
     * App-specific fields live in `meta`; email/name/timezone/currency map to columns.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'business_name'     => ['nullable', 'string', 'max:120'],
            'account_owner'     => ['nullable', 'string', 'max:120'],
            'account_type'      => ['nullable', 'string', 'max:40'],
            'business_type'     => ['nullable', 'string', 'max:80'],
            'business_email'    => ['nullable', 'string', 'email', 'max:160'],
            'phone'             => ['nullable', 'string', 'max:40'],
            'address'           => ['nullable', 'string', 'max:255'],
            'timezone'          => ['nullable', 'string', 'max:80'],
            'currency'          => ['nullable', 'string', 'max:8'],
            'auto_pay'          => ['nullable', 'boolean'],
            'billing_threshold' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'invoice_frequency' => ['nullable', 'string', 'max:40'],
            'tax_exemption'     => ['nullable', 'boolean'],
        ]);

        $account = $this->accounts->forUser($request->user()->id);
        $meta    = $account->meta ?? [];

        foreach (['business_name', 'account_owner', 'account_type', 'business_type', 'phone', 'address',
                  'auto_pay', 'billing_threshold', 'invoice_frequency', 'tax_exemption'] as $k) {
            if (array_key_exists($k, $data) && $data[$k] !== null) {
                $meta[$k] = $data[$k];
            }
        }

        $update = ['meta' => $meta];
        if (! empty($data['business_email'])) $update['contact_email'] = $data['business_email'];
        if (! empty($data['business_name']))  $update['name']          = $data['business_name'];
        if (! empty($data['timezone']))       $update['timezone']      = $data['timezone'];
        if (! empty($data['currency']))       $update['currency']      = $data['currency'];
        $account->update($update);

        return response()->json(['success' => true, 'message' => 'Ad account settings saved.']);
    }

    public function topup(Request $request, AdBillingService $billing): JsonResponse
    {
        $data = $request->validate([
            'amount_cents' => ['required', 'integer', 'min:100', 'max:100000000'],
        ]);

        $account = $this->accounts->forUser($request->user()->id);

        // Admin freeze / suspend blocks adding funds (on the app AND the website).
        if (($account->meta['funds_frozen'] ?? false) || $account->status !== 'active') {
            return response()->json([
                'success' => false,
                'message' => ($account->meta['funds_frozen'] ?? false)
                    ? 'Your ad funds are frozen. You cannot add funds right now.'
                    : 'Your ad account is not active. You cannot add funds right now.',
                'code'    => 'AD_FUNDS_BLOCKED',
            ], 403);
        }

        // NOTE: production runs this AFTER a successful gateway capture (Stripe/PayPal/
        // Razorpay/IAP). v1 credits the balance directly against a unique reference.
        $ref     = 'topup:' . $account->id . ':' . uniqid();
        $balance = $billing->credit($account, (int) $data['amount_cents'], 'topup', $ref, 'Wallet top-up');

        return response()->json([
            'success' => true,
            'data'    => ['balance_cents' => $balance],
            'message' => 'Balance topped up.',
        ]);
    }
}
