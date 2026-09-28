<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Space;
use App\Models\SpaceParticipant;
use App\Models\Story;
use App\Models\User;
use App\Models\Video;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * "What friends are doing" - the activity timeline on the Friends tab.
 *
 * Three things the people you follow actually did, merged newest-first: posted
 * a video, posted a story, or opened a live Space. All read from the tables
 * that already record them, so there is no activity log to write, backfill or
 * keep consistent - and nothing here can show an event that did not happen.
 *
 * Deliberately NOT included: likes, follows and comments. They are the noisy,
 * privacy-adjacent half of a classic activity feed ("X liked Y's video"), and
 * every major app that shipped one has since removed it.
 */
class FriendsActivityController extends Controller
{
    /** How far back an event can be and still count as "what's happening". */
    private const WINDOW_DAYS = 7;

    /** Rows on the timeline. It is a glance, not an archive. */
    private const LIMIT = 20;

    public function __construct(private readonly StorageService $storage) {}

    /** GET /friends/activity */
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();

        // Accepted follows only - a pending request to a private account does
        // not entitle you to see what they are doing.
        $followingIds = DB::table('followers')
            ->where('follower_id', $me->id)
            ->where('status', 'accepted')
            ->pluck('following_id')
            ->all();

        if (! $followingIds) {
            return response()->json([
                'success' => true,
                'data'    => ['activity' => [], 'in_space' => []],
            ]);
        }

        $since = now()->subDays(self::WINDOW_DAYS);

        $videos = Video::query()
            ->whereIn('user_id', $followingIds)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNull('deleted_at')
            ->where('created_at', '>=', $since)
            ->with('user:id,name,username,avatar,is_verified')
            ->latest('created_at')
            ->limit(self::LIMIT)
            ->get();

        $stories = Story::query()
            ->whereIn('user_id', $followingIds)
            ->active()
            ->where('created_at', '>=', $since)
            ->with('user:id,name,username,avatar,is_verified')
            ->latest('created_at')
            ->limit(self::LIMIT)
            ->get();

        // A live room is the one item here that is happening *now* rather than
        // having happened - it carries a Join button instead of a thumbnail.
        $spaces = Space::query()
            ->whereIn('host_id', $followingIds)
            ->where('status', Space::STATUS_LIVE)
            ->where(fn ($w) => $w->where('audience', Space::AUD_PUBLIC)->orWhereNull('audience'))
            ->with('host:id,name,username,avatar,is_verified')
            ->latest('started_at')
            ->limit(self::LIMIT)
            ->get();

        $activity = collect()
            ->concat($videos->map(fn (Video $v) => [
                // Prefixed so ids stay unique across three source tables - the
                // app uses this as a list key.
                'id'         => "video-{$v->id}",
                'kind'       => 'video',
                'user'       => $this->userResource($v->user),
                'created_at' => $v->created_at?->toIso8601String(),
                'video'      => [
                    'id'        => (string) $v->id,
                    'thumbnail' => $this->url($v->thumbnail_url),
                ],
                'space'      => null,
            ]))
            ->concat($stories->map(fn (Story $s) => [
                'id'         => "story-{$s->id}",
                'kind'       => 'story',
                'user'       => $this->userResource($s->user),
                'created_at' => $s->created_at?->toIso8601String(),
                'video'      => null,
                'space'      => null,
            ]))
            ->concat($spaces->map(fn (Space $s) => [
                'id'         => "space-{$s->id}",
                'kind'       => 'live',
                'user'       => $this->userResource($s->host),
                // Live rooms sort by when they opened, not when the row was made.
                'created_at' => ($s->started_at ?? $s->created_at)?->toIso8601String(),
                'video'      => null,
                'space'      => [
                    'id'        => (string) $s->id,
                    'title'     => $s->title,
                    'listening' => $s->listeners_count,
                ],
            ]))
            ->filter(fn (array $a) => $a['user'] !== null)
            ->sortByDesc('created_at')
            ->values()
            ->take(self::LIMIT)
            ->all();

        return response()->json([
            'success' => true,
            'data'    => [
                'activity' => $activity,
                // Who is sitting in a live room right now - the online rail
                // says "In a space" instead of a fourth identical "Online".
                'in_space' => $this->inSpace($followingIds),
            ],
        ]);
    }

    /**
     * Friends currently seated in a live, public room. Respects nothing extra:
     * a public Space is public, and the room itself already lists them.
     */
    private function inSpace(array $followingIds): array
    {
        return SpaceParticipant::query()
            ->whereIn('space_participants.user_id', $followingIds)
            ->whereNull('space_participants.left_at')
            ->join('spaces', 'spaces.id', '=', 'space_participants.space_id')
            ->where('spaces.status', Space::STATUS_LIVE)
            ->where(fn ($w) => $w->where('spaces.audience', Space::AUD_PUBLIC)->orWhereNull('spaces.audience'))
            ->orderBy('space_participants.id')
            ->get([
                'space_participants.user_id',
                'space_participants.role',
                'spaces.id as space_id',
                'spaces.title',
            ])
            ->unique('user_id')
            ->map(fn ($r) => [
                'user_id'  => (string) $r->user_id,
                'space_id' => (string) $r->space_id,
                'title'    => $r->title,
                'role'     => $r->role,
            ])
            ->values()
            ->all();
    }

    private function userResource(?User $u): ?array
    {
        if (! $u) {
            return null;
        }
        return [
            'id'       => (string) $u->id,
            'name'     => $u->name,
            'username' => $u->username,
            'avatar'   => $this->url($u->avatar),
            'verified' => (bool) $u->is_verified,
        ];
    }

    /** Stored keys are not URLs; the app cannot render one. */
    private function url(?string $key): ?string
    {
        if (! $key) {
            return null;
        }
        return str_starts_with($key, 'http') ? $key : $this->storage->url($key);
    }
}
