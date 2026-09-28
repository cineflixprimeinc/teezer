<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\CommentReport;
use App\Models\VideoComment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Comment moderation.
 *
 * The admin panel's Comments page was a placeholder with hardcoded dashes and
 * a "coming soon" card, while the data behind it was already complete:
 * video_comments carries is_hidden / is_spam / held_for_review / soft deletes,
 * and comment_reports carries user reports with a reason, details and
 * evidence. This exposes that.
 *
 * Deliberately does NOT hard-delete. Every removal is a soft delete, so a
 * mistake is recoverable and a comment removed during a dispute can still be
 * produced as evidence. `restore` is the counterpart.
 *
 * The four flags are independent on purpose and mean different things:
 *   is_hidden        an admin or the creator removed it from view
 *   is_spam          classified as spam; hidden AND excluded from counts
 *   held_for_review  automated moderation held it before it was ever shown
 *   deleted_at       removed, recoverable
 *
 * VideoComment::visibleCountForVideo() is the single definition of what a user
 * can actually see, and it excludes all of the first three - so nothing here
 * needs to recount anything by hand.
 */
class AdminCommentController extends Controller
{
    /** GET /api/v1/admin/comments */
    public function index(Request $request): JsonResponse
    {
        $query = VideoComment::query()
            ->with([
                'user:id,username,name,avatar',
                'video:id,caption,thumbnail_url',
            ])
            ->withCount('reports');

        // The queue decides which rows are even candidates. "all" deliberately
        // excludes deleted ones - an operator asking for everything means
        // everything live, not a graveyard.
        match ($request->get('queue', 'all')) {
            'reported'  => $query->has('reports'),
            'held'      => $query->where('held_for_review', true),
            'spam'      => $query->where('is_spam', true),
            'hidden'    => $query->where('is_hidden', true),
            'deleted'   => $query->onlyTrashed(),
            default     => $query,
        };

        if ($search = trim((string) $request->get('q', ''))) {
            $query->where(function ($w) use ($search) {
                $w->where('body', 'like', '%' . $search . '%')
                  ->orWhereHas('user', fn ($u) => $u
                      ->where('username', 'like', '%' . $search . '%')
                      ->orWhere('name', 'like', '%' . $search . '%'));
            });
        }

        if ($videoId = $request->get('video_id')) {
            $query->where('video_id', (int) $videoId);
        }

        if ($userId = $request->get('user_id')) {
            $query->where('user_id', (int) $userId);
        }

        // The other half of "this user's comments": ones OTHERS left on videos
        // this user owns. user_id above is authorship; this is receipt. They are
        // deliberately separate parameters - a moderator looking at what someone
        // wrote and a moderator looking at what someone is being told are doing
        // two different jobs, and combining them would hide which is which.
        if ($receivedBy = $request->get('received_by')) {
            $query->whereHas('video', fn ($v) => $v->where('user_id', (int) $receivedBy));
        }

        $sort = $request->get('sort', 'newest');
        match ($sort) {
            'oldest'   => $query->oldest(),
            'reported' => $query->orderByDesc('reports_count'),
            'liked'    => $query->orderByDesc('likes_count'),
            default    => $query->latest(),
        };

        $comments = $query->paginate(min((int) $request->get('per_page', 25), 100));

        return response()->json([
            'success' => true,
            'data'    => [
                'items' => collect($comments->items())->map(fn (VideoComment $c) => $this->present($c))->all(),
                'meta'  => [
                    'current_page' => $comments->currentPage(),
                    'last_page'    => $comments->lastPage(),
                    'per_page'     => $comments->perPage(),
                    'total'        => $comments->total(),
                ],
                // Scoped to whichever user filter is active, so the header
                // tiles describe the list being looked at rather than the
                // whole platform. Unfiltered, this is the platform total as
                // before.
                'stats' => $this->stats(
                    $request->get('user_id') ? (int) $request->get('user_id') : null,
                    $request->get('received_by') ? (int) $request->get('received_by') : null,
                ),
            ],
        ]);
    }

