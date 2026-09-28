<?php

namespace App\Jobs\Video;

use App\Models\Video;
use App\Models\VideoProcessingJob;
use App\Services\MediaPresignService;
use App\Services\Video\Support\ApiVideoFailureClassifier;
use App\Services\Video\VideoProcessingService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Hands a video's already-uploaded B2 source off to the configured
 * transcoding provider. Dispatched from VideoService::createFromUpload()
 * only when config('services.apivideo.enabled') is true - see that
 * method's own comment for how a video ends up on this pipeline vs. the
 * local-ffmpeg one.
 */
class StartTranscodingJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 60;
    public int $tries = 3;
    public int $backoff = 30;
    public int $uniqueFor = 300;

    public function __construct(public readonly int $videoId)
    {
    }

    public function uniqueId(): string
    {
        return 'start-transcode-' . $this->videoId;
    }

    public function handle(VideoProcessingService $processing, MediaPresignService $presign): void
    {
        $video = Video::query()->find($this->videoId);
        if (!$video) {
            // Deleted between dispatch and execution - mirrors
            // TranscodeVideoToHls's own "fresh() returned null" guard.
            return;
        }

        if (empty($video->video_url)) {
            Log::warning('start_transcoding.no_source_key', ['video_id' => $video->id]);
            return;
        }

        // api.video fetches this URL itself - the video bytes never pass
        // through this application. signedCdnUrl (not the lower-level static
        // signedMediaUrl) so a private-prefixed key still resolves correctly
        // if this is ever called on one - see that method's own branching.
        // A signed GET works regardless of the video's own public/private
        // status, since api.video is the one dereferencing it, not an end
        // user's browser.
        $sourceUrl = $presign->signedCdnUrl($video->video_url, 60);

        $processing->start($video, $sourceUrl);
    }

    /**
     * Laravel calls this once every attempt in $tries has been used and
     * handle() has STILL thrown - i.e. a transient failure that never
     * recovered across 3 real attempts with backoff (see VideoProcessingService
     * ::start(), which already re-throws only transient failures and lets a
     * permanent one fall back immediately without waiting for this). At this
     * point retrying further would just be StartTranscodingJob's own
     * ShouldBeUnique lock politely waiting on a request that keeps failing -
     * genuinely time to fall back.
     */
    public function failed(Throwable $exception): void
    {
        $video = Video::query()->find($this->videoId);
        if (!$video) {
            return;
        }

        $job = VideoProcessingJob::query()
            ->where('video_id', $video->id)
            ->where('provider', 'apivideo')
            ->latest('id')
            ->first();

        if (!$job) {
            Log::error('start_transcoding.failed_no_job_row', ['video_id' => $video->id, 'error' => $exception->getMessage()]);
            return;
        }

        app(VideoProcessingService::class)->fallbackToFFmpeg(
            $job,
            "primary retries exhausted: {$exception->getMessage()}",
        );
    }
}
