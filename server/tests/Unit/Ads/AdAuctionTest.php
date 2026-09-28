<?php

namespace Tests\Unit\Ads;

use App\Services\Ads\AdAuction;
use App\Services\Ads\AdCandidate;
use App\Services\Ads\AdContext;
use App\Services\Ads\Contracts\AdPredictor;
use PHPUnit\Framework\TestCase;

class AdAuctionTest extends TestCase
{
    private function ctx(): AdContext
    {
        return new AdContext('in_feed');
    }

    private function candidate(int $id, int $bidCents, string $bidType = 'cpm'): AdCandidate
    {
        return new AdCandidate($id, $id, $id, $bidCents, $bidType, [], ['in_feed']);
    }

    /** Fixed predictor so the auction math is deterministic. */
    private function predictor(float $pCtr = 0.02, float $quality = 1.0): AdPredictor
    {
        return new class($pCtr, $quality) implements AdPredictor {
            public function __construct(private float $p, private float $q) {}
            public function pCtr($c, $ctx): float { return $this->p; }
            public function quality($c, $ctx): float { return $this->q; }
        };
    }

    public function test_no_candidates_is_no_fill(): void
    {
        $this->assertNull((new AdAuction($this->predictor()))->run([], $this->ctx()));
    }

    public function test_highest_ecpm_wins(): void
    {
        $decision = (new AdAuction($this->predictor()))->run(
            [$this->candidate(1, 100), $this->candidate(2, 300), $this->candidate(3, 200)],
            $this->ctx(),
        );
        $this->assertNotNull($decision);
        $this->assertSame(2, $decision->candidate->campaignId);
    }

    public function test_second_price_clearing(): void
    {
        // CPM bids 300 & 200, quality 1.0 → winner (300) pays the runner-up eCPM (200).
        $decision = (new AdAuction($this->predictor()))->run(
            [$this->candidate(1, 300), $this->candidate(2, 200)],
            $this->ctx(),
        );
        $this->assertSame(1, $decision->candidate->campaignId);
        $this->assertSame(200, $decision->priceCents);
    }

    public function test_floor_excludes_low_bids(): void
    {
        $this->assertNull((new AdAuction($this->predictor()))->run(
            [$this->candidate(1, 40)],
            $this->ctx(),
            floorCpmCents: 50,
        ));
    }

    public function test_single_candidate_pays_floor(): void
    {
        $decision = (new AdAuction($this->predictor()))->run(
            [$this->candidate(1, 300)],
            $this->ctx(),
            floorCpmCents: 50,
        );
        $this->assertSame(1, $decision->candidate->campaignId);
        $this->assertSame(50, $decision->priceCents);
    }

    public function test_cpc_ecpm_scales_with_pctr(): void
    {
        // CPC 50 with pCTR 0.02 → eCPM = 50 * 0.02 * 1000 = 1000, beats a CPM 500.
        $decision = (new AdAuction($this->predictor(0.02, 1.0)))->run(
            [$this->candidate(1, 50, 'cpc'), $this->candidate(2, 500, 'cpm')],
            $this->ctx(),
        );
        $this->assertSame(1, $decision->candidate->campaignId);
    }
}
