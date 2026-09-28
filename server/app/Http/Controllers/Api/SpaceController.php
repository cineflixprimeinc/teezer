<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Space;
use App\Models\SpaceParticipant;
use App\Models\SpaceReminder;
use App\Services\MediaPresignService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Spaces for the app - the mobile Spaces tab reads this.
 *
 * One request returns the whole screen: what is live now, what is scheduled
 * next, and what is left to replay. They are one endpoint because they are one
 * page, and three round trips to paint it is a waste on mobile.
 *
 * The older `featured` + `suggested` pair is still here and still means what it
 * always did - the Explore tab's "Live spaces" rail reads those two keys, and
 * this endpoint is shared.
 *
 * Public: the tab is browsable by guests, exactly like the feed. The only parts
 * that need a session are the ones about *you* - `reminded` on a scheduled row,
 * and the "people I follow" filter - and both degrade to their empty answer
 * rather than erroring for a guest.
 */
class SpaceController extends Controller
{
    /** Avatars shown on a suggested row before the "+N" pill takes over. */
    private const PREVIEW_AVATARS = 3;

    /** Faces on a "Happening now" card - the design draws an overlapping three. */
    private const CARD_SPEAKERS = 3;

    /** Rooms per section. The tab is a browse surface, not an archive. */
    private const LIMIT = 20;

    public function __construct(private readonly StorageService $storage) {}

    /**
     * GET /spaces
     *
     * Filters: topic, q, sort (listeners|newest|soon), language,
     * size (any|small|medium|large), following, recorded, open_mic.
     */
    public function index(Request $request): JsonResponse
    {
        $topic = $request->string('topic')->trim()->value();
        $q     = $request->string('q')->trim()->value();
        $me    = $request->user();

        // The featured card is the room with the most listeners right now. It
        // deliberately ignores the topic chips: those sit above "Suggested
        // Spaces" and filter that list, not the hero.
        $featured = Space::query()
            ->where('status', Space::STATUS_LIVE)
            ->with(['host:id,name,username,avatar,is_verified'])
            ->orderByDesc('listeners_count')
            ->orderByDesc('id')
            ->first();

        $suggested = $this->filtered(Space::STATUS_LIVE, $request)
            ->when($featured, fn ($sq) => $sq->whereKeyNot($featured->id))
            ->orderByDesc('listeners_count')
            ->orderByDesc('id')
            ->limit(self::LIMIT)
            ->get();

        // "Happening now" is the same set as the hero + suggested, but as one
        // flat list - the new design has no hero, so the biggest room is just
        // the first card rather than a different shape of card.
        // "newest" means the room that opened most recently; the default is the
        // busiest one. Both fall back to id so the order is never arbitrary.
        // Paginated on its own (`live_page`): this is the one section the tab
        // can plausibly grow past LIMIT rooms in, so it is the one section
        // that scrolls-to-load-more rather than just showing the first page.
        $sort     = $request->string('sort')->trim()->value();
        $livePage = max(1, $request->integer('live_page', 1));
        $liveRaw  = $this->filtered(Space::STATUS_LIVE, $request)
            ->when($sort === 'newest',
                fn ($sq) => $sq->orderByDesc('started_at'),
                fn ($sq) => $sq->orderByDesc('listeners_count'))
            ->orderByDesc('id')
            ->skip(($livePage - 1) * self::LIMIT)
            // One extra row, dropped below - its presence is the "more pages
            // after this one" signal, cheaper than a second count() query.
            ->take(self::LIMIT + 1)
            ->get();
        $liveHasMore = $liveRaw->count() > self::LIMIT;
        $live        = $liveRaw->take(self::LIMIT);

        $scheduled = $this->filtered(Space::STATUS_SCHEDULED, $request)
            ->whereNotNull('scheduled_for')
            // A room whose start time has passed but was never opened is not
            // "upcoming" any more, so it drops off rather than sitting stale.
            ->where('scheduled_for', '>=', now()->subHour())
            ->withCount('reminders')
            ->orderBy('scheduled_for')
            ->limit(self::LIMIT)
            ->get();

        $replays = $this->filtered(Space::STATUS_ENDED, $request)
            ->where('is_recorded', true)
            ->whereNotNull('recording_url')
            ->orderByDesc('ended_at')
            ->limit(self::LIMIT)
            ->get();

        // Which of those scheduled rooms I have already set a reminder on - one
        // query for the whole list rather than one per row.
        $remindedIds = $me && $scheduled->isNotEmpty()
            ? SpaceReminder::query()
                ->where('user_id', $me->id)
                ->whereIn('space_id', $scheduled->pluck('id'))
                ->pluck('space_id')
                ->all()
            : [];

        // Every face on the page in ONE query, grouped by room. Done per-row this
        // would be forty round trips for a page of twenty - the seats are already
        // filtered and ordered here, so each resource just takes its first few.
        $seats = $this->seatsFor($live->pluck('id')->merge($suggested->pluck('id')));

        return response()->json([
            'success' => true,
            'data'    => [
                // The Explore rail's contract - unchanged.
                'featured'  => $featured ? $this->featuredResource($featured) : null,
                'suggested' => $suggested->map(fn (Space $s) => $this->suggestedResource($s, $seats))->all(),

                // The Spaces tab's three sections.
                'live'      => $live->map(fn (Space $s) => $this->liveResource($s, $seats))->all(),
                'scheduled' => $scheduled->map(fn (Space $s) => $this->scheduledResource($s, $remindedIds))->all(),
                'replays'   => $replays->map(fn (Space $s) => $this->replayResource($s))->all(),

                // The header's "N LIVE" pill counts every live room, not the
                // filtered page - it is the state of Spaces, not of this view.
                'live_count'    => Space::where('status', Space::STATUS_LIVE)->count(),
                'live_page'     => $livePage,
                'live_has_more' => $liveHasMore,
            ],
        ]);
    }

