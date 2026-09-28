<?php

namespace App\Services\Ads;

use App\Services\Ads\Contracts\AdPredictor;

/**
 * Orchestrates one ad decision: candidate pool -> targeting -> frequency cap -> auction.
 * Returns the winning ad or null (no-fill → the caller shows an organic item instead).
 * The caller gates on config('ads.enabled'); this service is pure decisioning so it
 * stays reusable and testable.
 */
class AdServer
{
    public function __construct(
        private AdCandidateRepository $repo,
        private AdPredictor $predictor,
        private FrequencyCap $freqCap,
    ) {}

    public function decide(AdContext $ctx, int $floorCpmCents = 0): ?AdDecision
    {
        $eligible = [];
        foreach ($this->repo->forPlacement($ctx->placement) as $c) {
            if (in_array($c->campaignId, $ctx->seenCampaignIds, true)) {
                continue;
            }
            if (! AdTargeting::matches($c, $ctx)) {
                continue;
            }
            if (! $this->freqCap->allows($ctx, $c->campaignId)) {
                continue;
            }
            $eligible[] = $c;
        }

        return (new AdAuction($this->predictor))->run($eligible, $ctx, $floorCpmCents);
    }
}
