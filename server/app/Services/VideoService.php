<?php

namespace App\Services;

use App\Jobs\ProcessAudioMix;
use App\Jobs\ProcessVideoQualities;
use App\Jobs\ProcessVideoThumbnail;
use App\Models\Hashtag;
use App\Models\MusicTrack;
use App\Models\Product;
use App\Models\Shop;
use App\Models\User;
use App\Models\Video;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use App\Services\FeedService;

class VideoService
{
    public function __construct(
        private readonly StorageService $storage,
        private readonly \App\Services\GlobalControls\GlobalControlService $globalControls,
    ) {}

    /**
     * Store a new video: save file → create DB record → attach hashtags → queue thumbnail job.
     */
    public function store(User $user, array $data, UploadedFile $file, ?UploadedFile $thumbnail = null): Video
    {
        return DB::transaction(function () use ($user, $data, $file, $thumbnail) {
            $videoPath     = $this->storage->storeVideo($file, 'videos');
            $thumbnailPath = null;

            if ($thumbnail) {
                $thumbnailPath = $this->storage->storeImage($thumbnail, 'thumbnails');
            }

            $video = Video::create([
                'user_id'           => $user->id,
                'caption'           => $data['caption']          ?? null,
                'country_code'      => $this->countryForHashtagPivot($user)['code'],
                'video_url'         => $videoPath,
                'thumbnail_url'     => $thumbnailPath,
                'mime_type'         => $file->getMimeType(),
                'duration'          => $data['duration']         ?? null,
                'file_size'         => $file->getSize(),
                'audio_track_id'    => $data['audio_track_id']   ?? null,
                'custom_audio_name' => $data['custom_audio_name'] ?? null,
                'status'            => $data['status']           ?? 'published',
                'allow_comments'    => $data['allow_comments']   ?? true,
                'allow_duet'        => $data['allow_duet']       ?? true,
                'allow_stitch'      => $data['allow_stitch']     ?? true,
                'moderation_status' => 'approved',
            ]);

            if (!empty($data['hashtags'])) {
                $this->syncHashtags($video, $data['hashtags']);
            }

            if (!$thumbnailPath) {
                ProcessVideoThumbnail::dispatch($video)->onQueue('transcoding');
            }

            return $video->load('user', 'hashtags');
        });
    }

