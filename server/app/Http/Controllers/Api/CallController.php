<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CallService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * 1:1 call signalling endpoints - the Centrifugo replacement for the chat-server's
 * ack/relay `call:*` socket handlers. Each persists ephemeral state (CallService,
 * Redis) and fans the lifecycle/signal events to the peer's `user:<id>` channel.
 */
class CallController extends Controller
{
    public function __construct(private readonly CallService $calls) {}

    /** POST /calls {to_user_id, type} → {call_id} */
    public function initiate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'to_user_id' => ['required', 'integer'],
            'type'       => ['required', 'in:audio,video'],
        ]);

        $me     = $request->user();
        $avatar = $me->avatar ? Storage::url($me->avatar) : StorageService::defaultAvatarUrl();
        $callId = $this->calls->initiate($me->id, (string) ($me->name ?? $me->username), $avatar, (int) $data['to_user_id'], $data['type']);

        if (!$callId) {
            return response()->json(['success' => false, 'message' => 'Could not start the call.'], 422);
        }
        return response()->json(['success' => true, 'data' => ['call_id' => $callId]]);
    }

    public function accept(Request $request, string $id): JsonResponse
    {
        return $this->result($this->calls->accept($request->user()->id, $id));
    }

    public function reject(Request $request, string $id): JsonResponse
    {
        return $this->result($this->calls->reject($request->user()->id, $id));
    }

    public function end(Request $request, string $id): JsonResponse
    {
        return $this->result($this->calls->end($request->user()->id, $id));
    }

    /** POST /calls/{id}/signal {to_user_id, type, payload} - WebRTC offer/answer/ICE relay. */
    public function signal(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'to_user_id' => ['required', 'integer'],
            'type'       => ['required', 'string', 'in:offer,answer,ice-candidate'],
            'payload'    => ['required'],
        ]);

        $ok = $this->calls->signal($request->user()->id, $id, (int) $data['to_user_id'], $data['type'], $data['payload']);
        return $this->result($ok);
    }

    private function result(bool $ok): JsonResponse
    {
        return response()->json(['success' => $ok], $ok ? 200 : 422);
    }
}
