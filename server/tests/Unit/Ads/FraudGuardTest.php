<?php

namespace Tests\Unit\Ads;

use App\Services\Ads\FraudGuard;
use PHPUnit\Framework\TestCase;

/**
 * Covers the pure score→action decision boundary. The velocity/self-interaction
 * signal collection is integration-tested against Redis/DB elsewhere.
 */
class FraudGuardTest extends TestCase
{
    public function test_score_below_flag_is_allowed(): void
    {
        $this->assertSame('allow', FraudGuard::actionFor(39, 70, 40));
        $this->assertSame('allow', FraudGuard::actionFor(0, 70, 40));
    }

    public function test_score_in_flag_band_is_flagged(): void
    {
        $this->assertSame('flag', FraudGuard::actionFor(40, 70, 40));
        $this->assertSame('flag', FraudGuard::actionFor(69, 70, 40));
    }

    public function test_score_at_or_above_block_is_blocked(): void
    {
        $this->assertSame('block', FraudGuard::actionFor(70, 70, 40));
        $this->assertSame('block', FraudGuard::actionFor(100, 70, 40));
    }
}
