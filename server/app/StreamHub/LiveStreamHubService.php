<?php

namespace App\StreamHub;

use Agence104\LiveKit\AccessToken;
use Agence104\LiveKit\AccessTokenOptions;
use Agence104\LiveKit\EgressServiceClient;
use Agence104\LiveKit\RoomCreateOptions;
use Agence104\LiveKit\RoomServiceClient;
use Agence104\LiveKit\VideoGrant;
use App\Models\LiveStream;
use Illuminate\Support\Facades\Log;
use Livekit\EncodedFileOutput;
use Livekit\EncodedFileType;
use Livekit\S3Upload;
use Throwable;

/**
 * Ingest and delivery for live streams, on the same self-hosted LiveKit cluster
 * that carries Spaces.
 *
 * Sibling of StreamHubService rather than an extension of it: a Space is a room
 * where any participant can be promoted to speak, so its grants are computed
 * per seat. A stream has exactly one publisher and everyone else is subscribe-
 * only, which is a different grant model - folding both into one service means
 * a bug in the Space path can hand someone a publish grant on a stream.
 *
 * This is the ONLY place live-stream controllers touch the LiveKit SDK.
 *
 * A stream's room name is stored on the row (`room_name`, minted at create) and
 * a participant's LiveKit identity is always their Postgres user id as a
 * string, so no mapping table is needed. Guests get a `guest-{key}` identity,
 * which is deterministic per device for the same reason.
 */
class LiveStreamHubService
{
    private ?string $host;
    private ?string $apiKey;
    private ?string $apiSecret;

    public function __construct(?string $host = null, ?string $apiKey = null, ?string $apiSecret = null)
    {
        $this->host      = $host      ?? rtrim((string) config('services.livekit.host'), '/');
        $this->apiKey    = $apiKey    ?? (string) config('services.livekit.api_key');
        $this->apiSecret = $apiSecret ?? (string) config('services.livekit.api_secret');
    }

    /** No cluster configured - every call below degrades instead of throwing. */
    public function isConfigured(): bool
    {
        return $this->host !== '' && $this->apiKey !== '' && $this->apiSecret !== '';
    }

    public function roomName(LiveStream $stream): string
    {
        return $stream->room_name ?: ('live-' . $stream->id);
    }

    public function identityFor(?int $userId, ?string $guestKey = null): string
    {
        return $userId ? (string) $userId : 'guest-' . substr((string) $guestKey, 0, 32);
    }

    /* ── Room lifecycle ─────────────────────────────────────────────────── */

    /**
     * Open the room the broadcaster will publish into.
     *
     * `emptyTimeout` is generous: a broadcaster whose connection blips must not
     * lose the room (and with it every viewer) before they can reconnect.
     */
    public function createRoom(LiveStream $stream): void
    {
        if (! $this->isConfigured()) return;

        try {
            $this->roomClient()->createRoom(
                (new RoomCreateOptions())
                    ->setName($this->roomName($stream))
                    ->setEmptyTimeout(300)
                    ->setMaxParticipants(0) // 0 = the cluster's own ceiling
                    ->setMetadata(json_encode([
                        'kind'      => 'live_stream',
                        'stream_id' => (int) $stream->id,
                        'host_id'   => (int) $stream->user_id,
                    ]))
            );
        } catch (Throwable $e) {
            // Already existing is the common case on a reconnect, and harmless.
            Log::warning('LiveStreamHub: createRoom failed', [
                'stream_id' => $stream->id, 'error' => $e->getMessage(),
            ]);
        }
    }

    /** Close the room and disconnect everyone still in it. */
    public function endRoom(LiveStream $stream): void
    {
        if (! $this->isConfigured()) return;

        try {
            $this->roomClient()->deleteRoom($this->roomName($stream));
        } catch (Throwable $e) {
            Log::warning('LiveStreamHub: endRoom failed', [
                'stream_id' => $stream->id, 'error' => $e->getMessage(),
            ]);
        }
    }

    /* ── Tokens ─────────────────────────────────────────────────────────── */

    /**
     * The broadcaster's token. This is the ingest credential: whoever holds it
     * can publish into the room, which is why it is minted per request for the
     * host alone and never stored.
     */
    public function publisherToken(LiveStream $stream, int $userId): ?string
    {
        if (! $this->isConfigured()) return null;

        return $this->mint(
            $stream,
            $this->identityFor($userId),
            (new VideoGrant())
                ->setRoomJoin(true)
                ->setRoomName($this->roomName($stream))
                ->setCanPublish(true)
                ->setCanPublishData(true)
                ->setCanSubscribe(true),
        );
    }

