<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Video;
use App\Services\IpCountryService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * "Nearby in {country}" Explore section (place chips + place cards).
 *
 * There is no structured lat/lng anywhere on `videos` - only the free-text
 * `videos.location` column creators optionally tag on upload (see
 * LocationFeedController, which owns the canonical parsing convention this
 * class reuses): a comma-separated string, most-specific segment first,
 * country last - e.g. "Boudhanath, Kathmandu, Nepal" or just "Kathmandu, Nepal".
 *
 * From that convention:
 *   - the CITY/PLACE for a tag = the segment just before the country. Works
 *     for both a plain 2-part "City, Country" tag and a finer 3+-part
 *     "Spot, City, Country" tag.
 *   - a SPECIFIC SPOT within a place = the first segment, only meaningful
 *     when the tag has 3+ parts (i.e. someone tagged something finer than
 *     city level - a neighbourhood, venue, etc).
 *
 * Because there is no real coordinate data, neither endpoint here can
 * compute a genuine distance. #nearby() intentionally has no "distance"
 * field - `video_count` / `meta` (a recent-activity count) are the honest
 * substitute the mobile place-card should render in that slot instead.
 */
class ExplorePlacesController extends Controller
{
    private const PLACES_WINDOW_DAYS = 30;
    private const SPOTS_WINDOW_DAYS  = 7;
    private const PLACES_LIMIT       = 12;
    private const SPOTS_LIMIT        = 8;

    public function __construct(private readonly IpCountryService $ipCountries) {}

    /**
     * GET /api/v1/explore/places
     *
     * Place-chip row: top places (cities) tagged on published videos within
     * the viewer's detected/selected country over the last 30 days, ordered
     * by video count.
     */
    /**
     * GET /explore/nearby-creators - the People tab's "Creators near you".
     *
     * Creators who post from the viewer's country, ranked by how much they
     * post there and how it performs. Derived from the same free-text
     * videos.location the Nearby section groups on, so a creator appears here
     * because of where they actually film - not a profile field they set once
     * and never revisited.
     *
     * Empty is a legitimate answer for a country with no tagged videos, and the
     * client hides the section rather than padding it with strangers from
     * elsewhere, which would make "near you" a lie.
     */
    public function nearbyCreators(Request $request): JsonResponse
    {
        $country = $this->resolveCountry($request);
        if (! $country['name']) {
            return response()->json(['success' => true, 'country' => null, 'data' => []]);
        }

        $me   = optional($request->user())->id;
        $rows = Cache::remember(
            'explore:nearby-creators:' . Str::slug($country['name']),
            now()->addMinutes(20),
            fn () => DB::table('videos as v')
                ->join('users as u', 'u.id', '=', 'v.user_id')
                ->whereNull('v.deleted_at')
                ->where('v.status', 'published')
                ->whereNotNull('v.location')
                ->whereRaw('LOWER(v.location) LIKE ?', ['%' . Str::lower($country['name'])])
                ->where('u.is_banned', false)
                ->groupBy('u.id', 'u.name', 'u.username', 'u.avatar', 'u.is_verified')
                ->select([
                    'u.id', 'u.name', 'u.username', 'u.avatar', 'u.is_verified',
                    DB::raw('COUNT(*) AS local_videos'),
                    DB::raw('COALESCE(SUM(v.views_count), 0) AS local_views'),
                ])
                ->orderByDesc(DB::raw('COUNT(*)'))
                ->orderByDesc(DB::raw('COALESCE(SUM(v.views_count), 0)'))
                ->limit(20)
                ->get(),
        );

        // Follow state is per-viewer, so it is resolved outside the cache -
        // caching it would show one person's follows to everybody.
        $following = $me
            ? DB::table('followers')
                ->where('follower_id', $me)
                ->where('status', 'accepted')
                ->whereIn('following_id', collect($rows)->pluck('id'))
                ->pluck('following_id')
                ->flip()
            : collect();

        return response()->json([
            'success' => true,
            'country' => $country['name'],
            'data'    => collect($rows)
                // Never suggest the viewer to themselves.
                ->reject(fn ($r) => $me && (int) $r->id === (int) $me)
                ->map(fn ($r) => [
                    'id'           => (int) $r->id,
                    'name'         => $r->name,
                    'username'     => $r->username,
                    'avatar'       => $r->avatar ? Storage::url($r->avatar) : StorageService::defaultAvatarUrl(),
                    'verified'     => (bool) $r->is_verified,
                    'local_videos' => (int) $r->local_videos,
                    'local_views'  => (int) $r->local_views,
                    'is_following' => $following->has($r->id),
                ])->values(),
        ])->header('Cache-Control', 'private, max-age=300');
    }

    public function places(Request $request): JsonResponse
    {
        $country = $this->resolveCountry($request);
        if (!$country['name']) {
            return response()->json(['success' => true, 'country' => null, 'data' => []]);
        }

        $cacheKey = 'explore:places:' . ($country['code'] ?: Str::slug($country['name']));

        $data = Cache::remember($cacheKey, now()->addMinutes(15), function () use ($country) {
            $rows = $this->fetchLocations($country['name'], self::PLACES_WINDOW_DAYS);

            $grouped = [];
            foreach ($rows as $row) {
                $parts = $this->parts($row->location);
                if (count($parts) < 2) {
                    continue; // no country segment to confirm - skip rather than guess
                }

                $place = $parts[count($parts) - 2];
                $key   = Str::lower($place);

                $grouped[$key] ??= ['place' => $place, 'count' => 0];
                $grouped[$key]['count']++;
            }

            usort($grouped, fn ($a, $b) => $b['count'] <=> $a['count']);

            return array_values(array_slice($grouped, 0, self::PLACES_LIMIT));
        });

        return response()->json([
            'success' => true,
            'country' => $country['name'],
            'data'    => $data,
        ])->header('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800');
    }

