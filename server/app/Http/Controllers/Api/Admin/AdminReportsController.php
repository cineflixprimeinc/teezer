<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\CommentReport;
use App\Models\Conversation;
use App\Models\ContentReport;
use App\Models\LiveStream;
use App\Models\Space;
use App\Models\StoryReport;
use App\Models\AppNotification;
use App\Models\Story;
use App\Models\User;
use App\Models\UserReport;
use App\Models\Video;
use App\Models\VideoComment;
use App\Models\VideoReport;
use App\Services\MediaPresignService;
use App\Services\StorageService;
use App\Jobs\TranscodeVideoToHls;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * One admin review queue over every report type in the app.
 *
 * video/comment/story reports each have their own table + model (built
 * separately, over time, before there was a shared shape); user/
 * conversation/live_stream/space reports all share one newer table,
 * ContentReport, keyed by reportable_type. Both are queried here rather
 * than migrating the older three onto the newer table - see
 * ContentReport's own migration comment for why.
 *
 * `type=user` used to read UserReport - a table with admin review wiring
 * but, per the codebase's own audit, NO create path anywhere (nothing
 * ever called UserReport::create), so that tab was permanently empty in
 * production. It now reads ContentReport (reportable_type='user') instead,
 * which BlockController::report() actually writes to - a pure fix, not a
 * behavior change anyone was relying on.
 */
class AdminReportsController extends Controller
{
    /** Types backed by their own table + Eloquent model. */
    private const LEGACY_TYPES = ['video', 'comment', 'story'];

    /** Types backed by the shared ContentReport table. */
    private const CONTENT_TYPES = ['user', 'conversation', 'live_stream', 'space'];

    public function index(Request $request, StorageService $storage): JsonResponse
    {
        $type   = $request->get('type', 'video');
        $status = $request->get('status', 'pending');

        $query = $this->baseQuery($type);

        if ($status !== 'all') {
            $query->where('status', $status);
        }
        if ($reason = $request->get('reason')) {
            $query->where('reason', $reason);
        }
        if ($q = $request->get('q')) {
            $this->applySearch($query, $type, $q);
        }
        if ($from = $request->get('from')) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->get('to')) {
            $query->whereDate('created_at', '<=', $to);
        }

        $paginator = $query->orderByDesc(in_array($type, self::CONTENT_TYPES, true) ? 'created_at' : 'created_at')
            ->paginate((int) $request->get('per_page', 20));

        $items = collect($paginator->items())
            ->map(fn ($r) => $this->withMedia($this->withEvidence($this->withTarget($r, $type), $storage), $type))
            ->all();

