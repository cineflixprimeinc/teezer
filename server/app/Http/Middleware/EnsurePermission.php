<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Per-admin permission guard - stacks AFTER ApiAdminMiddleware (which has
 * already confirmed $request->user() exists, isn't banned, isAdmin(), and
 * has 2FA set up), narrowing further to a specific grantable capability.
 * See User::hasAdminGrant() for the check itself.
 *
 * Usage: ->middleware(['api.admin', 'permission:manage_country_availability'])
 */
class EnsurePermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();

        if (!$user || !$user->hasAdminGrant($permission)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to perform this action.',
                'code'    => 'PERMISSION_DENIED',
            ], 403);
        }

        return $next($request);
    }
}
