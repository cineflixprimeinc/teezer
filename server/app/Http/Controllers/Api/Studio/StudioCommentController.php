<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommentResource;
use App\Http\Resources\StudioCommentResource;
use App\Models\CommentReport;
use App\Models\CommentRestrictedUser;
use App\Models\Video;
use App\Models\VideoComment;
use App\Services\MentionService;
use App\Services\NotificationService;
use App\Services\StorageService;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Creator-Studio comment inbox. Aggregates every top-level comment left on the
 * authenticated creator's content and exposes the moderation actions surfaced
 * in the Studio "Comments" page (reply, pin, hide, spam, hold, restrict, note,
 * delete + bulk variants).
 *
 * Every action is scoped so a creator can only ever touch comments on their own
 * videos; admins may act on any comment.
 */
class StudioCommentController extends Controller
{
    public function __construct(
        private readonly NotificationService $notifs,
        private readonly MentionService      $mentions,
    ) {}

    /* ── GET /studio/comments ───────────────────────────────────────────── */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status'     => ['nullable', 'in:all,unread,needs_reply,replied,held,spam'],
            'sort'       => ['nullable', 'in:top,newest,oldest,most_liked,most_replied'],
            'content_id' => ['nullable', 'integer'],
            'search'     => ['nullable', 'string', 'max:200'],
            'per_page'   => ['nullable', 'integer', 'min:5', 'max:50'],
            'page'       => ['nullable', 'integer', 'min:1'],
            'start_date' => ['nullable', 'date'],
            'end_date'   => ['nullable', 'date'],
        ]);

        $creatorId = (int) $request->user()->id;
        StudioCommentResource::$creatorId = $creatorId;

        $query = $this->baseQuery($request, $creatorId)
            ->with(['user', 'video'])
            ->select('video_comments.*')
            ->selectSub($this->creatorReplyCountSub($creatorId), 'creator_reply_count')
            ->selectSub($this->pendingReportCountSub(), 'pending_report_count')
            // The creator's own love/dislike, so a card's heart shows its real
            // state instead of starting empty until it is tapped.
            ->selectSub($this->viewerReactionSub($creatorId), 'viewer_reaction');

        $this->applyStatusFilter($query, $request->input('status', 'all'), $creatorId);

        match ($request->input('sort', 'top')) {
            'newest'       => $query->orderByDesc('video_comments.created_at'),
            'oldest'       => $query->orderBy('video_comments.created_at'),
            'most_liked'   => $query->orderByDesc('video_comments.likes_count'),
            'most_replied' => $query->orderByDesc('video_comments.reply_count'),
            default        => $query->orderByDesc('video_comments.reaction_score')
                                    ->orderByDesc('video_comments.created_at'),
        };

        $perPage  = (int) $request->input('per_page', 20);
        $comments = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => StudioCommentResource::collection($comments),
            'meta'    => [
                'current_page' => $comments->currentPage(),
                'last_page'    => $comments->lastPage(),
                'per_page'     => $comments->perPage(),
                'total'        => $comments->total(),
                'from'         => $comments->firstItem(),
                'to'           => $comments->lastItem(),
            ],
        ]);
    }

    /* ── GET /studio/comments/stats ─────────────────────────────────────── */
    public function stats(Request $request): JsonResponse
    {
        $request->validate([
            'content_id' => ['nullable', 'integer'],
            // Declared so the counters can follow a search: baseQuery() already
            // applies it, and without it here the chips would report inbox-wide
            // totals next to a filtered list.
            'search'     => ['nullable', 'string', 'max:200'],
            'start_date' => ['nullable', 'date'],
            'end_date'   => ['nullable', 'date'],
        ]);

        $creatorId = (int) $request->user()->id;

        $count = fn (string $status): int =>
            (int) $this->applyStatusFilter($this->baseQuery($request, $creatorId), $status, $creatorId)->count();

        $all     = $count('all');
        $prev7d  = (int) $this->baseQuery($request, $creatorId)
            ->whereBetween('video_comments.created_at', [now()->subDays(14), now()->subDays(7)])
            ->count();
        $last7d  = (int) $this->baseQuery($request, $creatorId)
            ->where('video_comments.created_at', '>=', now()->subDays(7))
            ->count();

        $trend = $prev7d > 0
            ? round((($last7d - $prev7d) / $prev7d) * 100, 1)
            : ($last7d > 0 ? 100.0 : 0.0);

        return response()->json([
            'success' => true,
            'data'    => [
                'all'         => $all,
                'unread'      => $count('unread'),
                'needs_reply' => $count('needs_reply'),
                'replied'     => $count('replied'),
                'held'        => $count('held'),
                'spam'        => $count('spam'),
                'trend_7d'    => $trend,
                /** Hours between a comment landing and the creator's FIRST
                 *  reply to it, averaged over the last 30 days. Null when
                 *  nothing has been answered in that window - the client shows
                 *  a dash rather than inventing a zero. */
                'avg_response_hours' => $this->avgResponseHours($creatorId),
            ],
        ]);
    }

    /**
     * Mean first-response time in hours, last 30 days.
     *
     * Grouped to the FIRST reply per thread before averaging - averaging every
     * reply would let one chatty thread drag the figure around, and the number
     * people mean by "response time" is how long the commenter waited.
     */
    private function avgResponseHours(int $creatorId): ?float
    {
        $firstReply = DB::table('video_comments as rep')
            ->selectRaw('rep.root_id, MIN(rep.created_at) AS first_reply_at')
            ->where('rep.user_id', $creatorId)
            ->whereNull('rep.deleted_at')
            ->whereNotNull('rep.root_id')
            ->groupBy('rep.root_id');

        $seconds = DB::table('video_comments as root')
            ->joinSub($firstReply, 'fr', fn ($j) => $j->on('fr.root_id', '=', 'root.id'))
            ->whereNull('root.parent_id')
            ->whereNull('root.deleted_at')
            ->where('root.user_id', '!=', $creatorId)
            ->where('root.created_at', '>=', now()->subDays(30))
            ->whereExists(function ($q) use ($creatorId) {
                $q->select(DB::raw(1))->from('videos')
                  ->whereColumn('videos.id', 'root.video_id')
                  ->where('videos.user_id', $creatorId)
                  ->whereNull('videos.deleted_at');
            })
            ->selectRaw('AVG(EXTRACT(EPOCH FROM (fr.first_reply_at - root.created_at))) AS s')
            ->value('s');

        return $seconds === null ? null : round(((float) $seconds) / 3600, 1);
    }

    /* ── GET /studio/comments/contents ──────────────────────────────────── */
    /**
     * The creator's content, one row per post that has at least one top-level
     * comment, each carrying the counts the Studio Comments page groups by.
     *
     * `id`, `title` and `comments_count` are unchanged - the website's "All
     * Content" filter reads exactly those three and is unaffected by the rest.
     *
     * Everything added here is aggregated over the SAME rows `index()` lists
     * (top-level comments on the creator's live content), so a card's counts
     * always agree with the thread you get when you open it.
     */
    public function contents(Request $request): JsonResponse
    {
        $creatorId = (int) $request->user()->id;

        // The two correlated predicates the inbox status already turns on,
        // written out so they can sit inside a conditional aggregate.
        $pendingReport  = "EXISTS (SELECT 1 FROM comment_reports rp"
                        . " WHERE rp.comment_id = video_comments.id AND rp.status = 'pending')";
        $creatorReplied = "EXISTS (SELECT 1 FROM video_comments cr"
                        . " WHERE cr.root_id = video_comments.id AND cr.user_id = ? AND cr.deleted_at IS NULL)";

        // "Flagged" matches the FLAGGED badge on a comment card exactly.
        $flagged = "video_comments.is_spam = true"
                 . " OR video_comments.held_for_review = true"
                 . " OR {$pendingReport}";

        // "Unreplied" is unread + needs_reply: nobody has answered it yet,
        // whether or not the creator has read it.
        $unreplied = "video_comments.is_spam = false"
                   . " AND video_comments.held_for_review = false"
                   . " AND NOT ({$pendingReport})"
                   . " AND video_comments.user_id <> ?"
                   . " AND NOT ({$creatorReplied})";

        $agg = VideoComment::query()
            ->whereNull('video_comments.parent_id')
            ->whereExists(function ($q) use ($creatorId) {
                $q->select(DB::raw(1))->from('videos')
                  ->whereColumn('videos.id', 'video_comments.video_id')
                  ->where('videos.user_id', $creatorId)
                  ->whereNull('videos.deleted_at');
            })
            ->groupBy('video_comments.video_id')
            ->select('video_comments.video_id')
            ->selectRaw('COUNT(*) AS inbox_count')
            ->selectRaw("COUNT(*) FILTER (WHERE {$flagged}) AS flagged_count")
            ->selectRaw("COUNT(*) FILTER (WHERE {$unreplied}) AS unreplied_count", [$creatorId, $creatorId])
            ->selectRaw('MAX(video_comments.created_at) AS last_comment_at')
            ->orderByRaw('MAX(video_comments.created_at) DESC')
            ->limit(200)
            ->get();

        if ($agg->isEmpty()) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $videoIds = $agg->pluck('video_id')->map(fn ($i) => (int) $i)->all();

        $videos = Video::whereIn('id', $videoIds)
            ->whereNull('deleted_at')
            ->get()
            ->keyBy('id');

        // The newest top-level comment on each post, for the card's preview
        // line. MAX(id) stands in for "newest" - ids are monotonic here.
        $previews = VideoComment::with('user:id,name,username,avatar')
            ->whereIn('id', function ($q) use ($videoIds) {
                $q->selectRaw('MAX(id)')->from('video_comments')
                  ->whereIn('video_id', $videoIds)
                  ->whereNull('parent_id')
                  ->whereNull('deleted_at')
                  ->groupBy('video_id');
            })
            ->get()
            ->keyBy('video_id');

        $disk = config('filesystems.default', 'r2');

        $data = $agg->map(function ($row) use ($videos, $previews, $disk) {
            $video = $videos->get((int) $row->video_id);
            if (!$video) return null; // deleted between the two queries

            $preview = $previews->get((int) $row->video_id);

            return [
                // Unchanged - the website's content filter reads these three.
                'id'              => (int) $video->id,
                'title'           => $video->title ?: ($video->caption ?: 'Untitled'),
                'comments_count'  => (int) $video->comments_count,

                'thumbnail_url'   => $this->thumbnailFor($video, $disk),
                'views_count'     => (int) ($video->views_count ?? 0),
                'created_at'      => optional($video->created_at)->toIso8601String(),
                'status'          => $video->status,

                /** Top-level comments in the inbox - what opening this card shows. */
                'inbox_count'     => (int) $row->inbox_count,
                'unreplied_count' => (int) $row->unreplied_count,
                'flagged_count'   => (int) $row->flagged_count,
                'last_comment_at' => $row->last_comment_at,

                'latest_comment'  => $preview ? [
                    'id'     => (int) $preview->id,
                    'body'   => $preview->body,
                    'name'   => $preview->user?->name ?: ($preview->user?->username ?: 'Someone'),
                    // Same resolution StudioCommentResource uses for a commenter.
                    'avatar' => $preview->user?->avatar ? Storage::url($preview->user->avatar) : StorageService::defaultAvatarUrl(),
                ] : null,
            ];
        })->filter()->values();

        return response()->json(['success' => true, 'data' => $data]);
    }

    /** Same poster-frame resolution StudioCommentResource uses. */
    private function thumbnailFor(Video $video, string $disk): ?string
    {
        if ($video->thumbnail_url) {
            return Storage::disk($disk)->url($video->thumbnail_url);
        }
        if (!empty($video->media_items) && isset($video->media_items[0]['object_key'])) {
            return Storage::disk($disk)->url($video->media_items[0]['object_key']);
        }
        if (Str::startsWith($video->mime_type ?? '', 'image/') && $video->video_url) {
            return Storage::disk($disk)->url($video->video_url);
        }
        return null;
    }

    /* ── GET /studio/comments/{id}/thread ───────────────────────────────── */
    public function thread(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $this->markSeenInternal($comment);

        CommentResource::$videoOwnerId = (int) $comment->video?->user_id;
        $rootId = $comment->root_id ?? $comment->id;

        $replies = VideoComment::with('user')
            ->where('root_id', $rootId)
            ->whereNull('deleted_at')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => CommentResource::collection($replies),
            'total'   => $replies->count(),
        ]);
    }

    /* ── POST /studio/comments/{id}/reply ───────────────────────────────── */
    public function reply(Request $request, int $id): JsonResponse
    {
        $request->validate(['body' => ['required', 'string', 'max:1000']]);

        $parent = $this->authorizedComment($request, $id);
        $video  = $parent->video;
        $user   = $request->user();

        $rootId = $parent->root_id ?? $parent->id;

        $reply = VideoComment::create([
            'video_id'  => $parent->video_id,
            'user_id'   => $user->id,
            'parent_id' => $parent->id,
            'root_id'   => $rootId,
            'body'      => $request->input('body'),
        ]);

        // The parent thread is now answered + seen by the creator.
        $parent->forceFill(['creator_seen_at' => $parent->creator_seen_at ?? now()])->save();
        $this->syncRootReplyCount($rootId);
        if ($video) $this->syncVideoCommentsCount($video);

        if ($parent->user_id !== $user->id) {
            $this->notifs->notify($parent->user, 'comment', [
                'actor_id'    => $user->id,
                'entity_type' => 'video',
                'entity_id'   => $parent->video_id,
                'comment_id'  => $reply->id,
                'message'     => NotificationService::buildMessage('comment', $user->name, [
                    'preview' => mb_substr($reply->body, 0, 60),
                ]),
            ]);
        }

        $this->mentions->processMentions($reply->body, $user, 'reply', $reply->id, $parent->video_id);

        CommentResource::$videoOwnerId = $video ? (int) $video->user_id : null;

        return response()->json([
            'success' => true,
            'data'    => new CommentResource($reply->load('user')),
        ], 201);
    }

    /* ── POST /studio/comments/{id}/seen ────────────────────────────────── */
    public function markSeen(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $this->markSeenInternal($comment);

        return response()->json(['success' => true]);
    }

    /* ── POST /studio/comments/read-all ─────────────────────────────────── */
    public function markAllSeen(Request $request): JsonResponse
    {
        $creatorId = (int) $request->user()->id;

        $updated = $this->baseQuery($request, $creatorId)
            ->whereNull('video_comments.creator_seen_at')
            ->update(['creator_seen_at' => now()]);

        return response()->json(['success' => true, 'updated' => $updated]);
    }

    /* ── POST /studio/comments/{id}/pin · /unpin ────────────────────────── */
    public function pin(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);

        if ($comment->parent_id) {
            return response()->json(['success' => false, 'message' => 'Only top-level comments can be pinned.'], 422);
        }
        if ($comment->is_pinned) {
            return response()->json(['success' => true, 'message' => 'Already pinned.']);
        }

        $maxOrder = VideoComment::where('video_id', $comment->video_id)
            ->where('is_pinned', true)->max('pin_order') ?? 0;

        $comment->update([
            'is_pinned' => true,
            'pinned_at' => now(),
            'pinned_by' => $request->user()->id,
            'pin_order' => $maxOrder + 1,
        ]);

        return response()->json(['success' => true, 'message' => 'Comment pinned.']);
    }

    public function unpin(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $comment->update(['is_pinned' => false, 'pinned_at' => null, 'pinned_by' => null, 'pin_order' => null]);

        return response()->json(['success' => true, 'message' => 'Comment unpinned.']);
    }

    /* ── POST /studio/comments/{id}/hide · /unhide ──────────────────────── */
    public function hide(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $comment->update(['is_hidden' => true]);
        if ($comment->video) $this->syncVideoCommentsCount($comment->video);

        return response()->json(['success' => true, 'message' => 'Comment hidden.']);
    }

    public function unhide(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $comment->update(['is_hidden' => false]);
        if ($comment->video) $this->syncVideoCommentsCount($comment->video);

        return response()->json(['success' => true, 'message' => 'Comment restored.']);
    }

    /* ── POST /studio/comments/{id}/spam · /unspam ──────────────────────── */
    public function spam(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $comment->update(['is_spam' => true, 'held_for_review' => false]);
        if ($comment->video) $this->syncVideoCommentsCount($comment->video);

        return response()->json(['success' => true, 'message' => 'Marked as spam.']);
    }

    public function unspam(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $comment->update(['is_spam' => false]);
        if ($comment->video) $this->syncVideoCommentsCount($comment->video);

        return response()->json(['success' => true, 'message' => 'Removed from spam.']);
    }

    /* ── POST /studio/comments/{id}/hold · /unhold ──────────────────────── */
    public function hold(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $comment->update(['held_for_review' => true]);

        return response()->json(['success' => true, 'message' => 'Held for review.']);
    }

    public function unhold(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $comment->update(['held_for_review' => false]);
        // Resolve any pending reports so it no longer counts as held.
        CommentReport::where('comment_id', $comment->id)->where('status', 'pending')
            ->update(['status' => 'reviewed', 'reviewed_at' => now(), 'reviewed_by' => $request->user()->id]);

        return response()->json(['success' => true, 'message' => 'Approved.']);
    }

    /* ── POST /studio/comments/{id}/note ────────────────────────────────── */
    public function note(Request $request, int $id): JsonResponse
    {
        $request->validate(['note' => ['nullable', 'string', 'max:1000']]);

        $comment = $this->authorizedComment($request, $id);
        $comment->update(['creator_note' => $request->input('note') ?: null]);

        return response()->json(['success' => true, 'note' => $comment->creator_note]);
    }

    /* ── POST /studio/comments/{id}/restrict · /unrestrict ──────────────── */
    public function restrict(Request $request, int $id): JsonResponse
    {
        $comment   = $this->authorizedComment($request, $id);
        $creatorId = (int) $request->user()->id;
        $targetId  = (int) $comment->user_id;

        if ($targetId === $creatorId) {
            return response()->json(['success' => false, 'message' => 'You cannot restrict yourself.'], 422);
        }

        CommentRestrictedUser::firstOrCreate(['creator_id' => $creatorId, 'user_id' => $targetId]);

        // Hide every comment this user has left across the creator's content.
        $videoIds = Video::where('user_id', $creatorId)->pluck('id');
        VideoComment::whereIn('video_id', $videoIds)->where('user_id', $targetId)
            ->update(['is_hidden' => true]);

        return response()->json(['success' => true, 'message' => 'User restricted.']);
    }

    public function unrestrict(Request $request, int $id): JsonResponse
    {
        $comment   = $this->authorizedComment($request, $id);
        $creatorId = (int) $request->user()->id;
        $targetId  = (int) $comment->user_id;

        CommentRestrictedUser::where('creator_id', $creatorId)->where('user_id', $targetId)->delete();

        $videoIds = Video::where('user_id', $creatorId)->pluck('id');
        VideoComment::whereIn('video_id', $videoIds)->where('user_id', $targetId)
            ->update(['is_hidden' => false]);

        return response()->json(['success' => true, 'message' => 'Restriction removed.']);
    }

    /* ── DELETE /studio/comments/{id} ───────────────────────────────────── */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $comment = $this->authorizedComment($request, $id);
        $video   = $comment->video;

        DB::transaction(function () use ($comment, $video) {
            $rootId = $comment->root_id;
            VideoComment::whereIn('id', $this->commentSubtreeIds($comment))->delete();
            if ($rootId) $this->syncRootReplyCount($rootId);
            if ($video)  $this->syncVideoCommentsCount($video);
        });

        return response()->json(['success' => true, 'message' => 'Comment deleted.']);
    }

    /* ── POST /studio/comments/bulk ─────────────────────────────────────── */
    public function bulk(Request $request): JsonResponse
    {
        $request->validate([
            'action' => ['required', 'in:read,spam,hide,unhide,hold,delete'],
            'ids'    => ['required', 'array', 'min:1', 'max:100'],
            'ids.*'  => ['integer'],
        ]);

        $creatorId = (int) $request->user()->id;
        $isAdmin   = $request->user()->isAdmin();
        $action    = $request->input('action');

        $comments = VideoComment::with('video')
            ->whereIn('id', array_unique($request->input('ids')))
            ->get()
            ->filter(fn ($c) => $isAdmin || (int) ($c->video?->user_id) === $creatorId);

        $videos = collect();
        foreach ($comments as $c) {
            match ($action) {
                'read'   => $c->creator_seen_at ?: $c->forceFill(['creator_seen_at' => now()])->save(),
                'spam'   => $c->update(['is_spam' => true, 'held_for_review' => false]),
                'hide'   => $c->update(['is_hidden' => true]),
                'unhide' => $c->update(['is_hidden' => false]),
                'hold'   => $c->update(['held_for_review' => true]),
                'delete' => VideoComment::whereIn('id', $this->commentSubtreeIds($c))->delete(),
            };
            if ($c->video) $videos->put($c->video->id, $c->video);
        }

        foreach ($videos as $v) $this->syncVideoCommentsCount($v);

        return response()->json([
            'success' => true,
            'message' => "{$comments->count()} comment(s) updated.",
            'count'   => $comments->count(),
        ]);
    }

    /* ════════════════════════════════════════════════════════════════════
       Internals
    ════════════════════════════════════════════════════════════════════ */

    /** Base builder: top-level comments on the creator's content + scope filters. */
    private function baseQuery(Request $request, int $creatorId): Builder
    {
        $query = VideoComment::query()
            ->whereNull('video_comments.parent_id')
            ->whereExists(function ($q) use ($creatorId) {
                $q->select(DB::raw(1))->from('videos')
                  ->whereColumn('videos.id', 'video_comments.video_id')
                  ->where('videos.user_id', $creatorId)
                  ->whereNull('videos.deleted_at');
            });

        if ($contentId = $request->input('content_id')) {
            $query->where('video_comments.video_id', (int) $contentId);
        }
        if ($search = $request->input('search')) {
            // Match the comment OR who wrote it - looking someone up by name is
            // half of what a creator searches an inbox for.
            $query->where(function ($q) use ($search) {
                $q->where('video_comments.body', 'ilike', "%{$search}%")
                  ->orWhereExists(function ($sub) use ($search) {
                      $sub->select(DB::raw(1))->from('users as su')
                          ->whereColumn('su.id', 'video_comments.user_id')
                          ->where(function ($w) use ($search) {
                              $w->where('su.name', 'ilike', "%{$search}%")
                                ->orWhere('su.username', 'ilike', "%{$search}%");
                          });
                  });
            });
        }
        if ($start = $request->input('start_date')) {
            $query->whereDate('video_comments.created_at', '>=', $start);
        }
        if ($end = $request->input('end_date')) {
            $query->whereDate('video_comments.created_at', '<=', $end);
        }

        return $query;
    }

    /** Apply the mutually-exclusive inbox status filter (mirrors badge priority). */
    private function applyStatusFilter(Builder $query, string $status, int $creatorId): Builder
    {
        $replySub  = $this->creatorReplyExists($creatorId);
        $reportSub = $this->pendingReportExists();

        $notHeld = fn ($q) => $q->where('video_comments.held_for_review', false)->whereNotExists($reportSub);
        $notReplied = fn ($q) => $q->where('video_comments.user_id', '!=', $creatorId)->whereNotExists($replySub);

        return match ($status) {
            'spam' => $query->where('video_comments.is_spam', true),

            'held' => $query->where('video_comments.is_spam', false)
                ->where(fn ($q) => $q->where('video_comments.held_for_review', true)->orWhereExists($reportSub)),

            'replied' => $query->where('video_comments.is_spam', false)->where($notHeld)
                ->where(fn ($q) => $q->whereExists($replySub)->orWhere('video_comments.user_id', $creatorId)),

            'unread' => $query->where('video_comments.is_spam', false)->where($notHeld)->where($notReplied)
                ->whereNull('video_comments.creator_seen_at'),

            'needs_reply' => $query->where('video_comments.is_spam', false)->where($notHeld)->where($notReplied)
                ->whereNotNull('video_comments.creator_seen_at'),

            default => $query, // 'all'
        };
    }

    private function creatorReplyExists(int $creatorId): Closure
    {
        return function ($q) use ($creatorId) {
            $q->select(DB::raw(1))->from('video_comments as cr')
              ->whereColumn('cr.root_id', 'video_comments.id')
              ->where('cr.user_id', $creatorId)
              ->whereNull('cr.deleted_at');
        };
    }

    private function pendingReportExists(): Closure
    {
        return function ($q) {
            $q->select(DB::raw(1))->from('comment_reports as rp')
              ->whereColumn('rp.comment_id', 'video_comments.id')
              ->where('rp.status', 'pending');
        };
    }

    private function creatorReplyCountSub(int $creatorId)
    {
        return VideoComment::query()->selectRaw('COUNT(*)')->from('video_comments as cr2')
            ->whereColumn('cr2.root_id', 'video_comments.id')
            ->where('cr2.user_id', $creatorId)
            ->whereNull('cr2.deleted_at');
    }

    /** The caller's reaction on each comment ('love' | 'dislike'), or null. */
    private function viewerReactionSub(int $creatorId)
    {
        return DB::table('comment_reactions as vr')
            ->select('vr.reaction_type')
            ->whereColumn('vr.comment_id', 'video_comments.id')
            ->where('vr.user_id', $creatorId)
            ->limit(1);
    }

    private function pendingReportCountSub()
    {
        return CommentReport::query()->selectRaw('COUNT(*)')->from('comment_reports as rp2')
            ->whereColumn('rp2.comment_id', 'video_comments.id')
            ->where('rp2.status', 'pending');
    }

    /** Load a comment, ensuring the auth user owns its video (or is admin). */
    private function authorizedComment(Request $request, int $id): VideoComment
    {
        $comment = VideoComment::with('video', 'user')->findOrFail($id);
        $user    = $request->user();

        if ((int) ($comment->video?->user_id) !== (int) $user->id && !$user->isAdmin()) {
            abort(403, 'You can only manage comments on your own content.');
        }

        return $comment;
    }

    private function markSeenInternal(VideoComment $comment): void
    {
        if ($comment->creator_seen_at === null) {
            $comment->forceFill(['creator_seen_at' => now()])->save();
        }
    }

    private function syncRootReplyCount(?int $rootId): void
    {
        if (!$rootId) return;
        $count = (int) VideoComment::where('root_id', $rootId)->where('is_hidden', false)->count();
        VideoComment::where('id', $rootId)->update(['reply_count' => $count]);
    }

    private function syncVideoCommentsCount(Video $video): void
    {
        $count = (int) VideoComment::where('video_id', $video->id)
            ->where('is_hidden', false)
            ->where('is_spam', false)
            ->where('held_for_review', false)
            ->where(fn ($q) => $q
                ->whereNull('parent_id')
                ->orWhereExists(fn ($exists) => $exists
                    ->selectRaw('1')->from('video_comments as vc_root')
                    ->whereColumn('vc_root.id', 'video_comments.root_id')
                    ->where('vc_root.is_hidden', false)
                    ->where('vc_root.is_spam', false)
                    ->where('vc_root.held_for_review', false)
                    ->whereNull('vc_root.deleted_at')))
            ->count();

        if ((int) $video->comments_count !== $count) {
            $video->forceFill(['comments_count' => $count])->saveQuietly();
        }
    }

    private function commentSubtreeIds(VideoComment $comment): array
    {
        $ids = [(int) $comment->id];
        $frontier = $ids;

        while ($frontier) {
            $children = VideoComment::whereIn('parent_id', $frontier)->pluck('id')
                ->map(fn ($i) => (int) $i)->all();
            $children = array_values(array_diff($children, $ids));
            if (!$children) break;
            $ids = array_merge($ids, $children);
            $frontier = $children;
        }

        return $ids;
    }
}
