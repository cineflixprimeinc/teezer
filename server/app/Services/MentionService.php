<?php

namespace App\Services;

use App\Models\User;
use App\Models\Video;
use Illuminate\Support\Facades\DB;

class MentionService
{
    public function __construct(private NotificationService $notifs) {}

    /**
     * Extract @usernames from text.
     */
    public function extractUsernames(string $text): array
    {
        preg_match_all('/@([a-zA-Z0-9._]+)/u', $text, $matches);
        return array_unique($matches[1] ?? []);
    }

    /**
     * "video" | "photo" | "post" - drives notification wording ("tagged you
     * in a video" vs "in a photo") instead of a hardcoded "a post" for
     * everything. A carousel (media_items non-empty) reads as the generic
     * "post" - it's more than one photo, so "photo" singular would
     * understate it and "video" would be wrong.
     */
    private function mediaKind(?int $videoId): string
    {
        if (!$videoId) {
            return 'post';
        }
        $video = Video::select('mime_type', 'media_items')->find($videoId);
        if (!$video) {
            return 'post';
        }
        if (!empty($video->media_items)) {
            return 'post';
        }
        return str_starts_with($video->mime_type ?? '', 'image/') ? 'photo' : 'video';
    }

    /**
     * Parse mentions from $text, create DB records, and notify each mentioned user.
     *
     * @param  string   $sourceType  'comment' | 'reply' | 'caption'
     * @param  int      $sourceId    comment_id or video_id
     * @param  int|null $videoId     always the related video id
     */
    public function processMentions(
        string $text,
        User   $actor,
        string $sourceType,
        int    $sourceId,
        ?int   $videoId = null
    ): void {
        $usernames = $this->extractUsernames($text);
        if (empty($usernames)) {
            return;
        }

        $users = User::whereIn('username', $usernames)
            ->where('is_active', true)
            ->where('is_banned', false)
            ->get();

        foreach ($users as $mentioned) {
            if ($mentioned->id === $actor->id) {
                continue; // never self-notify
            }

            // Prevent duplicate mention record for same user + source
            $exists = DB::table('comment_mentions')
                ->where('mentioned_user_id', $mentioned->id)
                ->where('source_type', $sourceType)
                ->where('source_id', $sourceId)
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('comment_mentions')->insert([
                'mentioned_user_id'    => $mentioned->id,
                'mentioned_by_user_id' => $actor->id,
                'source_type'          => $sourceType,
                'source_id'            => $sourceId,
                'video_id'             => $videoId,
                'created_at'           => now(),
            ]);

            $sourceLabel = $sourceType === 'caption' ? ('a ' . $this->mediaKind($videoId)) : 'a comment';
            $message     = NotificationService::buildMessage('mention', $actor->name ?? $actor->username, [
                'source' => $sourceLabel,
            ]);

            $this->notifs->notify($mentioned, 'mention', [
                'actor_id'    => $actor->id,
                'entity_type' => 'video',
                'entity_id'   => $videoId ?? $sourceId,
                // sourceId is the comment/reply id for those source types, but a
                // caption mention has no comment to point at.
                'comment_id'  => $sourceType === 'caption' ? null : $sourceId,
                'message'     => $message,
            ]);
        }
    }

