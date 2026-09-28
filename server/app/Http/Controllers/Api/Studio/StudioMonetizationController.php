<?php

namespace App\Http\Controllers\Api\Studio;

use App\Exceptions\InsufficientBalanceException;
use App\Http\Controllers\Controller;
use App\Models\AdminCoinSetting;
use App\Models\AdminCommission;
use App\Models\CreatorEarning;
use App\Models\CreatorMonetizationStatus;
use App\Models\CreatorPayout;
use App\Models\CreatorPayoutMethod;
use App\Models\CreatorRevenueGoal;
use App\Models\CreatorWallet;
use App\Models\TaxForm;
use App\Models\Video;
use App\Services\GiftCommissionService;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class StudioMonetizationController extends Controller
{
    /* ── GET /studio/monetization/overview ─────────────────────────────── */
    public function overview(Request $request): JsonResponse
    {
        $request->validate([
            'range'      => ['nullable', 'in:7d,28d,90d'],
            'start_date' => ['nullable', 'date'],
            'end_date'   => ['nullable', 'date'],
        ]);

        $user = $request->user();

        [$start, $end, $prevStart, $prevEnd] = $this->resolveDateRange($request);

        // Wallet - create if not exists
        $wallet = CreatorWallet::firstOrCreate(
            ['user_id' => $user->id],
            ['available_balance' => 0, 'pending_balance' => 0, 'lifetime_earnings' => 0]
        );

        // Summary numbers
        $totalEarnings  = (float) CreatorEarning::where('user_id', $user->id)->sum('amount');
        $thisMonthStart = now()->startOfMonth();
        $thisMonth      = (float) CreatorEarning::where('user_id', $user->id)
            ->where('earned_at', '>=', $thisMonthStart)
            ->sum('amount');

        $currentPeriod  = (float) CreatorEarning::where('user_id', $user->id)
            ->whereBetween('earned_at', [$start, $end])
            ->sum('amount');
        $prevPeriod     = (float) CreatorEarning::where('user_id', $user->id)
            ->whereBetween('earned_at', [$prevStart, $prevEnd])
            ->sum('amount');

        $growthPct = $prevPeriod > 0
            ? round(($currentPeriod - $prevPeriod) / $prevPeriod * 100, 1)
            : ($currentPeriod > 0 ? 100.0 : 0.0);

        // Revenue overview (daily grouping for charts)
        $dailyRows = CreatorEarning::where('user_id', $user->id)
            ->whereBetween('earned_at', [$start, $end])
            ->selectRaw('earned_at::date as date, SUM(amount) as amount')
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        // Fill missing days with $0 so the chart line is continuous
        $daily = $this->fillDailyGaps($start, $end, $dailyRows->pluck('amount', 'date')->all());

        // Revenue sources (current period)
        $sources = CreatorEarning::where('user_id', $user->id)
            ->whereBetween('earned_at', [$start, $end])
            ->selectRaw('source, SUM(amount) as total')
            ->groupBy('source')
            ->get()
            ->keyBy('source');

        $sourceTotal = (float) $sources->sum('total');

        // Monetization status
        $status = CreatorMonetizationStatus::firstOrCreate(
            ['user_id' => $user->id],
            ['account_standing' => true]
        );

        // Next scheduled payout
        $nextPayout = CreatorPayout::where('user_id', $user->id)
            ->whereIn('status', ['pending', 'processing'])
            ->orderBy('scheduled_at')
            ->first();

        // Default payout method
        $payoutMethod = CreatorPayoutMethod::where('user_id', $user->id)
            ->where('is_default', true)
            ->first();

        // Revenue goal
        $goal = CreatorRevenueGoal::firstOrCreate(
            ['user_id' => $user->id],
            ['monthly_goal' => 10000]
        );

        /*
         * Make the payout wallet agree with the gifts actually received before
         * reporting a balance.
         *
         * Gifts credit coins, withdrawals draw on creator_wallets, and nothing
         * connected the two until recently - so a creator could be looking at
         * "$0.70 earned" on one screen and "$0.00 available" on the other.
         * This recomputes from the gifts themselves and tops up any shortfall.
         *
         * Idempotent (see the service): once reconciled it finds nothing, so
         * running on every read costs one indexed SUM and writes nothing.
         */
        GiftCommissionService::reconcilePayoutWallet($user->id);
        $wallet->refresh();

        // Tax-compliance gate for payouts: earnings accrue freely, but a withdrawal
        // is only released once the creator has an ADMIN-APPROVED tax form.
        $approvedTax = TaxForm::where('user_id', $user->id)->where('status', 'approved')->exists();
        $latestTax   = TaxForm::where('user_id', $user->id)->latest('id')->first();
        $taxStatus   = $approvedTax ? 'approved' : ($latestTax?->status ?? 'missing');
        $taxMessage  = $approvedTax ? null : match ($taxStatus) {
            'under_review' => 'Your tax form is under review. Payouts unlock once it is approved.',
            'rejected'     => 'Your tax form was rejected. Please resubmit it to receive payouts.',
            default        => 'Submit and get your tax form approved to withdraw your earnings.',
        };

        // Top earning content (join videos)
        $topContent = [];
        try {
            $topContent = CreatorEarning::from('creator_earnings as e')
                ->join('videos as v', 'e.video_id', '=', 'v.id')
                ->where('e.user_id', $user->id)
                ->whereBetween('e.earned_at', [$start, $end])
                ->whereNotNull('e.video_id')
                ->selectRaw('
                    v.id, v.title, v.thumbnail_url, v.duration, v.views_count, v.created_at as video_date,
                    SUM(e.amount) as revenue,
                    MAX(e.status) as payout_status
                ')
                ->groupBy('v.id', 'v.title', 'v.thumbnail_url', 'v.duration', 'v.views_count', 'v.created_at')
                ->orderByDesc('revenue')
                ->limit(10)
                ->get()
                ->map(function ($row) {
                    $views = (int) ($row->views_count ?? 0);
                    $rev   = (float) $row->revenue;
                    return [
                        'id'            => $row->id,
                        'title'         => $row->title,
                        'thumbnail_url' => $row->thumbnail_url
                            ? \Illuminate\Support\Facades\Storage::url($row->thumbnail_url)
                            : null,
                        'duration'      => $row->duration,
                        'views'         => $views,
                        'revenue'       => round($rev, 2),
                        'rpm'           => $views > 0 ? round($rev / $views * 1000, 2) : 0,
                        'payout_status' => $row->payout_status ?? 'pending',
                        'created_at'    => $row->video_date,
                    ];
                })
                ->all();
        } catch (\Throwable $e) {
            Log::warning('Monetization top content query failed', ['error' => $e->getMessage()]);
        }

        // Recent transactions (earnings as transactions)
        $transactions = CreatorEarning::where('user_id', $user->id)
            ->orderByDesc('earned_at')
            ->limit(10)
            ->get()
            ->map(fn ($t) => [
                'id'        => $t->id,
                'source'    => $t->source,
                'label'     => CreatorEarning::sourceLabelMap()[$t->source] ?? $t->source,
                'amount'    => (float) $t->amount,
                'currency'  => $t->currency,
                'status'    => $t->status,
                'note'      => $t->note,
                'earned_at' => $t->earned_at?->toIso8601String(),
            ]);

        return response()->json([
            'success' => true,
            'data'    => [
                'range' => $request->input('range', '28d'),

                'summary' => [
                    'total_earnings' => [
                        'amount'  => round($totalEarnings, 2),
                        'growth'  => $growthPct,
                        'up'      => $growthPct >= 0,
                    ],
                    'available_balance' => [
                        'amount'  => round((float) $wallet->available_balance, 2),
                        'growth'  => $growthPct,
                        'up'      => $growthPct >= 0,
                    ],
                    'this_month' => [
                        'amount' => round($thisMonth, 2),
                    ],
                    'estimated_next_payout' => [
                        'amount' => $nextPayout ? round((float) $nextPayout->amount, 2) : round((float) $wallet->available_balance, 2),
                        'date'   => $nextPayout?->scheduled_at?->format('M d, Y') ?? now()->addDays(3)->format('M d, Y'),
                        'days'   => $nextPayout?->scheduled_at ? now()->diffInDays($nextPayout->scheduled_at, true) : 3,
                    ],
                    'revenue_growth' => [
                        'percentage' => $growthPct,
                        'up'         => $growthPct >= 0,
                        'current'    => round($currentPeriod, 2),
                        'previous'   => round($prevPeriod, 2),
                    ],
                ],

                'revenue_overview' => $daily,

                'revenue_sources' => [
                    'ad_revenue'   => round((float) ($sources['ad_revenue']->total   ?? 0), 2),
                    'live_gift'    => round((float) ($sources['live_gift']->total     ?? 0), 2),
                    'subscription' => round((float) ($sources['subscription']->total  ?? 0), 2),
                    'brand_collab' => round((float) ($sources['brand_collab']->total  ?? 0), 2),
                    'series'       => round((float) ($sources['series']->total        ?? 0), 2),
                    // "Sell on Teezer" product sales - see ShopOrderController::creditSeller().
                    'shop'         => round((float) ($sources['shop']->total          ?? 0), 2),
                    'total'        => round($sourceTotal, 2),
                ],

                'monetization_status' => [
                    'account_standing'      => (bool) $status->account_standing,
                    'ad_revenue_eligible'   => (bool) $status->ad_revenue_eligible,
                    'live_gifts_enabled'    => (bool) $status->live_gifts_enabled,
                    'subscriptions_enabled' => (bool) $status->subscriptions_enabled,
                    'tax_info_completed'    => (bool) $status->tax_info_completed,
                ],

                'payouts' => [
                    'available_balance' => round((float) $wallet->available_balance, 2),
                    'pending_balance'   => round((float) $wallet->pending_balance, 2),
                    'lifetime_earnings' => round((float) $wallet->lifetime_earnings, 2),
                    // The admin panel's own minimum, not a hard-coded 50. It is
                    // configurable on the website (min_withdrawal_usd, default
                    // 10) and was being ignored here, so the app quoted a floor
                    // the website did not enforce.
                    'minimum_withdraw'  => (float) AdminCoinSetting::getValue('min_withdrawal_usd', 50),
                    // Coins per USD, so the app can show a coin balance and its
                    // cash value with the same arithmetic the website uses.
                    'coin_usd_rate'     => GiftCommissionService::coinRate(),
                    // Teezer's cut, applied at WITHDRAWAL (gifts credit in
                    // full). Sent so the withdraw screen can show what will
                    // actually be paid before the request is made, rather than
                    // the creator discovering the fee afterwards.
                    'commission_rate'   => (float) AdminCoinSetting::getValue('commission_rate', 30),
                    // Payout eligibility is gated on an approved tax form (enforced in
                    // requestWithdraw). The UI reads this to block/annotate the button.
                    'can_withdraw'      => $approvedTax,
                    'tax' => [
                        'required' => true,
                        'approved' => $approvedTax,
                        'status'   => $taxStatus, // approved | under_review | rejected | missing
                        'message'  => $taxMessage,
                    ],
                    'next_payout'       => $nextPayout ? [
                        'amount'       => round((float) $nextPayout->amount, 2),
                        'date'         => $nextPayout->scheduled_at?->format('M d, Y'),
                        'days_until'   => now()->diffInDays($nextPayout->scheduled_at ?? now()->addDays(3), true),
                        'status'       => $nextPayout->status,
                    ] : null,
                    'payment_method'    => $payoutMethod ? [
                        'provider'       => $payoutMethod->provider,
                        'account_email'  => $payoutMethod->account_email,
                        'masked_account' => $payoutMethod->masked_account,
                    ] : null,
                ],

                'revenue_goal' => [
                    'monthly_goal' => round((float) $goal->monthly_goal, 2),
                    'current'      => round($thisMonth, 2),
                    'currency'     => $goal->currency,
                    'percentage'   => $goal->monthly_goal > 0
                        ? min(100, round($thisMonth / (float) $goal->monthly_goal * 100, 1))
                        : 0,
                ],

                'top_earning_content' => $topContent,
                'recent_transactions' => $transactions,

                'earning_opportunities' => [
                    ['key' => 'ad_revenue',   'label' => 'Short Video Ads', 'desc' => 'Earn from ads on eligible videos',   'status' => $status->ad_revenue_eligible   ? 'active' : 'pending'],
                    ['key' => 'live_gift',    'label' => 'Live Gifts',       'desc' => 'Receive gifts during live streams',  'status' => $status->live_gifts_enabled    ? 'active' : 'pending'],
                    ['key' => 'subscription', 'label' => 'Subscriptions',    'desc' => 'Earn recurring income from fans',    'status' => $status->subscriptions_enabled ? 'active' : 'pending'],
                    ['key' => 'series',       'label' => 'Series Earnings',  'desc' => 'Monetize your series content',       'status' => 'pending'],
                    ['key' => 'brand_collab', 'label' => 'Brand Collabs',    'desc' => 'Partner with brands for revenue',    'status' => 'pending'],
                ],
            ],
        ]);
    }

    /* ── PUT /studio/monetization/goal ─────────────────────────────────── */
    public function updateGoal(Request $request): JsonResponse
    {
        $request->validate([
            'monthly_goal' => ['required', 'numeric', 'min:0', 'max:9999999'],
        ]);

        $goal = CreatorRevenueGoal::updateOrCreate(
            ['user_id' => $request->user()->id],
            ['monthly_goal' => $request->input('monthly_goal')]
        );

        return response()->json(['success' => true, 'data' => ['monthly_goal' => (float) $goal->monthly_goal]]);
    }

    /* ── POST /studio/monetization/withdraw ─────────────────────────────── */
    /**
     * GET /v1/studio/monetization/payout-methods
     *
     * All of the creator's methods, default first. The overview only ever
     * carried the single default one, so the withdraw screen had no way to
     * offer a choice - or to tell a creator with no method at all why the
     * button was refusing them.
     */
    public function payoutMethods(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->payoutMethodList((int) $request->user()->id),
        ]);
    }

    /* ── Payout-method CRUD ─────────────────────────────────────────────────
       These four exist because nothing anywhere wrote to creator_payout_methods:
       the app collected a payout method into device storage, so the Monetization
       tab, the Withdraw screen and Gifts & Coins - all of which read this table -
       reported "No payout method yet" to creators who had set one up. Every
       action below is scoped to the authenticated user's own rows.
    ──────────────────────────────────────────────────────────────────────── */

    /** POST /v1/studio/monetization/payout-methods */
    public function storePayoutMethod(Request $request): JsonResponse
    {
        $data = $this->validatePayoutMethod($request);
        $userId = (int) $request->user()->id;

        $method = new CreatorPayoutMethod();
        $method->user_id = $userId;
        $this->fillPayoutMethod($method, $data);

        // The first method a creator adds is their default whether they asked
        // for it or not - a set of methods with no default cannot be paid.
        $isFirst = !CreatorPayoutMethod::where('user_id', $userId)->exists();
        $method->is_default = $isFirst || (bool) ($data['is_default'] ?? false);
        $method->save();

        if ($method->is_default) $this->clearOtherDefaults($userId, (int) $method->id);

        return response()->json([
            'success' => true,
            'message' => 'Payout method added.',
            'data'    => $this->payoutMethodList($userId),
        ], 201);
    }

    /** PATCH /v1/studio/monetization/payout-methods/{id} */
    public function updatePayoutMethod(Request $request, int $id): JsonResponse
    {
        $data   = $this->validatePayoutMethod($request);
        $userId = (int) $request->user()->id;
        $method = $this->ownedPayoutMethod($userId, $id);

        $this->fillPayoutMethod($method, $data);
        if (!empty($data['is_default'])) $method->is_default = true;
        $method->save();

        if ($method->is_default) $this->clearOtherDefaults($userId, (int) $method->id);

        return response()->json([
            'success' => true,
            'message' => 'Payout method updated.',
            'data'    => $this->payoutMethodList($userId),
        ]);
    }

    /** POST /v1/studio/monetization/payout-methods/{id}/default */
    public function setDefaultPayoutMethod(Request $request, int $id): JsonResponse
    {
        $userId = (int) $request->user()->id;
        $method = $this->ownedPayoutMethod($userId, $id);

        $method->forceFill(['is_default' => true])->save();
        $this->clearOtherDefaults($userId, (int) $method->id);

        return response()->json([
            'success' => true,
            'message' => 'Default payout method updated.',
            'data'    => $this->payoutMethodList($userId),
        ]);
    }

    /** DELETE /v1/studio/monetization/payout-methods/{id} */
    public function destroyPayoutMethod(Request $request, int $id): JsonResponse
    {
        $userId = (int) $request->user()->id;
        $method = $this->ownedPayoutMethod($userId, $id);
        $wasDefault = (bool) $method->is_default;

        $method->delete();

        // Never leave the creator with methods but no default to pay out to.
        if ($wasDefault) {
            $next = CreatorPayoutMethod::where('user_id', $userId)->orderBy('id')->first();
            $next?->forceFill(['is_default' => true])->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Payout method removed.',
            'data'    => $this->payoutMethodList($userId),
        ]);
    }

    /* ── Payout-method internals ───────────────────────────────────────── */

    /** Every method for a creator, default first - the one response shape all
     *  four actions return, so a client never needs a second round trip. */
    private function payoutMethodList(int $userId): array
    {
        return CreatorPayoutMethod::where('user_id', $userId)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get(['id', 'provider', 'account_email', 'masked_account', 'details', 'is_default'])
            ->map(fn ($m) => [
                'id'             => (int) $m->id,
                'provider'       => $m->provider,
                'account_email'  => $m->account_email,
                'masked_account' => $m->masked_account,
                'details'        => $m->details ?: (object) [],
                'is_default'     => (bool) $m->is_default,
            ])
            ->all();
    }

    private function validatePayoutMethod(Request $request): array
    {
        return $request->validate([
            'provider'      => ['required', 'string', 'max:50'],
            'account_email' => ['nullable', 'email', 'max:255'],
            'details'       => ['nullable', 'array'],
            'details.*'     => ['nullable', 'string', 'max:255'],
            'is_default'    => ['nullable', 'boolean'],
        ]);
    }

    private function fillPayoutMethod(CreatorPayoutMethod $method, array $data): void
    {
        $details = array_filter(
            $data['details'] ?? [],
            fn ($v) => $v !== null && $v !== '',
        );

        $method->provider      = $data['provider'];
        $method->account_email = $data['account_email'] ?? null;
        $method->details       = $details ?: null;
        $method->masked_account = $this->maskPayoutAccount($data['provider'], $data['account_email'] ?? null, $details);
    }

    /**
     * The one-line summary every screen shows. Built server-side so the app,
     * the website and the admin panel cannot drift into three different
     * renderings of the same account.
     */
    private function maskPayoutAccount(string $provider, ?string $email, array $details): string
    {
        $account = $details['bankAccount'] ?? null;
        if ($account !== null && $account !== '') {
            $tail = substr($account, -4);
            $bank = $details['bankName'] ?? null;
            return $bank ? "•••• {$tail} · {$bank}" : "•••• {$tail}";
        }

        // Wallets (Khalti, eSewa, UPI, PhonePe) are identified by their mobile
        // number, and the card names the wallet rather than the word "Wallets".
        $phone = $details['walletPhone'] ?? null;
        if ($phone !== null && $phone !== '') {
            $wallet = $details['walletProvider'] ?? $provider;
            $digits = preg_replace('/\s+/', '', $phone);
            $tail   = strlen($digits) > 4 ? '•••• ' . substr($digits, -4) : $digits;
            return "{$wallet} · {$tail}";
        }
        if (!empty($details['walletProvider'])) {
            return $details['walletProvider'] . ($email ? " · {$email}" : '');
        }

        $addr = $email
            ?: ($details['paypalEmail'] ?? $details['stripeEmail'] ?? $details['wiseEmail'] ?? null);

        return $addr ?: $provider;
    }

    /** 404s rather than 403s on someone else's row - a creator has no business
     *  learning that another creator's payout method id exists. */
    private function ownedPayoutMethod(int $userId, int $id): CreatorPayoutMethod
    {
        return CreatorPayoutMethod::where('user_id', $userId)->where('id', $id)->firstOrFail();
    }

    private function clearOtherDefaults(int $userId, int $keepId): void
    {
        CreatorPayoutMethod::where('user_id', $userId)
            ->where('id', '!=', $keepId)
            ->where('is_default', true)
            ->update(['is_default' => false]);
    }

    public function requestWithdraw(Request $request): JsonResponse
    {
        // The admin panel's minimum, not a hard-coded 50 - it is configurable on
        // the website and the two were free to disagree.
        $minimum = (float) AdminCoinSetting::getValue('min_withdrawal_usd', 50);

        $request->validate([
            'amount' => ['required', 'numeric', 'min:' . $minimum],
        ]);

        $user   = $request->user();
        $amount = round((float) $request->input('amount'), 2);

        // Tax compliance gate: payouts are only released once the creator has a tax
        // form APPROVED by an admin. Submitting isn't enough - it must be approved,
        // so an "under review" or "rejected" form still blocks the payout. This does
        // not touch earnings (they keep accruing); it only holds the withdrawal.
        if (! TaxForm::where('user_id', $user->id)->where('status', 'approved')->exists()) {
            $latest = TaxForm::where('user_id', $user->id)->latest('id')->first();
            $reason = match ($latest?->status) {
                'under_review' => 'Your tax form is under review. Payouts unlock once it is approved.',
                'rejected'     => 'Your tax form was rejected. Please resubmit it to receive payouts.',
                default        => 'Submit and get your tax form approved to withdraw your earnings.',
            };
            return response()->json([
                'success'    => false,
                'message'    => $reason,
                'code'       => 'TAX_FORM_REQUIRED',
                'tax_status' => $latest?->status ?? 'missing',
            ], 422);
        }

        // Optional, but the client should send one: a stable key per withdrawal attempt.
        // Without it a double-tap or a retry after a timeout creates two payouts.
        $key = $request->header('Idempotency-Key');
        if ($key !== null && ! preg_match('/^[A-Za-z0-9\-_]{8,64}$/', $key)) {
            return response()->json(['success' => false, 'message' => 'Invalid Idempotency-Key.'], 422);
        }

        CreatorWallet::firstOrCreate(['user_id' => $user->id]);

        // Replay of a key we have already honoured: return the original payout rather
        // than paying out a second time.
        if ($key !== null) {
            $prior = CreatorPayout::where('user_id', $user->id)
                ->where('idempotency_key', $key)
                ->first();

            if ($prior) {
                return $this->withdrawResponse($prior, replayed: true);
            }
        }

        try {
            $payout = DB::transaction(function () use ($user, $amount, $key) {
                // Lock the wallet row, THEN read the balance. The check used to sit
                // outside the transaction against an unlocked read, so two concurrent
                // requests could both see a sufficient balance and both decrement it,
                // driving the balance negative and paying the creator twice.
                $wallet = CreatorWallet::where('user_id', $user->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                if ((float) $wallet->available_balance < $amount) {
                    throw new InsufficientBalanceException;
                }

                /*
                 * Teezer's cut is taken HERE, not when the gift arrived.
                 *
                 * Gifts credit in full, so `available_balance` is everything the
                 * creator was sent; the commission applies once, on the way out.
                 * `amount` stays the GROSS they asked for and is what the balance
                 * is debited by - `net_amount` is what actually gets paid.
                 *
                 * The rate is copied onto the row rather than looked up later, so
                 * changing the setting cannot rewrite what an old payout charged.
                 */
                $rate       = (float) AdminCoinSetting::getValue('commission_rate', 30);
                $commission = round($amount * $rate / 100, 2);
                $net        = round($amount - $commission, 2);

                $wallet->decrement('available_balance', $amount);
                $wallet->increment('pending_balance', $amount);

                $payout = CreatorPayout::create([
                    'user_id'           => $user->id,
                    'idempotency_key'   => $key,
                    'amount'            => $amount,
                    'commission_rate'   => $rate,
                    'commission_amount' => $commission,
                    'net_amount'        => $net,
                    'status'            => 'pending',
                    'scheduled_at'      => now()->addDays(3),
                ]);

                // Platform revenue is booked when it is actually earned - on the
                // payout, not on every gift that may never be withdrawn.
                if ($commission > 0) {
                    AdminCommission::create([
                        'source_type'          => 'payout',
                        'source_id'            => $payout->id,
                        'user_id'              => $user->id,
                        // The coin columns are COINS - that is what the gift path
                        // writes into this same table. Converting at the admin's
                        // configured rate rather than a hard-coded 100 is what
                        // keeps the two sources in one unit: they agree only
                        // while the rate happens to be 100, and any revenue
                        // report summing this column would silently mix coins
                        // with cents the moment an admin changed it.
                        'gross_coins'          => (int) round($amount * GiftCommissionService::coinRate()),
                        'commission_rate'      => $rate,
                        'commission_coins'     => (int) round($commission * GiftCommissionService::coinRate()),
                        'commission_value_usd' => $commission,
                    ]);
                }

                return $payout;
            });
        } catch (InsufficientBalanceException) {
            return response()->json(['success' => false, 'message' => 'Insufficient balance.'], 422);
        } catch (UniqueConstraintViolationException) {
            // Two requests with the same key raced past the lookup above. The unique
            // index let exactly one through; return that one.
            $prior = CreatorPayout::where('user_id', $user->id)
                ->where('idempotency_key', $key)
                ->firstOrFail();

            return $this->withdrawResponse($prior, replayed: true);
        }

        return $this->withdrawResponse($payout);
    }

    private function withdrawResponse(CreatorPayout $payout, bool $replayed = false): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $replayed
                ? 'Withdrawal already requested. Funds will arrive in 3 business days.'
                : 'Withdrawal requested. Funds will arrive in 3 business days.',
            'data' => [
                'payout_id' => $payout->id,
                'amount'    => (float) $payout->amount,
                'scheduled' => $payout->scheduled_at?->format('M d, Y'),
                'replayed'  => $replayed,
            ],
        ]);
    }

    /* ── Helpers ─────────────────────────────────────────────────────────── */

    private function resolveDateRange(Request $request): array
    {
        $days = match ($request->input('range', '28d')) {
            '7d'  => 7,
            '90d' => 90,
            default => 28,
        };

        if ($request->filled('start_date') && $request->filled('end_date')) {
            $start = Carbon::parse($request->input('start_date'))->startOfDay();
            $end   = Carbon::parse($request->input('end_date'))->endOfDay();
        } else {
            $end   = now()->endOfDay();
            $start = now()->subDays($days - 1)->startOfDay();
        }

        $prevEnd   = (clone $start)->subSecond();
        $prevStart = (clone $prevEnd)->subDays($days - 1)->startOfDay();

        return [$start, $end, $prevStart, $prevEnd];
    }

    private function fillDailyGaps(Carbon $start, Carbon $end, array $data): array
    {
        $result = [];
        $cur    = $start->clone()->startOfDay();
        $last   = $end->clone()->startOfDay();

        while ($cur->lte($last)) {
            $key = $cur->format('Y-m-d');
            $result[] = ['date' => $key, 'amount' => (float) ($data[$key] ?? 0)];
            $cur->addDay();
        }

        return $result;
    }
}
