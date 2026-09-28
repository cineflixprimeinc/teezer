<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Video;
use App\Services\MediaPresignService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\UnableToReadFile;

/**
 * Serves HLS playlists with a signed URL written into every line.
 *
 * This exists because of one property of HLS: a playlist addresses its segments
 * by RELATIVE path, and players do not carry the parent's query string down to
 * them. So a signed master.m3u8 buys nothing - the player immediately requests
 * `360p/index.m3u8` and then `seg_00000.ts` with no token at all, and either
 * every segment is public or playback 403s on the first one.
 *
 * The fix is to stop serving playlists as static objects and generate them per
 * request, rewriting each reference into a fully-signed absolute URL. Playlists
 * are a few hundred bytes of text, so doing this in PHP costs nothing; the
 * segments - the actual megabytes - never touch this server and go straight
 * from nginx to the client.
 *
 * Tokens on segment lines are deliberately longer-lived than the playlist's own
 * cache lifetime. A viewer who pauses twenty minutes into a long video and
 * resumes still holds the playlist they were given, and short segment tokens
 * would leave them stalled on a 410 with no way to recover but a full reload.
 */
class HlsPlaylistController extends Controller
{
    /** Segment links must outlive a paused player, not just the playlist fetch. */
    private const SEGMENT_TTL_MINUTES = 240;

    /** Variant playlists are re-signed by the master, so they can be shorter. */
    private const VARIANT_TTL_MINUTES = 240;

    /**
     * How long the rewritten (signed) playlist body is kept in Redis, keyed
     * off the video's own hls_ready_at so a re-transcode invalidates it
     * automatically. Matches the public response's own max-age=300 below -
     * the origin cache should never outlive what the edge already promises.
     *
     * This exists on top of the edge/browser cache, not instead of it: a
     * $visible=false (owner-preview) response is 'private, no-store' and
     * never touches Cloudflare, so every preview reload previously meant a
     * fresh B2 get() + PHP rewrite. Caching server-side here is still safe
     * for that path - Redis is never exposed to a client, so it can't leak
     * the private response the way a shared HTTP cache would (see the
     * Cache-Control comment below); it just spares the SAME already-
     * authorized owner repeat B2 round trips.
     */
    private const PLAYLIST_CACHE_SECONDS = 300;

    /**
     * GET /videos/{video}/hls/master.m3u8
     * GET /videos/{video}/hls/{variant}/index.m3u8
     */
    public function show(Request $request, Video $video, ?string $variant = null): Response
    {
        if (empty($video->hls_master_key)) {
            return response('Not found.', 404);
        }

        // Only published, un-rejected videos stream. Without this the signed
        // URL becomes a way to keep watching something moderation removed.
        $visible = $video->status === 'published'
            && $video->moderation_status !== 'rejected'
            && $video->deleted_at === null;

        if (! $visible && (int) optional($request->user())->id !== (int) $video->user_id) {
            return response('Not found.', 404);
        }

        // hls/{id}/master.m3u8 -> hls/{id}
        $prefix = rtrim(dirname($video->hls_master_key), '/');
        $key    = $variant === null
            ? $video->hls_master_key
            : $prefix . '/' . $variant . '/index.m3u8';

        // The variant name comes from the URL, so it is constrained to the
        // shapes the transcoder emits. Without this, "../../.." walks out of
        // the video's own prefix and signs somebody else's object.
        if ($variant !== null && ! preg_match('/^\d{3,4}p$/', $variant)) {
            return response('Not found.', 404);
        }

        // Versioned on hls_ready_at so a re-transcode (new segments, new
        // ladder rungs) can never serve a stale rewritten body out of Redis -
        // the key itself changes the moment the video's HLS output does.
        //
        // hls_ready_at is null for the entire transcode, though - it is only
        // set once the whole ladder finishes - and TranscodeVideoToHls now
        // publishes master.m3u8 incrementally, one rung at a time, as soon
        // as the first rendition lands. Without a fallback, every request
        // made while a video is still transcoding would collide on the same
        // ":0" key and could stick a viewer on the first cached rung-subset
        // for the rest of the 5-minute TTL even after a higher rung landed.
        // updated_at moves on every one of those incremental writes (plain
        // Eloquent touch), so it stands in as the version stamp until
        // hls_ready_at takes over for good.
        $cacheKey = sprintf(
            'hls-playlist:%d:%s:%s',
            $video->id,
            $variant ?? 'master',
            optional($video->hls_ready_at)->timestamp ?? optional($video->updated_at)->timestamp ?? 0
        );

        try {
            // No preceding exists() check - it was a second full B2 round trip
            // (measured ~650ms on its own, on top of get()'s own ~300ms) to
            // learn something get() already tells us for free: a missing key
            // throws UnableToReadFile, caught below. This alone was roughly
            // half of every video's startup latency - the "stuck for a while
            // before it plays" symptom - since this response is fetched fresh
            // on every play (see the Cache-Control note below).
            $disk = config('filesystems.default', 'b2');

            $rewritten = Cache::remember($cacheKey, self::PLAYLIST_CACHE_SECONDS, function () use ($disk, $key, $prefix, $variant, $video) {
                $body = (string) Storage::disk($disk)->get($key);

                return $this->sign($body, $prefix, $variant, (int) $video->id);
            });
        } catch (UnableToReadFile $e) {
            return response('Not found.', 404);
        } catch (\Throwable $e) {
            Log::warning('hls playlist read failed', ['key' => $key, 'error' => $e->getMessage()]);
            return response('Unavailable.', 503);
        }

        return response($rewritten, 200, [
            'Content-Type' => 'application/vnd.apple.mpegurl',
            // public, not private, IS correct for a genuinely public video:
            // MediaPresignService::signedMediaUrl()'s own doc comment is
            // explicit that these tokens are a time-limited CAPABILITY, not
            // bound to any viewer identity, so a shared cache serving them to
            // "anyone who asks" is exactly the intended behavior. Public + a
            // few-minutes TTL lets the edge serve the second-and-later viewer
            // of a video instantly, while staying well under the 240-minute
            // segment-token TTL these playlists embed (so a cached playlist
            // never outlives the tokens inside it) and keeping a moderation
            // takedown's worst-case propagation delay short.
            //
            // But $visible false means this specific response only exists
            // because the OWNER is previewing their own unpublished/private
            // video (the check above already 404'd anyone else). The request
            // URL carries no identity, so "public" here would let Cloudflare
            // hand that exact response - master/variant playlist AND its
            // 4-hour signed segment links - to the next unauthenticated
            // stranger who requests the same URL within the cache window.
            // That must never be shared, at any TTL.
            'Cache-Control' => $visible
                ? 'public, max-age=300, s-maxage=300'
                : 'private, no-store',
        ]);
    }

