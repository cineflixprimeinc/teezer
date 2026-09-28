<?php

namespace App\Services\Ads;

use Illuminate\Support\Facades\Redis;

/**
 * Per-viewer frequency capping via Redis counters (cross-box, atomic). Caps a
 * campaign per session and per day. Anonymous, session-less viewers are never
 * capped (nothing stable to key on).
 */
class FrequencyCap
{
    public function __construct(private int $perSession = 3, private int $perDay = 8) {}

    public function allows(AdContext $ctx, int $campaignId): bool
    {
        $id = $this->identity($ctx);
        if ($id === null) {
            return true;
        }

        if ((int) $this->redis()->get("ads:fc:d:{$id}:{$campaignId}") >= $this->perDay) {
            return false;
        }
        if ($ctx->sessionId && (int) $this->redis()->get("ads:fc:s:{$ctx->sessionId}:{$campaignId}") >= $this->perSession) {
            return false;
        }

        return true;
    }

    public function record(AdContext $ctx, int $campaignId): void
    {
        $id = $this->identity($ctx);
        if ($id === null) {
            return;
        }

        $r  = $this->redis();
        $dk = "ads:fc:d:{$id}:{$campaignId}";
        if ((int) $r->incr($dk) === 1) {
            $r->expire($dk, 86400);
        }

        if ($ctx->sessionId) {
            $sk = "ads:fc:s:{$ctx->sessionId}:{$campaignId}";
            if ((int) $r->incr($sk) === 1) {
                $r->expire($sk, 3600);
            }
        }
    }

    private function identity(AdContext $ctx): ?string
    {
        return $ctx->userId ? "u{$ctx->userId}" : ($ctx->sessionId ? "s{$ctx->sessionId}" : null);
    }

    private function redis()
    {
        return Redis::connection('default');
    }
}
