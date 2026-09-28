<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccountDeletionRequest;
use App\Models\AdAccount;
use App\Models\AdCampaign;
use App\Models\AdCreative;
use App\Models\AdGroup;
use App\Models\AdLedgerEntry;
use App\Models\AdStatDaily;
use App\Models\AdminActionLog;
use App\Models\AdminUserNote;
use App\Models\AppNotification;
use App\Models\BlockedUser;
use App\Models\CreatorEarning;
use App\Models\CreatorMonetizationStatus;
use App\Models\CreatorPayout;
use App\Models\CreatorPayoutMethod;
use App\Models\CreatorProgress;
use App\Models\CreatorWallet;
use App\Models\TaxForm;
use App\Services\Ads\AdBillingService;
use App\Services\StorageService;
use App\Models\DataDownloadRequest;
use App\Models\User;
use App\Models\UserHiddenWord;
use App\Models\UserModerationSetting;
use App\Models\UserPermissionSetting;
use App\Models\Video;
use App\Models\VideoReport;
use App\Models\VideoView;
use App\Models\UserReport;
use App\Mail\AdminActionMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class AdminUser360Controller extends Controller
{
    // ── System notification helper ────────────────────────────────────────────

    private function notify(int $userId, string $title, string $message): void
    {
        AppNotification::create([
            'user_id'     => $userId,
            'actor_id'    => null,
            'type'        => 'system',
            'entity_type' => 'admin_account_update',
            'entity_id'   => $userId,
            'message'     => $title . ': ' . $message,
            'is_read'     => false,
        ]);
    }

    private function notifyBoolToggle(
        int    $userId,
        array  $old,
        array  $new,
        string $field,
        string $onTitle,  string $onMsg,
        string $offTitle, string $offMsg
    ): void {
        if (!array_key_exists($field, $new)) return;
        $wasOn = (bool) ($old[$field] ?? false);
        $isOn  = (bool) $new[$field];
        if ($wasOn === $isOn) return;
        $this->notify($userId, $isOn ? $onTitle : $offTitle, $isOn ? $onMsg : $offMsg);
    }

    // ── Full 360 profile ──────────────────────────────────────────────────────

    public function show(int $id): JsonResponse
    {
        $disk = config('filesystems.default', 'local');

        $user = User::with([
            'profile',
            'wallet',
            'devices',
            'creatorProgress.level',
            'verificationRequests' => fn ($q) => $q->latest()->limit(1),
            'socialLinks',
        ])
        ->withCount(['videos', 'followers', 'following'])
        ->findOrFail($id);

        // ── Content summary ────────────────────────────────────────────────
        $totalVideos     = $user->videos()->count();
        $publishedVideos = $user->videos()->where('status', 'published')->count();
        $draftVideos     = $user->videos()->where('status', 'draft')->count();
        $privateVideos   = $user->videos()->where('status', 'private')->count();
        $totalViews      = $user->videos()->sum('views_count');
        $totalLikes      = $user->videos()->sum('likes_count');
        $totalComments   = $user->videos()->sum('comments_count');
        $avgViews        = $totalVideos > 0 ? round($totalViews / $totalVideos) : 0;
        $totalActiveDays = (int) $user->created_at->diffInDays(now());

        // ── Watch time (seconds → minutes) ────────────────────────────────
        $watchTimeSecs = VideoView::whereHas('video', fn ($q) => $q->where('user_id', $id))
            ->sum('watch_duration');
        $watchTimeMins = round($watchTimeSecs / 60);

        // ── Quick stats with 7-day trend ───────────────────────────────────
        $now    = now();
        $week   = $now->copy()->subDays(7);
        $prevWk = $now->copy()->subDays(14);

        $viewsCurrent = VideoView::whereHas('video', fn ($q) => $q->where('user_id', $id))
            ->whereBetween('created_at', [$week, $now])->count();
        $viewsPrev    = VideoView::whereHas('video', fn ($q) => $q->where('user_id', $id))
            ->whereBetween('created_at', [$prevWk, $week])->count();
        $viewsPct     = $viewsPrev > 0 ? round(($viewsCurrent - $viewsPrev) / $viewsPrev * 100, 1) : 0;

        $interactionsCurrent = $user->videos()->sum('likes_count') + $user->videos()->sum('comments_count');

        // ── 7-day daily sparkline ──────────────────────────────────────────
        $sparkViews = VideoView::whereHas('video', fn ($q) => $q->where('user_id', $id))
            ->where('created_at', '>=', $week)
            ->selectRaw('created_at::date as day, COUNT(*) as cnt')
            ->groupBy('day')
            ->orderBy('day')
            ->pluck('cnt', 'day')
            ->toArray();

        // ── User preferences counts ───────────────────────────────────────
        $blockedCount          = BlockedUser::where('blocker_id', $id)->count();
        $hiddenWordsCount      = UserHiddenWord::where('user_id', $id)->count();
        $dataRequestsCount     = DataDownloadRequest::where('user_id', $id)->count();
        $deletionRequestsCount = AccountDeletionRequest::where('user_id', $id)->count();

        // ── Reports summary ────────────────────────────────────────────────
        $reportsReceived = VideoReport::whereHas('video', fn ($q) => $q->where('user_id', $id))->count();
        $reportsOpen     = VideoReport::whereHas('video', fn ($q) => $q->where('user_id', $id))
            ->where('status', 'pending')->count();
        $contentRemoved  = $user->videos()->withTrashed()->whereNotNull('deleted_at')->count();
        $userReports     = UserReport::where('reported_user_id', $id)->count();

        // ── Moderation & permission settings ──────────────────────────────
        $modSettings  = UserModerationSetting::forUser($id);
        $permSettings = UserPermissionSetting::forUser($id);

        // ── Admin notes ────────────────────────────────────────────────────
        $notes = AdminUserNote::with('admin:id,name,username')
            ->where('user_id', $id)
            ->latest()
            ->get()
            ->map(fn ($n) => [
                'id'         => $n->id,
                'note'       => $n->note,
                'created_at' => $n->created_at->toIso8601String(),
                'updated_at' => $n->updated_at->toIso8601String(),
                'admin'      => ['id' => $n->admin->id, 'name' => $n->admin->name],
            ]);

        // ── Admin action timeline ──────────────────────────────────────────
        $timeline = AdminActionLog::with('admin:id,name,username')
            ->where('target_type', 'user')
            ->where('target_id', $id)
            ->latest()
            ->limit(50)
            ->get()
            ->map(fn ($t) => [
                'id'          => $t->id,
                'action'      => $t->action,
                'description' => $t->description,
                'severity'    => $t->severity,
                'ip_address'  => $t->ip_address,
                'created_at'  => $t->created_at->toIso8601String(),
                'admin'       => $t->admin ? ['id' => $t->admin->id, 'name' => $t->admin->name] : null,
                'reference'   => 'ADM-' . str_pad($t->id, 5, '0', STR_PAD_LEFT),
            ]);

        // ── Risk / Health calculation (detailed formula) ──────────────────
        $rh_emailVerified   = !empty($user->email_verified_at);
        $rh_phoneVerified   = !empty($user->phone);
        $rh_profileComplete = !empty($user->avatar)
                           && !empty($user->name)
                           && !empty($user->username)
                           && !empty($user->bio)
                           && !empty($user->categories);
        $rh_activeStrikes   = (int)  ($modSettings->strike_count       ?? 0);
        $rh_copyright       = (bool) ($modSettings->copyright_hold     ?? false);
        $rh_nsfw            = (bool) ($modSettings->nsfw_review_required ?? false);
        $rh_shadowban       = (bool) ($modSettings->shadowban           ?? false);
        $rh_prevSuspension  = $user->is_banned || (bool) ($modSettings->temporary_suspension ?? false);
        $rh_policyViolation = $rh_activeStrikes > 0;
        $rh_reportsMonth    = UserReport::where('reported_user_id', $id)
                                ->where('created_at', '>=', now()->startOfMonth())->count();

        $riskScore = 0;
        if (!$rh_profileComplete)   $riskScore += 10;
        if (!$rh_emailVerified)     $riskScore += 15;
        if (!$rh_phoneVerified)     $riskScore += 10;
        if ($rh_policyViolation)    $riskScore += 25;
        $riskScore += min(20, $rh_activeStrikes * 20);
        $riskScore += min(20, $rh_reportsMonth  * 2);
        if ($rh_copyright)          $riskScore += 25;
        if ($rh_nsfw)               $riskScore += 20;
        if ($rh_prevSuspension)     $riskScore += 15;
        if ($rh_shadowban)          $riskScore += 20;
        $riskScore = min(100, $riskScore);

        if      ($riskScore <= 20)  $riskLabel = 'Low Risk';
        elseif  ($riskScore <= 50)  $riskLabel = 'Medium Risk';
        elseif  ($riskScore <= 75)  $riskLabel = 'High Risk';
        else                        $riskLabel = 'Critical Risk';

        $rh_noViolations    = $rh_activeStrikes === 0 && !$rh_copyright && !$rh_nsfw;
        $accountHealth      = ($rh_profileComplete  ? 25 : 0)
                            + ($rh_emailVerified    ? 25 : 0)
                            + ($rh_phoneVerified    ? 20 : 0)
                            + ($rh_noViolations     ? 30 : 0);

        if      ($accountHealth >= 90) $healthLabel = 'Excellent';
        elseif  ($accountHealth >= 70) $healthLabel = 'Good';
        elseif  ($accountHealth >= 50) $healthLabel = 'Fair';
        else                           $healthLabel = 'Poor';

        // ── Profile completeness (legacy breakdown) ────────────────────────
        $completeness = [
            'avatar'   => !empty($user->avatar),
            'bio'      => !empty($user->bio),
            'email_ok' => $rh_emailVerified,
            'phone_ok' => $rh_phoneVerified,
            'complete' => round((
                (!empty($user->avatar) ? 25 : 0) +
                (!empty($user->bio)    ? 25 : 0) +
                ($rh_emailVerified     ? 25 : 0) +
                ($rh_phoneVerified     ? 25 : 0)
            )),
        ];

        // ── Last active ────────────────────────────────────────────────────
        $lastActive = $user->last_active_at;

        // ── Avatar URL ─────────────────────────────────────────────────────
        $avatarUrl = $user->avatar
            ? Storage::disk($disk)->url($user->avatar)
            : null;

        // ── Build moderation settings (includes safety prefs) ─────────────
        $modArr = $modSettings->toArray();

        return response()->json([
            'success' => true,
            'data'    => [
                'id'               => $user->id,
                'name'             => $user->name,
                'username'         => $user->username,
                'email'            => $user->email,
                'phone'            => $user->phone,
                'bio'              => $user->bio,
                'avatar'           => $avatarUrl,
                'role'             => $user->role,
                'is_verified'      => $user->is_verified,
                'is_active'        => $user->is_active,
                'is_banned'        => $user->is_banned,
                'is_private'       => $user->is_private,
                'ban_reason'       => $user->ban_reason,
                'date_of_birth'    => $user->date_of_birth?->toDateString(),
                'gender'           => $user->gender,
                'language'         => $user->language,
                'categories'       => $user->categories ?? [],
                'interests'        => $user->interests ?? [],
                'country'          => $user->country,
                'selected_country_code' => $user->selected_country_code,
                'selected_country_name' => $user->selected_country_name,
                'email_verified_at'=> $user->email_verified_at?->toIso8601String(),
                'created_at'       => $user->created_at->toIso8601String(),
                'last_active_at'     => $lastActive?->toIso8601String(),
                'last_login_at'      => $user->last_login_at?->toIso8601String(),
                'is_online'          => $lastActive && $lastActive->gte(now()->subMinutes(5)),
                'computed_status'    => ($lastActive && $lastActive->gte(now()->subMinutes(5))) ? 'online' : 'offline',
                'total_active_days'  => $totalActiveDays,
                'videos_count'       => $user->videos_count,
                'followers_count'  => $user->followers_count,
                'following_count'  => $user->following_count,
                'profile'          => $user->profile ? [
                    'total_followers' => $user->profile->total_followers,
                    'total_following' => $user->profile->total_following,
                    'total_likes'     => $user->profile->total_likes,
                    'total_videos'    => $user->profile->total_videos,
                    'profile_views'   => $user->profile->profile_views,
                    'location'        => $user->profile->location,
                    'creator_badge'   => $user->profile->creator_badge,
                ] : null,
                'wallet' => $user->wallet ? [
                    'balance'               => $user->wallet->balance,
                    'coins_balance'         => $user->wallet->coins_balance,
                    'gift_earnings'         => $user->wallet->gift_earnings,
                    'subscription_earnings' => $user->wallet->subscription_earnings,
                    'ad_earnings'           => $user->wallet->ad_earnings,
                    'total_withdrawn'       => $user->wallet->total_withdrawn,
                ] : null,
                'creator_level' => $user->role === 'creator' && $user->creatorProgress ? [
                    'level_number' => $user->creatorProgress->level?->id ?? 1,
                    'level_name'   => $user->creatorProgress->level?->level_name ?? 'Newcomer',
                    'current_xp'   => $user->creatorProgress->current_xp,
                    'total_xp'     => $user->creatorProgress->total_xp_earned,
                    'max_xp'       => $user->creatorProgress->level?->max_xp,
                ] : null,
                'verification' => $user->verificationRequests->first(),
                'devices' => $user->devices->map(fn ($d) => [
                    'id'          => $d->id,
                    'device_type' => $d->device_type,
                    'device_id'   => $d->device_id,
                    'last_seen'   => $d->last_seen,
                ]),
                'content_summary' => [
                    'total_videos'     => $totalVideos,
                    'published_videos' => $publishedVideos,
                    'draft_videos'     => $draftVideos,
                    'private_videos'   => $privateVideos,
                    'total_views'      => $totalViews,
                    'total_likes'      => $totalLikes,
                    'total_comments'   => $totalComments,
                    'avg_views'        => $avgViews,
                    'watch_time_mins'  => $watchTimeMins,
                ],
                'quick_stats' => [
                    'public_views' => ['total' => $viewsCurrent,        'pct' => $viewsPct, 'spark' => array_values($sparkViews)],
                    'interactions' => ['total' => $interactionsCurrent, 'pct' => 0.0,       'spark' => []],
                    'video_views'  => ['total' => $totalViews,           'pct' => $viewsPct, 'spark' => []],
                    'watch_time'   => ['total' => $watchTimeMins,        'pct' => 0.0,       'spark' => []],
                ],
                'reports_received'    => $reportsReceived,
                'user_reports'        => $userReports,
                'reports_open'        => $reportsOpen,
                'content_removed'     => $contentRemoved,
                'policy_violations'   => $modSettings->strike_count,
                'open_appeals'        => $modSettings->appeal_status === 'pending' ? 1 : 0,
                'risk_score'          => $riskScore,
                'risk_label'          => $riskLabel,
                'account_health'      => $accountHealth,
                'health_label'        => $healthLabel,
                'health_checks'       => [
                    'profile_completeness' => $rh_profileComplete,
                    'email_verified'       => $rh_emailVerified,
                    'phone_verified'       => $rh_phoneVerified,
                    'no_policy_violations' => $rh_noViolations,
                ],
                'profile_completeness'=> $completeness,
                'default_upload_limit'          => $user->defaultUploadLimit(),
                'blocked_count'                 => $blockedCount,
                'hidden_words_count'            => $hiddenWordsCount,
                'data_download_requests_count'  => $dataRequestsCount,
                'deletion_requests_count'       => $deletionRequestsCount,
                'moderation_settings' => $modArr,
                'permission_settings' => $permSettings->toArray(),
                'admin_notes'         => $notes,
                'timeline'            => $timeline,
            ],
        ]);
    }

    // ── Standalone Risk + Health endpoint ────────────────────────────────────

    public function riskHealth(int $id): JsonResponse
    {
        $user        = User::findOrFail($id);
        $modSettings = UserModerationSetting::forUser($id);

        $emailVerified   = !empty($user->email_verified_at);
        $phoneVerified   = !empty($user->phone);
        $profileComplete = !empty($user->avatar)
                        && !empty($user->name)
                        && !empty($user->username)
                        && !empty($user->bio)
                        && !empty($user->categories);
        $activeStrikes   = (int)  ($modSettings->strike_count        ?? 0);
        $copyright       = (bool) ($modSettings->copyright_hold      ?? false);
        $nsfw            = (bool) ($modSettings->nsfw_review_required ?? false);
        $shadowban       = (bool) ($modSettings->shadowban            ?? false);
        $prevSuspension  = $user->is_banned || (bool) ($modSettings->temporary_suspension ?? false);
        $policyViolation = $activeStrikes > 0;
        $reportsMonth    = UserReport::where('reported_user_id', $id)
                            ->where('created_at', '>=', now()->startOfMonth())->count();

        $riskScore = 0;
        if (!$profileComplete) $riskScore += 10;
        if (!$emailVerified)   $riskScore += 15;
        if (!$phoneVerified)   $riskScore += 10;
        if ($policyViolation)  $riskScore += 25;
        $riskScore += min(20, $activeStrikes * 20);
        $riskScore += min(20, $reportsMonth  * 2);
        if ($copyright)        $riskScore += 25;
        if ($nsfw)             $riskScore += 20;
        if ($prevSuspension)   $riskScore += 15;
        if ($shadowban)        $riskScore += 20;
        $riskScore = min(100, $riskScore);

        if      ($riskScore <= 20) $riskLabel = 'Low Risk';
        elseif  ($riskScore <= 50) $riskLabel = 'Medium Risk';
        elseif  ($riskScore <= 75) $riskLabel = 'High Risk';
        else                       $riskLabel = 'Critical Risk';

        $noViolations  = $activeStrikes === 0 && !$copyright && !$nsfw;
        $accountHealth = ($profileComplete ? 25 : 0)
                       + ($emailVerified   ? 25 : 0)
                       + ($phoneVerified   ? 20 : 0)
                       + ($noViolations    ? 30 : 0);

        if      ($accountHealth >= 90) $healthLabel = 'Excellent';
        elseif  ($accountHealth >= 70) $healthLabel = 'Good';
        elseif  ($accountHealth >= 50) $healthLabel = 'Fair';
        else                           $healthLabel = 'Poor';

        return response()->json([
            'success' => true,
            'data'    => [
                'riskScore'     => $riskScore,
                'riskLabel'     => $riskLabel,
                'accountHealth' => $accountHealth,
                'healthLabel'   => $healthLabel,
                'checks'        => [
                    'profileCompleteness' => $profileComplete,
                    'emailVerified'       => $emailVerified,
                    'phoneVerified'       => $phoneVerified,
                    'noPolicyViolations'  => $noViolations,
                ],
                'riskFactors'   => [
                    'profileIncomplete'     => !$profileComplete,
                    'emailNotVerified'      => !$emailVerified,
                    'phoneNotVerified'      => !$phoneVerified,
                    'activePolicyViolation' => $policyViolation,
                    'activeStrikes'         => $activeStrikes,
                    'reportsThisMonth'      => $reportsMonth,
                    'copyrightStrike'       => $copyright,
                    'nsfwViolation'         => $nsfw,
                    'spamDetected'          => false,
                    'previousSuspension'    => $prevSuspension,
                    'shadowbanActive'       => $shadowban,
                ],
            ],
        ]);
    }

    // ── Quick stats with period filter ───────────────────────────────────────

    /**
     * GET /api/v1/admin/users/{id}/quick-stats
     *
     * Feeds the Quick Stats card on the 360 profile.
     *
     * Previously three of the four figures were not measurements:
     * `interactions` summed each video's LIFETIME likes_count + comments_count
     * filtered by videos.updated_at, so editing an old post moved its entire
     * historical engagement into "this week"; and both interactions and watch
     * time returned a hardcoded pct of 0.0 with an empty spark, which the UI's
     * Sparkline then replaced with mockSpark() - a generated line that looks
     * exactly like real data. All four are now counted over the period they
     * claim to describe, with a real previous-period delta and a real series.
     */
    public function quickStats(Request $request, int $id): JsonResponse
    {
        User::findOrFail($id);

        $period = $request->get('period', '30d');
        $days   = match ($period) {
            '7d'  => 7,
            '90d' => 90,
            'all' => 3650,
            default => 30,
        };

        $end   = now();
        $start = $end->copy()->subDays($days);
        $prev  = $start->copy()->subDays($days);

        $videoIds = Video::where('user_id', $id)->pluck('id');

        if ($videoIds->isEmpty()) {
            $zero = ['total' => 0, 'pct' => 0.0, 'spark' => []];

            return response()->json([
                'success' => true,
                'data'    => [
                    'period'       => $period,
                    'public_views' => $zero,
                    'interactions' => $zero,
                    'video_views'  => $zero,
                    'watch_time'   => $zero,
                ],
            ]);
        }

        $sparkDays = min($days, 30);
        $sparkFrom = $end->copy()->subDays($sparkDays);

        $viewsNow  = VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->count();
        $viewsPrev = VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$prev, $start])->count();

        $watchNow  = (int) VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->sum('watch_duration');
        $watchPrev = (int) VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$prev, $start])->sum('watch_duration');

        // Rows created in the window, not lifetime counters read at a point in
        // time - the difference between "engagement this month" and "all the
        // engagement any post of theirs has ever had".
        $countIn = function (string $table, $from, $to, bool $skipTrashed = false) use ($videoIds) {
            $q = DB::table($table)->whereIn('video_id', $videoIds)->whereBetween('created_at', [$from, $to]);
            if ($skipTrashed) {
                $q->whereNull('deleted_at');
            }

            return $q->count();
        };

        $interNow = $countIn('video_likes', $start, $end)
            + $countIn('video_comments', $start, $end, true)
            + $countIn('video_shares', $start, $end);

        $interPrev = $countIn('video_likes', $prev, $start)
            + $countIn('video_comments', $prev, $start, true)
            + $countIn('video_shares', $prev, $start);

        $viewsDaily = $this->dailyBuckets(VideoView::whereIn('video_id', $videoIds), $sparkFrom, $end);

        $watchDaily = $this->fillDays(
            VideoView::whereIn('video_id', $videoIds)
                ->where('created_at', '>=', $sparkFrom)
                ->selectRaw('created_at::date as day, COALESCE(SUM(watch_duration),0) as cnt')
                ->groupBy('day')->pluck('cnt', 'day')->toArray(),
            $sparkFrom, $end
        );

        $likesDaily    = $this->dailyBucketsTable('video_likes',    $videoIds, $sparkFrom, $end);
        $commentsDaily = $this->dailyBucketsTable('video_comments', $videoIds, $sparkFrom, $end, true);
        $sharesDaily   = $this->dailyBucketsTable('video_shares',   $videoIds, $sparkFrom, $end);

        $interDaily = [];
        foreach ($viewsDaily as $day => $_) {
            $interDaily[] = (int) ($likesDaily[$day] ?? 0)
                + (int) ($commentsDaily[$day] ?? 0)
                + (int) ($sharesDaily[$day] ?? 0);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'period' => $period,
                // public_views and video_views have always been the same
                // measurement under two labels; left as found rather than
                // quietly redefining a figure someone may be reading.
                'public_views' => $this->metric($viewsNow, $viewsPrev, array_values($viewsDaily)),
                'interactions' => $this->metric($interNow, $interPrev, $interDaily),
                'video_views'  => $this->metric($viewsNow, $viewsPrev, array_values($viewsDaily)),
                'watch_time'   => $this->metric(
                    (int) round($watchNow / 60),
                    (int) round($watchPrev / 60),
                    array_map(fn ($s) => (int) round($s / 60), array_values($watchDaily))
                ),
            ],
        ]);
    }

    /**
     * GET /api/v1/admin/users/{id}/analytics?period=7d|30d|90d|all
     *
     * Per-user analytics for the 360 profile's Analytics tab, which until now
     * rendered the admin action timeline - useful, but not analytics, and not
     * what the tab claimed to be.
     *
     * Every headline figure carries its own previous-period comparison and a
     * daily series. quickStats() next door returns 0.0 and an empty spark for
     * interactions and watch time; this does not, because a flat line an
     * operator cannot distinguish from real inactivity is worse than no chart.
     *
     * All buckets are built by walking a date-keyed skeleton so days with no
     * activity come back as 0 rather than being absent - a chart that silently
     * omits empty days compresses time and misreads as continuous activity.
     */
    public function analytics(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        $period = $request->get('period', '30d');
        $days   = match ($period) {
            '7d'  => 7,
            '90d' => 90,
            'all' => 3650,
            default => 30,
        };

        $end   = now();
        $start = $end->copy()->subDays($days);
        $prev  = $start->copy()->subDays($days);

        $videoIds = Video::where('user_id', $id)->pluck('id');

        // Empty account: return the same shape with zeroes rather than letting
        // the aggregates below run against an empty whereIn.
        if ($videoIds->isEmpty()) {
            return response()->json([
                'success' => true,
                'data'    => $this->emptyAnalytics($period, $days, $user),
            ]);
        }

        /* ── Headline counters ─────────────────────────────────────────── */
        $viewsNow  = VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->count();
        $viewsPrev = VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$prev, $start])->count();

        $watchNow  = (int) VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->sum('watch_duration');
        $watchPrev = (int) VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$prev, $start])->sum('watch_duration');

        $likesNow  = DB::table('video_likes')->whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->count();
        $likesPrev = DB::table('video_likes')->whereIn('video_id', $videoIds)->whereBetween('created_at', [$prev, $start])->count();

        $commentsNow  = DB::table('video_comments')->whereIn('video_id', $videoIds)->whereNull('deleted_at')->whereBetween('created_at', [$start, $end])->count();
        $commentsPrev = DB::table('video_comments')->whereIn('video_id', $videoIds)->whereNull('deleted_at')->whereBetween('created_at', [$prev, $start])->count();

        $sharesNow  = DB::table('video_shares')->whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->count();
        $sharesPrev = DB::table('video_shares')->whereIn('video_id', $videoIds)->whereBetween('created_at', [$prev, $start])->count();

        $followsNow  = DB::table('followers')->where('following_id', $id)->whereBetween('created_at', [$start, $end])->count();
        $followsPrev = DB::table('followers')->where('following_id', $id)->whereBetween('created_at', [$prev, $start])->count();

        $postedNow  = Video::where('user_id', $id)->whereBetween('created_at', [$start, $end])->count();
        $postedPrev = Video::where('user_id', $id)->whereBetween('created_at', [$prev, $start])->count();

        $interNow  = $likesNow + $commentsNow + $sharesNow;
        $interPrev = $likesPrev + $commentsPrev + $sharesPrev;

        // Engagement rate is interactions per view. Undefined without views -
        // reported as 0.0 rather than dividing by zero.
        $engNow  = $viewsNow  > 0 ? round($interNow  / $viewsNow  * 100, 2) : 0.0;
        $engPrev = $viewsPrev > 0 ? round($interPrev / $viewsPrev * 100, 2) : 0.0;

        /* ── Daily series ──────────────────────────────────────────────── */
        $sparkDays = min($days, 30);
        $sparkFrom = $end->copy()->subDays($sparkDays);

        $viewsDaily    = $this->dailyBuckets(VideoView::whereIn('video_id', $videoIds), $sparkFrom, $end);
        $likesDaily    = $this->dailyBucketsTable('video_likes',    $videoIds, $sparkFrom, $end);
        $commentsDaily = $this->dailyBucketsTable('video_comments', $videoIds, $sparkFrom, $end, true);
        $sharesDaily   = $this->dailyBucketsTable('video_shares',   $videoIds, $sparkFrom, $end);

        $followsDaily = $this->fillDays(
            DB::table('followers')->where('following_id', $id)
                ->where('created_at', '>=', $sparkFrom)
                ->selectRaw('created_at::date as day, COUNT(*) as cnt')
                ->groupBy('day')->pluck('cnt', 'day')->toArray(),
            $sparkFrom, $end
        );

        $watchDaily = $this->fillDays(
            VideoView::whereIn('video_id', $videoIds)
                ->where('created_at', '>=', $sparkFrom)
                ->selectRaw('created_at::date as day, COALESCE(SUM(watch_duration),0) as cnt')
                ->groupBy('day')->pluck('cnt', 'day')->toArray(),
            $sparkFrom, $end
        );

        $series = [];
        foreach ($viewsDaily as $day => $v) {
            $series[] = [
                'date'     => $day,
                'views'    => (int) $v,
                'likes'    => (int) ($likesDaily[$day]    ?? 0),
                'comments' => (int) ($commentsDaily[$day] ?? 0),
                'shares'   => (int) ($sharesDaily[$day]   ?? 0),
                'follows'  => (int) ($followsDaily[$day]  ?? 0),
            ];
        }

        /* ── Top content in the period ─────────────────────────────────── */
        $topRows = VideoView::whereIn('video_id', $videoIds)
            ->whereBetween('created_at', [$start, $end])
            ->selectRaw('video_id, COUNT(*) as views, COALESCE(SUM(watch_duration),0) as watch')
            ->groupBy('video_id')->orderByDesc('views')->limit(10)->get();

        $topVideos = Video::whereIn('id', $topRows->pluck('video_id'))
            ->get(['id', 'caption', 'thumbnail_url', 'likes_count', 'comments_count', 'shares_count', 'duration', 'created_at'])
            ->keyBy('id');

        // Same storage-key resolution the content list does - a raw key renders
        // as a broken image.
        $disk = config('filesystems.default', 'r2');

        $topContent = $topRows->map(function ($r) use ($topVideos, $disk) {
            $v = $topVideos->get($r->video_id);
            if (! $v) {
                return null;
            }
            $inter = (int) $v->likes_count + (int) $v->comments_count + (int) $v->shares_count;
            $thumb = $v->thumbnail_url;

            return [
                'id'          => $v->id,
                'caption'     => $v->caption,
                'thumbnail'   => ($thumb && ! str_starts_with($thumb, 'http'))
                    ? Storage::disk($disk)->url($thumb)
                    : $thumb,
                'views'       => (int) $r->views,
                'likes'       => (int) $v->likes_count,
                'comments'    => (int) $v->comments_count,
                'shares'      => (int) $v->shares_count,
                'engagement'  => $r->views > 0 ? round($inter / $r->views * 100, 2) : 0.0,
                'avg_watch'   => $r->views > 0 ? round($r->watch / $r->views) : 0,
                'duration'    => (int) ($v->duration ?? 0),
                'posted_at'   => $v->created_at?->toIso8601String(),
            ];
        })->filter()->values()->all();

        /* ── Audience ──────────────────────────────────────────────────── */
        $byDimension = fn (string $col) => VideoView::whereIn('video_id', $videoIds)
            ->whereBetween('created_at', [$start, $end])
            ->whereNotNull($col)->where($col, '!=', '')
            ->selectRaw("$col as label, COUNT(*) as cnt")
            ->groupBy($col)->orderByDesc('cnt')->limit(8)
            ->get()->map(fn ($r) => ['label' => (string) $r->label, 'value' => (int) $r->cnt])->all();

        /* ── Posting-hour heatmap: when this user's views actually land ── */
        $heatRows = VideoView::whereIn('video_id', $videoIds)
            ->whereBetween('created_at', [$start, $end])
            ->selectRaw('EXTRACT(DOW FROM created_at) as dow, EXTRACT(HOUR FROM created_at) as hr, COUNT(*) as cnt')
            ->groupBy('dow', 'hr')->get();

        $heatmap = array_fill(0, 7, array_fill(0, 24, 0));
        foreach ($heatRows as $r) {
            $heatmap[(int) $r->dow][(int) $r->hr] = (int) $r->cnt;
        }

        /* ── Retention ─────────────────────────────────────────────────── */
        $avgWatch    = $viewsNow > 0 ? round($watchNow / $viewsNow, 1) : 0.0;
        $avgDuration = (float) Video::whereIn('id', $videoIds)->avg('duration');
        $completion  = $avgDuration > 0 ? min(100.0, round($avgWatch / $avgDuration * 100, 1)) : 0.0;

        return response()->json([
            'success' => true,
            'data'    => [
                'period'   => $period,
                'days'     => $days,
                'headline' => [
                    'views'        => $this->metric($viewsNow,  $viewsPrev,  array_values($viewsDaily)),
                    'watch_time'   => $this->metric((int) round($watchNow / 60), (int) round($watchPrev / 60), array_map(fn ($s) => (int) round($s / 60), array_values($watchDaily))),
                    'interactions' => $this->metric($interNow,  $interPrev,  array_map(
                        fn ($d) => $d['likes'] + $d['comments'] + $d['shares'], $series
                    )),
                    'followers'    => $this->metric($followsNow, $followsPrev, array_values($followsDaily)),
                    'posts'        => $this->metric($postedNow,  $postedPrev,  []),
                    'engagement'   => [
                        'total' => $engNow,
                        'pct'   => $engPrev > 0 ? round(($engNow - $engPrev) / $engPrev * 100, 1) : 0.0,
                        'spark' => [],
                    ],
                ],
                'series'      => $series,
                'top_content' => $topContent,
                'audience'    => [
                    'countries' => $byDimension('country'),
                    'devices'   => $byDimension('device_type'),
                    'sources'   => $byDimension('source'),
                ],
                'heatmap'   => $heatmap,
                'retention' => [
                    'avg_watch_seconds' => $avgWatch,
                    'avg_duration'      => round($avgDuration, 1),
                    'completion_pct'    => $completion,
                ],
                'totals' => [
                    'lifetime_views'    => (int) Video::where('user_id', $id)->sum('views_count'),
                    'lifetime_likes'    => (int) Video::where('user_id', $id)->sum('likes_count'),
                    'lifetime_comments' => (int) Video::where('user_id', $id)->sum('comments_count'),
                    'total_videos'      => $videoIds->count(),
                    'followers'         => (int) $user->followers()->count(),
                ],
            ],
        ]);
    }

    /** total + previous-period delta + spark, in one shape the UI can render blindly. */
    private function metric(int|float $now, int|float $prev, array $spark): array
    {
        return [
            'total' => $now,
            // No previous activity means there is no percentage to state. 0.0
            // is reported rather than a fabricated 100% jump from zero.
            'pct'   => $prev > 0 ? round(($now - $prev) / $prev * 100, 1) : 0.0,
            'spark' => array_values($spark),
        ];
    }

    /** Date-keyed counts for a VideoView query, zero-filled. */
    private function dailyBuckets($query, $from, $to): array
    {
        return $this->fillDays(
            $query->where('created_at', '>=', $from)
                ->selectRaw('created_at::date as day, COUNT(*) as cnt')
                ->groupBy('day')->pluck('cnt', 'day')->toArray(),
            $from, $to
        );
    }

    /** Same, for a plain table keyed by video_id. */
    private function dailyBucketsTable(string $table, $videoIds, $from, $to, bool $skipTrashed = false): array
    {
        $q = DB::table($table)->whereIn('video_id', $videoIds)->where('created_at', '>=', $from);
        if ($skipTrashed) {
            $q->whereNull('deleted_at');
        }

        return $this->fillDays(
            $q->selectRaw('created_at::date as day, COUNT(*) as cnt')->groupBy('day')->pluck('cnt', 'day')->toArray(),
            $from, $to
        );
    }

    /**
     * Zero-fills every day in the range.
     *
     * Postgres returns a date key that may arrive as a string or a date object
     * depending on driver settings, so both are normalised to Y-m-d before
     * being matched against the skeleton.
     */
    private function fillDays(array $rows, $from, $to): array
    {
        $normalised = [];
        foreach ($rows as $k => $v) {
            $normalised[substr((string) $k, 0, 10)] = $v;
        }

        $out    = [];
        $cursor = $from->copy()->startOfDay();
        $last   = $to->copy()->startOfDay();
        while ($cursor->lte($last)) {
            $key       = $cursor->format('Y-m-d');
            $out[$key] = (int) ($normalised[$key] ?? 0);
            $cursor->addDay();
        }

        return $out;
    }

    /** The same payload shape with nothing in it, for an account with no videos. */
    private function emptyAnalytics(string $period, int $days, User $user): array
    {
        $zero = ['total' => 0, 'pct' => 0.0, 'spark' => []];

        return [
            'period'   => $period,
            'days'     => $days,
            'headline' => [
                'views' => $zero, 'watch_time' => $zero, 'interactions' => $zero,
                'followers' => $zero, 'posts' => $zero, 'engagement' => $zero,
            ],
            'series'      => [],
            'top_content' => [],
            'audience'    => ['countries' => [], 'devices' => [], 'sources' => []],
            'heatmap'     => array_fill(0, 7, array_fill(0, 24, 0)),
            'retention'   => ['avg_watch_seconds' => 0.0, 'avg_duration' => 0.0, 'completion_pct' => 0.0],
            'totals'      => [
                'lifetime_views' => 0, 'lifetime_likes' => 0, 'lifetime_comments' => 0,
                'total_videos' => 0, 'followers' => (int) $user->followers()->count(),
            ],
        ];
    }

    /**
     * GET /api/v1/admin/users/{id}/security
     *
     * What the Security tab needs to show real state instead of dashes.
     *
     * Two things it deliberately gets right that the old read-only card did
     * not: 2FA status is read from two_factor_confirmed_at, which has existed
     * all along, and `user_devices` is reported as what it is - a table of
     * push-notification registrations - rather than as "linked devices",
     * which reads as login sessions and is not what that table holds.
     *
     * Active sessions are Sanctum personal access tokens, which is what an
     * app login actually creates. The token itself is never returned - only
     * its name, when it was last used, and enough to revoke it.
     */
    public function security(int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        $tokens = DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)
            ->where('tokenable_id', $id)
            ->orderByDesc('last_used_at')
            ->limit(50)
            ->get(['id', 'name', 'abilities', 'last_used_at', 'expires_at', 'created_at']);

        $now = now();

        $sessions = $tokens->map(fn ($t) => [
            'id'           => (int) $t->id,
            'name'         => $t->name,
            'last_used_at' => $t->last_used_at,
            'created_at'   => $t->created_at,
            'expires_at'   => $t->expires_at,
            'is_expired'   => $t->expires_at !== null && $t->expires_at < $now,
        ])->all();

        $pushDevices = DB::table('user_devices')
            ->where('user_id', $id)
            ->orderByDesc('updated_at')
            ->get(['id', 'platform', 'created_at', 'updated_at'])
            ->map(fn ($d) => [
                'id'         => (int) $d->id,
                'platform'   => $d->platform,
                // The device token is a push credential. It is never returned.
                'registered' => $d->created_at,
                'updated_at' => $d->updated_at,
            ])->all();

        $recoveryCodes = 0;
        if ($user->two_factor_recovery_codes) {
            try {
                $decoded = json_decode(decrypt($user->two_factor_recovery_codes), true);
                $recoveryCodes = is_array($decoded) ? count($decoded) : 0;
            } catch (\Throwable) {
                // An undecryptable blob means the app key rotated. Reported as
                // unknown rather than as zero, which would read as "used up".
                $recoveryCodes = -1;
            }
        }

        // Distinct login countries seen on this account's own viewing activity.
        // A spread of countries is the cheap signal of a shared or sold login.
        $countries = DB::table('video_views')
            ->where('user_id', $id)
            ->whereNotNull('country')->where('country', '!=', '')
            ->select('country')->distinct()->limit(10)->pluck('country')->all();

        return response()->json([
            'success' => true,
            'data'    => [
                'auth' => [
                    'email'             => $user->email,
                    'email_verified'    => $user->email_verified_at !== null,
                    'email_verified_at' => $user->email_verified_at?->toIso8601String(),
                    'phone'             => $user->phone,
                    // There is no phone-verification column on users - only the
                    // number itself. Reported as "on file" rather than as
                    // verified, which the old card implied by showing a
                    // "Verified" badge for any non-null phone.
                    'phone_on_file'     => $user->phone !== null && $user->phone !== '',
                    'two_factor'        => $user->two_factor_confirmed_at !== null,
                    'two_factor_since'  => $user->two_factor_confirmed_at?->toIso8601String(),
                    'recovery_codes'    => $recoveryCodes,
                    'password_changed_at' => $user->password_changed_at?->toIso8601String(),
                    'last_login_at'     => $user->last_login_at?->toIso8601String(),
                    'last_active_at'    => $user->last_active_at?->toIso8601String(),
                ],
                'access' => [
                    'is_active'       => (bool) $user->is_active,
                    'is_banned'       => (bool) $user->is_banned,
                    'ban_reason'      => $user->ban_reason,
                    'suspended_until' => $user->suspended_until?->toIso8601String(),
                    'is_private'      => (bool) $user->is_private,
                ],
                'sessions'     => $sessions,
                'push_devices' => $pushDevices,
                'location'     => [
                    'selected_country_code' => $user->selected_country_code,
                    'selected_country_name' => $user->selected_country_name,
                    'signup_country'        => $user->country,
                    'seen_countries'        => $countries,
                ],
            ],
        ]);
    }

    /**
     * POST /api/v1/admin/users/{id}/security/action
     *
     * Every action is logged with the admin's reason. `revoke_sessions` and
     * `disable_2fa` are the two that can lock a real person out of their own
     * account, so both are recorded at warning severity.
     */
    public function securityAction(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'action'   => ['required', 'string', 'in:revoke_sessions,revoke_session,disable_2fa,lock_account,unlock_account,require_email_verification,clear_push_devices'],
            'reason'   => ['nullable', 'string', 'max:500'],
            'token_id' => ['nullable', 'integer'],
        ]);

        $action = $validated['action'];
        $reason = $validated['reason'] ?? null;

        $message = match ($action) {
            'revoke_sessions' => (function () use ($id) {
                $n = DB::table('personal_access_tokens')
                    ->where('tokenable_type', User::class)->where('tokenable_id', $id)->delete();

                return "Signed out of {$n} session(s).";
            })(),

            'revoke_session' => (function () use ($request, $id) {
                $tokenId = $request->integer('token_id');
                abort_if($tokenId <= 0, 422, 'token_id is required.');
                // Scoped to this user so an id from another account cannot be
                // passed in and deleted.
                $n = DB::table('personal_access_tokens')
                    ->where('tokenable_type', User::class)->where('tokenable_id', $id)
                    ->where('id', $tokenId)->delete();

                return $n ? 'Session revoked.' : 'That session no longer exists.';
            })(),

            'disable_2fa' => (function () use ($user) {
                $user->forceFill([
                    'two_factor_secret'         => null,
                    'two_factor_recovery_codes' => null,
                    'two_factor_confirmed_at'   => null,
                ])->save();

                return 'Two-factor authentication disabled.';
            })(),

            'lock_account' => (function () use ($user, $id, $reason) {
                $user->forceFill(['is_active' => false])->save();
                // A locked account with live tokens is not locked - the app
                // keeps working until the token expires.
                DB::table('personal_access_tokens')
                    ->where('tokenable_type', User::class)->where('tokenable_id', $id)->delete();

                return 'Account locked and all sessions ended.';
            })(),

            'unlock_account' => (function () use ($user) {
                $user->forceFill(['is_active' => true])->save();

                return 'Account unlocked.';
            })(),

            'require_email_verification' => (function () use ($user) {
                $user->forceFill(['email_verified_at' => null])->save();

                return 'Email marked unverified - the user must verify again.';
            })(),

            'clear_push_devices' => (function () use ($id) {
                $n = DB::table('user_devices')->where('user_id', $id)->delete();

                return "Removed {$n} push registration(s).";
            })(),

            default => 'No change.',
        };

        AdminActionLog::record(
            admin: $request->user(),
            action: 'user.security.' . $action,
            category: 'security',
            description: 'User #' . $id . ' ' . str_replace('_', ' ', $action)
                . ($reason ? ': ' . $reason : ''),
            targetType: 'User',
            targetId: $id,
            metadata: ['action' => $action, 'token_id' => $validated['token_id'] ?? null],
            ip: $request->ip(),
            severity: in_array($action, ['revoke_sessions', 'disable_2fa', 'lock_account'], true) ? 'warning' : 'info',
        );

        return response()->json(['success' => true, 'message' => $message]);
    }

    /**
     * GET /api/v1/admin/users/{id}/reports?direction=received|made&status=&type=
     *
     * Every report about this account, in one list.
     *
     * Reports live in four different tables that grew separately: video_reports,
     * comment_reports and story_reports each have their own, and profile /
     * conversation / live-stream / space reports share the newer ContentReport
     * table keyed by reportable_type. The 360 profile needs the union of them
     * for one person, which no existing endpoint provides - the platform-wide
     * queue filters by type, not by who the report is about.
     *
     * user_reports is deliberately NOT read. It has admin review wiring but no
     * create path anywhere in the app, so it is empty in production; profile
     * reports are written to ContentReport by BlockController::report(). This
     * mirrors what AdminReportsController already concluded.
     *
     * Rows are normalised to one shape and merged in PHP rather than via SQL
     * UNION: the four tables disagree on column names (reporter_id vs
     * reporter_user_id, description vs details) and on status vocabulary, so a
     * union would need per-table aliasing anyway and would lose the ability to
     * eager-load each type's own relations.
     */
    public function reports(Request $request, int $id): JsonResponse
    {
        User::findOrFail($id);

        $direction = $request->get('direction', 'received') === 'made' ? 'made' : 'received';
        $status    = $request->get('status', 'all');
        $typeFilter = $request->get('type', 'all');

        $videoIds = Video::where('user_id', $id)->pluck('id');
        $rows     = collect();

        $wants = fn (string $t) => $typeFilter === 'all' || $typeFilter === $t;

        /* ── Videos ─────────────────────────────────────────────────────── */
        if ($wants('video')) {
            $q = DB::table('video_reports as r')
                ->join('videos as v', 'v.id', '=', 'r.video_id')
                ->leftJoin('users as u', 'u.id', '=', 'r.reporter_id')
                ->select([
                    'r.id', 'r.reason', 'r.description as details', 'r.status',
                    'r.created_at', 'r.reviewed_at', 'r.reporter_id',
                    'u.username as reporter_username', 'u.avatar as reporter_avatar',
                    'v.id as target_id', 'v.caption as target_label', 'v.thumbnail_url as target_thumb',
                    'v.user_id as owner_id',
                ]);

            $direction === 'made'
                ? $q->where('r.reporter_id', $id)
                : $q->whereIn('r.video_id', $videoIds);

            $rows = $rows->concat($q->get()->map(fn ($r) => $this->normaliseReport($r, 'video')));
        }

        /* ── Comments ───────────────────────────────────────────────────── */
        if ($wants('comment')) {
            $q = DB::table('comment_reports as r')
                ->leftJoin('video_comments as c', 'c.id', '=', 'r.comment_id')
                ->leftJoin('users as u', 'u.id', '=', 'r.reporter_user_id')
                ->select([
                    'r.id', 'r.reason', 'r.details', 'r.status',
                    'r.created_at', 'r.reviewed_at', 'r.reporter_user_id as reporter_id',
                    'u.username as reporter_username', 'u.avatar as reporter_avatar',
                    'c.id as target_id', 'c.body as target_label',
                    'r.comment_owner_id as owner_id', 'r.video_id as parent_video_id',
                ]);

            $direction === 'made'
                ? $q->where('r.reporter_user_id', $id)
                : $q->where('r.comment_owner_id', $id);

            $rows = $rows->concat($q->get()->map(fn ($r) => $this->normaliseReport($r, 'comment')));
        }

        /* ── Stories ────────────────────────────────────────────────────── */
        if ($wants('story')) {
            $q = DB::table('story_reports as r')
                ->join('stories as s', 's.id', '=', 'r.story_id')
                ->leftJoin('users as u', 'u.id', '=', 'r.reporter_id')
                ->select([
                    'r.id', 'r.reason', 'r.status', 'r.created_at',
                    'r.reporter_id', 'u.username as reporter_username', 'u.avatar as reporter_avatar',
                    's.id as target_id', 's.user_id as owner_id',
                ]);

            $direction === 'made'
                ? $q->where('r.reporter_id', $id)
                : $q->where('s.user_id', $id);

            $rows = $rows->concat($q->get()->map(fn ($r) => $this->normaliseReport($r, 'story')));
        }

        /* ── Profile / conversation / live stream / space ───────────────── */
        foreach (['user', 'conversation', 'live_stream', 'space'] as $ct) {
            if (! $wants($ct)) {
                continue;
            }

            $q = DB::table('content_reports as r')
                ->leftJoin('users as u', 'u.id', '=', 'r.reporter_id')
                ->where('r.reportable_type', $ct)
                ->select([
                    'r.id', 'r.reason', 'r.details', 'r.status',
                    'r.created_at', 'r.reviewed_at', 'r.reporter_id',
                    'u.username as reporter_username', 'u.avatar as reporter_avatar',
                    'r.reportable_id as target_id',
                ]);

            if ($direction === 'made') {
                $q->where('r.reporter_id', $id);
            } elseif ($ct === 'user') {
                // Only a profile report names a user directly. The other three
                // point at a conversation / stream / space, and there is no
                // ownership column to attribute those to one account, so they
                // appear under "made" only - stating that rather than guessing
                // at an owner and mislabelling someone as reported.
                $q->where('r.reportable_id', $id);
            } else {
                continue;
            }

            $rows = $rows->concat($q->get()->map(fn ($r) => $this->normaliseReport($r, $ct)));
        }

        /* ── Filter, count, sort ────────────────────────────────────────── */
        $all = $rows->sortByDesc('created_at')->values();

        $counts = [
            'total'     => $all->count(),
            'pending'   => $all->where('status', 'pending')->count(),
            'reviewed'  => $all->where('status', 'reviewed')->count(),
            'actioned'  => $all->whereIn('status', ['actioned', 'resolved'])->count(),
            'dismissed' => $all->whereIn('status', ['dismissed', 'rejected'])->count(),
        ];

        $byType = [];
        foreach ($all as $r) {
            $byType[$r['type']] = ($byType[$r['type']] ?? 0) + 1;
        }

        $filtered = $status === 'all'
            ? $all
            : $all->filter(function ($r) use ($status) {
                return match ($status) {
                    // The four tables disagree on vocabulary: comment_reports
                    // says resolved/rejected where the others say
                    // actioned/dismissed. Matched as synonyms so one filter
                    // works across all of them.
                    'actioned'  => in_array($r['status'], ['actioned', 'resolved'], true),
                    'dismissed' => in_array($r['status'], ['dismissed', 'rejected'], true),
                    default     => $r['status'] === $status,
                };
            })->values();

        // Distinct reporters is the signal for a coordinated pile-on: twenty
        // reports from one account is a different problem from twenty accounts.
        $reporters = $all->pluck('reporter_id')->filter()->unique()->count();

        return response()->json([
            'success' => true,
            'data'    => [
                'direction'        => $direction,
                'items'            => $filtered->take(200)->values()->all(),
                'counts'           => $counts,
                'by_type'          => $byType,
                'unique_reporters' => $reporters,
            ],
        ]);
    }

    /** One shape for rows coming out of four differently-shaped tables. */
    private function normaliseReport(object $r, string $type): array
    {
        $disk  = config('filesystems.default', 'r2');
        $thumb = $r->target_thumb ?? null;

        $label = match ($type) {
            'video'   => $r->target_label ?: 'Untitled video',
            'comment' => $r->target_label ? mb_strimwidth((string) $r->target_label, 0, 120, '...') : '(comment removed)',
            'story'   => 'Story #' . ($r->target_id ?? '?'),
            'user'    => 'Profile',
            default   => ucfirst(str_replace('_', ' ', $type)) . ' #' . ($r->target_id ?? '?'),
        };

        return [
            'id'                => (int) $r->id,
            'type'              => $type,
            'reason'            => (string) $r->reason,
            'details'           => $r->details ?? null,
            'status'            => (string) $r->status,
            'created_at'        => $r->created_at,
            'reviewed_at'       => $r->reviewed_at ?? null,
            'reporter_id'       => $r->reporter_id ? (int) $r->reporter_id : null,
            'reporter_username' => $r->reporter_username ?? null,
            'reporter_avatar'   => ($r->reporter_avatar ?? null) && ! str_starts_with((string) $r->reporter_avatar, 'http')
                ? Storage::disk($disk)->url($r->reporter_avatar)
                : ($r->reporter_avatar ?? null),
            'target_id'         => $r->target_id ?? null,
            'target_label'      => $label,
            'target_thumb'      => ($thumb && ! str_starts_with((string) $thumb, 'http'))
                ? Storage::disk($disk)->url($thumb)
                : $thumb,
            // Comment reports carry the video the comment sits on, which is
            // what a moderator needs to open to see the context.
            'parent_video_id'   => $r->parent_video_id ?? null,
        ];
    }

    // ── Paginated content list for admin user 360 ────────────────────────────

    public function getUserContent(Request $request, int $id): JsonResponse
    {
        $user    = User::findOrFail($id);
        $type    = $request->get('type',    'all');   // all, video, photo, text
        $status  = $request->get('status',  'all');   // all, published, draft, private, reported
        $sort    = $request->get('sort',    'latest');
        $search  = (string) $request->get('search', '');
        $perPage = max(5, min(50, (int) $request->get('per_page', 10)));
        $page    = max(1, (int) $request->get('page', 1));
        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');

        // Base query - use withTrashed so removed items appear with "removed" status
        $q = $user->videos()->withTrashed();

        // Type filter
        if ($type === 'video') {
            $q->where(fn ($sq) => $sq->whereNull('content_type')->orWhere('content_type', 'video'));
        } elseif ($type === 'photo') {
            $q->whereIn('content_type', ['image', 'image_carousel']);
        }

        // Status filter
        if ($status === 'reported') {
            $q->whereHas('reports');
        } elseif ($status === 'removed') {
            $q->whereNotNull('videos.deleted_at');
        } elseif ($status !== 'all') {
            $q->whereNull('videos.deleted_at')->where('status', $status);
        } else {
            $q->whereNull('videos.deleted_at');
        }

        // Search
        if ($search !== '') {
            $q->where('caption', 'ilike', "%{$search}%");
        }

        // Date range
        if ($dateFrom) $q->where('created_at', '>=', $dateFrom);
        if ($dateTo)   $q->where('created_at', '<=', $dateTo . ' 23:59:59');

        // Sort
        match ($sort) {
            'oldest'   => $q->orderBy('created_at'),
            'views'    => $q->orderByDesc('views_count'),
            'likes'    => $q->orderByDesc('likes_count'),
            'comments' => $q->orderByDesc('comments_count'),
            default    => $q->orderByDesc('created_at'),
        };

        $paged = $q->paginate($perPage, ['*'], 'page', $page);

        $disk = config('filesystems.default', 'r2');

        $items = $paged->getCollection()->map(function ($v) use ($disk) {
            $resolvedType = in_array($v->content_type, ['image', 'image_carousel'], true)
                ? $v->content_type
                : ($v->content_type ?? 'video');

            $thumbKey = $v->thumbnail_url;
            $thumbUrl = ($thumbKey && !str_starts_with($thumbKey, 'http'))
                ? Storage::disk($disk)->url($thumbKey)
                : $thumbKey;

            return [
                'id'             => $v->id,
                'caption'        => $v->caption,
                'content_type'   => $resolvedType,
                'status'         => $v->deleted_at ? 'removed' : $v->status,
                'visibility'     => match (true) {
                    (bool) $v->deleted_at    => 'removed',
                    $v->status === 'draft'   => 'only_me',
                    $v->status === 'private' => 'private',
                    default                  => 'public',
                },
                'thumbnail_url'  => $thumbUrl,
                'views_count'    => (int) ($v->views_count    ?? 0),
                'likes_count'    => (int) ($v->likes_count    ?? 0),
                'comments_count' => (int) ($v->comments_count ?? 0),
                'shares_count'   => (int) ($v->shares_count   ?? 0),
                'duration'       => $v->duration,
                'published_at'   => $v->published_at ?? $v->created_at,
                'created_at'     => $v->created_at,
            ];
        });

        // Aggregate stats
        $base = $user->videos()->whereNull('videos.deleted_at');
        $totalPosts = $base->count();
        $videoCount = (clone $base)->where(fn ($sq) => $sq->whereNull('content_type')->orWhere('content_type', 'video'))->count();
        $photoCount = (clone $base)->whereIn('content_type', ['image', 'image_carousel'])->count();
        $totalViews = $user->videos()->sum('views_count');

        // Top performing post
        $topPost = $user->videos()->where('status', 'published')
            ->orderByDesc('views_count')
            ->first(['id', 'caption', 'thumbnail_url', 'views_count', 'likes_count']);

        // Most used category
        $topCat = $user->videos()->where('status', 'published')
            ->whereNotNull('category')
            ->selectRaw('category, COUNT(*) as cnt')
            ->groupBy('category')
            ->orderByDesc('cnt')
            ->first();

        // Moderation notes count
        $notesCount = AdminUserNote::where('user_id', $id)->count();

        return response()->json([
            'success' => true,
            'data' => [
                'items'      => $items,
                'pagination' => [
                    'current_page' => $paged->currentPage(),
                    'last_page'    => $paged->lastPage(),
                    'per_page'     => $paged->perPage(),
                    'total'        => $paged->total(),
                ],
                'stats' => [
                    'total_posts' => $totalPosts,
                    'videos'      => $videoCount,
                    'photos'      => $photoCount,
                    'total_views' => (int) $totalViews,
                ],
                'insights' => [
                    'top_post'     => $topPost ? [
                        'id'            => $topPost->id,
                        'caption'       => $topPost->caption,
                        'thumbnail_url' => $topPost->thumbnail_url,
                        'views_count'   => $topPost->views_count,
                        'likes_count'   => $topPost->likes_count,
                    ] : null,
                    'top_category' => $topCat ? ['name' => $topCat->category, 'count' => $topCat->cnt] : null,
                    'last_upload'  => $user->videos()->latest()->value('created_at'),
                    'moderation_notes_count' => $notesCount,
                ],
            ],
        ]);
    }

    // ── Update moderation settings ────────────────────────────────────────────

    public function updateModeration(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'restrict_uploads'        => ['sometimes', 'boolean'],
            'post_approval_required'  => ['sometimes', 'boolean'],
            'block_live_access'       => ['sometimes', 'boolean'],
            'disable_drafts'               => ['sometimes', 'boolean'],
            'disable_commenting'           => ['sometimes', 'boolean'],
            'disable_commenting_on_others' => ['sometimes', 'boolean'],
            'disable_following_others'     => ['sometimes', 'boolean'],
            'daily_upload_limit'      => ['sometimes', 'nullable', 'integer', 'min:1', 'max:999'],
            'nsfw_review_required'    => ['sometimes', 'boolean'],
            'copyright_hold'          => ['sometimes', 'boolean'],
            'upload_suspension_until' => ['sometimes', 'nullable', 'date'],
            'shadowban'                    => ['sometimes', 'boolean'],
            'temporary_suspension'         => ['sometimes', 'boolean'],
            'temporary_suspension_until'   => ['sometimes', 'nullable', 'date'],
            'warning_level'                => ['sometimes', 'integer', 'min:0', 'max:5'],
            'content_review_mode'     => ['sometimes', 'in:standard,strict,none'],
            'comment_moderation'      => ['sometimes', 'in:off,light,standard,strong'],
            'message_monitoring'      => ['sometimes', 'boolean'],
            'appeal_status'           => ['sometimes', 'nullable', 'in:pending,resolved,dismissed'],
        ]);

        $settings = UserModerationSetting::forUser($id);
        $old      = $settings->toArray();

        $settings->fill($validated)->save();

        // ── Per-field system notifications ─────────────────────────────────
        $this->notifyBoolToggle($id, $old, $validated, 'restrict_uploads',
            'Uploads Restricted',   'Your ability to upload new content has been restricted. - Teezer',
            'Uploads Restored',     'Your ability to upload content has been restored. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'post_approval_required',
            'Upload Review Enabled',  'Your future uploads will require admin approval before going public. - Teezer',
            'Upload Review Disabled', 'Your uploads will now publish directly without admin review. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'block_live_access',
            'Live Access Disabled', 'Your live streaming access has been disabled. - Teezer',
            'Live Access Restored', 'Your live streaming access has been restored. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'disable_drafts',
            'Draft Creation Disabled', 'You can no longer create new drafts at this time. - Teezer',
            'Draft Creation Enabled',  'You can now create new drafts. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'disable_commenting',
            'Commenting Disabled', 'Comments on your uploads have been disabled. - Teezer',
            'Commenting Enabled',  'Comments on your uploads have been re-enabled. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'disable_commenting_on_others',
            'Commenting on Others Disabled', 'Your ability to comment on other users\' content has been disabled. - Teezer',
            'Commenting on Others Enabled',  'Your ability to comment on other users\' content has been restored. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'disable_following_others',
            'Following Others Disabled', 'Your ability to follow other users has been disabled. - Teezer',
            'Following Others Enabled',  'Your ability to follow other users has been restored. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'nsfw_review_required',
            'Content Review Enabled',  'Your uploads will go through additional content safety review. - Teezer',
            'Content Review Disabled', 'Your uploads no longer require additional content safety review. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'copyright_hold',
            'Copyright Review Enabled', 'Your uploads will be held for copyright review before publishing. - Teezer',
            'Copyright Hold Removed',   'Your uploads no longer require copyright review. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'shadowban',
            'Account Visibility Limited', 'Your account visibility has been limited due to policy review. - Teezer',
            'Account Visibility Restored', 'Your account visibility has been fully restored. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'temporary_suspension',
            'Temporary Suspension Applied', 'A temporary suspension has been applied to your account. - Teezer',
            'Temporary Suspension Lifted',  'Your temporary suspension has been lifted. - Teezer'
        );

        // daily_upload_limit change
        if (array_key_exists('daily_upload_limit', $validated)) {
            $oldLimit = $old['daily_upload_limit'] ?? null;
            $newLimit = $validated['daily_upload_limit'];
            if ($newLimit !== null && (int) $oldLimit !== (int) $newLimit) {
                $this->notify($id,
                    'Daily Upload Limit Updated',
                    "Your daily upload limit has been updated to {$newLimit} videos per 24 hours. - Teezer"
                );
            }
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_moderation_settings',
            target: User::find($id),
            description: 'Updated moderation settings',
            severity: 'info',
            metadata: ['changes' => $validated],
        );

        return response()->json(['success' => true, 'data' => $settings->fresh()]);
    }

    // ── Update permission settings ────────────────────────────────────────────

    public function updatePermissions(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'live_permission'          => ['sometimes', 'boolean'],
            'duet_permission'          => ['sometimes', 'boolean'],
            'download_permission'      => ['sometimes', 'boolean'],
            'collaboration_permission' => ['sometimes', 'boolean'],
            'messaging_permission'     => ['sometimes', 'in:everyone,followers,friends,none'],
            'access_level'             => ['sometimes', 'in:full,limited,read_only'],
        ]);

        $settings = UserPermissionSetting::forUser($id);
        $old      = $settings->toArray();

        $settings->fill($validated)->save();

        // ── Notifications for boolean permission changes ────────────────────
        $this->notifyBoolToggle($id, $old, $validated, 'live_permission',
            'Live Permission Disabled', 'Your ability to go live has been disabled. - Teezer',
            'Live Permission Restored', 'Your live streaming permission has been restored. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'duet_permission',
            'Duet Permission Disabled', 'Your duet/stitch permission has been disabled. - Teezer',
            'Duet Permission Restored', 'Your duet/stitch permission has been restored. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'download_permission',
            'Download Permission Disabled', 'Downloads of your videos have been disabled. - Teezer',
            'Download Permission Restored', 'Downloads of your videos have been re-enabled. - Teezer'
        );
        $this->notifyBoolToggle($id, $old, $validated, 'collaboration_permission',
            'Collaboration Disabled', 'Your collaboration features have been disabled. - Teezer',
            'Collaboration Restored', 'Your collaboration features have been restored. - Teezer'
        );

        // messaging_permission change
        if (array_key_exists('messaging_permission', $validated)) {
            $oldPerm = $old['messaging_permission'] ?? 'everyone';
            $newPerm = $validated['messaging_permission'];
            if ($oldPerm !== $newPerm) {
                $this->notify($id,
                    'Account Permission Updated',
                    "Your messaging permission has been updated to: {$newPerm}. - Teezer"
                );
            }
        }

        // access_level change
        if (array_key_exists('access_level', $validated)) {
            $oldLevel = $old['access_level'] ?? 'full';
            $newLevel = $validated['access_level'];
            if ($oldLevel !== $newLevel) {
                $this->notify($id,
                    'Account Access Level Updated',
                    "Your account access level has been updated to: {$newLevel}. - Teezer"
                );
            }
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_permission_settings',
            target: User::find($id),
            description: 'Updated permission settings',
            severity: 'info',
            metadata: ['changes' => $validated],
        );

        return response()->json(['success' => true, 'data' => $settings->fresh()]);
    }

    // ── Update safety / preference settings ───────────────────────────────────

    public function updateSafety(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'is_private'          => ['sometimes', 'boolean'],
            'allow_dm'            => ['sometimes', 'in:everyone,followers,friends,none'],
            'allow_mentions'      => ['sometimes', 'in:everyone,followers,friends,none'],
            'content_filter'      => ['sometimes', 'in:strict,standard,off'],
            'sensitive_filter'    => ['sometimes', 'boolean'],
            'activity_visibility' => ['sometimes', 'in:everyone,followers,friends,none'],
        ]);

        $user = User::findOrFail($id);

        // Save is_private to users table
        if (isset($validated['is_private'])) {
            $user->update(['is_private' => $validated['is_private']]);
        }

        // Save safety prefs to moderation settings
        $modFields = array_filter($validated, fn ($k) => $k !== 'is_private', ARRAY_FILTER_USE_KEY);
        if (!empty($modFields)) {
            $settings = UserModerationSetting::forUser($id);
            $settings->fill($modFields)->save();
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_safety_settings',
            target: $user,
            description: 'Updated user safety and preference settings',
            severity: 'info',
            metadata: ['changes' => $validated],
        );

        $this->notify($id,
            'Account Preferences Updated',
            'Your privacy and safety settings have been updated. - Teezer'
        );

        return response()->json(['success' => true]);
    }

    // ── Get blocked users list ────────────────────────────────────────────────

    public function getBlockedUsers(int $id): JsonResponse
    {
        User::findOrFail($id);
        $rows = BlockedUser::where('blocker_id', $id)
            ->with('blocked:id,name,username,avatar')
            ->latest()
            ->get()
            ->map(fn ($b) => [
                'id'       => $b->id,
                'user_id'  => $b->blocked_id,
                'name'     => $b->blocked?->name,
                'username' => $b->blocked?->username,
                'avatar'   => $b->blocked?->avatar,
                'blocked_at' => $b->created_at?->toIso8601String(),
            ]);
        return response()->json(['success' => true, 'data' => $rows]);
    }

    // ── Get / delete hidden words ─────────────────────────────────────────────

    public function getHiddenWords(int $id): JsonResponse
    {
        User::findOrFail($id);
        $words = UserHiddenWord::where('user_id', $id)->latest()->get(['id', 'word', 'created_at']);
        return response()->json(['success' => true, 'data' => $words]);
    }

    public function deleteHiddenWord(int $id, int $wid): JsonResponse
    {
        UserHiddenWord::where('user_id', $id)->where('id', $wid)->delete();
        return response()->json(['success' => true]);
    }

    // ── Get data download requests ────────────────────────────────────────────

    public function getDataRequests(int $id): JsonResponse
    {
        User::findOrFail($id);
        $rows = DataDownloadRequest::where('user_id', $id)->latest()->get(['id', 'status', 'created_at', 'completed_at']);
        return response()->json(['success' => true, 'data' => $rows]);
    }

    public function updateDataRequest(Request $request, int $id, int $rid): JsonResponse
    {
        $request->validate(['status' => ['required', 'in:pending,processing,ready,expired']]);
        DataDownloadRequest::where('user_id', $id)->where('id', $rid)
            ->update(['status' => $request->status, 'completed_at' => in_array($request->status, ['ready', 'expired']) ? now() : null]);
        return response()->json(['success' => true]);
    }

    // ── Get account deletion requests ─────────────────────────────────────────

    public function getDeletionRequests(int $id): JsonResponse
    {
        User::findOrFail($id);
        $rows = AccountDeletionRequest::where('user_id', $id)->latest()->get(['id', 'reason', 'status', 'scheduled_at', 'created_at']);
        return response()->json(['success' => true, 'data' => $rows]);
    }

    public function updateDeletionRequest(Request $request, int $id, int $rid): JsonResponse
    {
        $request->validate(['status' => ['required', 'in:pending,approved,rejected,cancelled']]);
        AccountDeletionRequest::where('user_id', $id)->where('id', $rid)
            ->update(['status' => $request->status]);
        return response()->json(['success' => true]);
    }

    // ── Add strike ────────────────────────────────────────────────────────────

    public function addStrike(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $user     = User::findOrFail($id);
        $settings = UserModerationSetting::forUser($id);
        $newCount = min(5, $settings->strike_count + 1);
        $settings->update([
            'strike_count'   => $newCount,
            'last_strike_at' => now(),
        ]);

        $this->notify($id,
            'Account Strike Added',
            "A strike has been added to your account due to a policy violation. Strike count: {$newCount}/5."
        );

        AdminActionLog::record(
            admin: $request->user(),
            action: 'add_strike',
            target: $user,
            description: "Strike #{$newCount} added: " . $request->reason,
            severity: 'warning',
        );

        return response()->json([
            'success'      => true,
            'message'      => "Strike #{$newCount} added.",
            'strike_count' => $newCount,
        ]);
    }

    // ── Issue warning ─────────────────────────────────────────────────────────

    public function issueWarning(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $user     = User::findOrFail($id);
        $settings = UserModerationSetting::forUser($id);
        $newLevel = min(5, $settings->warning_level + 1);
        $settings->update([
            'warning_level'   => $newLevel,
            'last_warning_at' => now(),
        ]);

        $this->notify($id,
            'Account Warning Issued',
            'A warning has been issued on your Teezer account. Please review our community guidelines to avoid further action.'
        );

        AdminActionLog::record(
            admin: $request->user(),
            action: 'issue_warning',
            target: $user,
            description: "Warning Level {$newLevel}: " . $request->reason,
            severity: 'warning',
        );

        return response()->json([
            'success'       => true,
            'message'       => "Warning issued (Level {$newLevel}).",
            'warning_level' => $newLevel,
        ]);
    }

    // ── Admin notes ───────────────────────────────────────────────────────────

    public function addNote(Request $request, int $id): JsonResponse
    {
        $request->validate(['note' => ['required', 'string', 'max:2000']]);

        User::findOrFail($id);
        $note = AdminUserNote::create([
            'user_id'  => $id,
            'admin_id' => $request->user()->id,
            'note'     => $request->note,
        ]);

        $note->load('admin:id,name');

        return response()->json([
            'success' => true,
            'data'    => [
                'id'         => $note->id,
                'note'       => $note->note,
                'created_at' => $note->created_at->toIso8601String(),
                'updated_at' => $note->updated_at->toIso8601String(),
                'admin'      => ['id' => $note->admin->id, 'name' => $note->admin->name],
            ],
        ]);
    }

    public function updateNote(Request $request, int $id, int $noteId): JsonResponse
    {
        $request->validate(['note' => ['required', 'string', 'max:2000']]);

        $note = AdminUserNote::where('user_id', $id)->findOrFail($noteId);
        $note->update(['note' => $request->note]);

        return response()->json([
            'success' => true,
            'data'    => [
                'id'         => $note->id,
                'note'       => $note->note,
                'created_at' => $note->created_at->toIso8601String(),
                'updated_at' => $note->updated_at->toIso8601String(),
                'admin'      => ['id' => $note->admin->id, 'name' => $note->admin->name],
            ],
        ]);
    }

    public function deleteNote(Request $request, int $id, int $noteId): JsonResponse
    {
        $note = AdminUserNote::where('user_id', $id)->findOrFail($noteId);
        $note->delete();

        return response()->json(['success' => true]);
    }

    // ── Send system message to user ───────────────────────────────────────────

    public function messageUser(Request $request, int $id): JsonResponse
    {
        $request->validate(['message' => ['required', 'string', 'max:1000']]);

        $user = User::findOrFail($id);

        AppNotification::create([
            'user_id'     => $user->id,
            'actor_id'    => null,
            'type'        => 'system',
            'entity_type' => 'admin_message',
            'entity_id'   => $request->user()->id,
            'message'     => $request->message,
            'is_read'     => false,
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'message_user',
            target: $user,
            description: 'System message sent: ' . $request->message,
        );

        return response()->json(['success' => true, 'message' => 'Message sent to user.']);
    }

    // ── Edit user details ─────────────────────────────────────────────────────

    public function editUser(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'name'        => ['sometimes', 'string', 'max:100'],
            'username'    => ['sometimes', 'string', 'max:50', 'unique:users,username,' . $id],
            'email'       => ['sometimes', 'email', 'unique:users,email,' . $id],
            'bio'         => ['nullable', 'string', 'max:500'],
            'phone'       => ['nullable', 'string', 'max:30'],
            'role'        => ['sometimes', 'in:user,creator,admin'],
            'categories'  => ['sometimes', 'nullable', 'array', 'max:3'],
            'categories.*'=> ['string', 'max:100'],
            'interests'   => ['sometimes', 'nullable', 'array', 'max:20'],
            'interests.*' => ['string', 'max:100'],
            'gender'      => ['sometimes', 'nullable', 'string', 'max:30'],
            'date_of_birth' => ['sometimes', 'nullable', 'date'],
            'language'    => ['sometimes', 'nullable', 'string', 'max:10'],
        ]);

        $user = User::findOrFail($id);
        $old  = $user->only(array_keys($validated));
        $user->update($validated);

        // Notify role change
        if (isset($validated['role']) && ($old['role'] ?? '') !== $validated['role']) {
            $this->notify($id,
                'Account Role Updated',
                "Your account role has been updated to {$validated['role']}."
            );
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'edit_user',
            target: $user,
            description: 'Edited user details',
            severity: 'info',
            metadata: ['old' => $old, 'new' => $validated],
        );

        return response()->json(['success' => true, 'data' => $user->fresh()]);
    }

    // ── Upload user avatar ────────────────────────────────────────────────────

    public function uploadAvatar(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', 'image', 'max:4096', 'mimes:jpeg,png,gif,webp'],
        ]);

        $disk = config('filesystems.default', 'local');
        $user = User::findOrFail($id);

        // Delete old avatar if stored locally
        if ($user->avatar && !str_starts_with($user->avatar, 'http')) {
            Storage::disk($disk)->delete($user->avatar);
        }

        $path = $request->file('avatar')->store('avatars', $disk);
        $user->update(['avatar' => $path]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_avatar',
            target: $user,
            description: 'Admin updated user profile picture',
            severity: 'info',
        );

        return response()->json([
            'success' => true,
            'avatar'  => Storage::disk($disk)->url($path),
        ]);
    }

    /* ── Finance & Tax ─────────────────────────────────────────────────────────
     * The User 360 "Finance & Tax" tab: the user's tax forms (with documents +
     * history) and their advance/ad-funds balance + ledger. Tax approval here
     * unlocks the creator's monetization payouts (see StudioMonetizationController).
     * ─────────────────────────────────────────────────────────────────────── */

    /** Mask a decrypted TIN to its last 4 (e.g. "**** **** 1234"). */
    private function maskTin(?string $tin): ?string
    {
        $tin = trim((string) $tin);
        if ($tin === '') {
            return null;
        }
        $last4 = substr($tin, -4);
        return '**** **** ' . $last4;
    }

    /** Serialise one tax form for the admin panel (docs → signed download URLs). */
    private function taxFormResource(TaxForm $f, StorageService $storage): array
    {
        $docs = [];
        foreach (['identity_doc_key' => 'ID Proof', 'address_doc_key' => 'Address Proof'] as $key => $label) {
            if (! empty($f->{$key})) {
                $name = basename($f->{$key});
                $url  = null;
                try { $url = $storage->temporaryUrl($f->{$key}, 30); } catch (\Throwable) {}
                $docs[] = ['label' => $label, 'name' => $name, 'url' => $url];
            }
        }

        // Encrypted casts can throw on a legacy/corrupt value - never let it 500 the tab.
        $taxId = null;
        try { $taxId = $f->tax_id; } catch (\Throwable) {}
        $residenceTin = null;
        try { $residenceTin = $f->residence_tin; } catch (\Throwable) {}

        return [
            'id'                => $f->id,
            'submission_id'     => $f->submission_id,
            'form_type'         => $f->form_type,
            'entity_kind'       => $f->entity_kind,
            'full_name'         => trim(implode(' ', array_filter([$f->first_name, $f->middle_name, $f->last_name]))),
            'first_name'        => $f->first_name,
            'middle_name'       => $f->middle_name,
            'last_name'         => $f->last_name,
            'dob'               => $f->dob,
            'citizenship'       => $f->citizenship,
            'residence_country' => $f->residence_country,
            'tin_type'          => $f->tin_type,
            // Full identifiers (admin-only, staff-authenticated endpoint): the admin
            // needs to READ the PAN / tax identification number to verify it. Masked
            // copies kept for compact rows.
            'tax_id'            => $taxId ?: null,
            'tax_id_masked'     => $this->maskTin($taxId),
            'residence_tin'     => $residenceTin ?: null,
            'residence_tin_masked' => $this->maskTin($residenceTin),
            'address'           => trim(implode(', ', array_filter([$f->addr1, $f->addr2, $f->city, $f->residence_country]))),
            'addr1'             => $f->addr1,
            'addr2'             => $f->addr2,
            'city'              => $f->city,
            'status'            => $f->status,
            'status_label'      => TaxForm::STATUS_LABELS[$f->status] ?? 'Under Review',
            'submitted_at'      => $f->created_at?->toIso8601String(),
            'approved_at'       => $f->status === 'approved' ? $f->reviewed_at?->toIso8601String() : null,
            'reviewed_at'       => $f->reviewed_at?->toIso8601String(),
            'review_note'       => $f->review_note,
            'documents'         => $docs,
        ];
    }

    /** GET /admin/users/{id}/finance - tax forms + advance funds for the User 360 tab. */
    public function finance(int $id, StorageService $storage): JsonResponse
    {
        User::findOrFail($id);

        $forms   = TaxForm::where('user_id', $id)->orderByDesc('id')->get();
        $current = $forms->firstWhere('status', 'approved') ?? $forms->first();

        // Advance funds = the user's ad account (balance + append-only ledger).
        $account = AdAccount::where('user_id', $id)->first();
        if ($account) {
            $base    = AdLedgerEntry::where('ad_account_id', $account->id);
            $added   = (int) (clone $base)->where('amount_cents', '>', 0)->sum('amount_cents');
            $used    = (int) abs((int) (clone $base)->where('amount_cents', '<', 0)->sum('amount_cents'));
            $pending = (int) (clone $base)->where('entry_type', 'hold')->sum('amount_cents')
                     + (int) (clone $base)->where('entry_type', 'release')->sum('amount_cents');
            $ledger  = (clone $base)->orderByDesc('id')->limit(20)->get();

            $funds = [
                'has_account'     => true,
                'currency'        => $account->currency,
                // Honest balance = real ledger money in − out (added − used). NOT the
                // raw balance_cents, which admin campaign-approval inflates to cover
                // committed budgets (a delivery grant, not funds the user ever paid).
                'current_balance' => max(0, $added - $used) / 100,
                'total_added'     => $added / 100,
                'total_used'      => $used / 100,
                'pending'         => max(0, abs($pending)) / 100,
                'transactions'    => $ledger->map(fn (AdLedgerEntry $e) => [
                    'id'          => $e->id,
                    'type'        => $e->amount_cents >= 0 ? 'Added' : 'Used',
                    'entry_type'  => $e->entry_type,
                    'description' => $e->description ?: ucfirst(str_replace('_', ' ', $e->entry_type)),
                    'amount'      => $e->amount_cents / 100,
                    'status'      => $e->entry_type === 'hold' ? 'Pending' : 'Completed',
                    'date'        => $e->created_at?->toIso8601String(),
                ])->all(),
            ];
        } else {
            $funds = [
                'has_account' => false, 'currency' => 'USD',
                'current_balance' => 0, 'total_added' => 0, 'total_used' => 0, 'pending' => 0,
                'transactions' => [],
            ];
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'tax_forms' => [
                    'current' => $current ? $this->taxFormResource($current, $storage) : null,
                    'history' => $forms->map(fn (TaxForm $f) => $this->taxFormResource($f, $storage))->all(),
                ],
                'advance_funds' => $funds,
            ],
        ]);
    }

    /** PATCH /admin/users/{id}/tax-forms/{formId} - approve / reject a tax form. */
    public function updateTaxForm(Request $request, int $id, int $formId): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:approved,rejected,under_review'],
            'note'   => ['nullable', 'string', 'max:500'],
        ]);

        $form = TaxForm::where('user_id', $id)->where('id', $formId)->firstOrFail();
        $form->update([
            'status'      => $data['status'],
            'review_note' => $data['note'] ?? null,
            'reviewed_at' => now(),
        ]);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_tax_form',
            target: $form,
            description: "Admin set tax form #{$form->id} to {$data['status']}",
            metadata: ['status' => $data['status'], 'note' => $data['note'] ?? null],
            severity: $data['status'] === 'approved' ? 'info' : 'warning',
        );

        $this->notify($id, 'Tax form ' . ($data['status'] === 'approved' ? 'approved' : ($data['status'] === 'rejected' ? 'rejected' : 'updated')),
            $data['status'] === 'approved'
                ? 'Your tax form was approved. Payouts are now unlocked.'
                : ($data['status'] === 'rejected' ? ('Your tax form was rejected.' . (! empty($data['note']) ? ' ' . $data['note'] : '')) : 'Your tax form status was updated.'));

        return response()->json(['success' => true, 'message' => 'Tax form updated.']);
    }

    /**
     * POST /admin/users/{id}/tax-forms/request - ask the user to submit or update
     * their tax information. Sends both an in-app system notification AND an email
     * (inline, no queue worker) so the creator is prompted to open Teezer Studio →
     * Tax Forms and provide / refresh their details.
     */
    public function requestTaxInfo(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:submit,update']]);
        $user = User::findOrFail($id);
        $isUpdate = $data['action'] === 'update';

        $title = $isUpdate ? 'Please update your tax information' : 'Please submit your tax information';
        $msg   = $isUpdate
            ? 'Teezer needs you to review and update your tax form. Open Teezer Studio → Tax Forms to make the changes.'
            : 'Teezer needs your tax information to enable payouts. Open Teezer Studio → Tax Forms to submit it.';

        $this->notify($id, $title, $msg);

        // Email inline (the queue driver has no worker - same as the OTP/ads paths).
        try {
            if ($user->email && app(\App\Services\GlobalControls\GlobalControlService::class)->isEnabled('email_notifications_enabled')) {
                $first = $user->name ? explode(' ', trim($user->name))[0] : ($user->username ?: 'there');
                Mail::to($user->email)->send(new AdminActionMail(
                    firstName: $first,
                    username: $user->username ?: $first,
                    actionType: 'restrict',
                    actionLabel: $title,
                    description: $msg . ' Verified tax information keeps your payouts on time and compliant.',
                ));
            }
        } catch (\Throwable $e) {
            report($e);
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'request_tax_' . $data['action'],
            target: $user,
            description: 'Admin requested the user to ' . $data['action'] . ' tax information',
            metadata: ['action' => $data['action']],
            severity: 'info',
        );

        return response()->json(['success' => true, 'message' => 'The user has been asked to ' . ($isUpdate ? 'update' : 'submit') . ' their tax information.']);
    }

    /** POST /admin/users/{id}/advance-funds - admin credit/adjust the ad balance. */
    public function addAdvanceFunds(Request $request, int $id, AdBillingService $billing): JsonResponse
    {
        $data = $request->validate([
            'amount'      => ['required', 'numeric', 'min:0.5', 'max:100000'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $user  = User::findOrFail($id);
        $cents = (int) round(((float) $data['amount']) * 100);

        $account = AdAccount::firstOrCreate(
            ['user_id' => $user->id],
            ['name' => $user->name ?: ('@' . $user->username), 'status' => 'active', 'currency' => 'USD'],
        );

        $ref     = 'admin_adj_' . $user->id . '_' . now()->timestamp;
        $balance = $billing->credit($account, $cents, 'adjustment', $ref, $data['description'] ?? 'Manual addition by admin');

        AdminActionLog::record(
            admin: $request->user(),
            action: 'add_advance_funds',
            target: $user,
            description: 'Admin added $' . number_format((float) $data['amount'], 2) . ' advance funds',
            metadata: ['amount' => (float) $data['amount']],
            severity: 'info',
        );

        return response()->json([
            'success' => true,
            'message' => 'Funds added.',
            'balance' => $balance / 100,
        ]);
    }

    /* ── Ads & Control ─────────────────────────────────────────────────────────
     * The User 360 "Ads & Control" tab: the user's ad account (status + balance),
     * their campaigns (with spend/budget), and the admin levers to suspend the
     * account or pause a campaign. Campaign pause/resume reuse AdminAdController.
     * ─────────────────────────────────────────────────────────────────────── */

    /** The account's public number (ACCT-83271-9920). Same value the advertiser
     *  sees in ads.teezer.live - one derivation, on the model. */
    private function accountNumber(AdAccount $a): string
    {
        return $a->accountNumber();
    }

    /** GET /admin/users/{id}/ads - the full Ads & Control console payload. */
    public function adsControl(int $id, StorageService $storage): JsonResponse
    {
        $user    = User::findOrFail($id);
        $account = AdAccount::where('user_id', $id)->first();

        // ── Fund figures from the append-only ledger ──
        // `topups` = REAL money the user paid in (IAP / payment top-ups). `deposits`
        // additionally includes admin credit adjustments. The overview shows the
        // real added balance (topups), never a fabricated figure.
        $topups = 0; $deposits = 0; $refunds = 0; $pending = 0; $promo = 0; $ledgerBalance = 0;
        if ($account) {
            $base = fn () => AdLedgerEntry::where('ad_account_id', $account->id);
            $topups   = (int) $base()->where('entry_type', 'topup')->sum('amount_cents');
            $deposits = $topups
                      + (int) $base()->where('entry_type', 'adjustment')->where('amount_cents', '>', 0)->sum('amount_cents');
            $refunds  = (int) abs((int) $base()->where('entry_type', 'refund')->sum('amount_cents'));
            $pending  = (int) $base()->where('entry_type', 'hold')->sum('amount_cents')
                      + (int) $base()->where('entry_type', 'release')->sum('amount_cents');
            $promo    = (int) $base()->where('entry_type', 'adjustment')->where('description', 'ilike', '%promo%')->where('amount_cents', '>', 0)->sum('amount_cents');
            // TRUE spendable balance from the append-only ledger = every real money
            // movement summed (topup/adjustment/refund/release IN, charge/hold OUT).
            // We do NOT read $account->balance_cents here: admin campaign approval
            // (AdminAdController::fundAccount) inflates that column to cover committed
            // budgets WITHOUT a ledger entry, so it shows funds the user never added.
            $ledgerBalance = (int) $base()->sum('amount_cents');
        }

        // ── Tax ──
        $approvedTax = TaxForm::where('user_id', $id)->where('status', 'approved')->latest('id')->first();
        $latestTax   = TaxForm::where('user_id', $id)->latest('id')->first();
        $taxForm     = $approvedTax ?: $latestTax;
        $taxDocs     = $taxForm ? $this->taxFormResource($taxForm, $storage)['documents'] : [];

        // ── Spending series + windows (from AdStatDaily) ──
        $series = []; $today = 0.0; $s7 = 0.0; $s30 = 0.0;
        if ($account) {
            $rows = AdStatDaily::where('ad_account_id', $account->id)
                ->where('stat_date', '>=', now()->subDays(29)->toDateString())
                ->selectRaw('stat_date, SUM(spend_cents) as spend')
                ->groupBy('stat_date')->get()->keyBy(fn ($r) => (string) $r->stat_date);
            for ($i = 29; $i >= 0; $i--) {
                $d = now()->subDays($i)->toDateString();
                $series[] = ['date' => $d, 'amount' => (int) ($rows[$d]->spend ?? 0) / 100];
            }
            $today = (int) ($rows[now()->toDateString()]->spend ?? 0) / 100;
            $s7  = (int) AdStatDaily::where('ad_account_id', $account->id)->where('stat_date', '>=', now()->subDays(6)->toDateString())->sum('spend_cents') / 100;
            $s30 = (int) AdStatDaily::where('ad_account_id', $account->id)->where('stat_date', '>=', now()->subDays(29)->toDateString())->sum('spend_cents') / 100;
        }

        // ── All advertisements (creatives → group → campaign, with lifetime stats) ──
        $ads = [];
        if ($account) {
            $creatives = AdCreative::query()
                ->join('ad_groups', 'ad_creatives.ad_group_id', '=', 'ad_groups.id')
                ->join('ad_campaigns', 'ad_groups.campaign_id', '=', 'ad_campaigns.id')
                ->where('ad_campaigns.ad_account_id', $account->id)
                ->orderByDesc('ad_creatives.id')
                ->limit(100)
                ->get([
                    'ad_creatives.id', 'ad_creatives.display_name', 'ad_creatives.headline', 'ad_creatives.review_status',
                    'ad_groups.id as group_id', 'ad_groups.status as group_status', 'ad_groups.placements',
                    'ad_campaigns.id as campaign_id', 'ad_campaigns.name as campaign_name', 'ad_campaigns.objective',
                    'ad_campaigns.status as campaign_status', 'ad_campaigns.budget_type',
                    'ad_campaigns.daily_budget_cents', 'ad_campaigns.total_budget_cents',
                ]);

            $ids   = $creatives->pluck('id')->all();
            $stats = $ids
                ? AdStatDaily::whereIn('creative_id', $ids)
                    ->selectRaw('creative_id, SUM(impressions) imp, SUM(clicks) clk, SUM(spend_cents) spend')
                    ->groupBy('creative_id')->get()->keyBy('creative_id')
                : collect();

            $ads = $creatives->map(function ($c) use ($stats) {
                $st  = $stats[$c->id] ?? null;
                $imp = (int) ($st->imp ?? 0);
                $clk = (int) ($st->clk ?? 0);
                $placements = is_array($c->placements) ? $c->placements : (json_decode($c->placements ?? '[]', true) ?: []);
                $onWeb = collect($placements)->contains(fn ($p) => str_contains((string) $p, 'web') || str_contains((string) $p, 'site'));
                $status = ($c->group_status === 'paused' || $c->campaign_status === 'paused') ? 'paused' : $c->campaign_status;
                return [
                    'id'              => $c->id,
                    // Ad id from the CAMPAIGN id, matching Ads Management → Approvals
                    // (AD-000012) so the same ad shows one id everywhere and links to
                    // its detail page (/ads-management/campaigns/{campaign_id}).
                    'code'            => 'AD-' . str_pad((string) $c->campaign_id, 6, '0', STR_PAD_LEFT),
                    'name'            => $c->display_name ?: $c->headline ?: ('Ad #' . $c->id),
                    'campaign'        => $c->campaign_name,
                    'campaign_id'     => $c->campaign_id,
                    'group_id'        => $c->group_id,
                    'objective'       => $c->objective,
                    'placement'       => $placements[0] ?? '—',
                    'platform'        => $onWeb ? 'App & Web' : 'App',
                    'status'          => $status,
                    'approval_status' => $c->review_status,
                    'budget'          => ($c->budget_type === 'daily' ? (int) $c->daily_budget_cents : (int) $c->total_budget_cents) / 100,
                    'budget_type'     => $c->budget_type,
                    'spend'           => (int) ($st->spend ?? 0) / 100,
                    'impressions'     => $imp,
                    'clicks'          => $clk,
                    'ctr'             => $imp > 0 ? round($clk / $imp * 100, 2) : 0,
                ];
            })->all();
        }

        // ── Policy & compliance ──
        $rejected = collect($ads)->where('approval_status', 'rejected')->count();
        $warnings = AdminActionLog::where('target_type', User::class)->where('target_id', $id)
            ->where('severity', 'warning')->count();
        $suspended = $account && $account->status !== 'active';
        $risk = $suspended ? 'High' : (($rejected > 0 || $warnings > 2) ? 'Medium' : 'Low');

        $typeLabel = ['self_serve' => 'Creator', 'brand' => 'Brand', 'agency' => 'Agency'];

        // An ad account is only "provisioned" once the user actually generated it -
        // by creating an ad, or having real funds/spend. A bare shell row (created
        // just by opening the Ads section) is treated as no-account, so the console
        // shows the empty state instead of fabricated funds/menus.
        $provisioned = $account && (
            count($ads) > 0 || $topups > 0 || $ledgerBalance > 0 || (int) $account->lifetime_spent_cents > 0
        );

        return response()->json([
            'success' => true,
            'data'    => [
                'ad_account' => $provisioned ? [
                    'has_account'         => true,
                    'account_number'      => $this->accountNumber($account),
                    'status'              => $account->status,
                    // Live moderation flags (see adAccountControl): stop new ads / freeze funds.
                    'ads_disabled'        => (bool) ($account->meta['ads_disabled'] ?? false),
                    'funds_frozen'        => (bool) ($account->meta['funds_frozen'] ?? false),
                    'verified'            => (bool) $approvedTax,
                    // Real spendable balance = ledger money in − out. NOT balance_cents
                    // (campaign approval inflates that with un-paid delivery grants).
                    'available_balance'   => max(0, $ledgerBalance) / 100,
                    'advance_funds'       => $topups / 100,
                    'promotional_credits' => $promo / 100,
                    'lifetime_spend'      => $account->lifetime_spent_cents / 100,
                    'total_deposits'      => $topups / 100,
                    'refund_balance'      => $refunds / 100,
                    'created_at'          => $account->created_at?->toIso8601String(),
                    'last_active'         => $account->updated_at?->toIso8601String(),
                    'type'                => $typeLabel[$account->type] ?? ucfirst($account->type),
                    'business_name'       => $account->name ?: ($account->meta['business_name'] ?? ($user->name ?: '@' . $user->username)),
                    'currency'            => $account->currency,
                    'timezone'            => $account->timezone ?: 'UTC',
                    // The user's own country (chosen at signup), not the tax form.
                    'country'             => $user->selected_country_name ?: ($user->country ?: $user->detected_country_name),
                    'tax_status'          => $approvedTax ? 'Verified' : ($latestTax ? (TaxForm::STATUS_LABELS[$latestTax->status] ?? 'Under Review') : 'Not submitted'),
                    'tax_form'            => $taxForm ? ($taxForm->form_type . ' (' . $taxForm->entity_kind . ')') : null,
                    // Business Information + Billing Preferences the advertiser set in
                    // the app (synced to meta via /studio/ad-account/settings), so the
                    // admin shows the SAME fields as the app's Billing screen.
                    'account_owner'       => $account->meta['account_owner'] ?? ($user->name ?: null),
                    'business_email'      => $account->contact_email ?: ($account->meta['business_email'] ?? $user->email),
                    'phone'               => $account->meta['phone'] ?? null,
                    'address'             => $account->meta['address'] ?? null,
                    'business_type'       => $account->meta['business_type'] ?? ($account->meta['account_type'] ?? null),
                    'auto_pay'            => (bool) ($account->meta['auto_pay'] ?? false),
                    'billing_threshold'   => isset($account->meta['billing_threshold']) ? (float) $account->meta['billing_threshold'] : null,
                    'invoice_frequency'   => $account->meta['invoice_frequency'] ?? null,
                    'tax_exemption'       => (bool) ($account->meta['tax_exemption'] ?? false),
                ] : ['has_account' => false, 'status' => 'none'],
                'advance_funds' => [
                    'available'        => max(0, $ledgerBalance) / 100,
                    'pending'          => max(0, abs($pending)) / 100,
                    'total_deposited'  => $topups / 100,
                    'lifetime_refunds' => $refunds / 100,
                    'today_spend'      => $today,
                    'spend_7d'         => $s7,
                    'spend_30d'        => $s30,
                    'avg_daily_spend'  => round($s30 / 30, 2),
                    'series'           => $series,
                    'transactions'     => $account ? AdLedgerEntry::where('ad_account_id', $account->id)->orderByDesc('id')->limit(20)->get()->map(fn (AdLedgerEntry $e) => [
                        'id'          => $e->id,
                        'type'        => $e->entry_type === 'refund' ? 'Refund' : ($e->amount_cents >= 0 ? 'Added' : 'Used'),
                        'entry_type'  => $e->entry_type,
                        'description' => $e->description ?: ucfirst(str_replace('_', ' ', $e->entry_type)),
                        'amount'      => $e->amount_cents / 100,
                        'status'      => $e->entry_type === 'hold' ? 'Pending' : 'Completed',
                        'date'        => $e->created_at?->toIso8601String(),
                    ])->all() : [],
                ],
                'ads' => $ads,
                'tax' => [
                    'form_type' => $taxForm?->form_type ? ($taxForm->form_type . ' (' . $taxForm->entity_kind . ')') : null,
                    'country'   => $taxForm?->residence_country,
                    'verified'  => (bool) $approvedTax,
                    'submitted_at' => $taxForm?->created_at?->toIso8601String(),
                    'documents' => $taxDocs,
                ],
                'compliance' => [
                    'risk_level' => $risk,
                    'violations' => $rejected,
                    'warnings'   => $warnings,
                    'strikes'    => 0,
                    'status'     => $account ? $account->status : 'none',
                ],
            ],
        ]);
    }

    /**
     * PATCH /admin/users/{id}/ad-account/control - the Quick Actions.
     * Suspends the account, disables new-ad creation, or freezes funds (which also
     * blocks adding funds on the app AND website). Every action sends the user a
     * system notification AND an email, and is audit-logged. Enforcement lives in
     * StudioAdCampaignController (ads_disabled / suspended) and
     * StudioAdAccountController (funds_frozen), which read these flags.
     */
    public function adAccountControl(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:suspend,activate,disable_ads,enable_ads,freeze_funds,unfreeze_funds']]);
        $user = User::findOrFail($id);
        $account = AdAccount::firstOrCreate(
            ['user_id' => $user->id],
            ['name' => $user->name ?: ('@' . $user->username), 'type' => 'self_serve', 'status' => 'active', 'currency' => 'USD'],
        );
        $meta = $account->meta ?? [];
        $paused = 0;

        [$notifyTitle, $notifyMsg, $emailLabel, $emailDesc] = match ($data['action']) {
            'suspend' => (function () use ($account, &$paused) {
                $account->update(['status' => 'suspended']);
                $paused = AdCampaign::where('ad_account_id', $account->id)->where('status', 'active')->update(['status' => 'paused']);
                return ['Ad account suspended', 'Your ad account has been suspended by Teezer and your running ads have been paused.',
                        'Ad account suspended', 'Your Teezer ad account has been suspended. All running ads are paused, and you cannot run or create ads until it is reactivated.'];
            })(),
            'activate' => (function () use ($account) {
                $account->update(['status' => 'active']);
                return ['Ad account reactivated', 'Your ad account has been reactivated. You can run ads again.',
                        'Ad account reactivated', 'Your Teezer ad account has been reactivated. You can create and run advertisements again.'];
            })(),
            'disable_ads' => (function () use ($account, $meta) {
                $account->update(['meta' => array_merge($meta, ['ads_disabled' => true])]);
                return ['Advertising disabled', 'You can no longer create new ads on Teezer.',
                        'Advertising disabled', 'Creating new advertisements on your Teezer account has been disabled by Teezer. Existing ads may continue to run.'];
            })(),
            'enable_ads' => (function () use ($account, $meta) {
                $account->update(['meta' => array_merge($meta, ['ads_disabled' => false])]);
                return ['Advertising enabled', 'You can create advertisements again.',
                        'Advertising enabled', 'Creating advertisements on your Teezer account has been re-enabled.'];
            })(),
            'freeze_funds' => (function () use ($account, $meta, &$paused) {
                $account->update(['meta' => array_merge($meta, ['funds_frozen' => true])]);
                $paused = AdCampaign::where('ad_account_id', $account->id)->where('status', 'active')->update(['status' => 'paused']);
                return ['Ad funds frozen', 'Your ad funds are frozen. You cannot spend from or add to this balance until it is unfrozen.',
                        'Ad funds frozen', 'Your Teezer ad account funds have been frozen. You cannot run ads from this balance, and adding funds (on the app or the website) is blocked until they are unfrozen.'];
            })(),
            'unfreeze_funds' => (function () use ($account, $meta) {
                $account->update(['meta' => array_merge($meta, ['funds_frozen' => false])]);
                return ['Ad funds unfrozen', 'Your ad funds are available again.',
                        'Ad funds unfrozen', 'Your Teezer ad account funds have been unfrozen. You can run ads and add funds again.'];
            })(),
        };

        $this->notify($user->id, $notifyTitle, $notifyMsg);

        // Email inline (the queue driver has no worker - same as the OTP path).
        try {
            if ($user->email && app(\App\Services\GlobalControls\GlobalControlService::class)->isEnabled('email_notifications_enabled')) {
                $first = $user->name ? explode(' ', trim($user->name))[0] : ($user->username ?: 'there');
                Mail::to($user->email)->send(new AdminActionMail(
                    firstName: $first,
                    username: $user->username ?: $first,
                    actionType: 'restrict',
                    actionLabel: $emailLabel,
                    description: $emailDesc,
                ));
            }
        } catch (\Throwable $e) {
            report($e);
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'ad_account_' . $data['action'],
            target: $user,
            description: 'Admin ' . str_replace('_', ' ', $data['action']) . ' ad account' . ($paused ? " (paused {$paused} campaign(s))" : ''),
            metadata: ['action' => $data['action']],
            severity: in_array($data['action'], ['suspend', 'disable_ads', 'freeze_funds'], true) ? 'warning' : 'info',
        );

        return response()->json(['success' => true, 'message' => 'Ad account updated.']);
    }

    /** POST /admin/users/{id}/ads/{creativeId}/status - pause / resume one ad (its group). */
    public function updateAdStatus(Request $request, int $id, int $creativeId): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:pause,resume']]);
        $account = AdAccount::where('user_id', $id)->firstOrFail();

        $creative = AdCreative::findOrFail($creativeId);
        $group    = AdGroup::findOrFail($creative->ad_group_id);
        $campaign = AdCampaign::findOrFail($group->campaign_id);
        abort_unless($campaign->ad_account_id === $account->id, 404);

        $group->update(['status' => $data['action'] === 'pause' ? 'paused' : 'active']);

        AdminActionLog::record(
            admin: $request->user(),
            action: $data['action'] === 'pause' ? 'ad_pause' : 'ad_resume',
            target: User::find($id),
            description: 'Admin ' . $data['action'] . 'd ad #' . $creativeId,
            metadata: ['creative_id' => $creativeId],
            severity: 'info',
        );

        return response()->json(['success' => true, 'message' => 'Ad ' . ($data['action'] === 'pause' ? 'paused' : 'resumed') . '.']);
    }

    /** PATCH /admin/users/{id}/ad-account - suspend / activate / close the ad account. */
    public function updateAdAccountStatus(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:active,suspended,closed']]);
        $user = User::findOrFail($id);

        $account = AdAccount::firstOrCreate(
            ['user_id' => $user->id],
            ['name' => $user->name ?: ('@' . $user->username), 'status' => 'active', 'currency' => 'USD'],
        );
        $account->update(['status' => $data['status']]);

        // Suspending/closing stops delivery - pause any running campaigns.
        $pausedCount = 0;
        if ($data['status'] !== 'active') {
            $pausedCount = AdCampaign::where('ad_account_id', $account->id)
                ->where('status', 'active')
                ->update(['status' => 'paused']);
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_ad_account_status',
            target: $user,
            description: "Admin set ad account to {$data['status']}" . ($pausedCount ? " (paused {$pausedCount} campaign(s))" : ''),
            metadata: ['status' => $data['status'], 'paused_campaigns' => $pausedCount],
            severity: $data['status'] === 'active' ? 'info' : 'warning',
        );

        return response()->json(['success' => true, 'message' => 'Ad account updated.']);
    }

    /* ── Monetization ──────────────────────────────────────────────────────────
     * The Monetization tab: earnings, wallet balances, earnings breakdown, payout
     * methods, tax, payout HISTORY + pending payout REQUESTS, creator level,
     * performance, and the admin controls/settings. Backed by the same tables the
     * mobile StudioMonetizationController uses (CreatorWallet/Earning/Payout).
     * ─────────────────────────────────────────────────────────────────────── */

    private function payoutTxn(CreatorPayout $p): string
    {
        return 'TXN-' . strtoupper(substr(md5($p->idempotency_key ?: ('payout' . $p->id)), 0, 7));
    }

    private function payoutRow(CreatorPayout $p, $method): array
    {
        return [
            'id'             => $p->id,
            'code'           => 'PAYOUT-' . str_pad((string) $p->id, 4, '0', STR_PAD_LEFT),
            'amount'         => (float) $p->amount,
            'currency'       => $p->currency,
            'status'         => $p->status,
            'method'         => $method ? $this->providerLabel($method->provider) : '—',
            'account'        => $method ? ($method->masked_account ?: $method->account_email) : null,
            'requested_on'   => $p->created_at?->toIso8601String(),
            'paid_on'        => $p->paid_at?->toIso8601String(),
            'scheduled_at'   => $p->scheduled_at?->toIso8601String(),
            'transaction_id' => $this->payoutTxn($p),
            'failure_reason' => $p->failure_reason,
        ];
    }

    private function providerLabel(?string $p): string
    {
        return [
            'esewa' => 'eSewa', 'khalti' => 'Khalti', 'bank' => 'Bank Transfer',
            'bank_transfer' => 'Bank Transfer', 'paypal' => 'PayPal', 'stripe' => 'Stripe', 'payoneer' => 'Payoneer',
        ][$p] ?? ucfirst((string) $p);
    }

    /** GET /admin/users/{id}/monetization - the full Monetization tab payload. */
    public function userMonetization(int $id, StorageService $storage): JsonResponse
    {
        $user   = User::findOrFail($id);
        $wallet = CreatorWallet::firstOrCreate(['user_id' => $id], ['available_balance' => 0, 'pending_balance' => 0, 'lifetime_earnings' => 0]);
        $status = CreatorMonetizationStatus::firstOrCreate(['user_id' => $id], ['account_standing' => true]);

        // Payouts + methods.
        $methods = CreatorPayoutMethod::where('user_id', $id)->orderByDesc('is_default')->orderByDesc('id')->get();
        $methodById = $methods->keyBy('id');
        $payouts = CreatorPayout::where('user_id', $id)->orderByDesc('id')->limit(50)->get();

        $completed   = $payouts->where('status', 'completed');
        $requests    = $payouts->whereIn('status', ['pending', 'processing']);
        $paidOut     = (float) $completed->sum('amount');
        $holdBalance = (float) $payouts->where('status', 'processing')->sum('amount');

        // Earnings breakdown (last 30d) for the donut.
        $since = now()->subDays(30);
        $bySource = CreatorEarning::where('user_id', $id)->where('earned_at', '>=', $since)
            ->selectRaw('source, SUM(amount) as total')->groupBy('source')->get();
        $labels = CreatorEarning::sourceLabelMap();
        $breakdownTotal = (float) $bySource->sum('total');
        $breakdown = $bySource->map(fn ($r) => [
            'source' => $r->source,
            'label'  => $labels[$r->source] ?? ucfirst(str_replace('_', ' ', $r->source)),
            'amount' => round((float) $r->total, 2),
            'pct'    => $breakdownTotal > 0 ? round((float) $r->total / $breakdownTotal * 100, 1) : 0,
        ])->values()->all();

        // Earnings series (14 days) for the performance sparkline.
        $daily = CreatorEarning::where('user_id', $id)->where('earned_at', '>=', now()->subDays(13))
            ->selectRaw('earned_at::date as d, SUM(amount) as total')->groupBy('d')->get()->keyBy(fn ($r) => (string) $r->d);
        $series = [];
        for ($i = 13; $i >= 0; $i--) { $d = now()->subDays($i)->toDateString(); $series[] = ['date' => $d, 'amount' => round((float) ($daily[$d]->total ?? 0), 2)]; }
        $earnings30 = round((float) CreatorEarning::where('user_id', $id)->where('earned_at', '>=', $since)->sum('amount'), 2);

        // Tax.
        $approvedTax = TaxForm::where('user_id', $id)->where('status', 'approved')->latest('id')->first();
        $taxForm     = $approvedTax ?: TaxForm::where('user_id', $id)->latest('id')->first();
        $tax = $taxForm ? $this->taxFormResource($taxForm, $storage) : null;

        // Creator level.
        $progress = CreatorProgress::where('user_id', $id)->first();
        $level = null;
        if ($progress) {
            $lvl = $progress->level; // CreatorLevel keyed by current_level_id
            // The app stores current_level_id 0-indexed by ONE (a fresh creator is
            // Level 1 but current_level_id = 2 - see StudioDashboardController), so
            // the DISPLAY level is current_level_id - 1. Using the raw id showed
            // "Level 2" for every new creator.
            $displayLevel = max(1, (int) $progress->current_level_id - 1);
            $level = [
                'level_number' => $displayLevel,
                'level_name'   => $lvl?->level_name ?? 'New Creator',
                'current_xp'   => (int) $progress->current_xp,
                'min_xp'       => (int) ($lvl?->min_xp ?? 0),
                'max_xp'       => (int) ($lvl?->max_xp ?? 1000),
            ];
        }

        // Performance (best-effort; never 500).
        $impressions = 0; $subscribers = 0; $engagement = 0.0;
        try {
            $impressions = (int) Video::where('user_id', $id)->sum('views_count');
            $likes = (int) Video::where('user_id', $id)->sum('likes_count');
            $engagement = $impressions > 0 ? round($likes / $impressions * 100, 2) : 0.0;
            $subscribers = (int) DB::table('followers')->where('following_id', $id)->count();
        } catch (\Throwable) { /* keep zeros */ }

        // Recent activity (payouts + tax verification + method adds).
        $activity = collect();
        foreach ($completed->take(3) as $p) {
            $activity->push(['type' => 'payout', 'text' => 'Payout of $' . number_format((float) $p->amount, 2) . ' completed via ' . ($methodById[$p->payout_method_id]->provider ?? 'payout'), 'at' => $p->paid_at?->toIso8601String()]);
        }
        if ($approvedTax) $activity->push(['type' => 'tax', 'text' => 'Tax form ' . $approvedTax->form_type . ' verified', 'at' => $approvedTax->reviewed_at?->toIso8601String()]);
        foreach ($methods->take(2) as $m) {
            $activity->push(['type' => 'method', 'text' => 'Payout method ' . $this->providerLabel($m->provider) . ' added', 'at' => $m->created_at?->toIso8601String()]);
        }
        $activity = $activity->filter(fn ($a) => $a['at'])->sortByDesc('at')->values()->take(6)->all();

        return response()->json(['success' => true, 'data' => [
            'summary' => [
                'total_earnings'    => round((float) $wallet->lifetime_earnings, 2),
                'available_balance' => round((float) $wallet->available_balance, 2),
                'pending_balance'   => round((float) $wallet->pending_balance, 2),
                'paid_out'          => round($paidOut, 2),
                'total_payouts'     => $completed->count(),
                'hold_balance'      => round($holdBalance, 2),
                'currency'          => $wallet->currency ?: 'USD',
            ],
            'earnings_breakdown' => ['total' => round($breakdownTotal, 2), 'sources' => $breakdown],
            'payout_methods' => $methods->map(fn ($m) => [
                'id'       => $m->id,
                'provider' => $m->provider,
                'label'    => $this->providerLabel($m->provider),
                'account'  => $m->masked_account ?: $m->account_email,
                'primary'  => (bool) $m->is_default,
                'added_at' => $m->created_at?->toIso8601String(),
            ])->all(),
            'tax' => $tax ? [
                'form_type'    => $tax['form_type'],
                'entity_kind'  => $tax['entity_kind'],
                'status'       => $tax['status'],
                'status_label' => $tax['status_label'],
                'submitted_at' => $tax['submitted_at'],
                'tax_id'       => $tax['tax_id_masked'],
                'country'      => $tax['residence_country'],
                'documents'    => $tax['documents'],
            ] : null,
            'payout_history'  => $payouts->map(fn ($p) => $this->payoutRow($p, $methodById[$p->payout_method_id] ?? null))->all(),
            'payout_requests' => $requests->map(fn ($p) => $this->payoutRow($p, $methodById[$p->payout_method_id] ?? null))->values()->all(),
            'creator_level'   => $level,
            'performance'     => [
                'earnings'    => $earnings30,
                'impressions' => $impressions,
                'engagement'  => $engagement,
                'subscribers' => $subscribers,
                'series'      => $series,
            ],
            'controls' => [
                'enabled'          => (bool) $status->account_standing,
                'account_standing' => (bool) $status->account_standing,
            ],
            'settings' => [
                // Real system values: the app enforces a $50 minimum withdrawal
                // (StudioMonetizationController) and pays out on request (held ~3
                // days), not on an auto schedule. Currency is the wallet's own.
                'payout_threshold'    => 50,
                'auto_payout'         => false,
                'payout_schedule'     => 'On request (3-day hold)',
                'currency'            => $wallet->currency ?: 'USD',
                'earnings_visibility' => 'Public',
                'allow_gifts'         => (bool) $status->live_gifts_enabled,
                'allow_subscriptions' => (bool) $status->subscriptions_enabled,
                'allow_ad_revenue'    => (bool) $status->ad_revenue_eligible,
                'allow_brand_deals'   => true,
                'monetization_since'  => $status->created_at?->toIso8601String(),
            ],
            'note'            => optional(AdminUserNote::where('user_id', $id)->where('note', 'ilike', '[Monetization]%')->latest('id')->first(), fn ($n) => trim(str_replace('[Monetization]', '', $n->note))),
            'recent_activity' => $activity,
        ]]);
    }

    /** PATCH /admin/users/{id}/monetization/status - pause / ban / reset / enable. */
    public function updateMonetizationStatus(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:pause,ban,reset,enable']]);
        $user   = User::findOrFail($id);
        $status = CreatorMonetizationStatus::firstOrCreate(['user_id' => $id], ['account_standing' => true]);

        match ($data['action']) {
            'pause'  => $status->update(['account_standing' => false]),
            'ban'    => $status->update(['account_standing' => false, 'ad_revenue_eligible' => false, 'live_gifts_enabled' => false, 'subscriptions_enabled' => false]),
            'reset'  => $status->update(['account_standing' => true, 'ad_revenue_eligible' => true, 'live_gifts_enabled' => true, 'subscriptions_enabled' => true]),
            'enable' => $status->update(['account_standing' => true]),
        };

        AdminActionLog::record(
            admin: $request->user(),
            action: 'monetization_' . $data['action'],
            target: $user,
            description: 'Admin ' . $data['action'] . ' monetization',
            severity: in_array($data['action'], ['pause', 'ban'], true) ? 'warning' : 'info',
        );
        $this->notify($id, 'Monetization ' . $data['action'] . 'd', 'An admin updated your monetization status.');

        return response()->json(['success' => true, 'message' => 'Monetization updated.']);
    }

    /** PATCH /admin/users/{id}/monetization/settings - toggle a monetization setting. */
    public function updateMonetizationSetting(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'allow_gifts'         => ['sometimes', 'boolean'],
            'allow_subscriptions' => ['sometimes', 'boolean'],
            'allow_ad_revenue'    => ['sometimes', 'boolean'],
        ]);
        $status = CreatorMonetizationStatus::firstOrCreate(['user_id' => $id], ['account_standing' => true]);

        $map = [];
        if (array_key_exists('allow_gifts', $data)) $map['live_gifts_enabled'] = $data['allow_gifts'];
        if (array_key_exists('allow_subscriptions', $data)) $map['subscriptions_enabled'] = $data['allow_subscriptions'];
        if (array_key_exists('allow_ad_revenue', $data)) $map['ad_revenue_eligible'] = $data['allow_ad_revenue'];
        if (! $map) return response()->json(['success' => false, 'message' => 'Nothing to update.'], 422);

        $status->update($map);
        AdminActionLog::record(admin: $request->user(), action: 'monetization_setting', target: User::find($id), description: 'Admin updated monetization settings', metadata: $map, severity: 'info');

        return response()->json(['success' => true, 'message' => 'Setting updated.']);
    }

    /** POST /admin/users/{id}/monetization/note - save the admin monetization note. */
    public function saveMonetizationNote(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);
        User::findOrFail($id);
        // No dedicated column - tag the monetization note with a marker so the tab
        // can read the latest one back (stored in the shared admin notes table).
        AdminUserNote::create([
            'user_id'  => $id,
            'admin_id' => $request->user()->id,
            'note'     => '[Monetization] ' . ($data['note'] ?? ''),
        ]);
        return response()->json(['success' => true, 'message' => 'Note saved.']);
    }

    /** PATCH /admin/users/{id}/payouts/{payoutId} - approve / complete / reject a payout request. */
    public function updatePayoutRequest(Request $request, int $id, int $payoutId): JsonResponse
    {
        $data   = $request->validate(['action' => ['required', 'in:approve,complete,reject'], 'reason' => ['nullable', 'string', 'max:255']]);
        $payout = CreatorPayout::where('user_id', $id)->where('id', $payoutId)->firstOrFail();

        if (! in_array($payout->status, ['pending', 'processing'], true)) {
            return response()->json(['success' => false, 'message' => 'This payout is already ' . $payout->status . '.'], 422);
        }

        if ($data['action'] === 'reject') {
            // Return the reserved amount to the available balance.
            $wallet = CreatorWallet::where('user_id', $id)->lockForUpdate()->first();
            if ($wallet) {
                $wallet->increment('available_balance', (float) $payout->amount);
                $wallet->decrement('pending_balance', min((float) $wallet->pending_balance, (float) $payout->amount));
            }
            $payout->update(['status' => 'failed', 'failure_reason' => $data['reason'] ?? 'Rejected by admin']);
        } elseif ($data['action'] === 'approve') {
            $payout->update(['status' => 'processing']);
        } else { // complete
            $wallet = CreatorWallet::where('user_id', $id)->lockForUpdate()->first();
            if ($wallet) $wallet->decrement('pending_balance', min((float) $wallet->pending_balance, (float) $payout->amount));
            $payout->update(['status' => 'completed', 'paid_at' => now()]);
        }

        AdminActionLog::record(
            admin: $request->user(),
            action: 'payout_' . $data['action'],
            target: User::find($id),
            description: 'Admin ' . $data['action'] . ' payout #' . $payoutId,
            metadata: ['payout_id' => $payoutId, 'reason' => $data['reason'] ?? null],
            severity: $data['action'] === 'reject' ? 'warning' : 'info',
        );

        return response()->json(['success' => true, 'message' => 'Payout ' . ($data['action'] === 'complete' ? 'completed' : ($data['action'] === 'reject' ? 'rejected' : 'approved')) . '.']);
    }
}
