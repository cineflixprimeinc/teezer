<?php

namespace App\Http\Controllers\Api;

use App\Jobs\SyncCreatorMonetization;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AppNotification;
use App\Models\Follower;
use App\Models\Profile;
use App\Models\User;
use App\Models\UserModerationSetting;
use App\Services\NotificationService;
use App\Services\RealtimeBus;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class FollowController extends Controller
{
    public function __construct(private readonly NotificationService $notifs) {}

    public function follow(string $username): JsonResponse
    {
        $target   = User::where('username', $username)->firstOrFail();
        $authUser = request()->user();

        if ($authUser->id === $target->id) {
            return response()->json(['success' => false, 'message' => 'You cannot follow yourself.'], 422);
        }

        // Enforce admin restriction: cannot follow others
        $mod = UserModerationSetting::forUser($authUser->id);
        if ($mod->disable_following_others) {
            return response()->json(['success' => false, 'message' => 'Your ability to follow other users has been restricted at this time.'], 403);
        }

        if ($target->hasBlocked($authUser) || $authUser->hasBlocked($target)) {
            return response()->json(['success' => false, 'message' => 'User not found.'], 404);
        }

        // Private accounts get a pending follow request; public accounts are immediately accepted
        $newStatus = $target->is_private ? 'pending' : 'accepted';

        $result = DB::transaction(function () use ($authUser, $target, $newStatus) {
            $existing = Follower::where('follower_id', $authUser->id)
                ->where('following_id', $target->id)
                ->lockForUpdate()
                ->first();

            if ($existing) {
                return ['created' => false, 'status' => $existing->status];
            }

            $followerRow = Follower::create([
                'follower_id'  => $authUser->id,
                'following_id' => $target->id,
                'status'       => $newStatus,
            ]);

            // Only increment profile counters for immediately accepted follows
            if ($newStatus === 'accepted') {
                Profile::where('user_id', $authUser->id)->increment('total_following');
                Profile::where('user_id', $target->id)->increment('total_followers');
            }

            return ['created' => true, 'status' => $newStatus, 'follower_id' => $followerRow->id];
        });

        if ($result['created']) {
            if ($result['status'] === 'accepted') {
                $this->notifs->notify($target, 'follow', [
                    'actor_id'    => $authUser->id,
                    'entity_type' => 'user',
                    'entity_id'   => $authUser->id,
                    'message'     => NotificationService::buildMessage('follow', $authUser->name),
                ]);
            } else {
                // Notify private-account owner; entity_id = Follower row ID for accept/decline
                $this->notifs->notify($target, 'follow_request', [
                    'actor_id'      => $authUser->id,
                    'entity_type'   => 'follow_request',
                    'entity_id'     => $result['follower_id'],
                    'message'       => "@{$authUser->username} requested to follow you.",
                    'action_status' => 'pending',
                ]);
            }
        }

        $followersCount = Profile::where('user_id', $target->id)->value('total_followers') ?? 0;

        // Realtime: the followed user's own room gets a live follower-count bump
        // (only for immediately-accepted public follows; pending requests instead
        // get the follow_request notification handled above).
        if ($result['created'] && $result['status'] === 'accepted') {
            // Both users' cached profile stats changed (my following, their
            // followers) - clear so GET /users/{username} returns fresh counts.
            Cache::forget("profile:stats:{$authUser->id}");
            Cache::forget("profile:stats:{$target->id}");

            RealtimeBus::publish([RealtimeBus::userRoom($target->id)], 'user.followed', [
                'user_id'         => $target->id,
                'follower_id'     => $authUser->id,
                'followers_count' => $followersCount,
            ]);
        }

        // The followed creator's count feeds Affiliate, Subscriptions,
        // Marketplace and Rewards. Re-measure them.
        SyncCreatorMonetization::dispatch($target->id);

        return response()->json([
            'success'         => true,
            'follow_status'   => $result['status'],   // 'accepted' | 'pending'
            'following'       => $result['status'] === 'accepted',
            'followers_count' => $followersCount,
        ]);
    }

    public function unfollow(string $username): JsonResponse
    {
        $target   = User::where('username', $username)->firstOrFail();
        $authUser = request()->user();

        $wasAccepted = DB::transaction(function () use ($authUser, $target) {
            $follow = Follower::where('follower_id', $authUser->id)
                ->where('following_id', $target->id)
                ->first();

            if (!$follow) {
                return false;
            }

            $wasAccepted = $follow->status === 'accepted';

            // Remove the follow_request notification when canceling a pending request
            if ($follow->status === 'pending') {
                AppNotification::where('user_id', $target->id)
                    ->where('type', 'follow_request')
                    ->where('entity_type', 'follow_request')
                    ->where('entity_id', $follow->id)
                    ->delete();
            }

            $follow->delete();

            if ($wasAccepted) {
                Profile::where('user_id', $authUser->id)->decrement('total_following');
                Profile::where('user_id', $target->id)->decrement('total_followers');
            }

            return $wasAccepted;
        });

        $followersCount = Profile::where('user_id', $target->id)->value('total_followers') ?? 0;

        // Realtime: only an accepted follow changed the count, so only then push
        // the live decrement to the (former) followed user's room.
        if ($wasAccepted) {
            Cache::forget("profile:stats:{$authUser->id}");
            Cache::forget("profile:stats:{$target->id}");

            // Drop this user from the target's aggregated "new followers" group so
            // the count reflects only current followers.
            $this->notifs->withdraw($target->id, 'follow', ['actor_id' => $authUser->id]);

            RealtimeBus::publish([RealtimeBus::userRoom($target->id)], 'user.unfollowed', [
                'user_id'         => $target->id,
                'follower_id'     => $authUser->id,
                'followers_count' => $followersCount,
            ]);
        }

        // The followed creator's count feeds Affiliate, Subscriptions,
        // Marketplace and Rewards. Re-measure them.
        SyncCreatorMonetization::dispatch($target->id);

        return response()->json([
            'success'         => true,
            'follow_status'   => 'none',
            'following'       => false,
            'followers_count' => $followersCount,
        ]);
    }

    /**
     * PUT /users/{username}/follow/notify
     * Toggle "notify me when this creator posts" - the profile page's bell
     * icon. Requires an existing accepted follow (nothing to attach the
     * flag to otherwise, and offering it on an unfollowed account would be
     * a dead end the UI already avoids by only showing the bell there).
     */
    public function toggleNotify(string $username): JsonResponse
    {
        $target   = User::where('username', $username)->firstOrFail();
        $authUser = request()->user();

        $follow = Follower::where('follower_id', $authUser->id)
            ->where('following_id', $target->id)
            ->where('status', 'accepted')
            ->first();

        if (!$follow) {
            return response()->json([
                'success' => false,
                'message' => 'Follow this account first to turn on post notifications.',
            ], 422);
        }

        $follow->update(['notify_posts' => !$follow->notify_posts]);

        return response()->json(['success' => true, 'notify_posts' => (bool) $follow->notify_posts]);
    }

    /**
     * GET /users/follow-requests
     * List pending follow requests received by the authenticated user.
     */
    public function followRequests(): JsonResponse
    {
        $me = request()->user();

        $rows = Follower::where('following_id', $me->id)
            ->where('status', 'pending')
            ->with(['follower' => fn ($q) => $q->with('profile')])
            ->orderByDesc('created_at')
            ->get();

        $data = $rows->map(function ($row) {
            $u = $row->follower;
            return [
                'id'         => $row->id,
                'created_at' => $row->created_at,
                'user' => [
                    'id'          => $u->id,
                    'name'        => $u->name,
                    'username'    => $u->username,
                    'avatar'      => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
                    'is_verified' => (bool) $u->is_verified,
                    'bio'         => $u->bio,
                    'followers_count' => $u->profile?->total_followers ?? 0,
                ],
            ];
        });

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * POST /users/follow-requests/{id}/accept
     */
    public function acceptFollowRequest(int $id): JsonResponse
    {
        $me = request()->user();

        $follow = Follower::where('id', $id)
            ->where('following_id', $me->id)
            ->where('status', 'pending')
            ->firstOrFail();

        DB::transaction(function () use ($follow) {
            $follow->update(['status' => 'accepted']);
            Profile::where('user_id', $follow->follower_id)->increment('total_following');
            Profile::where('user_id', $follow->following_id)->increment('total_followers');
        });

        // Mark the original follow_request notification as approved
        AppNotification::where('user_id', $me->id)
            ->where('type', 'follow_request')
            ->where('entity_type', 'follow_request')
            ->where('entity_id', $id)
            ->update(['action_status' => 'approved', 'is_read' => true]);

        // Notify requester that their follow request was accepted
        $requester = User::find($follow->follower_id);
        if ($requester) {
            $this->notifs->notify($requester, 'follow_request_accepted', [
                'actor_id'    => $me->id,
                'entity_type' => 'user',
                'entity_id'   => $me->id,
                'message'     => "@{$me->username} accepted your follow request.",
            ]);
        }

        // Accepting a request changes both users' cached stats (their following,
        // my followers) - clear both so the counts read fresh.
        Cache::forget("profile:stats:{$follow->follower_id}");
        Cache::forget("profile:stats:{$follow->following_id}");

        // Realtime: accepting a request increments my follower count - push it live
        // to my own room so an open profile reflects it without a refresh.
        $followersCount = Profile::where('user_id', $me->id)->value('total_followers') ?? 0;
        RealtimeBus::publish([RealtimeBus::userRoom($me->id)], 'user.followed', [
            'user_id'         => $me->id,
            'follower_id'     => $follow->follower_id,
            'followers_count' => $followersCount,
        ]);

        return response()->json(['success' => true]);
    }

    /**
     * POST /users/follow-requests/{id}/decline
     */
    public function declineFollowRequest(int $id): JsonResponse
    {
        $me = request()->user();

        $follow = Follower::where('id', $id)
            ->where('following_id', $me->id)
            ->where('status', 'pending')
            ->firstOrFail();

        $requesterId = $follow->follower_id;

        // Mark the original follow_request notification as rejected
        AppNotification::where('user_id', $me->id)
            ->where('type', 'follow_request')
            ->where('entity_type', 'follow_request')
            ->where('entity_id', $id)
            ->update(['action_status' => 'rejected', 'is_read' => true]);

        $follow->delete();

        // Notify the requester that their follow request was declined
        $requester = User::find($requesterId);
        if ($requester) {
            $this->notifs->notify($requester, 'follow_request_rejected', [
                'actor_id'    => $me->id,
                'entity_type' => 'user',
                'entity_id'   => $me->id,
                'message'     => "@{$me->username} declined your follow request.",
            ]);
        }

        return response()->json(['success' => true]);
    }
}
