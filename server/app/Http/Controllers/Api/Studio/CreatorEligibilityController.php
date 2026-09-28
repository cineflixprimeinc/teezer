<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\CreatorApplication;
use App\Models\CreatorProgress;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CreatorEligibilityController extends Controller
{
    /* ── Minimum thresholds ─────────────────────────────────────────────── */
    private const MIN_VIDEOS    = 3;
    private const MIN_VIEWS     = 500;
    private const MIN_FOLLOWERS = 300;
    private const MIN_AGE_DAYS  = 7;

    /* ── GET /studio/become-creator ─────────────────────────────────────── */
    public function eligibility(Request $request): JsonResponse
    {
        $user    = $request->user();
        $profile = $user->profile;

        // ── 1. Email or phone verified ────────────────────────────────────
        $emailVerified = !is_null($user->email_verified_at) || !is_null($user->phone);

        // ── 2. Profile photo ──────────────────────────────────────────────
        $hasPhoto = !is_null($user->avatar);

        // ── 3. Bio and category ───────────────────────────────────────────
        $hasBio      = !empty(trim($user->bio ?? ''));
        $hasCategory = !empty($profile?->category ?? '');
        $bioCategory = $hasBio && $hasCategory;

        // ── 4. Account age ────────────────────────────────────────────────
        $ageDays = (int) floor((time() - $user->created_at->timestamp) / 86400);
        $ageOk   = $ageDays >= self::MIN_AGE_DAYS;

        // ── 5. Public videos count ────────────────────────────────────────
        $publicVideos = (int) Video::where('user_id', $user->id)
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->count();
        $videosOk = $publicVideos >= self::MIN_VIDEOS;

        // ── 6. Total views ────────────────────────────────────────────────
        $totalViews = (int) Video::where('user_id', $user->id)
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->sum('views_count');
        $viewsOk = $totalViews >= self::MIN_VIEWS;

        // ── 7. Followers ──────────────────────────────────────────────────
        $followers    = (int) ($profile?->total_followers ?? 0);
        $followersOk  = $followers >= self::MIN_FOLLOWERS;

        // ── 8. (removed) Content check ────────────────────────────────────
        // This used to require the latest 3 videos to have passed the
        // pre-publish content scan. That scan no longer runs, so
        // content_check_passed is null on every new upload - and because
        // eligibility requires EVERY criterion to pass, leaving it in place
        // would have made creator status permanently unreachable for anyone
        // whose three most recent videos were uploaded after its removal.

        // ── 9. No active policy violations ───────────────────────────────
        $noViolations = !$user->is_banned;

        // ── 10. Creator terms accepted ────────────────────────────────────
        $termsAccepted = !is_null($user->creator_terms_accepted_at);

        // ── Application status ────────────────────────────────────────────
        $application = CreatorApplication::where('user_id', $user->id)->first();
        $appStatus   = $application?->status ?? 'none';
        $rejectionReason = $application?->rejection_reason;

        // ── Build requirements list ───────────────────────────────────────
        $requirements = [
            [
                'key'      => 'email_verified',
                'label'    => 'Email or phone verified',
                'passed'   => $emailVerified,
                'display'  => $emailVerified ? 'Completed' : 'Not verified',
                'value'    => null,
                'required' => null,
            ],
            [
                'key'      => 'profile_photo',
                'label'    => 'Profile photo added',
                'passed'   => $hasPhoto,
                'display'  => $hasPhoto ? 'Completed' : 'Add a photo',
                'value'    => null,
                'required' => null,
            ],
            [
                'key'      => 'bio_category',
                'label'    => 'Bio and category completed',
                'passed'   => $bioCategory,
                'display'  => $bioCategory ? 'Completed' : (!$hasBio ? 'Add bio' : 'Add category'),
                'value'    => null,
                'required' => null,
            ],
            [
                'key'      => 'account_age',
                'label'    => 'Account age: at least ' . self::MIN_AGE_DAYS . ' days',
                'passed'   => $ageOk,
                'display'  => $ageDays . ' days',
                'value'    => $ageDays,
                'required' => self::MIN_AGE_DAYS,
            ],
            [
                'key'      => 'public_videos',
                'label'    => 'At least ' . self::MIN_VIDEOS . ' public videos uploaded',
                'passed'   => $videosOk,
                'display'  => $publicVideos . ' / ' . self::MIN_VIDEOS,
                'value'    => $publicVideos,
                'required' => self::MIN_VIDEOS,
            ],
            [
                'key'      => 'total_views',
                'label'    => 'Minimum ' . self::MIN_VIEWS . ' total views',
                'passed'   => $viewsOk,
                'display'  => $totalViews . ' / ' . self::MIN_VIEWS,
                'value'    => $totalViews,
                'required' => self::MIN_VIEWS,
            ],
            [
                'key'      => 'followers',
                'label'    => 'Minimum ' . self::MIN_FOLLOWERS . ' followers',
                'passed'   => $followersOk,
                'display'  => $followers . ' / ' . self::MIN_FOLLOWERS,
                'value'    => $followers,
                'required' => self::MIN_FOLLOWERS,
            ],
            [
                'key'      => 'no_violations',
                'label'    => 'No active policy violations',
                'passed'   => $noViolations,
                'display'  => $noViolations ? 'Clear' : 'Violation active',
                'value'    => null,
                'required' => null,
            ],
            [
                'key'      => 'terms_accepted',
                'label'    => 'Creator Terms accepted',
                'passed'   => $termsAccepted,
                'display'  => $termsAccepted ? 'Accepted' : 'Pending',
                'value'    => null,
                'required' => null,
            ],
        ];

        $completedCount = collect($requirements)->filter(fn ($r) => $r['passed'])->count();
        $totalCount     = count($requirements);
        $isEligible     = $completedCount === $totalCount;

        return response()->json([
            'success'          => true,
            'data' => [
                'is_creator'       => $user->role === 'creator',
                'application_status' => $appStatus,
                'rejection_reason' => $rejectionReason,
                'requirements'     => $requirements,
                'completed_count'  => $completedCount,
                'total_count'      => $totalCount,
                'is_eligible'      => $isEligible,
                'stats'            => [
                    'public_videos' => $publicVideos,
                    'total_views'   => $totalViews,
                    'followers'     => $followers,
                    'account_age'   => $ageDays,
                ],
            ],
        ]);
    }

    /* ── POST /studio/become-creator/accept-terms ──────────────────────── */
    public function acceptTerms(Request $request): JsonResponse
    {
        $request->user()->update(['creator_terms_accepted_at' => now()]);

        return response()->json(['success' => true, 'message' => 'Creator Terms accepted.']);
    }

    /* ── POST /studio/become-creator/apply ─────────────────────────────── */
    public function apply(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role === 'creator') {
            return response()->json(['success' => false, 'message' => 'You are already a Creator.'], 422);
        }

        // Re-run all 10 eligibility checks
        $profile      = $user->profile;
        $ageDays      = (int) floor((time() - $user->created_at->timestamp) / 86400);
        $publicVideos = (int) Video::where('user_id', $user->id)->where('status', 'published')->whereNull('deleted_at')->count();
        $totalViews   = (int) Video::where('user_id', $user->id)->where('status', 'published')->whereNull('deleted_at')->sum('views_count');
        $followers    = (int) ($profile?->total_followers ?? 0);
        // The content_check criterion was removed along with the pre-publish
        // scan - see the note above. Keeping it here would have blocked every
        // application, since this list must be entirely true to apply.
        $checks = [
            'email_verified' => !is_null($user->email_verified_at) || !is_null($user->phone),
            'profile_photo'  => !is_null($user->avatar),
            'bio_category'   => !empty(trim($user->bio ?? '')) && !empty($profile?->category ?? ''),
            'account_age'    => $ageDays >= self::MIN_AGE_DAYS,
            'public_videos'  => $publicVideos >= self::MIN_VIDEOS,
            'total_views'    => $totalViews >= self::MIN_VIEWS,
            'followers'      => $followers >= self::MIN_FOLLOWERS,
            'no_violations'  => !$user->is_banned,
            'terms_accepted' => !is_null($user->creator_terms_accepted_at),
        ];

        if (in_array(false, $checks, true)) {
            $missing = array_keys(array_filter($checks, fn ($v) => !$v));
            return response()->json(['success' => false, 'message' => 'You do not meet all eligibility requirements yet.', 'missing' => $missing], 422);
        }

        DB::transaction(function () use ($user) {
            $user->forceFill(['role' => 'creator'])->save();
            CreatorProgress::firstOrCreate(
                ['user_id' => $user->id],
                ['current_level_id' => 1, 'current_xp' => 0, 'total_xp_earned' => 0],
            );
            CreatorApplication::updateOrCreate(
                ['user_id' => $user->id],
                ['status' => 'approved', 'rejection_reason' => null, 'applied_at' => now(), 'reviewed_at' => now(), 'reviewed_by' => null],
            );
        });

        return response()->json(['success' => true, 'message' => 'Congratulations! You are now a Creator. Welcome to the creator community!', 'is_creator' => true]);
    }
}
