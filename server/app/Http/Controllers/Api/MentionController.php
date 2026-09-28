<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class MentionController extends Controller
{
    /**
     * GET /api/v1/users/mention-search?q=query
     *
     * Returns up to 10 active users matching the query (username or display name),
     * excluding blocked/blocking users and the current user.
     */
    public function search(Request $request): JsonResponse
    {
        $q = trim($request->input('q', ''));

        if (strlen($q) < 1) {
            return response()->json(['data' => []]);
        }

        $auth = $request->user();

        // Collect IDs of users this person blocked or who blocked them
        $blockedIds = DB::table('blocked_users')
            ->where('blocker_id', $auth->id)
            ->orWhere('blocked_id', $auth->id)
            ->get(['blocker_id', 'blocked_id'])
            ->flatMap(fn($b) => [$b->blocker_id, $b->blocked_id])
            ->push($auth->id) // also exclude self
            ->unique()
            ->values()
            ->toArray();

        $users = User::where('is_active', true)
            ->where('is_banned', false)
            ->whereNotIn('id', $blockedIds)
            ->where(function ($query) use ($q) {
                $query->where('username', 'ilike', "%{$q}%")
                      ->orWhere('name', 'ilike', "%{$q}%");
            })
            ->select('id', 'username', 'name', 'avatar', 'is_verified')
            ->orderByRaw("CASE WHEN username ILIKE ? THEN 0 ELSE 1 END", ["{$q}%"])
            ->limit(10)
            ->get()
            ->map(fn($u) => [
                'id'             => $u->id,
                'username'       => $u->username,
                'displayName'    => $u->name,
                'avatar'         => $u->avatar,
                'isVerified'     => (bool) $u->is_verified,
                'followersCount' => 0,
            ]);

        return response()->json(['data' => $users]);
    }
}
