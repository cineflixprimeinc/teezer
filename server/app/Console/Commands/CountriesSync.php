<?php

namespace App\Console\Commands;

use App\Models\CountryMetadata;
use App\Services\CountriesDev\CountriesDevGateway;
use App\Services\IsoCountries;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Refreshes country_metadata from countries.dev. Scheduled weekly - country
 * metadata (flags/currencies/calling codes/etc.) changes rarely, so there is
 * no reason to poll it more often (see the "no over-engineering" / "don't
 * synchronize unnecessarily frequently" requirement).
 *
 * THE RULE, same as RefreshExchangeRates: a failed or malformed fetch for
 * one code must never touch that code's existing row. Every code is
 * validated independently before its own updateOrCreate() - no wrapping
 * transaction (holding one open across up to ~247 paced HTTP calls would be
 * unsound regardless of DB load), so a mid-sync outage just leaves the
 * remaining rows stale, never partially corrupts what's already there.
 *
 * Goes through CountriesDevGateway, not CountriesDevProvider directly - a
 * sync run respects the exact same circuit breaker as every other caller,
 * so a mid-sync outage stops hitting the provider instead of hammering it
 * for the rest of the ~247-code loop.
 */
class CountriesSync extends Command
{
    protected $signature = 'countries:sync
        {--limit= : only process the first N codes (for a quick manual test)}
        {--only= : comma-separated list of specific codes to sync, e.g. US,NP,GB}
        {--pace-ms=300 : milliseconds to sleep between requests - a good-citizen pace even though the provider documents no rate limit}';

    protected $description = 'Refresh local country metadata from countries.dev';

    public function handle(CountriesDevGateway $gateway): int
    {
        if (!$gateway->isEnabled()) {
            $this->warn('countries.dev is disabled (COUNTRIES_DEV_ENABLED=false) - nothing to sync.');
            Log::info('countries:sync skipped - provider disabled');
            return self::SUCCESS;
        }

        $codes = $this->option('only')
            ? array_map('strtoupper', array_filter(array_map('trim', explode(',', (string) $this->option('only')))))
            : array_keys(IsoCountries::map());

        if ($limit = $this->option('limit')) {
            $codes = array_slice($codes, 0, (int) $limit);
        }

        $paceMs = max(0, (int) $this->option('pace-ms'));
        $ok = $skipped = $failed = 0;

        foreach ($codes as $code) {
            $payload = $gateway->fetchCountryMetadata($code);

            if ($payload === null) {
                // Disabled mid-run, circuit open, or a transient failure -
                // the gateway already logged the reason. Leave the existing
                // row (if any) exactly as it is.
                $skipped++;
                continue;
            }

            if (!$this->isValid($payload, $code)) {
                $failed++;
                Log::warning('countries:sync invalid payload, row left unchanged', ['code' => $code]);
                continue;
            }

            CountryMetadata::updateOrCreate(['country_code' => $code], $this->mapRow($payload));
            $ok++;

            if ($paceMs > 0) {
                usleep($paceMs * 1000);
            }
        }

        Cache::put('countriesdev:sync:last_run_at', now()->toIso8601String(), 86400 * 8);
        Cache::put('countriesdev:sync:last_success_count', $ok, 86400 * 8);
        Cache::put('countriesdev:sync:last_skipped_count', $skipped, 86400 * 8);
        Cache::put('countriesdev:sync:last_failure_count', $failed, 86400 * 8);

        // Invalidate CountryDataService's read caches so the refreshed rows
        // are visible immediately rather than waiting out their TTL.
        Cache::forget('country_metadata:list');

        $this->info("countries:sync complete - ok={$ok} skipped={$skipped} failed={$failed}");
        Log::info('countries:sync complete', compact('ok', 'skipped', 'failed'));

        // Always SUCCESS - a degraded/partial sync is a handled outcome
        // (see keepExisting() in RefreshExchangeRates for the same
        // reasoning), not a scheduler-alerting failure.
        return self::SUCCESS;
    }

    /**
     * Reject anything that doesn't look like a real countries.dev country
     * payload before it ever reaches updateOrCreate() - malformed provider
     * data must never corrupt a previously-good local row.
     */
    private function isValid(array $payload, string $expectedCode): bool
    {
        $alpha2 = strtoupper((string) ($payload['alpha2Code'] ?? ''));

        return $alpha2 === $expectedCode
            && !empty($payload['name']) && is_string($payload['name'])
            && isset($payload['currencies']) && is_array($payload['currencies']);
    }

    private function mapRow(array $p): array
    {
        return [
            'alpha3_code'         => is_string($p['alpha3Code'] ?? null) ? $p['alpha3Code'] : null,
            'numeric_code'        => is_string($p['numericCode'] ?? null) ? $p['numericCode'] : null,
            'name'                => mb_substr((string) $p['name'], 0, 150),
            'native_name'         => isset($p['nativeName']) ? mb_substr((string) $p['nativeName'], 0, 150) : null,
            'region'              => isset($p['region']) ? mb_substr((string) $p['region'], 0, 50) : null,
            'subregion'           => isset($p['subregion']) ? mb_substr((string) $p['subregion'], 0, 80) : null,
            'capital'             => isset($p['capital']) ? mb_substr((string) $p['capital'], 0, 150) : null,
            'population'          => is_numeric($p['population'] ?? null) ? (int) $p['population'] : null,
            'area_km2'            => is_numeric($p['area'] ?? null) ? (float) $p['area'] : null,
            'population_density'  => is_numeric($p['populationDensity'] ?? null) ? (float) $p['populationDensity'] : null,
            'flag_emoji'          => isset($p['flag']) ? mb_substr((string) $p['flag'], 0, 16) : null,
            'flag_svg_url'        => is_string($p['flags']['svg'] ?? null) ? mb_substr($p['flags']['svg'], 0, 255) : null,
            'latitude'            => is_numeric($p['latlng'][0] ?? null) ? (float) $p['latlng'][0] : null,
            'longitude'           => is_numeric($p['latlng'][1] ?? null) ? (float) $p['latlng'][1] : null,
            'calling_codes'       => is_array($p['callingCodes'] ?? null) ? $p['callingCodes'] : null,
            'top_level_domains'   => is_array($p['topLevelDomain'] ?? null) ? $p['topLevelDomain'] : null,
            'currencies'          => $p['currencies'],
            'languages'           => is_array($p['languages'] ?? null) ? $p['languages'] : null,
            'timezones'           => is_array($p['timezones'] ?? null) ? $p['timezones'] : null,
            'borders'             => is_array($p['borders'] ?? null) ? $p['borders'] : null,
            'independent'         => isset($p['independent']) ? (bool) $p['independent'] : null,
            'raw_payload'         => $p,
            'synced_at'           => now(),
        ];
    }
}