    /** GET /api/v1/admin/comments/{id} - one comment with its reports. */
    public function show(int $id): JsonResponse
    {
        $comment = VideoComment::withTrashed()
            ->with(['user:id,username,name,avatar', 'video:id,caption,thumbnail_url'])
            ->withCount('reports')
            ->findOrFail($id);

        $reports = CommentReport::where('comment_id', $id)
            ->with('reporter:id,username,name')
            ->latest()
            ->limit(50)
            ->get()
            ->map(fn (CommentReport $r) => [
                'id'         => $r->id,
                'reason'     => $r->reason,
                'details'    => $r->details,
                'status'     => $r->status,
                'reporter'   => $r->reporter?->username,
                // Evidence lives in private storage. Only the COUNT is
                // returned; serving the objects needs a signed URL and is a
                // separate, audited action.
                'evidence'   => count((array) $r->evidence_keys),
                'created_at' => $r->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'success' => true,
            'data'    => ['comment' => $this->present($comment), 'reports' => $reports],
        ]);
    }

    /** POST /api/v1/admin/comments/{id}/action */
    public function action(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'string', 'in:hide,unhide,spam,not_spam,approve,delete,restore'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $comment = VideoComment::withTrashed()->findOrFail($id);

        $this->apply($comment, $validated['action']);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'comment.' . $validated['action'],
            category: 'content_actions',
            description: 'Comment #' . $comment->id . ' ' . $validated['action']
                . ($validated['reason'] ? ': ' . $validated['reason'] : ''),
            targetType: 'VideoComment',
            targetId: $comment->id,
            metadata: ['video_id' => $comment->video_id, 'user_id' => $comment->user_id],
            ip: $request->ip(),
            severity: in_array($validated['action'], ['delete', 'spam'], true) ? 'warning' : 'info',
        );

