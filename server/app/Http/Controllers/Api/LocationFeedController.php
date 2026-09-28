<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\Video;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Location feed - posts a creator MANUALLY tagged with a place during upload
 * or a later edit (the free-text `videos.location` column). It is never based
 * on auto-detected country / IP / GPS; matching is on the exact saved string.
 */
class LocationFeedController extends Controller
{
    /** GET /api/v1/locations/{slug}/videos?type=&sort=&time=&page=&per_page= */
    public function videos(Request $request, string $slug): JsonResponse
    {
        $location = $this->resolveSlug($slug);

        if ($location === null) {
            return response()->json([
                'success'  => true,
                'location' => null,
                'data'     => [],
                'meta'     => ['current_page' => 1, 'last_page' => 1, 'per_page' => 24, 'total' => 0, 'next_page_url' => null],
            ]);
        }

        $type = $request->get('type', 'all');     // all | video | photo | text
        $sort = $request->get('sort', 'popular');  // popular | recent | most_liked | most_viewed
        $time = $request->get('time', 'all');      // all | today | week | month

        // Only published posts that carry this EXACT manually-saved location.
        $query = Video::query()
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->where('location', $location)
            // `user.profile`, not `user`: VideoResource reads the creator's
            // follower/like totals off the profile, so loading the user alone
            // still lazy-loaded one profile per row.
            ->with(['user.profile', 'featuredProducts']);

        match ($type) {
            'video' => $query->whereNotIn('media_type', ['image', 'image_carousel', 'text']),
            'photo' => $query->whereIn('media_type', ['image', 'image_carousel']),
            'text'  => $query->where('media_type', 'text'),
            default => null,
        };

        match ($time) {
            'today' => $query->where('created_at', '>=', now()->startOfDay()),
            'week'  => $query->where('created_at', '>=', now()->subWeek()),
            'month' => $query->where('created_at', '>=', now()->subMonth()),
            default => null,
        };

        match ($sort) {
            'recent'      => $query->orderByDesc('created_at'),
            'most_liked'  => $query->orderByDesc('likes_count')->orderByDesc('created_at'),
            'most_viewed' => $query->orderByDesc('views_count')->orderByDesc('created_at'),
            default       => $query->orderByDesc('views_count')->orderByDesc('likes_count')->orderByDesc('created_at'),
        };

        $paginator = $query->paginate((int) min(48, max(1, (int) $request->get('per_page', 24))));

        Video::attachViewerFlags($paginator, $request->user());

        return response()->json([
            'success'  => true,
            'location' => $this->header($slug, $location),
            'data'     => VideoResource::collection($paginator),
            'meta'     => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
                'next_page_url'=> $paginator->nextPageUrl(),
            ],
        ]);
    }

    /**
     * GET /api/v1/locations/{slug}/nearby - creators who post from the same
     * country (derived from the saved location's trailing country segment).
     */
    public function nearby(Request $request, string $slug): JsonResponse
    {
        $location = $this->resolveSlug($slug);
        if ($location === null) {
            return response()->json(['success' => true, 'country' => null, 'data' => []]);
        }

        $parts   = collect(explode(',', $location))->map(fn ($p) => trim($p))->filter()->values();
        $country = (string) $parts->last();
        if ($country === '') {
            return response()->json(['success' => true, 'country' => null, 'data' => []]);
        }

        $like = '%' . addcslashes($country, '%_\\');

        // Distinct creators with published posts anywhere in this country.
        $rows = Video::query()
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->where('location', 'ilike', $like)
            ->selectRaw('user_id, COUNT(*) as posts_count, MAX(location) as sample_location')
            ->groupBy('user_id')
            ->orderByDesc('posts_count')
            ->limit(24)
            ->get();

        $users = \App\Models\User::query()
            ->whereIn('id', $rows->pluck('user_id'))
            ->where('is_banned', false)
            ->where('is_active', true)
            ->with('profile')
            ->get()
            ->keyBy('id');

        $data = $rows->map(function ($row) use ($users) {
            $u = $users->get($row->user_id);
            if (! $u) {
                return null;
            }
            return [
                'id'              => $u->id,
                'username'        => $u->username,
                'name'            => $u->name,
                'avatar'          => $u->avatar ? \Illuminate\Support\Facades\Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified'     => (bool) $u->is_verified,
                'is_following'    => false,
                'followers_count' => (int) ($u->profile?->total_followers ?? 0),
                'posts_count'     => (int) $row->posts_count,
                'location'        => $row->sample_location,
            ];
        })->filter()->values();

        return response()->json(['success' => true, 'country' => $country, 'data' => $data]);
    }

    /** Resolve the URL slug back to the exact stored location string. */
    private function resolveSlug(string $slug): ?string
    {
        return Video::query()
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->whereNotNull('location')
            ->where('location', '!=', '')
            ->distinct()
            ->pluck('location')
            ->first(fn ($loc) => Str::slug((string) $loc) === $slug);
    }

    /** Aggregate header stats for the location (across every post tagged with it). */
    /**
     * GET /api/v1/locations/{slug}/about - the About tab.
     *
     * Every figure is derived from posts actually tagged with this place. The
     * design also asked for "distance from you", which is not here: the videos
     * table stores the place as free text with no coordinates, so a distance
     * would have to be invented. An absent row is better than a confident wrong
     * number, and the client simply omits what the API does not send.
     */
    public function about(Request $request, string $slug): JsonResponse
    {
        $location = $this->resolveSlug($slug);
        if ($location === null) {
            return response()->json(['success' => true, 'data' => null]);
        }

        $base = fn () => Video::query()
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->where('location', $location);

        // Busiest calendar month across all time. to_char keeps the grouping in
        // the database rather than pulling every row back to count in PHP.
        $busiest = $base()
            ->selectRaw("to_char(created_at, 'FMMonth') as label, COUNT(*) as posts")
            ->groupBy('label')->orderByDesc('posts')->first();

        // When people POST from here, which is not the same as when they watch -
        // labelled accordingly rather than dressed up as activity.
        $hour = $base()
            ->selectRaw('EXTRACT(HOUR FROM created_at)::int as h, COUNT(*) as posts')
            ->groupBy('h')->orderByDesc('posts')->first();

        $topics = $base()
            ->join('video_hashtags', 'video_hashtags.video_id', '=', 'videos.id')
            ->join('hashtags', 'hashtags.id', '=', 'video_hashtags.hashtag_id')
            ->selectRaw('hashtags.name as name, COUNT(*) as uses')
            ->groupBy('hashtags.name')->orderByDesc('uses')->limit(3)->pluck('name')->all();

        return response()->json([
            'success' => true,
            'data'    => [
                'busiest_month' => $busiest ? [
                    'label' => trim($busiest->label),
                    'posts' => (int) $busiest->posts,
                ] : null,
                'peak_hour' => $hour ? [
                    'hour'  => (int) $hour->h,
                    'posts' => (int) $hour->posts,
                ] : null,
                'top_topics' => $topics,
            ],
        ]);
    }

    /**
     * GET /api/v1/locations/{slug}/nearby-places - other places posted from in
     * the same country, busiest first.
     *
     * Distinct from nearby(), which returns CREATORS. "Nearby" is by country,
     * not by radius, for the same reason the About tab has no distance: these
     * locations are free text with no coordinates, so there is nothing to
     * measure a radius against. Named by what it actually does.
     */
    public function nearbyPlaces(Request $request, string $slug): JsonResponse
    {
        $location = $this->resolveSlug($slug);
        if ($location === null) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $parts   = collect(explode(',', $location))->map(fn ($p) => trim($p))->filter()->values();
        $country = (string) $parts->last();
        if ($country === '') {
            return response()->json(['success' => true, 'data' => []]);
        }

        $rows = Video::query()
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->where('location', 'ilike', '%' . addcslashes($country, '%_\\'))
            ->where('location', '!=', $location) // not the place we are already on
            ->selectRaw('location, COUNT(*) as posts_count')
            ->groupBy('location')
            ->orderByDesc('posts_count')
            ->limit(10)
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $rows->map(fn ($r) => [
                'slug'         => \Illuminate\Support\Str::slug($r->location),
                'display_name' => $r->location,
                'name'         => trim(explode(',', $r->location)[0]),
                'posts_count'  => (int) $r->posts_count,
            ])->all(),
        ]);
    }

    private function header(string $slug, string $location): array
    {
        $base = Video::query()
            ->where('status', 'published')
            ->whereNull('deleted_at')
            ->where('location', $location);

        $parts = collect(explode(',', $location))->map(fn ($p) => trim($p))->filter()->values();

        return [
            'slug'           => $slug,
            'display_name'   => $location,
            'name'           => $parts->first() ?: $location,
            'region'         => $parts->count() > 1 ? $parts->slice(1)->implode(', ') : null,
            'posts_count'    => (clone $base)->count(),
            'views_count'    => (int) (clone $base)->sum('views_count'),
            'creators_count' => (int) (clone $base)->distinct()->count('user_id'),
        ];
    }
}
