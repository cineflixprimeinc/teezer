<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Space;
use App\Models\SpaceParticipant;
use App\Services\RealtimeBus;
use App\StreamHub\StreamHubService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Running the room (§ Moderator Settings): promote / demote / mute / remove /
 * block, plus managing the moderators themselves.
 *
 * Two rings of authority. Moderating the audience (promote…block) is open to the
 * host AND moderators. Managing moderators (add / remove) is the host's alone.
 * The host is untouchable, and only the host may act on another moderator, so no
 * moderator can turn the room against its owner.
 *
 * Every action publishes a `space:{id}` event so open clients update instantly;
 * they also poll the room, so a dropped event is only ever a second's lag.
 *
 * Mute/remove here also call StreamHubService to enforce on LiveKit itself
 * (the actual track stops / the participant is disconnected), not just flip a
 * DB flag other clients read for a badge - a real upgrade over the previous
 * Cloudflare-SFU version of this controller, which never enforced either.
 */
class SpaceModerationController extends Controller
{
    public function __construct(private readonly StreamHubService $streamHub) {}

    /** POST /spaces/{space}/moderation/{user}/promote - listener → speaker. */
    public function promote(Request $request, Space $space, int $user): JsonResponse
    {
        $this->authorizeModerator($request, $space);
        abort_unless($space->hasOpenSpeakerSlot(), 422, 'The stage is full - move a speaker to listeners first.');

        DB::transaction(function () use ($space, $user) {
            $seat = $this->lock($space, $user);
            if (! $seat || $seat->role !== SpaceParticipant::ROLE_LISTENER) {
                return;
            }
            $seat->update([
                'role'           => SpaceParticipant::ROLE_SPEAKER,
                'muted'          => true, // comes up muted; first tap unmutes
                'approved_at'    => now(),
                'hand_raised_at' => null,
                'declined_at'    => null,
            ]);
            DB::statement('UPDATE spaces SET speakers_count = speakers_count + 1, updated_at = now() WHERE id = ?', [$space->id]);
        });

        $this->emit($space, $user, 'space.speaker_approved');
        return $this->ok('They can speak now.');
    }

    /** POST /spaces/{space}/moderation/{user}/demote - speaker → listener. */
    public function demote(Request $request, Space $space, int $user): JsonResponse
    {
        $this->authorizeModerator($request, $space);
        $this->guardTarget($space, $request, $user);

        DB::transaction(function () use ($space, $user) {
            $seat = $this->lock($space, $user);
            if (! $seat || $seat->role !== SpaceParticipant::ROLE_SPEAKER) {
                return;
            }
            $seat->update([
                'role'           => SpaceParticipant::ROLE_LISTENER,
                'muted'          => true,
                'approved_at'    => null,
                'rtc_session_id' => null,
                'rtc_track_name' => null,
                'published_at'   => null,
            ]);
            DB::statement('UPDATE spaces SET speakers_count = GREATEST(speakers_count - 1, 0), updated_at = now() WHERE id = ?', [$space->id]);
            // A demoted speaker's existing publish-grant token stays valid
            // until it expires or they reconnect - silence the mic now rather
            // than trusting that.
            $this->streamHub->muteParticipant($space, $seat);
        });

        $this->emit($space, $user, 'space.demoted');
        return $this->ok('Moved to listeners.');
    }

    /** POST /spaces/{space}/moderation/{user}/mute - force a speaker's mic off. */
    public function mute(Request $request, Space $space, int $user): JsonResponse
    {
        $this->authorizeModerator($request, $space);
        $this->guardTarget($space, $request, $user);

        $seat = SpaceParticipant::where('space_id', $space->id)->where('user_id', $user)
            ->whereNull('left_at')->first();
        if ($seat) {
            $seat->update(['muted' => true]);
            $this->streamHub->muteParticipant($space, $seat);
        }

        $this->emit($space, $user, 'space.muted');
        return $this->ok('Speaker muted.');
    }

    /** POST /spaces/{space}/moderation/{user}/remove - remove from the room. */
    public function remove(Request $request, Space $space, int $user): JsonResponse
    {
        $this->authorizeModerator($request, $space);
        $this->guardTarget($space, $request, $user);
        $this->kick($space, $user);

        $this->emit($space, $user, 'space.removed');
        return $this->ok('User removed.');
    }

