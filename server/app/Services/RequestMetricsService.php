<?php

namespace App\Services;

use Illuminate\Support\Facades\Redis;

/**
 * Recent API latency and outcome counters, kept in Redis.
 *
 * A rolling sample rather than a time series: the last N request durations live
 * in a capped list, and percentiles are computed from them on read. That is
 * enough to answer "is the API slow right now", which is the question this
 * exists for, without standing up a metrics backend for an app whose whole
 * database is 34 MB.
 *
 * Why a capped list and not a histogram: percentiles from a histogram need
 * bucket boundaries chosen in advance, and choosing them wrongly is invisible
 * until you need the number. A sample of raw durations gives exact percentiles
 * over the window with no prior decisions.
 *
 * Everything here is best-effort and lossy by design. These numbers inform an
 * operator; they are never read back into application behaviour, so a Redis
 * outage costs a dashboard, not correctness.
 */
class RequestMetricsService
{
    /** Durations kept. ~5k requests is a meaningful window at any traffic this
     *  app sees, and 5k floats is a few hundred KB in Redis. */
    private const SAMPLE_SIZE = 5000;

    private const KEY_DURATIONS = 'metrics:req:durations';
    private const KEY_TOTAL     = 'metrics:req:total';
    private const KEY_4XX       = 'metrics:req:4xx';
    private const KEY_5XX       = 'metrics:req:5xx';
    private const KEY_SINCE     = 'metrics:req:since';

    /** One pipelined round trip per request. */
    public function record(float $durationMs, int $status): void
    {
        Redis::pipeline(function ($pipe) use ($durationMs, $status) {
            $pipe->lpush(self::KEY_DURATIONS, (string) round($durationMs, 2));
            $pipe->ltrim(self::KEY_DURATIONS, 0, self::SAMPLE_SIZE - 1);
            $pipe->incr(self::KEY_TOTAL);
            if ($status >= 500)      $pipe->incr(self::KEY_5XX);
            elseif ($status >= 400)  $pipe->incr(self::KEY_4XX);
            // Set once, so the counters can be reported as "since <time>"
            // rather than as meaningless unbounded totals.
            $pipe->setnx(self::KEY_SINCE, (string) time());
        });
    }

    /**
     * @return array{samples:int, p50:?float, p95:?float, p99:?float, max:?float,
     *               total:int, errors_4xx:int, errors_5xx:int, error_rate:float, since:?string}
     */
    public function summary(): array
    {
        $raw = Redis::lrange(self::KEY_DURATIONS, 0, -1) ?: [];
        $durations = array_map('floatval', $raw);
        sort($durations);

        $total = (int) (Redis::get(self::KEY_TOTAL) ?? 0);
        $e4    = (int) (Redis::get(self::KEY_4XX) ?? 0);
        $e5    = (int) (Redis::get(self::KEY_5XX) ?? 0);
        $since = Redis::get(self::KEY_SINCE);

        return [
            'samples'    => count($durations),
            'p50'        => $this->percentile($durations, 0.50),
            'p95'        => $this->percentile($durations, 0.95),
            'p99'        => $this->percentile($durations, 0.99),
            'max'        => $durations ? round(end($durations), 2) : null,
            'total'      => $total,
            'errors_4xx' => $e4,
            'errors_5xx' => $e5,
            'error_rate' => $total > 0 ? round(($e4 + $e5) / $total * 100, 2) : 0.0,
            'since'      => $since ? date(DATE_ATOM, (int) $since) : null,
        ];
    }

    /** Reset the counters and the sample - for after a deploy, so old numbers
     *  are not blended with new ones when judging whether a change helped. */
    public function reset(): void
    {
        Redis::del(self::KEY_DURATIONS, self::KEY_TOTAL, self::KEY_4XX, self::KEY_5XX, self::KEY_SINCE);
    }

    /** Nearest-rank on an already-sorted ascending array. */
    private function percentile(array $sorted, float $q): ?float
    {
        $n = count($sorted);
        if ($n === 0) {
            return null;
        }
        $rank = (int) ceil($q * $n) - 1;

        return round($sorted[max(0, min($n - 1, $rank))], 2);
    }
}
