<?php

namespace App\Services\Video;

use App\Jobs\TranscodeVideoToHls;
use App\Jobs\Video\TransferEncodedOutputToB2;
use App\Models\Video;
use App\Models\VideoProcessingJob;
use App\Services\Video\Contracts\TranscodingProvider;
use App\Services\Video\Providers\ApiVideoProvider;
use App\Services\Video\Support\ApiVideoFailureClassifier;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The one place the rest of Reelsoo talks to for provider-orchestrated
 * transcoding - nothing outside app/Services/Video and app/Jobs/Video should
 * import ApiVideoProvider or TranscodingProvider directly. Swapping
 * providers later means adding a new class in Providers/ and changing the
 * container binding (see AppServiceProvider) - this class, the jobs, and the
 * webhook controller do not change.
 *
 * All five HLS renditions Reelsoo already produces locally (240/360/540/720/
 * 1080p) are requested from api.video too - it generates its own ladder
 * automatically, filtered to the source's real resolution (confirmed: no
 * upscaling), so requestedOutputs here is informational bookkeeping for
 * video_processing_jobs, not a parameter api.video's createJob API accepts.
 */
class VideoProcessingService
{
    private const REQUESTED_OUTPUTS = ['240p', '360p', '540p', '720p', '1080p'];

    public function __construct(private readonly TranscodingProvider $provider)
    {
    }

    /**
     * Starts external processing for a video whose original is already in
     * B2. $sourceUrl must already be reachable by the provider (a signed or
     * public B2 GET URL) - callers are responsible for minting it.
     */
    public function start(Video $video, string $sourceUrl): VideoProcessingJob
    {
        $job = VideoProcessingJob::create([
            'video_id' => $video->id,
            'provider' => $this->provider->name(),
            'status' => VideoProcessingJob::STATUS_QUEUED,
            'attempt' => 1,
            'requested_outputs' => self::REQUESTED_OUTPUTS,
            'started_at' => now(),
        ]);

        try {
            $providerJobId = $this->provider->createJob($sourceUrl, self::REQUESTED_OUTPUTS);
        } catch (Throwable $e) {
            // A permanent failure (bad source, provider rejects the request
            // outright) never gets better by retrying the SAME request - fall
            // back immediately rather than burning StartTranscodingJob's own
            // job-level retries on something that will fail identically each
            // time. A transient failure gets recorded and rethrown so
            // Laravel's normal job retry (StartTranscodingJob's own
            // tries/backoff) gets a genuine second attempt; only once THOSE
            // are also exhausted does StartTranscodingJob::failed() fall back
            // for real - see that method.
            if ($this->shouldFallbackToFFmpeg($job, ApiVideoFailureClassifier::classify($e))) {
                $this->fallbackToFFmpeg($job, $e->getMessage());
                return $job;
            }

            $job->update(['error_code' => 'create_job_transient_failure', 'error_message' => $e->getMessage()]);
            throw $e;
        }

        $job->update([
            'provider_job_id' => $providerJobId,
            'status' => VideoProcessingJob::STATUS_PROCESSING,
        ]);

        // Denormalized pointer on the video row itself, for the webhook
        // handler's fast lookup (see the migration's doc comment). hls_status
        // 'queued' is a new value within that column's existing vocabulary -
        // see FeedVideoItem/HlsPlaylistController, both of which already
        // treat "not ready yet" as one bucket regardless of the exact string.
        $video->update([
            'processing_provider' => $this->provider->name(),
            'provider_job_id' => $providerJobId,
            'hls_status' => 'queued',
        ]);

        Log::info('video_processing.started', [
            'video_id' => $video->id,
            'job_id' => $job->id,
            'provider' => $this->provider->name(),
            'provider_job_id' => $providerJobId,
        ]);

        ProcessingEventStream::push([
            'type' => 'video_transcoding_started',
            'video_id' => $video->id,
            'user_id' => $video->user_id,
            'provider' => $this->provider->name(),
            'attempt' => $job->attempt,
        ]);

        return $job;
    }

