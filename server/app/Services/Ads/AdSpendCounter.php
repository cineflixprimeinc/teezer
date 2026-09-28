<?php

namespace App\Services\Ads;

use Illuminate\Support\Facades\Redis;

/**
 * Buffers ad spend in Redis (in milli-cents, so per-impression fractions of a cent
 * accumulate without loss) between settlement runs. Two counters per campaign:
 *  - unsettled total (drained into the ledger by AdBillingService::settle)
 *  - today's total (not drained; drives daily-budget pacing; expires)
 * An impression costs priceCents/1000 cents = priceCents milli-cents.
 */
class AdSpendCounter
{
    public function addImpression(int $campaignId, int $priceCents): void
    {
        if ($priceCents <= 0) {
            return;
        }

        $r = Redis::connection('default');
        $r->incrby("ads:spend:mc:campaign:{$campaignId}", $priceCents);

        $dayKey = "ads:spend:mc:campaign:{$campaignId}:day:" . now()->toDateString();
        if ((int) $r->incrby($dayKey, $priceCents) <= $priceCents) {
            $r->expire($dayKey, 172800); // 2 days
        }

        $r->sadd('ads:spend:campaigns', $campaignId);
    }

    public function dailySpentCents(int $campaignId): int
    {
        $mc = (int) Redis::connection('default')->get("ads:spend:mc:campaign:{$campaignId}:day:" . now()->toDateString());

        return intdiv($mc, 1000);
    }
}
