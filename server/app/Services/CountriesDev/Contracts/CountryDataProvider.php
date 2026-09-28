<?php

namespace App\Services\CountriesDev\Contracts;

/**
 * Provider abstraction for external country-data/geolocation sources.
 * countries.dev (CountriesDevProvider) is the only implementation today,
 * but nothing outside this namespace depends on it directly - CountryData
 * Service and IpCountryService both depend on CountriesDevGateway, which
 * depends on this interface. A future second provider (or a fallback
 * cascade between two) is a new class here, never a rewrite of the
 * services that consume country data.
 *
 * Implementations MUST be pure I/O: no caching, no circuit breaking, no
 * rate limiting - all of that is CountriesDevGateway's job, which sits in
 * front of whatever implements this interface. An implementation is free
 * to throw on failure (CountriesDevGateway is the layer that guarantees
 * "never throws" to the rest of the app).
 */
interface CountryDataProvider
{
    /**
     * Static metadata for one ISO 3166-1 alpha-2 code (e.g. "US").
     * Returns null when the provider has no record for this code (e.g. a
     * clean 404) - that is a valid, non-error outcome, not a failure.
     *
     * @return array<string,mixed>|null raw, unvalidated provider payload
     */
    public function fetchByAlpha2(string $code): ?array;

    /**
     * Resolves a specific IP address to its country. $ip must be a
     * concrete, already-resolved address - never call this with "the
     * caller's own IP" semantics (this app's server IS the caller from the
     * provider's point of view, which would silently resolve to the wrong
     * country for every real user).
     *
     * @return array<string,mixed>|null raw, unvalidated provider payload
     */
    public function fetchByIp(string $ip): ?array;
}
