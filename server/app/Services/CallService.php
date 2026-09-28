<?php

namespace App\Services;

use Illuminate\Support\Facades\Redis;

/**
 * 1:1 audio/video call signalling (Centrifugo replacement for the chat-server's
 * `call:*` handlers). Ephemeral call state lives in Redis (no DB schema change);
 * lifecycle + WebRTC relay events fan out via RealtimeBus to each peer's
 * `user:<id>` channel. Only the two participants may act on a call.
 *
 * NOTE: unlike the old chat-server this does not persist chat_calls / call_log
 * rows - those live in the System-A `chat_*` tables which no active client reads,
 * so persisting them would write to dead tables. Live call UX is identical.
 */
class CallService
{
    private function key(string $callId): string
    {
        return "realtime:call:{$callId}";
    }

    /** @return string|null new call id, or null if invalid (e.g. calling yourself). */
    public function initiate(int $callerId, string $callerName, ?string $callerAvatar, int $toUserId, string $type): ?string
    {
        if ($callerId === $toUserId || $toUserId <= 0) {
            return null;
        }
        $type   = in_array($type, ['audio', 'video'], true) ? $type : 'audio';
        $callId = (string) Redis::incr('realtime:call:seq');

        Redis::hmset($this->key($callId), [
            'initiator'  => $callerId,
            'callee'     => $toUserId,
            'type'       => $type,
            'status'     => 'ringing',
            'created_at' => time(),
        ]);
        Redis::expire($this->key($callId), 120); // ring window

        RealtimeBus::publish([RealtimeBus::userRoom($toUserId)], 'call:incoming', [
            'call_id'          => $callId,
            'type'             => $type,
            'initiated_by'     => $callerId,
            'initiator_name'   => $callerName,
            'initiator_avatar' => $callerAvatar,
        ]);

        return $callId;
    }

    public function accept(int $userId, string $callId): bool
    {
        $call = $this->call($callId);
        if (!$call || (int) $call['callee'] !== $userId) {
            return false;
        }
        Redis::hmset($this->key($callId), ['status' => 'ongoing', 'started_at' => time()]);
        Redis::expire($this->key($callId), 60 * 60 * 4); // max call length

        RealtimeBus::publish([RealtimeBus::userRoom((int) $call['initiator'])], 'call:accepted', [
            'call_id'     => $callId,
            'accepted_by' => $userId,
        ]);
        return true;
    }

    public function reject(int $userId, string $callId): bool
    {
        $call = $this->call($callId);
        if (!$call || !$this->isParticipant($call, $userId)) {
            return false;
        }
        Redis::del($this->key($callId));
        RealtimeBus::publish([RealtimeBus::userRoom((int) $call['initiator'])], 'call:rejected', [
            'call_id'     => $callId,
            'rejected_by' => $userId,
        ]);
        return true;
    }

    public function end(int $userId, string $callId): bool
    {
        $call = $this->call($callId);
        if (!$call || !$this->isParticipant($call, $userId)) {
            return false;
        }
        Redis::del($this->key($callId));
        $other = (int) $call['initiator'] === $userId ? (int) $call['callee'] : (int) $call['initiator'];
        RealtimeBus::publish([RealtimeBus::userRoom($other)], 'call:ended', [
            'call_id'  => $callId,
            'ended_by' => $userId,
        ]);
        return true;
    }

    /** Relay a WebRTC offer/answer/ICE to the other participant. */
    public function signal(int $userId, string $callId, int $toUserId, string $type, mixed $payload): bool
    {
        $call = $this->call($callId);
        if (!$call || !$this->isParticipant($call, $userId) || !$this->isParticipant($call, $toUserId)) {
            return false;
        }
        RealtimeBus::publish([RealtimeBus::userRoom($toUserId)], 'call:webrtc', [
            'call_id'      => $callId,
            'from_user_id' => $userId,
            'type'         => $type,
            'payload'      => $payload,
        ]);
        return true;
    }

    private function call(string $callId): ?array
    {
        $data = Redis::hgetall($this->key($callId));
        return empty($data) ? null : $data;
    }

    private function isParticipant(array $call, int $userId): bool
    {
        return (int) $call['initiator'] === $userId || (int) $call['callee'] === $userId;
    }
}
