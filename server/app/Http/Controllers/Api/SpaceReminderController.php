<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Space;
use App\Models\SpaceReminder;
use App\Services\MediaPresignService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Remind me" on a scheduled Space, and the play counter behind a replay.
 *
 * Both are one-tap writes off the Spaces tab, and both answer with the number
 * the row should now show, so the app never has to guess what the server did.
 */
class SpaceReminderController extends Controller
{
    /**
     * POST /spaces/{space}/remind - toggle my reminder.
     *
     * Idempotent in both directions: tapping Remind twice leaves one row, and
     * tapping it off twice leaves none. The unique index is the real guard -
     * two taps racing each other both end up with the same single row rather
     * than a duplicate-key 500.
     */
    public function toggle(Request $request, Space $space): JsonResponse
    {
        if ($space->status !== Space::STATUS_SCHEDULED) {
            return response()->json([
                'success' => false,
                'message' => 'That Space is not scheduled.',
            ], 422);
        }

        $userId  = $request->user()->id;
        $existing = SpaceReminder::where('space_id', $space->id)->where('user_id', $userId)->first();

        if ($existing) {
            $existing->delete();
            $reminded = false;
        } else {
            try {
                SpaceReminder::create(['space_id' => $space->id, 'user_id' => $userId]);
            } catch (QueryException) {
                // Lost a race with our own second tap - the row exists, which is
                // exactly what this branch was trying to achieve.
            }
            $reminded = true;
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'reminded' => $reminded,
                'going'    => SpaceReminder::where('space_id', $space->id)->count(),
            ],
        ]);
    }

    /**
     * POST /spaces/{space}/replay - count a play and hand back the recording.
     *
     * The tally lives here rather than on the client because a count the client
     * owns is a count anyone can inflate.
     */
    public function play(Space $space): JsonResponse
    {
        if (! $space->isReplayable()) {
            return response()->json([
                'success' => false,
                'message' => 'That Space has no replay.',
            ], 404);
        }

        $space->increment('plays_count');

        return response()->json([
            'success' => true,
            'data'    => [
                // Raw object key, signed fresh - see SpaceController::replayResource's
                // comment; the same rule applies everywhere recording_url is read.
                'recording_url' => $space->recording_url
                    ? MediaPresignService::signedMediaUrl($space->recording_url)
                    : null,
                'plays'         => (int) $space->plays_count,
            ],
        ]);
    }
}