    /**
     * Process explicit "Tag people" selections attached to a post.
     *
     * Unlike caption mentions, these come from the structured tagged_users payload
     * (array of {id, username}), never from the caption text. Each tagged user gets
     * a mention record (source_type 'tag') and a notification.
     *
     * @param array<int, array{id?: int|string, username?: string}> $tagged
     */
    public function processTaggedUsers(array $tagged, User $actor, int $videoId): void
    {
        $ids = collect($tagged)
            ->pluck('id')
            ->filter(fn ($v) => is_numeric($v))
            ->map(fn ($v) => (int) $v)
            ->unique();

        $usernames = collect($tagged)
            ->pluck('username')
            ->filter(fn ($v) => is_string($v) && $v !== '')
            ->unique();

        if ($ids->isEmpty() && $usernames->isEmpty()) {
            return;
        }

        $users = User::query()
            ->where('is_active', true)
            ->where('is_banned', false)
            ->where(function ($q) use ($ids, $usernames) {
                if ($ids->isNotEmpty())       $q->orWhereIn('id', $ids->all());
                if ($usernames->isNotEmpty()) $q->orWhereIn('username', $usernames->all());
            })
            ->get();

        foreach ($users as $mentioned) {
            if ($mentioned->id === $actor->id) {
                continue; // never self-notify
            }

            $exists = DB::table('comment_mentions')
                ->where('mentioned_user_id', $mentioned->id)
                ->where('source_type', 'tag')
                ->where('source_id', $videoId)
                ->exists();

            if ($exists) {
                continue;
            }

            $mentionId = DB::table('comment_mentions')->insertGetId([
                'mentioned_user_id'    => $mentioned->id,
                'mentioned_by_user_id' => $actor->id,
                'source_type'          => 'tag',
                'source_id'            => $videoId,
                'video_id'             => $videoId,
                // A tag only shows on the post once the tagged user accepts it -
                // see the migration that added this column and Video::taggedUsers().
                'status'               => 'pending',
                'created_at'           => now(),
            ]);

            $message = NotificationService::buildMessage('tag_request', $actor->name ?? $actor->username, [
                'kind' => $this->mediaKind($videoId),
            ]);

            // entity_type/entity_id point at this comment_mentions row so
            // TagController::accept()/decline() can look it up directly.
            $this->notifs->notify($mentioned, 'tag_request', [
                'actor_id'      => $actor->id,
                'entity_type'   => 'comment_mention',
                'entity_id'     => $mentionId,
                'action_status' => 'pending',
                'message'       => $message,
            ]);
        }
    }

    /**
     * Re-process mentions after an edit: remove stale ones, add new ones.
     * Does NOT send duplicate notifications for already-mentioned users.
     *
     * This used to delete EVERY existing mention record for this source
     * before reinserting - which defeated processMentions()'s own dedup
     * guard (an `$exists` check against the very rows just deleted), so
     * re-saving a caption/comment that still named the same @user sent
     * them a second, fully duplicate 'mention' notification on every edit.
     * Now only mention records for users no longer in the text are removed;
     * a still-mentioned user's row survives untouched, so
     * processMentions()'s guard correctly skips re-notifying them and only
     * genuinely new @mentions get a fresh row + notification.
     */
    public function updateMentions(
        string $newText,
        User   $actor,
        string $sourceType,
        int    $sourceId,
        ?int   $videoId = null
    ): void {
        $newUsernames = $this->extractUsernames($newText);

        $query = DB::table('comment_mentions')
            ->where('source_type', $sourceType)
            ->where('source_id', $sourceId);

        if (!empty($newUsernames)) {
            $keepIds = User::whereIn('username', $newUsernames)->pluck('id');
            $query->whereNotIn('mentioned_user_id', $keepIds);
        }

        $query->delete();

        $this->processMentions($newText, $actor, $sourceType, $sourceId, $videoId);
    }

