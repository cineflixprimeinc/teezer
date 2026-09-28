<?php

namespace App\Services;

use App\Models\Video;
use Aws\S3\S3Client;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Maintains a parallel, UNSIGNED copy of a video's public-facing media under a
 * "public/" B2 prefix, so a currently public+published video can be served by
 * nginx's /public/ location (deploy/nginx/reelsoo-media.conf) with no
 * secure_link token at all - see deploy/nginx/README.md for the full
 * reasoning.
 *
 * Access control for that prefix is existence, not a signature: sync() copies
 * into it, purge() deletes from it. A video that stops being public genuinely
 * 404s at origin on its next request the moment purge() finishes - nginx needs
 * no per-request database check, and no new nginx module, to enforce that.
 * Cloudflare's edge copy is additionally purged (CloudflarePurgeService) so
 * the same revocation is near-instant at the edge too, once a real API token
 * is configured - it is not the safety mechanism, the B2 delete already is.
 *
 * "Public" is the exact boolean HlsPlaylistController::show() already
 * computes for its own visibility gate - reused here via isPublic(), not
 * redefined.
 */
class PublicMediaMirrorService
{
    public function __construct(private readonly CloudflarePurgeService $cloudflare)
    {
    }

    public static function isPublic(Video $video): bool
    {
        return $video->status === 'published'
            && $video->moderation_status !== 'rejected'
            && $video->deleted_at === null;
    }

    /**
     * Bring the public mirror in line with $video's current state. Safe to
     * call on ANY change to $video, including ones that have nothing to do
     * with visibility - the HLS re-copy (the expensive part) only runs when
     * hls_ready_at has actually moved past what was last mirrored, so a
     * caption edit or admin note doesn't re-walk the whole hls/{id}/ prefix.
     */
    public function sync(Video $video): void
    {
        // Never trust a possibly-stale instance a caller/job constructor
        // captured - a job that sat in the queue while the row changed must
        // act on what the row is NOW, same reasoning SyncSearchDocument
        // already documents for itself.
        $video = $video->fresh() ?? $video;

        if (! self::isPublic($video)) {
            $this->purge($video);
            return;
        }

        $disk = $this->disk();

        if ($video->video_url) {
            $this->mirrorObject($disk, $video->video_url);
        }
        if ($video->thumbnail_url) {
            $this->mirrorObject($disk, $video->thumbnail_url);
        }
        foreach ($this->qualityKeys($video->quality_urls) as $key) {
            $this->mirrorObject($disk, $key);
        }

        if ($video->hls_master_key && ! $this->sameTimestamp($video->hls_ready_at, $video->public_mirror_hls_ready_at)) {
            $mirroredKeys = $this->mirrorHlsPrefix($disk, $video->id);

            $video->forceFill(['public_mirror_hls_ready_at' => $video->hls_ready_at])->saveQuietly();

            $this->cloudflare->purgeUrls($this->playlistUrls($mirroredKeys));
        }

        // A successful CopyObject/CopyObject-equivalent call is NOT proof the
        // object is actually reachable yet. Observed directly in production
        // (2026-08-23): a freshly-copied object can 404 through nginx's own
        // B2 proxy for many minutes after the copy call itself already
        // succeeded, while a HeadObject via the S3 API and even some direct
        // requests to the exact same native download endpoint succeed
        // immediately - inconsistent results across different connections to
        // the same request, which pointed to B2-side propagation across its
        // backend fleet rather than anything wrong in this config. Since
        // VideoResource only serves the tokenless URL once
        // public_mirror_synced_at is set, that field must mean "actually
        // reachable", not just "the copy call returned success" - otherwise
        // every publish has a real window where real clients get a 404.
        if (! $this->verifyReachable($video)) {
            Log::warning('PublicMediaMirrorService: mirror copied but not yet reachable, leaving unsynced for retry', ['video_id' => $video->id]);
            throw new \RuntimeException("Public mirror for video {$video->id} copied but not yet verifiably reachable");
        }

        $video->forceFill(['public_mirror_synced_at' => now()])->saveQuietly();
    }

