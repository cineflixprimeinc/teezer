<?php

namespace App\Http\Middleware;

use App\Licensing\Client\LicenseState;
use App\Licensing\Client\LicenseVerifier;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Local licence gate for a customer installation.
 *
 * WHAT THIS MIDDLEWARE DOES NOT DO, and must never be changed to do:
 * it does not make an HTTP request. Not to reelsoo.com, not to
 * license.reelsoo.com, not to anything. It asks LicenseVerifier, which reads a
 * local file and does one RSA verify. A customer's homepage, login, feed and
 * API therefore keep working with our infrastructure entirely offline, which is
 * the explicit requirement in sections 8, 13 and 14 of the specification.
 *
 * On reelsoo.com itself this is completely inert: licensing.client.enabled is
 * false there, LicenseVerifier returns DISABLED, and this returns $next()
 * immediately. Production can never be blocked by its own licence check.
 *
 * The failure ladder:
 *
 *   MISSING            -> 200 with a setup pointer. A fresh install has not run
 *                         the wizard yet; that is a state to guide, not punish.
 *   INVALID/MISMATCH   -> 403. Forged, wrong domain, or wrong installation.
 *   REVOKED/SUSPENDED/ -> 403. A real licence decision, discovered offline from
 *   EXPIRED               the signed token or the last heartbeat.
 *   GRACE              -> pass, with a warning header.
 *   STALE              -> stale_policy decides: 'warn' (default) passes,
 *                         'block' returns 503.
 *
 * Nothing here deletes data, drops a database, disables an account or redirects
 * anyone to reelsoo.com. A licence problem is a 403 with an explanation.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
class EnsureLicensed
{
    public function __construct(private readonly LicenseVerifier $verifier) {}

    /**
     * Paths that must stay reachable even when the licence check fails.
     *
     * Without this list the system deadlocks in the most obvious way possible:
     * a fresh install has no licence, so every request 403s, including the very
     * setup wizard and activation endpoint that would GIVE it a licence. The
     * health check is here too, so a load balancer does not mark an
     * unactivated box as hard-down and remove it before anyone can fix it.
     *
     * Everything on this list is safe to expose unlicensed: setup refuses once
     * completed, and the licence endpoints authenticate on the licence key.
     */
    private const EXEMPT = [
        'up',
        'api/v1/health',
        'api/v1/setup/*',
        'api/v1/license/*',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $state = $this->verifier->state();

        if ($state->status === LicenseState::STATUS_DISABLED) {
            return $next($request);
        }

        if ($request->is(...self::EXEMPT)) {
            return $next($request);
        }

        if ($state->status === LicenseState::STATUS_MISSING) {
            return $this->deny($request, $state, 403, 'LICENSE_REQUIRED');
        }

        if ($state->isHardFailure()) {
            return $this->deny($request, $state, 403, 'LICENSE_' . strtoupper($state->status));
        }

        if ($state->status === LicenseState::STATUS_STALE
            && config('licensing.client.stale_policy', 'warn') === 'block') {
            return $this->deny($request, $state, 503, 'LICENSE_STALE');
        }

        $response = $next($request);

        // A grace/stale installation keeps serving, but the admin panel needs a
        // way to notice. A header rather than a body mutation, so no existing
        // response shape changes.
        if (in_array($state->status, [LicenseState::STATUS_GRACE, LicenseState::STATUS_STALE], true)) {
            $response->headers->set('X-Reelsoo-License', $state->status);
        }

        return $response;
    }

    private function deny(Request $request, LicenseState $state, int $status, string $code): Response
    {
        $payload = [
            'success'        => false,
            'message'        => $state->message,
            'code'           => $code,
            'license_status' => $state->status,
        ];

        if ($state->needsSetup()) {
            $payload['setup_url'] = rtrim((string) config('app.frontend_url', config('app.url')), '/') . '/setup';
        }

        if ($request->expectsJson() || $request->is('api/*')) {
            return response()->json($payload, $status);
        }

        // A plain, self-contained page. No asset, no framework, no external
        // request - it has to render on an installation whose licence has just
        // been refused, which is exactly when nothing else can be assumed.
        return response()->view('licensing.blocked', [
            'message'   => $state->message,
            'status'    => $state->status,
            'setupUrl'  => $payload['setup_url'] ?? null,
        ], $status);
    }
}
