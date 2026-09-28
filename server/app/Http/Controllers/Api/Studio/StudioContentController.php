<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\Hashtag;
use App\Models\Video;
use App\Services\FeedService;
use App\Services\MentionService;
use App\Services\VideoService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class StudioContentController extends Controller
{
    public function __construct(
        private readonly VideoService   $videoService,
        private readonly MentionService $mentionService,
    ) {}
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status'     => ['nullable', 'in:published,draft,private,unlisted,scheduled,removed'],
            'per_page'   => ['nullable', 'integer', 'min:5', 'max:50'],
            'sort'       => ['nullable', 'in:newest,oldest,most_viewed,most_liked'],
            'search'     => ['nullable', 'string', 'max:200'],
            'page'       => ['nullable', 'integer', 'min:1'],
            'start_date' => ['nullable', 'date'],
            'end_date'   => ['nullable', 'date'],
        ]);

        $user  = $request->user();
        $query = Video::with(['hashtags'])
            ->where('user_id', $user->id)
            ->whereNull('deleted_at');

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'ilike', "%{$search}%")
                  ->orWhere('caption', 'ilike', "%{$search}%");
            });
        }

        if ($startDate = $request->input('start_date')) {
            $query->whereDate('created_at', '>=', $startDate);
        }
        if ($endDate = $request->input('end_date')) {
            $query->whereDate('created_at', '<=', $endDate);
        }

        $sort = $request->input('sort', 'newest');
        match ($sort) {
            'oldest'      => $query->orderBy('created_at'),
            'most_viewed' => $query->orderByDesc('views_count'),
            'most_liked'  => $query->orderByDesc('likes_count'),
            default       => $query->orderByDesc('created_at'),
        };

        $perPage = $request->input('per_page', 20);
        $videos  = $query->paginate($perPage);

        Video::attachViewerFlags($videos, $user);

        $base = Video::where('user_id', $user->id)->whereNull('deleted_at');

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($videos),
            'meta'    => [
                'current_page'  => $videos->currentPage(),
                'last_page'     => $videos->lastPage(),
                'per_page'      => $videos->perPage(),
                'total'         => $videos->total(),
                'from'          => $videos->firstItem(),
                'to'            => $videos->lastItem(),
                'next_page_url' => $videos->nextPageUrl(),
                'counts'        => [
                    'total'     => (clone $base)->count(),
                    'published' => (clone $base)->where('status', 'published')->count(),
                    'draft'     => (clone $base)->where('status', 'draft')->count(),
                    'scheduled' => (clone $base)->where('status', 'scheduled')->count(),
                    'private'   => (clone $base)->where('status', 'private')->count(),
                    'unlisted'  => (clone $base)->where('status', 'unlisted')->count(),
                ],
            ],
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $video = Video::where('user_id', $request->user()->id)
            ->whereNull('deleted_at')
            ->findOrFail($id);

        $this->videoService->destroy($video);

        return response()->json(['success' => true, 'message' => 'Video deleted.']);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'status' => ['required', 'in:published,draft,private,unlisted,scheduled'],
        ]);

        $video = Video::where('user_id', $request->user()->id)
            ->whereNull('deleted_at')
            ->findOrFail($id);

        $video->update(['status' => $request->input('status')]);

        // Privacy / publish change must reflect in feeds instantly.
        FeedService::flushFeedCache();

        return response()->json([
            'success' => true,
            'message' => 'Status updated.',
            'data'    => new VideoResource($video),
        ]);
    }

    /* ── Full edit update (title, caption, category, visibility, etc.) ── */
    public function updateFull(Request $request, int $id): JsonResponse
    {
        $video = Video::where('user_id', $request->user()->id)
            ->whereNull('deleted_at')
            ->findOrFail($id);

        $data = $request->validate([
            'title'           => ['nullable', 'string', 'max:100'],
            'caption'         => ['nullable', 'string', 'max:300'],
            'category'        => ['nullable', 'string', 'max:100'],
            'location'        => ['nullable', 'string', 'max:255'],
            // Not a plain 'url' rule: this must accept an empty string too,
            // since editing sends the field back even when the creator
            // cleared it (see updateFull's own "sent as-is, even empty"
            // convention below) - a strict 'url' rule would 422 on that.
            'link_url'        => ['nullable', 'string', 'max:500', function ($attr, $value, $fail) {
                if ($value !== null && $value !== '' && !filter_var($value, FILTER_VALIDATE_URL)) {
                    $fail('Enter a valid link, starting with https://.');
                }
            }],
            'language'        => ['nullable', 'string', 'max:10'],
            'hashtags'        => ['nullable', 'array', 'max:30'],
            'hashtags.*'      => ['string', 'max:50'],
            'status'          => ['nullable', 'in:published,draft,private,unlisted,scheduled'],
            'scheduled_at'    => ['nullable', 'date'],
            'allow_comments'  => ['nullable', 'boolean'],
            'allow_duet'      => ['nullable', 'boolean'],
            'allow_stitch'    => ['nullable', 'boolean'],
            'allow_download'  => ['nullable', 'boolean'],
            'is_ai_generated' => ['nullable', 'boolean'],
            'tagged_user_ids'   => ['nullable', 'array', 'max:20'],
            'tagged_user_ids.*' => ['integer'],
            'collab_user_ids'   => ['nullable', 'array', 'max:20'],
            'collab_user_ids.*' => ['integer'],
            // "Add link" → Teezer Product - see VideoService::syncFeaturedProducts
            // for the ownership/active-status re-verification.
            'product_ids'       => ['nullable', 'array', 'max:3'],
            'product_ids.*'     => ['integer'],
        ]);

        if (($data['status'] ?? null) === 'scheduled') {
            $request->validate([
                'scheduled_at' => ['required', 'date', 'after:now'],
            ]);
        }

        if (!empty($data['caption'])
            && app(\App\Services\TextModerationService::class)->check($data['caption'])['action'] === 'block') {
            return response()->json(['success' => false, 'message' => 'Your caption may violate our community guidelines. Please edit it.'], 422);
        }

        // Same shape as VideoService::createFromUpload's own transaction: the
        // core row + hashtags are one atomic unit, so a mid-write failure
        // never leaves the caption/settings updated with hashtags stuck on
        // the old set (or the reverse). Tag/collab sync stays OUTSIDE it,
        // below - same split completeUpload uses, since those also send
        // notifications and were never meant to share a transaction with
        // the write that triggers them.
        $user = $request->user();

        DB::transaction(function () use ($video, $data, $user) {
            $video->update([
                'title'          => $data['title']          ?? $video->title,
                'caption'        => $data['caption']        ?? $video->caption,
                'category'       => array_key_exists('category', $data) ? (($data['category'] ?: null)) : $video->category,
                'location'       => array_key_exists('location', $data) ? ($data['location'] ?: null) : $video->location,
                'link_url'       => array_key_exists('link_url', $data) ? ($data['link_url'] ?: null) : $video->link_url,
                'language'       => $data['language']       ?? $video->language,
                'status'         => $data['status']         ?? $video->status,
                'scheduled_at'   => ($data['status'] ?? $video->status) === 'scheduled'
                    ? Carbon::parse($data['scheduled_at'] ?? $video->scheduled_at)
                    : null,
                'allow_comments'  => $data['allow_comments']  ?? $video->allow_comments,
                'allow_duet'      => $data['allow_duet']      ?? $video->allow_duet,
                'allow_stitch'    => $data['allow_stitch']    ?? $video->allow_stitch,
                'allow_download'  => $data['allow_download']  ?? $video->allow_download,
                'is_ai_generated' => array_key_exists('is_ai_generated', $data)
                    ? (bool) $data['is_ai_generated']
                    : $video->is_ai_generated,
            ]);

            if (array_key_exists('hashtags', $data) && is_array($data['hashtags'])) {
                $this->syncHashtags($video, $data['hashtags']);
            }

            // "Add link" → Teezer Product - add/remove, same omitted-means-
            // unchanged contract as every other edit field here; no
            // notification side effect (unlike tag/collab below), so it's
            // safe to share this transaction with the core write.
            if (array_key_exists('product_ids', $data)) {
                $this->videoService->syncFeaturedProducts($video, $user, $data['product_ids'] ?? []);
            }
        });

        // Sync tagged users - add new, remove dropped.
        if ($request->has('tagged_user_ids')) {
            $this->mentionService->syncTaggedUsers(
                (array) $request->input('tagged_user_ids', []),
                $request->user(),
                $video->id,
            );
        }

        // Sync "Paid partnership" collab users - add new, remove dropped.
        if ($request->has('collab_user_ids')) {
            $this->mentionService->syncCollabUsers(
                (array) $request->input('collab_user_ids', []),
                $request->user(),
                $video->id,
            );
        }

        // Status / visibility may have changed here - refresh feeds instantly.
        FeedService::flushFeedCache();

        return response()->json([
            'success' => true,
            'message' => 'Video updated.',
            // 'featuredProducts' so this response reflects what
            // syncFeaturedProducts just wrote above - without it
            // VideoResource::featured_products is silently absent here
            // (whenLoaded on an unloaded relation) even when the sync
            // succeeded.
            'data'    => new VideoResource($video->fresh()->load('hashtags', 'taggedUsers', 'collabUsers', 'featuredProducts')),
        ]);
    }

    /* ── Thumbnail replacement ── */
    public function updateThumbnail(Request $request, int $id): JsonResponse
    {
        $video = Video::where('user_id', $request->user()->id)
            ->whereNull('deleted_at')
            ->findOrFail($id);

        $request->validate([
            'thumbnail' => ['required', 'file', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $disk = config('filesystems.default', 'local');

        if ($video->thumbnail_url) {
            try { Storage::disk($disk)->delete($video->thumbnail_url); } catch (\Exception) {}
        }

        $path = $request->file('thumbnail')
            ->store("thumbnails/{$video->user_id}", $disk);

        $video->update(['thumbnail_url' => $path]);

        return response()->json([
            'success'       => true,
            'message'       => 'Thumbnail updated.',
            'thumbnail_url' => Storage::disk($disk)->url($path),
        ]);
    }

    /* ── Private: sync hashtags (mirrors VideoService logic) ── */
    private function syncHashtags(Video $video, array $tags): void
    {
        $tagIds = [];
        foreach ($tags as $name) {
            $name = strtolower(trim($name, '#'));
            if (!$name) continue;
            $tagIds[] = Hashtag::firstOrCreate(['name' => $name])->id;
        }
        $old     = $video->hashtags()->pluck('hashtags.id')->toArray();
        $video->hashtags()->sync($tagIds);
        if ($added   = array_diff($tagIds, $old)) Hashtag::whereIn('id', $added)->increment('videos_count');
        if ($removed = array_diff($old, $tagIds)) Hashtag::whereIn('id', $removed)->decrement('videos_count');
    }

    public function duplicate(Request $request, int $id): JsonResponse
    {
        $original = Video::with(['hashtags'])
            ->where('user_id', $request->user()->id)
            ->whereNull('deleted_at')
            ->findOrFail($id);

        $copy = $original->replicate();
        $copy->title          = $original->title ? $original->title . ' (Copy)' : null;
        $copy->status         = 'draft';
        $copy->scheduled_at   = null;
        $copy->views_count    = 0;
        $copy->likes_count    = 0;
        $copy->comments_count = 0;
        $copy->saves_count    = 0;
        $copy->shares_count   = 0;
        $copy->is_pinned      = false;
        $copy->pinned_at      = null;
        $copy->save();

        if ($original->hashtags->isNotEmpty()) {
            $copy->hashtags()->sync($original->hashtags->pluck('id'));
        }

        return response()->json([
            'success' => true,
            'message' => 'Video duplicated as draft.',
            'data'    => new VideoResource($copy->load('hashtags')),
        ], 201);
    }

    public function bulk(Request $request): JsonResponse
    {
        $request->validate([
            'action' => ['required', 'in:publish,draft,delete'],
            'ids'    => ['required', 'array', 'min:1', 'max:100'],
            'ids.*'  => ['integer'],
        ]);

        $user   = $request->user();
        $ids    = array_unique($request->input('ids'));
        $action = $request->input('action');

        $videos = Video::where('user_id', $user->id)
            ->whereNull('deleted_at')
            ->whereIn('id', $ids)
            ->get();

        $count = $videos->count();

        match ($action) {
            'publish' => $videos->each(fn ($v) => $v->update(['status' => 'published', 'scheduled_at' => null])),
            'draft'   => $videos->each(fn ($v) => $v->update(['status' => 'draft',     'scheduled_at' => null])),
            'delete'  => $videos->each(fn ($v) => $this->videoService->destroy($v)),
        };

        // Bulk publish / draft / delete all affect feed visibility.
        FeedService::flushFeedCache();

        return response()->json([
            'success' => true,
            'message' => "{$count} video(s) {$action} successful.",
            'count'   => $count,
        ]);
    }

    public function reschedule(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'scheduled_at' => ['required', 'date', 'after:now'],
        ]);

        $video = Video::where('user_id', $request->user()->id)
            ->whereNull('deleted_at')
            ->findOrFail($id);

        $video->update([
            'status'       => 'scheduled',
            'scheduled_at' => \Carbon\Carbon::parse($request->input('scheduled_at')),
        ]);

        // Moving a published video back to scheduled removes it from feeds.
        FeedService::flushFeedCache();

        return response()->json([
            'success' => true,
            'message' => 'Video rescheduled.',
            'data'    => new VideoResource($video),
        ]);
    }
}
