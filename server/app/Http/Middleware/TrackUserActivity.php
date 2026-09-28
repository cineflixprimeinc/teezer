<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TrackUserActivity
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($user = $request->user()) {
            // Throttle: only write to DB when last_active_at is older than 5 minutes
            if (! $user->last_active_at || $user->last_active_at->lt(now()->subMinutes(5))) {
                $user->timestamps = false;
                $user->updateQuietly(['last_active_at' => now()]);
                $user->timestamps = true;
            }
        }

        return $response;
    }
}
