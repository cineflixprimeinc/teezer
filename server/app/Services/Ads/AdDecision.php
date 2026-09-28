<?php

namespace App\Services\Ads;

/**
 * The auction outcome for one slot. `priceCents` is the second-price clearing
 * eCPM (cost per 1000 impressions) the winner actually pays — billing (P5) charges
 * priceCents/1000 per delivered impression.
 */
class AdDecision
{
    public function __construct(
        public readonly AdCandidate $candidate,
        public readonly int $priceCents,
        public readonly float $ecpm,
        public readonly float $pCtr,
        public readonly float $quality,
    ) {}
}
