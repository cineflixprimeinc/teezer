<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Follower;
use App\Models\User;
use App\Services\CentrifugoClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /presence - privacy-filtered online lookup (Centrifugo replacement for the
 * chat-server's `presence:get` ack). Source of truth is Centrifugo channel
 * presence (each user is subscribed to their own `user:<id>` channel); visibility
 * honors the same `users.activity_status` (public|friends|no_one) + mutual-follow
 * rules the chat-server enforced. Only reachable under the centrifugo driver.
 */
class PresenceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_ids'   => ['required', 'array', 'max:500'],
            'user_ids.*' => ['integer'],
        ]);

        $me   = $request->user();
        $ids  = array_values(array_unique(array_map('intval', $data['user_ids'])));
        $ids  = array_filter($ids, static fn ($id) => $id > 0 && $id !== $me->id);

        $viewerStatus = $me->activity_status ?? 'public';
        $targets      = User::whereIn('id', $ids)->get(['id', 'activity_status'])->keyBy('id');

        $online = [];
        foreach ($ids as $id) {
            $u = $targets->get($id);
            if (!$u) {
                continue;
            }
            $status = $u->activity_status ?? 'public';

            $canSee = $status === 'public'
                || ($status === 'friends' && $viewerStatus !== 'no_one' && $this->mutualFollow($me->id, $id));

            if ($canSee && CentrifugoClient::presenceStats("user:{$id}") > 0) {
                $online[] = $id;
            }
        }

        return response()->json(['success' => true, 'data' => ['online' => array_values($online)]]);
    }

    /** Both users follow each other with an accepted status. */
    private function mutualFollow(int $a, int $b): bool
    {
        return Follower::where('follower_id', $a)->where('following_id', $b)->where('status', 'accepted')->exists()
            && Follower::where('follower_id', $b)->where('following_id', $a)->where('status', 'accepted')->exists();
    }
}
