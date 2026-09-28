<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminCoinSetting;
use App\Models\PremiumComparison;
use App\Models\PremiumFaq;
use App\Models\PremiumFeature;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\CouponService;
use App\Services\PlanAvailabilityService;
use App\Services\StorageService;
use App\Services\PlanFeatureService;
use App\Services\PlanPricingService;
use App\Services\PricingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * The premium page, in one request.
 *
 * Everything the screen draws comes from here - tiers, the "what you get" grid,
 * the comparison matrix, the questions - so marketing copy and pricing change
 * in the admin panel rather than in an app release. The screen renders whatever
 * it is sent and hides any section that comes back empty, which is what lets a
 * whole block be retired by disabling its rows.
 *
 * Public, and deliberately does NOT include the caller's own subscription. That
 * already has an endpoint (GET /studio/subscriptions) that the app calls
 * alongside this one; duplicating it here would give the screen two sources of
 * truth for whether the user is already subscribed.
 */
class PremiumController extends Controller
{
    public function index(Request $request)
    {
        /**
         * Which surface is asking. The app may be priced differently from the
         * website (Apple and Google take 15-30%), and `surface` is what decides
         * which USD base the quote is built from.
         */
        $surface = $request->query('surface') === 'app' ? 'app' : 'web';

        /**
         * The exact device, for availability. Distinct from `surface`, which is
         * only ever web|app and exists to pick a price: a plan can be sold on
         * Android but not iOS, and that is invisible at surface granularity.
         * A client that sends nothing is not restricted - see
         * PlanAvailabilityService::platformAllowed.
         */
        $platform  = $request->query('platform');
        $placement = $request->query('placement', 'premium_page');

        /* NOT enabled(): that scope tests is_enabled, which is false for a
           temporarily-unavailable plan - and the entire reason that state exists
           is that the plan keeps its place on the page and explains itself
           rather than vanishing. Archived and disabled are excluded here; the
           rest of the rules are per-caller and cannot be done in SQL. */
        $plans = SubscriptionPlan::whereIn('status', ['active', 'temporarily_unavailable'])
            ->orderBy('sort')->orderBy('id')->get();

        $pricing = app(PricingService::class);
        $country = $pricing->detectCountry($request);
        $currency = $pricing->currencyForCountry($country);

        /* Availability is resolved HERE, for every client, rather than in each
           app. The website, the mobile app and anything built later all read
           this endpoint, so they inherit one answer instead of reimplementing
           the rules and drifting apart. */
        $availability = app(PlanAvailabilityService::class);
        $featureSvc   = app(PlanFeatureService::class);
        $availCtx = ['platform' => $platform, 'country' => $country, 'placement' => $placement];

        $plans = $plans
            ->filter(fn (SubscriptionPlan $p) => $availability->visible($p, $availCtx))
            ->values();

        /* Purchasability is a per-plan verdict, computed once and attached, so
           the client renders a disabled card with the server's reason instead of
           guessing one. Deliberately not a filter: a plan the caller cannot buy
           yet is still worth showing - one that silently disappears reads as a
           bug and generates support tickets. */
        $verdicts = $plans->mapWithKeys(fn (SubscriptionPlan $p) => [
            $p->key => $availability->purchasable($p, $request->user(), $availCtx),
        ]);

        $planKeys = $plans->pluck('key')->all();

        // "First one wins" rather than trusting the data to hold exactly one
        // default: an admin mid-edit can easily have none or two, and neither
        // should be able to render a page with nothing selected.
        $defaultKey = $plans->firstWhere('is_default', true)?->key
            ?? $plans->firstWhere('is_popular', true)?->key
            ?? $plans->first()?->key;

        return response()->json([
            'success' => true,
            'data' => [
                'plans' => $plans->map(fn (SubscriptionPlan $p) => [
                    'key'         => $p->key,
                    'name'        => $p->name,
                    'tagline'     => $p->tagline,
                    // The server's verdict, so no client decides this itself.
                    /* Structured entitlements, keyed by feature. The `features`
                       array below stays exactly as it was - it is the display
                       bullets the plan card already prints - and this is the
                       machine-readable answer beside it, so a client asks
                       entitlements['upload_quality'] instead of parsing
                       marketing copy to decide what someone paid for. An absent
                       key means NOT included; that is the one reading which
                       cannot be confused with "included but unlimited". */
                    /* Per-plan trial. NULL on the row means "use the global",
                       which is why this coalesces rather than defaulting to 0 -
                       0 is a real and different answer meaning this tier has no
                       trial, and the two must not collapse into each other. */
                    'trial_days'         => $p->trial_days !== null
                        ? (int) $p->trial_days
                        : (int) AdminCoinSetting::getValue('premium_trial_days', 7),
                    'entitlements'       => $featureSvc->entitlements($p),
                    'can_purchase'       => (bool) ($verdicts[$p->key]['ok'] ?? true),
                    'unavailable_reason' => $verdicts[$p->key]['reason'] ?? null,
                    'unavailable_message' => $verdicts[$p->key]['message'] ?? null,
                    'status'             => $p->status ?? 'active',
                    // Legacy per-row local price. Kept until every tier has a
                    // USD base, then it stops being read at all.
                    'price'       => (float) $p->price,
                    'currency'    => $p->currency,
                    // The quote. USD base for this surface, converted to the
                    // caller's currency and rounded to that market's rule. An
                    // unsupported currency comes back as USD with
                    // is_converted=false rather than as an error - see
                    // PricingService::quote.
                    'pricing'     => $this->quoteFor($pricing, $p, $surface, $currency, $country),
                    'period'      => $p->period,
                    'features'    => $p->features ?? [],
                    'is_popular'  => $p->is_popular,
                    'badge_label' => $p->badge_label,
                    'theme'       => $p->theme,
                    'product_id'  => $p->productIdFor($request->query('platform')),
                ])->values(),

                'default_plan' => $defaultKey,

                // What the whole page was priced in, so a client can label the
                // currency once rather than inferring it from a row.
                'surface'  => $surface,
                'country'  => $country,
                'currency' => $currency,

                /* Where the caller is, and whether we sell here.
                   Both clients render "Available in <country>" from this and
                   open the full list in a popup - so the answer comes from the
                   same country table the admin enables rows in, rather than
                   each app shipping its own hardcoded list that goes stale the
                   moment a market is switched off. */
                'availability' => $this->availabilityBlock($country, $plans, $availability, $platform),

                'features' => PremiumFeature::enabled()->orderBy('sort')->orderBy('id')->get()
                    ->map(fn (PremiumFeature $f) => [
                        'icon'        => $f->icon,
                        'title'       => $f->title,
                        'description' => $f->description,
                        'badge'       => $f->badge,
                    ])->values(),

                'comparison' => PremiumComparison::enabled()->orderBy('sort')->orderBy('id')->get()
                    ->map(function (PremiumComparison $row) use ($planKeys) {
                        // Only emit columns for tiers that still exist, so a
                        // retired plan cannot leave an orphan column behind.
                        $values = collect($row->values ?? [])
                            ->only($planKeys)
                            ->all();

                        return [
                            'label'          => $row->label,
                            'values'         => (object) $values,
                            'highlight_plan' => in_array($row->highlight_plan, $planKeys, true)
                                ? $row->highlight_plan
                                : null,
                        ];
                    })->values(),

                'faq' => PremiumFaq::enabled()->orderBy('sort')->orderBy('id')->get()
                    ->map(fn (PremiumFaq $q) => [
                        'question' => $q->question,
                        'answer'   => $q->answer,
                    ])->values(),

                'trial' => [
                    'enabled' => (bool) AdminCoinSetting::getValue('premium_trial_enabled', 1),
                    'days'    => (int) AdminCoinSetting::getValue('premium_trial_days', 7),
                ],

                // The billing small-print under the sticky CTA. A setting
                // rather than app copy because it is the kind of wording that
                // changes for legal reasons and cannot wait for a release.
                'legal_note' => (string) AdminCoinSetting::getValue(
                    'premium_legal_note',
                    'Billed through your app store. Cancel anytime - access continues until the end of the billing period you already paid for.',
                ),

                'social_proof' => $this->socialProof(),
            ],
        ]);
    }

