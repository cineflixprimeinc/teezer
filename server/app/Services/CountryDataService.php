<?php

namespace App\Services;

use App\Models\CountryMetadata;
use Illuminate\Support\Facades\Cache;

/**
 * Country METADATA facade (name, flag, currency, calling code, region,
 * etc.) - reads ONLY the local country_metadata table, refreshed
 * asynchronously by the countries:sync command. NEVER calls
 * CountriesDevGateway/countries.dev synchronously - there is no reason to
 * call an external provider on every signup or every admin page load just
 * to learn "NP = Nepal". A missing row means the sync hasn't run yet, or
 * the code is invalid; neither is worth a request-time external call for.
 *
 * Named CountryDataService, not "CountryService" - that name is already
 * taken by the unrelated 60-day country-lock + continuous-verification
 * system (see app/Services/CountryService.php's own docblock). This class
 * has nothing to do with that one and never touches its tables.
 *
 * Deliberately does NOT duplicate signup/login policy - see
 * CountryAvailabilityService for that. isCountryAvailableForSignup()/
 * isCountryAvailableForLogin() below are thin delegates, kept here only so
 * callers that think in terms of "the country service" have one place with
 * both data and policy questions answered, without this class owning any
 * of the policy logic itself.
 */
class CountryDataService
{
    private const LIST_CACHE_KEY = 'country_metadata:list';
    private const ITEM_CACHE_PREFIX = 'country_metadata:code:';

    public function __construct(private readonly CountryAvailabilityService $availability) {}

    /** @return array<string,mixed>|null */
    public function getCountryByCode(string $code): ?array
    {
        $code = strtoupper($code);

        return Cache::remember(self::ITEM_CACHE_PREFIX . $code, 3600, function () use ($code) {
            $row = CountryMetadata::where('country_code', $code)->first();
            return $row ? $this->present($row) : null;
        });
    }

    /** Alias kept for the spec's requested API surface - identical to getCountryByCode(). */
    public function getCountryMetadata(string $code): ?array
    {
        return $this->getCountryByCode($code);
    }

    /** @return array<int,array<string,mixed>> */
    public function getCountryList(): array
    {
        return Cache::remember(self::LIST_CACHE_KEY, 3600, function () {
            return CountryMetadata::orderBy('name')->get()->map(fn ($row) => $this->present($row))->all();
        });
    }

    /**
     * Simple local search over name/native_name/country_code. Not cached -
     * the query string varies per call, and this is a cheap indexed-enough
     * local DB scan (at most a few hundred rows), not worth a cache entry
     * per distinct query.
     *
     * @return array<int,array<string,mixed>>
     */
    public function searchCountries(string $query): array
    {
        $query = trim($query);
        if ($query === '') {
            return $this->getCountryList();
        }

        return CountryMetadata::where('name', 'like', "%{$query}%")
            ->orWhere('native_name', 'like', "%{$query}%")
            ->orWhere('country_code', 'like', "%{$query}%")
            ->orderBy('name')
            ->limit(50)
            ->get()
            ->map(fn ($row) => $this->present($row))
            ->all();
    }

    /** Thin delegate - see CountryAvailabilityService, the actual policy engine. */
    public function isCountryAvailableForSignup(string $code): bool
    {
        return $this->availability->signupAllowedForCode($code)['allowed'];
    }

    /** Thin delegate - see CountryAvailabilityService, the actual policy engine. */
    public function isCountryAvailableForLogin(string $code, bool $isExistingUser = true): bool
    {
        return $this->availability->loginAllowedForCode($code, $isExistingUser)['allowed'];
    }

    private function present(CountryMetadata $row): array
    {
        return [
            'code'               => $row->country_code,
            'alpha3Code'         => $row->alpha3_code,
            'numericCode'        => $row->numeric_code,
            'name'               => $row->name,
            'nativeName'         => $row->native_name,
            'region'             => $row->region,
            'subregion'          => $row->subregion,
            'capital'            => $row->capital,
            'population'         => $row->population,
            'areaKm2'            => $row->area_km2,
            'flagEmoji'          => $row->flag_emoji,
            'flagSvgUrl'         => $row->flag_svg_url,
            'callingCodes'       => $row->calling_codes,
            'currencies'         => $row->currencies,
            'languages'          => $row->languages,
            'timezones'          => $row->timezones,
            'synced_at'          => $row->synced_at?->toIso8601String(),
        ];
    }
}
