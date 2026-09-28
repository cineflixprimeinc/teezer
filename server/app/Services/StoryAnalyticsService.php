<?php

namespace App\Services;

use App\Models\Story;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * The single seam for every story analytics read and write.
 *
 * Both clients already talked to the same Laravel routes and the same
 * `story_views` table - there was never a second counter to merge. What was
 * missing was a place where "record a view" meant one defined thing, so the
 * view path, the reaction path and the share path each maintained whatever they
 * happened to need. Everything now goes through here, which is what makes web
 * and mobile provably identical: they are not two implementations agreeing,
 * they are one implementation.
 *
 * ── Ordering, and why it is this way round ──────────────────────────────────
 *
 *   1. source row   (story_views / story_reactions / story_shares)  <- TRUTH
 *   2. rollup row   (story_analytics)                               <- derived
 *   3. cache        (Redis, via the Cache facade)                   <- derived
 *
 * Postgres is authoritative at every step. The rollup is recomputed by
 * aggregate rather than incremented, because an increment that runs twice is
 * wrong forever while a recount is self-healing - so a retried request, a
 * double-delivered queue job or a crash between steps converges instead of
 * drifting. Redis only ever holds a copy of step 2 and is dropped on every
 * write, so it can never be the thing that remembers a count.
 *
 * ── Uniqueness ──────────────────────────────────────────────────────────────
 *
 * One user = one view per story, enforced by UNIQUE(story_id, viewer_id) in the
 * database, not by a check in this class. Concurrency (two tabs, phone +
 * laptop, a double-tap) is arbitrated by the constraint: the insert either wins
 * or is ignored, and the loser takes the rewatch path. Nothing here reads then
 * writes, so there is no window to lose a race in.
 */
class StoryAnalyticsService
{
    /** Where a view came from. Unknown values are stored as null, not rejected. */
    public const PLATFORMS = ['ios', 'android', 'web', 'mobile_web', 'desktop_web'];

    /** How a story was shared. */
    public const SHARE_CHANNELS = ['dm', 'copy_link', 'external', 'repost'];

    /**
     * The supported reaction set.
     *
     * Unchanged from what the clients already send and store - widening it would
     * orphan existing rows and ship emoji neither UI can draw. Kept here so the
     * validation rule, the breakdown and both clients read one list.
     */
    public const REACTIONS = ['heart', 'fire', 'wow', 'haha', 'sad'];

    /** Short by design: the rollup is cheap to rebuild and staleness is visible. */
    private const CACHE_TTL = 30;

    /* ── writes ─────────────────────────────────────────────────────────── */

