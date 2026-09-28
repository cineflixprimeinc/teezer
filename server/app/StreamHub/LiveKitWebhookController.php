<?php

namespace App\StreamHub;

use Agence104\LiveKit\WebhookReceiver;
use App\Models\LiveStream;
use App\Models\Space;
use App\Models\SpaceParticipant;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Livekit\WebhookEvent;
use Throwable;

/**
 * Receives LiveKit's server-to-server webhooks. This is the only place
 * outside a client request that Space state changes based on what LiveKit
 * itself observed - two jobs, both filling gaps that existed under Cloudflare
 * too and were never addressed there:
 *
 * 1. egress_ended - write the finished recording's key (not a pre-signed
 *    URL - see onEgressEnded) once Egress has actually uploaded it.
 * 2. participant_left / room_finished - reap seats/rooms LiveKit knows are
 *    gone even when the client never called POST .../leave (app killed,
 *    connection dropped). Without this, Space::hasOpenSpeakerSlot() can stay
 *    wrongly blocked forever for a seat nobody is sitting in.
 *
 * No webhook receiver pattern existed anywhere in this codebase before this -
 * kept entirely inside the StreamHub module rather than a general-purpose
 * webhook framework, since nothing else needs one yet.
 */
class LiveKitWebhookController
{
    public function handle(Request $request): Response
    {
        $apiKey    = (string) config('services.livekit.api_key');
        $apiSecret = (string) config('services.livekit.api_secret');

        if ($apiKey === '' || $apiSecret === '') {
            return response('StreamHub not configured.', 503);
        }

        try {
            $receiver = new WebhookReceiver($apiKey, $apiSecret);
            $event    = $receiver->receive((string) $request->getContent(), $request->header('Authorization'));
        } catch (Throwable $e) {
            report($e);
            return response('Invalid webhook.', 401);
        }

        try {
            match ($event->getEvent()) {
                'egress_ended'      => $this->onEgressEnded($event),
                'participant_left'  => $this->onParticipantLeft($event),
                'room_finished'     => $this->onRoomFinished($event),
                default             => null,
            };
        } catch (Throwable $e) {
            // The webhook was authentic and parsed fine - whatever went wrong
            // is our bug, not LiveKit's. Log it but still 200 so LiveKit
            // doesn't retry-storm us over a Space that no longer exists etc.
            report($e);
        }

        return response('', 200);
    }

    /**
     * Stores the RAW object key, not a pre-signed URL. A pre-signed URL
     * expires; the object doesn't. Every other media field in this app
     * (video_url, thumbnail_url, ...) follows the same rule - sign at read
     * time via the existing MediaPresignService, never at write time. See
     * SpaceController::index / SpaceReminderController::replay for the
     * matching read-side signing.
     */
    private function onEgressEnded(WebhookEvent $event): void
    {
        $info = $event->getEgressInfo();
        if (! $info) {
            return;
        }

        // A live stream's recording lands here too; store the key on the stream
        // so the replay has something to play.
        if ($this->liveStreamRecordingFinished($info)) {
            return;
        }

        $space = $this->spaceForRoomName((string) $info->getRoomName());
        if (! $space) {
            return;
        }

        $files = iterator_to_array($info->getFileResults());
        if (count($files) === 0) {
            Log::warning('StreamHub: egress ended with no file results', [
                'space_id'  => $space->id,
                'egress_id' => $info->getEgressId(),
            ]);
            return;
        }

        $key = $files[0]->getFilename();
        if (! $key) {
            return;
        }

        $space->update(['recording_url' => $key, 'is_recorded' => true]);
    }

