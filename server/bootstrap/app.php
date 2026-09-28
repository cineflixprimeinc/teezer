<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Trust Cloudflare as the only proxy so $request->ip() returns the real visitor IP
        $middleware->trustProxies(
            at: '*',
            headers: Request::HEADER_X_FORWARDED_FOR
                   | Request::HEADER_X_FORWARDED_HOST
                   | Request::HEADER_X_FORWARDED_PROTO
                   | Request::HEADER_X_FORWARDED_PORT,
        );

        // An SDP is not free text: RFC 4566 says every line ends CRLF, including
        // the last one. TrimStrings eats that trailing "\r\n" and the Cloudflare
        // SFU then rejects the offer with a flat HTTP 400 - which looks like a
        // credentials or SDP-generation problem and is neither. Verified: the
        // same offer is accepted at 1624 bytes and refused at 1622.
        $middleware->trimStrings(except: ['sdp']);

        $middleware->alias([
            'role'              => \App\Http\Middleware\RoleMiddleware::class,
            'optional.sanctum'  => \App\Http\Middleware\OptionalSanctumAuth::class,
            'not.banned'        => \App\Http\Middleware\EnsureNotBanned::class,
            'api.admin'         => \App\Http\Middleware\ApiAdminMiddleware::class,
            'permission'        => \App\Http\Middleware\EnsurePermission::class,
            'licensed'          => \App\Http\Middleware\EnsureLicensed::class,
            // Read-only demo admins. Stacks INSIDE api.admin, so it only ever
            // sees requests that are already authenticated admins.
            'demo.readonly'     => \App\Http\Middleware\BlockDemoWrites::class,
            // Per-route, never global: an assertion costs a Secure Enclave
            // signature and a round trip, which is worth it on a withdrawal and
            // absurd on a feed page. Inert unless appattest.enabled, and
            // observe-only unless appattest.enforce.
            'app.attest'        => \App\Http\Middleware\VerifyAppAttest::class,
        ]);

        // Global API middleware stack
        //
        // Must run before anything that resolves $request->user() (Sanctum's
        // own guard, TrackUserActivity below, etc.) - it only copies the admin
        // session cookie into the Authorization header when no header is
        // already present, so Sanctum's unchanged resolution then finds it
        // there. See AdminSessionCookieAuth's own docblock.
        $middleware->prependToGroup('api', \App\Http\Middleware\AdminSessionCookieAuth::class);
        $middleware->appendToGroup('api', \App\Http\Middleware\BlockMaliciousRequests::class);

        // Licence gate for customer installations. COMPLETELY INERT here:
        // licensing.client.enabled is false on teezer.live, so EnsureLicensed
        // returns $next() on its first line and production can never be blocked
        // by its own licence check. It is appended globally rather than left as
        // an opt-in alias so that a customer package is actually enforced
        // without the customer having to edit any code - which they could
        // simply decline to do.
        //
        // Appended BEFORE the metrics/activity middleware so a refused request
        // is not counted as normal traffic.
        $middleware->appendToGroup('api', \App\Http\Middleware\EnsureLicensed::class);

        // Demo accounts cannot publish anything on the public site. Appended
        // globally rather than aliased onto routes, because the file-upload
        // catch-all inside it only works if every request passes through. Inert
        // for everyone else: it returns $next() as soon as it sees the user is
        // not a demo. Reads, login and logout are untouched - see the class.
        $middleware->appendToGroup('api', \App\Http\Middleware\BlockDemoUploads::class);

        // Global Teezer Control (Admin > Settings > Global Teezer Control).
        // Appended globally, same reasoning as EnsureLicensed/BlockDemoUploads
        // above it: this is the one place that guarantees a restriction holds
        // regardless of client, app version, or a direct API call bypassing
        // any UI. Inert for every route not named in its route-control map.
        $middleware->appendToGroup('api', \App\Http\Middleware\EnsureGlobalControlEnabled::class);
        $middleware->appendToGroup('api', \App\Http\Middleware\SecurityHeaders::class);
        $middleware->appendToGroup('api', \App\Http\Middleware\TrackUserActivity::class);
        // Times every API request into a rolling Redis sample so latency can be
        // reported as percentiles - see AdminMonitoringController::metrics.
        // Appended last so it wraps the least, and it swallows its own errors.
        $middleware->appendToGroup('api', \App\Http\Middleware\RecordRequestMetrics::class);

        // Same hardening for Blade-rendered web routes (admin panel, auth pages):
        // clickjacking protection (X-Frame-Options), HSTS, nosniff, and scanner blocking.
        $middleware->appendToGroup('web', \App\Http\Middleware\BlockMaliciousRequests::class);
        $middleware->appendToGroup('web', \App\Http\Middleware\SecurityHeaders::class);
        // The website's own /register and /login (Web\AuthController) are not
        // under api/v1 - same Global Teezer Control gate, so a restriction set
        // from the admin panel covers the Blade auth pages too, not only the API.
        $middleware->appendToGroup('web', \App\Http\Middleware\EnsureGlobalControlEnabled::class);

        // Tightened global rate limit: 300 req/min per IP (was 1000)
        $middleware->throttleApi('300,1');
    })
    ->withExceptions(function (Exceptions $exceptions) {

        // ── Unauthenticated (401) ────────────────────────────────────
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }
            return redirect()->route('login');
        });

        // ── Validation (422) ─────────────────────────────────────────
        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed.',
                    'errors'  => $e->errors(),
                ], 422);
            }
        });

        // ── 404 Not Found ────────────────────────────────────────────
        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Resource not found.',
                ], 404);
            }
        });

        // ── HTTP Exceptions (403, 429, 500, etc.) ────────────────────
        $exceptions->render(function (HttpException $e, Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage() ?: 'An error occurred.',
                ], $e->getStatusCode());
            }
        });

        // ── Catch-all (500) ──────────────────────────────────────────
        // Everything the handlers above did not match: QueryException, TypeError,
        // a failing third-party client, and so on. Without this, those fall
        // through to Laravel's default renderer, whose output is safe ONLY
        // because APP_DEBUG is false - one accidental APP_DEBUG=true in
        // production and the client gets a full stack trace with file paths and
        // SQL. Returning a fixed message here makes that independent of
        // APP_DEBUG, and the correlation id keeps a user-reported failure
        // traceable to the real exception in the logs.
        //
        // The type checks make this independent of callback ordering: returning
        // null hands the exception back for the specific handlers above.
        // NotFoundHttpException extends HttpException, so it is covered too.
        $exceptions->render(function (Throwable $e, Request $request) {
            if ($e instanceof HttpException
                || $e instanceof ValidationException
                || $e instanceof AuthenticationException) {
                return null;
            }

            if (! ($request->expectsJson() || $request->is('api/*'))) {
                return null;
            }

            $correlationId = (string) Str::uuid();

            // Full detail stays server-side, keyed by the id the client is given.
            Log::error('Unhandled exception', [
                'correlation_id' => $correlationId,
                'exception'      => $e::class,
                'message'        => $e->getMessage(),
                'file'           => $e->getFile(),
                'line'           => $e->getLine(),
                'method'         => $request->method(),
                'path'           => $request->path(),
                'user_id'        => $request->user()?->id,
            ]);

            return response()->json([
                'success'        => false,
                'message'        => 'An unexpected error occurred. Please try again.',
                'correlation_id' => $correlationId,
            ], 500);
        });

    })->create();