    /**
     * Record that $viewerId watched $story.
     *
     * Returns whether this was the viewer's FIRST view, which is what gates the
     * owner's realtime nudge - a rewatch must not re-announce.
     *
     * @param  array{platform?:?string,device?:?string,session_id?:?string,watch_duration?:int,completed?:bool,slide_index?:int,story_media_id?:?int}  $ctx
     */
    public function recordView(Story $story, int $viewerId, array $ctx = []): bool
    {
        // The owner is never a viewer of their own story.
        if ($viewerId === (int) $story->user_id) {
            return false;
        }

        $platform  = $this->normalisePlatform($ctx['platform'] ?? null);
        $device    = $this->trim($ctx['device'] ?? null, 120);
        $session   = $this->trim($ctx['session_id'] ?? null, 64);
        $duration  = max(0, (int) ($ctx['watch_duration'] ?? 0));
        $completed = (bool) ($ctx['completed'] ?? false);
        $now       = now();

        // Step 1a: claim the unique-viewer row. insertOrIgnore is atomic against
        // UNIQUE(story_id, viewer_id) - it returns 1 only for the row that won,
        // so concurrent first-views from two devices produce exactly one insert
        // and one rewatch, with no read-then-write window between them.
        $isFirstView = DB::table('story_views')->insertOrIgnore([
            'story_id'       => $story->id,
            'viewer_id'      => $viewerId,
            'story_owner_id' => $story->user_id,
            'platform'       => $platform,
            'device'         => $device,
            'session_id'     => $session,
            'view_events'    => 1,
            'watch_duration' => $duration,
            'completed'      => $completed,
            'viewed_at'      => $now,
            'last_viewed_at' => $now,
        ]) > 0;

        /* A progress report, not a new watch.
           A client can only measure how long a slide was watched once the
           viewer has left it, which means a second call after the one that
           recorded the view. Without a way to say so, that second call would
           read as a rewatch and double every viewer's event count. The flag
           says "accumulate what I measured, do not count this as another
           watch" - and it only ever suppresses counting, never the view
           itself: if no row exists yet (the first call was lost) this still
           falls through to the insert above and the view is recorded. */
        $progressOnly = ! $isFirstView && ! empty($ctx['progress_only']);

        if ($progressOnly) {
            DB::table('story_views')
                ->where('story_id', $story->id)
                ->where('viewer_id', $viewerId)
                ->update([
                    'watch_duration' => DB::raw('watch_duration + ' . $duration),
                    'completed'      => DB::raw($completed ? $this->trueLiteral() : 'completed'),
                    'last_viewed_at' => $now,
                ]);

            // Fold the measurement into the event row this progress belongs to,
            // rather than appending a second event for the same watch.
            $latestEventId = DB::table('story_view_events')
                ->where('story_id', $story->id)
                ->where('viewer_id', $viewerId)
                ->orderByDesc('id')
                ->value('id');

            if ($latestEventId) {
                DB::table('story_view_events')->where('id', $latestEventId)->update([
                    'watch_duration' => DB::raw('watch_duration + ' . $duration),
                    'completed'      => DB::raw($completed ? $this->trueLiteral() : 'completed'),
                ]);
            }

            $this->refresh($story);

            return false;
        }

        // Step 1b: a rewatch. Accumulate onto the row that already exists rather
        // than inserting a second one - this is what keeps the unique viewer
        // count at 1 no matter how many times they watch.
        if (! $isFirstView) {
            DB::table('story_views')
                ->where('story_id', $story->id)
                ->where('viewer_id', $viewerId)
                ->update([
                    'view_events'    => DB::raw('view_events + 1'),
                    'watch_duration' => DB::raw('watch_duration + ' . $duration),
                    // Sticky: having once watched it through is not undone by a
                    // later partial rewatch.
                    'completed'      => DB::raw($completed ? $this->trueLiteral() : 'completed'),
                    'last_viewed_at' => $now,
                    // Backfill only. A known platform is never overwritten with
                    // null by a client that omitted it.
                    'platform'       => DB::raw($platform === null ? 'platform' : 'COALESCE(platform, ' . $this->quote($platform) . ')'),
                    'story_owner_id' => DB::raw('COALESCE(story_owner_id, ' . (int) $story->user_id . ')'),
                ]);
        }

        // Step 1c: the append-only event, written on EVERY watch including
        // rewatches. This is the only place total-view-events and drop-off come
        // from, so it must not be gated on $isFirstView.
        DB::table('story_view_events')->insert([
            'story_id'       => $story->id,
            'viewer_id'      => $viewerId,
            'story_owner_id' => $story->user_id,
            'story_media_id' => $ctx['story_media_id'] ?? null,
            'slide_index'    => max(0, (int) ($ctx['slide_index'] ?? 0)),
            'platform'       => $platform,
            'device'         => $device,
            'session_id'     => $session,
            'watch_duration' => $duration,
            'completed'      => $completed,
            'created_at'     => $now,
        ]);

        $this->refresh($story);

        return $isFirstView;
    }

    /**
     * Set or replace a viewer's reaction. Returns true when this created a new
     * reaction rather than swapping an existing one.
     */
    public function setReaction(Story $story, int $userId, string $reactionType): bool
    {
        $existed = DB::table('story_reactions')
            ->where('story_id', $story->id)->where('user_id', $userId)->exists();

        // UNIQUE(story_id, user_id) makes this a swap, never a second row - so
        // ❤️ then 😂 leaves one reaction, not two.
        DB::table('story_reactions')->upsert(
            [[
                'story_id'      => $story->id,
                'user_id'       => $userId,
                'reaction_type' => $reactionType,
                'created_at'    => now(),
            ]],
            ['story_id', 'user_id'],
            ['reaction_type', 'created_at'],
        );

        $this->refresh($story);

        return ! $existed;
    }

