<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use App\Services\MediaPresignService;
use App\Services\StorageService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class VideoResource extends JsonResource
{
    /**
     * Generate a CDN URL signed with HMAC-SHA256 so the Cloudflare Worker
     * at media.teezer.live can validate it without a backend round-trip.
     * TTL: 24h for public content, 2h for private/draft.
     */
    /**
     * Delegates to MediaPresignService rather than signing here.
     *
     * This method used to carry its own copy of the algorithm - HMAC-SHA256 as
     * hex, which is what the old Cloudflare Worker validated. When delivery
     * moved to nginx's secure_link (raw md5, URL-safe base64) that copy kept
     * minting tokens in the retired format, so every video URL 403'd at the
     * edge while the HLS playlists - which had been switched to the shared
     * helper - played perfectly. Two implementations of one signature is the
     * bug; there is now one.
     */
    private function signedCdnUrl(string $key, int $ttlMinutes): string
    {
        return MediaPresignService::signedMediaUrl($key, $ttlMinutes);
    }

    public function toArray(Request $request): array
    {
        $authUser  = $request->user();
        $disk      = config('filesystems.default', 'r2'); // same reasoning as signedCdnUrl
        $isPrivate = !in_array($this->status, ['published'], true);
        $ttl       = $isPrivate ? 120 : 1440; // 2h private, 24h public

        // Being publicly visible is necessary but NOT sufficient to serve the
        // tokenless /public/ mirror: the underlying boolean is computed live
        // from status/moderation/deleted_at, so it flips to true the instant
        // a video becomes public - before the async SyncPublicMediaMirror job
        // has had a chance to run, and before B2 has necessarily finished
        // propagating a just-copied object to every download node (observed
        // directly: a fresh copy can 404 through nginx's B2 proxy for a
        // window after the copy call itself already succeeded). Requiring
        // public_mirror_synced_at to be set - written only at the end of a
        // successful, verified sync() - means the tokenless URL is only ever
        // handed out once there's positive evidence the mirror is actually
        // there, not just that the video's status says it should be. Until
        // then, the proven signed-URL path is used, exactly as for any
        // protected video.
        //
        // Deliberately NOT PublicMediaMirrorService::isPublic($this->resource):
        // that method type-hints a real Video model, but $this->resource is
        // not always one - FeedController's ad-injection path re-wraps items
        // from a paginator that VideoResource::collection() already mutated
        // into VideoResource instances in place, so $this->resource can
        // itself be a VideoResource there. Every other field on this class
        // reads $this->status/etc via JsonResource's own magic __get, which
        // transparently delegates through any depth of resource nesting -
        // this inlines the identical boolean the same way, rather than
        // calling a strictly-typed method that breaks on that nesting
        // (confirmed in production logs: a TypeError here on exactly this).
        $isPublic  = $this->status === 'published'
            && $this->moderation_status !== 'rejected'
            && $this->deleted_at === null
            && $this->public_mirror_synced_at !== null;
        $mediaBase = rtrim((string) config('filesystems.disks.b2.url'), '/');

        // A single (non-carousel) photo post - unlike video, which gets a
        // server-generated cover via ProcessVideoThumbnail when none is
        // supplied (VideoService::createFromUpload), a photo has no such
        // job: nothing ever populates thumbnail_url for one. The photo
        // IS already a valid cover image, so this falls the thumbnail back
        // to the photo's own video_url rather than leaving it null - which
        // was rendering as a blank/black tile everywhere a post's cover is
        // shown (feed, grids), the same "post never shows a blank
        // thumbnail" guarantee video already has.
        $isImageMedia = empty($this->media_items) && Str::startsWith($this->mime_type ?? '', 'image/');

        $commentsCount = array_key_exists('visible_comments_count', $this->resource->getAttributes())
            ? (int) $this->visible_comments_count
            : (int) ($this->comments_count ?? 0);

        return [
            'id'            => $this->id,
            'title'         => $this->title,
            'caption'       => $this->caption,
            'video_url'     => empty($this->video_url)
                ? null
                : ($isPublic
                    ? $mediaBase . '/public/' . ltrim($this->video_url, '/')
                    : $this->signedCdnUrl($this->video_url, $ttl)),
            // Adaptive-bitrate playback.
            //
            // Public: points straight at the static, unsigned mirror
            // PublicMediaMirrorService keeps in B2 - no PHP involvement per
            // playback at all, since the mirrored master.m3u8 already
            // references its variants/segments by the same relative paths
            // the original does (verbatim copy, nothing rewritten).
            //
            // Protected: the API's own playlist route, not the storage URL -
            // HlsPlaylistController generates it per request so every segment
            // line carries its own signature, since a player never passes the
            // master's query string down to a relative segment.
            //
            // Null until the transcode finishes either way. Clients prefer
            // this when set and fall back to video_url, so a video is
            // playable the moment it is posted rather than only once the
            // ladder is built.
            'hls_url'       => empty($this->hls_master_key)
                ? null
                : ($isPublic
                    ? "{$mediaBase}/public/hls/{$this->id}/master.m3u8"
                    : url("/api/v1/videos/{$this->id}/hls/master.m3u8")),
            'hls_status'    => $this->hls_status,
            // Signed like everything else UNLESS public - the media origin
            // requires a token on every non-/public/ path, so an unsigned
            // thumbnail there is a 403 and a grey tile - and thumbnails are
            // the most visible media on the whole app.
            'thumbnail_url' => $this->thumbnail_url
                ? ($isPublic
                    ? $mediaBase . '/public/' . ltrim($this->thumbnail_url, '/')
                    : $this->signedCdnUrl($this->thumbnail_url, $ttl))
                : (($isImageMedia && !empty($this->video_url))
                    ? ($isPublic
                        ? $mediaBase . '/public/' . ltrim($this->video_url, '/')
                        : $this->signedCdnUrl($this->video_url, $ttl))
                    : null),
            'mime_type'     => $this->mime_type,
            'media_type'    => $this->when(true, function () use ($isImageMedia) {
                if (!empty($this->media_items)) return 'image_carousel';
                return $isImageMedia ? 'image' : 'video';
            }),
            'media_items'   => $this->when(!empty($this->media_items), function () use ($ttl) {
                return collect($this->media_items)->map(fn ($item) => [
                    'object_key' => $item['object_key'] ?? null,
                    'url'        => isset($item['object_key'])
                        ? MediaPresignService::signedMediaUrl($item['object_key'], $ttl)
                        : null,
                    'order'      => $item['order'] ?? 0,
                    'mime_type'  => $item['mime_type'] ?? null,
                ])->values();
            }),
            // quality_urls: map of quality label → signed CDN URL (null until FFmpeg job runs).
            // PHP coerces numeric string keys ('360','480'…) to integers; (object) cast forces
            // JSON object {} serialisation so the frontend receives {"360":url,"480":url,…}.
            'quality_urls' => $this->when(!empty($this->quality_urls), function () use ($ttl, $isPublic, $mediaBase) {
                $result = [];
                foreach ($this->quality_urls as $label => $key) {
                    // Indexed storage (0,1,2,…) - extract quality label from the R2 path
                    if (is_int($label)) {
                        preg_match('#/quality/([^/]+)/#', $key, $m);
                        $label = $m[1] ?? "q{$label}";
                    }
                    $result[(string) $label] = $isPublic
                        ? $mediaBase . '/public/' . ltrim($key, '/')
                        : $this->signedCdnUrl($key, $ttl);
                }
                return (object) $result; // stdClass always serialises as JSON object {}
            }),

            'category'       => $this->category,
            'location'       => $this->location,
            'link_url'       => $this->link_url,
            'language'       => $this->language ?? 'en',
            'allow_download' => (bool) ($this->allow_download ?? false),

            'duration'      => $this->duration,
            'file_size'     => $this->file_size,
            'width'         => $this->width,
            'height'        => $this->height,
            'aspect_ratio'  => ($this->width && $this->height)
                ? round($this->width / $this->height, 4)
                : null,
            'status'        => $this->status,
            'is_pinned'     => (bool) ($this->is_pinned ?? false),
            'pinned_at'     => $this->pinned_at?->toIso8601String(),
            'allow_comments'  => (bool) $this->allow_comments,
            'allow_duet'      => (bool) $this->allow_duet,
            'allow_stitch'    => (bool) $this->allow_stitch,
            'is_ai_generated' => (bool) ($this->is_ai_generated ?? false),

            'views_count'   => $this->views_count,
            'likes_count'   => $this->likes_count,
            'comments_count'=> $commentsCount,
            'saves_count'   => $this->saves_count,
            'shares_count'  => $this->shares_count,

            // Accurate engagement rate: (likes+comments+shares+saves) / views * 100
            'engagement_rate' => (function () use ($commentsCount) {
                $views = (int) ($this->views_count ?? 0);
                if ($views === 0) return 0.0;
                $interactions = (int) ($this->likes_count ?? 0)
                    + $commentsCount
                    + (int) ($this->shares_count ?? 0)
                    + (int) ($this->saves_count ?? 0);
                return round($interactions / $views * 100, 1);
            })(),

            // Actual watch time in seconds - only present when set by show() controller
            'watch_time_seconds' => $this->when(
                isset($this->resource->watch_time_seconds),
                fn () => (int) $this->resource->watch_time_seconds
            ),

            'is_liked' => $authUser ? (bool) $this->when(
                isset($this->is_liked), $this->is_liked,
                fn () => $this->isLikedBy($authUser)) : false,
            'is_saved' => $authUser ? (bool) $this->when(
                isset($this->is_saved), $this->is_saved,
                fn () => $this->isSavedBy($authUser)) : false,

            'hashtags' => $this->whenLoaded('hashtags', fn () =>
                $this->hashtags->pluck('name')),

            'audio' => $this->whenLoaded('audioTrack', fn () => $this->audioTrack ? [
                'id'     => $this->audioTrack->id,
                'title'  => $this->audioTrack->title,
                'artist' => $this->audioTrack->artist,
            ] : null),

            'audio_type'  => $this->audio_type,

            'music_track' => $this->whenLoaded('musicTrack', fn () => $this->musicTrack ? (function () use ($disk) {
                $mt         = $this->musicTrack;
                $isOriginal = ($mt->source_type ?? 'library') === 'original';
                // Original tracks store an R2 object key in cover_url; library tracks store full URLs.
                $coverUrl = $mt->cover_url
                    ? ($isOriginal && ! str_starts_with($mt->cover_url, 'http')
                        ? Storage::disk($disk)->url($mt->cover_url)
                        : $mt->cover_url)
                    : null;
                return [
                    'id'          => $mt->id,
                    'title'       => $mt->title,
                    'artist'      => $mt->artist_name,
                    'cover_url'   => $coverUrl,
                    'audio_url'   => $mt->audio_url,
                    'duration'    => $mt->duration,
                    'uses_count'  => (int) ($mt->uses_count ?? 0),
                    'source_type' => $mt->source_type ?? 'library',
                ];
            })() : null),

            // The audio project: two layers, their levels, and where the music
            // sits. One shape for every client, so the website's editor and the
            // app's cannot drift into different ideas of the same edit - and so
            // an export reproduces exactly what the preview played.
            //
            // Distinct from music_attribution below, which is about what was
            // RECOGNISED in the audio. This is about how it is MIXED.
            'audio_project' => [
                'project_duration_ms' => $this->project_duration_ms,
                'original' => [
                    'volume' => (int) ($this->original_audio_volume ?? 100),
                    'muted'  => (bool) $this->is_original_audio_muted,
                ],
                'music' => $this->music_track_id ? [
                    'track_id'        => $this->music_track_id,
                    'volume'          => (int) ($this->music_volume ?? 50),
                    'muted'           => (bool) $this->is_music_muted,
                    'source_start_ms' => $this->music_source_start_ms,
                    'source_end_ms'   => $this->music_source_end_ms,
                    'video_start_ms'  => $this->music_video_start_ms,
                    'fade_in_ms'      => (int) ($this->music_fade_in_ms ?? 0),
                    'fade_out_ms'     => (int) ($this->music_fade_out_ms ?? 0),
                    'auto_duck'       => (bool) $this->music_auto_duck,
                ] : null,
            ],

            // Who this video's audio is credited to, and the label to render.
            // Built server-side (App\Support\MusicAttribution) so iOS, Android
            // and the website cannot format it differently or disagree about
            // whose music it is. Separate from main_sound below, which is about
            // the sound the creator PICKED; this is about what was HEARD.
            'music_attribution' => \App\Support\MusicAttribution::for($this->resource),

            // Unified main-sound descriptor used by the feed disc and sound routing.
            'main_sound' => $this->whenLoaded('musicTrack', fn () => $this->musicTrack ? (function () use ($disk) {
                $mt         = $this->musicTrack;
                $isOriginal = ($mt->source_type ?? 'library') === 'original';
                $coverUrl   = $mt->cover_url
                    ? ($isOriginal && ! str_starts_with($mt->cover_url, 'http')
                        ? Storage::disk($disk)->url($mt->cover_url)
                        : $mt->cover_url)
                    : null;
                return [
                    'type'        => $isOriginal ? 'original_audio' : 'library_music',
                    'id'          => $mt->id,
                    'title'       => $mt->title,
                    'artist_name' => $mt->artist_name,
                    'cover_url'   => $coverUrl,
                    'route'       => '/sound/' . $mt->id,
                ];
            })() : null),

            'user' => $this->whenLoaded('user', fn () => [
                'id'          => $this->user->id,
                'username'    => $this->user->username,
                'name'        => $this->user->name,
                'avatar'      => $this->user->avatar
                    ? Storage::disk($disk)->url($this->user->avatar)
                    : StorageService::defaultAvatarUrl(),
                'is_verified' => (bool) $this->user->is_verified,
                // Use pre-batched attribute when set by FeedService (avoids N+1).
                // Falls back to a single query only on the individual video show endpoint.
                'is_following' => isset($this->is_following_creator)
                    ? (bool) $this->is_following_creator
                    : ($authUser
                        ? $authUser->following()->where('following_id', $this->user_id)->exists()
                        : false),
                // Profile stats - user.profile is always eager-loaded by FeedService/VideoController.
                // These power the follower/like counts on creator cards in the Following discovery grid.
                'followers_count' => (int) ($this->user->profile?->total_followers ?? 0),
                'likes_count'     => (int) ($this->user->profile?->total_likes      ?? 0),
                // Same batched-with-fallback pattern as is_following above - set
                // by Video::attachViewerFlags() on a feed page, computed directly
                // here only on the single-video show endpoint (never N+1 on a list).
                // Drives the story ring on the creator's avatar - see
                // MessageController::conversations()' has_story/has_unseen for the
                // identical fact computed the same way elsewhere.
                'has_story' => isset($this->creator_has_story)
                    ? (bool) $this->creator_has_story
                    : \App\Models\Story::where('user_id', $this->user_id)
                        ->where('status', 'published')
                        ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                        ->exists(),
                // Defaults to true (unseen/gradient) when not batched and there is
                // no viewer to check against - same "prefer a visible ring over a
                // silently muted one" default Avatar.tsx itself documents.
                'has_unseen' => isset($this->creator_story_unseen)
                    ? (bool) $this->creator_story_unseen
                    : ($authUser
                        ? \App\Models\Story::where('user_id', $this->user_id)
                            ->where('status', 'published')
                            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                            ->whereNotExists(fn ($q) => $q->selectRaw('1')
                                ->from('story_views')
                                ->whereColumn('story_views.story_id', 'stories.id')
                                ->where('story_views.viewer_id', $authUser->id))
                            ->exists()
                        : true),
            ]),

            // Explicitly tagged users ("Tag people"). Only present when the
            // relationship is eager-loaded (feed + single-video endpoints).
            // The frontend shows the feed tag indicator only when this is non-empty.
            'tagged_users' => $this->whenLoaded('taggedUsers', fn () =>
                $this->taggedUsers->map(fn ($u) => [
                    'id'           => $u->id,
                    'username'     => $u->username,
                    'display_name' => $u->name,
                    'avatar_url'   => $u->avatar
                        ? Storage::disk($disk)->url($u->avatar)
                        : StorageService::defaultAvatarUrl(),
                    'verified'     => (bool) $u->is_verified,
                ])->values()),

            // "Paid partnership" collab tags - same shape/rules as tagged_users
            // above, source_type='collab' instead of 'tag'.
            'collab_users' => $this->whenLoaded('collabUsers', fn () =>
                $this->collabUsers->map(fn ($u) => [
                    'id'           => $u->id,
                    'username'     => $u->username,
                    'display_name' => $u->name,
                    'avatar_url'   => $u->avatar
                        ? Storage::disk($disk)->url($u->avatar)
                        : StorageService::defaultAvatarUrl(),
                    'verified'     => (bool) $u->is_verified,
                ])->values()),

            // "Add link" → Teezer Product - see Video::featuredProducts().
            // Read live from `products` every time (never copied onto this
            // row), so an edited price or image always shows correctly here.
            'featured_products' => $this->whenLoaded('featuredProducts', fn () =>
                $this->featuredProducts->map(fn ($p) => [
                    'id'        => $p->id,
                    'name'      => $p->name,
                    'price'     => (float) $p->price,
                    'currency'  => $p->currency,
                    'image_url' => $p->image_url,
                ])->values()),

            'scheduled_at' => $this->scheduled_at?->toIso8601String(),
            'created_at'   => $this->created_at->toIso8601String(),
        ];
    }
}
