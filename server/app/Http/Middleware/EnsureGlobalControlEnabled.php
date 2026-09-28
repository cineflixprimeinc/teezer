<?php

namespace App\Http\Middleware;

use App\Services\GlobalControls\GlobalControlService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Backend enforcement for Global Teezer Control (Admin > Settings > Global
 * Teezer Control). Registered globally on the `api` middleware group in
 * bootstrap/app.php, so it sees every API request regardless of client or
 * app version - the spec's "old app compatibility" and "cannot be bypassed
 * by a direct API call" requirements are satisfied by running here, not by
 * hoping every client checks the public config first.
 *
 * Three layers, checked in order:
 *
 *   1. Maintenance mode / Read-only mode - platform-wide, checked against a
 *      short EXEMPT allowlist (same idiom as EnsureLicensed::EXEMPT) so the
 *      admin panel and health check never lock themselves out.
 *   2. Route-name-prefix -> control key map - the same idiom as
 *      BlockDemoUploads::BLOCKED_ROUTE_PREFIXES: route *names*, not URIs,
 *      because a URI rename silently reopens a hole while a route name is
 *      the stable identifier the app itself uses. A request whose route
 *      name starts with a listed prefix is rejected unless every control
 *      key attached to a matching prefix is enabled.
 *
 * What this middleware deliberately does NOT do: gate every route in the
 * app. Only the choke points named in GlobalControlRegistry's `enforcement`
 * strings are covered. Branch-point actions where "create" vs "log in" is
 * decided inside one shared controller method (social login) are checked
 * inline in that controller instead, because no route-level split exists to
 * hang a route-name check on.
 */
class EnsureGlobalControlEnabled
{
    public function __construct(private readonly GlobalControlService $controls) {}

    /** Route-name prefixes that must stay reachable regardless of mode. */
    private const EXEMPT_PREFIXES = [
        'up',
        'api.v1.health',
        'api.v1.setup.',
        'api.v1.license.',
        'api.v1.admin.',
        'api.v1.auth.login',
        'api.v1.auth.two-factor-challenge',
        // The website's own login must survive maintenance/read-only mode too -
        // otherwise an admin locked out of the app can't sign in to turn either
        // mode back off. Registration is deliberately NOT exempt: maintenance
        // and read-only are meant to stop new writes, and a new account is one.
        'login.post',
    ];

