<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\LiveStream;
use App\Models\LiveStreamBan;
use App\Models\LiveStreamModerator;
use App\StreamHub\LiveStreamHubService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The broadcaster's own controls: create a stream, go live, end it, and turn
 * the per-stream switches.
 *
 * Every action is scoped to a stream the caller hosts (or moderates, where that
 * makes sense), and every one writes to `live_stream_events` - "who turned chat
 * off" has to be answerable after the fact, not guessed from a timestamp.
 */
class StudioLiveController extends Controller
{
    public function __construct(private LiveStreamHubService $hub) {}

    /* ── GET /studio/live ───────────────────────────────────────────────── */
    public function index(Request $request): JsonResponse
    {
        $rows = LiveStream::where('user_id', $request->user()->id)
            ->orderByRaw("case when status = 'live' then 0 else 1 end")
            ->orderByDesc('created_at')
            ->limit(50)->get();

        return response()->json(['success' => true, 'data' => $rows->map(fn ($s) => [
            'id'            => (int) $s->id,
            'title'         => $s->title,
            'status'        => $s->status,
            'category'      => $s->category,
            'viewers'       => (int) $s->viewers_now,
            'peak_viewers'  => (int) $s->peak_viewers,
            'total_views'   => (int) $s->total_views,
            'gift_coins'    => (int) $s->gift_coins,
            'started_at'    => optional($s->started_at)->toIso8601String(),
            'ended_at'      => optional($s->ended_at)->toIso8601String(),
            'scheduled_for' => optional($s->scheduled_for)->toIso8601String(),
            'is_featured'   => (bool) $s->is_featured,
            'banned'        => $s->isBanned(),
        ])]);
    }

