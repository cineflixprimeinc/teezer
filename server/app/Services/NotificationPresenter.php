<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\Video;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * The three batched lookups a notification row needs before NotificationResource
 * can render it: the video a comment-anchored row points at, that video's
 * thumbnail, and the latest few actors behind an aggregated group.
 *
 * This used to live as private methods on NotificationController, which meant
 * only the paginated list endpoint could produce a complete notification. The
 * realtime publish path needs the identical shape - otherwise a client receiving
 * `notification:new` has an id and a type and must go fetch the list again to
 * learn what to draw, which is a round trip per event and exactly what realtime
 * is supposed to remove. Same code, one caller more.
 *
 * Every step is batched over the whole array, so enriching a page of 20 costs
 * the same three queries as enriching the single row a publish carries.
 */
class NotificationPresenter
{
    /**
     * @param  array<int, AppNotification>  $items
     */
    public static function enrich(array $items): void
    {
        if ($items === []) {
            return;
        }

        // Resolve comment-anchored notifications to their video FIRST - the
        // thumbnail batch below needs `video_id_for_comment` already attached so
        // it can cover those rows too, not just direct entity_type==='video' ones.
        self::attachCommentVideoIds($items);
        self::attachThumbnails($items);
        self::attachRecentActors($items);
    }

    /**
     * Attach `video_id_for_comment` to every comment-anchored notification, in
     * ONE query for the whole array.
     *
     * `reply` and `comment_like` rows carry entity_type='comment' with a COMMENT
     * id in entity_id, so `target_reel_id` is null and no client can work out
     * which video to open. Resolving it here is what lets those two types link
     * anywhere at all.
     *
     * Same problem, same fix, for `tag_request`/`collab_request` (and their
     * _accepted/_rejected follow-ups): entity_type='comment_mention' with a
     * comment_mentions ROW id in entity_id (so TagController/CollabController
     * can look the row up directly) - not a video id, so these used to
     * resolve to nothing and every client fell back to the actor's profile.
     * comment_mentions.video_id is populated at insert time by every
     * MentionService tag/collab method, so it resolves the same way.
     *
     * @param  array<int, AppNotification>  $items
     */
    private static function attachCommentVideoIds(array $items): void
    {
        $commentIds = [];
        $mentionIds = [];
        foreach ($items as $n) {
            if ($n->comment_id) {
                $commentIds[] = (int) $n->comment_id;
            } elseif ($n->entity_type === 'comment' && $n->entity_id) {
                $commentIds[] = (int) $n->entity_id;
            } elseif ($n->entity_type === 'comment_mention' && $n->entity_id) {
                $mentionIds[] = (int) $n->entity_id;
            }
        }

        $commentIds = array_values(array_unique($commentIds));
        $videoByComment = $commentIds === []
            ? collect()
            : DB::table('video_comments')->whereIn('id', $commentIds)->pluck('video_id', 'id');

        $mentionIds = array_values(array_unique($mentionIds));
        $videoByMention = $mentionIds === []
            ? collect()
            : DB::table('comment_mentions')->whereIn('id', $mentionIds)->pluck('video_id', 'id');

        if ($videoByComment->isEmpty() && $videoByMention->isEmpty()) {
            return;
        }

        foreach ($items as $n) {
            if ($n->entity_type === 'comment_mention' && $n->entity_id && isset($videoByMention[$n->entity_id])) {
                $n->video_id_for_comment = (int) $videoByMention[$n->entity_id];
                continue;
            }
            $cid = $n->comment_id ?: ($n->entity_type === 'comment' ? $n->entity_id : null);
            if ($cid && isset($videoByComment[$cid])) {
                $n->video_id_for_comment = (int) $videoByComment[$cid];
            }
        }
    }

    /**
     * Batch-load reel thumbnails (single query, no N+1).
     *
     * Covers every row a real video is now known for: liked/commented/mentioned
     * videos directly (entity_type==='video'), AND replies, comment likes, tag
     * requests and collab requests, whose video only became known via
     * attachCommentVideoIds just above - those used to render with no thumbnail
     * at all even though the video was resolvable, which is what hid the related
     * post from the row.
     *
     * @param  array<int, AppNotification>  $items
     */
    private static function attachThumbnails(array $items): void
    {
        $videoIds = collect($items)
            ->map(fn ($n) => $n->entity_type === 'video' ? (int) $n->entity_id : ($n->video_id_for_comment ?? null))
            ->filter()
            ->unique();

        if ($videoIds->isEmpty()) {
            return;
        }

        $disk   = config('filesystems.default', 'r2');
        $thumbs = Video::whereIn('id', $videoIds)->pluck('thumbnail_url', 'id');
        foreach ($items as $n) {
            $vid = $n->entity_type === 'video' ? (int) $n->entity_id : ($n->video_id_for_comment ?? null);
            if ($vid && ($key = $thumbs[$vid] ?? null)) {
                $n->thumb_url = Storage::disk($disk)->url($key);
            }
        }
    }

    /**
     * Attach `recent_actors` (latest 3, newest first) via a single
     * ROW_NUMBER()-windowed query, so a page renders with no N+1 - bounded even
     * when a post has thousands of likers.
     *
     * @param  array<int, AppNotification>  $items
     */
    private static function attachRecentActors(array $items): void
    {
        $ids = array_values(array_filter(array_map(static fn ($n) => (int) $n->id, $items)));
        if (empty($ids)) {
            return;
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $rows = DB::select(
            "SELECT t.notification_id, u.id AS actor_id, u.name, u.username, u.avatar, u.is_verified
             FROM (
                 SELECT na.notification_id, na.actor_id,
                        ROW_NUMBER() OVER (PARTITION BY na.notification_id ORDER BY na.id DESC) AS rn
                 FROM notification_actors na
                 WHERE na.notification_id IN ($placeholders)
             ) t
             JOIN users u ON u.id = t.actor_id
             WHERE t.rn <= 3
             ORDER BY t.notification_id, t.rn",
            $ids
        );

        $byNotif = [];
        foreach ($rows as $r) {
            $byNotif[(int) $r->notification_id][] = [
                'id'          => (int) $r->actor_id,
                'name'        => $r->name ?: ($r->username ? "@{$r->username}" : 'Someone'),
                'username'    => $r->username,
                'avatar'      => $r->avatar ? Storage::url($r->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified' => (bool) $r->is_verified,
            ];
        }

        foreach ($items as $n) {
            $n->recent_actors = $byNotif[(int) $n->id] ?? [];
        }
    }
}