    /**
     * Sync the "Tag people" list on an existing post (used by the edit endpoint).
     * Removes tags for users no longer in $newUserIds and adds any new ones.
     * Does NOT re-notify users who were already tagged.
     *
     * @param int[] $newUserIds  The complete desired set of tagged-user IDs.
     */
    public function syncTaggedUsers(array $newUserIds, User $actor, int $videoId): void
    {
        $newUserIds = array_unique(array_map('intval', array_filter($newUserIds, 'is_numeric')));

        $existing = DB::table('comment_mentions')
            ->where('source_type', 'tag')
            ->where('source_id', $videoId)
            ->get(['mentioned_user_id', 'status']);

        // --- remove tags for users no longer in the list ---
        // Scoped to ACCEPTED rows only. $newUserIds comes from the client's
        // tagged_users, which - same as Video::taggedUsers() - only ever
        // contains accepted tags; a still-pending or already-declined row is
        // never part of what the editor showed, so its absence from the list
        // means nothing. Diffing against every status here used to delete
        // (i.e. silently decline) a pending tag request the moment the post
        // was saved for ANY reason, even one that never touched Tag People.
        $acceptedIds = $existing->where('status', 'accepted')
            ->pluck('mentioned_user_id')->map(fn ($v) => (int) $v)->unique()->values()->all();
        $allCurrentIds = $existing
            ->pluck('mentioned_user_id')->map(fn ($v) => (int) $v)->unique()->values()->all();

        $toRemove = array_diff($acceptedIds, $newUserIds);
        if (!empty($toRemove)) {
            DB::table('comment_mentions')
                ->where('source_type', 'tag')
                ->where('source_id', $videoId)
                ->where('status', 'accepted')
                ->whereIn('mentioned_user_id', $toRemove)
                ->delete();
        }

        // --- add tags for users newly added to the list ---
        // Diffed against EVERY current row (any status), not just accepted -
        // a user who already has a pending or declined tag on this post must
        // not get a second, duplicate mention row inserted underneath them.
        $toAdd = array_diff($newUserIds, $allCurrentIds);
        if (empty($toAdd)) {
            return;
        }

        $users = User::whereIn('id', $toAdd)
            ->where('is_active', true)
            ->where('is_banned', false)
            ->get();

        foreach ($users as $mentioned) {
            if ($mentioned->id === $actor->id) {
                continue;
            }

            $mentionId = DB::table('comment_mentions')->insertGetId([
                'mentioned_user_id'    => $mentioned->id,
                'mentioned_by_user_id' => $actor->id,
                'source_type'          => 'tag',
                'source_id'            => $videoId,
                'video_id'             => $videoId,
                // A tag only shows on the post once the tagged user accepts it -
                // see the migration that added this column and Video::taggedUsers().
                'status'               => 'pending',
                'created_at'           => now(),
            ]);

            $message = NotificationService::buildMessage('tag_request', $actor->name ?? $actor->username, [
                'kind' => $this->mediaKind($videoId),
            ]);

            // entity_type/entity_id point at this comment_mentions row so
            // TagController::accept()/decline() can look it up directly.
            $this->notifs->notify($mentioned, 'tag_request', [
                'actor_id'      => $actor->id,
                'entity_type'   => 'comment_mention',
                'entity_id'     => $mentionId,
                'action_status' => 'pending',
                'message'       => $message,
            ]);
        }
    }

    /**
     * Process explicit "Paid partnership" collab tags attached to a post.
     *
     * Same shape as processTaggedUsers() above - structured {id, username}
     * payload, source_type 'collab' instead of 'tag', notification type
     * 'collab_request' instead of 'tag_request'. Requires the tagged
     * collaborator's acceptance before they show in Video::collabUsers().
     *
     * @param array<int, array{id?: int|string, username?: string}> $collab
     */
    public function processCollabUsers(array $collab, User $actor, int $videoId): void
    {
        $ids = collect($collab)
            ->pluck('id')
            ->filter(fn ($v) => is_numeric($v))
            ->map(fn ($v) => (int) $v)
            ->unique();

        $usernames = collect($collab)
            ->pluck('username')
            ->filter(fn ($v) => is_string($v) && $v !== '')
            ->unique();

        if ($ids->isEmpty() && $usernames->isEmpty()) {
            return;
        }

        $users = User::query()
            ->where('is_active', true)
            ->where('is_banned', false)
            ->where(function ($q) use ($ids, $usernames) {
                if ($ids->isNotEmpty())       $q->orWhereIn('id', $ids->all());
                if ($usernames->isNotEmpty()) $q->orWhereIn('username', $usernames->all());
            })
            ->get();

        foreach ($users as $mentioned) {
            if ($mentioned->id === $actor->id) {
                continue; // never self-notify
            }

            $exists = DB::table('comment_mentions')
                ->where('mentioned_user_id', $mentioned->id)
                ->where('source_type', 'collab')
                ->where('source_id', $videoId)
                ->exists();

            if ($exists) {
                continue;
            }

            $mentionId = DB::table('comment_mentions')->insertGetId([
                'mentioned_user_id'    => $mentioned->id,
                'mentioned_by_user_id' => $actor->id,
                'source_type'          => 'collab',
                'source_id'            => $videoId,
                'video_id'             => $videoId,
                // A collab tag only shows on the post once the collaborator
                // accepts it - see Video::collabUsers().
                'status'               => 'pending',
                'created_at'           => now(),
            ]);

            $message = NotificationService::buildMessage('collab_request', $actor->name ?? $actor->username, [
                'kind' => $this->mediaKind($videoId),
            ]);

            // entity_type/entity_id point at this comment_mentions row so
            // CollabController::accept()/decline() can look it up directly.
            $this->notifs->notify($mentioned, 'collab_request', [
                'actor_id'      => $actor->id,
                'entity_type'   => 'comment_mention',
                'entity_id'     => $mentionId,
                'action_status' => 'pending',
                'message'       => $message,
            ]);
        }
    }

