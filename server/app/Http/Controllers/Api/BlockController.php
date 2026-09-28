<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\BlockedUser;
use App\Models\ContentReport;
use App\Models\Follower;
use App\Models\Profile;
use App\Models\User;
use App\Services\ReportEvidenceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BlockController extends Controller
{
    public function index(): JsonResponse
    {
        $user    = request()->user();
        $blocked = $user->blockedUsers()->with('profile')->paginate(20);

        return response()->json([
            'success' => true,
            'data'    => UserResource::collection($blocked),
            'meta'    => [
                'current_page' => $blocked->currentPage(),
                'last_page'    => $blocked->lastPage(),
                'total'        => $blocked->total(),
            ],
        ]);
    }

    public function block(string $username): JsonResponse
    {
        $target   = User::where('username', $username)->firstOrFail();
        $authUser = request()->user();

        if ($authUser->id === $target->id) {
            return response()->json(['success' => false, 'message' => 'Cannot block yourself.'], 422);
        }

        $already = BlockedUser::where('blocker_id', $authUser->id)->where('blocked_id', $target->id)->exists();
        if ($already) {
            return response()->json(['success' => true, 'blocked' => true]);
        }

        DB::transaction(function () use ($authUser, $target) {
            BlockedUser::create(['blocker_id' => $authUser->id, 'blocked_id' => $target->id]);

            // Remove follow relationships in both directions
            $removedFollowing = Follower::where('follower_id', $authUser->id)
                ->where('following_id', $target->id)->delete();
            $removedFollower  = Follower::where('follower_id', $target->id)
                ->where('following_id', $authUser->id)->delete();

            if ($removedFollowing) {
                Profile::where('user_id', $authUser->id)->decrement('total_following');
                Profile::where('user_id', $target->id)->decrement('total_followers');
            }
            if ($removedFollower) {
                Profile::where('user_id', $target->id)->decrement('total_following');
                Profile::where('user_id', $authUser->id)->decrement('total_followers');
            }
        });

        return response()->json(['success' => true, 'blocked' => true]);
    }

    public function unblock(string $username): JsonResponse
    {
        $target   = User::where('username', $username)->firstOrFail();
        $authUser = request()->user();

        BlockedUser::where('blocker_id', $authUser->id)->where('blocked_id', $target->id)->delete();

        return response()->json(['success' => true, 'blocked' => false]);
    }

    /**
     * POST /users/{username}/report - closes a gap that sat half-built for a
     * while: user_reports (table + admin review) already existed, and the
     * mobile app already had a working reportUser() call site waiting on
     * this exact route (see mobile/src/api/profile.api.ts's own comment) -
     * but nothing ever created the route or wrote to that table. Written
     * against the shared ContentReport table (reportable_type='user')
     * rather than the older, admin-visible user_reports table: that table
     * has no evidence-file column and no ReportEvidenceService integration,
     * and duplicating the newer pattern onto it would mean two different
     * report shapes for the one type admin already reviews. ContentReport
     * additionally gets its own admin surface (see AdminReportsController).
     */
    public function report(Request $request, ReportEvidenceService $reportEvidence, string $username): JsonResponse
    {
        $request->validate([
            'reason'  => ['required', 'in:spam,fake_impersonation,harassment,hate_speech,nudity,underage,scam_fraud,other'],
            'details' => ['nullable', 'string', 'max:500'],
            ...$reportEvidence->rules(),
        ]);

        $target   = User::where('username', $username)->firstOrFail();
        $authUser = request()->user();

        if ($authUser->id === $target->id) {
            return response()->json(['success' => false, 'message' => 'You cannot report yourself.'], 422);
        }

        $already = ContentReport::type(ContentReport::TYPE_USER)
            ->where('reportable_id', $target->id)
            ->where('reporter_id', $authUser->id)
            ->exists();
        if ($already) {
            return response()->json(['success' => false, 'message' => 'You have already reported this account.'], 422);
        }

        ContentReport::create([
            'reportable_type' => ContentReport::TYPE_USER,
            'reportable_id'   => $target->id,
            'reporter_id'     => $authUser->id,
            'reason'          => $request->input('reason'),
            'details'         => $request->input('details'),
            'evidence_keys'   => $reportEvidence->store($request),
        ]);

        return response()->json(['success' => true, 'message' => 'Report submitted. Thank you for keeping Teezer safe.']);
    }
}