    /**
     * Create a Video row from a key already uploaded to R2 by the browser
     * (presigned PUT flow). Metadata comes from the client; the object key
     * is trusted only after upstream code has validated it with MediaPresignService.
     */
    public function createFromUpload(User $user, array $data, string $objectKey, ?string $thumbnailKey = null): Video
    {
        return DB::transaction(function () use ($user, $data, $objectKey, $thumbnailKey) {
            $video = Video::create([
                'user_id'           => $user->id,
                'title'             => $data['title']             ?? null,
                'caption'           => $data['caption']           ?? null,
                'category'          => ($data['category'] ?? '') ?: null,
                'location'          => ($data['location'] ?? '') ?: null,
                'link_url'          => ($data['link_url'] ?? '') ?: null,
                'country_code'      => $this->countryForHashtagPivot($user)['code'],
                'video_url'         => $objectKey,
                'media_items'       => $data['media_items']       ?? null,
                'thumbnail_url'     => $thumbnailKey,
                'mime_type'         => $data['mime_type']         ?? null,
                'duration'          => $data['duration']          ?? null,
                'file_size'         => $data['file_size']         ?? null,
                'width'             => $data['width']             ?? null,
                'height'            => $data['height']            ?? null,
                'audio_track_id'          => $data['audio_track_id']          ?? null,
                'music_track_id'          => $data['music_track_id']          ?? null,
                'audio_type'              => !empty($data['music_track_id']) ? 'library_music' : null,
                'custom_audio_name'       => $data['custom_audio_name']       ?? null,
                // Both audio layers - levels, mutes, and where the music sits -
                // resolved in one place. AudioTimeline re-derives every offset
                // from the project duration and the track's real length rather
                // than trusting what the client sent, so a selection that ran
                // past the end of the video (or the song) comes back clamped
                // instead of producing audio after the picture stops.
                ...app(\App\Services\AudioTimeline::class)->resolve(
                    $data,
                    isset($data['project_duration_ms'])
                        ? (int) $data['project_duration_ms']
                        // Older clients send only whole seconds. Promoting that
                        // keeps the boundary rule working for them, at second
                        // precision, rather than leaving it unbounded.
                        : (isset($data['duration']) ? (int) round((float) $data['duration'] * 1000) : null),
                ),
                'status'                  => $data['status']                  ?? 'published',
                'scheduled_at'      => ($data['status'] ?? '') === 'scheduled'
                    ? ($data['scheduled_at'] ?? now()->addDay())
                    : null,
                'allow_comments'    => $data['allow_comments']    ?? true,
                'allow_duet'        => $data['allow_duet']        ?? true,
                'allow_stitch'      => $data['allow_stitch']      ?? true,
                'is_ai_generated'   => (bool) ($data['is_ai_generated'] ?? false),
                // Real, timestamped legal attestations - see the migration
                // that added these columns for why. rights_confirmed is
                // enforced as required-to-publish by the validation in
                // VideoController::completeUpload, not here (a draft can
                // still be saved without it).
                'rights_confirmed'     => (bool) ($data['rights_confirmed'] ?? false),
                'rights_confirmed_at'  => ($data['rights_confirmed'] ?? false) ? now() : null,
                'consent_confirmed'    => (bool) ($data['consent_confirmed'] ?? false),
                'consent_confirmed_at' => ($data['consent_confirmed'] ?? false) ? now() : null,
                'moderation_status' => 'approved',
            ]);

            if (!empty($data['hashtags'])) {
                $this->syncHashtags($video, $data['hashtags']);
            }

            if (!empty($data['product_ids'])) {
                $this->syncFeaturedProducts($video, $user, $data['product_ids']);
            }

            // Priority rule: library music takes precedence.
            // Only create an original-audio track when:
            //   - no library track was selected
            //   - the upload is a VIDEO (images and carousels have no original audio)
            //   - the original audio is not muted
            $isVideoUpload = str_starts_with($data['mime_type'] ?? '', 'video/');
            if (!empty($data['music_track_id'])) {
                // Library music selected (video OR photo) - bump its usage counter.
                MusicTrack::where('id', $data['music_track_id'])->increment('uses_count');
            } elseif ($isVideoUpload && ! ($data['is_original_audio_muted'] ?? false)) {
                // No library track + unmuted video → expose the clip's original audio
                // as its own sound page.
                $trackTitle  = !empty($data['custom_audio_name'])
                    ? trim($data['custom_audio_name'])
                    : 'Original Track';

                // Cover: use video thumbnail if set, otherwise fall back to creator's avatar
                $trackCover = $thumbnailKey
                    ? $this->storage->url($thumbnailKey)
                    : ($user->avatar ? $this->storage->url($user->avatar) : null);

                $originalTrack = MusicTrack::create([
                    'title'                 => $trackTitle,
                    'artist_name'           => $user->name ?: ('@' . $user->username),
                    'audio_url'             => $this->storage->url($objectKey),
                    'cover_url'             => $trackCover,
                    'status'                => 'published',
                    'source_type'           => 'original',
                    'source_video_id'       => $video->id,
                    'uses_count'            => 1,
                    'show_in_studio'        => false,
                    'show_in_upload_picker' => false,
                    'allow_reels'           => true,
                    'allow_stories'         => true,
                ]);

                $video->update([
                    'music_track_id' => $originalTrack->id,
                    'audio_type'     => 'original_audio',
                ]);
            }
            // Otherwise (photo/carousel with no music, or a muted video with no
            // library track): no sound page - audio_type stays null.

            if ($isVideoUpload) {
                \App\Services\Video\ProcessingEventStream::push([
                    'type' => 'video_upload_completed',
                    'video_id' => $video->id,
                    'user_id' => $user->id,
                ]);
            }

            // Dispatch audio mix + quality transcoding pipeline
            ProcessAudioMix::dispatch($video)->onQueue('transcoding');

            // No client-side cover for this video → extract one server-side so the
            // post never shows a black/blank thumbnail in the grids or feed.
            if ($isVideoUpload && empty($thumbnailKey)) {
                ProcessVideoThumbnail::dispatch($video)->onQueue('transcoding');
            }

            // 'featuredProducts' so the create response itself reflects
            // what syncFeaturedProducts just attached, above - without it
            // VideoResource::featured_products is silently absent from
            // this response (whenLoaded on an unloaded relation), even
            // though the pivot rows were really written.
            return $video->load('user', 'hashtags', 'featuredProducts');
        });
    }

    /**
     * Update video metadata and hashtags.
     */
    public function update(Video $video, array $data): Video
    {
        $video->update(array_filter([
            'caption'        => $data['caption']        ?? $video->caption,
            'status'         => $data['status']         ?? $video->status,
            'allow_comments' => $data['allow_comments'] ?? $video->allow_comments,
            'allow_duet'     => $data['allow_duet']     ?? $video->allow_duet,
            'allow_stitch'   => $data['allow_stitch']   ?? $video->allow_stitch,
        ], fn ($v) => $v !== null));

        if (isset($data['hashtags'])) {
            $this->syncHashtags($video, $data['hashtags']);
        }

        return $video->fresh()->load('user', 'hashtags');
    }

