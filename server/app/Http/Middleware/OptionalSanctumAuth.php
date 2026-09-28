<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticate Bearer tokens on public routes without requiring auth.
 * Sets $request->user() when a valid Sanctum token is present.
 */
class OptionalSanctumAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()) {
            return $next($request);
        }

        $plain = $request->bearerToken();
        if ($plain) {
            $accessToken = PersonalAccessToken::findToken($plain);
            $user = $accessToken?->tokenable;
            if ($user && !$user->is_banned && $user->is_active) {
                $expiresAt = $accessToken->expires_at;
                if (!$expiresAt || $expiresAt->isFuture()) {
                    $request->setUserResolver(fn () => $user);
                }
            }
        }

        return $next($request);
    }
}
