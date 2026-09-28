<?php

namespace App\Services\ClickHouse;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Thin ClickHouse client over the HTTP interface (port 8123).
 *
 * There is no native-protocol driver for PHP worth depending on, and the HTTP
 * interface is a first-class citizen in ClickHouse - so we speak it directly
 * rather than pull in a package. Requests go to 127.0.0.1 on VPS-1, which an
 * SSH tunnel (teezer-clickhouse-tunnel.service) forwards to ClickHouse's
 * loopback on VPS-2. Only port 22 is open between the boxes, so this is the
 * only way across; ClickHouse itself has no public socket.
 *
 * Everything here is READ-ONLY. Writes go through the Go backend's batching
 * writer - a PHP request thread has no business holding an INSERT open.
 *
 * Parameters are bound server-side via ClickHouse's {name:Type} syntax, NOT
 * string-interpolated. Studio takes a creator_id straight from the session and
 * date/metric filters straight from the query string; concatenating those into
 * SQL would be an injection hole.
 */
class ClickHouseClient
{
    public function __construct(
        private readonly string $url,
        private readonly string $username,
        private readonly string $password,
        private readonly string $database,
        private readonly int $timeout,
    ) {}

    /**
     * Run a SELECT and return rows as an array of associative arrays.
     *
     * @param  array<string, scalar>  $params  bound as {key:Type} in the SQL
     * @return array<int, array<string, mixed>>
     */
    public function select(string $sql, array $params = []): array
    {
        $query = [
            'database'                      => $this->database,
            'default_format'                => 'JSON',
            // Belt and braces: even though the app user only holds INSERT+SELECT,
            // pin the session read-only so a query with a stray mutation cannot run.
            'readonly'                      => 2,
            // A Studio dashboard query that takes longer than this is broken, not
            // slow. Fail it rather than let it pile up PHP-FPM workers.
            'max_execution_time'            => $this->timeout,
            // Analytics is not worth an OOM on the box that also transcodes video.
            'max_memory_usage'              => 2_000_000_000,
        ];

        foreach ($params as $key => $value) {
            $query["param_{$key}"] = $value;
        }

        $response = Http::withBasicAuth($this->username, $this->password)
            ->timeout($this->timeout + 2)
            ->withQueryParameters($query)
            ->withBody($sql, 'text/plain')
            ->post($this->url);

        if ($response->failed()) {
            // ClickHouse returns the reason in the body; the status alone is useless.
            Log::error('ClickHouse query failed', [
                'status' => $response->status(),
                'body'   => mb_substr($response->body(), 0, 500),
            ]);

            throw new RuntimeException('ClickHouse query failed: ' . mb_substr($response->body(), 0, 200));
        }

        return $response->json('data') ?? [];
    }

    /**
     * Run a SELECT expected to yield a single row. Returns [] when there is none,
     * which callers must treat as "no data yet" rather than as zero.
     *
     * @param  array<string, scalar>  $params
     * @return array<string, mixed>
     */
    public function selectOne(string $sql, array $params = []): array
    {
        return $this->select($sql, $params)[0] ?? [];
    }

    /**
     * Is ClickHouse actually reachable? Used to decide whether Studio can serve
     * analytics at all, so the page can render an honest error state instead of
     * a grid of zeroes that looks like "you have no views".
     */
    public function isAvailable(): bool
    {
        try {
            $this->select('SELECT 1');
            return true;
        } catch (\Throwable) {
            return false;
        }
    }
}
