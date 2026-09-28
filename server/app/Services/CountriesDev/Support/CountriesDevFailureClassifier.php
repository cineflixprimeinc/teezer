<?php

namespace App\Services\CountriesDev\Support;

use Throwable;

/**
 * The one place that decides transient vs permanent for a countries.dev
 * failure - mirrors ApiVideoFailureClassifier's structure and reasoning
 * (see app/Services/Video/Support/ApiVideoFailureClassifier.php).
 *
 * By the time a failure reaches here, CountriesDevProvider's own client()
 * has ALREADY retried transient-looking failures (429/5xx/connection
 * errors) with backoff and given up. Only TRANSIENT failures ever count
 * against CountriesDevCircuitBreaker - a 404 (unknown country code) is a
 * normal, valid outcome, not a provider failure, and must never trip the
 * breaker.
 */
class CountriesDevFailureClassifier
{
    public const TRANSIENT = 'transient';
    public const PERMANENT = 'permanent';

    public static function classify(Throwable $e): string
    {
        if (!$e instanceof CountriesDevRequestException) {
            // An unrecognized exception (a bug, a JSON-decode failure) -
            // permanent, since retrying can never fix something that isn't
            // actually a provider failure in the first place.
            return self::PERMANENT;
        }

        if ($e->httpStatus === null) {
            // Connection-level failure, no response ever arrived.
            return self::TRANSIENT;
        }

        if ($e->httpStatus === 429 || $e->httpStatus >= 500) {
            return self::TRANSIENT;
        }

        // Any other 4xx - most commonly 404 ("this code/IP has no known
        // country") - is countries.dev telling us definitively something
        // about THIS request, not a provider outage. Never a breaker trip.
        return self::PERMANENT;
    }
}
