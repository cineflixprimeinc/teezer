<?php

namespace App\Services\Ads\Contracts;

use App\Services\Ads\AdCandidate;
use App\Services\Ads\AdContext;

/**
 * Predicts click-through and quality for a candidate in a given context.
 * The heuristic implementation ships now; a trained CTR/CVR model drops in behind
 * this same interface later (Phase 8) with no change to the auction or feed.
 */
interface AdPredictor
{
    /** Predicted click-through rate, 0..1. */
    public function pCtr(AdCandidate $candidate, AdContext $ctx): float;

    /** Quality / relevance score, 0..1. */
    public function quality(AdCandidate $candidate, AdContext $ctx): float;
}