    /**
     * User-initiated soft-delete: keeps all media in R2, just hides the video.
     * Files are only purged when an admin performs a permanent delete.
     */
    public function destroy(Video $video): void
    {
        $video->update([
            'previous_status'     => $video->status,
            'deleted_by_user_id'  => auth()->id(),
        ]);
        $video->delete();
        FeedService::flushFeedCache();
    }

    /**
     * "Add link" → Teezer Product - the complete desired set, same
     * full-resync shape as MentionService::syncTaggedUsers (the list is
     * capped at 3, so a delete-then-reinsert is simpler and just as correct
     * as a diff, and it naturally handles reordering too - a plain diff
     * wouldn't move a row that's staying but changed position).
     *
     * Ownership, active status and the 3-item cap are ALL re-verified here,
     * never trusted from the caller - $productIds is whatever the client
     * sent. Called from both completeUpload (create) and updateFull (edit)
     * via the same VideoService instance both controllers already inject,
     * so this validation exists in exactly one place.
     *
     * Public (unlike syncHashtags above) because both call sites need it.
     */
    public function syncFeaturedProducts(Video $video, User $user, array $productIds): void
    {
        $productIds = array_slice(
            array_values(array_unique(array_map('intval', array_filter($productIds, 'is_numeric')))),
            0,
            3, // hard server-side cap - belt and suspenders alongside the max:3 validation rule
        );

        DB::table('video_products')->where('video_id', $video->id)->delete();

        if (empty($productIds)) {
            return;
        }

        $shop = Shop::where('user_id', $user->id)->first();
        if (!$shop) {
            return; // no shop of their own - nothing can legitimately be attached
        }

        // Ownership (must be a product in THIS shop) and eligibility (must
        // still be active) - never assume the id the client sent is either.
        $owned = Product::whereIn('id', $productIds)
            ->where('shop_id', $shop->id)
            ->where('is_active', true)
            ->pluck('id')
            ->flip();

        $rows = [];
        $position = 0;
        $now = now();
        foreach ($productIds as $id) {
            if (!$owned->has($id)) continue; // not theirs, or no longer active - silently dropped, not attached
            $rows[] = [
                'video_id'   => $video->id,
                'product_id' => $id,
                'position'   => $position++,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows) {
            DB::table('video_products')->insert($rows);
        }
    }

    /**
     * Sync hashtags: create missing ones, increment counts, update pivot.
     */
    private function syncHashtags(Video $video, array $tags): void
    {
        $tagIds = [];
        $country = $this->countryForHashtagPivot($video->user);
        $now = now();

        // Global Teezer Control - hashtag_creation_enabled only stops a NEW
        // hashtag from being minted; an already-existing one still attaches
        // normally either way, and the post itself is never rejected over
        // this (see the registry's own description for why: rejecting the
        // whole upload over one unrecognized tag would be far more
        // disruptive than just not creating it).
        $allowCreate = $this->globalControls->isEnabled('hashtag_creation_enabled');

        foreach ($tags as $name) {
            $name = strtolower(trim($name, '#'));
            if (!$name) continue;
            $hashtag = $allowCreate ? Hashtag::firstOrCreate(['name' => $name]) : Hashtag::where('name', $name)->first();
            if (! $hashtag) continue;
            $tagIds[$hashtag->id] = [
                'country_code' => $country['code'],
                'country_name' => $country['name'],
                'created_at'   => $now,
                'updated_at'   => $now,
            ];
        }

        $newIds = array_keys($tagIds);
        $old = $video->hashtags()->pluck('hashtags.id')->toArray();
        $video->hashtags()->sync($tagIds);

        // Increment/decrement videos_count on hashtag table
        $added   = array_diff($newIds, $old);
        $removed = array_diff($old, $newIds);
        if ($added)   Hashtag::whereIn('id', $added)->increment('videos_count');
        if ($removed) Hashtag::whereIn('id', $removed)->decrement('videos_count');
    }

    private function countryForHashtagPivot(User $user): array
    {
        $code = strtoupper((string) ($user->selected_country_code ?: $this->countryNameToCode((string) $user->country) ?: $user->detected_country_code));

        if ($code && IsoCountries::isValid($code)) {
            return ['code' => $code, 'name' => IsoCountries::nameFor($code)];
        }

        $name = $user->selected_country_name ?: $user->country ?: $user->detected_country_name;
        $resolved = $this->countryNameToCode((string) $name);

        if ($resolved) {
            return ['code' => $resolved, 'name' => IsoCountries::nameFor($resolved)];
        }

        return ['code' => null, 'name' => 'Global'];
    }

    private function countryNameToCode(string $name): ?string
    {
        $name = trim($name);
        if ($name === '') return null;

        foreach (IsoCountries::map() as $code => $label) {
            if (strcasecmp($label, $name) === 0) return $code;
        }

        if (strcasecmp($name, 'USA') === 0 || strcasecmp($name, 'United States of America') === 0) {
            return 'US';
        }

        return null;
    }
}
