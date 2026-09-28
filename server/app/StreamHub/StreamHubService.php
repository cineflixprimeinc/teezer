<?php

namespace App\StreamHub;

use Agence104\LiveKit\AccessToken;
use Agence104\LiveKit\AccessTokenOptions;
use Agence104\LiveKit\EgressServiceClient;
use Agence104\LiveKit\RoomCreateOptions;
use Agence104\LiveKit\RoomServiceClient;
use Agence104\LiveKit\VideoGrant;
use App\Models\Space;
use App\Models\SpaceParticipant;
use Illuminate\Support\Facades\Log;
use Livekit\EncodedFileOutput;
use Livekit\EncodedFileType;
use Livekit\ParticipantInfo;
use Livekit\S3Upload;
use Livekit\TrackType;
use Throwable;

/**
 * StreamHub - our own orchestration layer around a self-hosted LiveKit
 * cluster. This is the ONLY place Space controllers talk to LiveKit; nothing
 * outside this module should reference the LiveKit SDK directly.
 *
 * Mirrors CloudflareRealtimeService's shape deliberately (App\Services\
 * Realtime\CloudflareRealtimeService) - same isConfigured()/RuntimeException
 * posture - since Space controllers are being migrated from one to the other.
 * CloudflareRealtimeService is left in place as the rollback path.
 *
 * A Space's LiveKit room name is always "space-{id}" and a participant's
 * LiveKit identity is always their Postgres user id as a string - both
 * deterministic, so no mapping table is needed anywhere in this module.
 */
class StreamHubService
{
    public function __construct(
        private ?string $host = null,
        private ?string $apiKey = null,
        private ?string $apiSecret = null,
    ) {
        $this->host      ??= rtrim((string) config('services.livekit.host'), '/');
        $this->apiKey    ??= (string) config('services.livekit.api_key');
        $this->apiSecret ??= (string) config('services.livekit.api_secret');
    }

    /** True once host + API key/secret are all configured. */
    public function isConfigured(): bool
    {
        return $this->host !== '' && $this->apiKey !== '' && $this->apiSecret !== '';
    }

    public function roomName(Space $space): string
    {
        return "space-{$space->id}";
    }

    /** LiveKit participant identity for a user - stable across reconnects/rejoins. */
    public function identityFor(int $userId): string
    {
        return (string) $userId;
    }

