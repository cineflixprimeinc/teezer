<?php

namespace App\Http\Controllers\Api;

use App\Jobs\ProcessVideoQualities;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;

/**
 * Internal endpoint called by the Cloudflare Queue consumer Worker when a new
 * video object is created in R2. Dispatches ProcessVideoQualities to the
 * existing 'transcoding' queue so FFmpeg runs on this VPS.
 *
 * Authenticated by X-Internal-Secret header (INTERNAL_API_SECRET in .env).
 * Never expose this route to public traffic - it bypasses normal user auth.
 */
class InternalTranscodeController extends Controller
{
    public function trigger(Request $request): JsonResponse
    {
        $secret = (string) config('services.internal.secret', '');

        if (!$secret || !hash_equals($secret, (string) $request->header('X-Internal-Secret', ''))) {
            Log::warning('InternalTranscodeController: unauthorized request', [
                'ip' => $request->ip(),
            ]);
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'object_key' => ['required', 'string', 'max:500'],
            'video_id'   => ['nullable', 'integer'],
        ]);

        $objectKey = $request->input('object_key');
        $videoId   = $request->input('video_id');

        // Locate the video - prefer the explicit ID if provided, fall back to key lookup
        $video = $videoId
            ? Video::find($videoId)
            : Video::where('video_url', $objectKey)->first();

        if (!$video) {
            // Video might not be registered yet (race condition). Log and let the
            // Cloudflare Queue retry mechanism try again in a few seconds.
            Log::info('InternalTranscodeController: video not found yet', [
                'object_key' => $objectKey,
                'video_id'   => $videoId,
            ]);
            return response()->json(['success' => false, 'message' => 'Video not found.'], 404);
        }

        if (!empty($video->quality_urls)) {
            return response()->json(['success' => true, 'message' => 'Already transcoded.']);
        }

        ProcessVideoQualities::dispatch($video)->onQueue('transcoding');

        Log::info('InternalTranscodeController: dispatched transcoding job', [
            'video_id'   => $video->id,
            'object_key' => $objectKey,
        ]);

        return response()->json(['success' => true, 'message' => 'Transcoding queued.']);
    }
}
