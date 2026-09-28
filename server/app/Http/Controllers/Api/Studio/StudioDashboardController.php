<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\CreatorAnalytic;
use App\Models\UserModerationSetting;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StudioDashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // Last 30 days aggregate
        $since = now()->subDays(30)->toDateString();
        $analytics = CreatorAnalytic::where('user_id', $user->id)
            ->where('date', '>=', $since)
            ->selectRaw('SUM(views) as total_views, SUM(new_followers) as new_followers, SUM(likes) as total_likes, SUM(comments) as total_comments, SUM(shares) as total_shares, SUM(earnings) as total_earnings')
            ->first();

        // Previous 30 days for trend
        $prev = CreatorAnalytic::where('user_id', $user->id)
            ->whereBetween('date', [now()->subDays(60)->toDateString(), now()->subDays(30)->toDateString()])
            ->selectRaw('SUM(views) as total_views')
            ->first();

        $profile = $user->profile;

        $recentVideos = Video::where('user_id', $user->id)
            ->whereNull('deleted_at')
            ->orderByDesc('created_at')
            ->limit(5)
            ->get(['id', 'caption', 'views_count', 'likes_count', 'comments_count', 'status', 'created_at']);

        return response()->json([
            'success' => true,
            'data'    => [
                'overview' => [
                    'total_followers'  => $profile?->total_followers ?? 0,
                    'total_videos'     => $profile?->total_videos    ?? 0,
                    'total_likes'      => $profile?->total_likes     ?? 0,
                ],
                'period_30d' => [
                    'views'       => (int) ($analytics->total_views    ?? 0),
                    'new_followers'=> (int) ($analytics->new_followers  ?? 0),
                    'likes'       => (int) ($analytics->total_likes    ?? 0),
                    'comments'    => (int) ($analytics->total_comments ?? 0),
                    'shares'      => (int) ($analytics->total_shares   ?? 0),
                    'earnings'    => (float) ($analytics->total_earnings ?? 0),
                    'views_trend' => $this->trend($analytics->total_views ?? 0, $prev->total_views ?? 0),
                ],
                'recent_videos' => $recentVideos,
            ],
        ]);
    }

    /* ── GET /studio/permissions ────────────────────────────────────────── */
    /**
     * Returns the minimal permission context the frontend needs to decide
     * which Studio features are locked / unlocked for this user.
     *
     * creator_level is 0-indexed (Level 0 = just became a creator,
     * Level 10 = top creator). Computed from current_level_id - 1.
     * Normal users receive creator_level = -1.
     */
    public function permissions(Request $request): JsonResponse
    {
        $user      = $request->user();
        $isCreator = $user->role === 'creator' || $user->role === 'admin';

        // Creator level (0-indexed): level_id 1 → Level 0, 2 → Level 1, …
        $creatorLevel = -1;
        if ($isCreator) {
            $progress     = $user->creatorProgress()->first();
            $levelId      = $progress?->current_level_id ?? 2; // default: Level 1
            $creatorLevel = max(1, (int) $levelId - 1); // approved creators ≥ Level 1
        }

        // Monetization + payout via safe direct DB query (avoids undefined-relationship crash)
        $monetizationApproved = false;
        $payoutInfoCompleted  = false;
        if ($isCreator) {
            $mon = DB::table('creator_monetization_statuses')
                ->where('user_id', $user->id)
                ->first();
            $monetizationApproved = (bool) ($mon?->ad_revenue_eligible ?? false);
            $payoutInfoCompleted  = (bool) ($mon?->tax_info_completed   ?? false);
        }

        // Active violation: simply whether user is banned
        $hasActiveViolation = (bool) $user->is_banned;

        // Creator application status (for non-creators awaiting approval)
        $appStatus = \App\Models\CreatorApplication::where('user_id', $user->id)
            ->value('status') ?? 'none';

        return response()->json([
            'success' => true,
            'data'    => [
                'is_creator'            => $isCreator,
                'creator_level'         => $creatorLevel,
                'monetization_approved' => $monetizationApproved,
                'has_active_violation'  => $hasActiveViolation,
                'payout_info_completed' => $payoutInfoCompleted,
                'application_status'    => $appStatus,
            ],
        ]);
    }

    /* ── GET /studio/creator-level-page ──────────────────────────────────── */
    public function creatorLevelPage(Request $request): JsonResponse
    {
        $user    = $request->user();
        $profile = $user->profile;
        $progress = $user->creatorProgress()->with('level')->first();

        // Level number (0-indexed).
        // Approved creators start at Level 1 minimum - Level 0 is the
        // pre-approval / pending state and must never be shown to an
        // already-approved creator.
        $levelId     = $progress?->current_level_id ?? 1;
        $levelNumber = max(0, (int) $levelId - 1);

        if ($levelNumber < 1) {
            // Migrate legacy approved-creator records that are stuck at Level 0
            $levelNumber = 1;
            if ($progress) {
                $progress->current_level_id = 2; // Level 1 in 0-indexed
                $progress->save();
            } else {
                // Create progress row if missing
                $progress = $user->creatorProgress()->create([
                    'current_level_id' => 2,
                    'current_xp'       => 0,
                    'total_xp_earned'  => 0,
                ]);
            }
        }

        $currentXp   = $progress?->current_xp ?? 0;

        // Level metadata definitions (levels 0-10)
        $levelDefs = $this->levelDefinitions();
        $currentDef = $levelDefs[$levelNumber] ?? $levelDefs[0];
        $nextDef    = $levelDefs[$levelNumber + 1] ?? null;

        // Stats
        $publicVideos = (int) Video::where('user_id', $user->id)
            ->where('status', 'published')->whereNull('deleted_at')->count();
        $totalViews = (int) Video::where('user_id', $user->id)
            ->where('status', 'published')->whereNull('deleted_at')->sum('views_count');
        $followers  = (int) ($profile?->total_followers ?? 0);

        // Watch minutes (last 90 days from creator_analytics)
        $watchMins = (int) CreatorAnalytic::where('user_id', $user->id)
            ->where('date', '>=', now()->subDays(90)->toDateString())
            ->sum('watch_time_mins');

        // Engagement rate: (likes+comments+shares) / views * 100
        $analytics = CreatorAnalytic::where('user_id', $user->id)
            ->where('date', '>=', now()->subDays(30)->toDateString())
            ->selectRaw('SUM(views) as v, SUM(likes) as l, SUM(comments) as c, SUM(shares) as s')
            ->first();
        $engagementRate = 0.0;
        if (($analytics->v ?? 0) > 0) {
            $engagementRate = round(
                (((float)($analytics->l ?? 0) + (float)($analytics->c ?? 0) + (float)($analytics->s ?? 0))
                 / (float)$analytics->v) * 100,
                2
            );
        }

        // Avg retention % (watch_time_mins / (video_count * avg_duration_min) * 100)
        // Simplified: use stored avg watch duration / estimated video duration
        $avgRetention = 0.0;
        $totalDuration = (int) Video::where('user_id', $user->id)
            ->where('status', 'published')->whereNull('deleted_at')->sum('duration');
        if ($publicVideos > 0 && $totalDuration > 0 && $watchMins > 0) {
            $avgVideoMins  = ($totalDuration / $publicVideos) / 60;
            if ($avgVideoMins > 0 && $totalViews > 0) {
                $avgRetention = min(100, round(($watchMins / ($totalViews * $avgVideoMins)) * 100, 1));
            }
        }

        // Creator score (weighted, 0-5 scale)
        $noViolation     = !$user->is_banned;
        $scoreCompliance = $noViolation ? 5.0 : 0.0;
        $scoreEngagement = min(5.0, ($engagementRate / 5.0) * 5.0);   // 5% eng → 5.0
        $scoreGrowth     = min(5.0, ($followers / 10000.0) * 5.0);     // 10k followers → 5.0
        $scoreQuality    = $publicVideos > 0
            ? min(5.0, (($totalViews / max(1, $publicVideos)) / 10000.0) * 5.0) // 10k avg → 5.0
            : 0.0;
        // Consistency: days since last video (less days = better)
        $lastVideo = Video::where('user_id', $user->id)
            ->where('status', 'published')->whereNull('deleted_at')
            ->latest()->value('created_at');
        $daysSince = $lastVideo ? (int) now()->diffInDays($lastVideo, true) : 999;
        $scoreConsistency = max(0.0, 5.0 - ($daysSince / 7.0));        // weekly upload = 5.0

        $creatorScore = round(
            $scoreQuality   * 0.40 +
            $scoreEngagement* 0.25 +
            $scoreConsistency*0.15 +
            $scoreGrowth    * 0.10 +
            $scoreCompliance* 0.10,
            1
        );

        // Build requirements for NEXT level
        $requirements = [];
        if ($nextDef) {
            $reqs = $nextDef['requirements'] ?? [];
            $completedCount = 0;
            foreach ($reqs as $req) {
                $current = match ($req['key']) {
                    'public_videos'  => $publicVideos,
                    'total_views'    => $totalViews,
                    'followers'      => $followers,
                    'watch_minutes'  => $watchMins,
                    'engagement_rate'=> $engagementRate,
                    'avg_retention'  => $avgRetention,
                    'creator_score'  => $creatorScore,
                    'no_violations'  => $noViolation ? 1 : 0,
                    default          => 0,
                };

                $passed = match ($req['type']) {
                    'gte'   => $current >= $req['value'],
                    'bool'  => (bool) $current,
                    default => false,
                };

                if ($passed) $completedCount++;

                $requirements[] = [
                    'key'      => $req['key'],
                    'label'    => $req['label'],
                    'type'     => $req['type'],
                    'required' => $req['value'],
                    'current'  => $current,
                    'display'  => $this->fmtReqDisplay($req, $current),
                    'passed'   => $passed,
                ];
            }

            // Auto-level-up: if ALL requirements met, advance level.
            // Guard: skip when reqs list is empty (auto-unlocked levels 0/1).
            if (count($reqs) > 0 && $completedCount === count($reqs) && $levelNumber < 10) {
                $newLevelId = $levelId + 1;
                if ($progress) {
                    $progress->current_level_id = $newLevelId;
                    $progress->save();
                    $levelNumber++;
                    $currentDef = $levelDefs[$levelNumber] ?? $currentDef;
                    $nextDef    = $levelDefs[$levelNumber + 1] ?? null;
                }
            }
        }

        // All levels for progression row
        $allLevels = array_map(function ($def, $n) use ($levelNumber, $currentXp) {
            $state = $n < $levelNumber ? 'unlocked'
                : ($n === $levelNumber ? 'current' : 'locked');
            return [
                'level_number' => $n,
                'name'         => $def['name'],
                'short_req'    => $def['short_req'] ?? '',
                'state'        => $state,
            ];
        }, $levelDefs, array_keys($levelDefs));

        // XP for current level: use max_xp from level table or fallback to def
        $levelXpRequired = $progress?->level?->max_xp ?? $currentDef['xp_required'];

        return response()->json([
            'success' => true,
            'data'    => [
                'level_number'   => $levelNumber,
                'level_name'     => $currentDef['name'],
                'level_title'    => 'Level ' . $levelNumber . ' – ' . $currentDef['name'],
                'next_level'     => $nextDef ? [
                    'number' => $levelNumber + 1,
                    'name'   => $nextDef['name'],
                    'title'  => 'Level ' . ($levelNumber + 1) . ' – ' . $nextDef['name'],
                ] : null,
                'xp' => [
                    'current'  => $currentXp,
                    'required' => $levelXpRequired,
                ],
                'creator_score'      => $creatorScore,
                'creator_score_max'  => 5.0,
                'score_breakdown'    => [
                    ['label' => 'Content Quality', 'pct' => 40, 'value' => round($scoreQuality, 1)  ],
                    ['label' => 'Engagement',       'pct' => 25, 'value' => round($scoreEngagement,1)],
                    ['label' => 'Consistency',      'pct' => 15, 'value' => round($scoreConsistency,1)],
                    ['label' => 'Growth',           'pct' => 10, 'value' => round($scoreGrowth, 1)  ],
                    ['label' => 'Compliance',       'pct' => 10, 'value' => round($scoreCompliance,1)],
                ],
                'stats' => [
                    'public_videos'   => $publicVideos,
                    'total_views'     => $totalViews,
                    'followers'       => $followers,
                    'watch_minutes'   => $watchMins,
                    'engagement_rate' => $engagementRate,
                ],
                'requirements'         => $requirements,
                'completed_count'      => count(array_filter($requirements, fn ($r) => $r['passed'])),
                'total_requirements'   => count($requirements),
                'current_level_perks'  => $currentDef['perks'],
                'next_level_perks'     => $nextDef['perks'] ?? [],
                'all_levels'           => $allLevels,
                'has_violation'        => !$noViolation,
            ],
        ]);
    }

    private function fmtReqDisplay(array $req, float|int $current): string
    {
        return match ($req['key']) {
            'no_violations'  => $current ? '0 violations' : 'Active violation',
            'engagement_rate'=> number_format($current, 1) . '%',
            'avg_retention'  => number_format($current, 1) . '%',
            'creator_score'  => number_format($current, 1) . ' / 5.0',
            default          => number_format($current) . ' / ' . number_format($req['value']),
        };
    }

    private function levelDefinitions(): array
    {
        return [
            0 => [
                // Level 0 = pre-approval / pending state only.
                // Shown as "unlocked" in the progression row for approved creators.
                'name'        => 'New Creator',
                'short_req'   => 'Creator application approved',
                'xp_required' => 0,
                'perks'       => [
                    'Basic Studio access',
                    'Content manager',
                    'Basic analytics',
                    'Basic comment manager',
                    '1GB / 30 min upload',
                    'Level progress visible',
                ],
                'requirements' => [], // Auto-granted on creator approval
            ],
            1 => [
                // Level 1 = automatically unlocked when creator application is approved.
                // Requirements are intentionally empty - they are satisfied by the
                // creator eligibility checklist (3 videos, 500 views, 300 followers).
                // We must never show those same requirements here again.
                'name'        => 'Starter Creator',
                'short_req'   => 'Auto-unlocked on creator approval',
                'xp_required' => 2000,
                'perks'       => [
                    'Creator badge / status',
                    'Basic audience analytics',
                    'Basic best time to post preview',
                    'Basic growth tips',
                ],
                'requirements' => [], // Auto-unlocked - do not duplicate eligibility requirements
            ],
            2 => [
                'name'      => 'Rising Creator',
                'short_req' => '5 videos, 2K views, 500 followers',
                'xp_required' => 8000,
                'perks' => [
                    'Full Analytics unlocked',
                    'Advanced content insights',
                    'Scheduled posts',
                    'Audience insights',
                    'Traffic sources',
                    'Retention analytics',
                    'Full best time to post',
                ],
                'requirements' => [
                    ['key'=>'public_videos',  'label'=>'5 public videos',         'type'=>'gte',  'value'=>5    ],
                    ['key'=>'total_views',    'label'=>'2,000 total views',        'type'=>'gte',  'value'=>2000 ],
                    ['key'=>'followers',      'label'=>'500 followers',            'type'=>'gte',  'value'=>500  ],
                    ['key'=>'watch_minutes',  'label'=>'500 watch minutes',        'type'=>'gte',  'value'=>500  ],
                    ['key'=>'engagement_rate','label'=>'Engagement rate 1.5%+',   'type'=>'gte',  'value'=>1.5  ],
                    ['key'=>'creator_score',  'label'=>'Creator Score 2.5+',       'type'=>'gte',  'value'=>2.5  ],
                    ['key'=>'no_violations',  'label'=>'No active violations',     'type'=>'bool', 'value'=>1    ],
                ],
            ],
            3 => [
                'name'      => 'Active Creator',
                'short_req' => '10 videos, 5K views, 1K followers',
                'xp_required' => 20000,
                'perks' => [
                    'Advanced comments manager',
                    'Audience location insights',
                    'Advanced content manager',
                    'Detailed video insights',
                ],
                'requirements' => [
                    ['key'=>'public_videos',  'label'=>'10 public videos',        'type'=>'gte',  'value'=>10   ],
                    ['key'=>'total_views',    'label'=>'5,000 total views',        'type'=>'gte',  'value'=>5000 ],
                    ['key'=>'followers',      'label'=>'1,000 followers',          'type'=>'gte',  'value'=>1000 ],
                    ['key'=>'watch_minutes',  'label'=>'1,500 watch minutes',      'type'=>'gte',  'value'=>1500 ],
                    ['key'=>'engagement_rate','label'=>'Engagement rate 2%+',      'type'=>'gte',  'value'=>2.0  ],
                    ['key'=>'creator_score',  'label'=>'Creator Score 3.0+',       'type'=>'gte',  'value'=>3.0  ],
                    ['key'=>'no_violations',  'label'=>'No active violations',     'type'=>'bool', 'value'=>1    ],
                ],
            ],
            4 => [
                'name'      => 'Trusted Creator',
                'short_req' => '15 videos, 15K views, 2K followers',
                'xp_required' => 60000,
                'perks' => [
                    'Creator growth tips',
                    'Advanced best time to post',
                    'Priority content indexing',
                    'Improved promote recommendations',
                    'Audience behavior insights',
                ],
                'requirements' => [
                    ['key'=>'public_videos',  'label'=>'15 public videos',        'type'=>'gte',  'value'=>15    ],
                    ['key'=>'total_views',    'label'=>'15,000 total views',       'type'=>'gte',  'value'=>15000 ],
                    ['key'=>'followers',      'label'=>'2,000 followers',          'type'=>'gte',  'value'=>2000  ],
                    ['key'=>'watch_minutes',  'label'=>'5,000 watch minutes',      'type'=>'gte',  'value'=>5000  ],
                    ['key'=>'avg_retention',  'label'=>'Avg retention 20%+',       'type'=>'gte',  'value'=>20.0  ],
                    ['key'=>'engagement_rate','label'=>'Engagement rate 2.5%+',    'type'=>'gte',  'value'=>2.5   ],
                    ['key'=>'creator_score',  'label'=>'Creator Score 3.3+',       'type'=>'gte',  'value'=>3.3   ],
                    ['key'=>'no_violations',  'label'=>'No active violations',     'type'=>'bool', 'value'=>1     ],
                ],
            ],
            5 => [
                'name'      => 'Monetization Eligible',
                'short_req' => '25 videos, 50K views, 5K followers',
                'xp_required' => 150000,
                'perks' => [
                    'Monetization apply',
                    'Estimated rewards',
                    'Wallet preview',
                    'Revenue dashboard preview',
                    'Gift / coin eligibility preview',
                    'Monetization checklist',
                ],
                'requirements' => [
                    ['key'=>'public_videos',  'label'=>'25 public videos',        'type'=>'gte',  'value'=>25    ],
                    ['key'=>'total_views',    'label'=>'50,000 total views',       'type'=>'gte',  'value'=>50000 ],
                    ['key'=>'followers',      'label'=>'5,000 followers',          'type'=>'gte',  'value'=>5000  ],
                    ['key'=>'watch_minutes',  'label'=>'15,000 watch minutes',     'type'=>'gte',  'value'=>15000 ],
                    ['key'=>'engagement_rate','label'=>'Engagement rate 3%+',      'type'=>'gte',  'value'=>3.0   ],
                    ['key'=>'creator_score',  'label'=>'Creator Score 3.7+',       'type'=>'gte',  'value'=>3.7   ],
                    ['key'=>'no_violations',  'label'=>'No active violations',     'type'=>'bool', 'value'=>1     ],
                ],
            ],
            6 => [
                'name'      => 'Monetized Creator',
                'short_req' => '50 videos, 100K views, 10K followers',
                'xp_required' => 400000,
                'perks' => [
                    'Ad revenue',
                    'Gifts and coins',
                    'Payouts',
                    'Full monetization dashboard',
                    'Revenue analytics',
                    'Transaction history',
                    'Creator wallet',
                ],
                'requirements' => [
                    ['key'=>'public_videos',  'label'=>'50 public videos',         'type'=>'gte',  'value'=>50     ],
                    ['key'=>'total_views',    'label'=>'100,000 total views',       'type'=>'gte',  'value'=>100000 ],
                    ['key'=>'followers',      'label'=>'10,000 followers',          'type'=>'gte',  'value'=>10000  ],
                    ['key'=>'watch_minutes',  'label'=>'30,000 watch minutes',      'type'=>'gte',  'value'=>30000  ],
                    ['key'=>'creator_score',  'label'=>'Creator Score 4.0+',        'type'=>'gte',  'value'=>4.0    ],
                    ['key'=>'no_violations',  'label'=>'No active violations',      'type'=>'bool', 'value'=>1      ],
                ],
            ],
            7 => [
                'name'      => 'Pro Creator',
                'short_req' => '100 videos, 500K views, 25K followers',
                'xp_required' => 1200000,
                'perks' => [
                    'Creator marketplace',
                    'Brand collaboration eligibility',
                    'Pro analytics',
                    'Advanced campaign insights',
                    'Priority monetization review',
                ],
                'requirements' => [
                    ['key'=>'public_videos',  'label'=>'100 public videos',        'type'=>'gte',  'value'=>100    ],
                    ['key'=>'total_views',    'label'=>'500,000 total views',       'type'=>'gte',  'value'=>500000 ],
                    ['key'=>'followers',      'label'=>'25,000 followers',          'type'=>'gte',  'value'=>25000  ],
                    ['key'=>'watch_minutes',  'label'=>'100,000 watch minutes',     'type'=>'gte',  'value'=>100000 ],
                    ['key'=>'engagement_rate','label'=>'Engagement rate 4%+',       'type'=>'gte',  'value'=>4.0    ],
                    ['key'=>'creator_score',  'label'=>'Creator Score 4.2+',        'type'=>'gte',  'value'=>4.2    ],
                    ['key'=>'no_violations',  'label'=>'No active violations',      'type'=>'bool', 'value'=>1      ],
                ],
            ],
            8 => [
                'name'      => 'Premium Creator',
                'short_req' => '250 videos, 1M views, 50K followers',
                'xp_required' => 4000000,
                'perks' => [
                    'Subscription tools',
                    'Series earnings',
                    'Advanced monetization tools',
                    'Priority support',
                    'Better marketplace visibility',
                    'Advanced audience segmentation',
                ],
                'requirements' => [
                    ['key'=>'public_videos',  'label'=>'250 public videos',        'type'=>'gte',  'value'=>250     ],
                    ['key'=>'total_views',    'label'=>'1,000,000 total views',     'type'=>'gte',  'value'=>1000000 ],
                    ['key'=>'followers',      'label'=>'50,000 followers',          'type'=>'gte',  'value'=>50000   ],
                    ['key'=>'watch_minutes',  'label'=>'250,000 watch minutes',     'type'=>'gte',  'value'=>250000  ],
                    ['key'=>'creator_score',  'label'=>'Creator Score 4.4+',        'type'=>'gte',  'value'=>4.4     ],
                    ['key'=>'no_violations',  'label'=>'No active violations',      'type'=>'bool', 'value'=>1       ],
                ],
            ],
            9 => [
                'name'      => 'Elite Creator',
                'short_req' => '500 videos, 5M views, 100K followers',
                'xp_required' => 12000000,
                'perks' => [
                    'Brand marketplace priority',
                    'Higher revenue opportunities',
                    'Priority support queue',
                    'Elite creator tools',
                ],
                'requirements' => [
                    ['key'=>'public_videos',  'label'=>'500 public videos',        'type'=>'gte',  'value'=>500      ],
                    ['key'=>'total_views',    'label'=>'5,000,000 total views',     'type'=>'gte',  'value'=>5000000  ],
                    ['key'=>'followers',      'label'=>'100,000 followers',         'type'=>'gte',  'value'=>100000   ],
                    ['key'=>'watch_minutes',  'label'=>'1,000,000 watch minutes',   'type'=>'gte',  'value'=>1000000  ],
                    ['key'=>'creator_score',  'label'=>'Creator Score 4.6+',        'type'=>'gte',  'value'=>4.6      ],
                    ['key'=>'no_violations',  'label'=>'No active violations',      'type'=>'bool', 'value'=>1        ],
                ],
            ],
            10 => [
                'name'      => 'Partner Creator',
                'short_req' => '250K+ followers, 10M+ views',
                'xp_required' => 0,
                'perks' => [
                    'Partner badge',
                    'Premium support',
                    'Top creator campaigns',
                    'Highest marketplace priority',
                    'Advanced revenue programs',
                    'Exclusive partner tools',
                    'Early feature access',
                ],
                'requirements' => [
                    ['key'=>'total_views',   'label'=>'10,000,000 total views',    'type'=>'gte',  'value'=>10000000 ],
                    ['key'=>'followers',     'label'=>'250,000 followers',          'type'=>'gte',  'value'=>250000   ],
                    ['key'=>'creator_score', 'label'=>'Creator Score 4.8+',         'type'=>'gte',  'value'=>4.8      ],
                    ['key'=>'no_violations', 'label'=>'No active violations',       'type'=>'bool', 'value'=>1        ],
                ],
            ],
        ];
    }

    /* ── GET /studio/creator-level ── (used by Studio Dashboard profile card) */
    public function creatorLevel(Request $request): JsonResponse
    {
        $user    = $request->user();
        $profile = $user->profile;

        // Admins are not part of the creator progression - return null data.
        if (in_array($user->role, ['admin', 'super_admin'])) {
            return response()->json(['success' => true, 'data' => null]);
        }

        // Normal users (not yet approved as creator) are at Level 0.
        // Level 1 "Starter Creator" is auto-unlocked only on creator approval.
        if ($user->role !== 'creator') {
            $defs = $this->levelDefinitions();
            return response()->json([
                'success' => true,
                'data'    => [
                    'level_number'  => 0,
                    'level_title'   => 'Level 0 – ' . $defs[0]['name'],
                    'current_level' => 'Level 0 – ' . $defs[0]['name'],
                    'xp'            => 0,
                    'next_level_xp' => $defs[1]['xp_required'],
                    'creator_score' => 0.0,
                    'perks'         => $defs[0]['perks'],
                ],
            ]);
        }

        // Real stats - same as creatorLevelPage()
        $publicVideos = (int) Video::where('user_id', $user->id)
            ->where('status', 'published')->whereNull('deleted_at')->count();
        $totalViews = (int) Video::where('user_id', $user->id)
            ->where('status', 'published')->whereNull('deleted_at')->sum('views_count');
        $followers  = (int) ($profile?->total_followers ?? 0);
        $watchMins  = (int) CreatorAnalytic::where('user_id', $user->id)
            ->where('date', '>=', now()->subDays(90)->toDateString())->sum('watch_time_mins');

        $analytics = CreatorAnalytic::where('user_id', $user->id)
            ->where('date', '>=', now()->subDays(30)->toDateString())
            ->selectRaw('SUM(views) as v, SUM(likes) as l, SUM(comments) as c, SUM(shares) as s')
            ->first();
        $engagementRate = 0.0;
        if (($analytics->v ?? 0) > 0) {
            $engagementRate = round(
                (((float)($analytics->l ?? 0) + (float)($analytics->c ?? 0) + (float)($analytics->s ?? 0))
                 / (float)$analytics->v) * 100, 2
            );
        }

        // Creator score - same formula as creatorLevelPage()
        $noViolation      = !$user->is_banned;
        $lastVideo        = Video::where('user_id', $user->id)->where('status', 'published')
            ->whereNull('deleted_at')->latest()->value('created_at');
        $daysSince        = $lastVideo ? (int) now()->diffInDays($lastVideo, true) : 999;
        $scoreQuality     = $publicVideos > 0 ? min(5.0, (($totalViews / max(1, $publicVideos)) / 10000.0) * 5.0) : 0.0;
        $scoreEngagement  = min(5.0, ($engagementRate / 5.0) * 5.0);
        $scoreConsistency = max(0.0, 5.0 - ($daysSince / 7.0));
        $scoreGrowth      = min(5.0, ($followers / 10000.0) * 5.0);
        $scoreCompliance  = $noViolation ? 5.0 : 0.0;
        $creatorScore     = round(
            $scoreQuality * 0.40 + $scoreEngagement * 0.25 +
            $scoreConsistency * 0.15 + $scoreGrowth * 0.10 + $scoreCompliance * 0.10, 1
        );

        // Compute real XP from activity
        $computedXp = (int) (
            $publicVideos * 50  +
            $totalViews   * 0.5 +
            $followers    * 20  +
            $watchMins    * 1
        );

        // Find real level by walking requirements.
        // Approved creators always start at Level 1 - Level 0 is pre-approval only.
        // Levels with empty requirements (0, 1) are skipped in the advancement check.
        $levelDefs  = $this->levelDefinitions();
        $realLevel  = 1; // minimum for any approved creator
        foreach ($levelDefs as $lvl => $def) {
            if ($lvl < 2)   continue; // levels 0 and 1 are auto-unlocked on approval
            if ($lvl === 10) break;
            $reqs      = $def['requirements'] ?? [];
            if (empty($reqs)) continue;
            $allPassed = true;
            foreach ($reqs as $req) {
                $cur = match ($req['key']) {
                    'public_videos'   => $publicVideos,
                    'total_views'     => $totalViews,
                    'followers'       => $followers,
                    'watch_minutes'   => $watchMins,
                    'engagement_rate' => $engagementRate,
                    'creator_score'   => $creatorScore,
                    'no_violations'   => $noViolation ? 1 : 0,
                    default           => 0,
                };
                $passes = $req['type'] === 'bool' ? (bool)$cur : $cur >= $req['value'];
                if (!$passes) { $allPassed = false; break; }
            }
            if ($allPassed) $realLevel = $lvl;
            else break;
        }
        $realLevel    = min(10, $realLevel);
        $currentDef   = $levelDefs[$realLevel];
        $nextDef      = $levelDefs[$realLevel + 1] ?? null;
        $nextLevelXp  = $nextDef ? $nextDef['xp_required'] : 0;

        // Sync real level back to creator_progress if it changed
        $progress = $user->creatorProgress()->first();
        $storedId = $progress?->current_level_id ?? 1;
        if ($storedId !== ($realLevel + 1)) {
            if ($progress) {
                $progress->current_level_id = $realLevel + 1;
                $progress->current_xp       = $computedXp;
                $progress->save();
            }
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'level_number'  => $realLevel,
                'level_title'   => 'Level ' . $realLevel . ' – ' . $currentDef['name'],
                'current_level' => 'Level ' . $realLevel . ' – ' . $currentDef['name'],
                'xp'            => $computedXp,
                'next_level_xp' => $nextLevelXp ?: $currentDef['xp_required'],
                'creator_score' => $creatorScore,
                'perks'         => $currentDef['perks'],
            ],
        ]);
    }

    public function trackProgress(Request $request): JsonResponse
    {
        $user    = $request->user();
        $profile = $user->profile;
        $mod     = UserModerationSetting::forUser($user->id);

        $publicVideos   = Video::where('user_id', $user->id)->whereNull('deleted_at')->where('status', 'published')->count();
        $totalViews     = (int) Video::where('user_id', $user->id)->whereNull('deleted_at')->sum('views_count');
        $followers      = (int) ($profile?->total_followers ?? 0);
        $watchMins      = (int) CreatorAnalytic::where('user_id', $user->id)->sum('watch_time_mins');
        $totalLikes     = (int) CreatorAnalytic::where('user_id', $user->id)->sum('likes');
        $totalComments  = (int) CreatorAnalytic::where('user_id', $user->id)->sum('comments');
        $totalShares    = (int) CreatorAnalytic::where('user_id', $user->id)->sum('shares');
        $violations     = (int) ($mod->strike_count ?? 0);

        $engagementRate = $totalViews > 0
            ? round(($totalLikes + $totalComments + $totalShares) / $totalViews * 100, 2)
            : 0.0;

        $creatorScore = round(
            min(5.0, ($engagementRate / 2) + ($followers > 0 ? min(1.5, $followers / 1000) : 0) + ($publicVideos > 0 ? min(1.5, $publicVideos / 10) : 0)),
            2
        );

        $levels = [
            ['number' => 1, 'name' => 'Starter Creator'],
            ['number' => 2, 'name' => 'Rising Creator'],
            ['number' => 3, 'name' => 'Active Creator'],
            ['number' => 4, 'name' => 'Trusted Creator'],
            ['number' => 5, 'name' => 'Monetization Eligible'],
        ];

        $allRequirements = [
            2 => [
                ['key' => 'public_videos',   'label' => '5 Public Videos',        'description' => 'Publish at least 5 public videos',          'required' => 5,    'current' => $publicVideos,   'type' => 'count'],
                ['key' => 'total_views',      'label' => '2,000 Total Views',      'description' => 'Gain total 2,000 views on your content',    'required' => 2000, 'current' => $totalViews,     'type' => 'count'],
                ['key' => 'followers',        'label' => '500 Followers',          'description' => 'Reach at least 500 followers',              'required' => 500,  'current' => $followers,      'type' => 'count'],
                ['key' => 'watch_minutes',    'label' => '500 Watch Minutes',      'description' => 'Achieve 500 minutes of watch time',         'required' => 500,  'current' => $watchMins,      'type' => 'count'],
                ['key' => 'engagement_rate',  'label' => 'Engagement Rate 1.5%+',  'description' => 'Maintain at least 1.5% engagement rate',   'required' => 1.5,  'current' => $engagementRate, 'type' => 'rate'],
                ['key' => 'creator_score',    'label' => 'Creator Score 2.5+',     'description' => 'Maintain Creator Score of 2.5 or higher',  'required' => 2.5,  'current' => $creatorScore,   'type' => 'score'],
                ['key' => 'no_violations',    'label' => 'No Active Violations',   'description' => 'Keep your account in good standing',        'required' => 0,    'current' => $violations,     'type' => 'violations'],
            ],
            3 => [
                ['key' => 'public_videos',   'label' => '20 Public Videos',       'description' => 'Publish at least 20 public videos',         'required' => 20,   'current' => $publicVideos,   'type' => 'count'],
                ['key' => 'total_views',      'label' => '10,000 Total Views',     'description' => 'Gain total 10,000 views on your content',   'required' => 10000,'current' => $totalViews,     'type' => 'count'],
                ['key' => 'followers',        'label' => '2,000 Followers',        'description' => 'Reach at least 2,000 followers',            'required' => 2000, 'current' => $followers,      'type' => 'count'],
                ['key' => 'watch_minutes',    'label' => '2,000 Watch Minutes',    'description' => 'Achieve 2,000 minutes of watch time',       'required' => 2000, 'current' => $watchMins,      'type' => 'count'],
                ['key' => 'engagement_rate',  'label' => 'Engagement Rate 2%+',    'description' => 'Maintain at least 2% engagement rate',     'required' => 2.0,  'current' => $engagementRate, 'type' => 'rate'],
                ['key' => 'creator_score',    'label' => 'Creator Score 3.0+',     'description' => 'Maintain Creator Score of 3.0 or higher',  'required' => 3.0,  'current' => $creatorScore,   'type' => 'score'],
                ['key' => 'no_violations',    'label' => 'No Active Violations',   'description' => 'Keep your account in good standing',        'required' => 0,    'current' => $violations,     'type' => 'violations'],
            ],
            4 => [
                ['key' => 'public_videos',   'label' => '50 Public Videos',       'description' => 'Publish at least 50 public videos',         'required' => 50,   'current' => $publicVideos,   'type' => 'count'],
                ['key' => 'total_views',      'label' => '50,000 Total Views',     'description' => 'Gain total 50,000 views on your content',   'required' => 50000,'current' => $totalViews,     'type' => 'count'],
                ['key' => 'followers',        'label' => '10,000 Followers',       'description' => 'Reach at least 10,000 followers',           'required' => 10000,'current' => $followers,      'type' => 'count'],
                ['key' => 'watch_minutes',    'label' => '10,000 Watch Minutes',   'description' => 'Achieve 10,000 minutes of watch time',      'required' => 10000,'current' => $watchMins,      'type' => 'count'],
                ['key' => 'engagement_rate',  'label' => 'Engagement Rate 2.5%+',  'description' => 'Maintain at least 2.5% engagement rate',   'required' => 2.5,  'current' => $engagementRate, 'type' => 'rate'],
                ['key' => 'creator_score',    'label' => 'Creator Score 3.5+',     'description' => 'Maintain Creator Score of 3.5 or higher',  'required' => 3.5,  'current' => $creatorScore,   'type' => 'score'],
                ['key' => 'no_violations',    'label' => 'No Active Violations',   'description' => 'Keep your account in good standing',        'required' => 0,    'current' => $violations,     'type' => 'violations'],
            ],
            5 => [
                ['key' => 'public_videos',   'label' => '100 Public Videos',      'description' => 'Publish at least 100 public videos',        'required' => 100,  'current' => $publicVideos,   'type' => 'count'],
                ['key' => 'total_views',      'label' => '100,000 Total Views',    'description' => 'Gain total 100,000 views on your content',  'required' => 100000,'current'=> $totalViews,     'type' => 'count'],
                ['key' => 'followers',        'label' => '50,000 Followers',       'description' => 'Reach at least 50,000 followers',           'required' => 50000,'current' => $followers,      'type' => 'count'],
                ['key' => 'watch_minutes',    'label' => '50,000 Watch Minutes',   'description' => 'Achieve 50,000 minutes of watch time',      'required' => 50000,'current' => $watchMins,      'type' => 'count'],
                ['key' => 'engagement_rate',  'label' => 'Engagement Rate 3%+',    'description' => 'Maintain at least 3% engagement rate',     'required' => 3.0,  'current' => $engagementRate, 'type' => 'rate'],
                ['key' => 'creator_score',    'label' => 'Creator Score 4.0+',     'description' => 'Maintain Creator Score of 4.0 or higher',  'required' => 4.0,  'current' => $creatorScore,   'type' => 'score'],
                ['key' => 'no_violations',    'label' => 'No Active Violations',   'description' => 'Keep your account in good standing',        'required' => 0,    'current' => $violations,     'type' => 'violations'],
            ],
        ];

        // Determine current level
        $currentLevel = 1;
        for ($lvl = 2; $lvl <= 5; $lvl++) {
            $reqs    = $allRequirements[$lvl] ?? [];
            $allMet  = true;
            foreach ($reqs as $req) {
                $met = $req['type'] === 'violations'
                    ? $req['current'] <= $req['required']
                    : $req['current'] >= $req['required'];
                if (!$met) { $allMet = false; break; }
            }
            if ($allMet) $currentLevel = $lvl; else break;
        }

        $nextLevelNum = min(5, $currentLevel + 1);
        $nextReqs     = $allRequirements[$nextLevelNum] ?? [];

        $completed   = 0;
        $inProgress  = 0;
        $notStarted  = 0;
        $pcts        = [];

        foreach ($nextReqs as &$req) {
            if ($req['type'] === 'violations') {
                $met = $req['current'] <= $req['required'];
                $req['progress_pct'] = $met ? 100 : 0;
                $req['status']       = $met ? 'completed' : 'in_progress';
                $met ? $completed++ : $inProgress++;
            } else {
                $pct = $req['required'] > 0 ? min(100, (int) round($req['current'] / $req['required'] * 100)) : 0;
                $req['progress_pct'] = $pct;
                if ($pct >= 100)      { $req['status'] = 'completed';   $completed++; }
                elseif ($pct > 0)     { $req['status'] = 'in_progress'; $inProgress++; }
                else                  { $req['status'] = 'not_started'; $notStarted++; }
            }
            $pcts[] = $req['progress_pct'];
        }
        unset($req);

        $totalProgress = count($pcts) > 0 ? (int) round(array_sum($pcts) / count($pcts)) : 0;

        $benefits = [
            2 => ['Advanced Analytics', 'Custom Thumbnails', 'Scheduled Posts', 'Priority Support', 'And more...'],
            3 => ['Monetization Access', 'Live Streaming', 'Collaboration Tools', 'Featured Placement', 'And more...'],
            4 => ['Verified Badge', 'Brand Partnerships', 'Advanced Monetization', 'White-glove Support', 'And more...'],
            5 => ['Full Monetization', 'Creator Fund Access', 'Exclusive Events', 'Partnership Opportunities', 'And more...'],
        ];

        return response()->json([
            'success' => true,
            'data'    => [
                'current_level'    => ['number' => $currentLevel, 'name' => $levels[$currentLevel - 1]['name']],
                'next_level'       => ['number' => $nextLevelNum,  'name' => $levels[$nextLevelNum - 1]['name']],
                'all_levels'       => $levels,
                'requirements'     => $nextReqs,
                'progress_summary' => [
                    'completed'      => $completed,
                    'in_progress'    => $inProgress,
                    'not_started'    => $notStarted,
                    'total'          => count($nextReqs),
                    'total_progress' => $totalProgress,
                ],
                'level_benefits'   => $benefits[$nextLevelNum] ?? [],
            ],
        ]);
    }

    public function monetization(Request $request): JsonResponse
    {
        $user   = $request->user();
        $wallet = $user->wallet()->first();

        $earned30d = CreatorAnalytic::where('user_id', $user->id)
            ->where('date', '>=', now()->subDays(30)->toDateString())
            ->sum('earnings');

        return response()->json([
            'success' => true,
            'data'    => [
                'wallet_balance' => $wallet?->balance ?? 0,
                'earned_30d'     => (float) $earned30d,
                'currency'       => 'USD',
                'payout_eligible'=> ($wallet?->balance ?? 0) >= 50,
                'note'           => 'Full monetization dashboard available in Phase 8.',
            ],
        ]);
    }

    private function trend(int|float $current, int|float $previous): string
    {
        if ($previous == 0) return '+0%';
        $pct = round((($current - $previous) / $previous) * 100, 1);
        return ($pct >= 0 ? '+' : '') . $pct . '%';
    }
}
