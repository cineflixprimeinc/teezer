<?php

namespace App\Services;

use App\Models\CountryCurrencyMap;
use App\Models\Currency;
use App\Models\ExchangeRate;
use App\Models\RoundingRule;
use App\Models\UserCurrencyPreference;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * The only thing allowed to turn a USD base price into a price a user sees.
 *
 * USD is the single source of truth. Nothing here writes a local price back to
 * a product; a local price is derived per request, cached, and thrown away.
 *
 * NOT FOR IN-APP PURCHASES. App Store and Play Billing set their own local
 * prices from their own tier tables and will not accept an amount from us, so
 * an app must display the price the STORE reports, not one of these. This
 * serves the website and the card processors, where we control the charge.
 * Quoting a converted price next to a store checkout is how displayed and
 * charged amounts end up disagreeing.
 */
class PricingService
{
    /** Rates change slowly; the worker refreshes every 12h, this is the read cache. */
    private const RATE_TTL = 3600;
    private const FALLBACK_COUNTRY = 'US';
    private const FALLBACK_CURRENCY = 'USD';

    /**
     * Resolves the country to quote in, in priority order:
     *
     *   1. a saved preference with auto_detect off - a deliberate choice, and
     *      nothing may overwrite it
     *   2. Cloudflare's CF-IPCountry, which is set at the edge and cannot be
     *      forged past it
     *   3. an explicit ?country= (mobile sends its device region here)
     *   4. Accept-Language's region subtag
     *   5. US
     *
     * The client-supplied sources sit BELOW Cloudflare deliberately: a header a
     * user controls decides presentation, never what they are charged. The
     * charge is recomputed server-side at payment time regardless.
     */
    public function detectCountry(Request $request): string
    {
        if ($user = $request->user()) {
            $pref = UserCurrencyPreference::where('user_id', $user->id)->first();
            if ($pref && ! $pref->auto_detect && $pref->country_code) {
                return strtoupper($pref->country_code);
            }
        }

        $cf = $request->header('CF-IPCountry');
        // Cloudflare sends XX for unknown and T1 for Tor.
        if ($cf && ! in_array($cf, ['XX', 'T1'], true)) {
            return strtoupper($cf);
        }

        $q = $request->query('country');
        if (is_string($q) && preg_match('/^[A-Za-z]{2}$/', $q)) {
            return strtoupper($q);
        }

        // "en-GB,en;q=0.9" → GB
        $al = (string) $request->header('Accept-Language');
        if (preg_match('/[a-z]{2}[-_]([A-Z]{2})/i', $al, $m)) {
            return strtoupper($m[1]);
        }

        return self::FALLBACK_COUNTRY;
    }

    /** The currency for a country, or USD when the market is not configured. */
    public function currencyForCountry(string $countryCode): string
    {
        $code = Cache::remember(
            "pricing:country_currency:{$countryCode}",
            self::RATE_TTL,
            fn () => CountryCurrencyMap::enabled()
                ->where('country_code', strtoupper($countryCode))
                ->value('currency_code'),
        );

        if (! $code) {
            return self::FALLBACK_CURRENCY;
        }

        // A mapping pointing at a disabled currency must not quote it.
        $enabled = Cache::remember(
            "pricing:currency_enabled:{$code}",
            self::RATE_TTL,
            fn () => (bool) Currency::where('code', $code)->where('is_enabled', true)->exists(),
        );

        return $enabled ? $code : self::FALLBACK_CURRENCY;
    }

    /** Resolves the currency to quote a request in. */
    public function detectCurrency(Request $request): string
    {
        if ($user = $request->user()) {
            $pref = UserCurrencyPreference::where('user_id', $user->id)->first();
            if ($pref && ! $pref->auto_detect && $pref->currency_code) {
                return strtoupper($pref->currency_code);
            }
        }

        return $this->currencyForCountry($this->detectCountry($request));
    }

    /**
     * USD → target rate. Returns null when there is no usable rate, which the
     * caller must treat as "quote in USD" rather than as zero - a missing rate
     * has produced a free subscription in more than one shipped product.
     */
    public function rateFor(string $currency): ?float
    {
        $currency = strtoupper($currency);
        if ($currency === self::FALLBACK_CURRENCY) {
            return 1.0;
        }

        return Cache::remember("pricing:rate:{$currency}", self::RATE_TTL, function () use ($currency) {
            $row = ExchangeRate::where('base_code', 'USD')->where('target_code', $currency)->first();
            // No freshness check on purpose: a stale rate still prices a
            // checkout, and the refresh worker is what keeps it current.
            return $row ? (float) $row->rate : null;
        });
    }

