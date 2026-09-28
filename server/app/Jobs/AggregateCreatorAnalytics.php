<?php

namespace App\Jobs;

use App\Models\CreatorAnalytic;
use App\Models\CreatorEarning;
use App\Models\Follower;
use App\Models\Video;
use App\Models\VideoComment;
use App\Models\VideoLike;
use App\Models\VideoSave;
use App\Models\VideoShare;
use App\Models\VideoView;
use App\Models\VideoWatchSession;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

/**
 * Daily per-creator analytics rollup. Runs a trailing 3-day window (today +
 * yesterday + day-before) every invocation rather than just "yesterday", so
 * a single missed cron run self-heals on the next run instead of leaving a
 * permanent gap.
 *
 * This is not just a performance optimization: unfollow/unlike/unsave are
 * hard deletes with no audit trail, and profile_views collapses to one
 * upsert row per (owner, viewer) that gets pruned after 7 days. Without this
 * job capturing counts on (or shortly after) the day they happen, historical
 * "gained per day" numbers for followers/likes/saves/profile-views are
 * permanently unrecoverable once enough time has passed.
 */
class AggregateCreatorAnalytics implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const WINDOW_DAYS = 3;

    public function __construct(public ?int $userId = null) {}

    public function handle(): void
    {
        $creatorIds = $this->userId
            ? [$this->userId]
            : Video::whereNull('deleted_at')->distinct()->pluck('user_id')->all();

        $today = now()->startOfDay();

        foreach ($creatorIds as $creatorId) {
            $videoIds = Video::where('user_id', $creatorId)->pluck('id');
            if ($videoIds->isEmpty()) {
                continue;
            }

            for ($i = self::WINDOW_DAYS - 1; $i >= 0; $i--) {
                $day = $today->copy()->subDays($i);
                $this->aggregateDay($creatorId, $videoIds, $day);
            }
        }
    }

    private function aggregateDay(int $creatorId, $videoIds, \Illuminate\Support\Carbon $day): void
    {
        $start = $day->copy()->startOfDay();
        $end = $day->copy()->endOfDay();
        $range = [$start, $end];

        $views = VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', $range)->count();

        $sessions = VideoWatchSession::whereIn('video_id', $videoIds)->whereBetween('started_at', $range);
        $watchTimeSecs = (clone $sessions)->sum('watch_seconds');
        $totalSessions = (clone $sessions)->count();
        $completedSessions = (clone $sessions)->where('completed', true)->count();
        $replayedSessions = (clone $sessions)->where('replay_count', '>', 0)->count();

        $likes = VideoLike::whereIn('video_id', $videoIds)->whereBetween('created_at', $range)->count();
        $comments = VideoComment::whereIn('video_id', $videoIds)->whereBetween('created_at', $range)->count();
        $shares = VideoShare::whereIn('video_id', $videoIds)->whereBetween('created_at', $range)->count();
        $saves = VideoSave::whereIn('video_id', $videoIds)->whereBetween('created_at', $range)->count();

        // Bug fix: the raw fallback query this replaces never filtered
        // status = 'accepted', so pending follow requests on private
        // accounts could inflate "followers gained."
        $newFollowers = Follower::where('following_id', $creatorId)
            ->where('status', 'accepted')
            ->whereBetween('created_at', $range)
            ->count();

        $followersSnapshot = Follower::where('following_id', $creatorId)
            ->where('status', 'accepted')
            ->count();

        // lost_followers needs yesterday's snapshot to diff against. For any
        // day before this job has ever run for this creator, there is no
        // prior snapshot to compare - report 0 (an honest under-count) rather
        // than fabricate a number.
        $priorSnapshot = CreatorAnalytic::where('user_id', $creatorId)
            ->where('date', $day->copy()->subDay()->toDateString())
            ->value('followers_snapshot');

        $lostFollowers = 0;
        if ($priorSnapshot !== null) {
            $netChange = $followersSnapshot - (int) $priorSnapshot;
            $impliedLost = $newFollowers - $netChange;
            $lostFollowers = max(0, $impliedLost);
        }

        $profileViews = DB::table('profile_views')
            ->where('profile_user_id', $creatorId)
            ->whereBetween('viewed_at', $range)
            ->count();

        $earnings = CreatorEarning::where('user_id', $creatorId)
            ->whereBetween('earned_at', $range)
            ->sum('amount');

        CreatorAnalytic::updateOrCreate(
            ['user_id' => $creatorId, 'date' => $day->toDateString()],
            [
                'views' => $views,
                'watch_time_mins' => intdiv($watchTimeSecs, 60),
                'watch_time_secs' => $watchTimeSecs,
                'total_sessions' => $totalSessions,
                'completed_sessions' => $completedSessions,
                'replayed_sessions' => $replayedSessions,
                'new_followers' => $newFollowers,
                'lost_followers' => $lostFollowers,
                'followers_snapshot' => $followersSnapshot,
                'likes' => $likes,
                'comments' => $comments,
                'shares' => $shares,
                'saves' => $saves,
                'profile_views' => $profileViews,
                'earnings' => $earnings,
            ]
        );
    }
}