    /**
     * One tier's quote, or null when the tier has no USD base price yet.
     *
     * Null is deliberate and must not become zero: a tier nobody has priced is
     * "not for sale yet", and a 0.00 would render as free.
     */
    private function quoteFor(PricingService $pricing, SubscriptionPlan $p, string $surface, string $currency, string $country): ?array
    {
        /* One resolver, shared with checkout.
           Display used to read base_price_usd here while
           StudioSubscriptionController charged a flat AdminCoinSetting value
           that knew nothing about tiers - so Pro displayed $12.99 and charged
           $4.99. Both paths now call PlanPricingService, which is the only way
           those two numbers cannot drift apart again. */
        $resolved = app(PlanPricingService::class)->resolve($p, $country, $currency, $surface, $p->period);

        if ($resolved['source'] === 'none') {
            return null;
        }

        return [
            'amount'             => $resolved['amount'],
            'currency'           => $resolved['currency'],
            'formatted'          => $resolved['formatted'],
            'is_converted'       => $resolved['is_converted'],
            'is_override'        => $resolved['is_override'],
            /* Discount, computed from the money so the percentage can never
               disagree with the prices it describes. compare_at is already
               converted through the same rate as `amount`, so the saving is
               real and not an exchange-rate artefact. */
            'compare_at'         => $resolved['compare_at'] ?? null,
            'discount_amount'    => $resolved['discount_amount'] ?? 0,
            'discount_percent'   => $resolved['discount_percent'] ?? 0,
            'discount_label'     => $resolved['discount_label'] ?? null,
            'has_discount'       => (bool) ($resolved['has_discount'] ?? false),
            // Which rule produced this number, so a support question about a
            // price has an answer that does not require reading the code.
            'price_source'       => $resolved['source'],
            'surface'            => $surface,
            'separate_app_price' => $p->hasSeparateAppPrice(),
        ];
    }