    /** The rounding rule for a market - country-specific beats currency-wide. */
    public function ruleFor(string $currency, ?string $country): ?RoundingRule
    {
        return Cache::remember(
            "pricing:rule:{$currency}:" . ($country ?? '-'),
            self::RATE_TTL,
            function () use ($currency, $country) {
                $q = RoundingRule::where('is_enabled', true)->where('currency_code', $currency);

                return (clone $q)->where('country_code', $country)->first()
                    ?? (clone $q)->whereNull('country_code')->first();
            },
        );
    }

    /**
     * The one public entry point: a USD amount in, a fully-formed quote out.
     *
     * Returns the currency code, symbol, raw converted amount and the formatted
     * string, so no client ever multiplies, rounds or formats anything.
     * `is_converted` is false when the quote fell back to USD, which is how a
     * caller can tell a real local price from the fallback.
     */
    public function quote(float $usd, string $currency, ?string $country = null): array
    {
        $currency = strtoupper($currency);
        $requested = $currency;
        $rate = $this->rateFor($currency);

        /**
         * No rate is not an error the user should see; it is a USD quote.
         *
         * This is the whole fallback strategy in four lines: an unsupported
         * currency, a provider that has never been reached, and a Redis miss
         * with no row behind it all land here and all produce a valid $4.99
         * rather than an error, an empty page, or a zero.
         *
         * It is recorded because it is otherwise invisible - nothing breaks, so
         * without this nobody would discover that the home market is being
         * quoted in dollars.
         */
        if ($rate === null || $rate <= 0) {
            $currency = self::FALLBACK_CURRENCY;
            $rate = 1.0;

            if ($requested !== self::FALLBACK_CURRENCY) {
                $this->recordFallback($country, $requested);
            }
        }

        $converted = $usd * $rate;

        if ($rule = $this->ruleFor($currency, $country)) {
            $converted = $rule->apply($converted);
        }

        $meta = Cache::remember(
            "pricing:currency:{$currency}",
            self::RATE_TTL,
            fn () => Currency::where('code', $currency)->first(),
        );

        return [
            'base_usd'     => round($usd, 2),
            'currency'     => $currency,
            'symbol'       => $meta?->symbol ?? '$',
            'amount'       => round($converted, $meta?->decimals ?? 2),
            'formatted'    => $meta ? $meta->format($converted) : '$' . number_format($converted, 2),
            'rate'         => $rate,
            'is_converted' => $currency !== self::FALLBACK_CURRENCY,
        ];
    }

    /** Convenience: detect from the request, then quote. */
    public function quoteFor(Request $request, float $usd): array
    {
        $country = $this->detectCountry($request);

        return $this->quote($usd, $this->currencyForCountry($country), $country) + ['country' => $country];
    }

    /**
     * Notes a USD fallback, at most once per market per day of traffic.
     *
     * Two protections, because this sits on the pricing hot path:
     *
     *  - A Redis marker collapses a day's requests for one market to a single
     *    database write. Without it, an unsupported home market would issue a
     *    write per request - millions a day to record one fact.
     *  - The whole thing is swallowed on failure. A pricing system whose job is
     *    "never fail because a rate is missing" must not then fail because it
     *    could not write an analytics row.
     */
    private function recordFallback(?string $country, string $currency): void
    {
        try {
            $marker = 'pricing:fallback_seen:' . ($country ?? '-') . ':' . $currency . ':' . now()->toDateString();
            if (Cache::has($marker)) {
                return;
            }
            // Expires with the day it counts, so tomorrow logs again.
            Cache::put($marker, 1, now()->endOfDay());

            \App\Models\PricingFallbackLog::record($country ?? 'US', $currency, 'unsupported');
        } catch (\Throwable $e) {
            Log::warning('pricing fallback log failed', [
                'country' => $country, 'currency' => $currency, 'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Drops the pricing read caches after an admin edits rates, rules or
     * mappings.
     *
     * Deletes exactly the pricing keys. This used to call Cache::flush(), which
     * empties the ENTIRE shared store - on this deployment Redis backs sessions
     * and every other cache too, so saving one rounding rule would have wiped
     * all of it at once and stampeded the database. Targeted deletion only.
     */
    public function flush(): void
    {
        foreach (['rate', 'rule', 'currency', 'country_currency', 'currency_enabled'] as $group) {
            foreach (Currency::pluck('code') as $code) {
                Cache::forget("pricing:{$group}:{$code}");
            }
        }

        foreach (CountryCurrencyMap::all(['country_code', 'currency_code']) as $m) {
            Cache::forget("pricing:country_currency:{$m->country_code}");
            Cache::forget("pricing:rule:{$m->currency_code}:{$m->country_code}");
        }
    }
}
