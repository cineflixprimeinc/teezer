<?php

namespace App\Services\Ads;

use App\Services\Ads\Contracts\AdPredictor;

/**
 * Quality-adjusted second-price (GSP) auction. Candidates are ranked by ad-rank
 * (`baseEcpm × quality`); the winner pays the minimum eCPM that would keep it above
 * the runner-up — capped at its own bid, floored at the placement floor. Pure logic,
 * fully unit-testable (predictor injected).
 */
class AdAuction
{
    public function __construct(private AdPredictor $predictor) {}

    /**
     * @param AdCandidate[] $candidates already targeting- and frequency-filtered
     */
    public function run(array $candidates, AdContext $ctx, int $floorCpmCents = 0): ?AdDecision
    {
        $scored = [];
        foreach ($candidates as $c) {
            $pCtr    = $this->predictor->pCtr($c, $ctx);
            $quality = $this->predictor->quality($c, $ctx);
            $base    = $this->baseEcpm($c, $pCtr);   // cents per 1000 impressions
            if ($base < $floorCpmCents) {
                continue;
            }
            $scored[] = ['c' => $c, 'pCtr' => $pCtr, 'quality' => $quality, 'base' => $base, 'rank' => $base * $quality];
        }

        if (! $scored) {
            return null;
        }

        usort($scored, fn ($a, $b) => $b['rank'] <=> $a['rank']);

        $winner     = $scored[0];
        $runnerRank = $scored[1]['rank'] ?? ($floorCpmCents * max(0.0001, $winner['quality']));

        // Clearing eCPM that ties the runner-up's ad-rank, in the winner's terms.
        $clearing = $winner['quality'] > 0 ? $runnerRank / $winner['quality'] : $winner['base'];
        $price    = (int) round(max((float) $floorCpmCents, min($winner['base'], $clearing)));

        return new AdDecision($winner['c'], $price, $winner['base'], $winner['pCtr'], $winner['quality']);
    }

    /** Expected revenue per 1000 impressions at the candidate's bid. */
    private function baseEcpm(AdCandidate $c, float $pCtr): float
    {
        return match ($c->bidType) {
            'cpc'   => $c->bidCents * $pCtr * 1000.0,
            'cpv'   => $c->bidCents * min(1.0, $pCtr * 10) * 1000.0,
            default => (float) $c->bidCents, // cpm — already per mille
        };
    }
}
