<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MediaPresignService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Multipart + resumable uploads straight from the client to Backblaze B2.
 *
 * The bytes never touch this server. Every endpoint here either mints a
 * short-lived presigned URL or asks B2 what it already holds; the client does
 * the transferring. That is what makes the design survive scale - a thousand
 * concurrent 500 MB uploads cost this API a few hundred bytes of JSON each
 * instead of a thousand streams through PHP.
 *
 * Resume needs no state of its own. B2 remembers the parts it has accepted for
 * an upload id, so `status` asks it directly rather than trusting a row in
 * Postgres that could disagree with the bucket.
 *
 * Ownership is enforced on every call by the key's own prefix
 * (videos/original/{userId}/...), which MediaPresignService mints and
 * keyBelongsToUser re-checks - otherwise anyone holding an upload id could sign
 * parts into somebody else's object.
 */
class MultipartUploadController extends Controller
{
    /** Matches the video upload limit; a part count beyond this is a bad client. */
    private const MAX_PARTS = 10_000;

    /**
     * Must stay in sync with VideoController's own allowlist and byte ceiling
     * (VideoController::ALLOWED_VIDEO_MIME/ALLOWED_IMAGE_MIME/maxVideoBytes) -
     * duplicated rather than extracted, since those are private there and this
     * is the only other place that needs them. Multipart exists for VIDEO
     * uploads specifically (see class docblock), so only the video ceiling is
     * used here, not the stricter 20MB image one.
     */
    private const ALLOWED_MIME = [
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/avi',
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    ];

    public function __construct(
        private readonly MediaPresignService $presign,
        private readonly StorageService $storage,
    ) {}

    private function maxVideoBytes(): int
    {
        return (int) config('services.upload.max_video_mb', 500) * 1024 * 1024;
    }

