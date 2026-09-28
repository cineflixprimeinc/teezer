<?php

namespace App\Services\CountriesDev\Support;

use RuntimeException;
use Throwable;

/**
 * Carries the real HTTP status out of CountriesDevProvider so
 * CountriesDevFailureClassifier can decide transient-vs-permanent from
 * actual response data instead of re-parsing a message string.
 * retryAfterSeconds is always null - countries.dev does not document or
 * send a Retry-After/X-RateLimit-Retry-After header, unlike api.video
 * (see ApiVideoRequestException, which this class mirrors). httpStatus is
 * null for a connection-level failure (no response ever arrived).
 */
class CountriesDevRequestException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?int $httpStatus,
        public readonly ?int $retryAfterSeconds,
        public readonly string $action,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }
}
