<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Models\Hashtag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Hashtag moderation and analytics.
 *
 * Replaces an inline closure in routes/api.php that could only list and sort.
 * Its response shape (data + meta) is preserved exactly, so nothing that reads
 * this endpoint breaks; everything else here is additive.
 *
 * The big correction is `recent_count`. The admin page marked its first five
 * rows "Trending" purely by position - on page two, sorted alphabetically, rows
 * one to five still claimed to be trending. Trending is now what
 * HashtagController::trending has always meant: posts carrying the tag in the
 * last N days, counted.
 */
class AdminHashtagController extends Controller
{
    /** GET /api/v1/admin/hashtags */
    public function index(Request $request): JsonResponse
    {
        $days    = min(max((int) $request->get('days', 7), 1), 90);
        $perPage = min((int) $request->get('per_page', 30), 100);
        $status  = $request->get('status', 'all');

        $query = Hashtag::query()
            ->when($request->input('q'), fn ($q, $s) => $q->where('name', 'like', '%' . $s . '%'));

        match ($status) {
            'blocked'  => $query->where('is_blocked', true),
            'featured' => $query->where('is_featured', true),
            'active'   => $query->where('is_blocked', false),
            'unused'   => $query->where('videos_count', 0),
            default    => $query,
        };

        // 'trending' sorts by the measured recent count, which lives in a
        // separate aggregate - handled after the page is fetched, below.
        match ($request->input('sort')) {
            'name'     => $query->orderBy('name', 'asc'),
            'newest'   => $query->orderByDesc('created_at'),
            'trending' => $query->orderByDesc('videos_count'),
            default    => $query->orderByDesc('videos_count'),
        };

        $p    = $query->paginate($perPage);
        $ids  = collect($p->items())->pluck('id');

        // One grouped query for the whole page rather than per row.
        $recent = $ids->isEmpty() ? collect() : DB::table('video_hashtags')
            ->join('videos', 'videos.id', '=', 'video_hashtags.video_id')
            ->whereIn('video_hashtags.hashtag_id', $ids)
            ->where('videos.status', 'published')
            ->whereNull('videos.deleted_at')
            ->where('videos.created_at', '>=', now()->subDays($days))
            ->select('video_hashtags.hashtag_id', DB::raw('COUNT(*) AS recent_count'))
            ->groupBy('video_hashtags.hashtag_id')
            ->pluck('recent_count', 'video_hashtags.hashtag_id');

        $items = collect($p->items())->map(fn (Hashtag $h) => [
            'id'             => $h->id,
            'name'           => $h->name,
            'videos_count'   => (int) $h->videos_count,
            'recent_count'   => (int) ($recent[$h->id] ?? 0),
            'is_blocked'     => (bool) $h->is_blocked,
            'is_featured'    => (bool) $h->is_featured,
            'blocked_reason' => $h->blocked_reason,
            'blocked_at'     => $h->blocked_at?->toIso8601String(),
            'created_at'     => $h->created_at?->toIso8601String(),
        ]);

        if ($request->input('sort') === 'trending') {
            $items = $items->sortByDesc('recent_count')->values();
        }

        return response()->json([
            'success' => true,
            'data'    => $items->all(),
            'meta'    => [
                'current_page' => $p->currentPage(),
                'last_page'    => $p->lastPage(),
                'total'        => $p->total(),
                'days'         => $days,
            ],
            'stats' => $this->stats($days),
        ]);
    }