    /** POST /videos/upload/multipart/create */
    public function create(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file_name'    => ['required', 'string', 'max:255'],
            'content_type' => ['required', 'string', 'in:' . implode(',', self::ALLOWED_MIME)],
            'file_size'    => ['required', 'integer', 'min:1'],
            'directory'    => ['nullable', 'string', 'max:100'],
        ]);

        // Client-declared, same as VideoController::uploadUrl() - a first line
        // of defense / fast feedback, not the real enforcement. The real check
        // is the post-completion size verification in complete() below, since
        // the presigned part URLs carry no Content-Length condition and a
        // client could always lie about this value.
        if ((int) $data['file_size'] > $this->maxVideoBytes()) {
            return response()->json([
                'success' => false,
                'message' => 'File exceeds the maximum allowed size of 500 MB.',
            ], 422);
        }

        $directory = $this->directoryFor($data['directory'] ?? null);

        try {
            $out = $this->presign->createMultipartUpload(
                userId:      $request->user()->id,
                fileName:    $data['file_name'],
                contentType: $data['content_type'],
                directory:   $directory,
            );
        } catch (\Throwable $e) {
            Log::error('multipart create failed', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Could not start the upload.'], 503);
        }

        return response()->json(['success' => true, 'data' => $out]);
    }

    /** POST /videos/upload/multipart/sign - one part at a time. */
    public function sign(Request $request): JsonResponse
    {
        $data = $request->validate([
            'object_key'  => ['required', 'string', 'max:500'],
            'upload_id'   => ['required', 'string', 'max:500'],
            'part_number' => ['required', 'integer', 'min:1', 'max:' . self::MAX_PARTS],
        ]);

        if (! $this->owns($request, $data['object_key'])) {
            return response()->json(['success' => false, 'message' => 'Not your upload.'], 403);
        }

        try {
            $url = $this->presign->signUploadPart($data['object_key'], $data['upload_id'], (int) $data['part_number']);
        } catch (\Throwable $e) {
            Log::warning('multipart sign failed', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Could not sign that part.'], 503);
        }

        return response()->json(['success' => true, 'data' => ['url' => $url, 'part_number' => (int) $data['part_number']]]);
    }

    /**
     * GET /videos/upload/multipart/status - what B2 already has.
     * A client resuming an interrupted upload calls this first and skips
     * everything listed.
     */
    public function status(Request $request): JsonResponse
    {
        $data = $request->validate([
            'object_key' => ['required', 'string', 'max:500'],
            'upload_id'  => ['required', 'string', 'max:500'],
        ]);

        if (! $this->owns($request, $data['object_key'])) {
            return response()->json(['success' => false, 'message' => 'Not your upload.'], 403);
        }

        try {
            $parts = $this->presign->listUploadedParts($data['object_key'], $data['upload_id']);
        } catch (\Throwable $e) {
            // An expired or aborted upload id is a normal outcome here, not a
            // fault: the client's answer is "nothing landed, start over", which
            // an empty list says perfectly well.
            Log::info('multipart status miss', ['error' => $e->getMessage()]);
            return response()->json(['success' => true, 'data' => ['parts' => [], 'uploaded_bytes' => 0]]);
        }

        return response()->json(['success' => true, 'data' => [
            'parts'          => $parts,
            'uploaded_bytes' => array_sum(array_column($parts, 'Size')),
        ]]);
    }

    /** POST /videos/upload/multipart/complete */
    public function complete(Request $request): JsonResponse
    {
        $data = $request->validate([
            'object_key'         => ['required', 'string', 'max:500'],
            'upload_id'          => ['required', 'string', 'max:500'],
            'parts'              => ['required', 'array', 'min:1', 'max:' . self::MAX_PARTS],
            'parts.*.PartNumber' => ['required', 'integer', 'min:1'],
            'parts.*.ETag'       => ['required', 'string', 'max:255'],
        ]);

        if (! $this->owns($request, $data['object_key'])) {
            return response()->json(['success' => false, 'message' => 'Not your upload.'], 403);
        }

        try {
            $this->presign->completeMultipartUpload($data['object_key'], $data['upload_id'], $data['parts']);
        } catch (\Throwable $e) {
            Log::error('multipart complete failed', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Could not finish the upload.'], 422);
        }

        // The per-part presigned URLs carry no Content-Length condition (S3/B2
        // multipart has no per-part size condition to set), so the real total
        // size is only knowable once B2 has assembled the finished object.
        // Check it now and delete rather than leave an oversized object sitting
        // in the bucket - the same principle VideoController::completeUpload()
        // already applies to the single-PUT path, just applied at the point
        // where multipart's own real size first becomes knowable.
        try {
            $actualBytes = $this->storage->size($data['object_key']);
            if ($actualBytes !== null && $actualBytes > $this->maxVideoBytes()) {
                $this->storage->delete($data['object_key']);
                return response()->json([
                    'success' => false,
                    'message' => 'Uploaded file exceeds the maximum allowed size of 500 MB.',
                ], 422);
            }
        } catch (\Throwable $e) {
            Log::warning('multipart post-complete size check failed, proceeding anyway', [
                'key' => $data['object_key'], 'error' => $e->getMessage(),
            ]);
            // Fall through - ownership already validated above, and
            // /videos/complete-upload re-checks the size again when the
            // client registers the Video row.
        }

        // The object exists now, but no Video row does - the client still calls
        // /videos/complete-upload with the same object_key to create the post.
        // Keeping those separate is what lets an upload finish while the user is
        // still writing their caption.
        return response()->json(['success' => true, 'data' => ['object_key' => $data['object_key']]]);
    }

    /** POST /videos/upload/multipart/abort */
    public function abort(Request $request): JsonResponse
    {
        $data = $request->validate([
            'object_key' => ['required', 'string', 'max:500'],
            'upload_id'  => ['required', 'string', 'max:500'],
        ]);

        if (! $this->owns($request, $data['object_key'])) {
            return response()->json(['success' => false, 'message' => 'Not your upload.'], 403);
        }

        try {
            $this->presign->abortMultipartUpload($data['object_key'], $data['upload_id']);
        } catch (\Throwable $e) {
            // Already gone is the desired end state, so this is not worth an
            // error the client has to handle.
            Log::info('multipart abort no-op', ['error' => $e->getMessage()]);
        }

        return response()->json(['success' => true]);
    }

    /**
     * Only the directories the client is allowed to target. Taking this from
     * the request unchecked would let a caller write a video into the avatars
     * prefix - or into a prefix the CDN treats differently.
     */
    private function directoryFor(?string $requested): string
    {
        return match ($requested) {
            'stories'    => 'stories',
            'thumbnails' => 'thumbnails',
            default      => 'videos/original',
        };
    }

    private function owns(Request $request, string $key): bool
    {
        foreach (['videos/original', 'stories', 'thumbnails'] as $dir) {
            if ($this->presign->keyBelongsToUser($key, $request->user()->id, $dir)) {
                return true;
            }
        }
        return false;
    }
}