    /* ── POST /studio/live ──────────────────────────────────────────────── */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'         => ['required', 'string', 'max:200'],
            'description'   => ['nullable', 'string', 'max:2000'],
            'category'      => ['nullable', 'string', 'max:60'],
            'visibility'    => ['nullable', 'in:public,followers,unlisted'],
            'scheduled_for' => ['nullable', 'date', 'after:now'],
        ]);

        $stream = LiveStream::create($data + [
            'user_id'    => $request->user()->id,
            'status'     => isset($data['scheduled_for']) ? LiveStream::STATUS_SCHEDULED : LiveStream::STATUS_DRAFT,
            'visibility' => $data['visibility'] ?? 'public',
            'room_name'  => 'live_' . Str::lower(Str::random(18)),
            'ingest_key' => LiveStream::newIngestKey(),
        ]);

        $stream->recordEvent('created', $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Stream created.',
            // The only response that ever carries the publishing secret, and
            // only to the broadcaster who just made it.
            'data'    => $this->ownerPayload($stream) + ['ingest_key' => $stream->ingest_key],
        ], 201);
    }

    /* ── POST /studio/live/{id}/start · /end ────────────────────────────── */
    public function start(Request $request, int $id): JsonResponse
    {
        $stream = $this->ownedStream($request, $id);

        if ($stream->isBanned()) {
            return response()->json(['success' => false, 'message' => 'This stream was removed by moderation.'], 403);
        }
        if ($stream->isLive()) {
            return response()->json(['success' => true, 'message' => 'Already live.', 'data' => $this->ownerPayload($stream)]);
        }

        // Open the LiveKit room BEFORE flipping status: a stream that says it
        // is live with nowhere to publish is worse than one that failed to start.
        $this->hub->createRoom($stream);
        $token = $this->hub->publisherToken($stream, (int) $request->user()->id);

        if ($this->hub->isConfigured() && ! $token) {
            return response()->json([
                'success' => false,
                'message' => 'Could not reach the streaming server. Try again in a moment.',
            ], 503);
        }

        $stream->forceFill([
            'status'      => LiveStream::STATUS_LIVE,
            'started_at'  => $stream->started_at ?? now(),
            'ended_at'    => null,
            'viewers_now' => 0,
        ])->save();

        if ($stream->replay_enabled) $this->hub->startRecording($stream);
        $stream->recordEvent('went_live', $request->user()->id);

        return response()->json([
            'success' => true,
            'message' => "You're live.",
            // The ingest credential. Minted per request, never stored - whoever
            // holds it can publish into this room.
            'publish' => [
                'url'       => (string) config('services.livekit.host'),
                'room'      => $this->hub->roomName($stream),
                'token'     => $token,
                'identity'  => $this->hub->identityFor((int) $request->user()->id),
            ],
            'data'    => $this->ownerPayload($stream),
        ]);
    }

    public function end(Request $request, int $id): JsonResponse
    {
        $stream = $this->ownedStream($request, $id);

        $stream->forceFill([
            'status'      => LiveStream::STATUS_ENDED,
            'ended_at'    => now(),
            'viewers_now' => 0,
        ])->save();

        // Close every open viewing session, or presence stays stuck at the
        // moment the broadcast stopped.
        $stream->viewers()->whereNull('left_at')->update(['left_at' => now()]);
        // Disconnect anyone still in the room. Egress stops on its own when the
        // room closes, which is why recording is not stopped explicitly here.
        $this->hub->endRoom($stream);
        $stream->recordEvent('ended', $request->user()->id);

        return response()->json(['success' => true, 'message' => 'Stream ended.', 'data' => $this->ownerPayload($stream)]);
    }

    /* ── PATCH /studio/live/{id} ────────────────────────────────────────── */
    /** Details and the per-stream switches, in one place. */
    public function update(Request $request, int $id): JsonResponse
    {
        $stream = $this->ownedStream($request, $id);

        $data = $request->validate([
            'title'                => ['sometimes', 'string', 'max:200'],
            'description'          => ['sometimes', 'nullable', 'string', 'max:2000'],
            'category'             => ['sometimes', 'nullable', 'string', 'max:60'],
            'visibility'           => ['sometimes', 'in:public,followers,unlisted'],
            'chat_enabled'         => ['sometimes', 'boolean'],
            'gifts_enabled'        => ['sometimes', 'boolean'],
            'replay_enabled'       => ['sometimes', 'boolean'],
            'followers_only_chat'  => ['sometimes', 'boolean'],
            'slow_mode_seconds'    => ['sometimes', 'integer', 'min:0', 'max:300'],
            'min_account_age_days' => ['sometimes', 'integer', 'min:0', 'max:365'],
        ]);

        $stream->fill($data)->save();
        $stream->recordEvent('settings_changed', $request->user()->id, ['changed' => array_keys($data)]);

        return response()->json(['success' => true, 'message' => 'Updated.', 'data' => $this->ownerPayload($stream)]);
    }

    /* ── POST /studio/live/{id}/rotate-key ──────────────────────────────── */
    /** Burn the publishing secret - the one recovery when a key leaks. */
    public function rotateKey(Request $request, int $id): JsonResponse
    {
        $stream = $this->ownedStream($request, $id);
        $stream->forceFill(['ingest_key' => LiveStream::newIngestKey()])->save();
        $stream->recordEvent('ingest_key_rotated', $request->user()->id);

        return response()->json(['success' => true, 'message' => 'Key rotated.', 'ingest_key' => $stream->ingest_key]);
    }

    /* ── Moderators ─────────────────────────────────────────────────────── */
    public function addModerator(Request $request, int $id): JsonResponse
    {
        $request->validate(['user_id' => ['required', 'integer', 'exists:users,id']]);
        $stream = $this->ownedStream($request, $id, hostOnly: true);
        $target = (int) $request->input('user_id');

        if ($target === (int) $stream->user_id) {
            return response()->json(['success' => false, 'message' => 'You already moderate your own stream.'], 422);
        }

        LiveStreamModerator::firstOrCreate(
            ['live_stream_id' => $stream->id, 'user_id' => $target],
            ['added_by' => $request->user()->id],
        );
        $stream->recordEvent('moderator_added', $request->user()->id, ['user_id' => $target]);

        return response()->json(['success' => true, 'message' => 'Moderator added.']);
    }

    public function removeModerator(Request $request, int $id, int $userId): JsonResponse
    {
        $stream = $this->ownedStream($request, $id, hostOnly: true);
        LiveStreamModerator::where('live_stream_id', $stream->id)->where('user_id', $userId)->delete();
        $stream->recordEvent('moderator_removed', $request->user()->id, ['user_id' => $userId]);

        return response()->json(['success' => true, 'message' => 'Moderator removed.']);
    }

    /* ── Viewer moderation ──────────────────────────────────────────────── */
    /** A timeout is this with `minutes`; a ban is this without. */
    public function banViewer(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'minutes' => ['nullable', 'integer', 'min:1', 'max:20160'],
            'reason'  => ['nullable', 'string', 'max:300'],
        ]);

        $stream = $this->ownedStream($request, $id);
        $target = (int) $request->input('user_id');

        if ($target === (int) $stream->user_id) {
            return response()->json(['success' => false, 'message' => 'You cannot ban the host.'], 422);
        }

        $minutes = $request->input('minutes');
        LiveStreamBan::updateOrCreate(
            ['live_stream_id' => $stream->id, 'user_id' => $target],
            [
                'issued_by'  => $request->user()->id,
                'reason'     => $request->input('reason'),
                'expires_at' => $minutes ? now()->addMinutes((int) $minutes) : null,
            ],
        );

        // A ban that only stops them typing is not a ban - drop their
        // connection so they stop receiving the broadcast too.
        if (! $minutes) $this->hub->removeParticipant($stream, $target);

        $stream->recordEvent($minutes ? 'viewer_timed_out' : 'viewer_banned', $request->user()->id, [
            'user_id' => $target, 'minutes' => $minutes,
        ]);

        return response()->json(['success' => true, 'message' => $minutes ? 'Viewer timed out.' : 'Viewer banned.']);
    }

    public function unbanViewer(Request $request, int $id, int $userId): JsonResponse
    {
        $stream = $this->ownedStream($request, $id);
        LiveStreamBan::where('live_stream_id', $stream->id)->where('user_id', $userId)->delete();
        $stream->recordEvent('viewer_unbanned', $request->user()->id, ['user_id' => $userId]);

        return response()->json(['success' => true, 'message' => 'Restriction lifted.']);
    }

    /* ── Chat moderation ────────────────────────────────────────────────── */
    public function removeMessage(Request $request, int $id, int $messageId): JsonResponse
    {
        $stream = $this->ownedStream($request, $id);
        $stream->messages()->where('id', $messageId)->update([
            'removed_at' => now(), 'removed_by' => $request->user()->id,
        ]);
        $stream->recordEvent('message_removed', $request->user()->id, ['message_id' => $messageId]);

        return response()->json(['success' => true, 'message' => 'Message removed.']);
    }

    public function pinMessage(Request $request, int $id, int $messageId): JsonResponse
    {
        $stream = $this->ownedStream($request, $id);
        // One pinned message at a time - a "pinned" list is just chat again.
        $stream->messages()->where('is_pinned', true)->update(['is_pinned' => false]);
        $stream->messages()->where('id', $messageId)->update(['is_pinned' => true]);
        $stream->recordEvent('message_pinned', $request->user()->id, ['message_id' => $messageId]);

        return response()->json(['success' => true, 'message' => 'Message pinned.']);
    }

    /* ── Internals ──────────────────────────────────────────────────────── */

    /**
     * The stream, if the caller may control it.
     *
     * `hostOnly` for the things a promoted moderator must not do - appointing
     * more moderators chief among them.
     */
    private function ownedStream(Request $request, int $id, bool $hostOnly = false): LiveStream
    {
        $stream = LiveStream::findOrFail($id);
        $user   = $request->user();

        $allowed = $hostOnly
            ? (int) $stream->user_id === (int) $user->id
            : $stream->isModeratedBy($user);

        if (! $allowed && ! $user->isAdmin()) {
            abort(403, 'You can only manage your own streams.');
        }

        return $stream;
    }

    private function ownerPayload(LiveStream $s): array
    {
        return [
            'id'          => (int) $s->id,
            'title'       => $s->title,
            'status'      => $s->status,
            'room_name'   => $s->room_name,
            'viewers'     => (int) $s->viewers_now,
            'started_at'  => optional($s->started_at)->toIso8601String(),
            'controls'    => [
                'chat_enabled'         => $s->chat_enabled,
                'gifts_enabled'        => $s->gifts_enabled,
                'replay_enabled'       => $s->replay_enabled,
                'followers_only_chat'  => $s->followers_only_chat,
                'slow_mode_seconds'    => (int) $s->slow_mode_seconds,
                'min_account_age_days' => (int) $s->min_account_age_days,
            ],
        ];
    }
}
