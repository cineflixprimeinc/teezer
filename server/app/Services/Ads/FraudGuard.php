<?php

namespace App\Services\Ads;

use App\Models\AdCampaign;
use App\Models\AdFraudEvent;
use Illuminate\Support\Facades\Redis;

/**
 * Invalid-traffic / click-fraud guard for the ad-events beacon. Runs on the hot
 * path but stays cheap: Redis velocity counters + a couple of DB-cached heuristics.
 * A blocked event is recorded to ad_fraud_events and never billed; a flagged event
 * bills as normal but is logged for admin review. Signals combine additively into a
 * 0–100 score compared against config thresholds.
 */
class FraudGuard
{
    /**
     * @param array{campaign_id:int,ad_group_id:int,creative_id:int,user_id:int,price_cents:int} $tok
     * @param array{user_id:?int,session_id:?string,ip:?string,device_fp:?string,placement:string,token_hash:string} $ctx
     */
    public function assess(string $eventType, array $tok, array $ctx): FraudVerdict
    {
        if (! config('ads.fraud.enabled', true)) {
            return FraudVerdict::allow();
        }

        $score   = 0;
        $reasons = [];
        $id      = $this->identity($ctx);

        // 1) Self-interaction: the viewer owns the campaign (advertiser clicking own ad).
        if ($ctx['user_id'] && $this->campaignOwner($tok['campaign_id']) === (int) $ctx['user_id']) {
            $score = 100;
            $reasons[] = 'self_interaction';
        }

        // 2) Velocity: too many events of this type from one identity in a short window.
        if ($id !== null) {
            if ($this->hit("ads:fr:v:{$eventType}:{$id}", 60) > $this->velocityCap($eventType)) {
                $score = max($score, 80);
                $reasons[] = 'velocity';
            }
            if ($eventType === 'click'
                && $this->hit("ads:fr:vc:{$id}:{$tok['campaign_id']}", 300) > (int) config('ads.fraud.click_per_campaign_5m', 8)) {
                $score = max($score, 80);
                $reasons[] = 'click_velocity';
            }
        }

        // 3) A click whose impression was never recorded (fabricated/decoupled click).
        if ($eventType === 'click'
            && ! Redis::connection('default')->exists('ads:ev:impression:' . $ctx['token_hash'])) {
            $score = max($score, 50);
            $reasons[] = 'click_without_impression';
        }

        // 4) Anonymous, device-less click — weak bot signal, additive only.
        if ($eventType === 'click' && empty($ctx['device_fp']) && empty($ctx['user_id'])) {
            $score += 20;
            $reasons[] = 'no_device';
        }

        $score  = min(100, $score);
        $action = self::actionFor(
            $score,
            (int) config('ads.fraud.block_score', 70),
            (int) config('ads.fraud.flag_score', 40),
        );

        return new FraudVerdict(
            allowed: $action !== 'block',
            score:   $score,
            action:  $action,
            reason:  $reasons ? implode(',', $reasons) : null,
        );
    }

    /** Persist a flagged/blocked event for admin review. */
    public function record(string $eventType, array $tok, array $ctx, FraudVerdict $verdict): void
    {
        AdFraudEvent::create([
            'kind'                  => $eventType . ':' . ($verdict->reason ?? 'suspicious'),
            'ad_account_id'         => $this->campaignAccount($tok['campaign_id']),
            'campaign_id'           => $tok['campaign_id'],
            'creative_id'           => $tok['creative_id'],
            'user_id'               => $ctx['user_id'] ?: null,
            'ip_hash'               => ! empty($ctx['ip']) ? $this->hashIp($ctx['ip']) : null,
            'device_fp'             => ! empty($ctx['device_fp']) ? substr((string) $ctx['device_fp'], 0, 64) : null,
            'score'                 => $verdict->score,
            'action'                => $verdict->action === 'block' ? 'blocked' : 'flagged',
            'amount_refunded_cents' => 0,
            'details'               => [
                'reason'    => $verdict->reason,
                'event'     => $eventType,
                'placement' => $ctx['placement'] ?? null,
            ],
        ]);
    }

    /** Pure threshold decision — extracted for deterministic testing. */
    public static function actionFor(int $score, int $blockScore, int $flagScore): string
    {
        if ($score >= $blockScore) {
            return 'block';
        }
        if ($score >= $flagScore) {
            return 'flag';
        }

        return 'allow';
    }

    private function identity(array $ctx): ?string
    {
        if (! empty($ctx['user_id'])) {
            return 'u' . $ctx['user_id'];
        }
        if (! empty($ctx['device_fp'])) {
            return 'd' . substr(sha1((string) $ctx['device_fp']), 0, 16);
        }
        if (! empty($ctx['session_id'])) {
            return 's' . $ctx['session_id'];
        }
        if (! empty($ctx['ip'])) {
            return 'i' . substr($this->hashIp($ctx['ip']), 0, 16);
        }

        return null;
    }

    /** INCR a rolling counter; set its TTL only on first hit. Returns the running count. */
    private function hit(string $key, int $ttl): int
    {
        $r = Redis::connection('default');
        $n = (int) $r->incr($key);
        if ($n === 1) {
            $r->expire($key, $ttl);
        }

        return $n;
    }

    private function velocityCap(string $eventType): int
    {
        return match ($eventType) {
            'impression' => (int) config('ads.fraud.impression_per_min', 40),
            'click'      => (int) config('ads.fraud.click_per_min', 12),
            'conversion' => (int) config('ads.fraud.conversion_per_min', 6),
            default      => 60,
        };
    }

    private function campaignOwner(int $campaignId): ?int
    {
        return $this->campaignMeta($campaignId)['owner'];
    }

    private function campaignAccount(int $campaignId): ?int
    {
        return $this->campaignMeta($campaignId)['account'];
    }

    /**
     * Campaign owner + account id, cached in Redis to keep the beacon off the DB.
     *
     * @return array{owner:?int,account:?int}
     */
    private function campaignMeta(int $campaignId): array
    {
        $r   = Redis::connection('default');
        $key = "ads:camp:meta:{$campaignId}";

        $cached = $r->get($key);
        if ($cached) {
            $decoded = json_decode($cached, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        $camp = AdCampaign::with('account:id,user_id')->find($campaignId);
        $meta = [
            'owner'   => $camp?->account?->user_id,
            'account' => $camp?->ad_account_id,
        ];
        $r->set($key, json_encode($meta), 'EX', 3600);

        return $meta;
    }

    private function hashIp(string $ip): string
    {
        return hash_hmac('sha256', $ip, (string) config('app.key'));
    }
}
