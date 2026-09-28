<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\VideoProcessingJob;
use App\Models\VideoProcessingWebhookEvent;
use App\Services\Video\VideoProcessingService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Receives api.video's video.encoding.quality.completed webhook. Never
 * placed under auth:sanctum - verified by X-Api-Video-Signature (HMAC
 * SHA256), same posture as the StreamHub/LiveKit webhook route right above
 * this one in routes/api.php.
 *
 * Deliberately does no transfer work itself - only records the event,
 * updates job state, and asks VideoProcessingService whether the job is
 * ready to advance. The actual segment transfer runs in
 * TransferEncodedOutputToB2 on its own queue, so this request returns fast
 * regardless of how long a transfer would take.
 */
class ApiVideoWebhookController extends Controller
{
    public function handle(Request $request, VideoProcessingService $processing): JsonResponse
    {
        $rawBody = $request->getContent();
        $signature = $request->header('X-Api-Video-Signature');

        if (!$processing->provider()->verifyWebhookSignature($rawBody, $signature)) {
            Log::warning('apivideo_webhook.bad_signature');
            return response()->json(['success' => false], 401);
        }

        $payload = json_decode($rawBody, true) ?? [];
        $event = $processing->provider()->parseWebhookEvent($payload);

        if ($event === null) {
            // A real, correctly-signed event this integration doesn't act on
            // (e.g. a live-stream event, if this webhook were ever
            // subscribed to more than video.encoding.quality.completed).
            return response()->json(['success' => true]);
        }

        // No event id of its own in the payload (confirmed against the live
        // docs) - dedup_key is computed from the fields that actually
        // identify one delivery.
        $dedupKey = hash('sha256', implode('|', [
            $event['type'], $event['provider_job_id'], $event['quality'] ?? '', $event['emitted_at'] ?? '',
        ]));

        $job = VideoProcessingJob::query()
            ->where('provider_job_id', $event['provider_job_id'])
            ->latest('id')
            ->first();

        try {
            VideoProcessingWebhookEvent::create([
                'provider' => 'apivideo',
                'dedup_key' => $dedupKey,
                'video_processing_job_id' => $job?->id,
                'payload' => $payload,
                'processed_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // Already processed this exact delivery - a retry/replay is a
            // no-op, not an error. Still 200, so the provider stops retrying.
            return response()->json(['success' => true]);
        }

        if ($job) {
            // The event is already durably recorded above - a retried
            // delivery of this SAME event will be deduped and never reach
            // this line again. So a failure here (a transient network hiccup
            // calling out to the provider, say) must not become a 500: that
            // would strand the job with no webhook left that will ever
            // retry it. Logged and left for VideosReconcileProcessing (the
            // scheduled backstop - see that command) to catch instead.
            try {
                $processing->checkCompletionAndAdvance($job);
            } catch (\Throwable $e) {
                Log::error('apivideo_webhook.advance_failed', [
                    'job_id' => $job->id,
                    'error' => $e->getMessage(),
                ]);
            }
        } else {
            Log::warning('apivideo_webhook.no_matching_job', ['provider_job_id' => $event['provider_job_id']]);
        }

        return response()->json(['success' => true]);
    }
}