        return response()->json([
            'success' => true,
            'data'    => $items,
            'meta'    => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    public function show(int $id, Request $request, StorageService $storage): JsonResponse
    {
        $type   = $request->get('type', 'video');
        $report = $this->baseQuery($type)->findOrFail($id);

        return response()->json([
            'success' => true,
            'data'    => $this->withMedia($this->withEvidence($this->withTarget($report, $type), $storage), $type),
        ]);
    }

    public function action(Request $request, int $id, StorageService $storage): JsonResponse
    {
        $request->validate([
            'action' => ['required', 'in:dismiss,warn,remove,permanent_delete,ban'],
            'type'   => ['nullable', 'in:video,comment,story,user,conversation,live_stream,space'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $type   = $request->get('type', 'video');
        $action = $request->action;

        $report = $this->baseQuery($type, forAction: true)->findOrFail($id);

        $report->update([
            'status'      => $action === 'dismiss' ? 'dismissed' : 'actioned',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        // Soft removal - reversible by an admin, the content's row still
        // exists. Comment has no soft-delete wired here (only is_hidden);
        // that's the existing, unchanged behavior - see permanent_delete
        // below for comment's first REAL delete path.
        if ($action === 'remove' && $type === 'video' && isset($report->video)) {
            $report->video->delete();
            $this->notifyOwner($report->video->user, 'video', 'remove');
        }
        if ($action === 'remove' && $type === 'comment' && isset($report->comment)) {
            $report->comment->update(['is_hidden' => true]);
            $this->notifyOwner($report->comment->user, 'comment', 'remove');
        }
        if ($action === 'remove' && $type === 'story' && isset($report->story)) {
            $report->story->delete();
            $this->notifyOwner($report->story->user, 'story', 'remove');
        }

        // Permanent removal - forceDelete()s the row and purges its storage
        // objects (video: HLS + renditions + carousel items, matching
        // AdminVideoController::permanentDelete's own purge exactly;
        // comment/story: their attached media, which had no delete path of
        // any kind before this - only video ever had one, and only from a
        // different controller the Reported page never called). Only
        // offered for REMOVABLE types; user/conversation/live_stream/space
        // have no single deletable object.
        if ($action === 'permanent_delete') {
            if ($type === 'video' && isset($report->video)) {
                $owner = $report->video->user;
                $this->permanentlyDeleteVideo($report->video->id, $storage);
                $this->notifyOwner($owner, 'video', 'permanent_delete');
            }
            if ($type === 'comment' && isset($report->comment)) {
                $owner = $report->comment->user;
                $this->permanentlyDeleteComment($report->comment->id, $storage);
                $this->notifyOwner($owner, 'comment', 'permanent_delete');
            }
            if ($type === 'story' && isset($report->story)) {
                $owner = $report->story->user;
                $this->permanentlyDeleteStory($report->story->id, $storage);
                $this->notifyOwner($owner, 'story', 'permanent_delete');
            }
        }

        if ($action === 'ban') {
            $target = match ($type) {
                'video'   => $report->video?->user,
                'comment' => $report->comment?->user,
                'story'   => $report->story?->user,
                'user'    => User::find($report->reportable_id),
                default   => null, // conversation/live_stream/space have no single "owner" to ban
            };
            if ($target) {
                $target->forceFill(['is_banned' => true, 'ban_reason' => $request->reason ?? 'Banned via report action'])->save();
                $target->tokens()->delete();
            }
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: "report_{$action}",
            target: $report,
            description: "Actioned report #{$id}: {$action}",
            metadata: ['report_id' => $id, 'type' => $type, 'reason' => $request->reason],
        );

        return response()->json(['success' => true, 'message' => 'Report actioned.']);
    }

    public function stats(): JsonResponse
    {
        $statusCounts = fn (callable $countFor) => [
            'pending'   => $countFor('pending'),
            'reviewed'  => $countFor('reviewed'),
            'actioned'  => $countFor('actioned'),
            'dismissed' => $countFor('dismissed'),
            'total'     => $countFor(null),
        ];

        $videoReports   = $statusCounts(fn ($s) => $s ? VideoReport::where('status', $s)->count() : VideoReport::count());
        $commentReports = $statusCounts(fn ($s) => $s ? CommentReport::where('status', $s)->count() : CommentReport::count());
        $storyReports   = $statusCounts(fn ($s) => $s ? StoryReport::where('status', $s)->count() : StoryReport::count());
        $contentReports = collect(self::CONTENT_TYPES)->mapWithKeys(fn ($t) => [
            $t => $statusCounts(fn ($s) => $s
                ? ContentReport::type($t)->where('status', $s)->count()
                : ContentReport::type($t)->count()),
        ]);

        // One combined "Total Reports" / "Pending Review" / etc across every
        // type, so the dashboard's headline cards don't have to know there
        // are 7 underlying tables/scopes behind them.
        $overall = collect([$videoReports, $commentReports, $storyReports, ...$contentReports->values()])
            ->reduce(fn ($carry, $bucket) => [
                'pending'   => $carry['pending']   + $bucket['pending'],
                'reviewed'  => $carry['reviewed']  + $bucket['reviewed'],
                'actioned'  => $carry['actioned']  + $bucket['actioned'],
                'dismissed' => $carry['dismissed'] + $bucket['dismissed'],
                'total'     => $carry['total']     + $bucket['total'],
            ], ['pending' => 0, 'reviewed' => 0, 'actioned' => 0, 'dismissed' => 0, 'total' => 0]);

        // Trend/sparkline data: one pull of every report's {status, created_at}
        // from the last 60 days, reused for both the 14-day daily series and
        // the 30-vs-previous-30-days delta - see trendFor().
        $since60 = now()->subDays(60)->startOfDay();
        $recent  = collect();
        foreach ([VideoReport::class, CommentReport::class, StoryReport::class] as $model) {
            $recent = $recent->concat($model::where('created_at', '>=', $since60)->get(['status', 'created_at']));
        }
        foreach (self::CONTENT_TYPES as $t) {
            $recent = $recent->concat(
                ContentReport::type($t)->where('created_at', '>=', $since60)->get(['status', 'created_at'])
            );
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'overall' => $overall,
                'trend'   => [
                    'total'     => $this->trendFor($recent),
                    'pending'   => $this->trendFor($recent->where('status', 'pending')),
                    'actioned'  => $this->trendFor($recent->where('status', 'actioned')),
                    'dismissed' => $this->trendFor($recent->where('status', 'dismissed')),
                ],
                'video_reports'   => $videoReports,
                'comment_reports' => $commentReports,
                'story_reports'   => $storyReports,
                'content_reports' => $contentReports->all(),
                'by_reason'       => VideoReport::selectRaw('reason, count(*) as count')
                    ->groupBy('reason')
                    ->pluck('count', 'reason'),
            ],
        ]);
    }

    /**
     * A 14-day daily count series (for a sparkline) plus the percentage
     * change between the trailing 30 days and the 30 days before that, from
     * one already-fetched collection of {status, created_at} rows - see
     * stats(), which pulls each bucket once and reuses it here rather than
     * re-querying per card.
     *
     * `created_at` is normalised through Carbon::parse() rather than trusted
     * as already-cast: VideoReport sets `$timestamps = false` and casts
     * `reviewed_at` but not `created_at`, so it comes back a raw string
     * there while every other report model hands back a Carbon instance.
     */
    private function trendFor($rows): array
    {
        $at = fn ($r) => $r->created_at instanceof \Carbon\Carbon ? $r->created_at : \Carbon\Carbon::parse($r->created_at);

        $days   = collect(range(13, 0))->map(fn ($i) => now()->subDays($i)->toDateString());
        $byDay  = $rows->groupBy(fn ($r) => $at($r)->toDateString());
        $series = $days->map(fn ($d) => $byDay->get($d, collect())->count())->values();

        $last30 = $rows->filter(fn ($r) => $at($r)->gte(now()->subDays(30)))->count();
        $prev30 = $rows->filter(
            fn ($r) => $at($r)->lt(now()->subDays(30)) && $at($r)->gte(now()->subDays(60))
        )->count();
        $deltaPct = $prev30 > 0 ? round((($last30 - $prev30) / $prev30) * 100, 1) : ($last30 > 0 ? 100.0 : 0.0);

        return ['series' => $series, 'delta_pct' => $deltaPct];
    }

    /* ── Internals ─────────────────────────────────────────────────────── */

    /** Columns for a content owner, once loaded as far as the account-actions
     *  panel in the admin UI (Ban/Suspend/Warn/Restrict) needs to know both
     *  who they are and their current banned/active state. */
    private const OWNER_COLUMNS = 'id,name,username,avatar,is_banned,is_active';

    private function baseQuery(string $type, bool $forAction = false)
    {
        return match ($type) {
            // comment.user/story.user are loaded unconditionally now, not just
            // for forAction=true: the admin detail panel shows and can act on
            // the content owner's account for every report, not only when
            // action() itself needs to resolve a ban target.
            //
            // comment/story/video are all withTrashed(): VideoComment, Story
            // and Video all use SoftDeletes, and belongsTo excludes trashed
            // rows by default - so a comment/story/video that was deleted
            // AFTER being reported (including by this exact controller's own
            // "Remove content" action, which soft-deletes) came back as a
            // silent null and rendered as "(no text)" / "Untitled" with no
            // indication the content had ever existed. A review tool needs to
            // show what was actually reported, deleted or not - that's often
            // the whole point of the review. `deleted_at` is selected so the
            // admin UI can say so.
            'comment' => CommentReport::with([
                'reporter:id,name,username,avatar',
                'comment' => fn ($q) => $q->withTrashed()->select(['id', 'body', 'video_id', 'user_id', 'deleted_at']),
                'comment.user:' . self::OWNER_COLUMNS,
            ]),
            'story' => StoryReport::with([
                'reporter:id,name,username,avatar',
                'story' => fn ($q) => $q->withTrashed()->select(['id', 'user_id', 'status', 'deleted_at']),
                'story.user:' . self::OWNER_COLUMNS,
            ]),
            'user', 'conversation', 'live_stream', 'space' => ContentReport::type($type)
                ->with('reporter:id,name,username,avatar'),
            default => VideoReport::with([
                'reporter:id,name,username,avatar',
                'video' => fn ($q) => $q->withTrashed()->select([
                    'id', 'title', 'caption', 'thumbnail_url', 'user_id', 'status',
                    'views_count', 'likes_count', 'comments_count', 'deleted_at',
                ]),
                'video.user:' . self::OWNER_COLUMNS,
            ]),
        };
    }

    private function applySearch($query, string $type, string $q): void
    {
        match ($type) {
            'comment' => $query->whereHas('comment', fn ($b) => $b->where('body', 'ilike', "%{$q}%")),
            'story', 'user', 'conversation', 'live_stream', 'space' => $query->whereHas(
                'reporter',
                fn ($b) => $b->where('username', 'ilike', "%{$q}%")->orWhere('name', 'ilike', "%{$q}%"),
            ),
            default => $query->whereHas('video', fn ($b) =>
                $b->where('caption', 'ilike', "%{$q}%")->orWhere('title', 'ilike', "%{$q}%")
            ),
        };
    }

    /**
     * ContentReport has no Eloquent relation to the thing it's about (see
     * the model/migration comments for why - reportable_type is a short
     * literal, not a class name morphTo could use). This resolves a small
     * display-only "target" summary for the admin list/detail view instead.
     */
    private function withTarget($report, string $type)
    {
        if (! in_array($type, self::CONTENT_TYPES, true)) {
            return $report;
        }

        $target = match ($type) {
            'user'        => User::select('id', 'name', 'username', 'avatar', 'is_banned', 'is_active')->find($report->reportable_id),
            'conversation'=> Conversation::select('id', 'user_a_id', 'user_b_id', 'status')->find($report->reportable_id),
            'live_stream' => LiveStream::select('id', 'title', 'status', 'user_id')->find($report->reportable_id),
            'space'       => Space::select('id', 'title', 'status', 'host_id')->find($report->reportable_id),
            default       => null,
        };

        $report->setAttribute('target', $target);
        return $report;
    }

    /**
     * Resolve `evidence_keys` (private-bucket storage keys, written by
     * ReportEvidenceService) into short-lived signed URLs the admin panel can
     * actually render - same pattern as AdminUser360Controller::taxFormResource()
     * for tax documents. The raw keys are never handed to the client: a private
     * bucket key is meaningless without a signature, and the point of the
     * private bucket is that it stays that way.
     */
    private function withEvidence($report, StorageService $storage)
    {
        $keys = $report->evidence_keys ?? [];

        $report->setAttribute('evidence', collect($keys)->map(fn (string $key) => [
            'key' => $key,
            'url' => rescue(fn () => $storage->temporaryUrl($key, 30), null, report: false),
        ])->filter(fn ($e) => $e['url'] !== null)->values());

        return $report;
    }

    /**
     * Resolve every raw storage key this response carries into a real,
     * loadable URL. The partial-column `with(...)` selects in baseQuery()
     * pull `avatar`/`thumbnail_url` straight off the row - the same columns
     * UserResource/VideoResource normally transform on their way out - so
     * without this the admin panel would render broken images: a bare
     * "avatars/2026/…jpg" key, not a URL. Avatars are public content
     * (Storage::url(), matching UserResource); a video thumbnail is signed
     * (MediaPresignService::signedMediaUrl(), matching VideoResource) since
     * the CDN only serves the /videos/ prefix with a valid signature.
     *
     * `thumbnail_url` is guarded with the same already-a-URL check
     * AdminApiController/AdminVideoController already use: some `videos` rows
     * hold a fully-qualified, already-signed URL in this column rather than a
     * bare key (a pre-existing data inconsistency, not introduced here).
     * Signing it again produced a doubled, broken URL -
     * "https://cdn.reelsoo.com/https://cdn.reelsoo.com/…?expires=…&token=…?expires=…&token=…"
     * - caught from a real report row (video ids 7/8) after this shipped.
     * VideoResource has the exact same gap for these two videos on the
     * live app/site; that's a wider-reaching file this fix deliberately
     * doesn't touch - flagged separately, not silently folded in here.
     */
    private function withMedia($report, string $type)
    {
        if ($report->reporter) {
            $report->reporter->setAttribute('avatar', $this->avatarUrl($report->reporter->avatar));
        }

        if ($type === 'video' && $report->video) {
            if ($report->video->thumbnail_url) {
                $report->video->setAttribute('thumbnail_url', $this->resolveMedia($report->video->thumbnail_url));
            }
            if ($report->video->user) {
                $report->video->user->setAttribute('avatar', $this->avatarUrl($report->video->user->avatar));
            }
        }

        if ($type === 'comment' && $report->comment?->user) {
            $report->comment->user->setAttribute('avatar', $this->avatarUrl($report->comment->user->avatar));
        }

        if ($type === 'story' && $report->story?->user) {
            $report->story->user->setAttribute('avatar', $this->avatarUrl($report->story->user->avatar));
        }

        if ($type === 'user' && $report->target instanceof User) {
            $report->target->setAttribute('avatar', $this->avatarUrl($report->target->avatar));
        }

        return $report;
    }

    private function avatarUrl(?string $key): string
    {
        if (! $key) {
            return StorageService::defaultAvatarUrl();
        }

        return \Illuminate\Support\Str::startsWith($key, ['http://', 'https://']) ? $key : Storage::url($key);
    }

    /** Sign a media key - unless it's already a full URL, in which case it's
     *  already resolved and re-signing it would only double it up. */
    private function resolveMedia(string $key): string
    {
        return \Illuminate\Support\Str::startsWith($key, ['http://', 'https://'])
            ? $key
            : MediaPresignService::signedMediaUrl($key, 1440);
    }

    /**
     * Tell a content owner their video/comment/story was acted on. There was
     * no "your content was removed" notification anywhere in the app before
     * this - NotificationService has a dead `report_actioned` type nobody
     * ever dispatches. Mirrors AdminUser360Controller::notify()'s pattern
     * (a direct AppNotification::create(), type 'system') since that is the
     * one proven-working precedent for an admin-triggered one-off notice -
     * it already renders correctly on both mobile and web with no further
     * changes (system-type notifications are a handled case on both).
     */
    private function notifyOwner(?User $owner, string $type, string $mode): void
    {
        if (! $owner) {
            return;
        }

        $noun = match ($type) {
            'video' => 'video', 'comment' => 'comment', 'story' => 'story', default => 'content',
        };

        $message = match (true) {
            $mode === 'permanent_delete' => "Your {$noun} was permanently removed for violating our community guidelines.",
            $type === 'comment' => 'Your comment was hidden for violating our community guidelines.',
            default => "Your {$noun} was removed for violating our community guidelines.",
        };

        AppNotification::create([
            'user_id'     => $owner->id,
            'actor_id'    => null,
            'type'        => 'system',
            'entity_type' => 'content_removed',
            'entity_id'   => $owner->id,
            'message'     => $message,
            'is_read'     => false,
        ]);
    }

    /**
     * Permanently delete a video: purge every storage object it owns, then
     * forceDelete() the row. Mirrors AdminVideoController::permanentDelete
     * exactly (same steps, same order) - duplicated rather than called
     * cross-controller since that method is private there; this is the
     * second real caller of the same pattern, not a divergent one.
     */
    private function permanentlyDeleteVideo(int $videoId, StorageService $storage): void
    {
        $video = Video::withTrashed()->find($videoId);
        if (! $video) {
            return;
        }

        TranscodeVideoToHls::deleteHlsAssets($video->id);

        foreach (array_filter([$video->video_url, $video->thumbnail_url, $video->captions_file_url ?? null]) as $key) {
            $storage->delete($key);
        }
        if (! empty($video->quality_urls) && is_array($video->quality_urls)) {
            foreach ($video->quality_urls as $key) {
                if ($key) {
                    $storage->delete($key);
                }
            }
        }
        if (! empty($video->media_items) && is_array($video->media_items)) {
            foreach ($video->media_items as $item) {
                if (! empty($item['object_key'])) {
                    $storage->delete($item['object_key']);
                }
            }
        }

        $video->forceDelete();
        \App\Services\FeedService::flushFeedCache();
    }

    /**
     * Permanently delete a comment - purges its attached photo, if any, then
     * forceDelete()s the row. No admin path deleted a comment for real
     * before this (the existing "remove" action only ever flips is_hidden).
     */
    private function permanentlyDeleteComment(int $commentId, StorageService $storage): void
    {
        $comment = VideoComment::withTrashed()->find($commentId);
        if (! $comment) {
            return;
        }

        if ($comment->image_path) {
            $storage->delete($comment->image_path);
        }

        $comment->forceDelete();
    }

    /**
     * Permanently delete a story - purges every media item it owns (photos/
     * videos + their thumbnails), then forceDelete()s the story row. No
     * admin path deleted a story for real before this either.
     */
    private function permanentlyDeleteStory(int $storyId, StorageService $storage): void
    {
        $story = Story::withTrashed()->with('media')->find($storyId);
        if (! $story) {
            return;
        }

        foreach ($story->media as $media) {
            if ($media->media_url) {
                $storage->delete($media->media_url);
            }
            if ($media->thumbnail_url) {
                $storage->delete($media->thumbnail_url);
            }
        }

        $story->media()->delete();
        $story->forceDelete();
    }
}
