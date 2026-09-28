<?php

namespace App\Services\CountriesDev\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Cache-only circuit breaker for countries.dev - CLOSED -> OPEN -> (implicit
 * HALF_OPEN via TTL expiry) -> CLOSED. Built entirely from Cache::has/get/
 * put/add/forget, deliberately avoiding Cache::lock() and Cache::expire()
 * here: the former requires a LockProvider-capable store (not 'file'), the
 * latter is a Redis-only command with no portable Cache-facade equivalent.
 * Every method below works identically on array/file/redis/database stores,
 * so this degrades safely rather than crashing in local dev
 * (CACHE_STORE=array) or any environment not yet on Redis.
 *
 * Mechanics: the 'open' key's own TTL IS the cooldown - when it naturally
 * expires, the circuit is implicitly half-open again with no extra state
 * needed. The first caller to see isOpen()===true AND win the atomic
 * tryAcquireProbe() (Cache::add, so exactly one winner) gets to make the
 * one real "test" request for that window; every other caller just gets
 * null immediately via CountriesDevGateway rather than queueing.
 *
 * Local-dev caveat, worth knowing when testing: CACHE_STORE=array is a
 * per-process store, so this breaker's state does not persist across PHP-FPM
 * requests locally - it will never visibly "stay open" between two separate
 * curl calls the way it will once backed by Redis. That's expected, not a
 * bug; force it open within one request/tinker session to observe it.
 */
class CountriesDevCircuitBreaker
{
    private const OPEN_KEY      = 'countriesdev:cb:open';
    private const FAILURES_KEY  = 'countriesdev:cb:failures';
    private const PROBE_KEY     = 'countriesdev:cb:probe';
    private const PROBE_TTL     = 10; // seconds - one probe slot per ~cooldown window

    public function __construct(
        private readonly int $threshold,
        private readonly int $cooldownSeconds,
    ) {}

    public function isOpen(): bool
    {
        return (bool) Cache::has(self::OPEN_KEY);
    }

    /**
     * Atomic "exactly one winner" gate for the one test request allowed
     * while the circuit is open. Cache::add only succeeds if the key does
     * not already exist - no lock/release lifecycle needed, it just
     * self-expires.
     */
    public function tryAcquireProbe(): bool
    {
        return Cache::add(self::PROBE_KEY, 1, self::PROBE_TTL);
    }

    public function recordSuccess(): void
    {
        Cache::forget(self::OPEN_KEY);
        Cache::forget(self::FAILURES_KEY);
    }

    /**
     * Only ever called for TRANSIENT failures (see
     * CountriesDevFailureClassifier) - a 404/other 4xx must never reach
     * here. Refreshes the failures counter's TTL to cooldownSeconds on
     * every failure, so a slow trickle of failures spread out past the
     * cooldown window self-heals instead of eventually tripping.
     */
    public function recordFailure(): void
    {
        $count = (int) Cache::get(self::FAILURES_KEY, 0) + 1;
        Cache::put(self::FAILURES_KEY, $count, $this->cooldownSeconds);

        if ($count >= $this->threshold) {
            Cache::put(self::OPEN_KEY, true, $this->cooldownSeconds);
        }
    }
}
