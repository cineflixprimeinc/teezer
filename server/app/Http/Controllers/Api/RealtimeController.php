<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CentrifugoClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Issues Centrifugo client credentials for the authenticated Sanctum user.
 * Additive to the existing auth flow - the app still logs in with Sanctum as
 * before; this only mints the realtime JWTs Centrifugo requires.
 */
class RealtimeController extends Controller
{
    /** GET /realtime/token - Centrifugo connection JWT for the authenticated user. */
    public function token(Request $request): JsonResponse
    {
        $ttl = (int) config('services.centrifugo.token_ttl', 3600);

        return response()->json([
            'success' => true,
            'data'    => [
                'token'      => CentrifugoClient::connectionToken($request->user()->id, $ttl),
                'expires_in' => $ttl,
            ],
        ]);
    }

    /** POST /realtime/subscribe { channel } - subscription JWT after authorizing it. */
    public function subscribe(Request $request): JsonResponse
    {
        $data    = $request->validate(['channel' => ['required', 'string', 'max:120']]);
        $user    = $request->user();
        $channel = $data['channel'];

        if (!$this->canSubscribe($user, $channel)) {
            return response()->json(['success' => false, 'message' => 'Not allowed to subscribe to this channel.'], 403);
        }

        return response()->json([
            'success' => true,
            'data'    => ['token' => CentrifugoClient::subscriptionToken($user->id, $channel)],
        ]);
    }

    /**
     * Authorize a private-channel subscription.
     * - Public `video:<id>` channels never reach here (clients subscribe token-free).
     * - `user:<id>` - only the owner.
     * - `conv:<id>` - participants only.
     */
    private function canSubscribe($user, string $channel): bool
    {
        if ($channel === "user:{$user->id}") {
            return true;
        }

        if (preg_match('/^conv:(\d+)$/', $channel, $m)) {
            // NOTE: reconcile against the conversation system that owns this id when
            // DMs/typing move onto Centrifugo (Phase 4). Best-effort membership check.
            return \App\Models\Conversation::query()
                ->whereKey((int) $m[1])
                ->where(fn ($q) => $q->where('user_a_id', $user->id)->orWhere('user_b_id', $user->id))
                ->exists();
        }

        return false;
    }
}
