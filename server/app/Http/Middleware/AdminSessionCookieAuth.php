<?php

namespace App\Http\Middleware;

use App\Http\Controllers\Api\Auth\ApiAuthController;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets the Reelsoo Admin Panel authenticate via its httpOnly session cookie
 * instead of an Authorization header, with ZERO changes to how Sanctum itself
 * resolves a request - this only runs BEFORE the `auth:sanctum` guard and, if
 * the request has no Authorization header but does carry the admin cookie,
 * copies the cookie's value into that header. Sanctum's own PersonalAccessToken
 * lookup takes it from there exactly as it already does for a mobile/website
 * Bearer-token request; nothing about token validation, expiry, or the ban/
 * active checks changes.
 *
 * Mobile and the main website always send their own Authorization header
 * already, so the `!$request->bearerToken()` guard means this never touches
 * them - it is a pure fallback for the one client that has no header to send.
 *
 * See ApiAuthController::adminSessionCookie()'s docblock for the other half
 * of this (where the cookie is actually set/cleared).
 */
class AdminSessionCookieAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->bearerToken()) {
            $cookieToken = $request->cookie(ApiAuthController::ADMIN_SESSION_COOKIE);
            if (is_string($cookieToken) && $cookieToken !== '') {
                $request->headers->set('Authorization', 'Bearer ' . $cookieToken);
            }
        }

        return $next($request);
    }
}
