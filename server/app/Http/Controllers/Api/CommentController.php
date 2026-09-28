<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CommentResource;
use App\Models\CommentReaction;
use App\Models\CommentReport;
use App\Models\UserModerationSetting;
use App\Models\Video;
use App\Models\VideoComment;
use App\Services\MentionService;
use App\Services\NotificationService;
use App\Services\RealtimeBus;
use App\Services\ReportEvidenceService;
use App\Services\StorageService;
use App\Services\TextModerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CommentController extends Controller
{
    public function __construct(
        private readonly NotificationService   $notifs,
        private readonly MentionService        $mentions,
        private readonly TextModerationService $textModeration,
        private readonly StorageService        $storage,
        private readonly ReportEvidenceService $reportEvidence,
        private readonly \App\Services\GlobalControls\GlobalControlService $globalControls,
    ) {}

    /* ── GET /videos/{id}/comments ──────────────────────────────────────── */
    public function index(Request $request, int $id): JsonResponse
    {
        $request->validate(['per_page' => ['nullable', 'integer', 'min:5', 'max:50']]);

        // SECURITY: same visibility rule VideoInteractionController::interactableVideo()
        // already applies to likes/shares/saves - status=published alone is not enough,
        // a video an admin has moderation-rejected must not still take comments or list
        // them publicly just because it hasn't also been unpublished.
        $video = Video::where('id', $id)->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->firstOrFail();

        // Inject video owner so CommentResource can compute is_author for every comment.
        CommentResource::$videoOwnerId = (int) $video->user_id;

        // `gift` is eager-loaded so a gift comment can render its own artwork
        // without a query per row; it is null on ordinary comments.
        $comments = VideoComment::with(['user', 'gift', 'replies' => function ($q) {
            $q->where('is_hidden', false)
              ->where('is_spam', false)
              ->where('held_for_review', false)
              ->whereNull('deleted_at')
              ->with(['user', 'gift'])
              ->orderBy('created_at', 'asc')
              ->orderBy('id', 'asc');
        }])
            ->where('video_id', $id)
            ->whereNull('parent_id')
            ->where('is_hidden', false)
            ->where('is_spam', false)
            ->where('held_for_review', false)
            ->orderByDesc('is_pinned')
            ->orderByRaw('pin_order IS NULL ASC')
            ->orderBy('pin_order')
            ->orderBy('created_at', 'asc')
            ->orderBy('id', 'asc')
            ->paginate($request->input('per_page', 20));

        $visibleCount = $this->syncVideoCommentsCount($video);

        return response()->json([
            'success'                => true,
            'data'                   => CommentResource::collection($comments),
            'visible_comments_count' => $visibleCount,
            'video_comments_count'   => $visibleCount,
            'meta'                   => [
                'current_page'  => $comments->currentPage(),
                'last_page'     => $comments->lastPage(),
                'per_page'      => $comments->perPage(),
                'total'         => $comments->total(),
                'next_page_url' => $comments->nextPageUrl(),
            ],
        ]);
    }

    /* ── POST /videos/{id}/comments ─────────────────────────────────────── */
    public function store(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'body'             => ['nullable', 'string', 'max:1000'],
            'parent_id'        => ['nullable', 'integer', 'exists:video_comments,id'],
            'gif_url'          => ['nullable', 'url', 'max:500'],
            'gif_preview_url'  => ['nullable', 'url', 'max:500'],
            'gif_provider'     => ['nullable', 'string', 'max:50'],
            'gif_provider_id'  => ['nullable', 'string', 'max:100'],
            // A photo attached to the comment - our own upload, capped at 5 MB.
            'image'            => ['nullable', 'image', 'max:5120', 'mimes:jpeg,png,webp'],
        ]);

        // A comment must carry something: text, a GIF, or a photo.
        if (!$request->filled('body') && !$request->filled('gif_url') && !$request->hasFile('image')) {
            return response()->json(['success' => false, 'message' => 'A comment must have text, a GIF, or a photo.'], 422);
        }

        // SECURITY: same rule as index() above - a moderation-rejected video must
        // not still accept new comments.
        $video = Video::where('id', $id)->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->firstOrFail();

        if (!$video->allow_comments) {
            return response()->json(['success' => false, 'message' => 'Comments are disabled on this video.'], 422);
        }

        $parentId = $request->input('parent_id');
        $parent   = null;

        if ($parentId) {
            // Allow unlimited nesting - any visible comment on this video can be a parent.
            $parent = VideoComment::where('id', $parentId)
                ->where('video_id', $id)
                ->whereNull('deleted_at')
                ->first();

            if (!$parent) {
                return response()->json(['success' => false, 'message' => 'Invalid parent comment.'], 422);
            }
        }

        $user = $request->user();

        // Enforce admin restriction: cannot comment on others' content
        if ($video->user_id !== $user->id) {
            $mod = UserModerationSetting::forUser($user->id);
            if ($mod->disable_commenting_on_others) {
                return response()->json(['success' => false, 'message' => 'You are not allowed to comment on other users\' content at this time.'], 403);
            }

            // Per-creator restriction: the content owner has restricted this user.
            if (\App\Models\CommentRestrictedUser::isRestricted((int) $video->user_id, (int) $user->id)) {
                return response()->json(['success' => false, 'message' => 'You can no longer comment on this creator\'s content.'], 403);
            }

            // Creator's word blocklists (Keyword / Hashtag / Not-Interested filters):
            // reject comments containing a word the creator has chosen to block.
            if (\App\Models\UserHiddenWord::firstBlockedWord((int) $video->user_id, $request->input('body'))) {
                return response()->json(['success' => false, 'message' => 'Your comment contains a word the creator has blocked.'], 422);
            }
        }


        // Assign badge rank only to first 3 top-level comments
        $rank = null;
        if (!$parentId) {
            $topCount = VideoComment::where('video_id', $id)
                ->whereNull('parent_id')
                ->whereNull('deleted_at')
                ->count();
            if ($topCount < 3) {
                $rank = $topCount + 1;
            }
        }

        // root_id = the top-level comment that owns this entire thread.
        // null  → this IS the root comment.
        // value → all nested replies share the same root_id.
        $rootId = null;
        if ($parent) {
            $rootId = $parent->root_id ?? $parent->id;
        }

        // Text moderation: very bad → auto-hide; suspicious → hold for review;
        // mild → publish with a soft warning. Both hidden & held comments stay
        // out of the public list and surface in the creator's Studio inbox.
        $mod      = $this->textModeration->check($request->input('body'));
        $isHidden = $mod['action'] === 'block';
        $isHeld   = $mod['action'] === 'review';
        $isPublic = !$isHidden && !$isHeld;

        // Uploaded photo → R2 (store the key; the resource resolves it to a URL).
        $imagePath = $request->hasFile('image')
            ? $this->storage->storeImage($request->file('image'), 'comments')
            : null;

        $comment = VideoComment::create([
            'video_id'        => $id,
            'user_id'         => $user->id,
            'parent_id'       => $parentId,
            'root_id'         => $rootId,
            'body'            => $request->input('body'),
            'gif_url'         => $request->input('gif_url'),
            'gif_preview_url' => $request->input('gif_preview_url'),
            'gif_provider'    => $request->input('gif_provider'),
            'gif_provider_id' => $request->input('gif_provider_id'),
            'image_path'      => $imagePath,
            'comment_rank'    => $rank,
            'is_hidden'       => $isHidden,
            'held_for_review' => $isHeld,
        ]);

        if ($parent) {
            $parent->recalcReactionScore();
            $this->syncRootReplyCount($rootId);
        }

        // comments_count = all visible, non-deleted comments at every depth.
        // Recalculate instead of blindly incrementing so feed/detail pages do
        // not drift from the drawer after prior deletes or hidden comments.
        $videoCommentsCount = $this->syncVideoCommentsCount($video);
        $comment->load('user');

        // Don't notify or fire @mentions for hidden/held content - only once it's
        // actually public (or approved later from the inbox). A reply notifies the
        // author of the comment being replied to ("X replied to your comment",
        // aggregated per parent comment); a top-level comment notifies the creator
        // ("X and N others commented on your video", aggregated per video).
        if ($isPublic) {
            if ($parent) {
                if ($parent->user_id !== $user->id) {
                    $this->notifs->notify($parent->user, 'reply', [
                        'actor_id'    => $user->id,
                        'entity_type' => 'comment',
                        'entity_id'   => $parent->id,
                        'comment_id'  => $comment->id,
                        'message'     => NotificationService::buildMessage('reply', $user->name),
                    ]);
                }
            } elseif ($video->user_id !== $user->id) {
                $this->notifs->notify($video->user, 'comment', [
                    'actor_id'    => $user->id,
                    'entity_type' => 'video',
                    'entity_id'   => $video->id,
                    'comment_id'  => $comment->id,
                    'message'     => NotificationService::buildMessage('comment', $user->name, [
                        'preview' => mb_substr($comment->body, 0, 60),
                    ]),
                ]);
            }
        }

        // Process @mentions in the comment body. Global Teezer Control's
        // mentions_enabled only stops the mention notification - the comment
        // itself already posted above, matching the spec's own wording for
        // this toggle ("mention notifications", not "comments").
        if ($isPublic && $comment->body && $this->globalControls->isEnabled('mentions_enabled')) {
            $sourceType = $parentId ? 'reply' : 'comment';
            $this->mentions->processMentions(
                $comment->body,
                $user,
                $sourceType,
                $comment->id,
                $video->id,
            );
        }

        // Ensure is_author is populated on the returned comment.
        CommentResource::$videoOwnerId = (int) $video->user_id;

        // Refresh counts so frontend can sync without re-fetching the whole list.
        $rootRepliesCount = $rootId
            ? $this->visibleRootReplyCount($rootId)
            : 0;

        // Realtime: notify everyone viewing this video that a new (visible) comment
        // landed, so their open comment sheet / count updates without a refresh.
        if (!in_array($mod['action'] ?? null, ['block', 'review'], true)) {
            RealtimeBus::publish([RealtimeBus::videoRoom($video->id)], 'comment.created', [
                'video_id'             => $video->id,
                'video_comments_count' => $videoCommentsCount,
            ]);
        }

        return response()->json([
            'success'              => true,
            'data'                 => new CommentResource($comment),
            'root_comment_id'      => $rootId,
            'root_replies_count'   => $rootRepliesCount,
            'video_comments_count' => $videoCommentsCount,
            'moderation'           => match ($mod['action']) {
                'block'  => ['status' => 'blocked', 'message' => 'Your comment may violate our community guidelines and has been hidden.'],
                'review' => ['status' => 'pending', 'message' => 'Your comment is pending review and will appear once approved.'],
                'warn'   => ['status' => 'warned',  'message' => 'This comment may violate our community guidelines.'],
                default  => null,
            },
        ], 201);
    }

    /* ── DELETE /videos/{id}/comments/{cid}  (legacy route kept) ────────── */
    public function destroy(Request $request, int $id, int $cid): JsonResponse
    {
        $comment = VideoComment::where('id', $cid)->where('video_id', $id)->firstOrFail();
        return $this->performDelete($request->user(), $comment);
    }

    /* ── DELETE /comments/{id} ──────────────────────────────────────────── */
    public function destroyById(Request $request, int $id): JsonResponse
    {
        $comment = VideoComment::findOrFail($id);
        return $this->performDelete($request->user(), $comment);
    }

    private function performDelete($user, VideoComment $comment): JsonResponse
    {
        $video = Video::find($comment->video_id);

        if ($user->id !== $comment->user_id && $user->id !== $video?->user_id && !$user->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $videoCommentsCount = DB::transaction(function () use ($comment, $video): int {
            $ids = $this->commentSubtreeIds($comment);
            $rootId = $comment->root_id ?? ($comment->parent_id ? $comment->parent_id : null);
            $parentId = $comment->parent_id;

            VideoComment::whereIn('id', $ids)->delete();

            if ($rootId) {
                $this->syncRootReplyCount($rootId);
            }

            if ($parentId && $parent = VideoComment::find($parentId)) {
                $parent->recalcReactionScore();
            }

            return $video ? $this->syncVideoCommentsCount($video) : 0;
        });

        // Keep aggregated notification counts honest: drop the author from the
        // "commented"/"replied" group only if they have no OTHER visible
        // comment/reply left on the same target (so deleting one of several
        // comments doesn't wrongly remove them from the count).
        $authorId = (int) $comment->user_id;
        if ($comment->parent_id === null) {
            $ownerId = (int) ($video?->user_id ?? 0);
            if ($ownerId && $authorId !== $ownerId && !$this->authorHasVisibleTopLevel($comment->video_id, $authorId)) {
                $this->notifs->withdraw($ownerId, 'comment', [
                    'actor_id' => $authorId, 'entity_type' => 'video', 'entity_id' => $comment->video_id,
                ]);
            }
        } else {
            $parentAuthorId = (int) VideoComment::where('id', $comment->parent_id)->value('user_id');
            if ($parentAuthorId && $authorId !== $parentAuthorId && !$this->authorHasVisibleReply($comment->parent_id, $authorId)) {
                $this->notifs->withdraw($parentAuthorId, 'reply', [
                    'actor_id' => $authorId, 'entity_type' => 'comment', 'entity_id' => $comment->parent_id,
                ]);
            }
        }

        return response()->json([
            'success'              => true,
            'message'              => 'Comment deleted.',
            'video_comments_count' => $videoCommentsCount,
        ]);
    }

    /** Does this user still have a visible top-level comment on the video? */
    private function authorHasVisibleTopLevel(int $videoId, int $authorId): bool
    {
        return VideoComment::where('video_id', $videoId)->whereNull('parent_id')
            ->where('user_id', $authorId)->whereNull('deleted_at')
            ->where('is_hidden', false)->where('is_spam', false)->where('held_for_review', false)
            ->exists();
    }

    /** Does this user still have a visible reply under the given parent comment? */
    private function authorHasVisibleReply(int $parentId, int $authorId): bool
    {
        return VideoComment::where('parent_id', $parentId)
            ->where('user_id', $authorId)->whereNull('deleted_at')
            ->where('is_hidden', false)->where('is_spam', false)->where('held_for_review', false)
            ->exists();
    }

    /** The one definition of "visible", shared with everything that writes a
     *  comment - see VideoComment::visibleCountForVideo. */
    private function visibleVideoCommentCount(int $videoId): int
    {
        return VideoComment::visibleCountForVideo($videoId);
    }

    private function syncVideoCommentsCount(Video $video): int
    {
        $count = $this->visibleVideoCommentCount((int) $video->id);

        if ((int) $video->comments_count !== $count) {
            $video->forceFill(['comments_count' => $count])->saveQuietly();
        }

        $video->setAttribute('comments_count', $count);

        return $count;
    }

    private function visibleRootReplyCount(int $rootId): int
    {
        return (int) VideoComment::where('root_id', $rootId)
            ->where('is_hidden', false)
            ->where('is_spam', false)
            ->where('held_for_review', false)
            ->count();
    }

    private function syncRootReplyCount(?int $rootId): int
    {
        if (!$rootId) {
            return 0;
        }

        $count = $this->visibleRootReplyCount($rootId);
        VideoComment::where('id', $rootId)->update(['reply_count' => $count]);

        return $count;
    }

    /**
     * Return the selected comment plus all loaded descendants. This keeps
     * top-level deletes from leaving active replies that inflate counts but
     * can no longer be reached from the comment list.
     */
    private function commentSubtreeIds(VideoComment $comment): array
    {
        $ids = [(int) $comment->id];
        $frontier = $ids;

        while ($frontier) {
            $children = VideoComment::whereIn('parent_id', $frontier)
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $children = array_values(array_diff($children, $ids));
            if (!$children) {
                break;
            }

            $ids = array_merge($ids, $children);
            $frontier = $children;
        }

        return $ids;
    }

    /* ── POST /comments/{id}/react ──────────────────────────────────────── */
    public function react(Request $request, int $id): JsonResponse
    {
        $request->validate(['reaction_type' => ['required', 'in:love,dislike']]);

        $user         = $request->user();
        $reactionType = $request->input('reaction_type');

        $payload = DB::transaction(function () use ($id, $user, $reactionType): array {
            $comment = VideoComment::whereKey($id)->lockForUpdate()->firstOrFail();
            $existing = CommentReaction::where('comment_id', $id)->where('user_id', $user->id)->first();

            if ($existing) {
                if ($existing->reaction_type === $reactionType) {
                    $existing->delete();
                    if ($reactionType === 'love') {
                        VideoComment::whereKey($id)->where('likes_count', '>', 0)->decrement('likes_count');
                    } else {
                        VideoComment::whereKey($id)->where('dislike_count', '>', 0)->decrement('dislike_count');
                    }
                    $comment->recalcReactionScore();

                    $fresh = $comment->fresh();
                    return [
                        'action'                => 'removed',
                        'current_user_reaction' => null,
                        'love_count'            => (int) $fresh->likes_count,
                        'dislike_count'         => (int) $fresh->dislike_count,
                    ];
                }

                $old = $existing->reaction_type;
                $existing->update(['reaction_type' => $reactionType]);
                if ($old === 'love') {
                    VideoComment::whereKey($id)->where('likes_count', '>', 0)->decrement('likes_count');
                    VideoComment::whereKey($id)->increment('dislike_count');
                } else {
                    VideoComment::whereKey($id)->where('dislike_count', '>', 0)->decrement('dislike_count');
                    VideoComment::whereKey($id)->increment('likes_count');
                }
                $action = 'switched';
            } else {
                CommentReaction::create([
                    'comment_id'    => $id,
                    'user_id'       => $user->id,
                    'reaction_type' => $reactionType,
                ]);
                if ($reactionType === 'love') {
                    VideoComment::whereKey($id)->increment('likes_count');
                } else {
                    VideoComment::whereKey($id)->increment('dislike_count');
                }
                $action = 'added';
            }

            $comment->recalcReactionScore();
            $fresh = $comment->fresh();

            return [
                'action'                => $action,
                'current_user_reaction' => $reactionType,
                'love_count'            => (int) $fresh->likes_count,
                'dislike_count'         => (int) $fresh->dislike_count,
                'owner_id'              => (int) $comment->user_id,
            ];
        });

        // "X and N others liked your comment" - aggregated per comment, mirrors
        // the like/unlike lifecycle: a love (new or switched-from-dislike) adds
        // the actor; removing or switching AWAY from love withdraws them.
        $ownerId = (int) ($payload['owner_id'] ?? 0);
        if ($ownerId && $ownerId !== (int) $user->id) {
            $lovedNow  = $reactionType === 'love' && in_array($payload['action'], ['added', 'switched'], true);
            $loveGone  = ($reactionType === 'love' && $payload['action'] === 'removed')
                      || ($reactionType === 'dislike' && $payload['action'] === 'switched');
            if ($lovedNow) {
                $this->notifs->notify(\App\Models\User::find($ownerId), 'comment_like', [
                    'actor_id'    => $user->id,
                    'entity_type' => 'comment',
                    'entity_id'   => $id,
                    'comment_id'  => $id,
                    'message'     => NotificationService::buildMessage('comment_like', $user->name),
                ]);
            } elseif ($loveGone) {
                $this->notifs->withdraw($ownerId, 'comment_like', [
                    'actor_id' => $user->id, 'entity_type' => 'comment', 'entity_id' => $id,
                ]);
            }
        }
        unset($payload['owner_id']);

        return response()->json(array_merge(['success' => true], $payload));
    }

    /* ── PUT /comments/{id} ─────────────────────────────────────────────── */
    public function edit(Request $request, int $id): JsonResponse
    {
        $request->validate(['body' => ['required', 'string', 'max:1000']]);

        $comment = VideoComment::findOrFail($id);
        $user    = $request->user();

        if ($comment->user_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $newBody = $request->input('body');
        $comment->update([
            'body'      => $newBody,
            'is_edited' => true,
            'edited_at' => now(),
        ]);

        // Re-process mentions after edit
        $sourceType = $comment->parent_id ? 'reply' : 'comment';
        $this->mentions->updateMentions(
            $newBody,
            $user,
            $sourceType,
            $comment->id,
            $comment->video_id,
        );

        return response()->json([
            'success' => true,
            'data'    => new CommentResource($comment->load('user')),
        ]);
    }

    /* ── POST /comments/{id}/pin ────────────────────────────────────────── */
    public function pin(Request $request, int $id): JsonResponse
    {
        $comment = VideoComment::whereNull('parent_id')->findOrFail($id);
        $video   = Video::findOrFail($comment->video_id);
        $user    = $request->user();

        if ($video->user_id !== $user->id && !$user->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        if ($comment->is_pinned) {
            return response()->json(['success' => true, 'message' => 'Already pinned.']);
        }

        $maxOrder = VideoComment::where('video_id', $comment->video_id)
            ->where('is_pinned', true)
            ->max('pin_order') ?? 0;

        $comment->update([
            'is_pinned' => true,
            'pinned_at' => now(),
            'pinned_by' => $user->id,
            'pin_order' => $maxOrder + 1,
        ]);

        return response()->json(['success' => true, 'message' => 'Comment pinned.']);
    }

    /* ── POST /comments/{id}/unpin ──────────────────────────────────────── */
    public function unpin(Request $request, int $id): JsonResponse
    {
        $comment = VideoComment::findOrFail($id);
        $video   = Video::findOrFail($comment->video_id);
        $user    = $request->user();

        if ($video->user_id !== $user->id && !$user->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $comment->update([
            'is_pinned' => false,
            'pinned_at' => null,
            'pinned_by' => null,
            'pin_order' => null,
        ]);

        return response()->json(['success' => true, 'message' => 'Comment unpinned.']);
    }

    /* ── POST /comments/{id}/report ─────────────────────────────────────── */
    public function report(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason'  => ['required', 'in:spam,harassment,hate_speech,nudity,violence,misinformation,other'],
            'details' => ['nullable', 'string', 'max:500'],
            ...$this->reportEvidence->rules(),
        ]);

        $comment = VideoComment::findOrFail($id);
        $user    = $request->user();

        $alreadyReported = CommentReport::where('comment_id', $id)
            ->where('reporter_user_id', $user->id)
            ->exists();

        if ($alreadyReported) {
            return response()->json(['success' => false, 'message' => 'You have already reported this comment.'], 422);
        }

        CommentReport::create([
            'comment_id'       => $id,
            'video_id'         => $comment->video_id,
            'reporter_user_id' => $user->id,
            'comment_owner_id' => $comment->user_id,
            'reason'           => $request->input('reason'),
            'details'          => $request->input('details'),
            'evidence_keys'    => $this->reportEvidence->store($request),
        ]);

        return response()->json(['success' => true, 'message' => 'Report submitted. Thank you for keeping Teezer safe.']);
    }

    /* ── GET /comments/{id}/replies ─────────────────────────────────────── */
    public function replies(Request $request, int $id): JsonResponse
    {
        $parent = VideoComment::findOrFail($id);

        // SECURITY: same visibility rule index()/store() apply - a reply thread
        // must not stay readable once its video is gone, unpublished (draft/
        // private/unlisted/scheduled/removed), or moderation-rejected. This
        // used to fetch the video ONLY to fill in the Author badge's owner id,
        // with nothing gating the replies query itself below - whatever the
        // video's state, if the comment rows still existed the thread still
        // came back in full. Video uses SoftDeletes, so a deleted video is
        // already excluded by the query below with no extra check needed.
        $video = Video::where('id', $parent->video_id)->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->first();

        if (! $video) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        // Inject video owner so Author badge works in replies-of-replies.
        CommentResource::$videoOwnerId = (int) $video->user_id;

        // Use root_id so ALL replies in the thread are returned, not just
        // direct children. Replies-to-replies have parent_id = reply.id but
        // root_id = root_comment.id, so WHERE parent_id = $id would miss them.
        $rootId = $parent->root_id ?? $parent->id;

        $replies = VideoComment::with('user')
            ->where('root_id', $rootId)
            ->where('is_hidden', false)
            ->where('is_spam', false)
            ->where('held_for_review', false)
            ->whereNull('deleted_at')
            ->orderBy('created_at', 'asc')
            ->orderBy('id', 'asc')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => CommentResource::collection($replies),
            'total'   => $replies->count(),
            // Resolved top-level ancestor - lets a caller that only has a reply's
            // id (e.g. opening a "mentioned you" notification) find which root
            // comment row to scroll to and expand in the main list.
            'root_comment_id' => $rootId,
            // Which video this thread belongs to. Additive - the row was already
            // loaded above for the visibility check and the Author badge, so this
            // costs no extra query. It is what makes /comment/{id} resolvable: for `reply` and
            // `comment_like` notifications the only id a client holds is a
            // COMMENT id, and nothing else in the public API maps that to a video.
            'video_id' => (int) $parent->video_id,
        ]);
    }

    /* ── Legacy like/unlike routes (kept for backward compat) ───────────── */
    public function like(Request $request, int $id, int $cid): JsonResponse
    {
        $user = $request->user();

        // CORRECTNESS: locked and transactional, same as the modern react()
        // above. This used to read $existing, then write, with nothing
        // serializing two concurrent requests - both could read the same
        // 'dislike' (or no) existing reaction before either had written, so
        // both would independently increment likes_count even though the
        // database only ever ends up with one reaction row for
        // (comment_id, user_id). lockForUpdate() on the comment row makes the
        // second request wait for the first to commit, so it re-reads the
        // reaction the first request just wrote instead of racing it.
        $comment = DB::transaction(function () use ($id, $cid, $user) {
            $comment  = VideoComment::where('id', $cid)->where('video_id', $id)->lockForUpdate()->firstOrFail();
            $existing = CommentReaction::where('comment_id', $cid)->where('user_id', $user->id)->first();

            if ($existing && $existing->reaction_type === 'dislike') {
                $existing->update(['reaction_type' => 'love']);
                VideoComment::whereKey($comment->id)->where('dislike_count', '>', 0)->decrement('dislike_count');
                VideoComment::whereKey($comment->id)->increment('likes_count');
                $comment->recalcReactionScore();
            } elseif (!$existing) {
                CommentReaction::create(['comment_id' => $cid, 'user_id' => $user->id, 'reaction_type' => 'love']);
                $comment->increment('likes_count');
                $comment->recalcReactionScore();
            }

            return $comment;
        });

        return response()->json([
            'success'     => true,
            'liked'       => true,
            'likes_count' => (int) $comment->fresh()->likes_count,
        ]);
    }

    public function unlike(Request $request, int $id, int $cid): JsonResponse
    {
        $comment = VideoComment::where('id', $cid)->where('video_id', $id)->firstOrFail();

        $deleted = CommentReaction::where('comment_id', $cid)
            ->where('user_id', $request->user()->id)
            ->where('reaction_type', 'love')
            ->delete();

        if ($deleted) {
            $comment->decrement('likes_count');
            $comment->recalcReactionScore();
        }

        return response()->json(['success' => true, 'liked' => false]);
    }
}
