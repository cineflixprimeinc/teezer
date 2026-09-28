<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * Rebuild the precomputed feed pools (Redis sorted sets). Scheduled every
 * 15 minutes - the ONLY place trending scores are computed; the request
 * path (FeedService::forYouPools) just reads these keys.
 *
 *   score = [(avg_watch_% × 5) + (likes/views × 200) +
 *            (comments/views × 300) + (shares/views × 400)] × freshness
 *   freshness = 1 / (1 + hours_since_upload / 24)
 *
 * Window: videos published in the last 72 h. Pools (top 500 each, 1 h TTL
 * so they self-expire if this command stops running and the feed falls
 * back to the V2 scorer):
 *
 *   trending:global            trending:country:{CC}
 *   trending:lang:{lang}       fresh:country:{CC}  (< 100 views, newest first)
 *
 * Each pool is built under a temp key and atomically RENAMEd in, so readers
 * never observe a half-built set.
 */
class BuildFeedPools extends Command
{
    protected $signature = 'feed:build-pools';

    protected $description = 'Recompute trending/fresh feed pools into Redis sorted sets';

    private const WINDOW_HOURS    = 72;
    private const POOL_SIZE       = 500;
    private const FRESH_MAX_VIEWS = 100;
    private const TTL_SECONDS     = 3600;

    public function handle(): int
    {
        $now = now();

        $rows = DB::table('videos')
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNull('deleted_at')
            ->where('created_at', '>=', $now->copy()->subHours(self::WINDOW_HOURS))
            ->get([
                'id', 'country_code', 'language', 'duration', 'created_at',
                'views_count', 'likes_count', 'comments_count', 'shares_count', 'average_watch_seconds',
            ]);

        $global = [];
        $byCountry = [];
        $byLang = [];
        $fresh = [];

        foreach ($rows as $v) {
            $views = max(1, (int) $v->views_count);
            $watchPct = $v->duration > 0
                ? min(100, ((int) $v->average_watch_seconds / (int) $v->duration) * 100)
                : 0;

            $engagement = ($watchPct * 5)
                + ($v->likes_count / $views * 200)
                + ($v->comments_count / $views * 300)
                + ($v->shares_count / $views * 400);

            $hours     = $now->diffInHours($v->created_at, true);
            $freshness = 1 / (1 + $hours / 24);
            $score     = round($engagement * $freshness, 4);

            $global[$v->id] = $score;
            if ($v->country_code) {
                $byCountry[strtoupper($v->country_code)][$v->id] = $score;
            }
            if ($v->language) {
                $byLang[strtolower($v->language)][$v->id] = $score;
            }
            if ($v->views_count < self::FRESH_MAX_VIEWS && $v->country_code) {
                // Fresh pool ranks by recency, not score.
                $fresh[strtoupper($v->country_code)][$v->id] = strtotime($v->created_at);
            }
        }

        $redis = Redis::connection('default');
        $pools = 0;

        $write = function (string $key, array $members) use ($redis, &$pools) {
            $tmp = "{$key}:building";
            $redis->del($tmp);
            if ($members) {
                arsort($members);
                $args = [];
                foreach (array_slice($members, 0, self::POOL_SIZE, true) as $id => $score) {
                    $args[] = $score;
                    $args[] = $id;
                }
                $redis->zadd($tmp, ...$args);
                $redis->expire($tmp, self::TTL_SECONDS); // TTL survives RENAME
                $redis->rename($tmp, $key);
            } else {
                $redis->del($key);
            }
            $pools++;
        };

        $write('trending:global', $global);
        foreach ($byCountry as $cc => $members) {
            $write("trending:country:{$cc}", $members);
        }
        foreach ($byLang as $lang => $members) {
            $write("trending:lang:{$lang}", $members);
        }
        foreach ($fresh as $cc => $members) {
            $write("fresh:country:{$cc}", $members);
        }

        // Serve-side existence probe + monitoring timestamp.
        $redis->setex('feed:pools:built_at', self::TTL_SECONDS, $now->toIso8601String());

        $this->info("Feed pools rebuilt: {$rows->count()} candidate videos → {$pools} pools.");

        return self::SUCCESS;
    }
}
