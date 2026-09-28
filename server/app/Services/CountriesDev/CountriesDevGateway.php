<?php

namespace App\Services\CountriesDev;

use App\Services\CountriesDev\Contracts\CountryDataProvider;
use App\Services\CountriesDev\Support\CountriesDevCircuitBreaker;
use App\Services\CountriesDev\Support\CountriesDevFailureClassifier;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The ONE protected, rate-limit-safe access point for countries.dev. Every
 * caller in this app (IpCountryService's Tier 2.5, CountriesSync) goes
 * through here, never CountriesDevProvider directly - this is what makes
 * "countries.dev must never become a single point of failure" true in
 * practice rather than just in a docblock.
 *
 * Guarantees, in order, for every public method:
 *   1. Disabled (config('services.countriesdev.enabled')=false)? -> null, no I/O.
 *   2. Cached? -> return the cached value, no I/O.
 *   3. Single-flight: concurrent identical misses collapse into ONE real
 *      HTTP call (Cache::lock, degrades to a direct call if the active
 *      cache store doesn't support locks - e.g. 'file' - rather than crash).
 *   4. Circuit open? -> null immediately, no I/O, UNLESS this caller wins
 *      the one-per-cooldown-window probe slot.
 *   5. Concurrency at the configured ceiling? -> null immediately, no I/O.
 *   6. Call the provider. Any exception is classified and caught here -
 *      this method NEVER throws. A TRANSIENT failure counts against the
 *      circuit breaker; a PERMANENT one (e.g. 404) does not.
 *
 * Every caller of this gateway can treat a null return as "not available
 * right now" and fall back to its own existing safe default - it is never
 * a caller's job to distinguish disabled vs. cache-miss vs. circuit-open
 * vs. timeout; that distinction only matters for the metrics this class
 * records, not for control flow.
 */
class CountriesDevGateway
{
    private const CONCURRENCY_KEY = 'countriesdev:concurrency';

    public function __construct(
        private readonly CountryDataProvider $provider,
        private readonly CountriesDevCircuitBreaker $breaker,
        private readonly bool $enabled,
        private readonly int $geoCacheTtl,
        private readonly int $metaCacheTtl,
        private readonly int $maxConcurrency,
        private readonly int $requestTimeout,
        private readonly int $lockWaitSeconds = 2,
    ) {}

    /** IP -> country. Never throws. Null on disabled/circuit-open/at-capacity/failure. */
    public function lookupByIp(string $ip): ?array
    {
        if (!$this->enabled) {
            return null;
        }

        $key = 'countriesdev:geo:' . hash('sha256', $ip);

        return $this->cachedSingleFlight($key, $this->geoCacheTtl, function () use ($ip) {
            return $this->guardedCall(fn () => $this->provider->fetchByIp($ip), 'geo');
        });
    }

    /**
     * Alpha-2 code -> full metadata. Never throws. Used ONLY by the sync
     * command - see CountryDataService's own docblock for why request-time
     * code never calls this directly.
     */
    public function fetchCountryMetadata(string $code): ?array
    {
        if (!$this->enabled) {
            return null;
        }

        $code = strtoupper($code);
        $key  = "countriesdev:meta:{$code}";

        return $this->cachedSingleFlight($key, $this->metaCacheTtl, function () use ($code) {
            return $this->guardedCall(fn () => $this->provider->fetchByAlpha2($code), 'meta');
        });
    }

    /** Read-only, for the admin health endpoint - never triggers I/O. */
    public function isCircuitOpen(): bool
    {
        return $this->breaker->isOpen();
    }

    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    /**
     * Cache-first, single-flight wrapper. Uses Lock::block()'s callback
     * form so the lock is always released automatically - no manual
     * acquire/release bookkeeping. Laravel's Lock::block($seconds, $cb)
     * THROWS LockTimeoutException (does not return false) when it gives up
     * waiting - handled explicitly below, degrading to a direct,
     * uncoordinated call rather than blocking this request further. Any
     * other locking failure (store without LockProvider support, e.g.
     * certain custom stores) degrades the same way. Bounded by the
     * provider's own timeout either way, never an unbounded wait.
     */
    private function cachedSingleFlight(string $key, int $ttl, \Closure $compute): ?array
    {
        $cached = Cache::get($key);
        if ($cached !== null) {
            $this->incrementMetric('cache_hits');
            return $cached;
        }
        $this->incrementMetric('cache_misses');

        try {
            return Cache::lock("{$key}:lock", $this->requestTimeout + 5)
                ->block($this->lockWaitSeconds, function () use ($key, $ttl, $compute) {
                    // Double-check: whoever held the lock immediately before
                    // us may have already populated the cache.
                    $cached = Cache::get($key);
                    if ($cached !== null) {
                        return $cached;
                    }
                    $result = $compute();
                    if ($result !== null) {
                        Cache::put($key, $result, $ttl);
                    }
                    return $result;
                });
        } catch (LockTimeoutException $e) {
            // Someone else is already computing it and we timed out waiting.
            return $compute();
        } catch (Throwable $e) {
            // Cache::lock() unsupported by the active store, or any other
            // locking failure - never let this block the request.
            return $compute();
        }
    }

    /** Circuit breaker + concurrency guard + failure classification, around one real provider call. */
    private function guardedCall(\Closure $call, string $tag): ?array
    {
        if ($this->breaker->isOpen() && !$this->breaker->tryAcquireProbe()) {
            $this->incrementMetric('circuit_open');
            return null;
        }

        if (!$this->tryAcquireConcurrencySlot()) {
            $this->incrementMetric('concurrency_rejected');
            return null;
        }

        $this->incrementMetric('requests');

        try {
            $result = $call();
            $this->breaker->recordSuccess();
            $this->incrementMetric('success');
            return $result;
        } catch (Throwable $e) {
            $classification = CountriesDevFailureClassifier::classify($e);
            if ($classification === CountriesDevFailureClassifier::TRANSIENT) {
                $this->breaker->recordFailure();
                $this->incrementMetric('failures');
            }
            Log::warning('countriesdev.gateway_call_failed', [
                'tag'            => $tag,
                'classification' => $classification,
                'error'          => $e->getMessage(),
            ]);
            return null;
        } finally {
            $this->releaseConcurrencySlot();
        }
    }

    /**
     * Cache::add seeds the counter with a TTL only the first time it's
     * created; Cache::increment on an existing key preserves whatever TTL
     * is already set. So the key always self-expires within roughly
     * requestTimeout+buffer of the first slot being taken, even if a
     * decrement is never reached (a crashed/OOM-killed worker) - never a
     * permanent leak. Deliberately not Cache::expire() (Redis-only, not a
     * portable Cache-facade method).
     */
    private function tryAcquireConcurrencySlot(): bool
    {
        Cache::add(self::CONCURRENCY_KEY, 0, $this->requestTimeout + 10);
        $n = Cache::increment(self::CONCURRENCY_KEY);

        if ($n > $this->maxConcurrency) {
            Cache::decrement(self::CONCURRENCY_KEY);
            return false;
        }
        return true;
    }

    private function releaseConcurrencySlot(): void
    {
        Cache::decrement(self::CONCURRENCY_KEY);
    }

    /**
     * Lifetime counters for the admin health view - never a request-
     * blocking concern. Cache::add() seeds the key at 0 (a very long TTL,
     * ~1 year - "lifetime" in practice, not literally forever, so a
     * long-abandoned counter can't accumulate unbounded rows on the
     * database store). Deliberately NOT a bare Cache::increment(): on the
     * 'database' cache store (unlike array/redis), incrementing a key that
     * doesn't exist yet silently returns false and writes nothing - the
     * seed makes this portable across every store.
     */
    private function incrementMetric(string $name): void
    {
        try {
            $key = "countriesdev:metrics:{$name}";
            Cache::add($key, 0, now()->addYear());
            Cache::increment($key);
        } catch (Throwable $e) {
            // Metrics are best-effort only - never let a counter failure
            // affect the actual lookup.
        }
    }
}