    /**
     * Route-name prefix => required control key(s). A route matching more
     * than one prefix must satisfy every matching key (AND semantics) - e.g.
     * a studio route matches both the broad `api.v1.studio.` entry and a
     * more specific one, and both must be enabled.
     *
     * @var array<string, string>
     */
    private const ROUTE_CONTROLS = [
        // Authentication
        'api.v1.auth.register'      => 'signup_enabled',
        'api.v1.auth.send-otp'      => 'signup_enabled',
        'api.v1.auth.verify-otp'    => 'signup_enabled',
        'register.post'             => 'signup_enabled',
        'login.post'                => 'login_enabled',

        // Content / uploads (emergency-paired)
        'api.v1.videos.upload-url'      => 'uploads_enabled',
        'api.v1.videos.complete-upload' => 'uploads_enabled',
        'api.v1.videos.store'           => 'uploads_enabled',
        'api.v1.videos.multipart.'      => 'uploads_enabled',
        'api.v1.stories.store'          => 'uploads_enabled',

        // User activity
        'api.v1.videos.like'            => 'likes_enabled',
        'api.v1.videos.unlike'          => 'likes_enabled',
        'api.v1.videos.toggle-like'     => 'likes_enabled',
        'api.v1.videos.comments.like'   => 'likes_enabled',
        'api.v1.videos.comments.unlike' => 'likes_enabled',
        'api.v1.users.follow'           => 'following_enabled',
        'api.v1.videos.comments.store'  => 'comments_enabled',
        'api.v1.videos.share'           => 'share_enabled',
        'api.v1.videos.save'            => 'save_enabled',
        'api.v1.videos.unsave'          => 'save_enabled',
        'api.v1.videos.toggle-save'     => 'save_enabled',
        'api.v1.search'                 => 'search_enabled',
        'api.v1.explore.search'         => 'search_enabled',
        'api.v1.users.search'           => 'search_enabled',
        'api.v1.audio.search'           => 'search_enabled',
        'api.v1.videos.view'            => 'content_viewing_enabled',

        // Live & Spaces (live_create is emergency-paired)
        'api.v1.studio.live.store'   => 'live_create_enabled',
        'api.v1.studio.live.start'   => 'live_create_enabled',
        'api.v1.live-streams.join'   => 'live_watch_enabled',
        'api.v1.spaces.store'        => 'spaces_create_enabled',
        'api.v1.spaces.join'         => 'spaces_join_enabled',

        // Messaging
        'api.v1.messages.send'       => 'direct_messages_enabled',
        'api.v1.messages.upload-url' => 'message_attachments_enabled',

        // Account
        'api.v1.profile.update'       => 'profile_editing_enabled',
        'api.v1.profile.avatar'       => 'profile_image_changes_enabled',
        'api.v1.profile.avatar.remove'=> 'profile_image_changes_enabled',

        // Monetization
        'api.v1.gifts.send'                        => 'gifts_enabled',
        'api.v1.studio.wallets-coins.'              => 'coin_purchases_enabled',
        'api.v1.studio.monetization.withdraw'       => 'withdrawals_enabled',
        'api.v1.studio.subscriptions.intent'        => 'creator_subscriptions_enabled',
        'api.v1.studio.subscriptions.capture.'      => 'creator_subscriptions_enabled',

        // Studio master switch - deliberately last/broadest so the
        // specific entries above still name their own precise reason;
        // both are checked (AND) for anything under /studio/*.
        'api.v1.studio.' => 'studio_enabled',

        // Content: owner-facing edit/delete
        'api.v1.videos.update'  => 'content_editing_enabled',
        'api.v1.videos.destroy' => 'content_deletion_enabled',

        // Live & Spaces
        'api.v1.live-streams.messages.store' => 'live_comments_enabled',
        'api.v1.spaces.request-speak'        => 'spaces_speak_enabled',
        'api.v1.spaces.cancel-request'       => 'spaces_speak_enabled',
        'api.v1.spaces.moderation.'          => 'spaces_moderation_enabled',
        'api.v1.spaces.requests.approve'     => 'spaces_moderation_enabled',
        'api.v1.spaces.requests.decline'     => 'spaces_moderation_enabled',
        'api.v1.spaces.invite'               => 'spaces_invitations_enabled',

        // Account
        'api.v1.profile.social-links.update' => 'social_links_enabled',

        // Discovery
        'api.v1.explore.featured'      => 'explore_enabled',
        'api.v1.explore.categories'    => 'explore_enabled',
        'api.v1.explore.sounds'        => 'explore_enabled',
        'api.v1.explore.hashtags'      => 'explore_enabled',
        'api.v1.explore.hashtag-videos'=> 'explore_enabled',
        'api.v1.explore.top-creators'  => 'explore_enabled',
        'api.v1.videos.trending'       => 'trending_enabled',
        'api.v1.explore.trending'      => 'trending_enabled',
        'api.v1.feed.for-you'          => 'recommendation_feed_enabled',
        'api.v1.videos.feed'           => 'recommendation_feed_enabled',

        // Safety & Reporting
        'api.v1.users.report'           => 'report_users_enabled',
        'api.v1.videos.report'          => 'report_content_enabled',
        'api.v1.videos.comments.report' => 'report_content_enabled',
        'api.v1.live-streams.report'    => 'report_content_enabled',
        'api.v1.spaces.report'          => 'report_content_enabled',
        'api.v1.users.mute'             => 'mute_users_enabled',
        'api.v1.moderation.appeal'      => 'appeal_submission_enabled',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $routeName = $request->route()?->getName();

        if ($routeName !== null && $this->isExempt($routeName)) {
            return $next($request);
        }

        if ($this->controls->isMaintenanceMode()) {
            return response()->json([
                'success' => false,
                'error' => [
                    'code' => 'MAINTENANCE_MODE',
                    'message' => 'Teezer is currently undergoing scheduled maintenance. Please try again shortly.',
                ],
            ], 503);
        }

        if ($this->controls->isReadOnlyMode() && ! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return response()->json([
                'success' => false,
                'error' => [
                    'code' => 'READ_ONLY_MODE',
                    'message' => 'Teezer is temporarily in read-only mode. Please try again shortly.',
                ],
            ], 503);
        }

        if ($routeName !== null) {
            $failed = $this->firstDisabledMatch($routeName);
            if ($failed !== null) {
                return response()->json($this->controls->deniedResponse($failed), 403);
            }
        }

        return $next($request);
    }

    private function isExempt(string $routeName): bool
    {
        foreach (self::EXEMPT_PREFIXES as $prefix) {
            if ($routeName === $prefix || str_starts_with($routeName, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /** Returns the first disabled control key blocking this route, or null. */
    private function firstDisabledMatch(string $routeName): ?string
    {
        foreach (self::ROUTE_CONTROLS as $prefix => $key) {
            if (! str_starts_with($routeName, $prefix)) {
                continue;
            }

            $enabled = $this->hasEmergencyPair($key)
                ? $this->controls->isEnabledWithEmergencyPair($key)
                : $this->controls->isEnabled($key);

            if (! $enabled) {
                return $key;
            }
        }

        return null;
    }

    private function hasEmergencyPair(string $key): bool
    {
        return in_array($key, ['uploads_enabled', 'live_create_enabled', 'signup_enabled'], true);
    }
}
