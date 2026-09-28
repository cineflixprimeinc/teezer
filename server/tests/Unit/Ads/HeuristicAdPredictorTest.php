<?php

namespace Tests\Unit\Ads;

use App\Services\Ads\AdCandidate;
use App\Services\Ads\AdContext;
use App\Services\Ads\HeuristicAdPredictor;
use PHPUnit\Framework\TestCase;

class HeuristicAdPredictorTest extends TestCase
{
    public function test_pctr_falls_back_to_prior_without_history(): void
    {
        $p   = new HeuristicAdPredictor();
        $c   = new AdCandidate(1, 1, 1, 100, 'cpm', [], ['in_feed']);
        $this->assertEqualsWithDelta(0.01, $p->pCtr($c, new AdContext('in_feed')), 0.005);
    }

    public function test_pctr_reflects_strong_history(): void
    {
        $p = new HeuristicAdPredictor();
        $c = new AdCandidate(1, 1, 1, 100, 'cpm', [], ['in_feed'], stats: ['impressions' => 10000, 'clicks' => 500]); // 5%
        $this->assertGreaterThan(0.02, $p->pCtr($c, new AdContext('in_feed')));
    }

    public function test_quality_rewards_complete_and_relevant_creative(): void
    {
        $p    = new HeuristicAdPredictor();
        $ctx  = new AdContext('in_feed', interests: ['Travel']);
        $bare = new AdCandidate(1, 1, 1, 100, 'cpm', [], ['in_feed']);
        $rich = new AdCandidate(1, 1, 1, 100, 'cpm', ['interests' => ['travel']], ['in_feed'],
            videoId: 5, meta: ['headline' => 'See Nepal', 'cta_type' => 'shop_now']);

        $this->assertGreaterThan($p->quality($bare, $ctx), $p->quality($rich, $ctx));
    }
}
