<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Space;
use App\Models\SpaceParticipant;
use App\StreamHub\StreamHubService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The mic path for Spaces, on self-hosted LiveKit via StreamHub.
 *
 * WHY AN SFU AT ALL: peer-to-peer cannot do this. A speaker in a 900-listener
 * room would have to upload 900 copies of their own audio. The SFU takes one
 * upload and fans it out.
 *
 * WHY THIS SHAPE: the old Cloudflare-SFU version of this controller proxied
 * raw SDP through three endpoints (publish/subscribe/renegotiate) because
 * that's what Cloudflare's session API needed. LiveKit's client SDK does its
 * own ICE/SDP negotiation once handed {url, token} - so this controller's only
 * job is minting that token server-side (the API secret must never reach a
 * client, which is the whole reason this endpoint exists rather than the app
 * calling LiveKit directly).
 */
class SpaceRtcController extends Controller
{
    public function __construct(private readonly StreamHubService $streamHub) {}

    /**
     * POST /spaces/{space}/rtc/token
     *
     * Mints a LiveKit participant token for the caller's current seat. Publish
     * grant follows Space::joinRole()'s existing role decision - a listener
     * gets a subscribe-only token, a speaker/host gets publish+subscribe.
     */
    public function token(Request $request, Space $space): JsonResponse
    {
        $seat = $this->seat($request, $space);
        if (! $seat) {
            return $this->error('Join the space first.', 422);
        }

        if (! $this->streamHub->isConfigured()) {
            return $this->error('The audio service is not configured.', 503);
        }

        $this->streamHub->createRoom($space);
        $token = $this->streamHub->generateParticipantToken($space, $seat);
        if (! $token) {
            return $this->error('Could not reach the audio service.', 503);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'url'        => config('services.livekit.host'),
                'token'      => $token,
                'roomName'   => $this->streamHub->roomName($space),
                'canPublish' => in_array($seat->role, [SpaceParticipant::ROLE_HOST, SpaceParticipant::ROLE_SPEAKER], true),
            ],
        ]);
    }

    /**
     * POST /spaces/{space}/rtc/mute - stop/resume publishing.
     *
     * Self-mute only - the caller muting their OWN mic. The client mutes its
     * local track directly via the LiveKit SDK (no server round-trip needed
     * for that); this just syncs the DB flag other clients read to draw the
     * mic badge. Moderator/admin force-mute is a different, real-enforcement
     * path - see SpaceModerationController::mute / AdminSpaceController.
     */
    public function mute(Request $request, Space $space): JsonResponse
    {
        $data = $request->validate(['muted' => ['required', 'boolean']]);

        $seat = $this->seat($request, $space);
        if (! $seat) {
            return $this->error('Join the space first.', 422);
        }

        $seat->update(['muted' => $data['muted']]);

        return response()->json(['success' => true, 'data' => ['muted' => (bool) $data['muted']]]);
    }

    /** The caller's live seat in this room, if they hold one. */
    private function seat(Request $request, Space $space): ?SpaceParticipant
    {
        return SpaceParticipant::where('space_id', $space->id)
            ->where('user_id', $request->user()->id)
            ->whereNull('left_at')
            ->first();
    }

    private function error(string $message, int $status): JsonResponse
    {
        return response()->json(['success' => false, 'message' => $message], $status);
    }
}
