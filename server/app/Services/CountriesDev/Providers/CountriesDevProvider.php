<?php

namespace App\Services\CountriesDev\Providers;

use App\Services\CountriesDev\Contracts\CountryDataProvider;
use App\Services\CountriesDev\Support\CountriesDevRequestException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * HTTP client for https://countries.dev - a free, keyless, no-documented-
 * rate-limit country-data/geolocation API. Structurally mirrors
 * ApiVideoProvider's client()/shouldRetry()/retryDelay()/request() pattern
 * (app/Services/Video/Providers/ApiVideoProvider.php) - same retry/timeout/
 * 429 handling, same failure-wrapping shape, applied to a different provider.
 *
 * Confirmed live (not assumed) endpoint contract, this session:
 *   GET /alpha/{code}   - static metadata by ISO alpha-2 or alpha-3
 *   GET /ip/{address}   - resolves an EXPLICIT ip (verified /ip/8.8.8.8 -> US)
 *   GET /ip (bare)      - resolves the CALLER's own IP only - NEVER use this
 *                         to look up an end user's IP from the backend, it
 *                         would silently return Reelsoo's own server's
 *                         country instead. A ?ip= query param does NOT
 *                         override it either (tested) - the path-segment
 *                         form above is the only correct one.
 *   No bulk "list all countries" endpoint exists.
 *
 * Pure I/O only - no caching, no circuit breaking (that's
 * CountriesDevGateway's job). This class is free to throw; the gateway is
 * what guarantees the rest of the app never sees an exception from here.
 */
class CountriesDevProvider implements CountryDataProvider
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly int $timeout,
        private readonly int $retryLimit,
    ) {}

    public function fetchByAlpha2(string $code): ?array
    {
        $code = strtoupper(trim($code));

        try {
            $response = $this->request(
                fn () => $this->client()->get("/alpha/{$code}"),
                "fetchByAlpha2:{$code}",
            );
        } catch (CountriesDevRequestException $e) {
            if ($e->httpStatus === 404) {
                // Not a failure - this code has no record with this provider.
                return null;
            }
            throw $e;
        }

        return $response->json();
    }

    public function fetchByIp(string $ip): ?array
    {
        try {
            $response = $this->request(
                fn () => $this->client()->get('/ip/' . $ip),
                'fetchByIp',
            );
        } catch (CountriesDevRequestException $e) {
            if ($e->httpStatus === 404) {
                return null;
            }
            throw $e;
        }

        return $response->json();
    }

    private function client()
    {
        return Http::baseUrl($this->baseUrl)
            ->acceptJson()
            ->timeout($this->timeout)
            ->retry($this->retryLimit, $this->retryDelay(...), $this->shouldRetry(...));
    }

    /**
     * Only retry what retrying can actually fix: a connection-level blip
     * or a provider-side 5xx/429. A 4xx (most commonly 404, "unknown
     * code/IP") fails identically every time - retrying it only delays the
     * null-return no-op for no benefit.
     */
    private function shouldRetry(\Throwable $e): bool
    {
        if ($e instanceof ConnectionException) {
            return true;
        }
        if ($e instanceof RequestException) {
            $status = $e->response->status();
            return $status === 429 || $status >= 500;
        }
        return false;
    }

    /**
     * Milliseconds to wait before the next attempt. countries.dev does not
     * document or send a Retry-After/X-RateLimit-Retry-After header
     * (unlike api.video), so this is always a short capped exponential
     * backoff - never a guessed provider-specific wait time.
     */
    private function retryDelay(int $attempt): int
    {
        return min(500 * (2 ** $attempt), 4000);
    }

    /**
     * Runs one request, converting a failure (after client()'s own retry/
     * backoff has been exhausted, or immediately for a non-retryable
     * status) into CountriesDevRequestException - carrying the real HTTP
     * status so CountriesDevFailureClassifier classifies from actual
     * response data instead of a re-parsed message string.
     */
    private function request(\Closure $send, string $action)
    {
        try {
            return $send();
        } catch (RequestException $e) {
            $status = $e->response->status();

            // 404 is an expected, frequent outcome (unknown code/IP) - log
            // at info, not error, to avoid alert-fatigue-by-design.
            $level = $status === 404 ? 'info' : 'error';
            Log::log($level, 'countriesdev.request_failed', [
                'action' => $action,
                'status' => $status,
            ]);

            throw new CountriesDevRequestException(
                "countries.dev {$action} failed with status {$status}",
                httpStatus: $status,
                retryAfterSeconds: null,
                action: $action,
                previous: $e,
            );
        } catch (ConnectionException $e) {
            Log::error('countriesdev.request_failed', ['action' => $action, 'error' => $e->getMessage()]);

            throw new CountriesDevRequestException(
                "countries.dev {$action} failed: {$e->getMessage()}",
                httpStatus: null,
                retryAfterSeconds: null,
                action: $action,
                previous: $e,
            );
        }
    }
}
