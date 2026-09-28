<?php

namespace App\Jobs;

use App\Models\Video;
use App\Models\VideoEvent;
use App\Models\VideoScore;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class UpdateVideoScoreJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    public int $timeout = 60;

    public function __construct(public readonly int $videoId) {}

    public function handle(): void
    {
        $video = Video::find($this->videoId);
        if (! $video) return;

        // ── Aggregate events from the last 30 days ──────────────────────
        $rows = VideoEvent::where('video_id', $this->videoId)
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw('event_type, COUNT(*) as cnt, AVG((payload->>\'completion_pct\')::float) as avg_completion')
            ->groupBy('event_type')
            ->get()
            ->keyBy('event_type');

        $get = fn (string $key) => (int) ($rows[$key]->cnt ?? 0);

        // Completion: average of all view_progress events' completion_pct
        $completionAvg = (float) ($rows['view_progress']->avg_completion ?? 0) / 100.0;
        $completionAvg = min(1.0, max(0.0, $completionAvg));

        $rewatchCount      = $get('rewatch');
        $likeCount         = $get('like');
        $commentCount      = $get('comment');
        $shareCount        = $get('share');
        $saveCount         = $get('save');
        $followCount       = $get('follow_from_video');
        $skipCount         = $get('skip');
        $notInterestedCnt  = $get('not_interested');
        $reportCount       = $get('report');

        // ── Score formula (from requirements) ────────────────────────────
        $completionScore = $completionAvg * 0.4;
        $rewatchScore    = $rewatchCount  * 2;
        $likeScore       = $likeCount     * 3;
        $commentScore    = $commentCount  * 4;
        $shareScore      = $shareCount    * 6;
        $saveScore       = $saveCount     * 5;
        $followScore     = $followCount   * 8;
        $skipPenalty     = ($skipCount + $notInterestedCnt) * 5;
        $reportPenalty   = $reportCount   * 20;

        $score = $completionScore + $rewatchScore + $likeScore
               + $commentScore   + $shareScore   + $saveScore
               + $followScore    - $skipPenalty  - $reportPenalty;

        $totalEvents = (int) VideoEvent::where('video_id', $this->videoId)->count();

        // ── Upsert video_scores ──────────────────────────────────────────
        VideoScore::updateOrCreate(
            ['video_id' => $this->videoId],
            [
                'score'            => round($score, 4),
                'completion_score' => round($completionScore, 4),
                'rewatch_score'    => round($rewatchScore, 4),
                'like_score'       => round($likeScore, 4),
                'comment_score'    => round($commentScore, 4),
                'share_score'      => round($shareScore, 4),
                'save_score'       => round($saveScore, 4),
                'follow_score'     => round($followScore, 4),
                'skip_penalty'     => round($skipPenalty, 4),
                'report_penalty'   => round($reportPenalty, 4),
                'event_count'      => $totalEvents,
                'computed_at'      => now(),
                'updated_at'       => now(),
            ]
        );

        // ── Bust the hot-score Redis cache for this video ────────────────
        Cache::forget("video:score:{$this->videoId}");

        // ── Bust trending + any user feed caches (broad invalidation) ────
        Cache::forget('feed:trending:v2');
        // Per-user caches are TTL-based (5 min) - no need to enumerate them
    }
}
