<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\User;
use App\Models\UserModerationSetting;
use App\Models\Video;
use App\Models\VideoView;
use App\Services\FeedService;
use App\Services\GlobalControls\GlobalControlService;
use App\Services\MentionService;
use App\Services\MediaPresignService;
use App\Services\StorageService;
use App\Services\VideoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class VideoController extends Controller
{
    private const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/avi'];
    private const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    public function __construct(
        private readonly VideoService        $videoService,
        private readonly FeedService         $feedService,
        private readonly MediaPresignService $presign,
        private readonly MentionService      $mentions,
        private readonly StorageService      $storage,
        private readonly GlobalControlService $globalControls,
    ) {}

    /** Global Reelsoo Control's standard denial body for photo/video uploads. */
    private function uploadsBlockedResponse(bool $isImage): JsonResponse
    {
        return response()->json(
            $this->globalControls->deniedResponse($isImage ? 'photo_uploads_enabled' : 'video_uploads_enabled'),
            403,
        );
    }

    /**
     * Enforce daily upload limit. Returns a 403/429 response if blocked, null if allowed.
     * Priority: admin restrict_uploads → upload_suspension_until → daily_upload_limit (admin override
     * takes precedence over tier default; if null, tier default from User::defaultUploadLimit() is used).
     */
    private function checkUploadLimit(User $user): ?JsonResponse
    {
        $user->loadMissing('creatorProgress.level');
        $mod = UserModerationSetting::forUser($user->id);

        if ($mod->restrict_uploads) {
            return response()->json([
                'success' => false,
                'message' => 'Your upload access has been restricted by an administrator.',
            ], 403);
        }

        if ($mod->upload_suspension_until && $mod->upload_suspension_until->isFuture()) {
            return response()->json([
                'success' => false,
                'message' => 'Uploads are suspended until ' . $mod->upload_suspension_until->format('M d, Y H:i') . '.',
            ], 403);
        }

        $limit    = $mod->daily_upload_limit ?? $user->defaultUploadLimit();
        $uploaded = Video::where('user_id', $user->id)
            ->where('created_at', '>=', now()->subDay())
            ->count();

        if ($uploaded >= $limit) {
            $oldestInWindow = Video::where('user_id', $user->id)
                ->where('created_at', '>=', now()->subDay())
                ->orderBy('created_at')
                ->value('created_at');

            return response()->json([
                'success'   => false,
                'message'   => "Daily upload limit reached ({$limit} videos per 24 hours). Please try again later.",
                'data'      => [
                    'limit'     => $limit,
                    'uploaded'  => $uploaded,
                    'resets_at' => $oldestInWindow?->addDay()->toIso8601String(),
                ],
            ], 429);
        }

        return null;
    }

    private function maxVideoBytes(): int
    {
        return (int) config('services.upload.max_video_mb', 500) * 1024 * 1024;
    }

    private function maxImageBytes(): int
    {
        return (int) config('services.upload.max_image_mb', 20) * 1024 * 1024;
    }

    /** @deprecated Use maxVideoBytes() */
    private function maxUploadBytes(): int
    {
        return $this->maxVideoBytes();
    }

    // ── Feeds ─────────────────────────────────────────────────────────

    public function feed(Request $request): JsonResponse
    {
        $excludeIds = collect((array) $request->get('exclude_ids', []))
            ->map(fn ($v) => (int) $v)
            ->filter()
            ->values()
            ->all();

        $paginator = $this->feedService->forYou(
            $request->user(),
            (int) $request->get('per_page', 15),
            $excludeIds,
        );

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($paginator),
            'meta'    => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
                'next_page_url'=> $paginator->nextPageUrl(),
            ],
        ]);
    }

    public function followingFeed(Request $request): JsonResponse
    {
        $paginator = $this->feedService->following($request->user(), (int) $request->get('per_page', 15));

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($paginator),
            'meta'    => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
                'next_page_url'=> $paginator->nextPageUrl(),
            ],
        ]);
    }

    public function trending(Request $request): JsonResponse
    {
        // FeedService::trending() takes no viewer and so, unlike forYou/
        // following/forYouV2/forYouPools, does not batch the viewer flags itself.
        $paginator = $this->feedService->trending((int) $request->get('per_page', 20));

        Video::attachViewerFlags($paginator, $request->user());

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($paginator),
            'meta'    => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    // ── Single video ──────────────────────────────────────────────────

    public function show(Request $request, int $id): JsonResponse
    {
        $video = Video::with(['user.profile', 'hashtags', 'audioTrack', 'musicTrack', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->withVisibleCommentsCount()
            ->where('id', $id)
            ->firstOrFail();

        // Private/draft/scheduled/removed or rejected videos: only owner or admin
        // can view. 'scheduled' has to be listed explicitly here - every other
        // visibility check in the app (FeedService, UserController, HlsPlaylistController)
        // already treats it as non-public, but this direct-by-id lookup didn't,
        // so a guessed/incremented id could reveal a not-yet-live video (and a
        // freshly-signed URL for it) before its scheduled publish time.
        $isUnapproved = $video->moderation_status === 'rejected';
        if (in_array($video->status, ['draft', 'private', 'scheduled', 'removed']) || $isUnapproved) {
            $user = $request->user();
            if (!$user || ($user->id !== $video->user_id && !$user->isAdmin())) {
                return response()->json(['success' => false, 'message' => 'Video not found.'], 404);
            }
        }

        // Annotate auth-context flags
        if ($user = $request->user()) {
            $video->is_liked = DB::table('video_likes')
                ->where('user_id', $user->id)->where('video_id', $id)->exists();
            $video->is_saved = DB::table('video_saves')
                ->where('user_id', $user->id)->where('video_id', $id)->exists();
        }

        // Actual watch time from view events (single video - one extra query is fine)
        $video->watch_time_seconds = (int) DB::table('video_views')
            ->where('video_id', $id)
            ->whereNotNull('watch_duration')
            ->sum('watch_duration');

        return response()->json(['success' => true, 'data' => new VideoResource($video)]);
    }

    // ── Presigned R2 upload (browser PUTs directly to bucket) ─────────

    /**
     * Step 1 - issue a short-lived presigned PUT URL for the browser.
     * Body: { file_name, file_type, file_size }
     */
    public function uploadUrl(Request $request): JsonResponse
    {
        $allMimes = array_merge(self::ALLOWED_VIDEO_MIME, self::ALLOWED_IMAGE_MIME);

        $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'file_type' => ['required', 'string', 'in:' . implode(',', $allMimes)],
            'file_size' => ['required', 'integer', 'min:1'],
        ]);

        $mime     = $request->input('file_type');
        $isImage  = in_array($mime, self::ALLOWED_IMAGE_MIME);

        // Global Reelsoo Control - photo vs video are the same route, split
        // only by this mime check, so the per-type toggle has to live here
        // rather than as route-name middleware. The coarse uploads_enabled
        // switch (+ its emergency pair) already ran in
        // EnsureGlobalControlEnabled before this method was even reached.
        if (! $this->globalControls->isEnabled($isImage ? 'photo_uploads_enabled' : 'video_uploads_enabled')) {
            return $this->uploadsBlockedResponse($isImage);
        }

        $maxBytes = $isImage ? $this->maxImageBytes() : $this->maxVideoBytes();
        $fileSize = (int) $request->input('file_size');

        if ($fileSize > $maxBytes) {
            $maxMb = $isImage ? '20' : '500';
            return response()->json([
                'success' => false,
                'message' => "File exceeds the maximum allowed size of {$maxMb} MB.",
            ], 422);
        }

        // Presigned uploads need an S3-compatible disk - which is decided by the
        // DRIVER, not by the provider's name. This guard used to require the
        // disk to be literally 'r2', so every upload 503'd the moment
        // FILESYSTEM_DISK moved to B2, even though MediaPresignService had
        // already been made provider-agnostic and there is no 'r2' disk left in
        // config/filesystems.php. Testing the driver is what stops the next
        // provider change from breaking this again.
        if (! in_array(
            config('filesystems.disks.' . config('filesystems.default') . '.driver'),
            ['s3', 's3-signed'],
            true,
        )) {
            return response()->json([
                'success' => false,
                'message' => 'Direct uploads are not enabled on this environment.',
            ], 503);
        }

        $directory = $isImage ? 'images/original' : 'videos/original';

        $signed = $this->presign->createUploadUrl(
            userId:         $request->user()->id,
            fileName:       $request->input('file_name'),
            contentType:    $mime,
            directory:      $directory,
            expiresMinutes: 10,
        );

        if (!$isImage) {
            // No video row exists yet (that happens in completeUpload) - 0
            // is the documented "not yet known" value for this column, same
            // convention reelsoo.events already uses for video_id on
            // profile_view.
            \App\Services\Video\ProcessingEventStream::push([
                'type' => 'video_upload_started',
                'video_id' => 0,
                'user_id' => $request->user()->id,
                'payload' => json_encode(['object_key' => $signed['object_key'] ?? null]),
            ]);
        }

        return response()->json([
            'success' => true,
            'data'    => $signed,
        ]);
    }

    /**
     * Step 1b - issue a presigned PUT URL for a thumbnail image.
     * Body: { file_name, file_type, file_size }
     */
    public function thumbnailUploadUrl(Request $request): JsonResponse
    {
        $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'file_type' => ['required', 'string', 'in:image/jpeg,image/png,image/webp'],
            'file_size' => ['required', 'integer', 'min:1', 'max:' . (5 * 1024 * 1024)],
        ]);

        // Presigned uploads need an S3-compatible disk - which is decided by the
        // DRIVER, not by the provider's name. This guard used to require the
        // disk to be literally 'r2', so every upload 503'd the moment
        // FILESYSTEM_DISK moved to B2, even though MediaPresignService had
        // already been made provider-agnostic and there is no 'r2' disk left in
        // config/filesystems.php. Testing the driver is what stops the next
        // provider change from breaking this again.
        if (! in_array(
            config('filesystems.disks.' . config('filesystems.default') . '.driver'),
            ['s3', 's3-signed'],
            true,
        )) {
            return response()->json([
                'success' => false,
                'message' => 'Direct uploads are not enabled on this environment.',
            ], 503);
        }

        $signed = $this->presign->createUploadUrl(
            userId:         $request->user()->id,
            fileName:       $request->input('file_name'),
            contentType:    $request->input('file_type'),
            directory:      'thumbnails',
            expiresMinutes: 10,
        );

        return response()->json([
            'success' => true,
            'data'    => $signed,
        ]);
    }

    /**
     * Step 2 - register the upload once the browser has PUT to R2.
     * Body: { object_key, title, caption, hashtags[], status, duration,
     *         width, height, mime_type, file_size, thumbnail_key? }
     */
    public function completeUpload(Request $request): JsonResponse
    {
        $allMimes = array_merge(self::ALLOWED_VIDEO_MIME, self::ALLOWED_IMAGE_MIME);

        $request->validate([
            'object_key'      => ['required', 'string', 'max:500'],
            'title'           => ['nullable', 'string', 'max:255'],
            'caption'         => ['nullable', 'string', 'max:2200'],
            'category'        => ['nullable', 'string', 'max:100'],
            'location'        => ['nullable', 'string', 'max:255'],
            'link_url'        => ['nullable', 'url', 'max:500'],
            // "Add link" → Reelsoo Product - up to 3, ownership/active-status
            // re-verified server-side in VideoService::syncFeaturedProducts,
            // never trusted from these ids alone.
            'product_ids'     => ['nullable', 'array', 'max:3'],
            'product_ids.*'   => ['integer'],
            'hashtags'        => ['nullable', 'array', 'max:30'],
            'hashtags.*'      => ['string', 'max:50'],
            'status'          => ['nullable', 'in:published,draft,private,unlisted,scheduled'],
            'scheduled_at'    => ['nullable', 'date'],
            'duration'        => ['nullable', 'integer', 'min:1', 'max:600'],
            'width'           => ['nullable', 'integer', 'min:1', 'max:8192'],
            'height'          => ['nullable', 'integer', 'min:1', 'max:8192'],
            'mime_type'       => ['nullable', 'string', 'in:' . implode(',', $allMimes)],
            'file_size'       => ['nullable', 'integer', 'min:1'],
            'audio_track_id'           => ['nullable', 'integer', 'exists:audio_tracks,id'],
            'music_track_id'           => ['nullable', 'integer', 'exists:music_tracks,id'],
            'custom_audio_name'        => ['nullable', 'string', 'max:255'],
            'original_audio_volume'    => ['nullable', 'integer', 'min:0', 'max:100'],
            'music_volume'             => ['nullable', 'integer', 'min:0', 'max:100'],
            'is_original_audio_muted'  => ['nullable', 'boolean'],
            'is_music_muted'           => ['nullable', 'boolean'],
            // Music timeline. Accepted loosely here and reconciled in
            // AudioTimeline against the project duration and the track's real
            // length - a value inside these bounds can still be nonsense
            // (music starting after the video ends), so the rules that matter
            // live there rather than in a rule list that cannot see either.
            'project_duration_ms'      => ['nullable', 'integer', 'min:0', 'max:7200000'],
            'music_source_start_ms'    => ['nullable', 'integer', 'min:0'],
            'music_source_end_ms'      => ['nullable', 'integer', 'min:0'],
            'music_video_start_ms'     => ['nullable', 'integer', 'min:0'],
            'music_fade_in_ms'         => ['nullable', 'integer', 'min:0', 'max:3000'],
            'music_fade_out_ms'        => ['nullable', 'integer', 'min:0', 'max:3000'],
            'music_auto_duck'          => ['nullable', 'boolean'],
            'allow_comments'  => ['nullable', 'boolean'],
            'allow_duet'      => ['nullable', 'boolean'],
            'allow_stitch'    => ['nullable', 'boolean'],
            'is_ai_generated' => ['nullable', 'boolean'],
            'rights_confirmed'  => ['nullable', 'boolean'],
            'consent_confirmed' => ['nullable', 'boolean'],
            'thumbnail_key'   => ['nullable', 'string', 'max:500'],
            'media_items'              => ['nullable', 'array', 'max:10'],
            'media_items.*.object_key' => ['required_with:media_items', 'string', 'max:500'],
            'media_items.*.order'      => ['required_with:media_items', 'integer', 'min:0'],
            'media_items.*.mime_type'  => ['nullable', 'string', 'max:50'],
            'tagged_users'             => ['nullable', 'array', 'max:20'],
            'tagged_users.*.id'        => ['nullable', 'integer'],
            'tagged_users.*.username'  => ['nullable', 'string', 'max:64'],
            'collab_users'             => ['nullable', 'array', 'max:20'],
            'collab_users.*.id'        => ['nullable', 'integer'],
            'collab_users.*.username'  => ['nullable', 'string', 'max:64'],
        ]);

        // Global Reelsoo Control - draft is one value of the same `status`
        // field this endpoint already accepts, not a separate endpoint, so
        // the gate has to live here rather than as route-name middleware.
        if ($request->input('status') === 'draft' && ! $this->globalControls->isEnabled('draft_creation_enabled')) {
            return response()->json($this->globalControls->deniedResponse('draft_creation_enabled'), 403);
        }
        if ($request->filled('link_url') && ! $this->globalControls->isEnabled('external_links_enabled')) {
            return response()->json($this->globalControls->deniedResponse('external_links_enabled'), 403);
        }

        // Reject captions containing severe/abusive content.
        if ($request->filled('caption')
            && app(\App\Services\TextModerationService::class)->check($request->input('caption'))['action'] === 'block') {
            return response()->json(['success' => false, 'message' => 'Your caption may violate our community guidelines. Please edit it and try again.'], 422);
        }

        // Content rights confirmation is required to publish - not for a
        // draft, which is inherently unfinished. Enforced server-side (not
        // just in the app's own submitPost gate) since this is what gives
        // the attestation real legal weight: a client-only checkbox that
        // the server never actually requires isn't proof of anything.
        if ($request->input('status', 'published') !== 'draft' && !$request->boolean('rights_confirmed')) {
            return response()->json([
                'success' => false,
                'message' => 'Please confirm you own this content or have permission to post it before publishing.',
            ], 422);
        }

        $user    = $request->user();

        if ($err = $this->checkUploadLimit($user)) return $err;

        $key     = $request->input('object_key');
        $mime    = $request->input('mime_type', '');
        $isImage = in_array($mime, self::ALLOWED_IMAGE_MIME);

        // Key must belong to the correct directory for this media type.
        $directory = $isImage ? 'images/original' : 'videos/original';
        if (!$this->presign->keyBelongsToUser($key, $user->id, $directory)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid object key for this user.',
            ], 422);
        }

        // Confirm the file actually landed in the bucket and enforce the real size limit.
        // The presigned PUT URL has no Content-Length condition, so a client could claim
        // a small file_size to pass validation but upload an oversized file to R2.
        try {
            $fileFound = false;
            for ($attempt = 0; $attempt < 3; $attempt++) {
                if ($this->presign->objectExists($key)) { $fileFound = true; break; }
                if ($attempt < 2) sleep(1);
            }
            if (!$fileFound) {
                return response()->json([
                    'success' => false,
                    'message' => 'Uploaded file not found in storage. Please try again.',
                ], 422);
            }

            $maxBytes    = $isImage ? $this->maxImageBytes() : $this->maxVideoBytes();
            // Resolved across both object disks: during the R2 -> B2 migration a
            // fresh upload lands in whichever bucket is active, and hardcoding
            // one of them here would size a nonexistent object (null) and wave
            // every oversized file straight through the limit check.
            $actualBytes = $this->storage->size($key);
            if ($actualBytes !== null && $actualBytes > $maxBytes) {
                $this->storage->delete($key);
                $maxMb = $isImage ? '20' : '500';
                return response()->json([
                    'success' => false,
                    'message' => "Uploaded file exceeds the maximum allowed size of {$maxMb} MB.",
                ], 422);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('R2 objectExists/size check failed, proceeding anyway', [
                'key'   => $key,
                'error' => $e->getMessage(),
            ]);
            // Fall through - key ownership already validated above
        }

        if (Video::where('video_url', $key)->whereNull('deleted_at')->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'This upload has already been registered.',
            ], 422);
        }

        // From here the file is confirmed in R2. Any unrecoverable failure below must
        // clean it up so orphaned files never accumulate in the bucket.
        $disk = config('filesystems.default', 'r2');

        try {
            // The pre-publish content scan was removed from the upload path.
            // Publishing no longer blocks on a scan result, and no
            // media_content_checks row is created for a new upload.
            //
            // Existing rows and the videos.content_check_* columns are left
            // alone - they are the historical record behind the admin views,
            // and every one of those columns is nullable, so a video created
            // without them is valid.
            //
            // Moderation after the fact is unaffected: ScanVideoJob /
            // ScanImageJob still exist and are still dispatched by
            // ModerationController and the admin re-scan action.
            $thumbKey = $request->input('thumbnail_key');
            if ($thumbKey && !$this->presign->keyBelongsToUser($thumbKey, $user->id, 'thumbnails')) {
                $thumbKey = null;
            }

            $video = $this->videoService->createFromUpload(
                $user,
                $request->except(['object_key', 'thumbnail_key']),
                $key,
                $thumbKey,
            );

            // Notify the original sound owner when their audio is reused.
            $this->notifySoundUsed($video, $user);

            // Process @mentions in caption
            if ($video->caption) {
                $this->mentions->processMentions(
                    $video->caption,
                    $user,
                    'caption',
                    $video->id,
                    $video->id,
                );
            }

            // Process explicit "Tag people" selections - structured tag data, not caption text.
            $tagged = $request->input('tagged_users', []);
            if (is_array($tagged) && !empty($tagged)) {
                $this->mentions->processTaggedUsers($tagged, $user, $video->id);
            }

            // "Paid partnership" collab tags - same structured shape as tagged_users.
            $collab = $request->input('collab_users', []);
            if (is_array($collab) && !empty($collab)) {
                $this->mentions->processCollabUsers($collab, $user, $video->id);
            }
        } catch (\Throwable $e) {
            // On any failure after the file is confirmed in R2, delete it so the bucket
            // stays clean. Best-effort - swallow Storage errors.
            try {
                Storage::disk($disk)->delete($key);
                Log::info('completeUpload: deleted orphaned R2 file after failure', ['key' => $key]);
            } catch (\Throwable $deleteErr) {
                Log::warning('completeUpload: could not delete orphaned R2 file', [
                    'key'   => $key,
                    'error' => $deleteErr->getMessage(),
                ]);
            }
            throw $e;
        }

        return response()->json([
            'success' => true,
            'message' => 'Video published.',
            'data'    => new VideoResource($video),
        ], 201);
    }

    // ── Upload (legacy multipart - kept for the Flutter mobile app) ───

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'video'            => ['required', 'file', 'mimes:mp4,mov,webm', 'max:512000'],
            'thumbnail'        => ['nullable', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
            'caption'          => ['nullable', 'string', 'max:2200'],
            'status'           => ['nullable', 'in:published,draft,private,unlisted'],
            'allow_comments'   => ['nullable', 'boolean'],
            'allow_duet'       => ['nullable', 'boolean'],
            'allow_stitch'     => ['nullable', 'boolean'],
            'audio_track_id'   => ['nullable', 'integer', 'exists:audio_tracks,id'],
            'custom_audio_name'=> ['nullable', 'string', 'max:255'],
            'hashtags'         => ['nullable', 'array', 'max:30'],
            'hashtags.*'       => ['string', 'max:50'],
            'duration'         => ['nullable', 'integer', 'min:1', 'max:180'],
        ]);

        if ($err = $this->checkUploadLimit($request->user())) return $err;

        $video = $this->videoService->store(
            $request->user(),
            $request->except(['video', 'thumbnail']),
            $request->file('video'),
            $request->file('thumbnail'),
        );

        $this->notifySoundUsed($video, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Video uploaded successfully.',
            'data'    => new VideoResource($video),
        ], 201);
    }

    /** Notify the owner of a reused sound that someone published a video with it. */
    private function notifySoundUsed(\App\Models\Video $video, \App\Models\User $user): void
    {
        if (!$video->audio_track_id) {
            return;
        }
        $track = \App\Models\AudioTrack::find($video->audio_track_id);
        if (!$track || !$track->user_id || $track->user_id === $user->id || !$track->uploader) {
            return;
        }
        app(\App\Services\NotificationService::class)->notify($track->uploader, 'sound', [
            'actor_id'    => $user->id,
            'entity_type' => 'video',
            'entity_id'   => $video->id,
            'message'     => \App\Services\NotificationService::buildMessage('sound', $user->name, ['audio_title' => $track->title]),
        ]);
    }

    // ── Update ────────────────────────────────────────────────────────

    public function update(Request $request, int $id): JsonResponse
    {
        $video = Video::findOrFail($id);

        if ($request->user()->id !== $video->user_id && !$request->user()->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $request->validate([
            'caption'       => ['nullable', 'string', 'max:2200'],
            'status'        => ['nullable', 'in:published,draft,private,unlisted'],
            'allow_comments'=> ['nullable', 'boolean'],
            'allow_duet'    => ['nullable', 'boolean'],
            'allow_stitch'  => ['nullable', 'boolean'],
            'hashtags'      => ['nullable', 'array', 'max:30'],
            'hashtags.*'    => ['string', 'max:50'],
        ]);

        if ($request->filled('caption')
            && app(\App\Services\TextModerationService::class)->check($request->input('caption'))['action'] === 'block') {
            return response()->json(['success' => false, 'message' => 'Your caption may violate our community guidelines. Please edit it and try again.'], 422);
        }

        $video = $this->videoService->update($video, $request->all());

        // Update @mentions when caption is edited
        if ($request->has('caption') && $video->caption) {
            $this->mentions->updateMentions(
                $video->caption,
                $request->user(),
                'caption',
                $video->id,
                $video->id,
            );
        }

        return response()->json(['success' => true, 'data' => new VideoResource($video)]);
    }

    // ── Privacy settings ─────────────────────────────────────────────

    public function updatePrivacy(Request $request, int $id): JsonResponse
    {
        $video = Video::findOrFail($id);

        if ($request->user()->id !== $video->user_id && !$request->user()->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $request->validate([
            'visibility'     => ['required', 'in:public,private,unlisted'],
            'allow_comments' => ['nullable', 'boolean'],
            'allow_duet'     => ['nullable', 'boolean'],
            'allow_stitch'   => ['nullable', 'boolean'],
        ]);

        $statusMap = ['public' => 'published', 'private' => 'private', 'unlisted' => 'unlisted'];
        $status    = $statusMap[$request->input('visibility', 'public')];

        $video->update([
            'status'         => $status,
            'allow_comments' => $request->boolean('allow_comments', true),
            'allow_duet'     => $request->boolean('allow_duet',     true),
            'allow_stitch'   => $request->boolean('allow_stitch',   true),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Privacy settings updated.',
            'data'    => new VideoResource($video),
        ]);
    }

    // ── Pin / Unpin ───────────────────────────────────────────────────

    public function pin(Request $request, int $id): JsonResponse
    {
        $video = Video::findOrFail($id);

        if ($request->user()->id !== $video->user_id && !$request->user()->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $video->update(['is_pinned' => true, 'pinned_at' => now()]);

        return response()->json([
            'success' => true,
            'message' => 'Reel pinned to your profile.',
            'data'    => new VideoResource($video),
        ]);
    }

    public function unpin(Request $request, int $id): JsonResponse
    {
        $video = Video::findOrFail($id);

        if ($request->user()->id !== $video->user_id && !$request->user()->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $video->update(['is_pinned' => false, 'pinned_at' => null]);

        return response()->json([
            'success' => true,
            'message' => 'Reel unpinned from your profile.',
            'data'    => new VideoResource($video),
        ]);
    }

    // ── Delete ────────────────────────────────────────────────────────

    public function destroy(Request $request, int $id): JsonResponse
    {
        $video = Video::findOrFail($id);

        if ($request->user()->id !== $video->user_id && !$request->user()->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $this->videoService->destroy($video);

        return response()->json(['success' => true, 'message' => 'Video deleted.']);
    }

    // ── Record view ───────────────────────────────────────────────────

    public function recordView(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'watch_duration' => ['nullable', 'integer', 'min:1', 'max:180'],
            'source'         => ['nullable', 'string', 'max:50',
                'in:for_you,following,explore,profile,search,hashtag,direct,other'],
        ]);

        $video = Video::where('id', $id)
            ->whereIn('status', ['published', 'unlisted'])
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->first();
        if (!$video) {
            return response()->json(['success' => false], 404);
        }

        $userId    = $request->user()?->id;
        $authUser  = $request->user();

        // Don't count owner watching their own video
        if ($userId && $userId === $video->user_id) {
            return response()->json([
                'success'     => true,
                'counted'     => false,
                'views_count' => \App\Services\CounterBuffer::current('video', (int) $id, 'views_count', (int) $video->views_count),
            ]);
        }

        // Respect save_watch_history setting: count a deduped view, but do not
        // persist a VideoView row that would appear in watch history.
        if ($authUser && !($authUser->save_watch_history ?? true)) {
            $cacheKey = "video:view:no-history:{$id}:u{$authUser->id}";
            try {
                $shouldCount = Cache::add($cacheKey, true, now()->addHour());
            } catch (\Throwable) {
                $shouldCount = true;
            }
            if ($shouldCount) {
                \App\Services\CounterBuffer::add('video', (int) $id, 'views_count');
            }
            return response()->json([
                'success'     => true,
                'counted'     => (bool) $shouldCount,
                'views_count' => \App\Services\CounterBuffer::current('video', (int) $id, 'views_count', (int) $video->views_count),
            ]);
        }

        $counted = false;
        DB::transaction(function () use ($request, $id, $userId, $video, &$counted) {
            Video::whereKey($id)->lockForUpdate()->firstOrFail();

            $isDuplicate = VideoView::where('video_id', $id)
                ->when($userId, fn ($q) => $q->where('user_id', $userId))
                ->when(!$userId, fn ($q) => $q->where('ip_address', $request->ip()))
                ->where('created_at', '>=', now()->subHour())
                ->lockForUpdate()
                ->exists();

            if (!$isDuplicate) {
                VideoView::create([
                    'video_id'       => $id,
                    'user_id'        => $userId,
                    'ip_address'     => $request->ip(),
                    'watch_duration' => $request->input('watch_duration'),
                    'source'         => $request->input('source', 'other'),
                    'country'        => $this->resolveViewerCountry($request),
                    'city'           => $this->resolveViewerCity($request),
                    'device_type'    => $this->resolveViewerDeviceType($request),
                ]);
                // Buffer the view in Redis; counters:flush batches it into
                // videos.views_count once a minute (one UPDATE/row, not per view).
                \App\Services\CounterBuffer::add('video', (int) $id, 'views_count');
                $counted = true;
            }
        });

        return response()->json([
            'success'     => true,
            'counted'     => $counted,
            'views_count' => \App\Services\CounterBuffer::current('video', (int) $id, 'views_count', (int) $video->views_count),
        ]);
    }

    /**
     * Detect viewer country from Cloudflare's CF-IPCountry header (added by
     * the CDN for every proxied request - zero extra cost, no API calls).
     * Falls back to null when behind direct IP or on localhost.
     */
    private function resolveViewerCountry(\Illuminate\Http\Request $request): ?string
    {
        $code = $request->header('CF-IPCountry');
        if (!$code || $code === 'XX' || !preg_match('/^[A-Z]{2}$/', $code)) {
            return null;
        }
        // Convert ISO-3166-1 alpha-2 code to full name using existing service.
        try {
            $name = \App\Services\IsoCountries::nameFor($code);
            return $name ?: $code;
        } catch (\Throwable) {
            return $code;
        }
    }

    /**
     * Viewer city from Cloudflare's CF-IPCity header (added by the "Add visitor
     * location headers" managed transform). Null until that transform is enabled
     * or when the request isn't proxied by Cloudflare. This is what fills the
     * Studio "Top Cities" panel - the whole pipeline below (analytics event →
     * ClickHouse creator_audience_daily.city → /studio/analytics/dashboard) is
     * already keyed on city and only ever saw empty values.
     */
    private function resolveViewerCity(\Illuminate\Http\Request $request): ?string
    {
        $city = rawurldecode(trim((string) $request->header('CF-IPCity')));
        if ($city === '' || strlen($city) > 100) {
            return $city === '' ? null : mb_substr($city, 0, 100);
        }
        return $city;
    }

    /**
     * Classify device type from User-Agent string.
     * Returns 'mobile', 'tablet', or 'desktop'.
     */
    private function resolveViewerDeviceType(\Illuminate\Http\Request $request): string
    {
        $ua = strtolower((string) $request->userAgent());
        if (str_contains($ua, 'tablet') || str_contains($ua, 'ipad')) {
            return 'tablet';
        }
        if (str_contains($ua, 'mobile') || str_contains($ua, 'android') || str_contains($ua, 'iphone')) {
            return 'mobile';
        }
        return 'desktop';
    }
}