    /**
     * The shared filter body. Every section reads the same chips and sheet, so
     * the where-clauses live once and each section adds only its own ordering.
     */
    private function filtered(string $status, Request $request)
    {
        $topic = $request->string('topic')->trim()->value();
        $q     = $request->string('q')->trim()->value();
        $lang  = $request->string('language')->trim()->value();
        $size  = $request->string('size')->trim()->value();
        $me    = $request->user();

        return Space::query()
            ->where('status', $status)
            // Rooms nobody outside can join have no business on a browse tab.
            ->where(fn ($w) => $w->where('audience', Space::AUD_PUBLIC)->orWhereNull('audience'))
            ->when($topic && $topic !== 'trending', fn ($sq) => $sq->where('topic', $topic))
            ->when($lang !== '', fn ($sq) => $sq->where('language', $lang))
            ->when($q !== '', function ($sq) use ($q) {
                $sq->where(function ($w) use ($q) {
                    $w->where('title', 'ilike', "%{$q}%")
                      ->orWhere('description', 'ilike', "%{$q}%")
                      ->orWhereHas('host', fn ($h) =>
                          $h->where('username', 'ilike', "%{$q}%")
                            ->orWhere('name', 'ilike', "%{$q}%")
                      );
                });
            })
            // Room size buckets, by who is in there now.
            ->when($size === 'small',  fn ($sq) => $sq->where('listeners_count', '<', 50))
            ->when($size === 'medium', fn ($sq) => $sq->whereBetween('listeners_count', [50, 500]))
            ->when($size === 'large',  fn ($sq) => $sq->where('listeners_count', '>', 500))
            ->when($request->boolean('recorded'), fn ($sq) => $sq->where('is_recorded', true))
            ->when($request->boolean('open_mic'), fn ($sq) => $sq->where('speaking_permission', Space::SPEAK_EVERYONE))
            // "People I follow" is about me, so it is simply off for a guest
            // rather than an error - the tab still browses signed out.
            ->when($request->boolean('following') && $me, fn ($sq) => $sq->whereIn(
                'host_id',
                DB::table('followers')->where('follower_id', $me->id)->select('following_id')
            ))
            ->with(['host:id,name,username,avatar,is_verified']);
    }

    /**
     * Everyone still seated in the given rooms, host first then speakers then
     * listeners, grouped by room. One query for the whole page.
     */
    private function seatsFor(\Illuminate\Support\Collection $spaceIds): \Illuminate\Support\Collection
    {
        if ($spaceIds->isEmpty()) {
            return collect();
        }

        return SpaceParticipant::query()
            ->whereIn('space_id', $spaceIds->unique()->all())
            ->whereNull('left_at')
            ->with('user:id,name,username,avatar,is_verified')
            ->orderByRaw("CASE role WHEN 'host' THEN 0 WHEN 'speaker' THEN 1 ELSE 2 END")
            ->orderBy('id')
            ->get()
            ->groupBy('space_id');
    }

    /** A "Happening now" card: the room, its faces, and who is hosting. */
    private function liveResource(Space $s, \Illuminate\Support\Collection $seats): array
    {
        $speakers = collect($seats->get($s->id, collect()))
            ->filter(fn (SpaceParticipant $p) => $p->role !== SpaceParticipant::ROLE_LISTENER)
            ->take(self::CARD_SPEAKERS);

        return [
            'id'          => (string) $s->id,
            'title'       => $s->title,
            'description' => (string) $s->description,
            'topic'       => $s->topic,
            'listening'   => $s->listeners_count,
            'speakers_count' => $s->speakers_count,
            'host'        => $this->userResource($s->host),
            'speakers'    => $speakers->map(fn (SpaceParticipant $p) => [
                'id'     => (string) $p->id,
                'name'   => $p->user ? strtok($p->user->name, ' ') : 'Guest',
                'avatar' => $this->avatar($p->user?->avatar),
            ])->values()->all(),
        ];
    }

