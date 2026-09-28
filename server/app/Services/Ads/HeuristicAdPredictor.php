<?php

namespace App\Services\Ads;

use App\Services\Ads\Contracts\AdPredictor;

/**
 * v1 predictor. pCTR = historical CTR smoothed by a Bayesian prior (so a fresh ad
 * isn't judged on zero data); quality rewards a complete creative and interest
 * relevance. Pure — no I/O — so it's fully unit-testable.
 */
class HeuristicAdPredictor implements AdPredictor
{
    private const PRIOR_CTR    = 0.01; // assumed CTR before we have data
    private const PRIOR_WEIGHT = 200;  // strength of the prior, in "virtual impressions"

    public function pCtr(AdCandidate $c, AdContext $ctx): float
    {
        $impressions = max(0, (int) ($c->stats['impressions'] ?? 0));
        $clicks      = max(0, (int) ($c->stats['clicks'] ?? 0));

        $ctr = ($clicks + self::PRIOR_CTR * self::PRIOR_WEIGHT) / ($impressions + self::PRIOR_WEIGHT);

        return min(0.5, max(0.001, $ctr));
    }

    public function quality(AdCandidate $c, AdContext $ctx): float
    {
        $q = 0.5;

        if (! empty($c->meta['headline'])) $q += 0.10;
        if (! empty($c->meta['cta_type'])) $q += 0.05;
        if (! empty($c->videoId))          $q += 0.10; // real video creative

        $adInterests   = array_map('strtolower', (array) ($c->targeting['interests'] ?? []));
        $userInterests = array_map('strtolower', $ctx->interests);
        if ($adInterests && $userInterests && array_intersect($adInterests, $userInterests)) {
            $q += 0.15;
        }

        return min(1.0, max(0.05, $q));
    }
}