    /**
     * Called from the webhook controller after EVERY quality-completed
     * event. Deliberately does not compare against a fixed expected-quality
     * list: api.video filters its own ladder to the source's real resolution
     * (confirmed - no upscaling), so a video with, say, a 720p source only
     * ever fires webhooks for 240p-720p and NEVER for 1080p. Waiting on a
     * hardcoded 5-quality set would hang forever for any non-1080p+ source.
     * Instead this asks api.video's own status endpoint what it actually
     * expects and checks THAT - authoritative, and immune to the mismatch.
     */
    public function checkCompletionAndAdvance(VideoProcessingJob $job): void
    {
        if (!in_array($job->status, [VideoProcessingJob::STATUS_QUEUED, VideoProcessingJob::STATUS_PROCESSING], true)) {
            // Already transferring/completed/failed - a later or duplicate
            // webhook must not re-trigger the transfer worker.
            return;
        }

        if ($job->provider !== $this->provider->name()) {
            // This job has already fallen back to ffmpeg (provider is now
            // 'ffmpeg', not this service's own bound provider) - its
            // provider_job_id is a stale api.video id from before the
            // fallback, meaningless to poll now. TranscodeVideoToHls owns
            // this job's completion from here (see its own
            // reportFallbackCompletion), not this method.
            return;
        }

        try {
            $status = $this->provider->getStatus($job->provider_job_id);
        } catch (Throwable $e) {
            // A permanent failure here (e.g. the provider job id no longer
            // resolves) falls back immediately; a transient one is logged
            // and left for the NEXT webhook delivery or reconcile pass to
            // try again - this method is already called repeatedly by
            // design (once per quality-completed webhook, plus
            // VideosReconcileProcessing), so there is a natural retry
            // cadence without this method retrying internally itself.
            if ($this->shouldFallbackToFFmpeg($job, ApiVideoFailureClassifier::classify($e))) {
                $this->fallbackToFFmpeg($job, $e->getMessage());
            } else {
                Log::warning('video_processing.status_check_failed', [
                    'video_id' => $job->video_id,
                    'job_id' => $job->id,
                    'error' => $e->getMessage(),
                ]);
            }
            return;
        }

        // Confirmed via a real call, not assumed: GET /videos/{id}/status
        // nests the per-quality array under encoding.qualities, not at the
        // response's top level.
        $qualities = $status['encoding']['qualities'] ?? [];

        if ($qualities === []) {
            return; // nothing to compare yet - wait for more webhooks
        }

        // api.video reporting a quality as genuinely failed (not just slow)
        // is a real, permanent-for-this-attempt signal - fall back rather
        // than marking the whole video failed outright, since ffmpeg
        // encoding the same source locally may well still succeed.
        $anyFailed = collect($qualities)->contains(fn ($q) => ($q['status'] ?? null) === 'failed');
        if ($anyFailed) {
            if ($this->shouldFallbackToFFmpeg($job, ApiVideoFailureClassifier::PERMANENT)) {
                $this->fallbackToFFmpeg($job, 'provider reported one or more qualities failed to encode');
            } else {
                $this->markFailed($job, 'provider_encoding_failed', 'one or more qualities failed to encode');
            }
            return;
        }

        $allEncoded = collect($qualities)->every(fn ($q) => ($q['status'] ?? null) === 'encoded');
        if (!$allEncoded) {
            return; // still waiting on the rest of the ladder
        }

        $job->update(['status' => VideoProcessingJob::STATUS_TRANSFERRING]);

        ProcessingEventStream::push([
            'type' => 'video_transcoding_primary_success',
            'video_id' => $job->video_id,
            'provider' => $this->provider->name(),
            'attempt' => $job->attempt,
            'duration_ms' => $job->started_at ? (int) $job->started_at->diffInMilliseconds(now()) : 0,
        ]);

        TransferEncodedOutputToB2::dispatch($job->video_id, $job->id)->onQueue('video-transfer');
    }