    /** A row under "Scheduled" - when it starts and who else is going. */
    private function scheduledResource(Space $s, array $remindedIds): array
    {
        return [
            'id'            => (string) $s->id,
            'title'         => $s->title,
            'description'   => (string) $s->description,
            'topic'         => $s->topic,
            'host'          => $this->userResource($s->host),
            // ISO8601 - the app formats it in the device's own timezone, which
            // the server has no business guessing.
            'scheduled_for' => $s->scheduled_for?->toIso8601String(),
            'going'         => (int) ($s->reminders_count ?? 0),
            'reminded'      => in_array($s->id, $remindedIds, true),
        ];
    }

    /** A row under "Replays" - an ended room with something left to hear. */
    private function replayResource(Space $s): array
    {
        return [
            'id'               => (string) $s->id,
            'title'            => $s->title,
            'topic'            => $s->topic,
            'host'             => $this->userResource($s->host),
            'duration_minutes' => $s->durationMinutes(),
            'plays'            => (int) $s->plays_count,
            // recording_url stores the raw object key StreamHub's Egress
            // webhook wrote (App\StreamHub\LiveKitWebhookController) - signed
            // fresh here, same rule as every other media field in the app
            // (a pre-signed URL would go dead after its TTL; the key doesn't).
            'recording_url'    => $s->recording_url
                ? MediaPresignService::signedMediaUrl($s->recording_url)
                : null,
            'ended_at'         => $s->ended_at?->toIso8601String(),
        ];
    }

    /** The hero card: the room plus the faces in it. */
    private function featuredResource(Space $s): array
    {
        // Speakers first - they are who the room is listening to - then anyone
        // else, capped at what the 2x2 grid can show.
        $participants = SpaceParticipant::query()
            ->where('space_id', $s->id)
            ->whereNull('left_at')
            ->with('user:id,name,username,avatar,is_verified')
            ->orderByRaw("CASE role WHEN 'host' THEN 0 WHEN 'speaker' THEN 1 ELSE 2 END")
            ->orderBy('id')
            ->limit(4)
            ->get();

        return [
            'id'          => (string) $s->id,
            'title'       => $s->title,
            'description' => (string) $s->description,
            'topic'       => $s->topic,
            'listening'   => $s->listeners_count,
            'host'        => $this->userResource($s->host),
            'participants' => $participants->map(fn (SpaceParticipant $p) => [
                'id'       => (string) $p->id,
                // The tile shows a first name, not a handle - it sits under a
                // 50px avatar and has one line to do it in.
                'name'     => $p->user ? strtok($p->user->name, ' ') : 'Guest',
                'avatar'   => $this->avatar($p->user?->avatar),
                'role'     => $p->role === SpaceParticipant::ROLE_LISTENER ? 'listener' : 'speaker',
                'verified' => (bool) ($p->user?->is_verified),
                'muted'    => (bool) $p->muted,
            ])->all(),
        ];
    }

    /** A row in the suggested list. */
    private function suggestedResource(Space $s, \Illuminate\Support\Collection $seats): array
    {
        $preview = collect($seats->get($s->id, collect()))->take(self::PREVIEW_AVATARS);

        return [
            'id'          => (string) $s->id,
            'title'       => $s->title,
            'description' => (string) $s->description,
            'topic'       => $s->topic,
            'listening'   => $s->listeners_count,
            'host'        => $this->userResource($s->host),
            'preview'     => $preview->map(fn (SpaceParticipant $p) => [
                'id'     => (string) $p->id,
                'avatar' => $this->avatar($p->user?->avatar),
            ])->values()->all(),
            // The "+N" pill: everyone the row could not fit an avatar for.
            'others'      => max(0, $s->listeners_count - $preview->count()),
        ];
    }

    private function userResource(?\App\Models\User $u): ?array
    {
        if (! $u) {
            return null;
        }
        return [
            'name'     => $u->name,
            'username' => $u->username,
            'avatar'   => $this->avatar($u->avatar),
            'verified' => (bool) $u->is_verified,
        ];
    }

    /** Stored keys are not URLs; the app cannot render one. */
    private function avatar(?string $key): ?string
    {
        return $key ? $this->storage->url($key) : null;
    }
}
