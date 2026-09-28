<?php

namespace App\Services\Ads;

use Illuminate\Support\Facades\Redis;

/**
 * Loads the candidate pool for a placement — from the precomputed Redis pool
 * (hot path), falling back to a direct DB query if the pool isn't built yet.
 */
class AdCandidateRepository
{
    public function __construct(private EligibleAdPoolBuilder $builder) {}

    /** @return AdCandidate[] */
    public function forPlacement(string $placement): array
    {
        $raw = Redis::connection('default')->get("ads:pool:{$placement}");
        if (is_string($raw) && $raw !== '') {
            $arr = json_decode($raw, true);
            if (is_array($arr)) {
                return array_map(fn ($a) => AdCandidate::fromArray($a), $arr);
            }
        }

        // Cold cache: query DB and filter to this placement.
        return array_values(array_filter(
            $this->builder->eligibleCandidates(),
            fn (AdCandidate $c) => in_array($placement, $c->placements, true),
        ));
    }
}