    /**
     * How many people actually started a subscription in the last 30 days.
     *
     * Returns null - and the screen then draws no pill at all - when the number
     * is below the configured floor. A real but tiny number ("3 creators
     * upgraded this month") is worse than silence, and inventing a large one is
     * not on the table: this is shown to users as fact.
     */
    private function socialProof(): ?array
    {
        $min = (int) AdminCoinSetting::getValue('premium_social_proof_min', 50);

        $real = Subscription::where('started_at', '>=', now()->subDays(30))
            ->distinct('user_id')
            ->count('user_id');

        /**
         * `premium_social_proof_count` overrides the real figure when set above
         * zero.
         *
         * It exists because the pill is a design element that has to be
         * reviewable before the product has any subscribers - with none, the
         * real count is 0 and the pill can never be seen. Setting it publishes
         * a number to users that the database does not support, so it is OFF by
         * default (0 = use the real count) and turning it on is a deliberate,
         * auditable act by an administrator rather than something baked into
         * the app.
         */
        $override = (int) AdminCoinSetting::getValue('premium_social_proof_count', 0);
        $count = $override > 0 ? $override : $real;

        if ($count < $min) {
            return null;
        }

        return [
            'count'       => $count,
            'window_days' => 30,
            'is_estimate' => $override > 0,
            'avatars'     => $this->socialProofFaces(),
        ];
    }

    /**
     * The handful of faces shown in the pill.
     *
     * PRIVACY: a subscriber's avatar here tells everyone that person pays, so
     * this is narrowed deliberately - public accounts only, never private ones,
     * and only users who actually have a picture. It is also behind
     * `premium_social_proof_faces`, which can be turned off to keep the count
     * while showing no identities at all.
     *
     * Returns [] rather than null when disabled or empty; the client renders the
     * sentence without faces, which is a complete-looking pill either way.
     */
    private function socialProofFaces(): array
    {
        if (! (bool) AdminCoinSetting::getValue('premium_social_proof_faces', 1)) {
            return [];
        }

        $subscribers = Subscription::query()
            ->where('subscriptions.started_at', '>=', now()->subDays(30))
            ->join('users', 'users.id', '=', 'subscriptions.user_id')
            ->where('users.is_private', false)
            ->whereNotNull('users.avatar')
            ->orderByDesc('subscriptions.started_at')
            ->limit(4)
            ->pluck('users.id')
            ->all();

        /**
         * Real subscribers first. When there are not four of them - which is
         * every day before the product sells - the row is topped up with recent
         * public members who have a picture, so the pill shows real faces from
         * the real community instead of empty circles.
         *
         * Those extra faces are NOT a claim that those people subscribed. The
         * pill's sentence is about the count beside them, and the count is
         * governed separately by premium_social_proof_count. If that reading
         * ever feels too loose, the honest fix is to reword the sentence -
         * "Join creators on Teezer Premium" - not to invent subscribers.
         */
        $ids = $subscribers;
        if (count($ids) < 4) {
            $filler = User::query()
                ->whereNotIn('id', $ids ?: [0])
                ->where('is_private', false)
                ->whereNotNull('avatar')
                ->orderByDesc('id')
                ->limit(4 - count($ids))
                ->pluck('id')
                ->all();
            $ids = array_merge($ids, $filler);
        }

        if (empty($ids)) {
            return [];
        }

        return User::query()
            ->whereIn('id', $ids)
            ->get(['name', 'username', 'avatar'])
            ->map(fn ($u) => [
                'name' => $u->name ?: $u->username,
                // Storage::url, exactly as UserResource does it. The column
                // holds a relative key ("avatars/2026/06/x.jpg"); handing that
                // to the client raw gives an <Image> a path it cannot load.
                'avatar' => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
            ])
            ->values()
            ->all();
    }