    /**
     * A viewer's token: subscribe only.
     *
     * `setCanPublish(false)` is the whole point - it is what stops a viewer
     * from pushing their own camera into someone else's broadcast. Data is also
     * off; chat goes through the API so it can be moderated and audited, not
     * peer-to-peer where nothing can see it.
     */
    public function viewerToken(LiveStream $stream, ?int $userId, ?string $guestKey = null): ?string
    {
        if (! $this->isConfigured()) return null;

        return $this->mint(
            $stream,
            $this->identityFor($userId, $guestKey),
            (new VideoGrant())
                ->setRoomJoin(true)
                ->setRoomName($this->roomName($stream))
                ->setCanPublish(false)
                ->setCanPublishData(false)
                ->setCanSubscribe(true),
        );
    }

    /* ── Presence ───────────────────────────────────────────────────────── */

    /**
     * How many people the cluster actually has in the room, minus the host.
     *
     * Used to reconcile `viewers_now`: our own join/leave rows can be orphaned
     * by a hard app kill, and LiveKit is the only thing that truly knows who is
     * still connected.
     */
    public function getViewerCount(LiveStream $stream): int
    {
        if (! $this->isConfigured()) return 0;

        try {
            $participants = $this->roomClient()->listParticipants($this->roomName($stream));
            $hostIdentity = $this->identityFor((int) $stream->user_id);

            $n = 0;
            foreach ($participants as $p) {
                if ($p->getIdentity() !== $hostIdentity) $n++;
            }
            return $n;
        } catch (Throwable) {
            return (int) $stream->viewers_now;
        }
    }

    /** Kick someone the host or an admin has banned mid-stream. */
    public function removeParticipant(LiveStream $stream, int $userId): void
    {
        if (! $this->isConfigured()) return;

        try {
            $this->roomClient()->removeParticipant($this->roomName($stream), $this->identityFor($userId));
        } catch (Throwable $e) {
            Log::warning('LiveStreamHub: removeParticipant failed', [
                'stream_id' => $stream->id, 'user_id' => $userId, 'error' => $e->getMessage(),
            ]);
        }
    }

    /* ── Replay ─────────────────────────────────────────────────────────── */

    /**
     * Record the broadcast for replay.
     *
     * Writes an mp4 to the same object store Spaces recordings use. The key is
     * stored, not a pre-signed URL - a URL expires, a key does not.
     */
    public function startRecording(LiveStream $stream): void
    {
        if (! $this->isConfigured() || ! $stream->replay_enabled) return;

        $disk       = (string) config('services.livekit.recording_disk', 'b2');
        $diskConfig = (array) config("filesystems.disks.{$disk}", []);
        $bucket     = (string) (config('services.livekit.recording_bucket') ?: ($diskConfig['bucket'] ?? ''));

        if ($bucket === '') {
            Log::warning('LiveStreamHub: no recording bucket configured', ['stream_id' => $stream->id]);
            return;
        }

        $prefix = trim((string) config('services.livekit.recording_prefix', 'recordings/spaces'), '/');
        // Streams keep their own folder so a replay sweep never touches Spaces.
        $key = "{$prefix}/live/{$stream->id}-" . now()->format('Ymd-His') . '.mp4';

        try {
            $output = (new EncodedFileOutput())
                ->setFileType(EncodedFileType::MP4)
                ->setFilepath($key)
                ->setS3((new S3Upload())
                    ->setAccessKey((string) ($diskConfig['key'] ?? ''))
                    ->setSecret((string) ($diskConfig['secret'] ?? ''))
                    ->setRegion((string) ($diskConfig['region'] ?? ''))
                    ->setEndpoint((string) ($diskConfig['endpoint'] ?? ''))
                    ->setBucket($bucket)
                    ->setForcePathStyle(true));

            $info = $this->egressClient()->startRoomCompositeEgress(
                $this->roomName($stream),
                'speaker',
                [$output],
            );

            $stream->recordEvent('recording_started', null, [
                'egress_id' => method_exists($info, 'getEgressId') ? $info->getEgressId() : null,
                'key'       => $key,
            ]);
        } catch (Throwable $e) {
            Log::warning('LiveStreamHub: startRecording failed', [
                'stream_id' => $stream->id, 'error' => $e->getMessage(),
            ]);
        }
    }

    /* ── Internals ──────────────────────────────────────────────────────── */

    private function mint(LiveStream $stream, string $identity, VideoGrant $grant): ?string
    {
        try {
            return (new AccessToken($this->apiKey, $this->apiSecret))
                ->init((new AccessTokenOptions())
                    ->setIdentity($identity)
                    // A token outliving the broadcast is a token someone can
                    // reuse against the next one.
                    ->setTtl(6 * 3600))
                ->setGrant($grant)
                ->toJwt();
        } catch (Throwable $e) {
            Log::warning('LiveStreamHub: token mint failed', [
                'stream_id' => $stream->id, 'identity' => $identity, 'error' => $e->getMessage(),
            ]);
            return null;
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
