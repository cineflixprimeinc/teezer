<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContentReport;
use App\Models\Space;
use App\Models\SpaceParticipant;
use App\Services\RealtimeBus;
use App\Services\ReportEvidenceService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Inside a Space: the room screen, and the seat you hold in it.
 *
 * Counters (listeners_count/speakers_count) are denormalised, so join/leave own
 * them - and they are moved with atomic SQL rather than read-modify-write, since
 * a busy room has many people arriving at once and Eloquent's increment() on a
 * stale model would lose some of them.
 *
 * Audio is not here: the mic path is SpaceRtcController, talking to the
 * Cloudflare SFU. Nothing in this file carries media.
 */
class SpaceRoomController extends Controller
{
    /** Listener avatars the room strip shows before the "+N" takes over. */
    private const LISTENER_STRIP = 5;

    public function __construct(private readonly StorageService $storage) {}

    /**
     * GET /spaces/{space}/people - the full participant list.
     *
     * The room screen only carries the five listener avatars its strip can
     * show; this is the "People in this Space" sheet, which pages through all
     * of them and can filter to a tab.
     */
    public function people(Request $request, Space $space): JsonResponse
    {
        $tab = $request->string('tab')->value() ?: 'all';

        $q = SpaceParticipant::query()
            ->where('space_id', $space->id)
            ->whereNull('left_at')
            ->with('user:id,name,username,avatar,is_verified')
            // Host first, then speakers, then listeners - the order the sheet
            // groups them in, so a page never straddles a heading oddly.
            ->orderByRaw("CASE role WHEN 'host' THEN 0 WHEN 'speaker' THEN 1 ELSE 2 END")
            ->orderBy('id');

        match ($tab) {
            'speakers'  => $q->whereIn('role', [SpaceParticipant::ROLE_HOST, SpaceParticipant::ROLE_SPEAKER]),
            'listeners' => $q->where('role', SpaceParticipant::ROLE_LISTENER),
            default     => null,
        };

        $page = $q->paginate(min((int) $request->input('per_page', 30), 50));

        // Counts for the tab labels ("Speakers · 2", "Listeners · 890"). The
        // listener tally is the room's counter, not the seat rows we happen to
        // hold - a big room has more listeners than seats we store detail for.
        $seatCounts = SpaceParticipant::where('space_id', $space->id)
            ->whereNull('left_at')
            ->selectRaw("COUNT(*) FILTER (WHERE role IN ('host','speaker')) AS speakers, COUNT(*) AS total")
            ->first();

        $modIds = $space->moderatorIds();

        return response()->json([
            'success' => true,
            'data'    => $page->getCollection()->map(fn ($p) => $this->seat($p, $modIds))->all(),
            'meta'    => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'total'        => $page->total(),
                'speakers'     => (int) ($seatCounts->speakers ?? 0),
                'listeners'    => $space->listeners_count,
            ],
        ]);
    }

    /** GET /spaces/{space} - everything the room screen renders. */
    public function show(Request $request, Space $space): JsonResponse
    {
        $space->load('host:id,name,username,avatar,is_verified');

        $seats = SpaceParticipant::query()
            ->where('space_id', $space->id)
            ->whereNull('left_at')
            ->with('user:id,name,username,avatar,is_verified')
            ->orderByRaw("CASE role WHEN 'host' THEN 0 WHEN 'speaker' THEN 1 ELSE 2 END")
            ->orderBy('id')
            ->get();

        $me = $request->user()
            ? $seats->firstWhere('user_id', $request->user()->id)
            : null;

        $host      = $seats->firstWhere('role', SpaceParticipant::ROLE_HOST);
        $speakers  = $seats->where('role', SpaceParticipant::ROLE_SPEAKER)->values();
        $listeners = $seats->where('role', SpaceParticipant::ROLE_LISTENER)->values();
        $modIds    = $space->moderatorIds();

        return response()->json([
            'success' => true,
            'data'    => [
                'id'          => (string) $space->id,
                'title'       => $space->title,
                'description' => (string) $space->description,
                'topic'       => $space->topic,
                'status'      => $space->status,
                'listening'   => $space->listeners_count,
                // When the room actually went live, so the client can show how
                // long it has been running. Sent as an absolute timestamp rather
                // than a pre-computed duration: a duration would be wrong the
                // moment the response is cached or the screen sits open, and the
                // client already has to tick a clock either way.
                'started_at'  => $space->started_at?->toISOString(),
                // The host row falls back to the space's host if they hold no
                // seat yet (a scheduled room nobody has entered).
                'host'        => $host ? $this->seat($host, $modIds) : ($space->host ? [
                    'id' => (string) $space->host->id,
                    'user_id' => (string) $space->host->id,
                    'name' => $space->host->name,
                    'username' => $space->host->username,
                    'avatar' => $this->avatar($space->host->avatar),
                    'verified' => (bool) $space->host->is_verified,
                    'role' => 'host', 'muted' => true, 'is_moderator' => true, 'publishing' => false,
                ] : null),
                'speakers'    => $speakers->map(fn ($s) => $this->seat($s, $modIds))->values()->all(),
                'listeners'   => $listeners->take(self::LISTENER_STRIP)->map(fn ($s) => $this->seat($s, $modIds))->values()->all(),
                // Everyone the strip could not fit: the listener count is the
                // truth, not the number of seat rows we happened to load.
                'others'      => max(0, $space->listeners_count - min($listeners->count(), self::LISTENER_STRIP)),
                'me'          => $me ? [
                    'role'         => $me->role,
                    'muted'        => (bool) $me->muted,
                    'is_moderator' => $space->isModerator((int) $me->user_id),
                ] : null,
                // What the host allowed in this room - the app gates its controls
                // on these (stage policy, chat, reactions, polls, Q&A, capacity).
                'settings'    => [
                    'speaking_permission'    => $space->speaking_permission ?: Space::SPEAK_REQUEST,
                    'audio_quality'          => $space->audio_quality ?: 'standard',
                    'allow_screen_sharing'   => (bool) ($space->allow_screen_sharing ?? false),
                    'allow_speaker_requests' => (bool) ($space->allow_speaker_requests ?? true),
                    'enable_chat'            => (bool) ($space->enable_chat ?? true),
                    'allow_reactions'        => (bool) ($space->allow_reactions ?? true),
                    'enable_polls'           => (bool) ($space->enable_polls ?? false),
                    'qa_enabled'             => (bool) ($space->qa_enabled ?? false),
                    'is_recorded'            => (bool) ($space->is_recorded ?? false),
                    'live_captions'          => (bool) ($space->live_captions ?? false),
                    'noise_cancellation'     => (bool) ($space->noise_cancellation ?? true),
                    'audience'               => $space->audience ?? Space::AUD_PUBLIC,
                    'audience_limit'         => $space->audience_limit,
                    'content_warning'        => $space->content_warning,
                    'topics'                 => $space->topics ?? [],
                    'tags'                   => $space->tags ?? [],
                    // The sharing secret - only the host & moderators receive it.
                    'invite_token'           => ($me && $space->isModerator((int) $me->user_id)) ? $space->invite_token : null,
                ],
            ],
        ]);
    }

    /** POST /spaces/{space}/join - take a listener seat. */
    public function join(Request $request, Space $space): JsonResponse
    {
        if (! $space->isLive()) {
            return response()->json(['success' => false, 'message' => 'This space is not live.'], 422);
        }

        $userId = $request->user()->id;

        // Privacy + block gate: public rooms admit anyone; private / invite-only
        // rooms admit the host, moderators and invitees, and invite-only also
        // admits a valid token holder. Blocked users are refused everywhere.
        $token = $request->input('token', $request->query('token'));
        if (! $space->canJoin((int) $userId, $token !== null ? (string) $token : null)) {
            $msg = $space->isBlocked((int) $userId)
                ? 'You can no longer join this space.'
                : 'This space is private.';
            return response()->json(['success' => false, 'message' => $msg], 403);
        }

        // Capacity: unlimited when audience_limit is null; the host is never
        // capped, and someone already holding a seat can always re-enter.
        if ($space->audience_limit !== null && $space->host_id !== $userId) {
            $already = SpaceParticipant::where('space_id', $space->id)
                ->where('user_id', $userId)->whereNull('left_at')->exists();
            if (! $already && $space->listeners_count >= $space->audience_limit) {
                return response()->json(['success' => false, 'message' => 'This space is full.'], 403);
            }
        }

        // The seat you enter with, per the room's speaking policy (§1).
        $role = $space->joinRole((int) $userId);
        $isSpeaker = $role !== SpaceParticipant::ROLE_LISTENER;

        DB::transaction(function () use ($space, $userId, $role, $isSpeaker) {
            // The seat is unique per (space, user): rejoining reuses the row, so
            // the counter must only move when a seat is actually taken.
            $seat = SpaceParticipant::withoutGlobalScopes()
                ->where('space_id', $space->id)
                ->where('user_id', $userId)
                ->lockForUpdate()
                ->first();

            if ($seat && $seat->left_at === null) {
                return; // already in the room - joining twice is not two people
            }

            // An invitee returns to the stage; everyone else to the audience.
            // Old SFU coordinates are always cleared - any prior track is gone.
            $fields = [
                'left_at'        => null,
                'joined_at'      => now(),
                'role'           => $role,
                'muted'          => true, // everyone arrives muted; the mic is opt-in
                'rtc_session_id' => null,
                'rtc_track_name' => null,
                'published_at'   => null,
            ];

            if ($seat) {
                $seat->update($fields);
            } else {
                SpaceParticipant::create(array_merge(['space_id' => $space->id, 'user_id' => $userId], $fields));
            }

            // Atomic, and peak_listeners rides along so it never needs a second
            // pass to notice a new high-water mark. speakers_count moves only when
            // the joiner actually took a stage seat.
            DB::statement('
                UPDATE spaces
                SET listeners_count = listeners_count + 1,
                    speakers_count  = speakers_count + ?,
                    peak_listeners  = GREATEST(peak_listeners, listeners_count + 1),
                    updated_at      = now()
                WHERE id = ?', [$isSpeaker ? 1 : 0, $space->id]);
        });

        return $this->show($request, $space->refresh());
    }

    /** POST /spaces/{space}/leave - give the seat back. */
    public function leave(Request $request, Space $space): JsonResponse
    {
        $userId = $request->user()->id;

        DB::transaction(function () use ($space, $userId) {
            $seat = SpaceParticipant::where('space_id', $space->id)
                ->where('user_id', $userId)
                ->whereNull('left_at')
                ->lockForUpdate()
                ->first();

            if (! $seat) {
                return; // not in the room; leaving twice must not drain the count
            }

            $wasSpeaking = $seat->role !== SpaceParticipant::ROLE_LISTENER;
            $seat->update([
                'left_at'        => now(),
                'rtc_session_id' => null,
                'rtc_track_name' => null,
                'published_at'   => null,
            ]);

            // GREATEST(...,0): the counter is unsigned, and a stray double-leave
            // must never underflow it into a huge number.
            DB::statement('
                UPDATE spaces
                SET listeners_count = GREATEST(listeners_count - 1, 0),
                    speakers_count  = GREATEST(speakers_count - ?, 0),
                    updated_at      = now()
                WHERE id = ?', [$wasSpeaking ? 1 : 0, $space->id]);
        });

        return response()->json(['success' => true, 'message' => 'Left the space.']);
    }

    /**
     * POST /spaces/{space}/report - Spaces never had a report system at
     * all. Not gated on membership/canJoin() - a report about a room
     * someone was in earlier (or heard about) shouldn't require them to
     * still hold a seat.
     */
    public function report(Request $request, ReportEvidenceService $reportEvidence, Space $space): JsonResponse
    {
        $request->validate([
            'reason'  => ['required', 'string', 'in:spam,nudity,hate_speech,harassment,violence,self_harm,scam_fraud,other'],
            'details' => ['nullable', 'string', 'max:500'],
            ...$reportEvidence->rules(),
        ]);

        $userId = $request->user()->id;

        $already = ContentReport::type(ContentReport::TYPE_SPACE)
            ->where('reportable_id', $space->id)
            ->where('reporter_id', $userId)
            ->exists();
        if ($already) {
            return response()->json(['success' => false, 'message' => 'You have already reported this space.'], 422);
        }

        ContentReport::create([
            'reportable_type' => ContentReport::TYPE_SPACE,
            'reportable_id'   => $space->id,
            'reporter_id'     => $userId,
            'reason'          => $request->input('reason'),
            'details'         => $request->input('details'),
            'evidence_keys'   => $reportEvidence->store($request),
        ]);

        return response()->json(['success' => true, 'message' => 'Report submitted. Thank you for keeping Teezer safe.']);
    }

    /**
     * POST /spaces/{space}/request-speak - raise a hand.
     *
     * Persists the raise on the seat (the host's Requests screen reads it back)
     * and nudges the host in realtime. Idempotent: a second tap holds your place
     * in the queue rather than jumping it.
     */
    public function requestSpeak(Request $request, Space $space): JsonResponse
    {
        $seat = SpaceParticipant::where('space_id', $space->id)
            ->where('user_id', $request->user()->id)
            ->whereNull('left_at')
            ->first();

        if (! $seat) {
            return response()->json(['success' => false, 'message' => 'Join the space first.'], 422);
        }
        if ($seat->role !== SpaceParticipant::ROLE_LISTENER) {
            return response()->json(['success' => false, 'message' => 'You can already speak.'], 422);
        }

        // A fresh ask clears any earlier decline; keep the original timestamp if
        // the hand is already up so the queue order is stable.
        if ($seat->hand_raised_at === null) {
            $seat->update(['hand_raised_at' => now(), 'declined_at' => null]);
        }

        // Realtime is the enhancement; the host screen also polls, so a dropped
        // event never loses the request.
        RealtimeBus::publish(
            [RealtimeBus::userRoom($space->host_id), "space:{$space->id}"],
            'space.hand_raised',
            ['space_id' => (string) $space->id, 'user_id' => (string) $seat->user_id]
        );

        return response()->json([
            'success' => true,
            'message' => 'Request sent to the host.',
        ]);
    }

    /** POST /spaces/{space}/cancel-request - lower your own hand. */
    public function cancelRequest(Request $request, Space $space): JsonResponse
    {
        SpaceParticipant::where('space_id', $space->id)
            ->where('user_id', $request->user()->id)
            ->whereNull('left_at')
            ->update(['hand_raised_at' => null]);

        return response()->json(['success' => true, 'message' => 'Request cancelled.']);
    }

    /**
     * POST /spaces/{space}/heart - the room's React button.
     *
     * Just a counter: it drives the Listeners screen's ranking and the little
     * heart tally next to each listener. The floating heart animation is the
     * client's; all the server keeps is how many you have sent.
     */
    public function heart(Request $request, Space $space): JsonResponse
    {
        $seat = SpaceParticipant::where('space_id', $space->id)
            ->where('user_id', $request->user()->id)
            ->whereNull('left_at')
            ->first();

        if (! $seat) {
            return response()->json(['success' => false, 'message' => 'Join the space first.'], 422);
        }

        // Atomic: a room all tapping at once is the many-writers case a
        // read-modify-write on a stale model would undercount.
        DB::statement(
            'UPDATE space_participants SET hearts_sent = hearts_sent + 1, updated_at = now() WHERE id = ?',
            [$seat->id]
        );

        RealtimeBus::publish(["space:{$space->id}"], 'space.reaction', [
            'space_id' => (string) $space->id,
            'user_id'  => (string) $seat->user_id,
        ]);

        return response()->json([
            'success' => true,
            'data'    => ['hearts' => (int) $seat->hearts_sent + 1],
        ]);
    }

    /**
     * GET /spaces/{space}/listeners - the Listeners screen.
     *
     * Two lists in one payload: the handful of "top listeners" (the crowns,
     * ranked by how much they have reacted) and the full paged list under it.
     * Only people who have actually reacted can crown, so a quiet room shows no
     * podium rather than an arbitrary top four.
     */
    public function listeners(Request $request, Space $space): JsonResponse
    {
        $top = SpaceParticipant::query()
            ->where('space_id', $space->id)
            ->whereNull('left_at')
            ->where('role', SpaceParticipant::ROLE_LISTENER)
            ->where('hearts_sent', '>', 0)
            ->with('user:id,name,username,avatar,is_verified')
            ->orderByDesc('hearts_sent')
            ->orderBy('joined_at')
            ->limit(4)
            ->get();

        $page = SpaceParticipant::query()
            ->where('space_id', $space->id)
            ->whereNull('left_at')
            ->where('role', SpaceParticipant::ROLE_LISTENER)
            ->with('user:id,name,username,avatar,is_verified')
            ->orderBy('joined_at')
            ->orderBy('id')
            ->paginate(min((int) $request->input('per_page', 30), 50));

        return response()->json([
            'success' => true,
            'data'    => $page->getCollection()->map(fn ($p) => $this->listenerRow($p))->all(),
            'top'     => $top->map(fn ($p) => $this->listenerRow($p))->all(),
            'meta'    => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'total'        => $space->listeners_count,
            ],
        ]);
    }

    /** A row on the Listeners screen: who, how long, how much they have reacted. */
    private function listenerRow(SpaceParticipant $p): array
    {
        return [
            'id'                => (string) $p->id,
            'user_id'           => (string) $p->user_id,
            'name'              => $p->user?->name ?? 'Guest',
            'username'          => $p->user?->username,
            'avatar'            => $this->avatar($p->user?->avatar),
            'verified'          => (bool) ($p->user?->is_verified),
            'hearts'            => (int) $p->hearts_sent,
            // Whole minutes in the room, for "Listening · 45m".
            'listening_minutes' => $p->joined_at ? (int) $p->joined_at->diffInMinutes(now()) : 0,
        ];
    }

    private function seat(SpaceParticipant $p, array $modIds = []): array
    {
        return [
            'id'           => (string) $p->id,
            'user_id'      => (string) $p->user_id,
            'name'         => $p->user?->name ?? 'Guest',
            'username'     => $p->user?->username,
            'avatar'       => $this->avatar($p->user?->avatar),
            'verified'     => (bool) ($p->user?->is_verified),
            'role'         => $p->role,
            'muted'        => (bool) $p->muted,
            // A moderator seat (host aside) - drives the badge and mod-action menu.
            'is_moderator' => in_array((int) $p->user_id, $modIds, true),
            // Whether there is actually a track to subscribe to.
            'publishing'   => $p->isPublishing(),
        ];
    }

    private function avatar(?string $key): ?string
    {
        return $key ? $this->storage->url($key) : null;
    }
}
