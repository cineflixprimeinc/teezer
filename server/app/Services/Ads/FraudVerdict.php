<?php

namespace App\Services\Ads;

/**
 * Result of a FraudGuard assessment for a single ad event.
 * action: 'allow' (bill normally) | 'flag' (bill, but log for review) | 'block' (never bill).
 */
class FraudVerdict
{
    public function __construct(
        public bool $allowed,
        public int $score,
        public string $action,
        public ?string $reason = null,
    ) {}

    public static function allow(): self
    {
        return new self(true, 0, 'allow', null);
    }
}
