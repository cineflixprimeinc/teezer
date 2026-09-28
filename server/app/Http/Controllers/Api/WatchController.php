<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Video;
use App\Models\VideoView;
use App\Models\VideoWatchSession;
use App\Models\VideoWatchEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WatchController extends Controller
{
    private const MAX_DELTA = 13; // 5s interval + 8s network/lag buffer

    // POST /api/watch/start
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'video_id'   => ['required', 'integer', 'min:1'],
            'session_id' => ['required', 'string', 'max:64'],
            'device_id'  => ['nullable', 'string', 'max:64'],
        ]);

        $video = Video::where('id', $data['video_id'])
            ->whereIn('status', ['published', 'unlisted'])
            ->whereNull('deleted_at')
            ->first();

        if (!$video) {
            return response()->json(['success' => false], 404);
        }

        // Idempotent - duplicate start is fine
        if (VideoWatchSession::where('session_id', $data['session_id'])->exists()) {
            return response()->json(['success' => true]);
        }

        $userId = $request->user()?->id;

        VideoWatchSession::create([
            'video_id'   => $data['video_id'],
            'user_id'    => $userId,
            'session_id' => $data['session_id'],
            'device_id'  => $data['device_id'] ?? null,
            'ip_hash'    => hash('sha256', $request->ip() ?? ''),
            'started_at' => now(),
        ]);

        VideoWatchEvent::create([
            'session_id'    => $data['session_id'],
            'video_id'      => $data['video_id'],
            'user_id'       => $userId,
            'event_type'    => 'start',
            'current_time'  => 0,
            'watched_delta' => 0,
        ]);

        return response()->json(['success' => true]);
    }

    // POST /api/watch/progress
    public function progress(Request $request): JsonResponse
    {
        $data = $request->validate([
            'session_id'    => ['required', 'string', 'max:64'],
            'video_id'      => ['required', 'integer', 'min:1'],
            'watched_delta' => ['required', 'integer', 'min:0', 'max:' . self::MAX_DELTA],
            'current_time'  => ['required', 'integer', 'min:0'],
            'event_type'    => ['nullable', 'string', 'in:progress,pause,resume,visibility_hidden'],
        ]);

        $delta = (int) $data['watched_delta'];
        if ($delta === 0) {
            return response()->json(['success' => true]);
        }

        $session = VideoWatchSession::where('session_id', $data['session_id'])
            ->where('video_id', $data['video_id'])
            ->whereNull('ended_at')
            ->first();

        if (!$session) {
            return response()->json(['success' => false, 'message' => 'Session not found'], 404);
        }

        $video = Video::find($data['video_id']);
        if (!$video) {
            return response()->json(['success' => false], 404);
        }

        // Abuse guard: cap total to 2× duration
        $maxAllowed = $video->duration > 0 ? $video->duration * 2 : 7200;
        if ($session->watch_seconds + $delta > $maxAllowed) {
            $delta = max(0, $maxAllowed - $session->watch_seconds);
        }
        if ($delta === 0) {
            return response()->json(['success' => true]);
        }

        $userId = $request->user()?->id;

        // Accumulate counters (no lock needed - slight inaccuracy on rare concurrent calls is acceptable)
        $session->increment('watch_seconds', $delta);
        $video->increment('total_watch_seconds', $delta);

        VideoWatchEvent::create([
            'session_id'    => $data['session_id'],
            'video_id'      => $data['video_id'],
            'user_id'       => $userId,
            'event_type'    => $data['event_type'] ?? 'progress',
            'current_time'  => (int) $data['current_time'],
            'watched_delta' => $delta,
        ]);

        // View threshold: min(2s, duration * 0.3)
        if (!$session->view_counted) {
            $dur       = (int) ($video->duration ?? 0);
            $threshold = $dur > 0 ? (int) min(2, ceil($dur * 0.3)) : 2;
            $session->refresh();

            if ($session->watch_seconds >= $threshold && !($userId && $userId === $video->user_id)) {
                // Lock only for the critical view-counting check
                DB::transaction(function () use ($session, $video, $userId, $request) {
                    $locked = VideoWatchSession::lockForUpdate()->find($session->id);
                    if ($locked && !$locked->view_counted) {
                        $this->countView($locked, $video, $userId, $request);
                        // Update average
                        $video->refresh();
                        if ($video->views_count > 0) {
                            Video::where('id', $video->id)->update([
                                'average_watch_seconds' => (int) ($video->total_watch_seconds / $video->views_count),
                            ]);
                        }
                    }
                });
            }
        }

        return response()->json(['success' => true]);
    }

    // POST /api/watch/end
    public function end(Request $request): JsonResponse
    {
        $data = $request->validate([
            'session_id'        => ['required', 'string', 'max:64'],
            'video_id'          => ['required', 'integer', 'min:1'],
            'final_watch_delta' => ['nullable', 'integer', 'min:0', 'max:' . self::MAX_DELTA],
            'max_position'      => ['nullable', 'integer', 'min:0'],
            'completed'         => ['nullable', 'boolean'],
            'replay_count'      => ['nullable', 'integer', 'min:0', 'max:100'],
        ]);

        $session = VideoWatchSession::where('session_id', $data['session_id'])
            ->where('video_id', $data['video_id'])
            ->whereNull('ended_at')
            ->first();

        if (!$session) {
            return response()->json(['success' => true]); // already ended, no-op
        }

        $userId      = $request->user()?->id;
        $video       = Video::find($data['video_id']);
        $finalDelta  = (int) ($data['final_watch_delta'] ?? 0);
        $completed   = (bool) ($data['completed'] ?? false);
        $replayCount = (int) ($data['replay_count'] ?? 0);

        DB::transaction(function () use ($session, $finalDelta, $completed, $replayCount, $data, $userId, $video, $request) {

            // Flush remaining accumulated seconds
            if ($finalDelta > 0 && $video) {
                $maxAllowed = $video->duration > 0 ? $video->duration * 2 : 7200;
                if ($session->watch_seconds + $finalDelta <= $maxAllowed) {
                    $session->increment('watch_seconds', $finalDelta);
                    $video->increment('total_watch_seconds', $finalDelta);

                    // Late view count (user left before 5s progress flush)
                    if (!$session->view_counted && !($userId && $userId === $video?->user_id)) {
                        $session->refresh();
                        $dur       = (int) ($video->duration ?? 0);
                        $threshold = $dur > 0 ? (int) min(2, ceil($dur * 0.3)) : 2;
                        if ($session->watch_seconds >= $threshold) {
                            $this->countView($session, $video, $userId, $request);
                        }
                    }
                }
            }

            VideoWatchEvent::create([
                'session_id'    => $data['session_id'],
                'video_id'      => $data['video_id'],
                'user_id'       => $userId,
                'event_type'    => 'exit',
                'current_time'  => (int) ($data['max_position'] ?? 0),
                'watched_delta' => $finalDelta,
            ]);

            $session->update([
                'ended_at'     => now(),
                'max_position' => (int) ($data['max_position'] ?? $session->max_position),
                'completed'    => $completed,
                'replay_count' => $replayCount,
            ]);

            if ($video) {
                $increments = [];
                if ($completed)        $increments['total_completions'] = DB::raw('total_completions + 1');
                if ($replayCount > 0)  $increments['total_replays']     = DB::raw('total_replays + ' . $replayCount);

                if ($increments) {
                    Video::where('id', $video->id)->update($increments);
                }

                // Refresh all cached rate counters
                $video->refresh();
                $views = max(1, $video->views_count);
                Video::where('id', $video->id)->update([
                    'average_watch_seconds' => (int) ($video->total_watch_seconds / $views),
                    'completion_rate'       => (int) min(100, round($video->total_completions / $views * 100)),
                    'rewatch_rate'          => (int) min(100, round($video->total_replays     / $views * 100)),
                ]);
            }
        });

        return response()->json(['success' => true]);
    }

    private function countView(VideoWatchSession $session, Video $video, ?int $userId, Request $request): void
    {
        $session->view_counted = true;
        $session->saveQuietly();

        // Serialize the duplicate check with /videos/{id}/view and any parallel
        // watch-session progress/end request for the same video.
        Video::whereKey($video->id)->lockForUpdate()->first();

        // Maintain backward-compatible VideoView record (Studio analytics uses this table)
        $isDuplicate = VideoView::where('video_id', $video->id)
            ->when($userId, fn ($q) => $q->where('user_id', $userId))
            ->when(!$userId, fn ($q) => $q->where('ip_address', $request->ip()))
            ->where('created_at', '>=', now()->subHour())
            ->exists();

        if (!$isDuplicate) {
            VideoView::create([
                'video_id'       => $video->id,
                'user_id'        => $userId,
                'ip_address'     => $request->ip(),
                'watch_duration' => $session->watch_seconds,
                'source'         => 'direct',
                'country'        => $this->resolveCountry($request),
                'device_type'    => $this->resolveDeviceType($request),
            ]);
            // Buffer the view; counters:flush batches it into videos.views_count.
            \App\Services\CounterBuffer::add('video', (int) $video->id, 'views_count');
        }
    }

    private function resolveCountry(Request $request): ?string
    {
        $code = $request->header('CF-IPCountry');
        if (!$code || $code === 'XX' || !preg_match('/^[A-Z]{2}$/', $code)) return null;
        return $code;
    }

    private function resolveDeviceType(Request $request): string
    {
        $ua = $request->userAgent() ?? '';
        if (preg_match('/Mobile|Android|iPhone|iPod/i', $ua)) return 'mobile';
        if (preg_match('/Tablet|iPad/i', $ua)) return 'tablet';
        return 'desktop';
    }
}