    /** Remove a viewer's reaction. Returns true if there was one to remove. */
    public function removeReaction(Story $story, int $userId): bool
    {
        $deleted = DB::table('story_reactions')
            ->where('story_id', $story->id)
            ->where('user_id', $userId)
            ->delete() > 0;

        if ($deleted) {
            $this->refresh($story);
        }

        return $deleted;
    }

    /**
     * Record a share. Unlike a view this is an EVENT, not a state - sharing the
     * same story to three people is three shares, so there is no dedupe here.
     */
    public function recordShare(Story $story, int $sharerId, string $channel, ?int $targetUserId = null, ?string $platform = null): void
    {
        DB::table('story_shares')->insert([
            'story_id'       => $story->id,
            'sharer_id'      => $sharerId,
            'story_owner_id' => $story->user_id,
            'channel'        => in_array($channel, self::SHARE_CHANNELS, true) ? $channel : 'copy_link',
            'target_user_id' => $targetUserId,
            'platform'       => $this->normalisePlatform($platform),
            'created_at'     => now(),
        ]);

        $this->refresh($story);
    }

    /* ── reads ──────────────────────────────────────────────────────────── */

    /**
     * The owner-facing counters. Read-through cache over the rollup, which is
     * itself derived from the source tables - so a cache miss costs one indexed
     * row read, not five aggregates.
     *
     * @return array<string,mixed>
     */
    public function analytics(Story $story): array
    {
        return Cache::remember($this->cacheKey($story->id), self::CACHE_TTL, function () use ($story) {
            $row = DB::table('story_analytics')->where('story_id', $story->id)->first();

            // No rollup yet (a story whose first view predates this system, or
            // one nothing has happened to). Compute it now rather than
            // reporting zeros that would look like lost data.
            if (! $row) {
                return $this->recompute($story->id, (int) $story->user_id);
            }

            return $this->shape($row);
        });
    }

    /**
     * Recompute one story's rollup from the source tables and persist it.
     *
     * This is the self-healing path: it never trusts the previous rollup value,
     * so running it twice, or after a crash, or out of order, converges on the
     * same answer.
     *
     * @return array<string,mixed>
     */
    public function recompute(int $storyId, ?int $ownerId = null): array
    {
        $ownerId ??= (int) DB::table('stories')->where('id', $storyId)->value('user_id');

        // Unique viewers and the internal aggregates come from the same table
        // in one pass: COUNT(*) is the deduplicated headline, SUM(view_events)
        // is the total including rewatches. Reading both here is what stops the
        // two ever being confused at the call site.
        $views = DB::table('story_views')
            ->where('story_id', $storyId)
            ->where('viewer_id', '!=', $ownerId)
            ->selectRaw('COUNT(*) AS unique_viewers')
            ->selectRaw('COALESCE(SUM(view_events), 0) AS total_view_events')
            ->selectRaw('COALESCE(SUM(watch_duration), 0) AS total_watch_seconds')
            // CASE rather than COUNT(*) FILTER: FILTER needs SQLite 3.30+, and
            // the test database is whatever SQLite the running PHP was built
            // against. CASE WHEN on a bare boolean is valid on both engines -
            // Postgres takes the boolean directly, SQLite reads the 0/1 it
            // stores - whereas `completed = true` is a Postgres-only spelling.
            ->selectRaw('COALESCE(SUM(CASE WHEN completed THEN 1 ELSE 0 END), 0) AS completion_count')
            ->first();

        $reactionRows = DB::table('story_reactions')
            ->where('story_id', $storyId)
            ->where('user_id', '!=', $ownerId)
            ->groupBy('reaction_type')
            ->selectRaw('reaction_type, COUNT(*) AS c')
            ->pluck('c', 'reaction_type');

        $breakdown = [];
        foreach (self::REACTIONS as $type) {
            $breakdown[$type] = (int) ($reactionRows[$type] ?? 0);
        }

        $replyCount = (int) DB::table('story_messages')
            ->where('story_id', $storyId)
            ->where('sender_id', '!=', $ownerId)
            ->distinct()->count('sender_id');

        $shareCount = (int) DB::table('story_shares')->where('story_id', $storyId)->count();

        $payload = [
            'story_owner_id'      => $ownerId,
            'unique_viewers'      => (int) ($views->unique_viewers ?? 0),
            'total_view_events'   => (int) ($views->total_view_events ?? 0),
            'total_watch_seconds' => (int) ($views->total_watch_seconds ?? 0),
            'completion_count'    => (int) ($views->completion_count ?? 0),
            'reaction_count'      => array_sum($breakdown),
            'reply_count'         => $replyCount,
            'share_count'         => $shareCount,
            'reactions_breakdown' => json_encode($breakdown),
            'recomputed_at'       => now(),
            'updated_at'          => now(),
        ];

        // Upsert on the unique story_id: two concurrent recomputes both write
        // the same recomputed answer, so whichever lands last is still correct.
        DB::table('story_analytics')->upsert(
            [array_merge(['story_id' => $storyId, 'created_at' => now()], $payload)],
            ['story_id'],
            array_keys($payload),
        );

        return $this->shape((object) array_merge($payload, ['story_id' => $storyId]));
    }

