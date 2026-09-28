<?php

namespace App\Services\Ads;

use App\Models\AdAccount;
use App\Models\AdCampaign;
use App\Models\AdCreative;
use App\Models\AdLedgerEntry;
use App\Models\Video;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * The money layer. Charges are settled from the buffered Redis spend into an
 * append-only double-entry ledger (never from the Redis counters directly, which
 * are transient). Every mutation is row-locked + transactional. Budget/balance
 * exhaustion auto-pauses the campaign; boosted-video campaigns share revenue with
 * the creator.
 */
class AdBillingService
{
    /** Credit an ad account (top-up / refund / adjustment). Returns the new balance in cents. */
    public function credit(AdAccount $account, int $cents, string $type = 'topup', ?string $ref = null, ?string $description = null): int
    {
        return DB::transaction(function () use ($account, $cents, $type, $ref, $description) {
            $acc        = AdAccount::whereKey($account->id)->lockForUpdate()->firstOrFail();
            $newBalance = $acc->balance_cents + $cents;
            $acc->update(['balance_cents' => $newBalance]);

            AdLedgerEntry::create([
                'ad_account_id'       => $acc->id,
                'entry_type'          => $type,
                'amount_cents'        => $cents,
                'balance_after_cents' => $newBalance,
                'currency'            => $acc->currency,
                'ref'                 => $ref,
                'description'         => $description ?? ucfirst($type),
            ]);

            return $newBalance;
        });
    }

    /** Drain buffered spend into charges. Returns the number of campaigns settled. */
    public function settle(): int
    {
        $r     = Redis::connection('default');
        $ids   = $r->smembers('ads:spend:campaigns') ?: [];
        $count = 0;

        foreach ($ids as $cid) {
            $cid = (int) $cid;
            $key = "ads:spend:mc:campaign:{$cid}";
            $mc  = (int) $r->get($key);
            $cents = intdiv($mc, 1000);

            if ($cents < 1) {
                if ($mc <= 0) {
                    $r->srem('ads:spend:campaigns', $cid);
                }
                continue;
            }

            $r->decrby($key, $cents * 1000); // keep the sub-cent remainder
            $this->chargeCampaign($cid, $cents);
            $count++;
        }

        return $count;
    }

    private function chargeCampaign(int $campaignId, int $cents): void
    {
        DB::transaction(function () use ($campaignId, $cents) {
            $campaign = AdCampaign::whereKey($campaignId)->lockForUpdate()->first();
            if (! $campaign) {
                return;
            }
            $account = AdAccount::whereKey($campaign->ad_account_id)->lockForUpdate()->first();
            if (! $account) {
                return;
            }

            // Never overdraw: charge at most the remaining balance.
            $charge = max(0, min($cents, max(0, $account->balance_cents)));

            if ($charge > 0) {
                $newBalance = $account->balance_cents - $charge;
                $account->update([
                    'balance_cents'        => $newBalance,
                    'lifetime_spent_cents' => $account->lifetime_spent_cents + $charge,
                ]);
                $campaign->increment('spent_cents', $charge);

                AdLedgerEntry::create([
                    'ad_account_id'       => $account->id,
                    'entry_type'          => 'charge',
                    'amount_cents'        => -$charge,
                    'balance_after_cents' => $newBalance,
                    'currency'            => $account->currency,
                    'campaign_id'         => $campaign->id,
                    'description'         => 'Ad delivery charge',
                ]);

                DB::table('ad_stats_daily')->upsert(
                    [[
                        'stat_date'     => now()->toDateString(),
                        'ad_account_id' => $account->id,
                        'campaign_id'   => $campaign->id,
                        'ad_group_id'   => 0,
                        'creative_id'   => 0,
                        'placement'     => '',
                        'country'       => '',
                        'spend_cents'   => $charge,
                        'created_at'    => now(),
                        'updated_at'    => now(),
                    ]],
                    ['stat_date', 'campaign_id', 'ad_group_id', 'creative_id', 'placement', 'country'],
                    ['spend_cents' => DB::raw("ad_stats_daily.spend_cents + {$charge}"), 'updated_at' => now()],
                );

                $this->creditCreator($campaign, $charge);
            }

            // Auto-pause on exhausted lifetime budget or drained balance.
            $campaign->refresh();
            $account->refresh();
            $budgetOut = $campaign->total_budget_cents > 0 && $campaign->spent_cents >= $campaign->total_budget_cents;
            if (($budgetOut || $account->balance_cents <= 0) && $campaign->status === 'active') {
                $campaign->update(['status' => 'paused']);
            }
        });
    }

    /** Boosted-video campaigns share ad revenue with the video's creator. Best-effort. */
    private function creditCreator(AdCampaign $campaign, int $chargeCents): void
    {
        try {
            $creative = AdCreative::whereHas('group', fn ($q) => $q->where('campaign_id', $campaign->id))
                ->whereNotNull('video_id')
                ->first();
            if (! $creative || ! $creative->video_id) {
                return;
            }

            $video = Video::find($creative->video_id);
            if (! $video) {
                return;
            }

            $pct        = (int) config('ads.revenue_share_pct', 50);
            $shareCents = intdiv($chargeCents * $pct, 100);
            if ($shareCents < 1) {
                return;
            }
            $shareUsd = round($shareCents / 100, 2);

            $wallet = Wallet::firstOrCreate(['user_id' => $video->user_id]);
            $wallet->increment('ad_earnings', $shareUsd);

            $txn = new WalletTransaction([
                'wallet_id'    => $wallet->id,
                'type'         => 'ad_income',
                'amount'       => $shareUsd,
                'description'  => "Ad revenue · campaign #{$campaign->id}",
                'reference_id' => "ad_campaign:{$campaign->id}",
                'status'       => 'completed',
            ]);
            $txn->created_at = now();
            $txn->save();
        } catch (\Throwable $e) {
            report($e); // creator payout must never break the advertiser charge
        }
    }
}
