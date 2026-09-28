<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\LiveStream;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Platform control over live streams.
 *
 * Kept apart from the host's own controls on purpose: these are the actions a
 * broadcaster must NOT be able to reach - featuring, force-ending someone
 * else's stream, and taking one down. Each writes to `live_stream_events` with
 * the admin's id, so every intervention is attributable.
 */
class AdminLiveStreamController extends Controller
{
    /* ── GET /admin/live-streams ────────────────────────────────────────── */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status'   => ['nullable', 'in:draft,scheduled,live,ended,banned'],
            'q'        => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $query = LiveStream::with('user:id,name,username,avatar')
            ->when($request->query('status') === 'banned',
                fn ($q) => $q->whereNotNull('banned_at'),
                fn ($q) => $q->when($request->query('status'), fn ($b, $s) => $b->where('status', $s)))
            ->when($request->query('q'), fn ($q, $t) => $q->where('title', 'ilike', "%{$t}%"))
            ->orderByRaw("case when status = 'live' then 0 else 1 end")
            ->orderByDesc('viewers_now')
            ->orderByDesc('created_at');

        $page = $query->paginate((int) $request->query('per_page', 25));

        return response()->json([
            'success' => true,
            'data'    => collect($page->items())->map(fn ($s) => $this->row($s))->all(),
            'meta'    => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'total'        => $page->total(),
            ],
            'summary' => [
                'live_now'      => (int) LiveStream::live()->count(),
                'viewers_now'   => (int) LiveStream::live()->sum('viewers_now'),
                'banned'        => (int) LiveStream::whereNotNull('banned_at')->count(),
                'scheduled'     => (int) LiveStream::where('status', LiveStream::STATUS_SCHEDULED)->count(),
            ],
        ]);
    }

    /* ── POST /admin/live-streams/{id}/feature · /unfeature ─────────────── */
    public function feature(Request $request, int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);
        $stream->forceFill(['is_featured' => true, 'featured_at' => now()])->save();
        $stream->recordEvent('featured', $request->user()->id);

        return response()->json(['success' => true, 'message' => 'Stream featured.']);
    }

    public function unfeature(Request $request, int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);
        $stream->forceFill(['is_featured' => false, 'featured_at' => null])->save();
        $stream->recordEvent('unfeatured', $request->user()->id);

        return response()->json(['success' => true, 'message' => 'Stream unfeatured.']);
    }

    /* ── POST /admin/live-streams/{id}/ban · /unban ─────────────────────── */
    /**
     * Take a stream down.
     *
     * `banned_at` is kept separate from `status` so the reason and the actor
     * survive: an admin takedown must never be indistinguishable from a host
     * ending their own broadcast.
     */
    public function ban(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'max:300']]);

        $stream = LiveStream::findOrFail($id);
        $stream->forceFill([
            'status'        => LiveStream::STATUS_BANNED,
            'banned_at'     => now(),
            'banned_reason' => $request->input('reason'),
            'banned_by'     => $request->user()->id,
            'ended_at'      => $stream->ended_at ?? now(),
            'viewers_now'   => 0,
            'is_featured'   => false,
        ])->save();

        $stream->viewers()->whereNull('left_at')->update(['left_at' => now()]);
        $stream->recordEvent('banned', $request->user()->id, ['reason' => $request->input('reason')]);

        return response()->json(['success' => true, 'message' => 'Stream taken down.']);
    }

    public function unban(Request $request, int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);
        $stream->forceFill([
            // Back to ended, never straight back to live: restoring must not
            // silently put a broadcast back on air without the host.
            'status'        => LiveStream::STATUS_ENDED,
            'banned_at'     => null,
            'banned_reason' => null,
            'banned_by'     => null,
        ])->save();
        $stream->recordEvent('unbanned', $request->user()->id);

        return response()->json(['success' => true, 'message' => 'Takedown lifted.']);
    }

    /* ── POST /admin/live-streams/{id}/force-end ────────────────────────── */
    public function forceEnd(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => ['nullable', 'string', 'max:300']]);

        $stream = LiveStream::findOrFail($id);
        $stream->forceFill([
            'status' => LiveStream::STATUS_ENDED, 'ended_at' => now(), 'viewers_now' => 0,
        ])->save();
        $stream->viewers()->whereNull('left_at')->update(['left_at' => now()]);
        $stream->recordEvent('force_ended', $request->user()->id, ['reason' => $request->input('reason')]);

        return response()->json(['success' => true, 'message' => 'Stream ended.']);
    }

    /* ── GET /admin/live-streams/{id}/events ────────────────────────────── */
    /** The audit trail for one stream, newest first. */
    public function events(Request $request, int $id): JsonResponse
    {
        $stream = LiveStream::findOrFail($id);

        $rows = $stream->events()->with('actor:id,name,username')
            ->orderByDesc('id')->limit(200)->get();

        return response()->json(['success' => true, 'data' => $rows->map(fn ($e) => [
            'id'         => (int) $e->id,
            'action'     => $e->action,
            'meta'       => $e->meta,
            'created_at' => $e->created_at?->toIso8601String(),
            'actor'      => $e->actor ? [
                'id' => (int) $e->actor->id, 'name' => $e->actor->name, 'username' => $e->actor->username,
            ] : null,
        ])]);
    }

    private function row(LiveStream $s): array
    {
        return [
            'id'            => (int) $s->id,
            'title'         => $s->title,
            'status'        => $s->status,
            'category'      => $s->category,
            'viewers'       => (int) $s->viewers_now,
            'peak_viewers'  => (int) $s->peak_viewers,
            'total_views'   => (int) $s->total_views,
            'gift_coins'    => (int) $s->gift_coins,
            'is_featured'   => (bool) $s->is_featured,
            'banned_at'     => optional($s->banned_at)->toIso8601String(),
            'banned_reason' => $s->banned_reason,
            'started_at'    => optional($s->started_at)->toIso8601String(),
            'host'          => $s->user ? [
                'id' => (int) $s->user->id, 'name' => $s->user->name, 'username' => $s->user->username,
            ] : null,
        ];
    }
}
