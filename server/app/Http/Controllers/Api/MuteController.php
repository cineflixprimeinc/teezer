<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MutedUser;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Account-wide mute (spec: "Allow users to mute users") - suppresses a
 * user's content from the muter's own recommendation feed without
 * unfollowing or blocking. Mirrors BlockController's mute/unmute shape.
 *
 * mute_users_enabled (EnsureGlobalControlEnabled, route api.v1.users.mute)
 * only gates NEW mutes; FeedService respects every existing mute
 * unconditionally, per Global Reelsoo Control's rule that disabling a
 * capability never touches data already created.
 */
class MuteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $muted = $request->user()->mutedUsers()->with('profile')->paginate(20);

        return response()->json([
            'success' => true,
            'data'    => \App\Http\Resources\UserResource::collection($muted),
            'meta'    => [
                'current_page' => $muted->currentPage(),
                'last_page'    => $muted->lastPage(),
                'total'        => $muted->total(),
            ],
        ]);
    }

    public function mute(Request $request, string $username): JsonResponse
    {
        $target   = User::where('username', $username)->firstOrFail();
        $authUser = $request->user();

        if ($authUser->id === $target->id) {
            return response()->json(['success' => false, 'message' => 'Cannot mute yourself.'], 422);
        }

        $already = MutedUser::where('muter_id', $authUser->id)->where('muted_id', $target->id)->exists();
        if ($already) {
            return response()->json(['success' => true, 'muted' => true]);
        }

        MutedUser::create(['muter_id' => $authUser->id, 'muted_id' => $target->id]);

        return response()->json(['success' => true, 'muted' => true]);
    }

    public function unmute(Request $request, string $username): JsonResponse
    {
        $target   = User::where('username', $username)->firstOrFail();
        $authUser = $request->user();

        MutedUser::where('muter_id', $authUser->id)->where('muted_id', $target->id)->delete();

        return response()->json(['success' => true, 'muted' => false]);
    }
}
