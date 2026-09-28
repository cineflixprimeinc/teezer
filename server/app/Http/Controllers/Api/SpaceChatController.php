<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Space;
use App\Models\SpaceMessage;
use App\Models\SpaceMessageReaction;
use App\Models\SpaceParticipant;
use App\Services\RealtimeBus;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The chat inside a Space - the "Chat" tab on the People sheet.
 *
 * Reading is public (a guest looking into a room sees the conversation, like
 * the feed); posting, reacting and pinning need a seat. Delivery is best-effort
 * realtime over Centrifugo plus the app polling this endpoint, so a dropped
 * event only means a message lands a second late, never lost.
 *
 * A message's role badge (Host / Speaker / Listener) is the sender's CURRENT
 * seat, resolved in one query, not stored on the row - promote a speaker and
 * their old messages read "Speaker" too, which is what the room expects.
 */
class SpaceChatController extends Controller
{
    /** How much recent transcript a room carries; older scrolls off the top. */
    private const WINDOW = 200;

    public function __construct(private readonly StorageService $storage) {}

    /** GET /spaces/{space}/messages */
    public function index(Request $request, Space $space): JsonResponse
    {
        $userId = $request->user()?->id;

        $messages = SpaceMessage::query()
            ->where('space_id', $space->id)
            ->with(['user:id,name,username,avatar,is_verified', 'reactions:id,message_id,user_id,emoji'])
            ->orderByDesc('id')
            ->limit(self::WINDOW)
            ->get()
            ->reverse()
            ->values();

        $roles  = $this->rolesFor($space, $messages->pluck('user_id')->unique()->all());
        $pinned = $messages->firstWhere('is_pinned', true);

        return response()->json([
            'success' => true,
            'data'    => $messages->map(fn ($m) => $this->message($m, $roles, $space, $userId))->all(),
            'pinned'  => $pinned ? $this->message($pinned, $roles, $space, $userId) : null,
        ]);
    }

    /** POST /spaces/{space}/messages */
    public function store(Request $request, Space $space): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:500']]);

        $seat = $this->seatOrNull($request, $space);
        if (! $seat) {
            return response()->json(['success' => false, 'message' => 'Join the space to chat.'], 422);
        }

        $message = SpaceMessage::create([
            'space_id' => $space->id,
            'user_id'  => $request->user()->id,
            'body'     => trim($data['body']),
        ]);
        $message->setRelation('reactions', collect());
        $message->load('user:id,name,username,avatar,is_verified');

        $payload = $this->message($message, collect([$seat->user_id => $seat->role]), $space, $request->user()->id);
        RealtimeBus::publish(["space:{$space->id}"], 'space.message', $payload);

        return response()->json(['success' => true, 'data' => $payload], 201);
    }

    /** POST /spaces/{space}/messages/{message}/react - toggle one emoji. */
    public function react(Request $request, Space $space, SpaceMessage $message): JsonResponse
    {
        abort_unless($message->space_id === $space->id, 404);
        $data = $request->validate(['emoji' => ['required', 'string', 'max:16']]);

        if (! $this->seatOrNull($request, $space)) {
            return response()->json(['success' => false, 'message' => 'Join the space first.'], 422);
        }

        $existing = SpaceMessageReaction::where('message_id', $message->id)
            ->where('user_id', $request->user()->id)
            ->where('emoji', $data['emoji'])
            ->first();

        if ($existing) {
            $existing->delete();
            $reacted = false;
        } else {
            // firstOrCreate, so a racing double-tap cannot break the unique key.
            SpaceMessageReaction::firstOrCreate([
                'message_id' => $message->id,
                'user_id'    => $request->user()->id,
                'emoji'      => $data['emoji'],
            ]);
            $reacted = true;
        }

        $count = SpaceMessageReaction::where('message_id', $message->id)
            ->where('emoji', $data['emoji'])
            ->count();

        RealtimeBus::publish(["space:{$space->id}"], 'space.message_reaction', [
            'message_id' => (string) $message->id,
            'emoji'      => $data['emoji'],
            'count'      => $count,
        ]);

        return response()->json([
            'success' => true,
            'data'    => ['emoji' => $data['emoji'], 'count' => $count, 'reacted' => $reacted],
        ]);
    }

    /** POST /spaces/{space}/messages/{message}/pin - host pins/unpins the banner. */
    public function pin(Request $request, Space $space, SpaceMessage $message): JsonResponse
    {
        abort_unless($message->space_id === $space->id, 404);
        abort_unless($request->user() && $request->user()->id === $space->host_id, 403, 'Only the host can pin.');

        $data = $request->validate(['pinned' => ['required', 'boolean']]);

        DB::transaction(function () use ($space, $message, $data) {
            // At most one banner: pinning a new message clears the previous one.
            if ($data['pinned']) {
                SpaceMessage::where('space_id', $space->id)
                    ->where('is_pinned', true)
                    ->update(['is_pinned' => false]);
            }
            $message->update(['is_pinned' => $data['pinned']]);
        });

        RealtimeBus::publish(["space:{$space->id}"], 'space.message_pinned', [
            'message_id' => (string) $message->id,
            'pinned'     => (bool) $data['pinned'],
        ]);

        return response()->json(['success' => true]);
    }

    /* ── helpers ─────────────────────────────────────────────────────── */

    private function seatOrNull(Request $request, Space $space): ?SpaceParticipant
    {
        if (! $request->user()) {
            return null;
        }
        return SpaceParticipant::where('space_id', $space->id)
            ->where('user_id', $request->user()->id)
            ->whereNull('left_at')
            ->first();
    }

    /** Every sender's current role in one lookup, host forced to 'host'. */
    private function rolesFor(Space $space, array $userIds): \Illuminate\Support\Collection
    {
        $roles = SpaceParticipant::where('space_id', $space->id)
            ->whereIn('user_id', $userIds)
            ->pluck('role', 'user_id');

        return $roles->put($space->host_id, SpaceParticipant::ROLE_HOST);
    }

    private function message(SpaceMessage $m, \Illuminate\Support\Collection $roles, Space $space, ?int $userId): array
    {
        // Group the reactions into the chips the bubble shows: emoji, tally, and
        // whether I am one of the tally so the client can light mine up.
        $reactions = $m->reactions
            ->groupBy('emoji')
            ->map(fn ($group, $emoji) => [
                'emoji'   => $emoji,
                'count'   => $group->count(),
                'reacted' => $userId !== null && $group->contains('user_id', $userId),
            ])
            ->values()
            ->all();

        return [
            'id'         => (string) $m->id,
            'body'       => $m->body,
            'is_pinned'  => (bool) $m->is_pinned,
            'created_at' => $m->created_at?->toIso8601String(),
            'role'       => $space->host_id === $m->user_id
                ? SpaceParticipant::ROLE_HOST
                : ($roles[$m->user_id] ?? SpaceParticipant::ROLE_LISTENER),
            'user'       => [
                'id'       => (string) $m->user_id,
                'name'     => $m->user?->name ?? 'Guest',
                'username' => $m->user?->username,
                'avatar'   => $m->user?->avatar ? $this->storage->url($m->user->avatar) : StorageService::defaultAvatarUrl(),
                'verified' => (bool) ($m->user?->is_verified),
            ],
            'reactions'  => $reactions,
        ];
    }
}
