<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Space;
use App\Models\SpaceParticipant;
use App\Services\StorageService;
use App\StreamHub\StreamHubService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Hosting a Space: POST /spaces.
 *
 * Two shapes, from the "Start now" toggle on the create sheet - live
 * immediately, or scheduled for later. A scheduled room has no seats and no
 * audio until its host opens it; a live one seats the host on the spot, because
 * a live room with nobody in it is a contradiction.
 *
 * The cover is optional and goes to R2 through StorageService, the same disk
 * every other upload uses. No cover is not an error - the app draws a branded
 * gradient for rooms without artwork.
 */
class SpaceCreateController extends Controller
{
    /** One live room per host at a time: two would split their own audience. */
    private const ONE_LIVE_PER_HOST = true;

    public function __construct(
        private readonly StorageService $storage,
        private readonly StreamHubService $streamHub,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title'         => ['required', 'string', 'max:120'],
            'description'   => ['nullable', 'string', 'max:300'],
            'topic'         => ['nullable', 'string', 'max:40'], // the single Category
            'start_now'     => ['sometimes', 'boolean'],
            // Only read when start_now is false; must be in the future.
            'scheduled_for' => ['nullable', 'date', 'after:now'],
            'cover'         => ['nullable', 'image', 'max:5120', 'mimes:jpeg,png,webp'],

            // Discovery / display.
            'topics'         => ['nullable', 'array', 'max:3'],
            'topics.*'       => ['string', 'max:40'],
            'tags'           => ['nullable', 'array', 'max:10'],
            'tags.*'         => ['string', 'max:30'],
            'language'       => ['nullable', 'string', 'max:10'],
            'audience'       => ['nullable', 'in:public,private,invite'],
            // null = Unlimited (§ Audience Limit).
            'audience_limit' => ['nullable', 'integer', 'min:2', 'max:1000000'],
            'share_to_feed'  => ['sometimes', 'boolean'],

            // Speaking policy + audio (§1, §5).
            'speaking_permission' => ['nullable', 'in:everyone,request,host_only'],
            'audio_quality'       => ['nullable', 'in:standard,high,ultra'],
            'allow_screen_sharing' => ['sometimes', 'boolean'],

            // Room behaviour + capture flags.
            'is_recorded'            => ['sometimes', 'boolean'],
            'live_captions'          => ['sometimes', 'boolean'],
            'noise_cancellation'     => ['sometimes', 'boolean'],
            'allow_speaker_requests' => ['sometimes', 'boolean'],
            'enable_chat'            => ['sometimes', 'boolean'],
            'allow_reactions'        => ['sometimes', 'boolean'],
            'enable_polls'           => ['sometimes', 'boolean'],
            'qa_enabled'             => ['sometimes', 'boolean'],

            // Moderation.
            'content_warning' => ['nullable', 'string', 'max:200'],
            'blocked_words'   => ['nullable', 'string', 'max:2000'],

            // Line-up: user ids invited on stage.
            'co_host_ids'   => ['nullable', 'array', 'max:10'],
            'co_host_ids.*' => ['integer', 'exists:users,id'],
            'speaker_ids'   => ['nullable', 'array', 'max:20'],
            'speaker_ids.*' => ['integer', 'exists:users,id'],

            // Followers-only allowlist: who a "private" room admits besides the
            // host/moderators/invitees (§ Followers Only).
            'allowed_follower_ids'   => ['nullable', 'array', 'max:100'],
            'allowed_follower_ids.*' => ['integer', 'exists:users,id'],

            // Room extras.
            'room_rules'            => ['nullable', 'array'],
            'room_rules.*'          => ['string', 'in:kind,topic,no_record,no_promo'],
            'gifts_enabled'         => ['sometimes', 'boolean'],
            'waiting_room_enabled'  => ['sometimes', 'boolean'],
            'sound_clips_enabled'   => ['sometimes', 'boolean'],
            // The stage only holds so many live mics - always a real, capped
            // number (never unlimited). Omitted requests fall back to 100.
            'speaker_slots'         => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $user     = $request->user();
        $startNow = (bool) ($data['start_now'] ?? true);

        if (! $startNow && empty($data['scheduled_for'])) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors'  => ['scheduled_for' => ['Pick when the space should start.']],
            ], 422);
        }

        if (self::ONE_LIVE_PER_HOST && $startNow) {
            $alreadyLive = Space::where('host_id', $user->id)
                ->where('status', Space::STATUS_LIVE)
                ->exists();
            if ($alreadyLive) {
                return response()->json([
                    'success' => false,
                    'message' => 'You are already hosting a live space. End it first.',
                ], 422);
            }
        }

        $coverKey = null;
        if ($request->hasFile('cover')) {
            $coverKey = $this->storage->storeImage($request->file('cover'), 'spaces/covers');
        }

        // Invite lists: de-duped, and never the host themselves (they are the host,
        // not their own guest). A co-host is also a speaker, so drop overlap.
        $coHostIds  = array_values(array_diff(array_unique(array_map('intval', $data['co_host_ids'] ?? [])), [$user->id]));
        $speakerIds = array_values(array_diff(array_unique(array_map('intval', $data['speaker_ids'] ?? [])), array_merge([$user->id], $coHostIds)));

        // Everything the form decided, resolved to concrete values (booleans keep
        // the design's defaults when a field is omitted).
        $audience = $data['audience'] ?? Space::AUD_PUBLIC;

        $settings = [
            'topics'                 => array_slice(array_values($data['topics'] ?? []), 0, 3),
            'tags'                   => array_values($data['tags'] ?? []),
            'language'               => $data['language'] ?? 'en',
            'audience'               => $audience,
            // A private / invite-only room needs a shareable secret to let people in.
            'invite_token'           => $audience === Space::AUD_PUBLIC ? null : Str::random(24),
            'audience_limit'         => $data['audience_limit'] ?? null, // null = unlimited
            'speaking_permission'    => $data['speaking_permission'] ?? Space::SPEAK_REQUEST,
            'audio_quality'          => $data['audio_quality'] ?? 'standard',
            'allow_screen_sharing'   => $request->boolean('allow_screen_sharing', false),
            'share_to_feed'          => $request->boolean('share_to_feed', true),
            'is_recorded'            => $request->boolean('is_recorded', false),
            'live_captions'          => $request->boolean('live_captions', false),
            'noise_cancellation'     => $request->boolean('noise_cancellation', true),
            'allow_speaker_requests' => $request->boolean('allow_speaker_requests', true),
            'enable_chat'            => $request->boolean('enable_chat', true),
            'allow_reactions'        => $request->boolean('allow_reactions', true),
            'enable_polls'           => $request->boolean('enable_polls', false),
            'qa_enabled'             => $request->boolean('qa_enabled', false),
            'content_warning'        => $data['content_warning'] ?? null,
            'blocked_words'          => $data['blocked_words'] ?? null,
            'co_host_ids'            => $coHostIds,
            'speaker_ids'            => $speakerIds,
            // Co-hosts run the room alongside the host - they seed the moderators.
            'moderator_ids'          => $coHostIds,
            'blocked_user_ids'       => [],
            // Followers-only allowlist (only meaningful when audience = private).
            'allowed_follower_ids'   => array_values(array_unique(array_map('intval', $data['allowed_follower_ids'] ?? []))),
            // Room extras.
            'room_rules'             => array_values($data['room_rules'] ?? ['kind', 'topic']),
            'gifts_enabled'          => $request->boolean('gifts_enabled', false),
            'waiting_room_enabled'   => $request->boolean('waiting_room_enabled', false),
            'sound_clips_enabled'    => $request->boolean('sound_clips_enabled', false),
            'speaker_slots'          => $data['speaker_slots'] ?? 100,
        ];

        $space = DB::transaction(function () use ($data, $user, $startNow, $coverKey, $settings) {
            $space = Space::create(array_merge([
                'host_id'         => $user->id,
                'title'           => $data['title'],
                'description'     => $data['description'] ?? null,
                // The single Category the discovery chips/admin filter key off.
                // The create form only collects the multi-select `topics`, so the
                // first pick doubles as the category when `topic` itself is absent.
                'topic'           => $data['topic'] ?? ($data['topics'][0] ?? null),
                'cover_url'       => $coverKey,
                'status'          => $startNow ? Space::STATUS_LIVE : Space::STATUS_SCHEDULED,
                'started_at'      => $startNow ? now() : null,
                'scheduled_for'   => $startNow ? null : $data['scheduled_for'],
                // The host is the first listener and the first speaker, but only
                // once the room is actually open.
                'listeners_count' => $startNow ? 1 : 0,
                'speakers_count'  => $startNow ? 1 : 0,
                'peak_listeners'  => $startNow ? 1 : 0,
            ], $settings));

            if ($startNow) {
                SpaceParticipant::create([
                    'space_id'  => $space->id,
                    'user_id'   => $user->id,
                    'role'      => SpaceParticipant::ROLE_HOST,
                    // Unmuted: you opened a room to talk. The mic still needs the
                    // OS permission prompt on the client before anything is sent.
                    'muted'     => false,
                    'joined_at' => now(),
                ]);
            }

            return $space;
        });

        return response()->json([
            'success' => true,
            'message' => $startNow ? 'You are live.' : 'Space scheduled.',
            'data'    => [
                'id'            => (string) $space->id,
                'title'         => $space->title,
                'status'        => $space->status,
                'topic'         => $space->topic,
                'cover'         => $coverKey ? $this->storage->url($coverKey) : null,
                'scheduled_for' => $space->scheduled_for?->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * POST /spaces/{space}/end - the host closing their own room.
     *
     * Distinct from the admin's end(): this one is the host's own door, and it
     * is the only way a room a user opened ever stops being live.
     */
    public function end(Request $request, Space $space): JsonResponse
    {
        if ($space->host_id !== $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'Only the host can end this space.'], 403);
        }
        if (! $space->isLive()) {
            return response()->json(['success' => false, 'message' => 'This space is not live.'], 422);
        }

        DB::transaction(function () use ($space) {
            $space->update([
                'status'          => Space::STATUS_ENDED,
                'ended_at'        => now(),
                'listeners_count' => 0,
                'speakers_count'  => 0,
            ]);
            $space->participants()->whereNull('left_at')->update([
                'left_at'        => now(),
                'rtc_session_id' => null,
                'rtc_track_name' => null,
                'published_at'   => null,
            ]);
        });

        // Closes the LiveKit room itself (disconnects anyone still in it) and
        // stops any active recording so Egress finalizes and uploads what it
        // has rather than being cut off mid-upload by the room disappearing.
        $this->streamHub->stopRecording($space);
        $this->streamHub->endRoom($space);

        return response()->json(['success' => true, 'message' => 'Space ended.']);
    }

    /**
     * POST /spaces/{space}/invite - host or moderator invites a specific user
     * to join. Built for Global Teezer Control's spaces_invitations_enabled
     * - no invite endpoint existed before this; the room is otherwise only
     * discoverable via the public listing or a shared link.
     *
     * Sends an in-app notification carrying the space id so the client can
     * deep-link straight to join() - no new table, reuses NotificationService
     * exactly like every other notification type in the app.
     */
    public function invite(Request $request, Space $space, \App\Services\NotificationService $notifications): JsonResponse
    {
        abort_unless($request->user() && $space->isModerator((int) $request->user()->id), 403, 'Only the host or a moderator can invite someone.');

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        if (! $space->isLive() && $space->status !== \App\Models\Space::STATUS_SCHEDULED) {
            return response()->json(['success' => false, 'message' => 'This space has ended.'], 422);
        }

        $invitee = \App\Models\User::findOrFail($data['user_id']);
        if ($invitee->id === $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'You cannot invite yourself.'], 422);
        }

        // NotificationService::createStandalone() only persists entity_type/
        // entity_id/message from the payload - it has no generic metadata
        // column, so the space id has to travel as entity_id (not a
        // space_id/space_title pair, which would be silently dropped) for
        // the client to actually be able to deep-link to it.
        $notifications->notify($invitee, 'space_invite', [
            'actor_id'    => $request->user()->id,
            'entity_type' => 'space',
            'entity_id'   => $space->id,
            'message'     => "invited you to \"{$space->title}\"",
        ]);

        return response()->json(['success' => true, 'message' => 'Invitation sent.']);
    }
}