    /**
     * Confirm the mirror is actually servable through the real public path -
     * not just present per the storage API - before letting VideoResource
     * start handing out the tokenless URL. Checks BOTH video_url's AND
     * thumbnail_url's mirror (whichever are present - every post type,
     * video or image, stores its primary file under video_url, but not
     * every post has a thumbnail yet) via the same cdn.reelsoo.com/public/...
     * URL a real client would use, retrying with backoff to ride out the
     * propagation window observed in production rather than treating one
     * lucky/unlucky connection as final.
     *
     * Originally checked video_url only, on the assumption that if ONE
     * mirrored object had propagated the rest had too. Confirmed wrong in
     * production (2026-08-23): video_url's copy can become reachable well
     * before thumbnail_url's does, so public_mirror_synced_at was getting
     * set - and VideoResource was switching thumbnail_url over to the
     * unsigned mirror path - while that thumbnail copy was still a 404 at
     * origin, with nothing ever re-checking it afterward. Thumbnails are
     * the most visible media on the whole app (see VideoResource's own
     * comment), so this is the one other asset worth the extra retry
     * budget; quality_urls' renditions are lower-visibility (only matter
     * mid-playback) and are left unverified here.
     */
    private function verifyReachable(Video $video): bool
    {
        $keys = array_filter([$video->video_url, $video->thumbnail_url]);
        if ($keys === []) {
            return true; // nothing to verify - let sync() finish as usual
        }

        $delays    = [2, 5, 10, 20, 30, 30, 30, 30]; // ~2.6 minutes total, spread rather than tight-looped
        $confirmed = [];

        foreach ($delays as $i => $delaySeconds) {
            if ($i > 0) {
                sleep($delaySeconds);
            }
            foreach ($keys as $key) {
                if (isset($confirmed[$key])) {
                    continue; // already reachable - don't keep re-checking it
                }
                $url = $this->publicUrl($this->publicKey($key));
                try {
                    $status = \Illuminate\Support\Facades\Http::timeout(10)->head($url)->status();
                    if ($status === 200 || $status === 206) {
                        $confirmed[$key] = true;
                    }
                } catch (\Throwable $e) {
                    // Treat like any other miss - keep retrying within budget.
                }
            }
            if (count($confirmed) === count($keys)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Remove every public/ object this video ever had mirrored - called
     * whenever it stops qualifying as public (status/moderation/soft-delete)
     * so its unsigned URL genuinely stops resolving at origin.
     */
    public function purge(Video $video): void
    {
        $this->purgeByKeys($video->id, $video->video_url, $video->thumbnail_url, $this->qualityKeys($video->quality_urls));

        // Only meaningful when the row still exists (a soft-delete or a
        // status flip away from public) - forceDelete() removes the row
        // before this ever runs, which is exactly why purgeByKeys() below
        // takes plain values instead of requiring a live model to write back
        // onto.
        if ($video->exists) {
            $video->forceFill([
                'public_mirror_synced_at'    => null,
                'public_mirror_hls_ready_at' => null,
            ])->saveQuietly();
        }
    }

    /**
     * Same purge, for when the Video row itself may already be gone
     * (forceDelete): Video::withTrashed()->find() finds nothing once a row
     * is truly removed, so a hard-delete dispatch (see SyncPublicMediaMirror)
     * carries these values captured at the moment of deletion instead of an
     * ID to re-look-up.
     *
     * @param list<string> $qualityKeys
     */
    public function purgeByKeys(int $videoId, ?string $videoUrl, ?string $thumbnailUrl, array $qualityKeys): void
    {
        $disk = $this->disk();

        $hlsPrefix        = "public/hls/{$videoId}";
        $mirroredHlsFiles = [];
        try {
            $mirroredHlsFiles = Storage::disk($disk)->allFiles($hlsPrefix);
            if ($mirroredHlsFiles !== []) {
                Storage::disk($disk)->delete($mirroredHlsFiles);
            }
        } catch (\Throwable $e) {
            Log::warning('PublicMediaMirrorService: could not delete HLS mirror', [
                'video_id' => $videoId,
                'error'    => $e->getMessage(),
            ]);
        }

        $urls = $this->playlistUrls($mirroredHlsFiles);

        foreach (array_merge([$videoUrl, $thumbnailUrl], $qualityKeys) as $key) {
            if (! $key) {
                continue;
            }
            $publicKey = $this->publicKey($key);
            $urls[]    = $this->publicUrl($publicKey);
            $this->deleteMirrored($disk, $publicKey);
        }

        $this->cloudflare->purgeUrls($urls);
    }

    /** @param mixed $qualityUrls The video's quality_urls array cast (label => key). @return list<string> */
    private function qualityKeys($qualityUrls): array
    {
        return collect($qualityUrls ?? [])
            ->filter(fn ($key) => is_string($key) && $key !== '')
            ->values()
            ->all();
    }

    /** Copy one object to its public/ mirror. Throws on failure so the caller's retry (SyncPublicMediaMirror) can recover a transient error. */
    private function mirrorObject(string $disk, string $sourceKey): void
    {
        if (StorageService::isPrivateKey($sourceKey)) {
            // Defense in depth: this should never be reachable (video_url/
            // thumbnail_url/quality_urls are never private-prefixed keys in
            // practice), but a public mirror is the one place a future bug
            // here would actually leak something, so refuse outright rather
            // than trust the caller.
            Log::warning('PublicMediaMirrorService: refused to mirror a private-prefixed key', ['key' => $sourceKey]);
            return;
        }

        $bucket = $this->bucket();

        try {
            $this->client()->copy($bucket, ltrim($sourceKey, '/'), $bucket, $this->publicKey($sourceKey), 'private');
        } catch (\Throwable $e) {
            Log::warning('PublicMediaMirrorService: copy failed', ['key' => $sourceKey, 'error' => $e->getMessage()]);
            throw $e;
        }
    }

    /** Copy every object under hls/{id}/ to public/hls/{id}/. @return list<string> the source keys that were copied. */
    private function mirrorHlsPrefix(string $disk, int $videoId): array
    {
        $files = Storage::disk($disk)->allFiles("hls/{$videoId}");

        foreach ($files as $sourceKey) {
            $this->mirrorObject($disk, $sourceKey);
        }

        return $files;
    }

    private function deleteMirrored(string $disk, string $publicKey): void
    {
        try {
            Storage::disk($disk)->delete($publicKey);
        } catch (\Throwable $e) {
            Log::warning('PublicMediaMirrorService: could not delete mirrored object', ['key' => $publicKey, 'error' => $e->getMessage()]);
        }
    }

    /**
     * The playlist URLs a new viewer actually resolves through, out of a list
     * of already-mirrored source (hls/...) keys - what purging needs to bust,
     * not every segment. Segments never change identity (immutable bytes
     * under an id-scoped path), so busting them buys nothing a new viewer
     * would notice; the playlist is what decides whether they resolve at all.
     *
     * @param list<string> $sourceKeys
     * @return list<string>
     */
    private function playlistUrls(array $sourceKeys): array
    {
        $base = rtrim((string) config('filesystems.disks.b2.url'), '/');

        return collect($sourceKeys)
            ->filter(fn ($key) => str_ends_with(strtolower($key), '.m3u8'))
            ->map(fn ($key) => $base . '/' . $this->publicKey($key))
            ->values()
            ->all();
    }

    private function publicKey(string $sourceKey): string
    {
        return 'public/' . ltrim($sourceKey, '/');
    }

    /** Full CDN URL for an already public/-prefixed key. */
    private function publicUrl(string $publicKey): string
    {
        $base = rtrim((string) config('filesystems.disks.b2.url'), '/');
        return $base . '/' . ltrim($publicKey, '/');
    }

    private function sameTimestamp(?Carbon $a, ?Carbon $b): bool
    {
        if ($a === null && $b === null) {
            return true;
        }
        if ($a === null || $b === null) {
            return false;
        }
        return $a->equalTo($b);
    }

    /**
     * Same disk-selection convention already used throughout this codebase
     * (VideoResource, TranscodeVideoToHls, MediaPresignService's fallback)
     * rather than a bespoke lookup - 'b2' in production, whatever
     * FILESYSTEM_DISK says in a partially-configured environment. Never
     * routes to 'b2_private' - the public mirror should never touch that
     * disk, mirrorObject()'s isPrivateKey() guard is the backstop if it ever
     * would.
     */
    private function disk(): string
    {
        return (string) config('filesystems.default', 'b2');
    }

    private function client(): S3Client
    {
        /** @var S3Client $client */
        $client = Storage::disk($this->disk())->getClient();
        return $client;
    }

    private function bucket(): string
    {
        return (string) config('filesystems.disks.' . $this->disk() . '.bucket');
    }
}
