<?php

namespace App\Services;

use App\Models\SubscriptionPlan;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Resolves what one plan costs one person, and is the ONLY thing allowed to.
 *
 * This does not replace PricingService - it sits on top of it. PricingService
 * still owns USD→local conversion, rates and rounding; this owns the question
 * PricingService cannot answer: "is there a fixed price for this market, and if
 * not, what should be converted?"
 *
 * ── Resolution order ────────────────────────────────────────────────────────
 *
 *   1. country override   - a price an admin fixed for THIS country
 *   2. currency override  - a price fixed for every market on this currency
 *   3. global base        - base_price_usd, converted by PricingService
 *   4. USD                - when the currency has no rate (PricingService's
 *                           own fallback, unchanged)
 *
 * Country beats currency because a country is the narrower statement: "all EUR
 * markets are €4.99" must not overwrite a price set for one specific EUR
 * country. Overrides are consulted only when the plan's pricing_mode is
 * 'country', so switching back to global leaves the configured prices in place
 * for later rather than forcing the admin to delete and re-enter them.
 *
 * ── Why display and checkout share this ─────────────────────────────────────
 *
 * They did not before: /premium showed base_price_usd converted, while
 * StudioSubscriptionController charged a flat AdminCoinSetting value that knew
 * nothing about tiers - so Pro displayed $12.99 and charged $4.99. One resolver
 * used by both is the only way those two numbers cannot drift.
 *
 * ── Trust ───────────────────────────────────────────────────────────────────
 *
 * resolve() takes a country from the CALLER for display, but the checkout path
 * passes a server-detected country and never one from the request body. The
 * amount is recomputed here at payment time regardless of what the client
 * showed, so a manipulated display price cannot become a manipulated charge.
 */
class PlanPricingService
{
    public const MODES = ['global', 'country'];
    public const CYCLES = ['month', 'year'];

    /** Short: prices change rarely but must not be stale after an admin saves. */
    private const TTL = 300;

    public function __construct(private readonly PricingService $pricing) {}

    /**
     * The price for this plan, in this country, on this cycle.
     *
     * @return array{amount:float,currency:string,formatted:string,source:string,is_override:bool,base_usd:?float,is_converted:bool}
     */
    public function resolve(
        SubscriptionPlan $plan,
        string $country,
        string $currency,
        string $surface = 'web',
        ?string $cycle = null,
    ): array {
        $cycle = $this->normaliseCycle($cycle ?? $plan->period);
        $key = $this->cacheKey($plan->id, $country, $currency, $surface, $cycle);

        return Cache::remember($key, self::TTL, function () use ($plan, $country, $currency, $surface, $cycle) {
            $override = $this->overrideFor($plan, $country, $currency, $surface, $cycle);

            if ($override) {
                $ccy = strtoupper($override->currency_code ?: $currency);

                return $this->withDiscount([
                    'amount' => (float) $override->price,
                    'currency' => $ccy,
                    'formatted' => $ccy . ' ' . number_format((float) $override->price, 2),
                    'source' => $override->country_code ? 'country_override' : 'currency_override',
                    'is_override' => true,
                    // No rate was involved, so saying "converted" would be a lie.
                    'is_converted' => false,
                    'base_usd' => $this->baseUsd($plan, $surface),
                ], $override->compare_at_price !== null ? (float) $override->compare_at_price : null, $plan);
            }

            $usd = $this->baseUsd($plan, $surface);
            if ($usd === null) {
                // No USD base and no override: there is genuinely no price. The
                // caller renders "unavailable" rather than a zero.
                return [
                    'amount' => 0.0, 'currency' => 'USD', 'formatted' => '',
                    'source' => 'none', 'is_override' => false, 'is_converted' => false, 'base_usd' => null,
                ];
            }

            // Unchanged conversion path - rates, rounding and USD fallback all
            // stay PricingService's job.
            $quote = $this->pricing->quote($usd, $currency, $country);

            /* The "was" price goes through the SAME conversion as the price it
               qualifies. Converting one and not the other would show a discount
               that is really an exchange-rate artefact. */
            $compareUsd = $this->compareAtUsd($plan, $surface);
            $compareLocal = null;
            if ($compareUsd !== null) {
                $cq = $this->pricing->quote($compareUsd, $currency, $country);
                $compareLocal = (float) ($cq['amount'] ?? $compareUsd);
            }

            return $this->withDiscount([
                'amount' => (float) ($quote['amount'] ?? $usd),
                'currency' => (string) ($quote['currency'] ?? 'USD'),
                'formatted' => (string) ($quote['formatted'] ?? ''),
                'source' => ($quote['is_converted'] ?? false) ? 'global_converted' : 'usd_fallback',
                'is_override' => false,
                'is_converted' => (bool) ($quote['is_converted'] ?? false),
                'base_usd' => $usd,
            ], $compareLocal, $plan);
        });
    }