    /**
     * Ensure the room exists with our settings (empty-room auto-cleanup).
     * LiveKit's CreateRoom is idempotent - calling it on an existing room just
     * returns that room, so this is safe to call on every join.
     */
    public function createRoom(Space $space): void
    {
        if (! $this->isConfigured()) {
            return;
        }

        try {
            $this->roomClient()->createRoom(new RoomCreateOptions([
                'name' => $this->roomName($space),
                // No participants for 5 minutes -> LiveKit closes the room itself.
                // A safety net alongside our own end/leave bookkeeping, not a
                // replacement for it.
                'emptyTimeout' => 300,
            ]));
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * Mint a participant JWT for joining this Space's LiveKit room. Publish
     * grant follows the seat's role exactly as Space::joinRole() already
     * decided it - this does not make its own role decision.
     */
    public function generateParticipantToken(Space $space, SpaceParticipant $seat): ?string
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $canPublish = in_array($seat->role, [SpaceParticipant::ROLE_HOST, SpaceParticipant::ROLE_SPEAKER], true);

        $grant = (new VideoGrant())
            ->setRoomJoin()
            ->setRoomName($this->roomName($space))
            ->setCanPublish($canPublish)
            ->setCanPublishSources($canPublish ? ['microphone'] : [])
            ->setCanPublishData(false)
            ->setCanSubscribe(true);

        try {
            $token = (new AccessToken($this->apiKey, $this->apiSecret))
                ->init(new AccessTokenOptions([
                    'identity' => $this->identityFor($seat->user_id),
                    'ttl'      => 6 * 3600,
                ]))
                ->setGrant($grant);

            return $token->toJwt();
        } catch (Throwable $e) {
            report($e);
            return null;
        }
    }

    /**
     * Force-mute (or unmute) a participant's mic - real server-side
     * enforcement (the track itself stops/resumes), not just a badge other
     * clients read. Self-mute stays a pure DB-flag sync (see
     * SpaceRtcController::mute) since a client muting its own mic needs no
     * server round-trip.
     */
    public function muteParticipant(Space $space, SpaceParticipant $seat, bool $muted = true): void
    {
        if (! $this->isConfigured()) {
            return;
        }

        try {
            $roomName    = $this->roomName($space);
            $identity    = $this->identityFor($seat->user_id);
            $participant = $this->roomClient()->getParticipant($roomName, $identity);

            foreach ($participant->getTracks() as $track) {
                if ($track->getType() === TrackType::AUDIO && $track->getMuted() !== $muted) {
                    $this->roomClient()->mutePublishedTrack($roomName, $identity, $track->getSid(), $muted);
                }
            }
        } catch (Throwable $e) {
            // Fails open: the DB flag (which callers set regardless) still
            // drives the UI badge even if the participant is already gone or
            // LiveKit is briefly unreachable.
            report($e);
        }
    }

    /**
     * Close the room entirely, disconnecting anyone still in it. Called
     * whenever a Space ends (host-initiated or admin-forced) so a room can
     * never keep carrying live audio after the app considers it over -
     * without this, stray connected clients could linger in a room our own
     * DB no longer tracks as live.
     */
    public function endRoom(Space $space): void
    {
        if (! $this->isConfigured()) {
            return;
        }

        try {
            $this->roomClient()->deleteRoom($this->roomName($space));
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** Disconnect a participant entirely. They can rejoin (LiveKit's own semantics). */
    public function removeParticipant(Space $space, SpaceParticipant $seat): void
    {
        if (! $this->isConfigured()) {
            return;
        }

        try {
            $this->roomClient()->removeParticipant($this->roomName($space), $this->identityFor($seat->user_id));
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * Live participants as LiveKit currently sees them - for admin
     * reconciliation, not the normal read path (Postgres counters stay
     * authoritative there; this is a source of truth check, not a
     * replacement).
     *
     * @return list<array{identity: string, name: string, joined_at: int}>
     */
    public function getParticipants(Space $space): array
    {
        if (! $this->isConfigured()) {
            return [];
        }

        try {
            $participants = $this->roomClient()->listParticipants($this->roomName($space))->getParticipants();

            return array_map(static fn (ParticipantInfo $p) => [
                'identity'  => $p->getIdentity(),
                'name'      => $p->getName(),
                'joined_at' => $p->getJoinedAt(),
            ], iterator_to_array($participants));
        } catch (Throwable $e) {
            report($e);
            return [];
        }
    }

    public function getViewerCount(Space $space): int
    {
        return count($this->getParticipants($space));
    }

    /**
     * Start recording the room's mixed audio. Room-composite (not
     * track-composite): Spaces can have several simultaneous speakers, and
     * only room-composite mixes every published track into one file, which
     * is what the single `spaces.recording_url` column expects. audioOnly
     * still routes through LiveKit's web-based compositor internally (video
     * is simply discarded on encode) - Egress needs headless Chrome for this
     * even though the output has no video, unlike the lighter track-composite
     * path (which can't merge multiple speakers).
     *
     * Uploads DIRECTLY from Egress to the configured disk's bucket - the raw
     * live stream never touches this app or transits through it as a file.
     */
    public function startRecording(Space $space): void
    {
        if (! $this->isConfigured()) {
            return;
        }

        $disk       = (string) config('services.livekit.recording_disk', 'b2');
        $diskConfig = (array) config("filesystems.disks.{$disk}", []);
        $bucket     = (string) (config('services.livekit.recording_bucket') ?: ($diskConfig['bucket'] ?? ''));

        if ($bucket === '' || empty($diskConfig['key']) || empty($diskConfig['secret'])) {
            Log::warning('StreamHub: recording requested but the recording disk is not configured', [
                'space_id' => $space->id,
                'disk'     => $disk,
            ]);
            return;
        }

        $prefix = trim((string) config('services.livekit.recording_prefix', 'recordings/spaces'), '/');
        $key    = sprintf('%s/%d/%s.mp3', $prefix, $space->id, now()->format('Ymd_His'));

        $s3 = new S3Upload([
            'access_key'       => (string) $diskConfig['key'],
            'secret'           => (string) $diskConfig['secret'],
            'region'           => (string) ($diskConfig['region'] ?? ''),
            'endpoint'         => (string) ($diskConfig['endpoint'] ?? ''),
            'bucket'           => $bucket,
            // The B2 bucket name has an uppercase letter (see filesystems.php's
            // b2 disk comment) - path-style addressing is mandatory or every
            // request 403s with no hint why.
            'force_path_style' => true,
        ]);

        $output = new EncodedFileOutput([
            'file_type' => EncodedFileType::MP3,
            'filepath'  => $key,
            's3'        => $s3,
        ]);

        try {
            $this->egressClient()->startRoomCompositeEgress(
                roomName: $this->roomName($space),
                layout: 'speaker',
                output: $output,
                audioOnly: true,
            );
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** Stop whatever recording is currently active for this room, if any. */
    public function stopRecording(Space $space): void
    {
        if (! $this->isConfigured()) {
            return;
        }

        try {
            $active = $this->egressClient()->listEgress($this->roomName($space), '', true)->getItems();
            foreach ($active as $egress) {
                $this->egressClient()->stopEgress($egress->getEgressId());
            }
        } catch (Throwable $e) {
            report($e);
        }
    }

    private function roomClient(): RoomServiceClient
    {
        return new RoomServiceClient($this->host, $this->apiKey, $this->apiSecret);
    }

    private function egressClient(): EgressServiceClient
    {
        return new EgressServiceClient($this->host, $this->apiKey, $this->apiSecret);
    }
}
