<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * "Tag people" approval - accept/decline a pending tag-request notification.
 * Mirrors FollowController::acceptFollowRequest()/declineFollowRequest() -
 * same shape, applied to a `comment_mentions` row (source_type = 'tag')
 * instead of a `followers` row. See the migration that added
 * comment_mentions.status and Video::taggedUsers() for the read side.
 */
class TagController extends Controller
{
    public function __construct(private readonly NotificationService $notifs) {}

    /**
     * POST /users/tag-requests/{id}/accept
     *
     * $id is the comment_mentions row id (the tag-request notification's
     * entity_id - see MentionService::processTaggedUsers()/syncTaggedUsers()).
     */
    public function accept(int $id): JsonResponse
    {
        $me = request()->user();

        $tag = DB::table('comment_mentions')
            ->where('id', $id)
            ->where('mentioned_user_id', $me->id)
            ->where('source_type', 'tag')
            ->first();

        if (!$tag) {
            abort(404);
        }

        // The state transition itself is the conditional write - not the
        // SELECT above, which only establishes ownership/existence and is
        // otherwise racy against a second concurrent accept/decline for the
        // same row (two rapid taps, or accept+decline in flight together).
        // Only the request that actually flips pending->accepted proceeds
        // to notify; a second request sees 0 affected rows and exits quietly
        // as a no-op rather than sending a duplicate outcome notification.
        $changed = DB::table('comment_mentions')
            ->where('id', $id)
            ->where('status', 'pending')
            ->update(['status' => 'accepted']);

        if (!$changed) {
            return response()->json(['success' => true]);
        }

        // Mark the original tag_request notification as approved
        AppNotification::where('user_id', $me->id)
            ->where('type', 'tag_request')
            ->where('entity_type', 'comment_mention')
            ->where('entity_id', $id)
            ->update(['action_status' => 'approved', 'is_read' => true]);

        // Notify the tagger that their tag was accepted
        $tagger = User::find($tag->mentioned_by_user_id);
        if ($tagger) {
            $this->notifs->notify($tagger, 'tag_request_accepted', [
                'actor_id'    => $me->id,
                'entity_type' => 'video',
                'entity_id'   => $tag->video_id,
                'message'     => "@{$me->username} accepted your tag.",
            ]);
        }

        return response()->json(['success' => true]);
    }

    /**
     * POST /users/tag-requests/{id}/decline
     */
    public function decline(int $id): JsonResponse
    {
        $me = request()->user();

        $tag = DB::table('comment_mentions')
            ->where('id', $id)
            ->where('mentioned_user_id', $me->id)
            ->where('source_type', 'tag')
            ->first();

        if (!$tag) {
            abort(404);
        }

        // Same conditional-write reasoning as accept() above - only the
        // request that actually flips pending->declined proceeds.
        $changed = DB::table('comment_mentions')
            ->where('id', $id)
            ->where('status', 'pending')
            ->update(['status' => 'declined']);

        if (!$changed) {
            return response()->json(['success' => true]);
        }

        // Mark the original tag_request notification as rejected
        AppNotification::where('user_id', $me->id)
            ->where('type', 'tag_request')
            ->where('entity_type', 'comment_mention')
            ->where('entity_id', $id)
            ->update(['action_status' => 'rejected', 'is_read' => true]);

        // Notify the tagger that their tag was declined
        $tagger = User::find($tag->mentioned_by_user_id);
        if ($tagger) {
            $this->notifs->notify($tagger, 'tag_request_rejected', [
                'actor_id'    => $me->id,
                'entity_type' => 'video',
                'entity_id'   => $tag->video_id,
                'message'     => "@{$me->username} declined your tag.",
            ]);
        }

        return response()->json(['success' => true]);
    }
}