    /**
     * Rewrite every non-comment line into a signed absolute URL.
     *
     * Lines starting with '#' are directives and are passed through untouched -
     * except that they can also CONTAIN a URI (EXT-X-MAP, EXT-X-KEY), which is
     * why those are handled explicitly rather than skipped with the rest.
     */
    private function sign(string $playlist, string $prefix, ?string $variant, int $videoId): string
    {
        $base = $variant === null ? $prefix : $prefix . '/' . $variant;
        $out  = [];

        foreach (preg_split('/\R/', $playlist) as $line) {
            $trimmed = trim($line);

            if ($trimmed === '') {
                $out[] = $line;
                continue;
            }

            if (str_starts_with($trimmed, '#')) {
                $out[] = $this->signDirectiveUri($trimmed, $base);
                continue;
            }

            // A media line. In the master this is `360p/index.m3u8`, which must
            // point back at THIS controller so the variant is signed too rather
            // than fetched raw from storage.
            if ($variant === null && preg_match('#^(\d{3,4}p)/index\.m3u8$#', $trimmed, $m)) {
                // Back through this controller, not storage: the variant's own
                // segment lines still need signing when it is fetched.
                $out[] = url("/api/v1/videos/{$videoId}/hls/{$m[1]}/index.m3u8");
                continue;
            }

            $out[] = MediaPresignService::signedMediaUrl($base . '/' . ltrim($trimmed, '/'), self::SEGMENT_TTL_MINUTES);
        }

        return implode("\n", $out) . "\n";
    }

    /** EXT-X-MAP / EXT-X-KEY carry a URI="..." that needs signing like any segment. */
    private function signDirectiveUri(string $line, string $base): string
    {
        if (! str_contains($line, 'URI="')) {
            return $line;
        }

        return preg_replace_callback('/URI="([^"]+)"/', function (array $m) use ($base) {
            $uri = $m[1];
            // Already absolute (rare, but a hand-edited playlist could be) -
            // signing it again would corrupt it.
            if (str_starts_with($uri, 'http://') || str_starts_with($uri, 'https://')) {
                return $m[0];
            }
            return 'URI="' . MediaPresignService::signedMediaUrl($base . '/' . ltrim($uri, '/'), self::SEGMENT_TTL_MINUTES) . '"';
        }, $line) ?? $line;
    }

}
