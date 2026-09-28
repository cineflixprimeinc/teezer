<?php

namespace App\Http\Middleware;

use App\Services\RequestMetricsService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Times every API request so latency can be reported as percentiles.
 *
 * There was no application-level measurement at all: Postgres now logs slow
 * statements and keeps pg_stat_statements, but nothing knew how long a REQUEST
 * took, which is the number that decides whether the API is healthy. A slow
 * endpoint that makes no slow queries - an external call, a large
 * serialisation, a queue wait - was invisible.
 *
 * Deliberately cheap: one pipelined Redis write per request, no per-route
 * cardinality, no sampling logic to get wrong. Recording happens after the
 * response is produced so it never sits between the user and their answer, and
 * every failure is swallowed - metrics must never be able to break a request.
 */
class RecordRequestMetrics
{
    public function handle(Request $request, Closure $next): Response
    {
        // LARAVEL_START is defined by public/index.php, so this measures the
        // whole request including bootstrap, not just the part after the
        // middleware stack has already run.
        $startedAt = defined('LARAVEL_START') ? LARAVEL_START : microtime(true);

        $response = $next($request);

        try {
            app(RequestMetricsService::class)->record(
                (microtime(true) - $startedAt) * 1000,
                $response->getStatusCode(),
            );
        } catch (\Throwable) {
            // Never surface a metrics failure to a user.
        }

        return $response;
    }
}
