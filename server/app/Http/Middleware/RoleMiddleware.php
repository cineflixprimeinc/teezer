<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    /**
     * Check the authenticated user's role.
     *
     * Usage in routes:
     *   ->middleware('role:admin')
     *   ->middleware('role:creator')
     *   ->middleware('role:user,creator,admin')   ← accepts multiple
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        if (!auth()->check()) {
            return redirect()->route('login')
                ->with('error', 'Please log in to continue.');
        }

        $user = auth()->user();

        // Banned users are logged out immediately
        if ($user->is_banned) {
            auth()->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect()->route('login')
                ->with('error', 'Your account has been suspended. Contact support if you believe this is an error.');
        }

        // Role check - redirect to own dashboard instead of aborting
        if (!empty($roles) && !in_array($user->role, $roles)) {
            return redirect($user->getDashboardUrl())
                ->with('error', 'You do not have permission to access that area.');
        }

        return $next($request);
    }
}