    /**
     * GET /api/v1/explore/places/{place}/nearby
     *
     * Place-card row for OTHER, finer-grained spots near the picked place
     * (e.g. picking "Kathmandu" surfaces "Boudhanath", "Thamel", ...) -
     * videos whose tag has the picked place as its city segment, grouped by
     * their own (more specific) first segment. Excludes the picked place
     * itself. Empty when the picked place has no finer-grained tags under
     * it - that's a real "no data" state, not an error.
     */
    public function nearby(Request $request, string $place): JsonResponse
    {
        $place   = trim($place);
        $country = $this->resolveCountry($request);

        if ($place === '' || !$country['name']) {
            return response()->json(['success' => true, 'place' => $place, 'data' => []]);
        }

        $cacheKey = 'explore:places:'
            . ($country['code'] ?: Str::slug($country['name']))
            . ':' . Str::slug($place) . ':nearby';

        $data = Cache::remember($cacheKey, now()->addMinutes(15), function () use ($country, $place) {
            $rows = $this->fetchLocations($country['name'], self::SPOTS_WINDOW_DAYS);

            $grouped = [];
            foreach ($rows as $row) {
                $parts = $this->parts($row->location);
                if (count($parts) < 3) {
                    continue; // need spot + city + country to mean anything finer than city-level
                }

                $city = $parts[count($parts) - 2];
                if (strcasecmp($city, $place) !== 0) {
                    continue;
                }

                $spot = $parts[0];
                if (strcasecmp($spot, $place) === 0) {
                    continue; // not "other" than the picked place
                }

                $key = Str::lower($spot);
                if (!isset($grouped[$key])) {
                    $grouped[$key] = [
                        'place'           => $spot,
                        'video_count'     => 0,
                        'sample_video_id' => (string) $row->id,
                        'latest'          => $row->created_at,
                    ];
                }

                $grouped[$key]['video_count']++;
                if ($row->created_at > $grouped[$key]['latest']) {
                    $grouped[$key]['latest']          = $row->created_at;
                    $grouped[$key]['sample_video_id'] = (string) $row->id;
                }
            }

            usort($grouped, fn ($a, $b) => $b['video_count'] <=> $a['video_count']);
            $grouped = array_slice($grouped, 0, self::SPOTS_LIMIT);

            return array_values(array_map(fn ($g) => [
                'place'           => $g['place'],
                'meta'            => $g['video_count'] . ' ' . Str::plural('video', $g['video_count']) . ' this week',
                'video_count'     => $g['video_count'],
                'sample_video_id' => $g['sample_video_id'],
            ], $grouped));
        });

        return response()->json([
            'success' => true,
            'place'   => $place,
            'country' => $country['name'],
            'data'    => $data,
        ])->header('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800');
    }

    /**
     * Published, non-rejected, non-deleted, location-tagged videos whose
     * saved location string contains the country name, created within the
     * last $days days. Same "contains" heuristic as
     * LocationFeedController::nearby() (free-text location, no ISO code
     * stored) - kept consistent with that established precedent.
     */
    private function fetchLocations(string $countryName, int $days)
    {
        $like = '%' . addcslashes($countryName, '%_\\') . '%';

        return Video::query()
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNotNull('location')
            ->where('location', '!=', '')
            ->where('created_at', '>=', now()->subDays($days))
            ->where('location', 'ilike', $like)
            ->select('id', 'location', 'created_at')
            ->get();
    }

    /** "Thamel, Kathmandu, Nepal" -> ['Thamel', 'Kathmandu', 'Nepal'] (trimmed, non-empty segments only). */
    private function parts(string $location): array
    {
        return collect(explode(',', $location))
            ->map(fn ($p) => trim($p))
            ->filter(fn ($p) => $p !== '')
            ->values()
            ->all();
    }

    /**
     * Country resolution precedence: the authenticated user's saved country
     * first (mirrors HashtagController::feedTrending), then IP-based
     * detection via IpCountryService for guests, then the service's default.
     *
     * @return array{code: ?string, name: ?string}
     */
    private function resolveCountry(Request $request): array
    {
        $user = $request->user();

        if ($user) {
            $name = $user->selected_country_name ?: $user->country ?: $user->detected_country_name ?: null;
            if ($name) {
                return ['code' => $user->selected_country_code ?: null, 'name' => (string) $name];
            }
        }

        $detected = $this->ipCountries->lookup($request);
        if (!empty($detected['countryName'])) {
            return ['code' => $detected['countryCode'] ?? null, 'name' => $detected['countryName']];
        }

        return ['code' => IpCountryService::DEFAULT_COUNTRY_CODE, 'name' => IpCountryService::DEFAULT_COUNTRY_NAME];
    }
}
