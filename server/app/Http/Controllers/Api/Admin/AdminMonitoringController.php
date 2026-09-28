<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use App\Services\QueueDepthService;
use App\Services\RequestMetricsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Redis;

/**
 * Read-only platform monitoring for the admin panel (System → Monitoring).
 *
 * Every metric is gathered defensively: a failing/unavailable source returns a
 * null/`available:false` shape instead of throwing, so one broken dependency
 * (e.g. pg_stat_statements not installed, Redis down) never takes a page down.
 * All routes sit inside the `api.admin` group, so Sanctum + admin role + 2FA are
 * already enforced.
 */
class AdminMonitoringController extends Controller
{
    /** GET /admin/monitoring/overview - headline health + metrics for the dashboard. */
    public function overview(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => [
            'app'       => $this->appInfo(),
            'db'        => $this->dbPing(),
            'redis'     => $this->redisSummary(),
            'queue'     => $this->queueSummary(),
            'realtime'  => $this->realtimeSummary(),
            'system'    => $this->systemInfo(),
            'generated_at' => now()->toIso8601String(),
        ]]);
    }

    /** GET /admin/monitoring/redis - Redis INFO + keyspace. */
    public function redis(): JsonResponse
    {
        $out = ['ok' => false, 'info' => null, 'db0_keys' => null, 'cache_keys' => null];
        try {
            $info = Redis::connection('default')->info();
            $hits = (int) ($info['keyspace_hits'] ?? 0);
            $miss = (int) ($info['keyspace_misses'] ?? 0);
            $out['ok'] = true;
            $out['info'] = [
                'version'                 => $info['redis_version'] ?? null,
                'uptime_days'             => isset($info['uptime_in_seconds']) ? round($info['uptime_in_seconds'] / 86400, 1) : null,
                'used_memory_human'       => $info['used_memory_human'] ?? null,
                'used_memory_peak_human'  => $info['used_memory_peak_human'] ?? null,
                'maxmemory_human'         => $info['maxmemory_human'] ?? null,
                'connected_clients'       => (int) ($info['connected_clients'] ?? 0),
                'total_commands_processed'=> (int) ($info['total_commands_processed'] ?? 0),
                'ops_per_sec'             => (int) ($info['instantaneous_ops_per_sec'] ?? 0),
                'keyspace_hits'           => $hits,
                'keyspace_misses'         => $miss,
                'hit_rate_pct'            => ($hits + $miss) > 0 ? round($hits / ($hits + $miss) * 100, 1) : null,
                'evicted_keys'            => (int) ($info['evicted_keys'] ?? 0),
                'rejected_connections'    => (int) ($info['rejected_connections'] ?? 0),
            ];
            $out['db0_keys']    = (int) Redis::connection('default')->dbSize();
            try { $out['cache_keys'] = (int) Redis::connection('cache')->dbSize(); } catch (\Throwable) { /* cache conn optional */ }
        } catch (\Throwable $e) {
            $out['error'] = 'Redis unreachable';
        }
        return response()->json(['success' => true, 'data' => $out]);
    }

    /** GET /admin/monitoring/database - Postgres connections, size, cache ratio, top tables, slow queries. */
    public function database(): JsonResponse
    {
        $data = [
            'ok' => false, 'driver' => config('database.default'), 'version' => null,
            'size_pretty' => null, 'connections' => null, 'cache_hit_pct' => null,
            'top_tables' => [], 'slow_queries' => ['available' => false, 'rows' => []],
        ];
        try {
            DB::select('SELECT 1');
            $data['ok'] = true;
            $data['version'] = (string) (DB::selectOne('SELECT version() AS v')->v ?? '');

            $size = DB::selectOne('SELECT pg_size_pretty(pg_database_size(current_database())) AS s');
            $data['size_pretty'] = $size->s ?? null;

            $conn = DB::selectOne("
                SELECT
                    count(*) FILTER (WHERE state IS NOT NULL) AS total,
                    count(*) FILTER (WHERE state = 'active') AS active,
                    count(*) FILTER (WHERE state = 'idle') AS idle
                FROM pg_stat_activity WHERE datname = current_database()
            ");
            $max = DB::selectOne("SELECT setting::int AS m FROM pg_settings WHERE name = 'max_connections'");
            $data['connections'] = [
                'total'  => (int) ($conn->total ?? 0),
                'active' => (int) ($conn->active ?? 0),
                'idle'   => (int) ($conn->idle ?? 0),
                'max'    => (int) ($max->m ?? 0),
            ];

            $ratio = DB::selectOne('SELECT sum(blks_hit) AS hit, sum(blks_read) AS rd FROM pg_stat_database');
            $hit = (float) ($ratio->hit ?? 0); $rd = (float) ($ratio->rd ?? 0);
            $data['cache_hit_pct'] = ($hit + $rd) > 0 ? round($hit / ($hit + $rd) * 100, 2) : null;

            $data['top_tables'] = collect(DB::select("
                SELECT relname AS name,
                       pg_size_pretty(pg_total_relation_size(relid)) AS size_pretty,
                       pg_total_relation_size(relid) AS bytes,
                       n_live_tup AS rows
                FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12
            "))->map(fn ($r) => (array) $r)->all();
        } catch (\Throwable $e) {
            $data['error'] = 'Database stats unavailable';
        }

        // Slow queries need the pg_stat_statements extension (server-level). Optional.
        try {
            $rows = DB::select('
                SELECT query, calls,
                       round(mean_exec_time::numeric, 2) AS mean_ms,
                       round(total_exec_time::numeric, 2) AS total_ms
                FROM pg_stat_statements
                ORDER BY mean_exec_time DESC LIMIT 12
            ');
            $data['slow_queries'] = ['available' => true, 'rows' => array_map(fn ($r) => (array) $r, $rows)];
        } catch (\Throwable $e) {
            $data['slow_queries'] = ['available' => false, 'rows' => [], 'note' => 'Enable the pg_stat_statements extension to see slow queries.'];
        }

        return response()->json(['success' => true, 'data' => $data]);
    }

    /** GET /admin/monitoring/queue - queue driver, pending/failed depth, breakdown. */
    public function queue(): JsonResponse
    {
        $driver = config('queue.default');
        $data = ['driver' => $driver, 'pending' => null, 'failed' => null, 'by_queue' => [], 'recent_failed' => []];

        if ($driver === 'sync') {
            $data['note'] = 'QUEUE_CONNECTION=sync - jobs run inline in the request, so there is no queue backlog. Switch to "database" or "redis" in production to engage background workers.';
        }
        // Driver-aware: the `jobs` table is only the backlog while the driver is
        // `database`, and reads as a permanent 0 under redis. See QueueDepthService.
        $depth = app(QueueDepthService::class);
        $data['pending']  = $depth->pending();
        $data['by_queue'] = $depth->byQueue();
        // failed_jobs stays in Postgres under every driver (queue.failed.driver).
        try { $data['failed'] = (int) DB::table('failed_jobs')->count(); } catch (\Throwable) {}
        try {
            $data['recent_failed'] = collect(DB::table('failed_jobs')->orderByDesc('id')->limit(10)->get())
                ->map(fn ($r) => [
                    'id'        => $r->id,
                    'queue'     => $r->queue ?? null,
                    'exception' => mb_substr((string) ($r->exception ?? ''), 0, 200),
                    'failed_at' => $r->failed_at ?? null,
                ])->all();
        } catch (\Throwable) {}

        return response()->json(['success' => true, 'data' => $data]);
    }

    /** GET /admin/monitoring/realtime - online users + chat-server (WebSocket) health. */
    public function realtime(): JsonResponse
    {
        $data = ['online_users' => $this->onlineUserCount(), 'chat_server' => $this->chatServerHealth()];
        $data['note'] = 'Online users are derived from chat-server presence keys (teezer:online:*). Per-socket counts require a stats endpoint on the chat-server.';
        return response()->json(['success' => true, 'data' => $data]);
    }

    /** GET /admin/monitoring/logs - tail the latest daily Laravel log (errors/warnings first). */
    public function logs(): JsonResponse
    {
        $out = ['file' => null, 'entries' => []];
        try {
            $dir = storage_path('logs');
            $files = collect(File::glob($dir . DIRECTORY_SEPARATOR . 'laravel*.log'))
                ->sortByDesc(fn ($f) => File::lastModified($f))->values();
            $file = $files->first();
            if ($file) {
                $out['file'] = basename($file);
                $lines = array_slice(preg_split('/\r?\n/', File::get($file)) ?: [], -400);
                foreach ($lines as $line) {
                    if (preg_match('/^\[(.*?)\].*?\.(EMERGENCY|ALERT|CRITICAL|ERROR|WARNING|NOTICE|INFO|DEBUG):\s?(.*)$/', $line, $m)) {
                        $out['entries'][] = ['ts' => $m[1], 'level' => $m[2], 'message' => mb_substr($m[3], 0, 300)];
                    }
                }
                // Newest first, cap to 120.
                $out['entries'] = array_slice(array_reverse($out['entries']), 0, 120);
            }
        } catch (\Throwable $e) {
            $out['error'] = 'Log file unavailable';
        }
        return response()->json(['success' => true, 'data' => $out]);
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private function appInfo(): array
    {
        return [
            'php_version'     => PHP_VERSION,
            'laravel_version' => app()->version(),
            'env'             => app()->environment(),
            'debug'           => (bool) config('app.debug'),
            'queue_driver'    => config('queue.default'),
            'cache_driver'    => config('cache.default'),
            'session_driver'  => config('session.driver'),
        ];
    }

    private function dbPing(): array
    {
        $start = microtime(true);
        try {
            DB::select('SELECT 1');
            return ['ok' => true, 'latency_ms' => round((microtime(true) - $start) * 1000, 1)];
        } catch (\Throwable $e) {
            return ['ok' => false, 'latency_ms' => null];
        }
    }

    private function redisSummary(): array
    {
        try {
            $info = Redis::connection('default')->info();
            return [
                'ok'                => true,
                'used_memory_human' => $info['used_memory_human'] ?? null,
                'connected_clients' => (int) ($info['connected_clients'] ?? 0),
                'db0_keys'          => (int) Redis::connection('default')->dbSize(),
            ];
        } catch (\Throwable $e) {
            return ['ok' => false];
        }
    }

    private function queueSummary(): array
    {
        $driver = config('queue.default');
        $pending = app(QueueDepthService::class)->pending();
        $failed = null;
        try { $failed = (int) DB::table('failed_jobs')->count(); } catch (\Throwable) {}
        return ['driver' => $driver, 'pending' => $pending, 'failed' => $failed];
    }

    private function realtimeSummary(): array
    {
        return ['online_users' => $this->onlineUserCount(), 'chat_server' => $this->chatServerHealth()];
    }

    private function systemInfo(): array
    {
        $sessions = null;
        try { $sessions = (int) DB::table('sessions')->count(); } catch (\Throwable) {}
        $free = @disk_free_space('/'); $total = @disk_total_space('/');
        return [
            'sessions'      => $sessions,
            'disk_free_gb'  => $free ? round($free / 1073741824, 1) : null,
            'disk_total_gb' => $total ? round($total / 1073741824, 1) : null,
            'disk_used_pct' => ($free && $total) ? round(($total - $free) / $total * 100, 1) : null,
        ];
    }

    /** Count chat-server presence keys (teezer:online:*), bypassing Laravel's key prefix. */
    private function onlineUserCount(): ?int
    {
        try {
            $client = Redis::connection('default')->client();
            $prefix = '';
            try { $prefix = (string) $client->getOption(\Redis::OPT_PREFIX); } catch (\Throwable) {}
            if ($prefix !== '') $client->setOption(\Redis::OPT_PREFIX, '');
            try { $client->setOption(\Redis::OPT_SCAN, \Redis::SCAN_RETRY); } catch (\Throwable) {}

            $count = 0; $it = null;
            do {
                $keys = $client->scan($it, 'teezer:online:*', 2000);
                if ($keys !== false) $count += count($keys);
            } while ($it > 0);

            if ($prefix !== '') $client->setOption(\Redis::OPT_PREFIX, $prefix);
            return $count;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function chatServerHealth(): array
    {
        $url = rtrim((string) config('services.chat.url', ''), '/');
        if ($url === '') return ['ok' => null, 'latency_ms' => null, 'url' => null];
        $start = microtime(true);
        try {
            $res = Http::timeout(3)->get($url . '/health');
            return ['ok' => $res->successful(), 'latency_ms' => round((microtime(true) - $start) * 1000, 1), 'url' => $url];
        } catch (\Throwable $e) {
            return ['ok' => false, 'latency_ms' => null, 'url' => $url];
        }
    }

    /**
     * GET /admin/monitoring/metrics
     *
     * The numbers an operator needs to answer "is it healthy right now", in one
     * place: request latency percentiles, queue backlog, and how much of the
     * database connection budget is in use.
     *
     * Latency comes from RecordRequestMetrics' rolling sample rather than from
     * Postgres - pg_stat_statements knows how long QUERIES take, which is not
     * the same question. An endpoint slowed by an external call or a large
     * serialisation makes no slow query at all.
     *
     * Every section degrades independently: a section that cannot be read comes
     * back null rather than failing the whole response, because a monitoring
     * endpoint is least useful exactly when something is broken.
     */
    public function metrics(): JsonResponse
    {
        $depth = app(QueueDepthService::class);

        $api = null;
        try { $api = app(RequestMetricsService::class)->summary(); } catch (\Throwable) {}

        $db = null;
        try {
            $max  = (int) DB::selectOne("SELECT setting::int AS v FROM pg_settings WHERE name = 'max_connections'")->v;
            $used = (int) DB::selectOne('SELECT count(*) AS v FROM pg_stat_activity')->v;
            $idleTx = (int) DB::selectOne("SELECT count(*) AS v FROM pg_stat_activity WHERE state = 'idle in transaction'")->v;
            $longest = DB::selectOne("
                SELECT COALESCE(EXTRACT(EPOCH FROM max(now() - query_start)), 0) AS v
                FROM pg_stat_activity WHERE state = 'active' AND pid <> pg_backend_pid()
            ")->v;
            $db = [
                'connections_used'      => $used,
                'connections_max'       => $max,
                'connections_pct'       => $max > 0 ? round($used / $max * 100, 1) : null,
                'idle_in_transaction'   => $idleTx,
                'longest_active_query_s'=> round((float) $longest, 2),
            ];
        } catch (\Throwable) {}

        $failed = null;
        try { $failed = (int) DB::table('failed_jobs')->count(); } catch (\Throwable) {}

        return response()->json([
            'success' => true,
            'data'    => [
                'api'      => $api,
                'queue'    => [
                    'driver'   => config('queue.default'),
                    'pending'  => $depth->pending(),
                    'by_queue' => $depth->byQueue(),
                    'failed'   => $failed,
                ],
                'database' => $db,
                'at'       => now()->toIso8601String(),
            ],
        ]);
    }
}
