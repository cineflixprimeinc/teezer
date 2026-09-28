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

class ScanVideoJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 600;  // 10 min - video downloads can be slow
    public int $tries   = 2;
    public int $backoff = 60;

    public function __construct(public readonly Video $video) {}

    public function handle(ModerationService $moderation): void
    {
        if (!config('moderation.enabled', true)) {
            return;
        }

        Log::info("ScanVideoJob: scanning video_id={$this->video->id}");
        $moderation->scanVideo($this->video);
    }

    public function failed(\Throwable $e): void
    {
        Log::error("ScanVideoJob permanently failed video_id={$this->video->id}: " . $e->getMessage());

        // Fail-safe: mark pending_review so it goes to admin queue
        $this->video->update([
            'moderation_status' => 'pending_review',
            'is_flagged'        => true,
        ]);
    }
}