    /**
     * Attach the discount fields, computed from the money rather than stored.
     *
     * A percentage derived from the two prices can never disagree with them.
     * Storing a percent instead would mean rounding it into a price and having
     * the label and the arithmetic differ by a cent.
     *
     * A compare-at at or below the price is NOT a discount - it is a data
     * entry mistake or a price that has since risen - so it is dropped rather
     * than rendered as "save -12%".
     *
     * @param  array<string,mixed>  $q
     * @return array<string,mixed>
     */
    private function withDiscount(array $q, ?float $compareAt, SubscriptionPlan $plan): array
    {
        $amount = (float) $q['amount'];

        if ($compareAt === null || $compareAt <= $amount || $amount <= 0) {
            return $q + [
                'compare_at' => null,
                'discount_amount' => 0.0,
                'discount_percent' => 0,
                'discount_label' => null,
                'has_discount' => false,
            ];
        }

        $saving = round($compareAt - $amount, 2);

        return $q + [
            'compare_at' => round($compareAt, 2),
            'discount_amount' => $saving,
            // Rounded for display only; the money above is authoritative.
            'discount_percent' => (int) round(($saving / $compareAt) * 100),
            'discount_label' => $plan->discount_label ?: null,
            'has_discount' => true,
        ];
    }

    /** The "was" price in USD for this surface, mirroring priceUsdFor(). */
    private function compareAtUsd(SubscriptionPlan $plan, string $surface): ?float
    {
        if ($surface === 'app' && $plan->compare_at_app_price_usd !== null) {
            return (float) $plan->compare_at_app_price_usd;
        }

        return $plan->compare_at_price_usd !== null ? (float) $plan->compare_at_price_usd : null;
    }

    /**
     * The authoritative amount to CHARGE, for the checkout path.
     *
     * Deliberately separate from resolve(): it returns USD as well as the local
     * amount, because the card processors are charged in USD today, and it
     * carries the resolved source so an order row can record which rule priced
     * it. Never takes a price from the request.
     *
     * @return array{usd:float,local_amount:float,local_currency:string,source:string}
     */
    public function chargeFor(SubscriptionPlan $plan, string $country, string $currency, string $cycle): array
    {
        $r = $this->resolve($plan, $country, $currency, 'web', $cycle);

        // A country override is stated in local money. Converting it back to USD
        // for the processor uses the same rate table as everything else; if the
        // rate is missing we fall back to the USD base rather than charging a
        // number in the wrong denomination.
        $usd = $r['base_usd'];
        if ($r['is_override']) {
            $rate = $this->pricing->rateFor($r['currency']);
            $usd = $rate && $rate > 0 ? round($r['amount'] / $rate, 2) : ($r['base_usd'] ?? $r['amount']);
        }

        return [
            'usd' => (float) ($usd ?? 0),
            'local_amount' => $r['amount'],
            'local_currency' => $r['currency'],
            'source' => $r['source'],
        ];
    }

