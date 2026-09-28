<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class BlockMaliciousRequests
{
    /** Known scanner / exploit-kit user-agent substrings (case-insensitive). */
    private const BAD_AGENTS = [
        'sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab',
        'python-requests', 'go-http-client/1', 'libwww-perl',
        'scrapy', 'mechanize', 'petalbot', 'ahrefsbot',
        'semrushbot', 'dotbot', 'blexbot', 'mj12bot',
    ];

    /** Path prefixes that should never exist on this app. */
    private const BAD_PATHS = [
        '/.env', '/.git', '/wp-admin', '/wp-login', '/phpmyadmin',
        '/adminer', '/phpinfo', '/xmlrpc', '/actuator', '/console',
        '/vendor/phpunit', '/.well-known/security',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $ua   = strtolower($request->userAgent() ?? '');
        $path = strtolower($request->getPathInfo());

        foreach (self::BAD_AGENTS as $bad) {
            if (str_contains($ua, $bad)) {
                return response()->json(['message' => 'Forbidden.'], 403);
            }
        }

        foreach (self::BAD_PATHS as $bad) {
            if (str_starts_with($path, $bad)) {
                return response()->json(['message' => 'Not found.'], 404);
            }
        }

        return $next($request);
    }
}
