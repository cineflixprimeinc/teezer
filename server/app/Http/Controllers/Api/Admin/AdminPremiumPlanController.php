<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Services\PlanAvailabilityService;
use App\Services\PlanFeatureService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Monetization → Premium Subscription.
 *
 * The tiers behind the app's premium page and, once base_price_usd is set, the
 * website's converted pricing. One editor for both surfaces - which is the
 * point: a price that differs between them is a support ticket.
 *
 * `key` is immutable after creation. Saved subscriptions reference it, so
 * renaming one would silently reassign what existing subscribers bought.
 */
class AdminPremiumPlanController extends Controller
{
    /**
     * Card themes offered by the plan editor.
     *
     * Validated here rather than by a CHECK constraint on the column, so adding
     * a fifth theme is a one-line change and not a migration on a live table.
     */
    public const THEMES = ['light', 'dark', 'gradient', 'brand'];

    /** How plans are grouped in the admin list. Admin-facing only. */
    public const CATEGORIES = ['creator', 'business', 'enterprise', 'personal'];

    public function index(): JsonResponse
    {
        $plans = SubscriptionPlan::orderBy('sort')->orderBy('id')->get();

        return response()->json([
            'success' => true,
            'data'    => $plans->map(fn (SubscriptionPlan $p) => $this->format($p))->values(),
        ]);
    }


