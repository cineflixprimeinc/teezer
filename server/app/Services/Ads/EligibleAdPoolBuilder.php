<?php

namespace App\Services\Ads;

use App\Models\AdCampaign;
use App\Models\AdStatDaily;
use Illuminate\Support\Facades\Redis;

/**
 * Compiles currently-eligible ads (approved + active + in-schedule + budget-remaining)
 * into candidate objects, and precomputes them into Redis pools per placement so the
 * ad server decides from memory. Mirrors the feed's BuildFeedPools approach.
 */
class EligibleAdPoolBuilder
{
    private const PLACEMENTS = ['in_feed', 'profile_top', 'hashtag', 'search', 'explore', 'inbox'];
    private const POOL_TTL   = 900; // 15 min — cron refreshes every 5

    public function __construct(private AdSpendCounter $spend) {}

    /** @return AdCandidate[] */
    public function eligibleCandidates(): array
    {
        $now = now();

        $campaigns = AdCampaign::query()
            ->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('start_at')->orWhere('start_at', '<=', $now))
            ->where(fn ($q) => $q->whereNull('end_at')->orWhere('end_at', '>=', $now))
            ->with([
                'account:id,balance_cents',
                'groups' => fn ($q) => $q->where('status', 'active')
                    ->with(['creatives' => fn ($q2) => $q2->where('review_status', 'approved')]),
            ])
            ->get();

        // Recent per-creative stats (7d) so pCTR reflects real delivery.
        $stats = AdStatDaily::where('stat_date', '>=', $now->copy()->subDays(7)->toDateString())
            ->selectRaw('creative_id, sum(impressions) as impressions, sum(clicks) as clicks')
            ->groupBy('creative_id')
            ->get()
            ->keyBy('creative_id');

        $out = [];
        foreach ($campaigns as $camp) {
            // Budget & funding guards: lifetime budget, today's budget, and a funded account.
            if ($camp->total_budget_cents > 0 && $camp->spent_cents >= $camp->total_budget_cents) {
                continue;
            }
            if ($camp->daily_budget_cents > 0 && $this->spend->dailySpentCents($camp->id) >= $camp->daily_budget_cents) {
                continue;
            }
            if (($camp->account?->balance_cents ?? 0) <= 0) {
                continue;
            }

            foreach ($camp->groups as $group) {
                $placements = $group->placements ?: ['in_feed'];

                foreach ($group->creatives as $cr) {
                    $st = $stats->get($cr->id);

                    $out[] = new AdCandidate(
                        campaignId: $camp->id,
                        adGroupId:  $group->id,
                        creativeId: $cr->id,
                        bidCents:   max(1, (int) ($group->bid_cents ?: 100)),
                        bidType:    $group->bid_type ?: 'cpm',
                        targeting:  $group->targeting ?: [],
                        placements: $placements,
                        videoId:    $cr->video_id,
                        stats:      ['impressions' => (int) ($st->impressions ?? 0), 'clicks' => (int) ($st->clicks ?? 0)],
                        meta:       [
                            'headline'        => $cr->headline,
                            'body'            => $cr->body,
                            'cta_type'        => $cr->cta_type,
                            'destination_url' => $cr->destination_url,
                            'display_name'    => $cr->display_name,
                            'video_id'        => $cr->video_id,
                            'thumbnail_url'   => $cr->thumbnail_url,
                            'media_url'       => $cr->media_url,
                            'type'            => $cr->type,
                        ],
                    );
                }
            }
        }

        return $out;
    }

    /** Rebuild the Redis pools. Returns the eligible-candidate count. */
    public function build(): int
    {
        $candidates = $this->eligibleCandidates();

        $byPlacement = [];
        foreach ($candidates as $c) {
            foreach ($c->placements as $pl) {
                $byPlacement[$pl][] = $c->toArray();
            }
        }

        $r = Redis::connection('default');
        foreach (self::PLACEMENTS as $pl) {
            $key = "ads:pool:{$pl}";
            if (! empty($byPlacement[$pl])) {
                $r->set($key, json_encode($byPlacement[$pl]));
                $r->expire($key, self::POOL_TTL);
            } else {
                $r->del($key);
            }
        }

        return count($candidates);
    }
}