    /** The matching override row, or null. Country first, then currency. */
    public function overrideFor(SubscriptionPlan $plan, string $country, string $currency, string $surface, string $cycle): ?object
    {
        // Mode is the switch. Off means overrides exist but are not consulted.
        if (($plan->pricing_mode ?? 'global') !== 'country') {
            return null;
        }

        $now = Carbon::now();

        return DB::table('plan_price_overrides')
            ->where('subscription_plan_id', $plan->id)
            ->where('billing_cycle', $cycle)
            ->where('surface', $surface)
            ->where('is_enabled', true)
            ->where(fn ($q) => $q->whereNull('effective_from')->orWhere('effective_from', '<=', $now))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', $now))
            ->where(fn ($q) => $q->where('country_code', strtoupper($country))
                                 ->orWhere('currency_code', strtoupper($currency)))
            // Country first. NULLS LAST is not portable, so this orders on a
            // computed flag and behaves identically on Postgres and SQLite.
            ->orderByRaw('CASE WHEN country_code IS NULL THEN 1 ELSE 0 END')
            ->first();
    }

    /**
     * Every enabled country, priced, for the admin table and preview.
     *
     * One query for the countries and one for the overrides, then resolved in
     * memory - not a resolve() call per country, which would be ~66 cache
     * lookups and 66 rate reads to render one page.
     *
     * @return array<int,array<string,mixed>>
     */
    public function matrix(SubscriptionPlan $plan, string $cycle = 'month', string $surface = 'web'): array
    {
        $cycle = $this->normaliseCycle($cycle);

        /* BOTH surfaces, always.
           The admin table used to be built for one surface and the UI asked
           only for 'web', so a separate app price was invisible and there was
           no way to tell whether the two platforms charged the same. Since the
           question an admin actually has is "do these match?", the answer has
           to carry both numbers - one surface at a time cannot express it. */
        $usdWeb = $this->baseUsd($plan, 'web');
        $usdApp = $this->baseUsd($plan, 'app');

        $overrides = DB::table('plan_price_overrides')
            ->where('subscription_plan_id', $plan->id)
            ->where('billing_cycle', $cycle)
            ->get();

        $index = [];
        foreach ($overrides as $o) {
            $key = ($o->country_code ? 'c:' . strtoupper($o->country_code) : 'x:' . strtoupper((string) $o->currency_code));
            $index[$o->surface][$key] = $o;
        }

        $pick = function (string $sfc, string $code, string $ccy) use ($index) {
            // Country beats currency here too, matching resolve().
            return $index[$sfc]['c:' . $code] ?? $index[$sfc]['x:' . $ccy] ?? null;
        };

        $rows = [];
        foreach (\App\Models\CountryCurrencyMap::orderBy('country_name')->get() as $c) {
            $code = strtoupper($c->country_code);
            $ccy = strtoupper($c->currency_code);

            $qWeb = $usdWeb !== null ? $this->pricing->quote($usdWeb, $ccy, $code) : null;
            $qApp = $usdApp !== null ? $this->pricing->quote($usdApp, $ccy, $code) : null;

            $oWeb = $pick('web', $code, $ccy);
            $oApp = $pick('app', $code, $ccy);

            $webEff = $oWeb ? (float) $oWeb->price : ($qWeb['amount'] ?? null);
            $appEff = $oApp ? (float) $oApp->price : ($qApp['amount'] ?? null);

            $rows[] = [
                'country_code' => $code,
                'country_name' => $c->country_name,
                'currency_code' => $ccy,
                'country_enabled' => (bool) $c->is_enabled,

                'web_custom' => $oWeb ? (float) $oWeb->price : null,
                'web_global' => $qWeb['amount'] !== null ? (float) $qWeb['amount'] : null,
                'app_custom' => $oApp ? (float) $oApp->price : null,
                'app_global' => $qApp['amount'] !== null ? (float) $qApp['amount'] : null,

                // What each platform would ACTUALLY charge, override or not.
                'web_effective' => $webEff !== null ? (float) $webEff : null,
                'app_effective' => $appEff !== null ? (float) $appEff : null,
                // The question the admin is asking. Null when either side is
                // unknown - claiming "same" on missing data would be a lie.
                'platforms_match' => ($webEff !== null && $appEff !== null)
                    ? round((float) $webEff, 2) === round((float) $appEff, 2)
                    : null,

                // Kept under the old keys so nothing reading the web view breaks.
                'custom_price' => $oWeb ? (float) $oWeb->price : null,
                'global_price' => $qWeb['amount'] !== null ? (float) $qWeb['amount'] : null,
                'difference_pct' => ($oWeb && ! empty($qWeb['amount']))
                    ? round((((float) $oWeb->price - (float) $qWeb['amount']) / (float) $qWeb['amount']) * 100, 1)
                    : null,

                'has_override' => $oWeb !== null || $oApp !== null,
                'has_web_override' => $oWeb !== null,
                'has_app_override' => $oApp !== null,
                'updated_at' => $oWeb->updated_at ?? $oApp->updated_at ?? null,
                'note' => $oWeb->note ?? $oApp->note ?? null,

                // No rate for this currency - it will be quoted in USD.
                'currency_supported' => $qWeb ? (bool) ($qWeb['is_converted'] ?? false) : false,
                'status' => ($oWeb || $oApp) ? 'custom' : 'global',
            ];
        }

        return $rows;
    }

