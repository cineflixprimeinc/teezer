<?php

namespace App\Services\Video\Support;

use Throwable;

/**
 * The one place that decides transient vs permanent for an api.video
 * failure - kept separate from VideoProcessingService so the actual rule
 * set is reviewable on its own, matching the spec's "do not scatter
 * fallback decisions throughout the codebase" instruction.
 *
 * By the time a failure reaches here, ApiVideoProvider's own client() has
 * ALREADY retried transient-looking failures (429/5xx/connection errors)
 * with backoff and given up - see that class. So "transient" arriving here
 * means "retries were exhausted, not that none were tried" - the caller
 * (VideoProcessingService) still gets to decide whether THAT is itself
 * enough to fall back (e.g. a job stuck past its own timeout) or should be
 * retried again at the job level via Laravel's queue retry.
 */
class ApiVideoFailureClassifier
{
    public const TRANSIENT = 'transient';
    public const PERMANENT = 'permanent';

    public static function classify(Throwable $e): string
    {
        if (!$e instanceof ApiVideoRequestException) {
            // An unrecognized exception (a bug, a JSON-decode failure, a
            // logic error in this codebase) - permanent, since retrying
            // can never fix something that isn't actually a provider
            // failure in the first place.
            return self::PERMANENT;
        }

        if ($e->httpStatus === null) {
            // Connection-level failure, no response ever arrived - the
            // provider itself may be fine; this network path just isn't
            // working right now.
            return self::TRANSIENT;
        }

        if ($e->httpStatus === 429 || $e->httpStatus >= 500) {
            return self::TRANSIENT;
        }

        // Any other 4xx (400 bad request, 401/403 auth, 404 not found, 413
        // payload too large, 415 unsupported media type, 422 unprocessable)
        // is api.video telling us definitively something about THIS request
        // or THIS video is wrong. Retrying the identical request fails
        // identically every time.
        return self::PERMANENT;
    }
}