    /** Drop the cached copy so the next read reflects the write that just landed. */
    public function forget(int $storyId): void
    {
        Cache::forget($this->cacheKey($storyId));
    }

    /* ── internals ──────────────────────────────────────────────────────── */

    /**
     * Recompute the rollup, then invalidate the cache. Never the other way
     * round - dropping the cache first would let a concurrent read repopulate
     * it from the OLD rollup and pin the stale value for the full TTL.
     *
     * Public because replies are written by StoryController::reply (they create
     * a DM and a story_messages row together, which is not this class's job)
     * and still have to move the reply counter.
     */
    public function refresh(Story $story): void
    {
        $this->recompute((int) $story->id, (int) $story->user_id);
        $this->forget((int) $story->id);
    }

    /**
     * One response shape for every caller, so web and mobile cannot drift.
     *
     * @return array<string,mixed>
     */
    private function shape(object $row): array
    {
        $breakdown = $row->reactions_breakdown ?? null;
        if (is_string($breakdown)) {
            $breakdown = json_decode($breakdown, true);
        }
        $breakdown = is_array($breakdown) ? $breakdown : [];

        // Always report every supported type, including the zeroes - a client
        // rendering a breakdown should not have to guess which keys exist.
        $full = [];
        foreach (self::REACTIONS as $type) {
            $full[$type] = (int) ($breakdown[$type] ?? 0);
        }

        $unique = (int) ($row->unique_viewers ?? 0);
        $events = (int) ($row->total_view_events ?? 0);

        return [
            // THE headline number. Unique viewers, never total events.
            'unique_viewers'      => $unique,
            'reaction_count'      => (int) ($row->reaction_count ?? 0),
            'reply_count'         => (int) ($row->reply_count ?? 0),
            'share_count'         => (int) ($row->share_count ?? 0),
            'reactions_breakdown' => $full,

            // Internal analytics, kept under a separate key so no client can
            // mistake a rewatch-inflated number for the viewer count.
            'total_view_events'   => $events,
            'completion_count'    => (int) ($row->completion_count ?? 0),
            'total_watch_seconds' => (int) ($row->total_watch_seconds ?? 0),
            // Guarded: 0 viewers is the normal state of a new story, and 0/0
            // would serialise as NaN.
            'avg_watch_seconds'   => $unique > 0 ? round(((int) ($row->total_watch_seconds ?? 0)) / $unique, 1) : 0.0,
            'completion_rate'     => $unique > 0 ? round(((int) ($row->completion_count ?? 0)) / $unique * 100, 1) : 0.0,
        ];
    }

    private function cacheKey(int $storyId): string
    {
        return "story:analytics:{$storyId}";
    }

    private function normalisePlatform(?string $p): ?string
    {
        $p = is_string($p) ? strtolower(trim($p)) : null;

        return in_array($p, self::PLATFORMS, true) ? $p : null;
    }

    private function trim(?string $v, int $max): ?string
    {
        $v = is_string($v) ? trim($v) : null;

        return ($v === null || $v === '') ? null : mb_substr($v, 0, $max);
    }

    /** SQLite has no true/false literal in older grammars; both accept 1. */
    private function trueLiteral(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? 'true' : '1';
    }

    private function quote(string $v): string
    {
        return DB::connection()->getPdo()->quote($v);
    }
}
