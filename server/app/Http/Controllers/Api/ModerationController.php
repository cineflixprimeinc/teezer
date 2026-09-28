<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ScanImageJob;
use App\Jobs\ScanVideoJob;
use App\Models\CreatorStrike;
use App\Models\MediaModeration;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ModerationController extends Controller
{
    /**
     * GET /api/v1/media/{contentId}/moderation-status
     * Returns the moderation status for a video the authenticated user owns.
     */
    public function status(Request $request, int $contentId): JsonResponse
    {
        $video = Video::findOrFail($contentId);

        // Only owner or admin may query status
        $user = $request->user();
        if ($user->id !== $video->user_id && !$user->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $record = MediaModeration::where('content_id', $contentId)->latest()->first();

        return response()->json([
            'success' => true,
            'data'    => [
                'content_id'        => $contentId,
                'moderation_status' => $video->moderation_status,
                'scan_status'       => $record?->scan_status ?? 'not_scanned',
                'scanned_at'        => $record?->scanned_at?->toISOString(),
                'user_message'      => $this->userMessage($video->moderation_status),
            ],
        ]);
    }

    /**
     * POST /api/v1/moderation/rescan/{contentId}
     * Re-scans content (triggered by report or admin).
     * Authenticated user must own the content, or be admin.
     */
    public function rescan(Request $request, int $contentId): JsonResponse
    {
        $video = Video::findOrFail($contentId);

        $user = $request->user();
        if ($user->id !== $video->user_id && !$user->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        if (!config('moderation.enabled', true)) {
            return response()->json(['success' => false, 'message' => 'Moderation is disabled.'], 503);
        }

        $video->update(['moderation_status' => 'pending']);

        $mime    = $video->mime_type ?? '';
        $isImage = in_array($mime, config('moderation.image_mimes', []));

        if ($isImage) {
            ScanImageJob::dispatch($video)->onQueue('moderation');
        } else {
            ScanVideoJob::dispatch($video->fresh())->onQueue('moderation');
        }

        return response()->json([
            'success' => true,
            'message' => 'Content has been queued for re-scan.',
        ]);
    }

    /**
     * POST /api/v1/moderation/appeal - submit an appeal against the caller's
     * own most recent active strike.
     *
     * Built for Global Teezer Control's appeal_submission_enabled - the
     * appeal_status/appeal_note/appealed_at columns already existed on
     * CreatorStrike (an admin could resolve/dismiss an appeal via
     * AdminUser360Controller), but nothing let a user actually submit one.
     * Gated via EnsureGlobalControlEnabled (route api.v1.moderation.appeal).
     */
    public function submitAppeal(Request $request): JsonResponse
    {
        $request->validate([
            'note' => ['required', 'string', 'min:10', 'max:1000'],
        ]);

        // Deliberately NOT filtered by appeal_status in the query - the
        // eligibility filter has to be a branch AFTER finding the strike,
        // not part of the WHERE, or a strike sitting at appeal_status=
        // 'pending' would be invisible to this query and a second appeal
        // attempt would wrongly report "no strike" instead of "already
        // pending" (the query filter and the status check were fighting
        // each other on first pass - this version fixes that).
        $strike = CreatorStrike::where('user_id', $request->user()->id)
            ->active()
            ->latest('issued_at')
            ->first();

        if (! $strike) {
            return response()->json([
                'success' => false,
                'message' => 'You have no active strike eligible for appeal.',
            ], 404);
        }

        if ($strike->appeal_status === 'pending') {
            return response()->json([
                'success' => false,
                'message' => 'An appeal for this strike is already pending review.',
            ], 422);
        }

        // A resolved appeal is a final decision, not a rejection to retry
        // indefinitely - only null (never appealed) or dismissed (admin
        // closed it without a ruling, explicitly allowing resubmission) can
        // be appealed again.
        if ($strike->appeal_status === 'resolved') {
            return response()->json([
                'success' => false,
                'message' => 'This strike has already been reviewed and the decision is final.',
            ], 422);
        }

        $strike->update([
            'appeal_status' => 'pending',
            'appeal_note'   => $request->input('note'),
            'appealed_at'   => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Your appeal has been submitted for review.',
        ]);
    }

    private function userMessage(?string $status): string
    {
        return match ($status) {
            'pending', 'scanning' => 'Your upload is being checked for safety.',
            'pending_review'      => 'Your upload is under review and will be visible after approval.',
            'rejected'            => 'This upload could not be published because it may violate Teezer safety rules.',
            default               => 'Your upload has been published.',
        };
    }
}
