<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Video;
use App\Services\MediaPresignService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class UploadCancelController extends Controller
{
    public function __construct(private readonly MediaPresignService $presign) {}

    /**
     * Delete an orphaned R2 upload that was never registered as a video.
     * Called by the browser when a content check blocks the upload or the user aborts.
     */
    public function destroy(Request $request): JsonResponse
    {
        $request->validate([
            'object_key' => ['required', 'string', 'max:500'],
        ]);

        $user = $request->user();
        $key  = $request->input('object_key');

        $allowed = $this->presign->keyBelongsToUser($key, $user->id, 'videos/original')
                || $this->presign->keyBelongsToUser($key, $user->id, 'images/original');

        if (!$allowed) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        // Guard: don't delete a file that's already a registered video
        if (Video::where('video_url', $key)->whereNull('deleted_at')->exists()) {
            return response()->json(['success' => true]);
        }

        try {
            Storage::disk(config('filesystems.default', 'r2'))->delete($key);
        } catch (\Throwable $e) {
            Log::warning('UploadCancelController: failed to delete from R2', [
                'key'   => $key,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json(['success' => true]);
    }
}