    /**
     * Sync the collab list on an existing post (used by the edit endpoint).
     * Same shape as syncTaggedUsers() above - source_type 'collab'.
     *
     * @param int[] $newUserIds  The complete desired set of collab-tagged user IDs.
     */
    public function syncCollabUsers(array $newUserIds, User $actor, int $videoId): void
    {
        $newUserIds = array_unique(array_map('intval', array_filter($newUserIds, 'is_numeric')));

        $existing = DB::table('comment_mentions')
            ->where('source_type', 'collab')
            ->where('source_id', $videoId)
            ->get(['mentioned_user_id', 'status']);

        // Same fix as syncTaggedUsers() above, same reason: only an ACCEPTED
        // collaborator was ever visible to the client as collab_users, so
        // only accepted rows are eligible for removal-by-omission. A pending
        // brand/collaborator invite must survive an edit that never touched
        // Paid Collaboration.
        $acceptedIds = $existing->where('status', 'accepted')
            ->pluck('mentioned_user_id')->map(fn ($v) => (int) $v)->unique()->values()->all();
        $allCurrentIds = $existing
            ->pluck('mentioned_user_id')->map(fn ($v) => (int) $v)->unique()->values()->all();

        $toRemove = array_diff($acceptedIds, $newUserIds);
        if (!empty($toRemove)) {
            DB::table('comment_mentions')
                ->where('source_type', 'collab')
                ->where('source_id', $videoId)
                ->where('status', 'accepted')
                ->whereIn('mentioned_user_id', $toRemove)
                ->delete();
        }

        $toAdd = array_diff($newUserIds, $allCurrentIds);
        if (empty($toAdd)) {
            return;
        }

        $users = User::whereIn('id', $toAdd)
            ->where('is_active', true)
            ->where('is_banned', false)
            ->get();

        foreach ($users as $mentioned) {
            if ($mentioned->id === $actor->id) {
                continue;
            }

            $mentionId = DB::table('comment_mentions')->insertGetId([
                'mentioned_user_id'    => $mentioned->id,
                'mentioned_by_user_id' => $actor->id,
                'source_type'          => 'collab',
                'source_id'            => $videoId,
                'video_id'             => $videoId,
                'status'               => 'pending',
                'created_at'           => now(),
            ]);

            $message = NotificationService::buildMessage('collab_request', $actor->name ?? $actor->username, [
                'kind' => $this->mediaKind($videoId),
            ]);

            $this->notifs->notify($mentioned, 'collab_request', [
                'actor_id'      => $actor->id,
                'entity_type'   => 'comment_mention',
                'entity_id'     => $mentionId,
                'action_status' => 'pending',
                'message'       => $message,
            ]);
        }
    }
}
