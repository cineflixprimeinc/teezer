<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\IpCountryService;
use App\Services\IsoCountries;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class HashtagController extends Controller
{
    public function __construct(private readonly IpCountryService $ipCountries) {}

    /**
     * Hashtags ranked by usage on published videos created in the last N days.
     *
     * GET /api/v1/hashtags/trending?days=7&limit=8
     *
     * Falls back to lifetime `hashtags.videos_count` ordering if the recent
     * window is empty (fresh install, or no uploads in N days yet) so the
     * sidebar never renders as blank for a brand new instance.
     */
    public function trending(Request $request): JsonResponse
    {
        $request->validate([
            'days'  => ['nullable', 'integer', 'min:1',  'max:90'],
            'limit' => ['nullable', 'integer', 'min:1',  'max:50'],
        ]);

        $days  = (int) $request->get('days', 7);
        $limit = (int) $request->get('limit', 8);

        // Public + identical for everyone, but the grouped triple-join is heavy.
        // Cache the resolved rows for 15 min.
        $rows = Cache::remember("hashtags:trending:d{$days}:l{$limit}", now()->addMinutes(15), function () use ($days, $limit) {
            $rows = DB::table('hashtags')
                ->join('video_hashtags', 'hashtags.id', '=', 'video_hashtags.hashtag_id')
                ->join('videos', 'videos.id', '=', 'video_hashtags.video_id')
                ->where('hashtags.is_blocked', false)
                ->where('videos.status', 'published')
                ->whereNull('videos.deleted_at')
                ->where('videos.created_at', '>=', now()->subDays($days))
                ->select('hashtags.id', 'hashtags.name', DB::raw('COUNT(*) AS recent_count'))
                ->groupBy('hashtags.id', 'hashtags.name')
                ->orderByDesc('recent_count')
                ->limit($limit)
                ->get();

            // Lifetime fallback when no recent activity
            if ($rows->isEmpty()) {
                $rows = DB::table('hashtags')
                    ->select('id', 'name', DB::raw('videos_count AS recent_count'))
                    ->where('videos_count', '>', 0)
                    ->orderByDesc('videos_count')
                    ->limit($limit)
                    ->get();
            }

            return $rows;
        });

        $data = $rows->map(fn ($r) => [
            'id'             => (int) $r->id,
            'hashtag'        => '#' . $r->name,
            'name'           => $r->name,
            'count'          => (int) $r->recent_count,
            'display_count'  => $this->compact((int) $r->recent_count) . ' posts',
            'trend_direction'=> 'up', // placeholder; future: compare against prior window
        ]);

        return response()->json([
            'success' => true,
            'data'    => $data,
            'meta'    => ['days' => $days, 'limit' => $limit, 'returned' => $data->count()],
        ])->header('Cache-Control', 'public, max-age=900');
    }

    public function feedTrending(Request $request): JsonResponse
    {
        $request->validate([
            'country_code' => ['nullable', 'string', 'size:2'],
            'limit'        => ['nullable', 'integer', 'min:1', 'max:10'],
            'days'         => ['nullable', 'integer', 'min:1', 'max:30'],
        ]);

        $limit   = min((int) $request->get('limit', 5), 10);
        $days    = (int) $request->get('days', 7);
        $country = $this->resolveCountry($request);

        // Phase 1 - country-specific trending (primary focus). This is the
        // heaviest query (quadruple join + scoring); cache per country for 30 min.
        $countryItems = $country['code']
            ? Cache::remember(
                "hashtags:feedtrend:c{$country['code']}:d{$days}:l{$limit}",
                now()->addMinutes(30),
                fn () => $this->trendRows($country['code'], $country['name'], $days, $limit),
            )
            : collect();

        // Phase 2 - supplement with global when country results are thin
        $remaining = $limit - $countryItems->count();
        $globalItems = collect();
        if ($remaining > 0) {
            $excludeNames = $countryItems->pluck('name')->toArray();
            $globalItems  = $this->trendRows(null, 'Global', $days, $remaining, $excludeNames);

            // Last resort: lifetime counts when no recent activity at all
            if ($globalItems->isEmpty()) {
                $globalItems = $this->lifetimeFallback($remaining, $excludeNames);
            }
        }

        $countryName = $country['name'];
        $countryCode = $country['code'];

        $format = function ($row, string $scope) use ($countryCode, $countryName) {
            $isCountry = $scope === 'country' && $countryCode;
            return [
                'hashtag'       => '#' . $row->name,
                'name'          => $row->name,
                'posts_count'   => (int) $row->usage_count,
                'display_count' => $this->compact((int) $row->usage_count) . ' posts',
                'trend_label'   => $isCountry ? 'Trending in ' . $countryName : 'Trending Globally',
                'score'         => round((float) $row->score, 2),
                'scope'         => $scope,
            ];
        };

        $items = $countryItems->map(fn ($r) => $format($r, 'country'))
            ->concat($globalItems->map(fn ($r) => $format($r, 'global')))
            ->values();

        return response()->json([
            'success'      => true,
            'country'      => $countryName,
            'country_code' => $countryCode,
            'items'        => $items,
            'meta'         => ['days' => $days, 'limit' => $limit],
        ]);
    }

    /**
     * Score formula (higher weight = stronger signal):
     *   posts × 2        - frequency of use (core signal)
     *   views ÷ 50       - reach
     *   likes ÷ 5        - approval
     *   comments × 2     - conversation (high value)
     *   shares × 3       - spread (highest value - people actively promoting)
     *   recency_bonus    - extra 3 pts per post made in the last 24 h (velocity)
     */
    private function trendRows(?string $countryCode, string $countryName, int $days, int $limit, array $excludeNames = [])
    {
        return DB::table('hashtags')
            ->join('video_hashtags', 'hashtags.id', '=', 'video_hashtags.hashtag_id')
            ->join('videos', 'videos.id', '=', 'video_hashtags.video_id')
            ->leftJoin('users', 'users.id', '=', 'videos.user_id')
            ->where('hashtags.is_blocked', false)
            ->whereIn('videos.status', ['published', 'unlisted'])
            ->whereNull('videos.deleted_at')
            ->where('videos.created_at', '>=', now()->subDays($days))
            ->when($countryCode, function ($query) use ($countryCode, $countryName) {
                $query->where(function ($q) use ($countryCode, $countryName) {
                    $q->whereRaw('UPPER(video_hashtags.country_code) = ?', [strtoupper($countryCode)])
                      ->orWhereRaw('UPPER(users.selected_country_code) = ?', [strtoupper($countryCode)])
                      ->orWhereRaw('UPPER(users.detected_country_code) = ?', [strtoupper($countryCode)])
                      ->orWhere('video_hashtags.country_name', $countryName)
                      ->orWhere('users.country', $countryName);
                });
            })
            ->when($excludeNames, fn ($q) => $q->whereNotIn('hashtags.name', $excludeNames))
            ->select(
                'hashtags.name',
                DB::raw('COUNT(*) AS usage_count'),
                DB::raw('COALESCE(SUM(videos.views_count), 0) AS views_count'),
                DB::raw('COALESCE(SUM(videos.likes_count), 0) AS likes_count'),
                DB::raw('COALESCE(SUM(videos.comments_count), 0) AS comments_count'),
                DB::raw('COALESCE(SUM(videos.shares_count), 0) AS shares_count'),
                DB::raw('
                    COUNT(*) * 2.0
                    + COALESCE(SUM(videos.views_count), 0) / 50.0
                    + COALESCE(SUM(videos.likes_count), 0) / 5.0
                    + COALESCE(SUM(videos.comments_count), 0) * 2.0
                    + COALESCE(SUM(videos.shares_count), 0) * 3.0
                    + SUM(CASE WHEN videos.created_at >= NOW() - INTERVAL \'1 day\' THEN 3.0 ELSE 0 END)
                AS score')
            )
            ->groupBy('hashtags.name')
            ->orderByDesc('score')
            ->orderByDesc('usage_count')
            ->limit($limit)
            ->get();
    }

    private function lifetimeFallback(int $limit, array $excludeNames = [])
    {
        return DB::table('hashtags')
            ->select(
                'name',
                DB::raw('videos_count AS usage_count'),
                DB::raw('0 AS views_count'),
                DB::raw('0 AS likes_count'),
                DB::raw('0 AS comments_count'),
                DB::raw('0 AS shares_count'),
                DB::raw('CAST(videos_count AS NUMERIC(10,2)) AS score'),
            )
            ->where('videos_count', '>', 0)
            ->when($excludeNames, fn ($q) => $q->whereNotIn('name', $excludeNames))
            ->orderByDesc('videos_count')
            ->limit($limit)
            ->get();
    }

    private function resolveCountry(Request $request): array
    {
        $user = $request->user();
        $code = strtoupper((string) $request->query('country_code'));

        if (!$code && $user) {
            $code = strtoupper((string) ($user->selected_country_code ?: $this->countryNameToCode((string) $user->country) ?: $user->detected_country_code));
        }

        if ($code && IsoCountries::isValid($code)) {
            return ['code' => $code, 'name' => IsoCountries::nameFor($code)];
        }

        if ($user) {
            $resolved = $this->countryNameToCode((string) ($user->selected_country_name ?: $user->country ?: $user->detected_country_name));
            if ($resolved) {
                return ['code' => $resolved, 'name' => IsoCountries::nameFor($resolved)];
            }
        }

        $detected = $this->ipCountries->lookup($request);
        if (!empty($detected['countryCode']) && IsoCountries::isValid($detected['countryCode'])) {
            $detectedCode = strtoupper($detected['countryCode']);
            return ['code' => $detectedCode, 'name' => $detected['countryName'] ?: IsoCountries::nameFor($detectedCode)];
        }

        return ['code' => null, 'name' => 'Global'];
    }

    private function countryNameToCode(string $name): ?string
    {
        $name = trim($name);
        if ($name === '') return null;

        foreach (IsoCountries::map() as $code => $label) {
            if (strcasecmp($label, $name) === 0) return $code;
        }

        if (strcasecmp($name, 'USA') === 0 || strcasecmp($name, 'United States of America') === 0) {
            return 'US';
        }

        return null;
    }

    /**
     * 1234 → "1.2K", 1500000 → "1.5M"
     */
    private function compact(int $n): string
    {
        if ($n >= 1_000_000) return rtrim(rtrim(number_format($n / 1_000_000, 1), '0'), '.') . 'M';
        if ($n >= 1_000)     return rtrim(rtrim(number_format($n / 1_000, 1), '0'), '.') . 'K';
        return (string) $n;
    }
}
