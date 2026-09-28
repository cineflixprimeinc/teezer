<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureNotBanned
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user?->is_banned) {
            $user->currentAccessToken()?->delete();

            return response()->json([
                'success' => false,
                'message' => 'Your account has been suspended. Contact support@teezer.live.',
                'code'    => 'ACCOUNT_BANNED',
            ], 403);
        }

        if ($user && !$user->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'This account has been deactivated.',
                'code'    => 'ACCOUNT_INACTIVE',
            ], 403);
        }

        return $next($request);
    }
}
