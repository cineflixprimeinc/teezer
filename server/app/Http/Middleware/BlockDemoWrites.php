<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Makes a demo account read-only inside the admin panel.
 *
 * Stacks INSIDE the api.admin group, so by the time this runs the request is
 * already an authenticated, non-banned admin. All this adds is: if that admin
 * is flagged `is_demo`, it may look but not touch.
 *
 * Enforced by HTTP METHOD rather than by an allow-list of routes. An allow-list
 * has to be kept in step with ~287 admin endpoints and silently fails open the
 * day someone adds the 288th; "GET and HEAD are safe, everything else writes"
 * needs no maintenance and cannot be forgotten. The cost is that a genuinely
 * read-only POST endpoint would be blocked too - acceptable, and the safer
 * direction to be wrong in.
 *
 * This is a SERVER-side control. The frontend also greys things out and shows a
 * banner, but that is presentation; a demo user with the browser console open
 * still cannot write, because the request never gets past here.
 */
class BlockDemoWrites
{
    /** Methods that cannot change state. Everything else is treated as a write. */
    private const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->is_demo) {
            return $next($request);
        }

        if (in_array($request->method(), self::SAFE_METHODS, true)) {
            return $next($request);
        }

        return response()->json([
            'success' => false,
            // A distinct code so the frontend can render this as an explanatory
            // notice rather than a generic red failure - being told "demo
            // accounts are read-only" is information, not an error.
            'code'    => 'DEMO_ACCOUNT_READONLY',
            'message' => 'This is a demo account, so changes are disabled. '
                . 'You can browse every part of the admin panel, but nothing can be saved, '
                . 'edited or deleted.',
            'demo'    => true,
        ], 403);
    }
}
