<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\Space;
use App\Models\SpaceParticipant;
use App\StreamHub\StreamHubService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Audio Rooms (Spaces) for the admin panel - the listing behind /audio.
 *
 * Read-only apart from two levers a moderator actually needs: force-end a room
 * that is live, and delete one outright. There is deliberately no create/edit
 * here: rooms are hosted by users from the app, not authored by staff.
 *
 * Mute/remove/end here also enforce on LiveKit via StreamHubService (the
 * previous Cloudflare-SFU version never did, for either the admin or the
 * member-facing moderation paths - see SpaceModerationController).
 */
class AdminSpaceController extends Controller
{
    public function __construct(private readonly StreamHubService $streamHub) {}

    /** GET /admin/spaces - the paginated listing (search, status, topic, sort). */
    public function index(Request $request): JsonResponse
    {
        $q = Space::query()->with(['host:id,name,username,avatar,is_verified']);

        if ($request->filled('search')) {
            $t = trim((string) $request->input('search'));
            $q->where(function ($sq) use ($t) {
                $sq->where('title', 'ilike', "%{$t}%")
                   ->orWhere('description', 'ilike', "%{$t}%")
                   ->orWhereHas('host', fn ($h) =>
                       $h->where('username', 'ilike', "%{$t}%")
                         ->orWhere('name', 'ilike', "%{$t}%")
                   );
            });
        }

        if ($request->filled('status') && in_array($request->input('status'), Space::STATUSES, true)) {
            $q->where('status', $request->input('status'));
        }

        if ($request->filled('topic')) {
            $q->where('topic', $request->input('topic'));
        }

        match ($request->input('sort')) {
            'listeners' => $q->orderByDesc('listeners_count')->orderByDesc('id'),
            'peak'      => $q->orderByDesc('peak_listeners')->orderByDesc('id'),
            'oldest'    => $q->orderBy('id'),
            // Default: live rooms first (they are the ones a moderator can act
            // on), then newest. Postgres sorts false < true, so DESC puts the
            // live ones on top.
            default     => $q->orderByRaw("(status = 'live') DESC")->orderByDesc('id'),
        };

        $perPage = min((int) $request->input('per_page', 20), 50);
        $spaces  = $q->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $spaces->getCollection()->map(fn (Space $s) => $this->resource($s))->all(),
            'meta'    => [
                'current_page' => $spaces->currentPage(),
                'last_page'    => $spaces->lastPage(),
                'per_page'     => $spaces->perPage(),
                'total'        => $spaces->total(),
            ],
        ]);
    }

    /** GET /admin/spaces/stats - the counters above the table. */
    public function stats(): JsonResponse
    {
        // One pass over the table instead of four count queries.
        $row = DB::table('spaces')->selectRaw("
            COUNT(*) FILTER (WHERE status = 'live')                          AS live,
            COUNT(*) FILTER (WHERE status = 'scheduled')                     AS scheduled,
            COUNT(*)                                                         AS total,
            COUNT(*) FILTER (WHERE status = 'ended' AND ended_at >= ?)       AS ended_today,
            COALESCE(SUM(listeners_count) FILTER (WHERE status = 'live'), 0) AS listeners_now,
            COALESCE(MAX(peak_listeners), 0)                                 AS peak_ever,
            COALESCE(SUM(peak_listeners), 0)                                 AS total_listeners
        ", [now()->startOfDay()])->first();

        return response()->json([
            'success' => true,
            'data'    => [
                'live'            => (int) $row->live,
                'scheduled'       => (int) $row->scheduled,
                'total'           => (int) $row->total,
                'ended_today'     => (int) $row->ended_today,
                'listeners_now'   => (int) $row->listeners_now,
                'peak_ever'       => (int) $row->peak_ever,
                // Total reach across every room's peak - the "Total Listeners" stat.
                'total_listeners' => (int) $row->total_listeners,
            ],
        ]);
    }

    /** GET /admin/spaces/{space} - one room, with who is in it. */
    public function show(Space $space): JsonResponse
    {
        $space->load([
            'host:id,name,username,avatar,is_verified',
            'endedByAdmin:id,name,username',
            'participants' => fn ($q) => $q->whereNull('left_at')->with('user:id,name,username,avatar,is_verified'),
        ]);

        $data = $this->resource($space);
        $data['ended_by'] = $space->endedByAdmin?->username;
        $data['ended_reason'] = $space->ended_reason;
        $data['participants'] = $space->participants->map(fn ($p) => [
            'id'         => $p->id,
            'role'       => $p->role,
            'muted'      => (bool) $p->muted,
            'requesting' => $p->isRequestingToSpeak(),
            'is_host'    => $p->role === \App\Models\SpaceParticipant::ROLE_HOST,
            'joined_at'  => $p->joined_at?->toIso8601String(),
            'user'       => $p->user ? [
                'id'          => $p->user->id,
                'name'        => $p->user->name,
                'username'    => $p->user->username,
                'avatar'      => $p->user->avatar,
                'is_verified' => (bool) $p->user->is_verified,
            ] : null,
        ])->all();

        // Moderators = the host + anyone the host promoted (moderator_ids / co_host_ids).
        $modIds = array_values(array_unique(array_merge(
            $space->moderator_ids ?? [],
            $space->co_host_ids ?? [],
        )));
        $mods = $modIds
            ? \App\Models\User::whereIn('id', $modIds)->get(['id', 'name', 'username', 'avatar', 'is_verified'])
            : collect();
        $data['moderators'] = collect([$space->host])->filter()->merge($mods)->unique('id')
            ->map(fn ($u) => [
                'id'          => $u->id,
                'name'        => $u->name,
                'username'    => $u->username,
                'avatar'      => $u->avatar,
                'is_verified' => (bool) $u->is_verified,
                'is_host'     => $u->id === $space->host_id,
            ])->values()->all();

        $data['counts'] = [
            'participants' => $space->participants->count(),
            'speakers'     => $space->participants->whereIn('role', ['host', 'speaker'])->count(),
            'listeners'    => $space->participants->where('role', 'listener')->count(),
            'requests'     => $space->participants->filter(fn ($p) => $p->isRequestingToSpeak())->count(),
            'moderators'   => count($data['moderators']),
        ];

        return response()->json(['success' => true, 'data' => $data]);
    }

    /** PATCH /admin/spaces/{space}/controls - toggle a live room's controls. */
    public function updateControls(Request $request, Space $space): JsonResponse
    {
        $data = $request->validate([
            'enable_chat'            => ['sometimes', 'boolean'],
            'allow_reactions'        => ['sometimes', 'boolean'],
            'enable_polls'           => ['sometimes', 'boolean'],
            'allow_speaker_requests' => ['sometimes', 'boolean'],
            'speaking_permission'    => ['sometimes', 'in:' . implode(',', Space::SPEAKING)],
            'audience'               => ['sometimes', 'in:' . implode(',', Space::AUDIENCES)],
            'gifts_enabled'          => ['sometimes', 'boolean'],
            'waiting_room_enabled'   => ['sometimes', 'boolean'],
            'sound_clips_enabled'    => ['sometimes', 'boolean'],
            'speaker_slots'          => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        if (! $data) {
            return response()->json(['success' => false, 'message' => 'Nothing to update.'], 422);
        }

        $space->update($data);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_space_controls',
            target: $space,
            description: 'Admin updated room controls: ' . $space->title,
            metadata: $data,
            severity: 'info',
        );

        return response()->json(['success' => true, 'message' => 'Room controls updated.']);
    }

    /** POST /admin/spaces/{space}/mute-all - server-mute every speaker (not the host). */
    public function muteAll(Request $request, Space $space): JsonResponse
    {
        $speakers = $space->participants()
            ->whereNull('left_at')
            ->where('role', 'speaker')
            ->get();

        foreach ($speakers as $seat) {
            $this->streamHub->muteParticipant($space, $seat);
        }
        $n = $speakers->count();
        SpaceParticipant::whereIn('id', $speakers->pluck('id'))->update(['muted' => true]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'space_mute_all',
            target: $space,
            description: "Admin muted all {$n} speaker(s) in: " . $space->title,
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => "Muted {$n} speaker(s).", 'count' => $n]);
    }

    /** POST /admin/spaces/{space}/clear-requests - deny every pending hand-raise. */
    public function clearRequests(Request $request, Space $space): JsonResponse
    {
        $n = $space->participants()
            ->whereNull('left_at')
            ->where('role', 'listener')
            ->whereNotNull('hand_raised_at')
            ->whereNull('approved_at')
            ->whereNull('declined_at')
            ->update(['hand_raised_at' => null, 'declined_at' => now()]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'space_clear_requests',
            target: $space,
            description: "Admin cleared {$n} speaker request(s) in: " . $space->title,
            severity: 'info',
        );

        return response()->json(['success' => true, 'message' => "Cleared {$n} request(s).", 'count' => $n]);
    }

    /** POST /admin/spaces/{space}/remove-listeners - drop every listener from the room. */
    public function removeListeners(Request $request, Space $space): JsonResponse
    {
        $n = $space->participants()
            ->whereNull('left_at')
            ->where('role', 'listener')
            ->update(['left_at' => now()]);

        $space->update(['listeners_count' => max(0, $space->listeners_count - $n)]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'space_remove_listeners',
            target: $space,
            description: "Admin removed {$n} listener(s) from: " . $space->title,
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => "Removed {$n} listener(s).", 'count' => $n]);
    }

    /** POST /admin/spaces/{space}/participants/{participant}/mute - server-mute one seat. */
    public function muteParticipant(Request $request, Space $space, SpaceParticipant $participant): JsonResponse
    {
        abort_unless($participant->space_id === $space->id, 404);
        $muted = ! $participant->muted;
        $participant->update(['muted' => $muted]);
        $this->streamHub->muteParticipant($space, $participant, $muted);

        AdminActionLog::record(
            admin: $request->user(),
            action: $muted ? 'space_mute_user' : 'space_unmute_user',
            target: $space,
            description: 'Admin ' . ($muted ? 'muted' : 'unmuted') . " @{$participant->user?->username} in: " . $space->title,
            severity: 'info',
        );

        return response()->json(['success' => true, 'message' => $muted ? 'Participant muted.' : 'Participant unmuted.', 'muted' => $muted]);
    }

    /** POST /admin/spaces/{space}/participants/{participant}/remove - remove one seat. */
    public function removeParticipant(Request $request, Space $space, SpaceParticipant $participant): JsonResponse
    {
        abort_unless($participant->space_id === $space->id, 404);
        if ($participant->role === 'host') {
            return response()->json(['success' => false, 'message' => 'You cannot remove the host. End the room instead.'], 422);
        }

        $wasListener = $participant->role === 'listener';
        $participant->update(['left_at' => now()]);
        if ($wasListener) {
            $space->update(['listeners_count' => max(0, $space->listeners_count - 1)]);
        } else {
            $space->update(['speakers_count' => max(0, $space->speakers_count - 1)]);
        }
        $this->streamHub->removeParticipant($space, $participant);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'space_remove_user',
            target: $space,
            description: "Admin removed @{$participant->user?->username} from: " . $space->title,
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => 'Participant removed.']);
    }

    /** POST /admin/spaces/{space}/end - pull a live room off the air. */
    public function end(Request $request, Space $space): JsonResponse
    {
        $request->validate(['reason' => ['nullable', 'string', 'max:255']]);

        if (! $space->isLive()) {
            return response()->json([
                'success' => false,
                'message' => 'This space is not live.',
            ], 422);
        }

        $space->update([
            'status'            => Space::STATUS_ENDED,
            'ended_at'          => now(),
            'ended_by_admin_id' => $request->user()->id,
            'ended_reason'      => $request->input('reason'),
            // The room is off the air; nobody is listening to it any more.
            'listeners_count'   => 0,
            'speakers_count'    => 0,
        ]);
        $space->participants()->whereNull('left_at')->update(['left_at' => now()]);
        $this->streamHub->stopRecording($space);
        $this->streamHub->endRoom($space);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'end_space',
            target: $space,
            description: 'Admin ended live space: ' . $space->title,
            metadata: ['reason' => $request->input('reason')],
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => 'Space ended.']);
    }

    /** DELETE /admin/spaces/{space} - remove the room and its seats. */
    public function destroy(Request $request, Space $space): JsonResponse
    {
        $title = $space->title;
        AdminActionLog::record(
            admin: $request->user(),
            action: 'delete_space',
            target: $space,
            description: 'Admin deleted space: ' . $title,
            severity: 'warning',
        );

        if ($space->isLive()) {
            $this->streamHub->stopRecording($space);
            $this->streamHub->endRoom($space);
        }
        $space->delete(); // space_participants cascade

        return response()->json(['success' => true, 'message' => 'Space deleted.']);
    }

    /** The row shape the admin table renders. */
    private function resource(Space $s): array
    {
        return [
            'id'              => $s->id,
            'title'           => $s->title,
            'description'     => $s->description,
            'topic'           => $s->topic,
            'status'          => $s->status,
            'listeners_count' => $s->listeners_count,
            'speakers_count'  => $s->speakers_count,
            'peak_listeners'  => $s->peak_listeners,
            'is_recorded'     => $s->is_recorded,
            'duration_minutes' => $s->durationMinutes(),
            // Real room controls (mirror the Create-Space settings) - the panel
            // reflects and edits these directly.
            'privacy'                => $s->audience ?: 'public',
            'speaking_permission'    => $s->speaking_permission ?: 'request',
            'enable_chat'            => (bool) $s->enable_chat,
            'allow_reactions'        => (bool) $s->allow_reactions,
            'enable_polls'           => (bool) $s->enable_polls,
            'allow_speaker_requests' => (bool) $s->allow_speaker_requests,
            'tags'                   => $s->tags ?: ($s->topics ?: []),
            // Room rules + the two access-control extras - visibility only, no
            // secrets: the invite token itself never leaves the server here.
            'room_rules'             => $s->room_rules ?: [],
            'allowed_followers_count' => count($s->allowed_follower_ids ?? []),
            'has_invite_link'        => $s->invite_token !== null,
            // The rest of the Create-Space sheet's settings (room extras) -
            // editable through the same PATCH .../controls as the fields above.
            'gifts_enabled'          => (bool) $s->gifts_enabled,
            'waiting_room_enabled'   => (bool) $s->waiting_room_enabled,
            'sound_clips_enabled'    => (bool) $s->sound_clips_enabled,
            'speaker_slots'          => $s->speaker_slots,
            'scheduled_for'   => $s->scheduled_for?->toIso8601String(),
            'started_at'      => $s->started_at?->toIso8601String(),
            'ended_at'        => $s->ended_at?->toIso8601String(),
            'created_at'      => $s->created_at?->toIso8601String(),
            'host'            => $s->host ? [
                'id'          => $s->host->id,
                'name'        => $s->host->name,
                'username'    => $s->host->username,
                'avatar'      => $s->host->avatar,
                'is_verified' => (bool) $s->host->is_verified,
            ] : null,
        ];
    }
}