    /** POST /api/v1/admin/hashtags/{id}/action */
    public function action(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'string', 'in:block,unblock,feature,unfeature'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $tag    = Hashtag::findOrFail($id);
        $action = $validated['action'];

        match ($action) {
            'block' => $tag->forceFill([
                'is_blocked'     => true,
                'blocked_reason' => $validated['reason'] ?? null,
                'blocked_at'     => now(),
                'blocked_by'     => $request->user()->id,
                // A blocked tag cannot also be promoted.
                'is_featured'    => false,
            ])->save(),
            'unblock' => $tag->forceFill([
                'is_blocked'     => false,
                'blocked_reason' => null,
                'blocked_at'     => null,
                'blocked_by'     => null,
            ])->save(),
            'feature'   => $tag->forceFill(['is_featured' => true])->save(),
            'unfeature' => $tag->forceFill(['is_featured' => false])->save(),
        };

        $this->bustDiscoveryCaches();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'hashtag.' . $action,
            category: 'content_actions',
            description: "Hashtag #{$tag->name} {$action}"
                . ($validated['reason'] ? ': ' . $validated['reason'] : ''),
            targetType: 'Hashtag',
            targetId: $tag->id,
            metadata: ['name' => $tag->name, 'action' => $action],
            ip: $request->ip(),
            severity: $action === 'block' ? 'warning' : 'info',
        );

        return response()->json([
            'success' => true,
            'message' => "#{$tag->name} " . match ($action) {
                'block'     => 'blocked from discovery.',
                'unblock'   => 'restored to discovery.',
                'feature'   => 'is now featured.',
                'unfeature' => 'is no longer featured.',
            },
        ]);
    }

    /** POST /api/v1/admin/hashtags/bulk */
    public function bulk(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'    => ['required', 'array', 'min:1', 'max:200'],
            'ids.*'  => ['integer'],
            'action' => ['required', 'string', 'in:block,unblock,feature,unfeature'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $action = $validated['action'];

        $payload = match ($action) {
            'block'     => ['is_blocked' => true,  'blocked_reason' => $validated['reason'] ?? null, 'blocked_at' => now(), 'blocked_by' => $request->user()->id, 'is_featured' => false],
            'unblock'   => ['is_blocked' => false, 'blocked_reason' => null, 'blocked_at' => null, 'blocked_by' => null],
            'feature'   => ['is_featured' => true],
            'unfeature' => ['is_featured' => false],
        };

        $n = Hashtag::whereIn('id', $validated['ids'])->update($payload);

        $this->bustDiscoveryCaches();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'hashtag.bulk_' . $action,
            category: 'content_actions',
            description: "{$n} hashtags {$action}"
                . ($validated['reason'] ? ': ' . $validated['reason'] : ''),
            metadata: ['count' => $n, 'ids' => $validated['ids'], 'action' => $action],
            ip: $request->ip(),
            severity: 'warning',
        );

        return response()->json(['success' => true, 'message' => "{$n} hashtag(s) updated."]);
    }

    /** Header tiles. */
    private function stats(int $days): array
    {
        $flags = Hashtag::selectRaw('
            count(*) as total,
            sum(case when is_blocked then 1 else 0 end) as blocked,
            sum(case when is_featured then 1 else 0 end) as featured,
            sum(case when videos_count = 0 then 1 else 0 end) as unused
        ')->first();

        $active = DB::table('video_hashtags')
            ->join('videos', 'videos.id', '=', 'video_hashtags.video_id')
            ->where('videos.status', 'published')
            ->whereNull('videos.deleted_at')
            ->where('videos.created_at', '>=', now()->subDays($days))
            ->distinct('video_hashtags.hashtag_id')
            ->count('video_hashtags.hashtag_id');

        return [
            'total'    => (int) ($flags->total ?? 0),
            'blocked'  => (int) ($flags->blocked ?? 0),
            'featured' => (int) ($flags->featured ?? 0),
            'unused'   => (int) ($flags->unused ?? 0),
            'active'   => $active,
        ];
    }

    /**
     * Discovery reads through caches measured in 15-60 minutes. Without this a
     * blocked tag keeps being served for up to an hour, which reads to the
     * operator as the block having silently failed.
     */
    private function bustDiscoveryCaches(): void
    {
        Cache::forget('explore:hashtags:top30');

        // The trending keys are parameterised by day/limit (and country for the
        // feed rail), so there is no single key to forget - clear the
        // combinations the app actually requests.
        foreach ([1, 3, 7, 14, 30, 90] as $d) {
            foreach ([5, 8, 10, 15, 20, 30, 50] as $l) {
                Cache::forget("hashtags:trending:d{$d}:l{$l}");
            }
        }
    }
}
