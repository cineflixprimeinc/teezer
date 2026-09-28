<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContentReport;
use App\Models\LiveStream;
use App\Models\LiveStreamMessage;
use App\Models\LiveStreamViewer;
use App\Models\User;
use App\StreamHub\LiveStreamHubService;
use App\Services\ReportEvidenceService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Live streams, from the audience's side: browse, watch, presence and chat.
 *
 * Host-only controls live in Studio\StudioLiveController and admin-only ones in
 * Admin\AdminLiveStreamController, so "what a viewer may do" is decided in one
 * file and cannot quietly widen.
 */
class LiveStreamController extends Controller
{
    public function __construct(private LiveStreamHubService $hub) {}

    /* ── GET /live-streams ──────────────────────────────────────────────── */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'q'        => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:60'],
            'sort'     => ['nullable', 'in:viewers,newest'],
            'per_page' => ['nullable', 'integer', 'min:6', 'max:48'],
        ]);

        $query = LiveStream::query()
            ->with('user:id,name,username,avatar,is_verified')
            ->live()
            ->publiclyVisible();

        if ($q = $request->query('q')) {
            $query->where(function ($w) use ($q) {
                $w->where('title', 'ilike', "%{$q}%")
                  ->orWhereExists(function ($sub) use ($q) {
                      $sub->selectRaw('1')->from('users as lu')
                          ->whereColumn('lu.id', 'live_streams.user_id')
                          ->where(fn ($n) => $n->where('lu.name', 'ilike', "%{$q}%")
                                               ->orWhere('lu.username', 'ilike', "%{$q}%"));
                  });
            });
        }
        if ($cat = $request->query('category')) {
            $query->where('category', $cat);
        }

        $query->when(
            $request->query('sort') === 'newest',
            fn ($b) => $b->orderByDesc('started_at'),
            fn ($b) => $b->orderByDesc('viewers_now')->orderByDesc('started_at'),
        );

        $page = $query->paginate((int) $request->query('per_page', 12));

        return response()->json([
            'success' => true,
            'data'    => collect($page->items())->map(fn ($s) => $this->card($s))->all(),
            'meta'    => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'total'        => $page->total(),
            ],
            // The chips on the browse page: only categories actually on air, so
            // a chip can never lead to an empty shelf.
            'categories' => LiveStream::query()->live()->publiclyVisible()
                ->whereNotNull('category')
                ->selectRaw('category, count(*) as n, sum(viewers_now) as viewers')
                ->groupBy('category')->orderByDesc('viewers')->get()
                ->map(fn ($r) => [
                    'category' => $r->category,
                    'streams'  => (int) $r->n,
                    'viewers'  => (int) $r->viewers,
                ]),
        ]);
    }

    /* ── GET /live-streams/{id} ─────────────────────────────────────────── */
    public function show(Request $request, int $id): JsonResponse
    {
        $stream = LiveStream::with('user:id,name,username,avatar,is_verified')->findOrFail($id);
        $user   = $request->user();

        if (! $this->canWatch($stream, $user)) {
            return response()->json(['success' => false, 'message' => 'This stream is unavailable.'], 404);
        }

        return response()->json(['success' => true, 'data' => [
            'stream'      => $this->card($stream) + [
                'description'   => $stream->description,
                'playback_url'  => $stream->playback_url,
                'room_name'     => $stream->room_name,
                'scheduled_for' => optional($stream->scheduled_for)->toIso8601String(),
                'ended_at'      => optional($stream->ended_at)->toIso8601String(),
                'replay_url'    => $stream->replay_enabled ? $stream->replay_url : null,
                'peak_viewers'  => (int) $stream->peak_viewers,
                'total_views'   => (int) $stream->total_views,
                'gift_coins'    => (int) $stream->gift_coins,
            ],
            // Everything the client needs to decide what to render, decided here.
            'controls'    => [
                'chat_enabled'        => $stream->chat_enabled,
                'gifts_enabled'       => $stream->gifts_enabled,
                'followers_only_chat' => $stream->followers_only_chat,
                'slow_mode_seconds'   => (int) $stream->slow_mode_seconds,
                'can_moderate'        => $stream->isModeratedBy($user) || (bool) $user?->isAdmin(),
                'chat_blocked_reason' => $stream->chatBlockedReason($user),
            ],
        ]]);
    }

    /* ── POST /live-streams/{id}/join · /leave ──────────────────────────── */
    public function join(Request $request, int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);
        $user   = $request->user();

        // SECURITY: the same gate show() uses. Without it, anyone who knows
        // (or enumerates) a stream id could join a followers-only broadcast
        // and receive a viewer token for it.
        if (! $this->canWatch($stream, $user)) {
            return response()->json(['success' => false, 'message' => 'This stream is unavailable.'], 404);
        }
        if (! $stream->isLive()) {
            return response()->json(['success' => false, 'message' => 'This stream is not live.'], 422);
        }

        $userId = $user?->id;
        // One open row per viewer: rejoining after a dropped socket must not
        // count the same person twice.
        $open = LiveStreamViewer::where('live_stream_id', $stream->id)
            ->where(fn ($q) => $userId ? $q->where('user_id', $userId) : $q->where('guest_key', $this->guestKey($request)))
            ->whereNull('left_at')->first();

        if (! $open) {
            LiveStreamViewer::create([
                'live_stream_id' => $stream->id,
                'user_id'        => $userId,
                'guest_key'      => $userId ? null : $this->guestKey($request),
                'joined_at'      => now(),
            ]);
            $stream->increment('total_views');
        }

        $stream->syncViewerCount();

        return response()->json([
            'success' => true,
            'viewers' => (int) $stream->fresh()->viewers_now,
            // Subscribe-only: this token cannot publish, so a viewer can never
            // push their own camera into someone else's broadcast.
            'watch'   => [
                'url'   => (string) config('services.livekit.host'),
                'room'  => $this->hub->roomName($stream),
                'token' => $this->hub->viewerToken($stream, $userId, $userId ? null : $this->guestKey($request)),
            ],
        ]);
    }

    public function leave(Request $request, int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);
        $userId = $request->user()?->id;

        LiveStreamViewer::where('live_stream_id', $stream->id)
            ->where(fn ($q) => $userId ? $q->where('user_id', $userId) : $q->where('guest_key', $this->guestKey($request)))
            ->whereNull('left_at')
            ->each(function ($v) {
                $v->forceFill([
                    'left_at'       => now(),
                    'watch_seconds' => max(0, now()->diffInSeconds($v->joined_at)),
                ])->save();
            });

        $stream->syncViewerCount();

        return response()->json(['success' => true]);
    }

    /* ── GET /live-streams/{id}/messages ────────────────────────────────── */
    public function messages(Request $request, int $id): JsonResponse
    {
        $request->validate(['after' => ['nullable', 'integer'], 'limit' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $stream = LiveStream::findOrFail($id);

        // SECURITY: same gate as show()/join() - chat history is part of what
        // "followers only" is meant to hide, not just the video.
        if (! $this->canWatch($stream, $request->user())) {
            return response()->json(['success' => false, 'message' => 'This stream is unavailable.'], 404);
        }

        $rows = $stream->messages()
            ->with('user:id,name,username,avatar,is_verified')
            ->whereNull('removed_at')
            ->when($request->query('after'), fn ($q, $a) => $q->where('id', '>', (int) $a))
            ->orderBy('id')
            ->limit((int) $request->query('limit', 60))
            ->get();

        return response()->json(['success' => true, 'data' => $rows->map(fn ($m) => $this->message($m, $stream))]);
    }

    /* ── POST /live-streams/{id}/messages ───────────────────────────────── */
    public function postMessage(Request $request, int $id): JsonResponse
    {
        $request->validate(['body' => ['required', 'string', 'max:300']]);
        $stream = LiveStream::findOrFail($id);

        // The single gate. Slow mode, timeouts, account age and chat-off all
        // answer from the model so no surface can be more permissive.
        if ($why = $stream->chatBlockedReason($request->user())) {
            return response()->json(['success' => false, 'message' => $why], 422);
        }

        $msg = $stream->messages()->create([
            'user_id' => $request->user()->id,
            'body'    => $request->input('body'),
        ]);

        return response()->json([
            'success' => true,
            'data'    => $this->message($msg->load('user:id,name,username,avatar,is_verified'), $stream),
        ], 201);
    }

    /* ── POST /live-streams/{id}/report ───────────────────────────────────
     * Live streams never had a report system at all - not gated on
     * canWatch()/visibility (see the top-of-file "what a viewer may do"
     * note): a report about a stream someone saw shared elsewhere, even
     * one they can no longer or never could watch, is still a legitimate
     * safety report worth capturing, not something to 404 away. */
    public function report(Request $request, ReportEvidenceService $reportEvidence, int $id): JsonResponse
    {
        $request->validate([
            'reason'  => ['required', 'string', 'in:spam,nudity,hate_speech,harassment,violence,self_harm,scam_fraud,other'],
            'details' => ['nullable', 'string', 'max:500'],
            ...$reportEvidence->rules(),
        ]);

        $stream = LiveStream::findOrFail($id);
        $userId = $request->user()->id;

        $already = ContentReport::type(ContentReport::TYPE_LIVE_STREAM)
            ->where('reportable_id', $stream->id)
            ->where('reporter_id', $userId)
            ->exists();
        if ($already) {
            return response()->json(['success' => false, 'message' => 'You have already reported this stream.'], 422);
        }

        ContentReport::create([
            'reportable_type' => ContentReport::TYPE_LIVE_STREAM,
            'reportable_id'   => $stream->id,
            'reporter_id'     => $userId,
            'reason'          => $request->input('reason'),
            'details'         => $request->input('details'),
            'evidence_keys'   => $reportEvidence->store($request),
        ]);

        return response()->json(['success' => true, 'message' => 'Report submitted. Thank you for keeping Teezer safe.']);
    }

    /* ── Internals ──────────────────────────────────────────────────────── */

    /**
     * Whether $user may watch $stream at all - the single gate for show(),
     * join() and messages(), so none of them can drift looser than the others.
     *
     *  - public    → anyone, signed in or not
     *  - followers → an accepted follower of the host (host/moderators/admin
     *                always pass)
     *  - unlisted  → anyone with the id/link - kept out of index()'s
     *                publiclyVisible() scope, which is the whole of the
     *                "unlisted" contract; it is not a follow gate
     *
     * A banned stream is refused for everyone except a moderator or admin,
     * same as before this check existed.
     */
    private function canWatch(LiveStream $stream, ?User $user): bool
    {
        if ($stream->isModeratedBy($user) || (bool) $user?->isAdmin()) {
            return true;
        }
        if ($stream->isBanned()) {
            return false;
        }
        if ($stream->visibility !== 'followers') {
            return true;
        }

        return $user && DB::table('followers')
            ->where('follower_id', $user->id)
            ->where('following_id', $stream->user_id)
            ->where('status', 'accepted')
            ->exists();
    }

    /** A stable per-device key so signed-out viewers are counted once. */
    private function guestKey(Request $request): string
    {
        return substr(hash('sha256', $request->ip() . '|' . $request->userAgent()), 0, 64);
    }

    private function card(LiveStream $s): array
    {
        $host = $s->user;

        return [
            'id'            => (int) $s->id,
            'title'         => $s->title,
            'category'      => $s->category,
            'status'        => $s->status,
            'thumbnail_url' => $s->thumbnail_url,
            'viewers'       => (int) $s->viewers_now,
            'likes'         => (int) $s->likes_count,
            'started_at'    => optional($s->started_at)->toIso8601String(),
            'is_featured'   => (bool) $s->is_featured,
            'host'          => $host ? [
                'id'       => (int) $host->id,
                'name'     => $host->name,
                'username' => $host->username,
                'avatar'   => $host->avatar ? Storage::url($host->avatar) : StorageService::defaultAvatarUrl(),
                'verified' => (bool) $host->is_verified,
            ] : null,
        ];
    }

    private function message(LiveStreamMessage $m, LiveStream $s): array
    {
        $u = $m->user;

        return [
            'id'         => (int) $m->id,
            'body'       => $m->body,
            'gift_coins' => $m->gift_coins ? (int) $m->gift_coins : null,
            'is_pinned'  => (bool) $m->is_pinned,
            'is_host'    => $u && (int) $u->id === (int) $s->user_id,
            'created_at' => $m->created_at->toIso8601String(),
            'user'       => $u ? [
                'id'       => (int) $u->id,
                'name'     => $u->name,
                'username' => $u->username,
                'avatar'   => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
                'verified' => (bool) $u->is_verified,
            ] : null,
        ];
    }
}
