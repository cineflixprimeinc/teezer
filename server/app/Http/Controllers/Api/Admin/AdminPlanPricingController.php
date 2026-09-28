<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\SubscriptionPlan;
use App\Services\PlanPricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Admin → Premium Subscription → Edit Plan → Pricing.
 *
 * Owns the country-pricing matrix and its overrides. Resolution itself lives in
 * PlanPricingService, which the public endpoints and the checkout also use - so
 * this controller never computes a price, it only records the rules.
 *
 * Every write does three things in one transaction: change the rule, append to
 * plan_price_history, and write an AdminActionLog entry. History answers "what
 * was the price"; the audit log answers "who changed it". Both, because pruning
 * one must not lose the other.
 *
 * Authorisation is the admin route group's, the same guard as every other
 * controller in this namespace - not re-implemented here.
 */
class AdminPlanPricingController extends Controller
{
    public function __construct(private readonly PlanPricingService $pricing) {}

    /**
     * GET /admin/countries - reference data for the country pickers.
     *
     * Served from country_currency_map, the same table pricing and availability
     * resolve against, so a picker can never offer a country the resolver does
     * not know. Disabled markets are INCLUDED and flagged rather than hidden: an
     * admin restricting a plan to a market that is currently switched off needs
     * to see that, not find the country simply missing from the list.
     */
    public function countries(): JsonResponse
    {
        $rows = \App\Models\CountryCurrencyMap::orderBy('country_name')
            ->get(['country_code', 'country_name', 'currency_code', 'is_enabled'])
            ->map(fn ($c) => [
                'code' => strtoupper($c->country_code),
                'name' => $c->country_name,
                'currency' => strtoupper($c->currency_code),
                'enabled' => (bool) $c->is_enabled,
            ]);

        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** GET - the full country matrix for one plan and cycle. */
    public function show(Request $request, int $id): JsonResponse
    {
        $plan = SubscriptionPlan::findOrFail($id);
        $cycle = $request->query('cycle', $plan->period ?? 'month');
        $surface = $request->query('surface', 'web');

        return response()->json([
            'success' => true,
            'data' => [
                'plan_key' => $plan->key,
                'pricing_mode' => $plan->pricing_mode ?? 'global',
                'base_price_usd' => $plan->base_price_usd !== null ? (float) $plan->base_price_usd : null,
                'app_price_usd' => $plan->app_price_usd !== null ? (float) $plan->app_price_usd : null,
                /* Null app_price_usd means the app INHERITS the web base - the
                   two platforms are linked and will always match unless a
                   per-surface country override splits them. Surfaced so the
                   editor can say which it is instead of leaving an admin to
                   infer it from two numbers that happen to be equal. */
                'has_separate_app_price' => $plan->hasSeparateAppPrice(),
                'cycle' => $cycle,
                'surface' => $surface,
                'cycles' => PlanPricingService::CYCLES,
                'countries' => $this->pricing->matrix($plan, $cycle, $surface),
            ],
        ]);
    }

    /** PUT - switch between global and country-specific pricing. */
    public function setMode(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'pricing_mode' => ['required', Rule::in(PlanPricingService::MODES)],
        ]);

        $plan = SubscriptionPlan::findOrFail($id);
        $old = $plan->pricing_mode ?? 'global';

        if ($old !== $data['pricing_mode']) {
            DB::transaction(function () use ($plan, $old, $data, $request) {
                // Overrides are NOT deleted when switching to global - they stop
                // being consulted and come back intact if the mode is switched
                // again. Deleting them would make the toggle destructive.
                $plan->update(['pricing_mode' => $data['pricing_mode']]);

                $this->pricing->recordHistory([
                    'subscription_plan_id' => $plan->id, 'plan_key' => $plan->key,
                    'pricing_mode' => $data['pricing_mode'], 'action' => 'mode_changed',
                    'changed_by' => $request->user()?->id,
                    'note' => "Pricing mode {$old} → {$data['pricing_mode']}",
                ]);
                $this->audit($request, $plan, 'pricing_mode_changed',
                    "Pricing mode for {$plan->key}: {$old} → {$data['pricing_mode']}",
                    ['old' => $old, 'new' => $data['pricing_mode']]);
            });

            $this->pricing->flush($plan);
        }

