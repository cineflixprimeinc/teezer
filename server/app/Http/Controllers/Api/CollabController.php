<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * "Paid partnership" collab-tag approval - accept/decline a pending
 * collab-request notification. Mirrors TagController exactly - same shape,
 * applied to a `comment_mentions` row with source_type = 'collab' instead
 * of 'tag'. See Video::collabUsers() for the read side.
 */
class CollabController extends Controller
{
    public function __construct(private readonly NotificationService $notifs) {}

    /**
     * POST /users/collab-requests/{id}/accept
     *
     * $id is the comment_mentions row id (the collab-request notification's
     * entity_id - see MentionService::processCollabUsers()/syncCollabUsers()).
     */
    public function accept(int $id): JsonResponse
    {
        $me = request()->user();

        $collab = DB::table('comment_mentions')
            ->where('id', $id)
            ->where('mentioned_user_id', $me->id)
            ->where('source_type', 'collab')
            ->first();

        if (!$collab) {
            abort(404);
        }

        // Conditional write, not the SELECT above - see TagController::accept()
        // for the exact same reasoning. A second concurrent/duplicate request
        // sees 0 affected rows and exits quietly, no duplicate notification.
        $changed = DB::table('comment_mentions')
            ->where('id', $id)
            ->where('status', 'pending')
            ->update(['status' => 'accepted']);

        if (!$changed) {
            return response()->json(['success' => true]);
        }

        // Mark the original collab_request notification as approved
        AppNotification::where('user_id', $me->id)
            ->where('type', 'collab_request')
            ->where('entity_type', 'comment_mention')
            ->where('entity_id', $id)
            ->update(['action_status' => 'approved', 'is_read' => true]);

        // Notify the post's owner that their collab request was accepted
        $owner = User::find($collab->mentioned_by_user_id);
        if ($owner) {
            $this->notifs->notify($owner, 'collab_request_accepted', [
                'actor_id'    => $me->id,
                'entity_type' => 'video',
                'entity_id'   => $collab->video_id,
                'message'     => "@{$me->username} accepted your collab.",
            ]);
        }

        return response()->json(['success' => true]);
    }

    /**
     * POST /users/collab-requests/{id}/decline
     */
    public function decline(int $id): JsonResponse
    {
        $me = request()->user();

        $collab = DB::table('comment_mentions')
            ->where('id', $id)
            ->where('mentioned_user_id', $me->id)
            ->where('source_type', 'collab')
            ->first();

        if (!$collab) {
            abort(404);
        }

        // Same conditional-write reasoning as accept() above.
        $changed = DB::table('comment_mentions')
            ->where('id', $id)
            ->where('status', 'pending')
            ->update(['status' => 'declined']);

        if (!$changed) {
            return response()->json(['success' => true]);
        }

        // Mark the original collab_request notification as rejected
        AppNotification::where('user_id', $me->id)
            ->where('type', 'collab_request')
            ->where('entity_type', 'comment_mention')
            ->where('entity_id', $id)
            ->update(['action_status' => 'rejected', 'is_read' => true]);

        // Notify the post's owner that their collab request was declined
        $owner = User::find($collab->mentioned_by_user_id);
        if ($owner) {
            $this->notifs->notify($owner, 'collab_request_rejected', [
                'actor_id'    => $me->id,
                'entity_type' => 'video',
                'entity_id'   => $collab->video_id,
                'message'     => "@{$me->username} declined your collab.",
            ]);
        }

        return response()->json(['success' => true]);
    }
}
