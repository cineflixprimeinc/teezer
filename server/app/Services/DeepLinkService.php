<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * The canonical Teezer link grammar - one authority, three consumers.
 *
 * Every notification carries a `deep_link` built here, and the web app, the
 * mobile app and any future surface all route from that single string instead
 * of each re-deriving a destination from (type, entity_type, entity_id).
 *
 * That re-derivation is what this replaces. The website already carried TWO
 * copies of the mapping - notifications-center.tsx and notification-dropdown.tsx -
 * and they had already drifted apart (only one handled `verification`; only one
 * handled story entities; neither used `comment_id` at all). Mobile carried a
 * third, degenerate copy that sent every notification to the actor's profile.
 *
 * Paths are ROOT-RELATIVE and identical on web and mobile. https://teezer.live
 * serves them as pages; the app claims the same URLs via App Links / Universal
 * Links, so one string works whether or not the app is installed.
 *
 *   /video/{id}            /profile/{username}     /live/{id}
 *   /tag/{hashtag}         /comment/{id}           /notification/{id}
 *
 * Deliberately NOT persisted as a column: it is derived at serialization time,
 * so old rows link correctly and the grammar can be changed without a migration
 * or a backfill.
 */
class DeepLinkService
{
    /** Types whose subject is the actor rather than a piece of content. */
    private const PROFILE_TYPES = [
        'follow',
        'follow_request',
        'follow_request_accepted',
        'follow_request_rejected',
        'profile_view',
    ];

    /** Types that are Teezer talking to the user; they open the notice itself. */
    private const SYSTEM_TYPES = [
        'system',
        'verification',
        'report_actioned',
        'report_update',
        'admin_account_restriction',
        'restriction_applied',
        'restriction_lifted',
    ];

    /**
     * Build the link for one notification row.
     *
     * @param  object  $n            The AppNotification (or any object with the same fields).
     * @param  int|null $resolvedVideoId  Video id for comment-anchored types, resolved by the
     *                                    caller in ONE batched query. See the note below.
     */
    public static function forNotification(object $n, ?int $resolvedVideoId = null): string
    {
        $type       = (string) ($n->type ?? '');
        $entityType = (string) ($n->entity_type ?? '');
        $entityId   = $n->entity_id !== null ? (int) $n->entity_id : null;
        $commentId  = $n->comment_id !== null ? (int) $n->comment_id : null;
        $username   = $n->actor->username ?? null;

        // System notices open in the notification centre, where the full body
        // and any admin action live. Checked first: an admin message about a
        // video is still an admin message.
        if (in_array($type, self::SYSTEM_TYPES, true)
            || $entityType === 'admin_message'
            || $entityType === 'admin_action') {
            return self::notification((int) $n->id);
        }

        // Anything anchored to a specific comment - a reply, a comment like, a
        // mention inside a comment - opens that comment's parent reel when we
        // know it. Mobile has no /comment/{id} screen yet (comments are a sheet
        // on the viewer), so /video/{id} is the destination that actually works;
        // /comment/{id} remains only as a last resort for clients that can
        // resolve it, or until the sheet is deep-linkable.
        if ($commentId !== null) {
            if ($resolvedVideoId !== null) {
                return self::video($resolvedVideoId);
            }
            return self::comment($commentId);
        }
        if ($entityType === 'comment' && $entityId !== null) {
            if ($resolvedVideoId !== null) {
                return self::video($resolvedVideoId);
            }
            return self::comment($entityId);
        }

        if ($entityType === 'video' && $entityId !== null) {
            return self::video($entityId);
        }

        // Tag/collab requests ('tag_request', 'collab_request', and their
        // _accepted/_rejected follow-ups) point entity_id at the
        // comment_mentions row itself (so TagController/CollabController can
        // look it up by id), not at the video - so it never matched the
        // entity_type==='video' branch above and fell all the way to the
        // actor's own profile, losing the content entirely. The row's own
        // video_id column (populated at insert time by every MentionService
        // tag/collab method) resolves it to the real destination.
        if ($entityType === 'comment_mention' && $entityId !== null) {
            $videoId = DB::table('comment_mentions')->where('id', $entityId)->value('video_id');
            if ($videoId) {
                return self::video((int) $videoId);
            }
        }

        // A story has no standalone page yet, so it resolves to its author -
        // which is where the story is reachable from.
        if ($entityType === 'story' && $username) {
            return self::profile($username);
        }

        if ($entityType === 'live' && $entityId !== null) {
            return self::live($entityId);
        }

        // Message requests and DM notices open the messaging surface, where the
        // request is actually accepted/declined - not the actor's profile,
        // which lost the request context entirely.
        if ($type === 'message_request' || $type === 'message_request_accepted' || $entityType === 'conversation') {
            return self::messages();
        }

        if (in_array($type, self::PROFILE_TYPES, true) && $username) {
            return self::profile($username);
        }

        // A caller-supplied video id wins over the generic fallback.
        if ($resolvedVideoId !== null) {
            return self::video($resolvedVideoId);
        }

        // Last resort: the notification itself always exists and always opens.
        return $username ? self::profile($username) : self::notification((int) $n->id);
    }

    /* ── builders ──────────────────────────────────────────────────────────
     * Every path in the grammar is produced here and nowhere else, so a change
     * to the URL shape is a change to one file.
     */

    public static function video(int $id): string
    {
        return "/video/{$id}";
    }

    public static function profile(string $username): string
    {
        return '/profile/' . ltrim($username, '@');
    }

    public static function live(int $id): string
    {
        return "/live/{$id}";
    }

    public static function tag(string $hashtag): string
    {
        return '/tag/' . ltrim($hashtag, '#');
    }

    public static function comment(int $id): string
    {
        return "/comment/{$id}";
    }

    public static function notification(int $id): string
    {
        return "/notification/{$id}";
    }

    /**
     * The DM surface - where a message request is actually handled. Message
     * requests used to link to the actor's profile, which lost the request
     * context entirely; both the website and the app open their inbox here.
     */
    public static function messages(): string
    {
        return '/messages';
    }

    /** Absolute form, for push payloads and anywhere a full URL is required. */
    public static function absolute(string $path): string
    {
        return rtrim(config('app.web_url', 'https://teezer.live'), '/') . $path;
    }
}