        return response()->json(['success' => true, 'data' => ['pricing_mode' => $plan->fresh()->pricing_mode]]);
    }

    /** POST - create or update one country/currency override. */
    public function upsertOverride(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'country_code'  => ['nullable', 'string', 'size:2'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'billing_cycle' => ['required', Rule::in(PlanPricingService::CYCLES)],
            'price'         => ['required', 'numeric', 'min:0'],
            'surface'       => ['nullable', Rule::in(['web', 'app'])],
            'effective_from' => ['nullable', 'date'],
            'expires_at'    => ['nullable', 'date', 'after_or_equal:effective_from'],
            'note'          => ['nullable', 'string', 'max:255'],
            'is_enabled'    => ['nullable', 'boolean'],
        ]);

        $plan = SubscriptionPlan::findOrFail($id);
        $country = $data['country_code'] ? strtoupper($data['country_code']) : null;
        $currency = $country ? null : ($data['currency_code'] ? strtoupper($data['currency_code']) : null);

        // A rule keyed on neither market is what base_price_usd already is -
        // storing it would create a second, competing global price.
        if ($country === null && $currency === null) {
            return response()->json([
                'success' => false,
                'message' => 'Choose a country or a currency. A rule for neither is just the global price.',
            ], 422);
        }

        $surface = $data['surface'] ?? 'web';
        $keys = [
            'subscription_plan_id' => $plan->id,
            'country_code' => $country,
            'currency_code' => $currency,
            'billing_cycle' => $data['billing_cycle'],
            'surface' => $surface,
        ];

        DB::transaction(function () use ($plan, $keys, $data, $country, $currency, $surface, $request) {
            $existing = DB::table('plan_price_overrides')->where($keys)->first();

            DB::table('plan_price_overrides')->updateOrInsert($keys, [
                'price' => $data['price'],
                'effective_from' => $data['effective_from'] ?? null,
                'expires_at' => $data['expires_at'] ?? null,
                'note' => $data['note'] ?? null,
                'is_enabled' => $data['is_enabled'] ?? true,
                'updated_at' => now(),
                'created_at' => $existing->created_at ?? now(),
            ]);

            $this->pricing->recordHistory([
                'subscription_plan_id' => $plan->id, 'plan_key' => $plan->key,
                'country_code' => $country, 'currency_code' => $currency,
                'billing_cycle' => $data['billing_cycle'], 'surface' => $surface,
                // Null old price on a create - forcing 0 would be
                // indistinguishable from a real previous price of zero.
                'old_price' => $existing->price ?? null,
                'new_price' => $data['price'],
                'pricing_mode' => $plan->pricing_mode,
                'action' => $existing ? 'updated' : 'created',
                'changed_by' => $request->user()?->id,
                'note' => $data['note'] ?? null,
            ]);

            $this->audit($request, $plan, 'plan_price_override_saved',
                sprintf('%s %s %s price for %s: %s → %s',
                    $plan->key, $data['billing_cycle'], $surface,
                    $country ?? $currency, $existing->price ?? '—', $data['price']),
                $keys + ['price' => $data['price']]);
        });

        // Invalidated immediately, so the next request gets the new price
        // rather than waiting for a TTL to lapse.
        $this->pricing->flush($plan);

        return response()->json(['success' => true]);
    }

    /** DELETE - reset a country to the global converted price. */
    public function deleteOverride(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'country_code'  => ['nullable', 'string', 'size:2'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'billing_cycle' => ['required', Rule::in(PlanPricingService::CYCLES)],
            'surface'       => ['nullable', Rule::in(['web', 'app'])],
        ]);

        $plan = SubscriptionPlan::findOrFail($id);
        $country = $data['country_code'] ? strtoupper($data['country_code']) : null;
        $currency = $country ? null : ($data['currency_code'] ? strtoupper($data['currency_code']) : null);

        $keys = [
            'subscription_plan_id' => $plan->id,
            'country_code' => $country,
            'currency_code' => $currency,
            'billing_cycle' => $data['billing_cycle'],
            'surface' => $data['surface'] ?? 'web',
        ];

        DB::transaction(function () use ($plan, $keys, $country, $currency, $data, $request) {
            $existing = DB::table('plan_price_overrides')->where($keys)->first();
            if (! $existing) {
                return;
            }

            DB::table('plan_price_overrides')->where($keys)->delete();

            $this->pricing->recordHistory([
                'subscription_plan_id' => $plan->id, 'plan_key' => $plan->key,
                'country_code' => $country, 'currency_code' => $currency,
                'billing_cycle' => $data['billing_cycle'], 'surface' => $keys['surface'],
                'old_price' => $existing->price,
                // Null new price: the country now has no fixed price at all,
                // which is different from having one of zero.
                'new_price' => null,
                'pricing_mode' => $plan->pricing_mode,
                'action' => 'deleted',
                'changed_by' => $request->user()?->id,
                'note' => 'Reset to global price',
            ]);

            $this->audit($request, $plan, 'plan_price_override_deleted',
                sprintf('%s: %s reset to global price', $plan->key, $country ?? $currency), $keys);
        });

        $this->pricing->flush($plan);

        return response()->json(['success' => true]);
    }

    /**
     * POST - bulk apply, with a mandatory preview step.
     *
     * `confirm=false` returns what WOULD happen and writes nothing. Nothing is
     * ever changed by a request that did not explicitly confirm, so a bulk
     * adjustment cannot be applied by a mis-click.
     */
    public function bulk(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'countries'     => ['required', 'array', 'min:1', 'max:250'],
            'countries.*'   => ['string', 'size:2'],
            'billing_cycle' => ['required', Rule::in(PlanPricingService::CYCLES)],
            'surface'       => ['nullable', Rule::in(['web', 'app'])],
            'mode'          => ['required', Rule::in(['fixed', 'percent'])],
            // fixed: this exact price. percent: adjust the CONVERTED global
            // price by this much (-20 = 20% cheaper).
            'value'         => ['required', 'numeric'],
            'note'          => ['nullable', 'string', 'max:255'],
            'confirm'       => ['nullable', 'boolean'],
        ]);

        $plan = SubscriptionPlan::findOrFail($id);
        $surface = $data['surface'] ?? 'web';
        $wanted = array_map('strtoupper', $data['countries']);

        $matrix = collect($this->pricing->matrix($plan, $data['billing_cycle'], $surface))
            ->whereIn('country_code', $wanted);

        $preview = $matrix->map(function ($row) use ($data) {
            $base = $row['global_price'];
            $new = $data['mode'] === 'fixed'
                ? (float) $data['value']
                : ($base !== null ? round($base * (1 + ((float) $data['value'] / 100)), 2) : null);

            return [
                'country_code' => $row['country_code'],
                'country_name' => $row['country_name'],
                'currency_code' => $row['currency_code'],
                'current_price' => $row['custom_price'] ?? $base,
                'new_price' => $new,
                // A percentage of nothing is nothing - a country with no
                // convertible global price is reported as skipped rather than
                // silently priced at 0.
                'skipped' => $new === null,
            ];
        })->values();

        if (! ($data['confirm'] ?? false)) {
            return response()->json([
                'success' => true,
                'data' => ['preview' => $preview, 'applied' => false],
            ]);
        }

        DB::transaction(function () use ($preview, $plan, $data, $surface, $request) {
            foreach ($preview as $row) {
                if ($row['skipped']) {
                    continue;
                }

                $keys = [
                    'subscription_plan_id' => $plan->id,
                    'country_code' => $row['country_code'],
                    'currency_code' => null,
                    'billing_cycle' => $data['billing_cycle'],
                    'surface' => $surface,
                ];
                $existing = DB::table('plan_price_overrides')->where($keys)->first();

                DB::table('plan_price_overrides')->updateOrInsert($keys, [
                    'price' => $row['new_price'],
                    'note' => $data['note'] ?? 'Bulk adjustment',
                    'is_enabled' => true,
                    'updated_at' => now(),
                    'created_at' => $existing->created_at ?? now(),
                ]);

                $this->pricing->recordHistory([
                    'subscription_plan_id' => $plan->id, 'plan_key' => $plan->key,
                    'country_code' => $row['country_code'], 'billing_cycle' => $data['billing_cycle'],
                    'surface' => $surface,
                    'old_price' => $existing->price ?? null, 'new_price' => $row['new_price'],
                    'pricing_mode' => $plan->pricing_mode, 'action' => 'bulk',
                    'changed_by' => $request->user()?->id,
                    'note' => $data['note'] ?? 'Bulk adjustment',
                ]);
            }

            $this->audit($request, $plan, 'plan_price_bulk',
                sprintf('%s: bulk %s applied to %d countries', $plan->key, $data['mode'], $preview->where('skipped', false)->count()),
                ['mode' => $data['mode'], 'value' => $data['value'], 'countries' => $preview->pluck('country_code')]);
        });

        $this->pricing->flush($plan);

        return response()->json(['success' => true, 'data' => ['preview' => $preview, 'applied' => true]]);
    }

    /**
     * POST - drop every cached price for this plan, by hand.
     *
     * Every admin write already flushes automatically, so this is a repair
     * tool, not part of the normal path: it exists for the case where a price
     * was changed directly in the database, or a deploy left a generation
     * counter behind. Cheap and safe to press - the worst outcome is one
     * uncached read per market.
     */
    public function flushCache(Request $request, int $id): JsonResponse
    {
        $plan = SubscriptionPlan::findOrFail($id);
        $this->pricing->flush($plan);

        $this->audit($request, $plan, 'plan_price_cache_flushed',
            "Pricing cache flushed for {$plan->key}", ['plan_key' => $plan->key]);

        return response()->json([
            'success' => true,
            'message' => 'Pricing cache cleared. The next request recomputes every market.',
        ]);
    }

    /**
     * GET - what one specific country would be quoted, and why.
     *
     * A diagnostic for "why is this customer seeing that number". Returns the
     * resolved amount together with the RULE that produced it, so the answer
     * does not require reading the code or guessing at rate timing.
     */
    public function preview(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'country'  => ['required', 'string', 'size:2'],
            'cycle'    => ['nullable', Rule::in(PlanPricingService::CYCLES)],
            'surface'  => ['nullable', Rule::in(['web', 'app'])],
        ]);

        $plan = SubscriptionPlan::findOrFail($id);
        $country = strtoupper($data['country']);

        $row = \App\Models\CountryCurrencyMap::where('country_code', $country)->first();
        if (! $row) {
            return response()->json([
                'success' => false,
                'message' => "No currency is mapped for {$country}, so it would be quoted in USD.",
            ], 422);
        }

        $resolved = $this->pricing->resolve(
            $plan, $country, strtoupper($row->currency_code),
            $data['surface'] ?? 'web', $data['cycle'] ?? 'month',
        );

        return response()->json([
            'success' => true,
            'data' => $resolved + [
                'country' => $country,
                'country_name' => $row->country_name,
                'country_enabled' => (bool) $row->is_enabled,
            ],
        ]);
    }

    /** GET - price history for this plan, newest first. */
    public function history(Request $request, int $id): JsonResponse
    {
        $plan = SubscriptionPlan::findOrFail($id);

        $rows = DB::table('plan_price_history as h')
            ->leftJoin('users as u', 'u.id', '=', 'h.changed_by')
            ->where('h.subscription_plan_id', $plan->id)
            ->when($request->query('country'), fn ($q, $c) => $q->where('h.country_code', strtoupper($c)))
            ->orderByDesc('h.id')
            ->limit(200)
            ->get([
                'h.country_code', 'h.currency_code', 'h.billing_cycle', 'h.surface',
                'h.old_price', 'h.new_price', 'h.pricing_mode', 'h.action',
                'h.note', 'h.created_at', 'u.name as changed_by_name', 'u.username as changed_by_username',
            ]);

        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** One audit row per change, alongside the price history. */
    private function audit(Request $request, SubscriptionPlan $plan, string $action, string $description, array $meta): void
    {
        try {
            AdminActionLog::create([
                'admin_id' => $request->user()?->id,
                'action' => $action,
                'category' => 'monetization',
                'target_type' => 'subscription_plan',
                'target_id' => $plan->id,
                'description' => $description,
                'metadata' => $meta,
                'ip_address' => $request->ip(),
                'severity' => 'info',
                'created_at' => now(),
            ]);
        } catch (\Throwable) {
            // Never let audit logging fail the pricing change it describes -
            // the change and its history row are already committed.
        }
    }
}