    /**
     * Invalidate every cached price for a plan, in one write.
     *
     * Done by bumping a per-plan generation number that is part of every cache
     * key, so the old keys become unreachable and expire on their own.
     *
     * The obvious alternative - enumerating the keys and forgetting each one -
     * was tried and is WRONG: the key set is (country × currency × cycle ×
     * surface), and the only place to enumerate countries from is
     * country_currency_map. Any country not in that table, or any caller whose
     * currency differs from that table's, keeps a stale price until the TTL
     * lapses. A test caught exactly that: a country absent from the map kept
     * quoting the pre-change price after a flush.
     *
     * A generation counter has no such hole - it does not need to know which
     * keys exist - and it is a single atomic write on every cache driver,
     * including the file driver this deployment currently uses.
     */
    public function flush(SubscriptionPlan $plan): void
    {
        $key = $this->generationKey($plan->id);

        // increment() returns false on a missing key with some drivers, so the
        // put() is the fallback rather than an alternative path.
        if (Cache::increment($key) === false) {
            Cache::forever($key, 2);
        }

        // Rates and rounding live in PricingService's own cache; a plan price
        // change does not invalidate those, so they are deliberately left
        // alone - flushing them would throw away every OTHER plan's conversion
        // cache to fix one plan.
    }

    /** Current cache generation for a plan. Starts at 1 and only ever rises. */
    private function generation(int $planId): int
    {
        return (int) (Cache::get($this->generationKey($planId)) ?: 1);
    }

    private function generationKey(int $planId): string
    {
        return "plan:price:gen:{$planId}";
    }

    /** Record what changed. Append-only; never updated, never deleted. */
    public function recordHistory(array $row): void
    {
        DB::table('plan_price_history')->insert(array_merge([
            'created_at' => now(),
        ], $row));
    }

    private function baseUsd(SubscriptionPlan $plan, string $surface): ?float
    {
        $usd = $plan->priceUsdFor($surface);

        return $usd !== null ? (float) $usd : null;
    }

    private function normaliseCycle(?string $c): string
    {
        $c = $c === 'year' || $c === 'annual' ? 'year' : 'month';

        return in_array($c, self::CYCLES, true) ? $c : 'month';
    }

    /** Generation is IN the key - that is what makes flush() total. */
    private function cacheKey(int $planId, string $country, string $currency, string $surface, string $cycle): string
    {
        $g = $this->generation($planId);

        return "plan:price:{$planId}:g{$g}:{$country}:{$currency}:{$surface}:{$cycle}";
    }
}