    /** POST /spaces/{space}/moderation/{user}/block - remove and bar re-entry. */
    public function block(Request $request, Space $space, int $user): JsonResponse
    {
        $this->authorizeModerator($request, $space);
        $this->guardTarget($space, $request, $user);

        DB::transaction(function () use ($space, $user) {
            $blocked = array_values(array_unique(array_map('intval', array_merge($space->blocked_user_ids ?? [], [$user]))));
            // Blocking a moderator also strips their moderator seat.
            $mods = array_values(array_diff(array_map('intval', $space->moderator_ids ?? []), [$user]));
            $space->update(['blocked_user_ids' => $blocked, 'moderator_ids' => $mods]);
            $this->kick($space, $user);
        });

        $this->emit($space, $user, 'space.blocked');
        return $this->ok('User blocked.');
    }

    /** POST /spaces/{space}/moderation/{user}/promote-moderator - host only. */
    public function addModerator(Request $request, Space $space, int $user): JsonResponse
    {
        $this->authorizeHost($request, $space);
        abort_if($user === $space->host_id, 422, 'The host already runs the room.');

        DB::transaction(function () use ($space, $user) {
            $mods = array_values(array_unique(array_map('intval', array_merge($space->moderator_ids ?? [], [$user]))));
            $space->update(['moderator_ids' => $mods]);
            // A moderator holds the mic: promote them if they are only listening.
            $seat = $this->lock($space, $user);
            if ($seat && $seat->role === SpaceParticipant::ROLE_LISTENER) {
                $seat->update(['role' => SpaceParticipant::ROLE_SPEAKER, 'muted' => true, 'hand_raised_at' => null]);
                DB::statement('UPDATE spaces SET speakers_count = speakers_count + 1, updated_at = now() WHERE id = ?', [$space->id]);
            }
        });

        $this->emit($space, $user, 'space.moderator_added');
        return $this->ok('Moderator added.');
    }

    /** POST /spaces/{space}/moderation/{user}/remove-moderator - host only. */
    public function removeModerator(Request $request, Space $space, int $user): JsonResponse
    {
        $this->authorizeHost($request, $space);

        $mods = array_values(array_diff(array_map('intval', $space->moderator_ids ?? []), [$user]));
        // Co-hosts are moderators too; dropping them from that list keeps it honest.
        $coHosts = array_values(array_diff(array_map('intval', $space->co_host_ids ?? []), [$user]));
        $space->update(['moderator_ids' => $mods, 'co_host_ids' => $coHosts]);

        $this->emit($space, $user, 'space.moderator_removed');
        return $this->ok('Moderator removed.');
    }

    /* ── helpers ─────────────────────────────────────────────────────── */

    private function lock(Space $space, int $user): ?SpaceParticipant
    {
        return SpaceParticipant::withoutGlobalScopes()
            ->where('space_id', $space->id)->where('user_id', $user)
            ->whereNull('left_at')->lockForUpdate()->first();
    }

    /** Give the seat back and drain the counters, whatever role they held. */
    private function kick(Space $space, int $user): void
    {
        DB::transaction(function () use ($space, $user) {
            $seat = $this->lock($space, $user);
            if (! $seat) {
                return;
            }
            $wasSpeaking = $seat->role !== SpaceParticipant::ROLE_LISTENER;
            $seat->update(['left_at' => now(), 'rtc_session_id' => null, 'rtc_track_name' => null, 'published_at' => null]);
            DB::statement('
                UPDATE spaces
                SET listeners_count = GREATEST(listeners_count - 1, 0),
                    speakers_count  = GREATEST(speakers_count - ?, 0),
                    updated_at      = now()
                WHERE id = ?', [$wasSpeaking ? 1 : 0, $space->id]);
            $this->streamHub->removeParticipant($space, $seat);
        });
    }

    private function authorizeModerator(Request $request, Space $space): void
    {
        abort_unless($request->user() && $space->isModerator((int) $request->user()->id), 403, 'Only the host or a moderator can do that.');
    }

    private function authorizeHost(Request $request, Space $space): void
    {
        abort_unless($request->user() && $space->host_id === (int) $request->user()->id, 403, 'Only the host can manage moderators.');
    }

    /** The host is untouchable, and only the host may act on another moderator. */
    private function guardTarget(Space $space, Request $request, int $user): void
    {
        abort_if($user === $space->host_id, 422, 'You cannot moderate the host.');
        if ($space->isModerator($user) && $space->host_id !== (int) $request->user()->id) {
            abort(403, 'Only the host can act on a moderator.');
        }
    }

    private function emit(Space $space, int $user, string $event): void
    {
        RealtimeBus::publish(
            [RealtimeBus::userRoom($user), "space:{$space->id}"],
            $event,
            ['space_id' => (string) $space->id, 'user_id' => (string) $user]
        );
    }

    private function ok(string $message): JsonResponse
    {
        return response()->json(['success' => true, 'message' => $message]);
    }
}
