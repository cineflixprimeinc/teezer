<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\AdminActionLog;
use App\Models\Hashtag;
use App\Models\Video;
use App\Models\VideoMonetization;
use App\Services\FeedService;
use App\Services\MediaPresignService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdminVideoController extends Controller
{
    public function __construct(private StorageService $storage) {}

    public function index(Request $request): JsonResponse
    {
        $query = Video::with(['user:id,name,username,avatar', 'hashtags:id,name'])
            ->withTrashed();

        if ($userId = $request->get('user_id')) {
            $query->where('user_id', (int) $userId);
        }

        if ($q = $request->get('q')) {
            $query->where(fn ($b) =>
                $b->where('caption', 'ilike', "%{$q}%")
                  ->orWhere('title', 'ilike', "%{$q}%")
            );
        }

        $status = $request->get('status');
        if ($status === 'removed') {
            $query->whereNotNull('videos.deleted_at');
        } elseif ($status) {
            $query->whereNull('videos.deleted_at')->where('status', $status);
        }

        if ($contentType = $request->get('content_type')) {
            // Authoritative, mutually-exclusive classification.
            //   photo → image mime OR carousel (media_items present)
            //   video → has a video file, video/* (or unset) mime
            match ($contentType) {
                'video' => $query->whereNotNull('video_url')
                    ->where(fn ($b) => $b->where('mime_type', 'ilike', 'video/%')->orWhereNull('mime_type')),
                'photo' => $query
                    ->where(fn ($b) => $b->where('mime_type', 'ilike', 'image/%')->orWhereNotNull('media_items')),
                default => null,
            };
        }

        if ($request->get('flagged')) {
            $query->where('is_flagged', true);
        }

        $query->addSelect(DB::raw(
            '(SELECT ROUND(AVG(watch_duration)) FROM video_views WHERE video_id = videos.id) as avg_watch_time'
        ));

        $sort = match($request->get('sort', 'newest')) {
            'views'   => ['views_count', 'desc'],
            'likes'   => ['likes_count', 'desc'],
            'oldest'  => ['created_at', 'asc'],
            default   => ['created_at', 'desc'],
        };
        $query->orderBy($sort[0], $sort[1]);

        $paginator = $query->paginate((int) $request->get('per_page', 20));

        // MediaPresignService, not a hand-rolled signer - a prior duplicate here
        // used a retired HMAC-SHA256-hex scheme (the old Cloudflare Worker's
        // format) instead of the md5 secure_link_md5 format nginx actually
        // validates now, so every admin thumbnail/video URL 403'd at the media
        // origin (rendered as a broken thumbnail / an infinite-loading preview
        // player - no explicit error surfaces client-side for a 403 media
        // request). See VideoResource::signedCdnUrl()'s doc comment for the
        // same bug, already fixed there once.
        $resolve = function (?string $key): ?string {
            if (!$key) return null;
            if (Str::startsWith($key, 'http')) return $key;
            return MediaPresignService::signedMediaUrl($key, 120);
        };

        $items = collect($paginator->items())->map(function ($video) use ($resolve) {
            // Derive media_type the same way VideoResource does (raw models lack it).
            $mediaType = !empty($video->media_items)
                ? 'image_carousel'
                : (Str::startsWith((string) $video->mime_type, 'image/') ? 'image' : 'video');

            // Resolve carousel image URLs so the admin can preview them.
            $mediaItems = collect($video->media_items ?? [])
                ->map(fn ($it) => [
                    'url'   => $resolve($it['object_key'] ?? ($it['url'] ?? null)),
                    'order' => $it['order'] ?? 0,
                ])->values()->all();

            $video->video_url     = $resolve($video->video_url);
            $video->thumbnail_url = $resolve($video->thumbnail_url);

            $arr = $video->toArray();
            $arr['media_type']  = $mediaType;
            $arr['media_items'] = $mediaItems;
            return $arr;
        });

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

    public function show(int $id): JsonResponse
    {
        $video = Video::with([
            'user:id,name,username,avatar',
            'hashtags:id,name',
            'audioTrack:id,title,artist',
        ])->withTrashed()->findOrFail($id);

        return response()->json(['success' => true, 'data' => $video]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'title'             => ['nullable', 'string', 'max:100'],
            'caption'           => ['nullable', 'string', 'max:2200'],
            'category'          => ['nullable', 'string', 'max:100'],
            'location'          => ['nullable', 'string', 'max:255'],
            'language'          => ['nullable', 'string', 'max:10'],
            'hashtags'          => ['nullable', 'array', 'max:30'],
            'hashtags.*'        => ['string', 'max:50'],
            'status'            => ['nullable', 'in:published,draft,private,scheduled'],
            'allow_comments'    => ['nullable', 'boolean'],
            'allow_duet'        => ['nullable', 'boolean'],
            'allow_stitch'      => ['nullable', 'boolean'],
            'allow_download'    => ['nullable', 'boolean'],
            'is_ai_generated'   => ['nullable', 'boolean'],
            'is_flagged'        => ['nullable', 'boolean'],
            'is_pinned'         => ['nullable', 'boolean'],
            'moderation_status' => ['nullable', 'in:pending,approved,rejected,under_review'],
        ]);

        $video = Video::withTrashed()->findOrFail($id);

        $allowed = [
            'title', 'caption', 'category', 'location', 'language', 'status',
            'allow_comments', 'allow_duet', 'allow_stitch', 'allow_download',
            'is_ai_generated', 'is_flagged', 'is_pinned', 'moderation_status',
        ];
        $updateData = array_intersect_key($request->validated(), array_flip($allowed));
        $video->update($updateData);

        if ($request->has('hashtags') && is_array($request->hashtags)) {
            $tagIds = [];
            foreach ($request->hashtags as $tag) {
                $name = strtolower(trim((string) $tag, '#'));
                if (!$name) continue;
                $tagIds[] = Hashtag::firstOrCreate(['name' => $name])->id;
            }
            $old = $video->hashtags()->pluck('hashtags.id')->toArray();
            $video->hashtags()->sync($tagIds);
            if ($added   = array_diff($tagIds, $old)) Hashtag::whereIn('id', $added)->increment('videos_count');
            if ($removed = array_diff($old, $tagIds)) Hashtag::whereIn('id', $removed)->decrement('videos_count');
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'edit_video',
            target: $video,
            description: 'Admin edited video metadata',
        );

        return response()->json([
            'success' => true,
            'data'    => $video->fresh()->load(['user:id,name,username,avatar', 'hashtags:id,name', 'audioTrack:id,title,artist']),
            'message' => 'Video updated.',
        ]);
    }

    public function remove(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        $video = Video::findOrFail($id);
        $video->update([
            'is_flagged'          => true,
            'previous_status'     => $video->status,
            'deleted_by_admin_id' => $request->user()->id,
            'deletion_reason'     => $request->reason,
        ]);
        $video->delete();
        FeedService::flushFeedCache();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'remove_video',
            target: $video,
            description: 'Removed video: ' . ($request->reason ?? 'No reason given'),
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => 'Video removed.']);
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $request->validate(['restore_status' => ['nullable', 'string', 'in:published,draft,private']]);

        $video = Video::withTrashed()->findOrFail($id);
        $restoreStatus = $request->restore_status ?? $video->previous_status ?? 'published';

        $video->restore();
        $video->update([
            'is_flagged'           => false,
            'status'               => $restoreStatus,
            'previous_status'      => null,
            'deleted_by_user_id'   => null,
            'deleted_by_admin_id'  => null,
            'deletion_reason'      => null,
            'restored_at'          => now(),
            'restored_by_admin_id' => $request->user()->id,
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'restore_video',
            target: $video,
            description: "Restored video to status: {$restoreStatus}",
        );

        return response()->json(['success' => true, 'message' => 'Video restored.']);
    }

    public function feature(Request $request, int $id): JsonResponse
    {
        $request->validate(['featured' => ['required', 'boolean']]);

        $video = Video::findOrFail($id);
        $video->update(['is_pinned' => $request->featured]);

        AdminActionLog::record(
            admin: $request->user(),
            action: $request->featured ? 'feature_video' : 'unfeature_video',
            target: $video,
            description: ($request->featured ? 'Featured' : 'Unfeatured') . ' video',
        );

        return response()->json(['success' => true, 'message' => 'Video updated.']);
    }

    public function stats(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => [
                'total'      => Video::withTrashed()->count(),
                'published'  => Video::where('status', 'published')->count(),
                'draft'      => Video::where('status', 'draft')->count(),
                'private'    => Video::where('status', 'private')->count(),
                'removed'    => Video::onlyTrashed()->count(),
                'flagged'    => Video::where('is_flagged', true)->count(),
                'today'      => Video::whereDate('created_at', today())->count(),
                'this_week'  => Video::where('created_at', '>=', now()->subDays(7))->count(),
            ],
        ]);
    }

    // ── Edit-page comprehensive data ──────────────────────────────────────────

    public function editData(int $id): JsonResponse
    {
        $video = Video::with([
            'user:id,name,username,avatar',
            'hashtags:id,name',
            'audioTrack:id,title,artist',
            'monetization',
        ])->withTrashed()->findOrFail($id);

        $earnings = DB::table('creator_earnings')
            ->where('video_id', $id)
            ->selectRaw('SUM(amount) as total, COUNT(*) as count')
            ->first();

        $playlists = DB::table('playlists')
            ->where('user_id', $video->user_id)
            ->select('id', 'title')
            ->orderBy('title')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => [
                'video'     => $video,
                'earnings'  => $earnings,
                'playlists' => $playlists,
            ],
        ]);
    }

    // ── Partial update: interaction & audience settings ───────────────────────

    public function updateSettings(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'allow_replies'           => ['nullable', 'boolean'],
            'allow_duet'              => ['nullable', 'boolean'],
            'allow_stitch'            => ['nullable', 'boolean'],
            'allow_download'          => ['nullable', 'boolean'],
            'allow_sharing'           => ['nullable', 'boolean'],
            'allow_embedding'         => ['nullable', 'boolean'],
            'age_restriction'         => ['nullable', 'string', 'max:20'],
            'content_label'           => ['nullable', 'string', 'max:50'],
            'is_ai_generated'         => ['nullable', 'boolean'],
            'sensitive_warning'       => ['nullable', 'boolean'],
            'language'                => ['nullable', 'string', 'max:10'],
            'show_on_profile'         => ['nullable', 'boolean'],
            'notify_followers'        => ['nullable', 'boolean'],
            'send_push_after_publish' => ['nullable', 'boolean'],
        ]);

        $video = Video::withTrashed()->findOrFail($id);

        $allowed = [
            'allow_replies', 'allow_duet', 'allow_stitch', 'allow_download',
            'allow_sharing', 'allow_embedding', 'age_restriction', 'content_label',
            'is_ai_generated', 'sensitive_warning', 'language', 'show_on_profile',
            'notify_followers', 'send_push_after_publish',
        ];
        $video->update(array_intersect_key($request->validated(), array_flip($allowed)));

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_video_settings',
            target: $video,
            description: 'Admin updated video interaction/audience settings',
        );

        return response()->json([
            'success' => true,
            'data'    => $video->fresh()->load(['user:id,name,username,avatar', 'hashtags:id,name', 'audioTrack:id,title,artist', 'monetization']),
            'message' => 'Settings updated.',
        ]);
    }

    // ── Partial update: monetization ──────────────────────────────────────────

    public function updateMonetization(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'eligibility_status'          => ['nullable', 'string', 'max:30'],
            'review_status'               => ['nullable', 'string', 'max:30'],
            'reviewed_on'                 => ['nullable', 'date'],
            'next_review'                 => ['nullable', 'date'],
            'ad_revenue_sharing'          => ['nullable', 'boolean'],
            'creator_fund_active'         => ['nullable', 'boolean'],
            'tips_gifts_enabled'          => ['nullable', 'boolean'],
            'subscriptions_eligible'      => ['nullable', 'boolean'],
            'brand_partnerships_eligible' => ['nullable', 'boolean'],
            'shop_product_tagging'        => ['nullable', 'boolean'],
            'paid_promotion_disclosure'   => ['nullable', 'string', 'max:30'],
            'affiliate_links_enabled'     => ['nullable', 'boolean'],
            'brand_deals_allowed'         => ['nullable', 'boolean'],
            'auto_claim_brand_mentions'   => ['nullable', 'boolean'],
            'total_earnings'              => ['nullable', 'numeric', 'min:0'],
            'rpm'                         => ['nullable', 'numeric', 'min:0'],
            'cpm'                         => ['nullable', 'numeric', 'min:0'],
            'revenue'                     => ['nullable', 'numeric', 'min:0'],
            'next_payout'                 => ['nullable', 'numeric', 'min:0'],
            'payout_date'                 => ['nullable', 'date'],
            'payout_method'               => ['nullable', 'string', 'max:30'],
            'payout_currency'             => ['nullable', 'string', 'max:10'],
            'payout_status'               => ['nullable', 'string', 'max:30'],
            'allowed_regions'             => ['nullable', 'array'],
            'blocked_regions'             => ['nullable', 'array'],
            'policy_status'               => ['nullable', 'string', 'max:30'],
            'monetization_notes'          => ['nullable', 'string'],
        ]);

        $video = Video::withTrashed()->findOrFail($id);

        $monetizationFields = array_intersect_key($request->validated(), array_flip([
            'eligibility_status', 'review_status', 'reviewed_on', 'next_review',
            'ad_revenue_sharing', 'creator_fund_active', 'tips_gifts_enabled',
            'subscriptions_eligible', 'brand_partnerships_eligible', 'shop_product_tagging',
            'paid_promotion_disclosure', 'affiliate_links_enabled', 'brand_deals_allowed',
            'auto_claim_brand_mentions', 'total_earnings', 'rpm', 'cpm', 'revenue',
            'next_payout', 'payout_date', 'payout_method', 'payout_currency', 'payout_status',
            'allowed_regions', 'blocked_regions', 'policy_status', 'monetization_notes',
        ]));

        VideoMonetization::updateOrCreate(
            ['video_id' => $id],
            $monetizationFields,
        );

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_video_monetization',
            target: $video,
            description: 'Admin updated video monetization settings',
        );

        return response()->json([
            'success' => true,
            'data'    => $video->fresh()->load(['user:id,name,username,avatar', 'hashtags:id,name', 'audioTrack:id,title,artist', 'monetization']),
            'message' => 'Monetization updated.',
        ]);
    }

    // ── Partial update: visibility & distribution ─────────────────────────────

    public function updateVisibility(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'status'                  => ['nullable', 'in:published,draft,private,scheduled,unlisted'],
            'recommendation_eligible' => ['nullable', 'boolean'],
            'search_indexing'         => ['nullable', 'boolean'],
            'show_on_profile'         => ['nullable', 'boolean'],
            'region_allowed'          => ['nullable', 'json'],
            'region_blocked'          => ['nullable', 'json'],
            'shadowban_enabled'       => ['nullable', 'boolean'],
            'limited_distribution'    => ['nullable', 'boolean'],
            'limited_reason'          => ['nullable', 'string'],
            'allow_sharing'           => ['nullable', 'boolean'],
            'allow_download'          => ['nullable', 'boolean'],
        ]);

        $video = Video::withTrashed()->findOrFail($id);

        $allowed = [
            'status', 'recommendation_eligible', 'search_indexing', 'show_on_profile',
            'region_allowed', 'region_blocked', 'shadowban_enabled', 'limited_distribution',
            'limited_reason', 'allow_sharing', 'allow_download',
        ];
        $video->update(array_intersect_key($request->validated(), array_flip($allowed)));

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_video_visibility',
            target: $video,
            description: 'Admin updated video visibility and distribution settings',
        );

        return response()->json([
            'success' => true,
            'data'    => $video->fresh()->load(['user:id,name,username,avatar', 'hashtags:id,name', 'audioTrack:id,title,artist', 'monetization']),
            'message' => 'Visibility updated.',
        ]);
    }

    // ── Partial update: advanced / compliance ─────────────────────────────────

    public function updateAdvanced(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'moderation_status'    => ['nullable', 'in:pending,approved,rejected,under_review'],
            'review_priority'      => ['nullable', 'in:low,normal,high,urgent'],
            'legal_hold'           => ['nullable', 'boolean'],
            'reporting_sensitivity'=> ['nullable', 'in:low,standard,high'],
            'archive_status'       => ['nullable', 'in:active,archived'],
            'auto_archive_after'   => ['nullable', 'in:never,30days,90days,180days,1year'],
            'admin_notes'          => ['nullable', 'string'],
            'audit_notes'          => ['nullable', 'string'],
        ]);

        $video = Video::withTrashed()->findOrFail($id);

        $allowed = [
            'moderation_status', 'review_priority', 'legal_hold',
            'reporting_sensitivity', 'archive_status', 'auto_archive_after',
            'admin_notes', 'audit_notes',
        ];
        $video->update(array_intersect_key($request->validated(), array_flip($allowed)));

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_video_advanced',
            target: $video,
            description: 'Admin updated video advanced/compliance settings',
        );

        return response()->json([
            'success' => true,
            'data'    => $video->fresh()->load(['user:id,name,username,avatar', 'hashtags:id,name', 'audioTrack:id,title,artist', 'monetization']),
            'message' => 'Advanced settings updated.',
        ]);
    }

    // ── Quick actions ─────────────────────────────────────────────────────────

    public function unpublish(Request $request, int $id): JsonResponse
    {
        $video = Video::withTrashed()->findOrFail($id);
        $video->update(['status' => 'private']);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'unpublish_video',
            target: $video,
            description: 'Admin unpublished video (set to private)',
        );

        return response()->json(['success' => true, 'message' => 'Video unpublished.']);
    }

    public function runSafetyCheck(Request $request, int $id): JsonResponse
    {
        $video = Video::withTrashed()->findOrFail($id);
        $video->update(['content_check_status' => 'processing']);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'run_safety_check',
            target: $video,
            description: 'Admin triggered safety check on video',
        );

        return response()->json(['success' => true, 'message' => 'Safety check queued.']);
    }

    public function reprocess(Request $request, int $id): JsonResponse
    {
        $video = Video::withTrashed()->findOrFail($id);
        $video->update(['content_check_status' => 'processing']);

        // Previously this only flipped content_check_status (a moderation-scan
        // field) and logged the action - it never actually re-ran the
        // transcode, so the button did not do what its label said. Routes
        // through the same feature flag ProcessAudioMix uses, so an admin
        // reprocess uses whichever pipeline is currently active.
        if (config('services.apivideo.enabled')) {
            \App\Jobs\Video\StartTranscodingJob::dispatch($video->id)->onQueue('transcoding');
        } else {
            \App\Jobs\TranscodeVideoToHls::dispatch($video)->onQueue('transcoding');
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'reprocess_video',
            target: $video,
            description: 'Admin queued video for reprocessing',
        );

        return response()->json(['success' => true, 'message' => 'Video queued for reprocessing.']);
    }

    // ── Permanent delete (super admin only - deletes R2 files + DB row) ────────

    public function permanentDelete(Request $request, int $id): JsonResponse
    {
        $admin = $request->user();
        if (!$admin->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Admin access required.'], 403);
        }

        $video = Video::withTrashed()->findOrFail($id);

        // Delete all media from every configured bucket. StorageService::delete
        // fans out across them rather than trusting FILESYSTEM_DISK, so a stray
        // env var still cannot make this silently skip the cleanup - and while
        // both R2 and B2 hold live objects, a takedown that cleared only one of
        // them would leave the other copy reachable through the CDN fallback.
        $this->deleteVideoMedia($video);

        AdminActionLog::record(
            admin: $admin,
            action: 'permanent_delete_video',
            target: $video,
            description: 'Super admin permanently deleted video and all R2 media',
            severity: 'critical',
        );

        $video->forceDelete();
        FeedService::flushFeedCache();

        return response()->json(['success' => true, 'message' => 'Video permanently deleted.']);
    }

    private function deleteVideoMedia(Video $video): void
    {
        // HLS first, and via the whole-prefix delete rather than a single key.
        // The ladder is dozens of segment objects served UNSIGNED, so removing
        // only the database row - or only the master playlist key - would leave
        // a takedown streamable to anyone still holding a playlist URL.
        \App\Jobs\TranscodeVideoToHls::deleteHlsAssets($video->id);

        $keys = array_filter([
            $video->video_url,
            $video->thumbnail_url,
            $video->captions_file_url,
        ]);

        foreach ($keys as $key) {
            $this->storage->delete($key);
        }

        if (!empty($video->quality_urls) && is_array($video->quality_urls)) {
            foreach ($video->quality_urls as $url) {
                if (is_string($url) && $url) $this->storage->delete($url);
                elseif (is_array($url) && !empty($url['url'])) $this->storage->delete($url['url']);
            }
        }

        if (!empty($video->media_items) && is_array($video->media_items)) {
            foreach ($video->media_items as $item) {
                if (is_array($item) && !empty($item['object_key'])) {
                    $this->storage->delete($item['object_key']);
                }
            }
        }
    }
}
