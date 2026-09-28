<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options',  'nosniff');
        $response->headers->set('X-Frame-Options',          'DENY');
        $response->headers->set('X-XSS-Protection',         '1; mode=block');
        $response->headers->set('Referrer-Policy',          'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy',
            'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
        $response->headers->set('Strict-Transport-Security',
            'max-age=31536000; includeSubDomains');

        // Content-Security-Policy. Two policies, because this middleware runs on
        // both route groups and they have very different needs:
        //
        //  - API responses are JSON. Nothing should ever be loaded or executed
        //    from them, so 'none' across the board is both the strictest and the
        //    safest possible policy - there is nothing it can break.
        //  - Blade routes (login/register/creator dashboard) serve first-party
        //    markup only: the sole external references in the views are social
        //    profile links in href attributes, and the only asset tags are local
        //    favicons via asset(). 'self' therefore covers them, with
        //    style-src 'unsafe-inline' for inline style attributes.
        //
        // frame-ancestors is the modern counterpart of the X-Frame-Options set
        // above; both are sent because older browsers only honour the latter.
        $response->headers->set('Content-Security-Policy',
            $request->is('api/*') || $request->expectsJson()
                ? "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
                : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                    . "img-src 'self' data:; font-src 'self' data:; object-src 'none'; "
                    . "base-uri 'self'; form-action 'self'; frame-ancestors 'none'");

        // Remove server-fingerprinting headers
        $response->headers->remove('X-Powered-By');
        $response->headers->remove('Server');

        return $response;
    }
}
