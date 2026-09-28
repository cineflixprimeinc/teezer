<?php

namespace App\Services\Video\Support;

use RuntimeException;
use Throwable;

/**
 * Carries the real HTTP status (and, on a 429, the real retry-after seconds
 * api.video sent) out of ApiVideoProvider so ApiVideoFailureClassifier can
 * decide transient-vs-permanent from actual response data instead of
 * re-parsing a message string. httpStatus is null for a connection-level
 * failure (no response ever arrived) - the classifier treats that as
 * transient too, since there is no status to have been permanent about.
 */
class ApiVideoRequestException extends RuntimeException
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
