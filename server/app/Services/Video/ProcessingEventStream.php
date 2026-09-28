<?php

namespace App\Services\Video;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

/**
 * The video-processing pipeline's own hand-off into ClickHouse - same
 * mechanism as App\Services\Analytics\EventStream, a SEPARATE stream because
 * this is a genuinely different event shape (provider/attempt/duration_ms,
 * not watch_seconds/completion_pct/country). See that class's own doc
 * comment for why PHP never writes to ClickHouse directly, and
 * deploy/clickhouse/schema/03-video-processing-events.sql /
 * backend-go/internal/clickhouse/processing_*.go for the table and the Go
 * side of this same stream.
 *
 * Best-effort by design, exactly like EventStream::push - analytics must
 * never break the transcoding pipeline itself. If Redis is down, this logs
 * and returns; it never throws.
 */
class ProcessingEventStream
{
    public const STREAM = 'video_processing:events';

    private const MAX_LEN = 200_000;

    /**
     * @param  array{type: string, video_id: int, user_id?: int, provider?: string, attempt?: int, duration_ms?: int, error_code?: string, payload?: string}  $event
     */
    public static function push(array $event): void
    {
        try {
            $event['ts'] ??= now()->utc()->format('Y-m-d H:i:s.v');

            $json = json_encode($event, JSON_UNESCAPED_UNICODE);

            // Same 'analytics' connection EventStream uses - it has the
            // EMPTY key prefix the Go consumer (not a Laravel app, knows
            // nothing about Laravel's default 'reelsoo_database_' prefix)
            // needs to actually find the stream.
            $client = Redis::connection('analytics')->client();

            if ($client instanceof \Redis || $client instanceof \RedisCluster) {
                $id = $client->xAdd(self::STREAM, '*', ['json' => $json], self::MAX_LEN, true);
            } else {
                $id = Redis::connection('analytics')->command('xadd', [
                    self::STREAM, 'MAXLEN', '~', self::MAX_LEN, '*', 'json', $json,
                ]);
            }

            if ($id === false || $id === null) {
                Log::warning('video_processing_events: XADD returned no id - event dropped', [
                    'type' => $event['type'] ?? '?',
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('video_processing_events: failed to enqueue event', [
                'type' => $event['type'] ?? '?',
                'error' => $e->getMessage(),
            ]);
        }
    }
}
