<?php

namespace App\Services\Analytics;

use App\Services\IsoCountries;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

/**
 * Laravel's hand-off point into the analytics pipeline.
 *
 * PHP does NOT write to ClickHouse. A request thread has no business holding an
 * INSERT open against an OLAP store, and one part per view would melt it. Instead
 * Laravel appends the event to a Redis stream and returns; the Go backend drains
 * that stream and batches it into ClickHouse (see backend-go/internal/clickhouse).
 *
 * Why a stream and not a plain list: XADD + a consumer group gives at-least-once
 * delivery with acks, so a Go restart mid-batch replays the un-acked entries
 * instead of dropping them. A RPOP-based list would lose whatever was in flight.
 *
 * This is best-effort by design. If Redis is down, `push` logs and returns - it
 * NEVER throws. A creator's like must not fail because the analytics pipeline is
 * unhappy; the worst acceptable outcome is a slightly wrong chart.
 */
class EventStream
{
    public const STREAM = 'analytics:events';

    /**
     * Cap the stream so a dead consumer cannot fill Redis and take the site with it.
     * ~1M entries is hours of headroom at any volume we can currently reach, and the
     * `~` makes the trim cheap (Redis prunes whole nodes rather than exact-counting).
     */
    private const MAX_LEN = 1_000_000;

    /**
     * Append one event. Never throws.
     *
     * The array is written through verbatim, so any key the Go consumer knows
     * about (see wireEvent in backend-go/internal/clickhouse/drain.go) can be
     * added by a caller without touching this method.
     *
     * One key is worth calling out: `event_id`. It is the idempotency key, and
     * callers should derive it from the source row's primary key rather than
     * generating a random value - a random id is unique per CALL, so a replayed
     * emit carries a different one and gets counted twice, which is precisely
     * what the key exists to prevent.
     *
     * @param  array<string, mixed>  $event
     */
    public static function push(array $event): void
    {
        try {
            $event['ts'] ??= now()->utc()->format('Y-m-d H:i:s.v');
            $event['delta'] ??= 1;

            $json = json_encode($event, JSON_UNESCAPED_UNICODE);

            // The 'analytics' connection has an EMPTY key prefix (see config/database.php).
            // The default connection prefixes everything with 'reelsoo_database_', which
            // the Go consumer - not being a Laravel app - knows nothing about. Using the
            // default here writes to a key Go never reads, and phpredis reports success
            // the whole time: a pipeline that looks healthy from both ends and moves
            // nothing at all.
            $client = Redis::connection('analytics')->client();

            // phpredis and predis take XADD completely differently, and getting it
            // wrong is SILENT: phpredis returns false for a bad call rather than
            // throwing, so a try/catch reports success while writing nothing at all.
            // That is how you ship a dead pipeline that looks healthy. Branch on the
            // actual client and check the result.
            if ($client instanceof \Redis || $client instanceof \RedisCluster) {
                // xAdd(key, id, fields[], maxlen, approx)
                $id = $client->xAdd(self::STREAM, '*', ['json' => $json], self::MAX_LEN, true);
            } else {
                // predis speaks the raw protocol: flat field/value pairs.
                $id = Redis::connection('analytics')->command('xadd', [
                    self::STREAM, 'MAXLEN', '~', self::MAX_LEN, '*', 'json', $json,
                ]);
            }

            if ($id === false || $id === null) {
                Log::warning('analytics: XADD returned no id - event dropped', [
                    'type' => $event['type'] ?? '?',
                ]);
            }
        } catch (\Throwable $e) {
            // Analytics must never break the request that produced it.
            Log::warning('analytics: failed to enqueue event', [
                'type'  => $event['type'] ?? '?',
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Normalize a country to an ISO-3166-1 alpha-2 code.
     *
     * video_views stores country INCONSISTENTLY: rows written before
     * VideoController::resolveViewerCountry started calling IsoCountries::nameFor()
     * hold the raw Cloudflare code ('NP'), and rows written after hold the full name
     * ('Nepal'). Same country, two spellings - which made Top Countries list Nepal
     * twice and split its own traffic in half.
     *
     * We do not rewrite Postgres (the old Studio dashboard renders those names), so
     * the canonicalisation happens here, on the way into ClickHouse. ClickHouse only
     * ever sees ISO-2, and the UI maps back to a name and a flag.
     */
    public static function isoCountry(?string $value): string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return '';
        }

        // Already a code.
        if (preg_match('/^[A-Za-z]{2}$/', $value)) {
            return strtoupper($value);
        }

        // A full name - reverse IsoCountries' code => name map.
        static $reverse = null;
        if ($reverse === null) {
            $reverse = [];
            foreach (IsoCountries::map() as $code => $name) {
                $reverse[mb_strtolower($name)] = $code;
            }
        }

        return $reverse[mb_strtolower($value)] ?? '';
    }

    /**
     * The owner of a video, cached - the ClickHouse rollups are keyed on creator_id,
     * so every single event needs it, and a per-event SELECT on a hot view path is
     * exactly the kind of cost that makes people rip analytics back out.
     */
    public static function creatorFor(int $videoId): int
    {
        static $memo = [];

        if (isset($memo[$videoId])) {
            return $memo[$videoId];
        }

        try {
            $id = (int) \Illuminate\Support\Facades\Cache::remember(
                "video:creator:{$videoId}",
                3600,
                fn () => (int) \Illuminate\Support\Facades\DB::table('videos')
                    ->where('id', $videoId)
                    ->value('user_id'),
            );
        } catch (\Throwable) {
            return 0;
        }

        return $memo[$videoId] = $id;
    }

    /**
     * Opaque, stable hash of an IP. ClickHouse retains events for 13 months; raw IPs
     * have no business living there that long.
     *
     * Must produce the SAME value as the Go writer's hashIP for the same IP, or a
     * viewer would be counted as two different clients depending on which service
     * happened to record the event.
     *
     * Both sides compute FNV-1a 64 and mask off the top 4 bits. The mask is not
     * cosmetic: PHP's int is signed 64-bit, so a full uint64 does not survive being
     * put in an int (and hand-rolling the multiply overflows silently into a float,
     * which is how you get a hash that is subtly wrong and never notice). Dropping
     * the leading nibble keeps the value inside PHP_INT_MAX and is exactly
     * `h & 0x0FFFFFFFFFFFFFFF` on the Go side.
     */
    public static function hashIp(?string $ip): int
    {
        if (! $ip) {
            return 0;
        }

        // 16 hex chars; dropping the first == clearing the top 4 bits.
        $hex = hash('fnv1a64', $ip);

        return (int) hexdec(substr($hex, 1));
    }
}
