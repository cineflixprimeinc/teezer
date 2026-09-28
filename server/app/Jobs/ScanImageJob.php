<?php

namespace App\Jobs;

use App\Models\Video;
use App\Services\ModerationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class ScanImageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 120;
    public int $tries   = 2;
    public int $backoff = 30;

    public function __construct(public readonly Video $video) {}

    public function handle(ModerationService $moderation): void
    {
        if (!config('moderation.enabled', true)) {
            return;
        }

        Log::info("ScanImageJob: scanning video_id={$this->video->id}");
        $moderation->scanImage($this->video);
    }

    public function failed(\Throwable $e): void
    {
        Log::error("ScanImageJob permanently failed video_id={$this->video->id}: " . $e->getMessage());

        $this->video->update([
            'moderation_status' => 'pending_review',
            'is_flagged'        => true,
        ]);
    }
}
