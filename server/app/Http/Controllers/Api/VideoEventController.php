<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\UpdateVideoScoreJob;
use App\Models\Video;
use App\Models\VideoEvent;
use App\Models\UserVideoPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;

class VideoEventController extends Controller
{
    /**
     * POST /api/video-events
     *
     * Unified event tracking for the recommendation engine.
     * Fires asynchronously - frontend should fire-and-forget.
     *
     * Required: video_id, event_type
     * Optional payload keys:
     *   view_progress  → completion_pct (0–100), watch_duration (seconds)
     *   skip           → watch_duration
     *   rewatch        → (none)
     *   share          → platform
     *   follow_from_video, like, comment, save, not_interested, report → (none extra)
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'video_id'   => ['required', 'integer', 'exists:videos,id'],
            'event_type' => ['required', 'string', 'in:view_progress,skip,rewatch,like,comment,share,save,follow_from_video,not_interested,report'],
            'payload'    => ['nullable', 'array'],
            'payload.completion_pct'  => ['nullable', 'numeric', 'min:0', 'max:100'],
            'payload.watch_duration'  => ['nullable', 'integer', 'min:0'],
            'payload.platform'        => ['nullable', 'string', 'max:50'],
            'session_id' => ['nullable', 'string', 'max:64'],
            // Client-generated idempotency key. Optional, so older app and web
            // builds that do not send one keep exactly their previous behaviour.
            'event_id'   => ['nullable', 'string', 'max:100'],
        ]);

        $userId    = $request->user()?->id;
        $videoId   = (int) $data['video_id'];
        $eventType = $data['event_type'];

        // ── Rate limiting ─────────────────────────────────────────────────
        // view_progress: 300/min per IP (high-frequency); others: 60/min
        $limitKey    = "event:{$eventType}:" . ($userId ?? $request->ip());
        $maxAttempts = in_array($eventType, ['view_progress', 'skip']) ? 300 : 60;

        if (RateLimiter::tooManyAttempts($limitKey, $maxAttempts)) {
            return response()->json(['success' => false, 'message' => 'Too many events.'], 429);
        }
        RateLimiter::hit($limitKey, 60);

        // ── Idempotency: drop a replay of an event already recorded ───────
        //
        // Mirrors the Go handler's own check (backend-go/internal/handlers/
        // video_events.go) - the two are maintained as byte-for-byte behavioural
        // twins, and which of them serves a request is a gateway decision, so a
        // rule enforced in only one of them is a rule that silently does not
        // apply half the time.
        //
        // The 10-minute window is deliberately shorter than the 24h product
        // dedupe below: this one only has to outlive a retry (a dropped
        // connection, a replayed POST, an app resuming from background), which
        // happens in seconds. Every view and progress beat carries a key, so a
        // 24h window would hold vastly more cache entries to catch duplicates
        // that never arrive that late.
        //
        // Scoped to the subject so one client's key cannot suppress another's,
        // and returned as success - a retry did not fail, it was just unneeded.
        $eventId = $data['event_id'] ?? null;
        if ($eventId !== null && $eventId !== '') {
            $subject     = $userId ?? $request->ip();
            $idempotency = "evt_id:{$subject}:{$eventId}";
            if (Cache::has($idempotency)) {
                return response()->json(['success' => true, 'deduped' => true]);
            }
            Cache::put($idempotency, 1, now()->addMinutes(10));
        }

        // ── Deduplicate certain event types per session ───────────────────
        if (in_array($eventType, ['like', 'save', 'follow_from_video'])) {
            $dedupeKey = "evt_dedup:{$eventType}:{$videoId}:" . ($userId ?? $request->ip());
            if (Cache::has($dedupeKey)) {
                return response()->json(['success' => true, 'deduped' => true]);
            }
            Cache::put($dedupeKey, 1, now()->addHours(24));
        }

        // ── Persist event ─────────────────────────────────────────────────
        VideoEvent::create([
            'video_id'   => $videoId,
            'user_id'    => $userId,
            'session_id' => $data['session_id'] ?? null,
            'event_type' => $eventType,
            'payload'    => $data['payload'] ?? null,
            'ip_address' => $request->ip(),
        ]);

        // ── Update user preferences (for personalization) ─────────────────
        if ($userId) {
            $this->updateUserPreferences($userId, $videoId, $eventType);
        }

        // ── Dispatch async score recomputation ────────────────────────────
        // Debounce: only dispatch once per video per 5 min to avoid job flood
        $debounceKey = "score_job_debounce:{$videoId}";
        if (! Cache::has($debounceKey)) {
            Cache::put($debounceKey, 1, now()->addMinutes(5));
            UpdateVideoScoreJob::dispatch($videoId)->onQueue('default');
        }

        return response()->json(['success' => true]);
    }

    private function updateUserPreferences(int $userId, int $videoId, string $eventType): void
    {
        // Map event type to preference delta weight
        $delta = match ($eventType) {
            'like', 'save', 'rewatch'     => 2.0,
            'comment', 'share'            => 3.0,
            'follow_from_video'           => 5.0,
            'view_progress'               => 0.5,
            'skip', 'not_interested'      => -3.0,
            'report'                      => -10.0,
            default                       => 0.0,
        };

        if ($delta === 0.0) return;

        // Load video hashtags and category - batch for the preferences
        $video = \App\Models\Video::with('hashtags')
            ->select('id', 'category', 'user_id')
            ->find($videoId);

        if (! $video) return;

        // Update hashtag preferences
        foreach ($video->hashtags->pluck('name') as $tag) {
            UserVideoPreference::adjust($userId, 'hashtag', $tag, $delta);
        }

        // Update category preference
        if ($video->category) {
            UserVideoPreference::adjust($userId, 'category', $video->category, $delta);
        }

        // Update creator preference
        if ($video->user_id && $video->user_id !== $userId) {
            UserVideoPreference::adjust($userId, 'creator', (string) $video->user_id, $delta);
        }
    }
}
