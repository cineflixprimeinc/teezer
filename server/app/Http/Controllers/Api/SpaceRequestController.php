<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Space;
use App\Models\SpaceParticipant;
use App\Services\RealtimeBus;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The host's "Requests" screen - the moderation side of raise-a-hand.
 *
 * All host-only: only the person running the room decides who gets on stage,
 * so every action here checks host_id first. A request is a state on the seat
 * (see the add_requests_hearts_and_chat migration), not a separate table, so
 * approving is the same row transition as the room already does on join.
 */
class SpaceRequestController extends Controller
{
    public function __construct(private readonly StorageService $storage) {}

    /**
     * GET /spaces/{space}/requests - pending hands, and who was let up.
     *
     * "Pending" is hands still up; "approved" is the recently-promoted, which
     * the screen shows with an "On stage" badge. Declined requests just vanish -
     * there is no list for a no.
     */
    public function index(Request $request, Space $space): JsonResponse
    {
        $this->authorizeHost($request, $space);

        $pending = SpaceParticipant::query()
            ->where('space_id', $space->id)
            ->whereNull('left_at')
            ->where('role', SpaceParticipant::ROLE_LISTENER)
            ->whereNotNull('hand_raised_at')
            ->with('user:id,name,username,avatar,is_verified')
            ->orderBy('hand_raised_at') // oldest ask first - it is a queue
            ->get();

        // Speakers who came up through a request (approved_at set), newest
        // first. The host themselves never appears here.
        $approved = SpaceParticipant::query()
            ->where('space_id', $space->id)
            ->whereNull('left_at')
            ->where('role', SpaceParticipant::ROLE_SPEAKER)
            ->whereNotNull('approved_at')
            ->with('user:id,name,username,avatar,is_verified')
            ->orderByDesc('approved_at')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => [
                'pending'  => $pending->map(fn ($p) => $this->row($p, $p->hand_raised_at))->all(),
                'approved' => $approved->map(fn ($p) => $this->row($p, $p->approved_at))->all(),
            ],
            'meta' => [
                'pending'  => $pending->count(),
                'approved' => $approved->count(),
            ],
        ]);
    }

    /** POST /spaces/{space}/requests/{user}/approve - let them on stage. */
    public function approve(Request $request, Space $space, int $user): JsonResponse
    {
        $this->authorizeHost($request, $space);

        DB::transaction(function () use ($space, $user) {
            $seat = SpaceParticipant::withoutGlobalScopes()
                ->where('space_id', $space->id)
                ->where('user_id', $user)
                ->whereNull('left_at')
                ->lockForUpdate()
                ->first();

            // Only a listener with a hand up is promotable; anything else (they
            // left, they are already a speaker) is a no-op so a double-tap is safe.
            if (! $seat || $seat->role !== SpaceParticipant::ROLE_LISTENER || $seat->hand_raised_at === null) {
                return;
            }

            $seat->update([
                'role'           => SpaceParticipant::ROLE_SPEAKER,
                'muted'          => true, // they come up muted; their first tap unmutes
                'approved_at'    => now(),
                'hand_raised_at' => null,
                'declined_at'    => null,
            ]);

            DB::statement(
                'UPDATE spaces SET speakers_count = speakers_count + 1, updated_at = now() WHERE id = ?',
                [$space->id]
            );
        });

        // Tell the promoted user (their room flips to "you can speak") and the
        // room (a new speaker seat appears).
        RealtimeBus::publish(
            [RealtimeBus::userRoom($user), "space:{$space->id}"],
            'space.speaker_approved',
            ['space_id' => (string) $space->id, 'user_id' => (string) $user]
        );

        return response()->json(['success' => true, 'message' => 'They can speak now.']);
    }

    /** POST /spaces/{space}/requests/{user}/decline - lower their hand for them. */
    public function decline(Request $request, Space $space, int $user): JsonResponse
    {
        $this->authorizeHost($request, $space);

        SpaceParticipant::where('space_id', $space->id)
            ->where('user_id', $user)
            ->whereNull('left_at')
            ->where('role', SpaceParticipant::ROLE_LISTENER)
            ->update(['hand_raised_at' => null, 'declined_at' => now()]);

        RealtimeBus::publish(
            [RealtimeBus::userRoom($user)],
            'space.speaker_declined',
            ['space_id' => (string) $space->id, 'user_id' => (string) $user]
        );

        return response()->json(['success' => true, 'message' => 'Request declined.']);
    }

    /** Every action here is the host's alone. */
    private function authorizeHost(Request $request, Space $space): void
    {
        abort_unless($request->user() && $request->user()->id === $space->host_id, 403, 'Only the host can do that.');
    }

    private function row(SpaceParticipant $p, $at): array
    {
        return [
            'id'         => (string) $p->id,
            'user_id'    => (string) $p->user_id,
            'name'       => $p->user?->name ?? 'Guest',
            'username'   => $p->user?->username,
            'avatar'     => $p->user?->avatar ? $this->storage->url($p->user->avatar) : StorageService::defaultAvatarUrl(),
            'verified'   => (bool) ($p->user?->is_verified),
            // ISO8601 so the app can render "2m ago" itself.
            'at'         => $at?->toIso8601String(),
        ];
    }
}