    /**
     * Dashboard figures for the Premium Subscription page.
     *
     * EVERY NUMBER IS COUNTED, none are illustrative. With no subscribers yet
     * these are legitimately zero, and a zero that is true is worth more than a
     * placeholder that is not - an admin who cannot trust one figure cannot
     * trust any of them.
     *
     * Revenue is summed from `subscriptions.price`, which records what was
     * actually charged, rather than multiplying today's plan price by a
     * subscriber count - the two diverge the moment a price changes.
     */
    public function stats(): JsonResponse
    {
        $active = Subscription::where('status', 'active')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));

        $monthStart = now()->startOfMonth();
        $yearStart  = now()->startOfYear();

        // Per-plan counts in one grouped query rather than N+1 per row.
        $byPlan = Subscription::selectRaw('plan_key, COUNT(*) AS subs, COALESCE(SUM(price), 0) AS revenue')
            ->where('status', 'active')
            ->groupBy('plan_key')
            ->get()
            ->keyBy('plan_key');

        $byPlatform = Subscription::selectRaw("COALESCE(iap_platform, 'web') AS platform, COUNT(*) AS n")
            ->where('status', 'active')
            ->groupBy('platform')
            ->pluck('n', 'platform');

        $recent = Subscription::with('user:id,username,name,avatar')
            ->orderByDesc('started_at')
            ->limit(6)
            ->get()
            ->map(fn (Subscription $s) => [
                'id'         => $s->id,
                'plan_key'   => $s->plan_key,
                'plan'       => $s->plan,
                'price'      => (float) $s->price,
                'currency'   => $s->currency,
                'platform'   => $s->iap_platform ?? 'web',
                'username'   => $s->user?->username,
                'name'       => $s->user?->name,
                'avatar'     => $s->user?->avatar ? Storage::url($s->user->avatar) : StorageService::defaultAvatarUrl(),
                'started_at' => $s->started_at?->toIso8601String(),
            ]);

        // Where subscribers are, from the country on their account.
        $topCountries = Subscription::where('subscriptions.status', 'active')
            ->join('users', 'users.id', '=', 'subscriptions.user_id')
            ->whereNotNull('users.country')
            ->selectRaw('users.country, COUNT(*) AS n')
            ->groupBy('users.country')
            ->orderByDesc('n')
            ->limit(5)
            ->get()
            ->map(fn ($r) => ['country' => $r->country, 'count' => (int) $r->n]);

        $activeCount = (clone $active)->count();

        return response()->json([
            'success' => true,
            'data' => [
                'total_plans'    => SubscriptionPlan::count(),
                'live_plans'     => SubscriptionPlan::where('is_enabled', true)->count(),
                'sellable_plans' => SubscriptionPlan::whereNotNull('ios_product_id')
                    ->orWhereNotNull('android_product_id')->count(),
                'priced_plans'   => SubscriptionPlan::whereNotNull('base_price_usd')->count(),

                'active_subscribers' => $activeCount,
                'new_this_month'     => Subscription::where('started_at', '>=', $monthStart)->count(),
                'revenue_month'      => (float) Subscription::where('started_at', '>=', $monthStart)->sum('price'),
                'revenue_year'       => (float) Subscription::where('started_at', '>=', $yearStart)->sum('price'),
                'cancelled_month'    => Subscription::where('cancelled_at', '>=', $monthStart)->count(),

                // Configured markets, which IS a real number even at zero
                // subscribers - it is what the pricing system can quote.
                'supported_countries' => \App\Models\CountryCurrencyMap::where('is_enabled', true)->count(),
                'supported_currencies' => \App\Models\Currency::where('is_enabled', true)->count(),

                'per_plan' => $byPlan->map(fn ($r) => [
                    'subscribers' => (int) $r->subs,
                    'revenue'     => (float) $r->revenue,
                ]),
                'by_platform'   => $byPlatform,
                'recent'        => $recent,
                'top_countries' => $topCountries,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key'                => ['required', 'string', 'max:64', 'alpha_dash', 'unique:subscription_plans,key'],
            'name'               => ['required', 'string', 'max:120'],
            'tagline'            => ['nullable', 'string', 'max:160'],
            'base_price_usd'     => ['nullable', 'numeric', 'min:0', 'max:10000'],
            // Null = the app charges the web price. One nullable column rather
            // than a mode flag, so the two can never disagree about whether
            // they are linked.
            'app_price_usd'      => ['nullable', 'numeric', 'min:0', 'max:10000'],
            // The price being discounted FROM. Null clears the discount.
            'compare_at_price_usd'     => ['nullable', 'numeric', 'min:0', 'max:10000'],
            'compare_at_app_price_usd' => ['nullable', 'numeric', 'min:0', 'max:10000'],
            'discount_label'           => ['nullable', 'string', 'max:40'],
            'price'              => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'currency'           => ['nullable', 'string', 'size:3'],
            'period'             => ['nullable', Rule::in(['month', 'year'])],
            'features'           => ['nullable', 'array', 'max:20'],
            'features.*'         => ['string', 'max:120'],
            'is_popular'         => ['nullable', 'boolean'],
            'badge_label'        => ['nullable', 'string', 'max:40'],
            'is_default'         => ['nullable', 'boolean'],
            'theme'              => ['nullable', Rule::in(self::THEMES)],
            'ios_product_id'     => ['nullable', 'string', 'max:191'],
            'android_product_id' => ['nullable', 'string', 'max:191'],
            'sort'               => ['nullable', 'integer', 'min:0'],
            'is_enabled'         => ['nullable', 'boolean'],
            'icon_path'          => ['nullable', 'string', 'max:255'],
            'category'           => ['nullable', Rule::in(self::CATEGORIES)],
            'tags'               => ['nullable', 'array', 'max:12'],
            'tags.*'             => ['string', 'max:32'],
            'internal_note'      => ['nullable', 'string', 'max:500'],
        ]);

        $plan = SubscriptionPlan::create($data);
        $this->settleDefault($plan);

        return response()->json(['success' => true, 'data' => $this->format($plan->fresh())], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $plan = SubscriptionPlan::findOrFail($id);

        // `key` is deliberately absent: subscriptions reference it, and renaming
        // one would reassign what existing subscribers are on.
        $data = $request->validate([
            'name'               => ['sometimes', 'string', 'max:120'],
            'tagline'            => ['sometimes', 'nullable', 'string', 'max:160'],
            'base_price_usd'     => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:10000'],
            'app_price_usd'      => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:10000'],
            'compare_at_price_usd'     => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:10000'],
            'compare_at_app_price_usd' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:10000'],
            'discount_label'           => ['sometimes', 'nullable', 'string', 'max:40'],
            'price'              => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000'],
            'currency'           => ['sometimes', 'string', 'size:3'],
            'period'             => ['sometimes', Rule::in(['month', 'year'])],
            'features'           => ['sometimes', 'nullable', 'array', 'max:20'],
            'features.*'         => ['string', 'max:120'],
            'is_popular'         => ['sometimes', 'boolean'],
            'badge_label'        => ['sometimes', 'nullable', 'string', 'max:40'],
            'is_default'         => ['sometimes', 'boolean'],
            'theme'              => ['sometimes', Rule::in(self::THEMES)],
            'ios_product_id'     => ['sometimes', 'nullable', 'string', 'max:191'],
            'android_product_id' => ['sometimes', 'nullable', 'string', 'max:191'],
            'sort'               => ['sometimes', 'integer', 'min:0'],
            'is_enabled'         => ['sometimes', 'boolean'],
            // Presentation / organisation. Admin-facing only - none of these
            // reach a customer, which is why internal_note is separate from
            // tagline rather than a longer version of it.
            'icon_path'          => ['sometimes', 'nullable', 'string', 'max:255'],
            'category'           => ['sometimes', 'nullable', Rule::in(self::CATEGORIES)],
            'tags'               => ['sometimes', 'nullable', 'array', 'max:12'],
            'tags.*'             => ['string', 'max:32'],
            'internal_note'      => ['sometimes', 'nullable', 'string', 'max:500'],

            /* Availability. Enforced for every surface by
               PlanAvailabilityService - see that class for what each one does. */
            'status'               => ['sometimes', Rule::in(PlanAvailabilityService::STATUSES)],
            'platforms'            => ['sometimes', 'nullable', 'array'],
            'platforms.*'          => [Rule::in(PlanAvailabilityService::PLATFORMS)],
            'visibility'           => ['sometimes', 'nullable', 'array'],
            'purchase_eligibility' => ['sometimes', Rule::in(PlanAvailabilityService::ELIGIBILITY)],
            'requirements'         => ['sometimes', 'nullable', 'array'],
            'available_from'       => ['sometimes', 'nullable', 'date'],
            // after_or_equal, not after: a same-instant window is a deliberate
            // "available for nothing", and rejecting it hides an admin mistake
            // behind a validation error instead of letting them see it.
            'available_until'      => ['sometimes', 'nullable', 'date', 'after_or_equal:available_from'],
            'countries_mode'       => ['sometimes', Rule::in(PlanAvailabilityService::COUNTRY_MODES)],
            'countries'            => ['sometimes', 'nullable', 'array'],
            'countries.*'          => ['string', 'size:2'],
            'upgrade_rules'        => ['sometimes', 'nullable', 'array'],
            'downgrade_rules'      => ['sometimes', 'nullable', 'array'],
            'existing_subscriber_behavior' => ['sometimes', Rule::in(PlanAvailabilityService::SUBSCRIBER_BEHAVIOURS)],

            /* Structured features. Handled after the plan update rather than as
               a column, because they live in their own table. */
            'plan_features'              => ['sometimes', 'array'],
            'plan_features.*.key'        => ['required', 'string', 'max:64'],
            'plan_features.*.is_enabled' => ['nullable', 'boolean'],
            'plan_features.*.value'      => ['nullable', 'string', 'max:64'],
            'plan_features.*.sort'       => ['nullable', 'integer', 'min:0'],

            /* Per-plan trial. Explicitly nullable: null means "inherit the
               global", 0 means "no trial on this tier". Two different answers. */
            'trial_days'                 => ['sometimes', 'nullable', 'integer', 'min:0', 'max:365'],

            /* Pricing mode. The country overrides themselves are NOT edited
               here - they belong to AdminPlanPricingController, which owns the
               history and audit trail that go with a price change. Two writers
               on one table is how the two would drift. */
            'pricing_mode'               => ['sometimes', Rule::in(\App\Services\PlanPricingService::MODES)],
        ]);

        // Pulled out so it is never passed to $plan->update() as a column.
        $planFeatures = $data['plan_features'] ?? null;
        unset($data['plan_features']);

        /* Keep the legacy switch in step with the lifecycle field. `enabled()`
           and several readers still test is_enabled, and two switches that can
           disagree is the exact failure this is meant to prevent - so status is
           authoritative and is_enabled is never written on its own. */
        if (array_key_exists('status', $data)) {
            $data['is_enabled'] = $data['status'] === 'active';
        } elseif (array_key_exists('is_enabled', $data)) {
            $data['status'] = $data['is_enabled'] ? 'active' : 'disabled';
        }

        $plan->update($data);
        $this->settleDefault($plan);

        /* Saved after the plan itself: the service regenerates
           subscription_plans.features (the display bullets) from the structured
           set, so it has to run on the already-updated row or it would write
           bullets derived from stale data. */
        if ($planFeatures !== null) {
            app(PlanFeatureService::class)->save($plan, $planFeatures);
        }


        return response()->json(['success' => true, 'data' => $this->format($plan->fresh())]);
    }

    public function destroy(int $id): JsonResponse
    {
        $plan = SubscriptionPlan::findOrFail($id);

        // Disable rather than delete when anyone is on it: the row is what a
        // subscriber's plan_key points at, and removing it would orphan them.
        if (Subscription::where('plan_key', $plan->key)->exists()) {
            $plan->update(['is_enabled' => false]);

            return response()->json([
                'success' => true,
                'message' => 'Subscribers are on this plan, so it was hidden from sale rather than deleted.',
            ]);
        }

        $plan->delete();

        return response()->json(['success' => true, 'message' => 'Plan deleted.']);
    }

    /** Exactly one default. Setting a new one clears the rest. */
    private function settleDefault(SubscriptionPlan $plan): void
    {
        if ($plan->is_default) {
            SubscriptionPlan::where('id', '!=', $plan->id)->update(['is_default' => false]);
        }
    }

    /**
     * Coupons usable on this plan.
     *
     * Includes the ones scoped to every plan (applicable_plans null/empty),
     * because from the plan's point of view those apply here too - listing only
     * the explicitly-scoped ones would tell an admin a plan has no coupons when
     * a site-wide 20%-off is live on it.
     *
     * @return array<int,array<string,mixed>>
     */
    private function couponsForPlan(SubscriptionPlan $p): array
    {
        $svc = app(\App\Services\CouponService::class);

        // JSON containment is engine-specific, so this filters in PHP rather
        // than shipping a Postgres-only where clause the test database cannot
        // run. The coupon table is small by nature.
        return \Illuminate\Support\Facades\DB::table('coupons')
            ->orderByDesc('id')->get()
            ->map(fn ($c) => $svc->shape($c))
            ->filter(function ($c) use ($p) {
                $scoped = $c['applicable_plans'];

                return $scoped === [] || in_array($p->key, $scoped, true);
            })
            ->map(fn ($c) => $c + ['applies_to_all' => $c['applicable_plans'] === []])
            ->values()->all();
    }

    private function format(SubscriptionPlan $p): array
    {
        return [
            'id'                 => $p->id,
            'key'                => $p->key,
            'name'               => $p->name,
            'tagline'            => $p->tagline,
            'base_price_usd'     => $p->base_price_usd !== null ? (float) $p->base_price_usd : null,
            'app_price_usd'      => $p->app_price_usd !== null ? (float) $p->app_price_usd : null,
            'compare_at_price_usd'     => $p->compare_at_price_usd !== null ? (float) $p->compare_at_price_usd : null,
            'compare_at_app_price_usd' => $p->compare_at_app_price_usd !== null ? (float) $p->compare_at_app_price_usd : null,
            'discount_label'           => $p->discount_label,
            'separate_app_price' => $p->hasSeparateAppPrice(),
            'price'              => (float) $p->price,
            'currency'           => $p->currency,
            'period'             => $p->period,
            'features'           => $p->features ?? [],
            'is_popular'         => (bool) $p->is_popular,
            'badge_label'        => $p->badge_label,
            'is_default'         => (bool) $p->is_default,
            'theme'              => $p->theme,
            'ios_product_id'     => $p->ios_product_id,
            'android_product_id' => $p->android_product_id,
            'sort'               => (int) $p->sort,
            'is_enabled'         => (bool) $p->is_enabled,
            // Presentation / organisation. icon_url is derived so the client
            // never has to know how media paths are turned into URLs.
            'icon_path'          => $p->icon_path,
            'icon_url'           => $p->icon_path ? Storage::url($p->icon_path) : null,
            'category'           => $p->category,
            'tags'               => $p->tags ?? [],
            'internal_note'      => $p->internal_note,

            // Availability. visibility comes back resolved (every key present,
            // defaults applied) so the editor never has to guess which flags
            // exist - the same shape the enforcement path reads.
            'status'               => $p->status ?? 'active',
            'platforms'            => $p->platforms ?? PlanAvailabilityService::PLATFORMS,
            'visibility'           => app(PlanAvailabilityService::class)->visibilityFlags($p),
            'purchase_eligibility' => $p->purchase_eligibility ?? 'everyone',
            'requirements'         => $p->requirements ?? [],
            'available_from'       => $p->available_from?->toIso8601String(),
            'available_until'      => $p->available_until?->toIso8601String(),
            'countries_mode'       => $p->countries_mode ?? 'all',
            'countries'            => $p->countries ?? [],
            'upgrade_rules'        => $p->upgrade_rules ?? [],
            'downgrade_rules'      => $p->downgrade_rules ?? [],
            'existing_subscriber_behavior' => $p->existing_subscriber_behavior ?? 'keep_and_renew',

            // Structured features: the whole catalog with this plan's setting
            // merged in, so the editor shows what is available to turn on and
            // not only what is already on.
            'plan_features'      => app(PlanFeatureService::class)->forPlan($p),
            'feature_groups'     => PlanFeatureService::GROUPS,
            'feature_group_counts' => app(PlanFeatureService::class)->groupCounts($p),

            // Null is meaningful here - it means "inherit the global" - so it
            // is passed through rather than coalesced to a number the admin
            // never chose.
            'trial_days'         => $p->trial_days !== null ? (int) $p->trial_days : null,
            'global_trial_days'  => (int) \App\Models\AdminCoinSetting::getValue('premium_trial_days', 7),

            // The overrides themselves are served by
            // GET /premium-plans/{id}/pricing, which returns them already
            // resolved against every country. Duplicating a raw list here would
            // give the editor a second, differently-shaped copy.
            'pricing_mode'       => $p->pricing_mode ?? 'global',

            // Coupons that apply to this plan - either explicitly, or by
            // applying to every plan. Shown on the plan's own Coupons tab so an
            // admin does not have to cross-reference the global list.
            'coupons'            => $this->couponsForPlan($p),
            // Buyable only once a store listing exists for the platform.
            'sellable'           => (bool) ($p->ios_product_id || $p->android_product_id),
        ];
    }
}