        return response()->json([
            'success' => true,
            'message' => 'Comment ' . str_replace('_', ' ', $validated['action']) . '.',
            'data'    => $this->present($comment->fresh(['user', 'video'])->loadCount('reports')),
        ]);
    }

    /**
     * POST /api/v1/admin/comments/bulk
     *
     * Capped at 200 ids per call. Without a cap an operator can select "all"
     * on a filter matching a hundred thousand rows and hold a transaction open
     * long enough to matter.
     */
    public function bulk(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'    => ['required', 'array', 'min:1', 'max:200'],
            'ids.*'  => ['integer'],
            'action' => ['required', 'string', 'in:hide,unhide,spam,not_spam,approve,delete,restore'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $comments = VideoComment::withTrashed()->whereIn('id', $validated['ids'])->get();

        DB::transaction(function () use ($comments, $validated) {
            foreach ($comments as $comment) {
                $this->apply($comment, $validated['action']);
            }
        });

        AdminActionLog::record(
            admin: $request->user(),
            action: 'comment.bulk_' . $validated['action'],
            category: 'content_actions',
            description: $comments->count() . ' comments ' . $validated['action']
                . ($validated['reason'] ? ': ' . $validated['reason'] : ''),
            metadata: ['count' => $comments->count(), 'ids' => $comments->pluck('id')->all()],
            ip: $request->ip(),
            severity: 'warning',
        );

        return response()->json([
            'success' => true,
            'message' => $comments->count() . ' comment(s) updated.',
            'data'    => ['stats' => $this->stats()],
        ]);
    }

    /** POST /api/v1/admin/comments/reports/{id}/resolve */
    public function resolveReport(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:resolved,dismissed'],
        ]);

        $report = CommentReport::findOrFail($id);
        $report->update(['status' => $validated['status']]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'comment_report.' . $validated['status'],
            category: 'content_actions',
            description: 'Report #' . $report->id . ' marked ' . $validated['status'] . '.',
            targetType: 'CommentReport',
            targetId: $report->id,
            ip: $request->ip(),
        );

        return response()->json(['success' => true, 'message' => 'Report ' . $validated['status'] . '.']);
    }

    // ── Internals ────────────────────────────────────────────────────────

    /**
     * Apply one action.
     *
     * `spam` also hides, because a comment classified as spam that stays
     * visible is not moderated - and `not_spam` clears both, since the only
     * reason it was hidden was the spam call. `approve` is the counterpart to
     * automated holding: it clears every automated flag at once, which is what
     * an operator means when they say a held comment is fine.
     */
    private function apply(VideoComment $comment, string $action): void
    {
        match ($action) {
            'hide'     => $comment->update(['is_hidden' => true]),
            'unhide'   => $comment->update(['is_hidden' => false]),
            'spam'     => $comment->update(['is_spam' => true, 'is_hidden' => true]),
            'not_spam' => $comment->update(['is_spam' => false, 'is_hidden' => false]),
            'approve'  => $comment->update(['held_for_review' => false, 'is_spam' => false, 'is_hidden' => false]),
            'delete'   => $comment->delete(),
            'restore'  => $comment->restore(),
            default    => null,
        };
    }

    private function present(VideoComment $comment): array
    {
        return [
            'id'              => $comment->id,
            'body'            => $comment->body,
            'gif_url'         => $comment->gif_url,
            'image_path'      => $comment->image_path,
            'video_id'        => $comment->video_id,
            'parent_id'       => $comment->parent_id,
            'user'            => $comment->user ? [
                'id'       => $comment->user->id,
                'username' => $comment->user->username,
                'name'     => $comment->user->name,
                // Avatars are storage keys too - same resolution as the
                // thumbnail, or "Comments Received" shows broken images the
                // way "Comments Made" did.
                'avatar'   => $this->thumbUrl($comment->user->avatar),
            ] : null,
            'video'           => $comment->video ? [
                'id'        => $comment->video->id,
                'caption'   => $comment->video->caption,
                'thumbnail' => $this->thumbUrl($comment->video->thumbnail_url),
            ] : null,
            'likes_count'     => (int) $comment->likes_count,
            'dislike_count'   => (int) $comment->dislike_count,
            'reply_count'     => (int) $comment->reply_count,
            'reports_count'   => (int) ($comment->reports_count ?? 0),
            'is_hidden'       => (bool) $comment->is_hidden,
            'is_spam'         => (bool) $comment->is_spam,
            'held_for_review' => (bool) $comment->held_for_review,
            'is_pinned'       => (bool) $comment->is_pinned,
            'is_edited'       => (bool) $comment->is_edited,
            'is_deleted'      => $comment->deleted_at !== null,
            'created_at'      => $comment->created_at?->toIso8601String(),
            'deleted_at'      => $comment->deleted_at?->toIso8601String(),
        ];
    }

    /**
     * videos.thumbnail_url holds a storage key, not a URL - resolving it is the
     * caller's job. Without this the admin panel renders a broken image for
     * every comment, which is exactly what it was doing.
     */
    private function thumbUrl(?string $key): ?string
    {
        if (! $key) {
            return null;
        }

        return str_starts_with($key, 'http')
            ? $key
            : Storage::disk(config('filesystems.default', 'r2'))->url($key);
    }

    /**
     * Counts for the header tiles.
     *
     * One grouped query for the flag counts rather than five COUNT(*) round
     * trips - this runs on every page load of the list.
     */
    private function stats(?int $userId = null, ?int $receivedBy = null): array
    {
        // CASE rather than PostgreSQL's `count(*) FILTER (WHERE ...)`. Production
        // is Postgres, but config/database.php still defines a mysql connection
        // and a customer installation picks its own - FILTER is a syntax error
        // on MySQL, and this is the sort of thing that only surfaces on someone
        // else's server.
        $scope = function ($q) use ($userId, $receivedBy) {
            if ($userId) {
                $q->where('user_id', $userId);
            }
            if ($receivedBy) {
                $q->whereHas('video', fn ($v) => $v->where('user_id', $receivedBy));
            }

            return $q;
        };

        $flags = $scope(VideoComment::query())->selectRaw('
            count(*) as total,
            sum(case when is_hidden then 1 else 0 end) as hidden,
            sum(case when is_spam then 1 else 0 end) as spam,
            sum(case when held_for_review then 1 else 0 end) as held
        ')->first();

        return [
            'total'           => (int) ($flags->total ?? 0),
            'hidden'          => (int) ($flags->hidden ?? 0),
            'spam'            => (int) ($flags->spam ?? 0),
            'held'            => (int) ($flags->held ?? 0),
            // Comments carrying at least one report, which is what the
            // "Reported" tile filters to - distinct from reported_open below,
            // which counts unresolved reports and can exceed it.
            'reported'        => $scope(VideoComment::query())->has('reports')->count(),
            'reported_open'   => CommentReport::where('status', 'pending')
                ->when($userId || $receivedBy, fn ($q) => $q->whereHas('comment', fn ($c) => $scope($c)))
                ->count(),
            'deleted'         => $scope(VideoComment::onlyTrashed())->count(),
            'deleted_today'   => $scope(VideoComment::onlyTrashed())->where('deleted_at', '>=', now()->startOfDay())->count(),
        ];
    }
}
