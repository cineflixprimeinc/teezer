<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\Challenge;
use App\Models\ChallengeParticipant;
use App\Models\User;
use App\Models\Video;
use App\Services\StorageService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Hashtag Challenges for the Explore page - a tag, a prize, a deadline and an
 * entry count, plus the lightweight "Join" tap that is really just an RSVP.
 *
 * Public like `/spaces` and `/explore/hashtags`: guests browse the cards and
 * open a challenge's detail/entries, they just can't tap Join (that needs a
 * session, like taking a seat in a Space does).
 */
class ChallengeController extends Controller
{
    public function __construct(private readonly StorageService $storage) {}

    /** GET /explore/challenges - active challenges, soonest-ending first. */
    public function index(Request $request): JsonResponse
    {
        $perPage = min((int) $request->input('per_page', 20), 50);

        $challenges = Challenge::query()
            ->active()
            ->orderBy('ends_at')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $this->hydrate($challenges->getCollection(), $request->user())->all(),
            'meta'    => [
                'current_page' => $challenges->currentPage(),
                'last_page'    => $challenges->lastPage(),
                'total'        => $challenges->total(),
            ],
        ]);
    }

    /** GET /explore/challenges/{challenge} - one challenge, same shape as an index row. */
    public function show(Request $request, Challenge $challenge): JsonResponse
    {
        $data = $this->hydrate(collect([$challenge]), $request->user())->first();

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * POST /challenges/{challenge}/join - toggle my participation row.
     *
     * Idempotent in both directions, exactly like SpaceReminderController's
     * "Remind me" toggle: the unique index is the real guard, so two taps
     * racing each other land on the same single row rather than a 500.
     */
    public function join(Request $request, Challenge $challenge): JsonResponse
    {
        $userId   = $request->user()->id;
        $existing = ChallengeParticipant::where('challenge_id', $challenge->id)
            ->where('user_id', $userId)
            ->first();

        if ($existing) {
            $existing->delete();
            $joined = false;
        } else {
            try {
                ChallengeParticipant::create([
                    'challenge_id' => $challenge->id,
                    'user_id'      => $userId,
                    'joined_at'    => now(),
                ]);
            } catch (QueryException) {
                // Lost a race with our own second tap - the row already exists,
                // which is exactly what this branch was trying to achieve.
            }
            $joined = true;
        }

        return response()->json([
            'success'            => true,
            'joined'             => $joined,
            'participants_count' => ChallengeParticipant::where('challenge_id', $challenge->id)->count(),
        ]);
    }

    /**
     * GET /explore/challenges/{challenge}/entries - the challenge's video feed.
     *
     * Reuses VideoResource + the same shaping ExploreController::hashtagVideos
     * already does for a hashtag's videos, rather than re-deriving a card shape
     * here - a challenge's entries ARE a hashtag's videos, just windowed.
     */
    public function entries(Request $request, Challenge $challenge): JsonResponse
    {
        if (! $challenge->hashtag_id) {
            return response()->json([
                'success' => true,
                'data'    => [],
                'meta'    => ['current_page' => 1, 'last_page' => 1, 'total' => 0],
            ]);
        }

        $windowStart = $this->windowStart($challenge);

        $videos = Video::with(['user.profile', 'hashtags', 'featuredProducts'])
            ->join('video_hashtags', 'videos.id', '=', 'video_hashtags.video_id')
            ->where('video_hashtags.hashtag_id', $challenge->hashtag_id)
            ->where('videos.status', 'published')
            ->where(fn ($q) => $q->whereNull('videos.moderation_status')->orWhere('videos.moderation_status', '!=', 'rejected'))
            ->whereNull('videos.deleted_at')
            ->where('videos.created_at', '>=', $windowStart)
            ->where('videos.created_at', '<=', $challenge->ends_at)
            ->select('videos.*')
            ->withVisibleCommentsCount()
            ->orderByDesc('videos.created_at')
            ->paginate(20);

        Video::attachViewerFlags($videos, $request->user());

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($videos),
            'meta'    => [
                'current_page' => $videos->currentPage(),
                'last_page'    => $videos->lastPage(),
                'total'        => $videos->total(),
            ],
        ]);
    }

    /** Same window rule as Challenge::entriesCount() - kept in sync with it. */
    private function windowStart(Challenge $challenge): \Illuminate\Support\Carbon
    {
        return ($challenge->starts_at && $challenge->starts_at->greaterThanOrEqualTo($challenge->created_at))
            ? $challenge->starts_at
            : $challenge->created_at;
    }

    /**
     * Shapes a batch of challenges into cards in as few queries as possible:
     * one for every participant row across the whole batch (faces + counts +
     * the "who" line), one for the viewer's following list. Doing this per-row
     * would be N+1 round trips for a page of twenty cards.
     */
    private function hydrate(Collection $challenges, ?User $viewer): Collection
    {
        if ($challenges->isEmpty()) {
            return collect();
        }

        $participants = ChallengeParticipant::whereIn('challenge_id', $challenges->pluck('id'))
            ->with('user:id,name,username,avatar,is_verified')
            ->orderBy('joined_at')
            ->get()
            ->groupBy('challenge_id');

        // "People I follow who joined" - one query for the whole page, same
        // pattern as SpaceController::filtered()'s `following` filter.
        $followingIds = $viewer
            ? DB::table('followers')->where('follower_id', $viewer->id)->pluck('following_id')->all()
            : [];

        return $challenges->map(function (Challenge $c) use ($participants, $viewer, $followingIds) {
            $mine  = $participants->get($c->id, collect());
            $count = $mine->count();

            $faces = $mine->take(3)
                ->map(fn (ChallengeParticipant $p) => $p->user ? [
                    'id'     => $p->user->id,
                    'name'   => $p->user->name,
                    'avatar' => $p->user->avatar ? $this->storage->url($p->user->avatar) : StorageService::defaultAvatarUrl(),
                ] : null)
                ->filter()
                ->values()
                ->all();

            return [
                'id'      => $c->id,
                'tag'     => $c->title,
                'prize'   => $c->prize_description,
                'ends_in' => $this->endsInLabel($c->ends_at),
                'entries' => $this->entriesFor($c),
                'cover'   => [
                    'start_color' => $c->cover_start_color,
                    'end_color'   => $c->cover_end_color,
                ],
                'who'     => $this->whoLine($mine, $followingIds, $count),
                'faces'   => $faces,
                'joined'  => $viewer ? $mine->contains(fn (ChallengeParticipant $p) => $p->user_id === $viewer->id) : false,
            ];
        });
    }

    /**
     * Real entries are a heavier query than a stored counter (see
     * Challenge::entriesCount()), so short-cache it per challenge - same
     * Cache::remember convention as HashtagController::trending(). Keyed on
     * ends_at too, purely so the key rotates if an admin ever edits the
     * deadline rather than serving a stale window forever.
     */
    private function entriesFor(Challenge $challenge): int
    {
        return Cache::remember(
            "challenge:{$challenge->id}:entries:{$challenge->ends_at->timestamp}",
            now()->addMinutes(5),
            fn () => $challenge->entriesCount(),
        );
    }

    /** "ENDS IN 2 DAYS" - the design's urgency framing. */
    private function endsInLabel(?\Illuminate\Support\Carbon $endsAt): string
    {
        if (! $endsAt || $endsAt->isPast()) {
            return 'ENDED';
        }

        $days = now()->diffInDays($endsAt);
        if ($days >= 1) {
            return 'ENDS IN ' . $days . ' DAY' . ($days === 1 ? '' : 'S');
        }

        $hours = now()->diffInHours($endsAt);
        if ($hours >= 1) {
            return 'ENDS IN ' . $hours . ' HOUR' . ($hours === 1 ? '' : 'S');
        }

        $minutes = max(1, now()->diffInMinutes($endsAt));
        return 'ENDS IN ' . $minutes . ' MIN' . ($minutes === 1 ? '' : 'S');
    }

    /**
     * "X and N creators you follow joined" when the viewer follows someone in
     * the room, else a generic "N people joined this week".
     */
    private function whoLine(Collection $mine, array $followingIds, int $count): string
    {
        if ($followingIds) {
            $followed = $mine->filter(fn (ChallengeParticipant $p) => in_array($p->user_id, $followingIds, true));
            if ($followed->isNotEmpty()) {
                $first     = $followed->first()->user;
                $firstName = $first?->name ?: ('@' . ($first?->username ?? 'someone'));
                $others    = $followed->count() - 1;

                return $others > 0
                    ? "{$firstName} and {$others} " . ($others === 1 ? 'other creator you follow joined' : 'creators you follow joined')
                    : "{$firstName} joined";
            }
        }

        return $count > 0
            ? number_format($count) . ' people joined this week'
            : 'Be the first to join';
    }
}