    /**
     * "We're available in your location", and the full list behind it.
     *
     * `supported` is not just "is this country enabled" - it is whether any
     * plan is actually purchasable here. A market can be enabled for currency
     * purposes while every plan excludes it, and telling someone we are
     * available and then refusing at checkout is worse than saying so upfront.
     *
     * The list is what the popup renders. It comes from country_currency_map,
     * which is the same table the admin's Country Pricing page toggles, so
     * disabling a market there removes it here with no client release.
     *
     * @param  \Illuminate\Support\Collection  $plans
     */
    private function availabilityBlock(?string $country, $plans, PlanAvailabilityService $availability, ?string $platform): array
    {
        $rows = \App\Models\CountryCurrencyMap::where('is_enabled', true)
            ->orderBy('country_name')
            ->get(['country_code', 'country_name']);

        $code = $country ? strtoupper($country) : null;

        // Purchasable HERE means at least one plan clears the country and
        // platform gates. Evaluated per country for the caller's own market
        // only - doing it for all of them would be a query per row.
        $sellsHere = fn (?string $cc) => $plans->contains(
            fn ($p) => $availability->countryAllowed($p, $cc)
                && $availability->platformAllowed($p, $platform)
                && $availability->withinSchedule($p),
        );

        $mine = $rows->firstWhere('country_code', $code);

        return [
            'country' => $code,
            'country_name' => $mine->country_name ?? null,
            // Unknown country is reported honestly rather than guessed - the
            // client shows the list instead of naming the wrong place.
            'detected' => $code !== null,
            'supported' => $code !== null && $sellsHere($code),
            'total_countries' => $rows->count(),
            'countries' => $rows->map(fn ($r) => [
                'code' => $r->country_code,
                'name' => $r->country_name,
            ])->values(),
        ];
    }

    /**
     * POST /premium/coupon/validate - what a code is worth, before paying.
     *
     * A pure read: it never redeems, so the checkout screen can call it as the
     * customer types. Redemption happens at payment time through
     * CouponService::redeem, which re-checks everything this did.
     */
    public function validateCoupon(Request $request, CouponService $coupons)
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:32'],
            'plan_key' => ['nullable', 'string', 'max:64'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],
        ]);

        $result = $coupons->validate(
            $data['code'],
            $request->user(),
            $data['plan_key'] ?? null,
            (float) ($data['amount'] ?? 0),
            $data['currency'] ?? null,
        );

        return response()->json([
            // 200 either way: an invalid coupon is a normal answer to a normal
            // question, not a transport error, and a 4xx here would make every
            // client's error handler fire on an ordinary typo.
            'success' => true,
            'data' => [
                'valid' => $result['ok'],
                'reason' => $result['reason'],
                'message' => $result['message'],
                'discount' => $result['discount'],
                'final' => $result['final'],
                'coupon' => $result['ok'] ? [
                    'code' => $result['coupon']['code'],
                    'name' => $result['coupon']['name'],
                    'type' => $result['coupon']['type'],
                    'value' => $result['coupon']['value'],
                ] : null,
            ],
        ]);
    }
}
