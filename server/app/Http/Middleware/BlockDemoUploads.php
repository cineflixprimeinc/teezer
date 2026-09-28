<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stops a demo account creating content on the public site.
 *
 * BlockDemoWrites covers the admin panel by refusing every non-GET request.
 * That approach is deliberately NOT reused here, because on the public site a
 * great deal of ordinary browsing is a write: POST /videos/{id}/view,
 * POST /video-events, POST /stories/{id}/view. Blocking those would leave a
 * demo account unable to watch anything, which is the opposite of the point -
 * a demo should see the whole product.
 *
 * So this blocks two specific things instead:
 *
 *   1. ANY request carrying an uploaded file. This is the catch-all and the
 *      reason the middleware is not just a route list: it holds for endpoints
 *      that do not exist yet, and for ones nobody remembered to add.
 *
 *   2. Named routes that BEGIN an upload or create content without a file in
 *      the request. Presigned uploads are the case that makes this necessary -
 *      the browser PUTs straight to storage and the bytes never pass through
 *      Laravel, so file detection alone would let a demo account upload a
 *      full video.
 *
 * Named routes, not URI patterns: a rename changes a URI and silently reopens
 * a hole, whereas a route name is the stable identifier the application itself
 * uses.
 *
 * Reads are untouched. So are login, logout and session handling - a demo user
 * that cannot sign in is not a demo.
 */
class BlockDemoUploads
{
    /**
     * Route-name prefixes that create content or start an upload.
     *
     * Prefix matching so a group's children are covered by naming the group
     * once - `api.v1.videos.multipart.` catches every part of a multipart
     * upload without listing each step.
     */
    private const BLOCKED_ROUTE_PREFIXES = [
        // Video upload, in every form it takes. The multipart prefix covers
        // create/sign/complete/abort in one; its `status` sibling is a GET and
        // is let through by the method check above.
        'api.v1.videos.upload-url',
        'api.v1.videos.complete-upload',
        'api.v1.videos.multipart.',
        'api.v1.videos.store',

        // Stories
        'api.v1.stories.store',
        'api.v1.stories.from-video',

        // Profile media. Also catches profile.avatar.remove, which is right -
        // deleting the picture is still changing the account.
        'api.v1.profile.avatar',
        'api.v1.profile.highlights.store',

        // Shop and seller onboarding
        'api.v1.shop.products.store',
        'api.v1.shop.collections.store',
        'api.v1.shop.settings.logo',
        'api.v1.seller.application.',

        // Direct messages can carry media
        'api.v1.messages.upload-url',

        // Ad creatives
        'api.v1.studio.ad-creatives.upload-url',

        // Identity documents
        'api.v1.user.country-residency-documents.store',

        /*
         * Payments. Not uploads, but a demo account must never be able to
         * start a real charge - a Stripe intent or Razorpay order from a
         * shared demo login is somebody's actual money.
         */
        'api.v1.shop.orders.stripe.',
        'api.v1.shop.orders.razorpay.',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->is_demo) {
            return $next($request);
        }

        // Reads are always fine - a demo account is meant to browse everything.
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        if ($this->carriesUpload($request) || $this->isBlockedRoute($request)) {
            return response()->json([
                'success' => false,
                // Its own code so the client can explain this rather than
                // rendering a generic failure - "this is a demo" is
                // information, not an error.
                'code'    => 'DEMO_ACCOUNT_NO_UPLOAD',
                'message' => 'This is a demo account, so uploading and posting are disabled. '
                    . 'You can browse everything on Teezer - videos, profiles, stories and the '
                    . 'Studio - but nothing can be published from it.',
                'demo'    => true,
            ], 403);
        }

        return $next($request);
    }

    /**
     * Any uploaded file at all, at any depth.
     *
     * allFiles() flattens nested arrays, so a payload like media[0][file] is
     * caught as readily as a top-level one.
     */
    private function carriesUpload(Request $request): bool
    {
        return $request->allFiles() !== [];
    }

    private function isBlockedRoute(Request $request): bool
    {
        $name = $request->route()?->getName();

        if ($name === null) {
            return false;
        }

        foreach (self::BLOCKED_ROUTE_PREFIXES as $prefix) {
            if (str_starts_with($name, $prefix)) {
                return true;
            }
        }

        return false;
    }
}
