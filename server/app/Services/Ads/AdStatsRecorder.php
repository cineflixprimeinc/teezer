<?php

namespace App\Services\Ads;

use App\Models\AdCampaign;
use Illuminate\Support\Facades\DB;

/**
 * Records ad delivery events into the ad_stats_daily rollup with an atomic Postgres
 * upsert (ON CONFLICT ... increment), so concurrent beacons can't race. Counts only
 * in P4 — spend/charging is layered on in P5 (budget + ledger).
 */
class AdStatsRecorder
{
    private const COLUMN = [
        'impression' => 'impressions',
        'click'      => 'clicks',
        'conversion' => 'conversions',
    ];

    /** @param array{campaign_id:int,ad_group_id:int,creative_id:int} $tok */
    public function record(string $type, array $tok, ?string $country = null, string $placement = ''): void
    {
        $col = self::COLUMN[$type] ?? null;
        if ($col === null) {
            return;
        }

        $accountId = (int) (AdCampaign::where('id', $tok['campaign_id'])->value('ad_account_id') ?? 0);
        $cc        = $country ? substr(strtoupper($country), 0, 2) : '';
        $now       = now();

        DB::table('ad_stats_daily')->upsert(
            [[
                'stat_date'     => $now->toDateString(),
                'ad_account_id' => $accountId,
                'campaign_id'   => $tok['campaign_id'],
                'ad_group_id'   => $tok['ad_group_id'],
                'creative_id'   => $tok['creative_id'],
                'placement'     => substr($placement, 0, 40),
                'country'       => $cc,
                $col            => 1,
                'created_at'    => $now,
                'updated_at'    => $now,
            ]],
            ['stat_date', 'campaign_id', 'ad_group_id', 'creative_id', 'placement', 'country'],
            [$col => DB::raw("ad_stats_daily.{$col} + 1"), 'updated_at' => $now],
        );
    }
}
