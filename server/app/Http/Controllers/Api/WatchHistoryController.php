<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Follower;
use App\Models\VideoEvent;
use App\Models\VideoView;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class WatchHistoryController extends Controller
{
    /* ── GET /history/list ────────────────────────────────────────── */
    public function list(Request $request): JsonResponse
    {
        $user    = $request->user();
        $perPage = min((int) $request->input('per_page', 20), 50);

        // One row per unique video; most recently watched first.
        // We pick the latest video_view id per video using a subquery so we
        // don't show duplicates when the user watched the same video twice.
        $latestIds = VideoView::where('user_id', $user->id)
            ->groupBy('video_id')
            ->selectRaw('MAX(id) as id')
            ->pluck('id');

        $rows = VideoView::whereIn('video_views.id', $latestIds)
            ->join('videos', 'videos.id', '=', 'video_views.video_id')
            ->join('users',  'users.id',  '=', 'videos.user_id')
            ->whereNull('videos.deleted_at')
            ->orderBy('video_views.created_at', 'desc')
            ->select([
                'video_views.id',
                'videos.id as video_id',
                'videos.title',
                'videos.duration',
                'videos.thumbnail_url',
                'videos.views_count',
                'videos.category',
                'users.name as creator',
                'users.username as creator_username',
                'users.is_verified',
                'video_views.created_at as watched_at',
            ])
            ->paginate($perPage);

        $data = $rows->map(function ($v) {
            $durationSecs = (int) ($v->duration ?? 0);
            // Classify type by duration: < 90s → Reels, else → Videos
            $type = $durationSecs > 0 && $durationSecs < 90 ? 'Reels' : 'Videos';

            return [
                'id'               => $v->id,
                'video_id'         => $v->video_id,
                'title'            => $v->title,
                'creator'          => $v->creator,
                'creator_username' => $v->creator_username,
                'verified'         => (bool) $v->is_verified,
                'views_count'      => (int) $v->views_count,
                'duration_secs'    => $durationSecs,
                'thumbnail_url'    => $v->thumbnail_url
                    ? Storage::url($v->thumbnail_url)
                    : null,
                'watched_at'       => $v->watched_at,
                'type'             => $type,
            ];
        });

        return response()->json([
            'success' => true,
            'data'    => $data,
            'meta'    => [
                'current_page' => $rows->currentPage(),
                'last_page'    => $rows->lastPage(),
                'total'        => $rows->total(),
                'per_page'     => $rows->perPage(),
            ],
        ]);
    }

    /* ── GET /history/summary ─────────────────────────────────────── */
    public function summary(Request $request): JsonResponse
    {
        $user  = $request->user();
        $today = now()->toDateString();

        // Total watch time today (sum of watch_duration seconds, capped per-view at 180s)
        $watchSeconds = (int) VideoView::where('user_id', $user->id)
            ->whereDate('created_at', $today)
            ->sum('watch_duration');

        $hours          = intdiv($watchSeconds, 3600);
        $mins           = intdiv($watchSeconds % 3600, 60);
        $watchFormatted = $hours > 0 ? "{$hours}h {$mins}m" : ($mins > 0 ? "{$mins}m" : '0m');

        // Unique videos watched today
        $videosCount = VideoView::where('user_id', $user->id)
            ->whereDate('created_at', $today)
            ->distinct('video_id')
            ->count('video_id');

        // Live replays: video_events with event_type = rewatch (proxy for "watched again")
        $liveReplays = (int) VideoEvent::where('user_id', $user->id)
            ->where('event_type', 'rewatch')
            ->whereDate('created_at', $today)
            ->distinct('video_id')
            ->count('video_id');

        // Top category - category with most views by this user (all time)
        $topCategory = VideoView::where('video_views.user_id', $user->id)
            ->join('videos', 'videos.id', '=', 'video_views.video_id')
            ->whereNotNull('videos.category')
            ->where('videos.category', '!=', '')
            ->groupBy('videos.category')
            ->orderByRaw('COUNT(*) DESC')
            ->limit(1)
            ->pluck('videos.category')
            ->first();

        return response()->json([
            'success' => true,
            'data'    => [
                'total_watched_today'  => $watchFormatted,
                'videos_watched_today' => $videosCount,
                'live_replays_watched' => $liveReplays,
                'top_category'         => $topCategory,
            ],
        ]);
    }

    /* ── GET /history/continue-watching ──────────────────────────── */
    public function continueWatching(Request $request): JsonResponse
    {
        $user = $request->user();

        // Latest view_progress event per video - fetch ordered DESC and deduplicate
        $events = VideoEvent::where('user_id', $user->id)
            ->where('event_type', 'view_progress')
            ->orderBy('id', 'desc')
            ->get(['id', 'video_id', 'payload', 'created_at'])
            ->unique('video_id')
            ->filter(fn ($e) =>
                isset($e->payload['completion_pct']) &&
                $e->payload['completion_pct'] > 0 &&
                $e->payload['completion_pct'] < 90
            )
            ->take(4)
            ->values();

        // Eager-load the video + owner in one query
        $videoIds = $events->pluck('video_id')->all();
        $videos   = \App\Models\Video::with('user')
            ->whereIn('id', $videoIds)
            ->where('status', 'published')
            ->get()
            ->keyBy('id');

        $result = $events
            ->filter(fn ($e) => isset($videos[$e->video_id]))
            ->map(function ($event) use ($videos) {
                $video          = $videos[$event->video_id];
                $pct            = (float) ($event->payload['completion_pct']  ?? 0);
                $watchedSeconds = (int)   ($event->payload['watch_duration']  ?? 0);
                $totalSeconds   = (int)   ($video->duration                   ?? 0);
                $remaining      = max(0, $totalSeconds - $watchedSeconds);
                $mins           = intdiv($remaining, 60);
                $secs           = $remaining % 60;
                $remainingStr   = $totalSeconds > 0
                    ? sprintf('%d:%02d remaining', $mins, $secs)
                    : 'In progress';

                return [
                    'video_id'      => $video->id,
                    'title'         => $video->title,
                    'thumbnail_url' => $video->thumbnail_url
                        ? Storage::url($video->thumbnail_url)
                        : null,
                    'creator_name'  => $video->user->name ?? '',
                    'progress'      => (int) round($pct),
                    'remaining'     => $remainingStr,
                    'resume_at'     => $watchedSeconds,
                ];
            })
            ->values();

        return response()->json(['success' => true, 'data' => $result]);
    }

    /* ── GET /history/creators ────────────────────────────────────── */
    public function creators(Request $request): JsonResponse
    {
        $user = $request->user();

        $rows = VideoView::where('video_views.user_id', $user->id)
            ->join('videos', 'videos.id', '=', 'video_views.video_id')
            ->join('users',  'users.id',  '=', 'videos.user_id')
            ->where('videos.user_id', '!=', $user->id)
            ->whereNull('videos.deleted_at')
            ->groupBy('users.id', 'users.name', 'users.username', 'users.avatar', 'users.is_verified')
            ->orderByRaw('MAX(video_views.created_at) DESC')
            ->limit(10)
            ->select([
                'users.id',
                'users.name',
                'users.username',
                'users.avatar',
                'users.is_verified',
                DB::raw('COUNT(video_views.id) as watch_count'),
            ])
            ->get();

        // Batch-check follow status
        $creatorIds   = $rows->pluck('id')->all();
        $followingIds = Follower::where('follower_id', $user->id)
            ->whereIn('following_id', $creatorIds)
            ->pluck('following_id')
            ->flip()
            ->all();

        $data = $rows->map(function ($row) use ($followingIds) {
            return [
                'id'           => $row->id,
                'name'         => $row->name,
                'username'     => $row->username,
                'avatar'       => $row->avatar ? Storage::url($row->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified'  => (bool) $row->is_verified,
                'is_following' => isset($followingIds[$row->id]),
                'watch_count'  => (int) $row->watch_count,
            ];
        });

        return response()->json(['success' => true, 'data' => $data]);
    }

    /* ── PATCH /history/settings ──────────────────────────────────── */
    public function updateSettings(Request $request): JsonResponse
    {
        $request->validate([
            'save_watch_history' => ['required', 'boolean'],
        ]);

        $request->user()->update([
            'save_watch_history' => $request->boolean('save_watch_history'),
        ]);

        return response()->json(['success' => true, 'message' => 'History settings saved.']);
    }

    /* ── GET /history/settings ────────────────────────────────────── */
    public function getSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        return response()->json([
            'success' => true,
            'data'    => [
                'save_watch_history' => (bool) ($user->save_watch_history ?? true),
            ],
        ]);
    }

    /* ── DELETE /history ──────────────────────────────────────────── */
    public function clearAll(Request $request): JsonResponse
    {
        VideoView::where('user_id', $request->user()->id)->delete();

        return response()->json(['success' => true, 'message' => 'Watch history cleared.']);
    }

    /* ── DELETE /history/video/{videoId} ──────────────────────────── */
    public function removeVideo(Request $request, int $videoId): JsonResponse
    {
        VideoView::where('user_id', $request->user()->id)
            ->where('video_id', $videoId)
            ->delete();

        return response()->json(['success' => true, 'message' => 'Removed from history.']);
    }
}
