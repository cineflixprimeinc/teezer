<?php

namespace App\Http\Controllers\Api;

use App\Models\Video;
use App\Services\MediaPresignService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Fallback signed-URL endpoint for private/draft videos.
 * The Cloudflare Worker is the primary enforcement point; this controller
 * handles cases where a backend-redirect URL was already issued.
 *
 * Token: HMAC-SHA256("{video_id}|{expires}", APP_KEY) - different from the
 * CDN-level HMAC which uses the file path and MEDIA_SIGNING_SECRET.
 */
class VideoStreamController extends Controller
{
    public function show(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $expires = (int) $request->query('expires', 0);
        $token   = (string) $request->query('token', '');

        if (!$token || !$expires) {
            return response()->json(['message' => 'Missing token.'], 401);
        }

        if ($expires < now()->timestamp) {
            return response()->json(['message' => 'This link has expired.'], 410);
        }

        $expected = hash_hmac('sha256', "{$id}|{$expires}", config('app.key'));
        if (!hash_equals($expected, $token)) {
            return response()->json(['message' => 'Invalid token.'], 401);
        }

        $video = Video::findOrFail($id);

        // Defense in depth: the token above is meant to be the sole
        // authorization check for this route (nothing today actually mints
        // one - no caller of this endpoint was found in the codebase - but a
        // future one easily could without also re-checking visibility at
        // mint time). Every other video-serving endpoint in the app already
        // rejects draft/private/scheduled/removed/rejected content; this one
        // shouldn't be the exception a moderation takedown can route around.
        $unpublished = $video->status !== 'published'
            || $video->moderation_status === 'rejected'
            || $video->deleted_at !== null;
        if ($unpublished) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        // Redirect to a freshly-signed CDN URL, via MediaPresignService (not a
        // hand-rolled signer - this used to reimplement a retired
        // HMAC-SHA256-hex scheme that 403s against nginx's current
        // secure_link_md5 validation).
        return redirect(MediaPresignService::signedMediaUrl($video->video_url, 120));
    }
}
