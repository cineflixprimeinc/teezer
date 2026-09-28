<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * How many jobs are waiting, whichever driver is actually configured.
 *
 * Every admin monitoring surface counted `DB::table('jobs')` directly, which is
 * only the truth while QUEUE_CONNECTION is `database`. Under the redis driver
 * that table stays permanently empty, so the panel would have reported a depth
 * of 0 and a status of "operational" no matter how far behind the workers were
 * - a monitor that cannot fail is worse than no monitor.
 *
 * Reads the driver at call time rather than being wired to one, so the same
 * code is correct before, during and after a driver change.
 *
 * Redis layout, for reference: Laravel keeps `queues:{name}` as the ready list,
 * plus `queues:{name}:delayed` and `queues:{name}:reserved` sorted sets for
 * jobs waiting on a delay and jobs currently being worked. All three count as
 * "not finished yet", which is what a backlog number means to whoever is
 * reading the dashboard.
 */
class QueueDepthService
{
    /**
     * Queue names to report on under Redis.
     *
     * Redis has no way to enumerate the queues that exist - a queue is just a
     * key, and an empty one leaves no trace - so unlike the database driver
     * (where GROUP BY finds whatever is there) the names have to be known.
     * These are the queues the workers in deploy/pm2/ecosystem.worker.config.js
     * are actually started on; a queue missing from this list still runs, it
     * simply is not counted.
     */
    private const KNOWN_QUEUES = [
        'default', 'notifications', 'post-notifications',
        'transcoding', 'transcoding-backfill', 'media-mirror',
        'video-transfer', 'moderation', 'spaces',
    ];

    /** Total jobs waiting or in flight. Null when the backend cannot be read. */
    public function pending(): ?int
    {
        try {
            if (config('queue.default') === 'redis') {
                return array_sum(array_column($this->byQueue(), 'count'));
            }

            return (int) DB::table('jobs')->count();
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Per-queue breakdown, as [['queue' => string, 'count' => int], ...].
     * Empty queues are omitted so the shape matches what the database driver's
     * GROUP BY has always returned.
     *
     * @return array<int, array{queue: string, count: int}>
     */
    public function byQueue(): array
    {
        try {
            if (config('queue.default') !== 'redis') {
                return collect(
                    DB::table('jobs')->select('queue', DB::raw('count(*) as count'))->groupBy('queue')->get()
                )->map(fn ($r) => ['queue' => (string) $r->queue, 'count' => (int) $r->count])->all();
            }

            $out = [];
            foreach (self::KNOWN_QUEUES as $queue) {
                $count = (int) Redis::llen("queues:{$queue}")
                    + (int) Redis::zcard("queues:{$queue}:delayed")
                    + (int) Redis::zcard("queues:{$queue}:reserved");

                if ($count > 0) {
                    $out[] = ['queue' => $queue, 'count' => $count];
                }
            }

            return $out;
        } catch (\Throwable) {
            return [];
        }
    }
}