    public function markFailed(VideoProcessingJob $job, string $errorCode, ?string $message = null): void
    {
        $job->update([
            'status' => VideoProcessingJob::STATUS_FAILED,
            'failed_at' => now(),
            'error_code' => $errorCode,
            'error_message' => $message,
        ]);

        $job->video()->update(['hls_status' => 'failed']);

        Log::error('video_processing.failed', [
            'video_id' => $job->video_id,
            'job_id' => $job->id,
            'error_code' => $errorCode,
        ]);

        ProcessingEventStream::push([
            'type' => 'video_transcoding_failed',
            'video_id' => $job->video_id,
            'provider' => $job->provider,
            'attempt' => $job->attempt,
            'error_code' => $errorCode,
        ]);
    }

    /**
     * The ONE place this is decided - every caller that hits an api.video
     * failure routes through here rather than deciding for itself, per the
     * spec's "do not scatter fallback decisions" instruction.
     *
     * $classification is supplied by the caller rather than computed here,
     * because "permanent" means different things in different places: a
     * caught ApiVideoRequestException classifies itself directly
     * (ApiVideoFailureClassifier::classify), but a stuck job past its
     * timeout (VideosReconcileProcessing) or a provider-reported encoding
     * failure has no exception to classify at all - the caller already
     * knows it has exhausted whatever retries were appropriate for its own
     * situation, and passes PERMANENT to mean exactly that.
     */
    public function shouldFallbackToFFmpeg(VideoProcessingJob $job, string $classification): bool
    {
        // Already running (or finished) on ffmpeg - never fall back twice
        // for the same job.
        if ($job->provider !== 'apivideo' || $job->fallback_started_at !== null) {
            return false;
        }

        // Already past the point where switching providers mid-flight would
        // make sense or be safe.
        if (in_array($job->status, [VideoProcessingJob::STATUS_TRANSFERRING, VideoProcessingJob::STATUS_COMPLETED], true)) {
            return false;
        }

        return $classification === ApiVideoFailureClassifier::PERMANENT;
    }

    /**
     * Switches this job to the local-ffmpeg pipeline by dispatching the
     * EXISTING TranscodeVideoToHls job completely unmodified - its own
     * ffmpeg command, resolution ladder and B2 upload logic is not
     * duplicated or reimplemented here, only reached via a different path.
     * TranscodeVideoToHls itself gains one small, additive completion hook
     * (see that job) so THIS SAME job row reflects the fallback's outcome
     * too, regardless of which provider actually ran.
     */
    public function fallbackToFFmpeg(VideoProcessingJob $job, ?string $reason = null): void
    {
        if (!$this->shouldFallbackToFFmpeg($job, ApiVideoFailureClassifier::PERMANENT)) {
            return;
        }

        $video = $job->video()->first();
        if (!$video) {
            return; // deleted mid-flight - mirrors every other job's own guard
        }

        $job->update([
            'provider' => 'ffmpeg',
            'status' => VideoProcessingJob::STATUS_PROCESSING,
            'attempt' => $job->attempt + 1,
            'fallback_started_at' => now(),
            'error_code' => 'primary_failed',
            'error_message' => $reason,
        ]);

        $video->update(['processing_provider' => 'ffmpeg', 'hls_status' => 'processing']);

        Log::warning('video_processing.fallback_to_ffmpeg', [
            'video_id' => $video->id,
            'job_id' => $job->id,
            'reason' => $reason,
        ]);

        // Two distinct events, not one: "the primary just failed" and "the
        // fallback is starting" are separately useful signals - the first
        // feeds FFMPEG_FALLBACK_RATE-style monitoring on its own, the second
        // is what the fallback's own success/failure event later pairs with.
        ProcessingEventStream::push([
            'type' => 'video_transcoding_primary_failed',
            'video_id' => $video->id,
            'user_id' => $video->user_id,
            'provider' => 'apivideo',
            'attempt' => $job->attempt - 1,
            'error_code' => 'primary_failed',
            'payload' => $reason ? json_encode(['reason' => $reason]) : '',
        ]);
        ProcessingEventStream::push([
            'type' => 'video_transcoding_fallback_started',
            'video_id' => $video->id,
            'user_id' => $video->user_id,
            'provider' => 'ffmpeg',
            'attempt' => $job->attempt,
        ]);

        TranscodeVideoToHls::dispatch($video)->onQueue('transcoding');
    }

    public function provider(): TranscodingProvider
    {
        return $this->provider;
    }
}