    /**
     * Reap a seat LiveKit says is gone but our own DB still shows occupied -
     * mirrors SpaceRoomController::leave()'s exact counter/column semantics
     * so a webhook-driven leave is indistinguishable from a client-driven one.
     */
    private function onParticipantLeft(WebhookEvent $event): void
    {
        $room        = $event->getRoom();
        $participant = $event->getParticipant();
        if (! $room || ! $participant) {
            return;
        }

        // Live streams share this cluster. A viewer who force-quits never calls
        // /leave, so the cluster's own disconnect is the only thing that can
        // close their row - otherwise viewers_now only ever climbs.
        if ($this->liveStreamViewerLeft((string) $room->getName(), (string) $participant->getIdentity())) {
            return;
        }

        $space = $this->spaceForRoomName((string) $room->getName());
        if (! $space) {
            return;
        }

        $userId = (int) $participant->getIdentity();
        if ($userId <= 0) {
            return;
        }

        DB::transaction(function () use ($space, $userId) {
            $seat = SpaceParticipant::where('space_id', $space->id)
                ->where('user_id', $userId)
                ->whereNull('left_at')
                ->lockForUpdate()
                ->first();

            if (! $seat) {
                return; // already reaped (e.g. the client's own /leave beat the webhook here)
            }

            $wasSpeaking = $seat->role !== SpaceParticipant::ROLE_LISTENER;
            $seat->update([
                'left_at'        => now(),
                'rtc_session_id' => null,
                'rtc_track_name' => null,
                'published_at'   => null,
            ]);

            DB::statement('
                UPDATE spaces
                SET listeners_count = GREATEST(listeners_count - 1, 0),
                    speakers_count  = GREATEST(speakers_count - ?, 0),
                    updated_at      = now()
                WHERE id = ?', [$wasSpeaking ? 1 : 0, $space->id]);
        });
    }

    /** Mirrors SpaceCreateController::end()'s semantics for a room LiveKit closed on its own. */
    private function onRoomFinished(WebhookEvent $event): void
    {
        $room = $event->getRoom();
        if (! $room) {
            return;
        }

        // Live streams share this cluster and this webhook. Their rooms are
        // named "live-*", so they are recognised here rather than in a second
        // endpoint the cluster would also have to be told about.
        if ($this->finishLiveStream((string) $room->getName())) {
            return;
        }

        $space = $this->spaceForRoomName((string) $room->getName());
        if (! $space || ! $space->isLive()) {
            return; // already ended through the normal host-initiated path
        }

        DB::transaction(function () use ($space) {
            $space->update([
                'status'          => Space::STATUS_ENDED,
                'ended_at'        => now(),
                'listeners_count' => 0,
                'speakers_count'  => 0,
            ]);
            $space->participants()->whereNull('left_at')->update([
                'left_at'        => now(),
                'rtc_session_id' => null,
                'rtc_track_name' => null,
                'published_at'   => null,
            ]);
        });
    }

    /**
     * Store a finished live-stream recording.
     *
     * The object KEY is stored, never a pre-signed URL: a URL expires and the
     * replay would quietly stop working weeks later.
     */
    private function liveStreamRecordingFinished(object $info): bool
    {
        $roomName = (string) $info->getRoomName();
        if (! str_starts_with($roomName, 'live-')) {
            return false;
        }

        $stream = LiveStream::where('room_name', $roomName)->first();
        if (! $stream) {
            return false;
        }

        $files = iterator_to_array($info->getFileResults());
        if (count($files) === 0) {
            Log::warning('LiveStreamHub: egress ended with no file results', [
                'stream_id' => $stream->id, 'room' => $roomName,
            ]);
            return true;
        }

        $stream->forceFill(['replay_url' => (string) $files[0]->getFilename()])->save();
        $stream->recordEvent('replay_ready', null, ['key' => (string) $files[0]->getFilename()]);

        return true;
    }

    /**
     * Close a live-stream viewing session the cluster says has disconnected.
     *
     * Returns true when the room belonged to a live stream, so the Space path
     * is skipped either way.
     */
    private function liveStreamViewerLeft(string $roomName, string $identity): bool
    {
        if (! str_starts_with($roomName, 'live-')) {
            return false;
        }

        $stream = LiveStream::where('room_name', $roomName)->first();
        if (! $stream) {
            return false;
        }

        $rows = $stream->viewers()->whereNull('left_at')
            ->when(
                str_starts_with($identity, 'guest-'),
                fn ($q) => $q->where('guest_key', 'like', substr($identity, 6) . '%'),
                fn ($q) => $q->where('user_id', (int) $identity),
            )->get();

        foreach ($rows as $v) {
            $v->forceFill([
                'left_at'       => now(),
                'watch_seconds' => max(0, now()->diffInSeconds($v->joined_at)),
            ])->save();
        }

        $stream->syncViewerCount();

        return true;
    }

    /**
     * End a live stream whose room the cluster closed.
     *
     * This is the only thing that ends a broadcast when the publisher's
     * connection dies rather than them tapping End: without it a crashed
     * stream stays "live" forever, keeps its viewer count, and keeps appearing
     * on the browse grid with nothing behind it.
     *
     * Returns true when the room belonged to a live stream, so the Space path
     * below is skipped.
     */
    private function finishLiveStream(string $roomName): bool
    {
        if (! str_starts_with($roomName, 'live-')) {
            return false;
        }

        $stream = LiveStream::where('room_name', $roomName)->first();
        if (! $stream) {
            return false;
        }

        // Already ended through the host-initiated path, or taken down.
        if ($stream->status !== LiveStream::STATUS_LIVE) {
            return true;
        }

        DB::transaction(function () use ($stream) {
            $stream->forceFill([
                'status'      => LiveStream::STATUS_ENDED,
                'ended_at'    => now(),
                'viewers_now' => 0,
            ])->save();

            $stream->viewers()->whereNull('left_at')->update(['left_at' => now()]);
        });

        // No actor: the cluster ended this, not a person.
        $stream->recordEvent('ended_by_cluster', null, ['room' => $roomName]);

        return true;
    }

    private function spaceForRoomName(string $roomName): ?Space
    {
        if (! str_starts_with($roomName, 'space-')) {
            return null;
        }

        $id = (int) substr($roomName, strlen('space-'));
        return $id > 0 ? Space::find($id) : null;
    }
}
