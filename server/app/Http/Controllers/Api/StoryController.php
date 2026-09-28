<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Story;
use App\Models\StoryLayer;
use App\Models\StoryMedia;
use App\Models\StoryView;
use App\Models\User;
use App\Services\MediaPresignService;
use App\Services\NotificationService;
use App\Services\RealtimeBus;
use App\Services\ReportEvidenceService;
use App\Services\StorageService;
use App\Services\StoryAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class StoryController extends Controller
{
    private string $disk;

    /**
     * Named $storyAnalytics rather than $analytics because analytics() is also
     * an action on this controller, and $this->analytics vs $this->analytics()
     * reads as a typo even though PHP allows both.
     */
    public function __construct(
        private readonly NotificationService $notifs,
        private readonly StoryAnalyticsService $storyAnalytics,
        private readonly ReportEvidenceService $reportEvidence,
        private readonly \App\Services\GlobalControls\GlobalControlService $globalControls,
    ) {
        $this->disk = config('filesystems.default', 'local');
    }

    /* ── POST /stories ─────────────────────────────────────────── */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'caption'         => ['nullable', 'string', 'max:200'],
            'visibility'      => ['nullable', 'in:everyone,followers,close_friends,only_me'],
            'allow_replies'   => ['nullable', 'boolean'],
            'allow_resharing' => ['nullable', 'boolean'],
            'is_ai_generated' => ['nullable', 'boolean'],
            'save_to_archive' => ['nullable', 'boolean'],
            'status'          => ['nullable', 'in:draft,published'],
            'location'        => ['nullable', 'string', 'max:255'],
            'link'            => ['nullable', 'url', 'max:500'],
            /* The column has existed since the stories table was created and was
               never written to - a track picked in the composer was logged as a
               usage stat and then forgotten, so the story had no sound to play
               and the viewer had no way to know whether to offer one. */
            'music_id'        => ['nullable', 'integer', 'exists:music_tracks,id'],
            // Shape is checked against config/stories.php, not here - the whole
            // point is that adding a setting needs no change in this file.
            'settings'        => ['nullable'],
            'media'           => ['nullable', 'array', 'max:10'],
            'media.*'         => ['file', 'mimes:jpg,jpeg,png,webp,gif,mp4,mov,webm,heic,heif,avif', 'max:204800'],
            'layers'          => ['nullable', 'string'],
        ]);

        $user   = $request->user();
        $status = $request->input('status', 'published');

        // Rejected here rather than stored and ignored: a setting that silently
        // does nothing is worse than one that refuses.
        [$settings, $settingsError] = $this->validateSettings($request->input('settings'));
        if ($settingsError) {
            return response()->json(['success' => false, 'message' => $settingsError], 422);
        }

        // Global Teezer Control - checked before Story::create() so a
        // rejection never leaves an orphan story row with no media. GIF is
        // not a distinct type anywhere else in the app (the main video/photo
        // post endpoint doesn't even accept the mimetype) - this is the one
        // real place it can be gated.
        if ($request->hasFile('media') && ! $this->globalControls->isEnabled('gif_uploads_enabled')) {
            foreach ($request->file('media') as $file) {
                if ($file->getMimeType() === 'image/gif') {
                    return response()->json($this->globalControls->deniedResponse('gif_uploads_enabled'), 403);
                }
            }
        }

        $story = Story::create([
            'user_id'         => $user->id,
            'caption'         => $request->input('caption'),
            'visibility'      => $request->input('visibility', 'everyone'),
            'allow_replies'   => $request->boolean('allow_replies', true),
            'allow_resharing' => $request->boolean('allow_resharing', true),
            'is_ai_generated' => $request->boolean('is_ai_generated', false),
            'save_to_archive' => $request->boolean('save_to_archive', true),
            'status'          => $status,
            'location'        => $request->input('location'),
            'link'            => $request->input('link'),
            'music_id'        => $request->input('music_id'),
            'settings'        => $settings ?: null,
            /* Expiry is a setting now, so a story that asked for 48 hours gets
               48. Read through the resolver rather than the raw document, so a
               story that set nothing still gets the current admin default. */
            'expires_at'      => $status === 'published'
                ? now()->addHours((int) self::effectiveSettings($settings)['expires_hours'])
                : null,
        ]);

        /* ── Media upload ─── */
        if ($request->hasFile('media')) {
            foreach ($request->file('media') as $index => $file) {
                $mime      = $file->getMimeType() ?? '';
                $mediaType = str_starts_with($mime, 'video/') ? 'video' : 'image';
                $path      = $file->store("stories/{$user->id}", $this->disk);

                StoryMedia::create([
                    'story_id'    => $story->id,
                    'media_type'  => $mediaType,
                    'media_url'   => $path,
                    'order_index' => $index,
                ]);
            }
        }

        /* ── Save layers ─── */
        $rawLayers = $request->input('layers');
        if ($rawLayers) {
            $layersData = json_decode($rawLayers, true) ?? [];
            foreach ($layersData as $idx => $layer) {
                StoryLayer::create([
                    'story_id'          => $story->id,
                    'slide_index'       => (int) ($layer['slideIndex'] ?? 0),
                    'type'              => substr($layer['type'] ?? 'text', 0, 20),
                    'text'              => $layer['text'] ?? null,
                    'url'               => isset($layer['url']) ? substr($layer['url'], 0, 500) : null,
                    'mentioned_user_id' => $layer['userId'] ?? null,
                    'hashtag'           => isset($layer['hashtag']) ? substr($layer['hashtag'], 0, 200) : null,
                    'location_name'     => isset($layer['locationName']) ? substr($layer['locationName'], 0, 255) : null,
                    'x_percent'         => (float) ($layer['x'] ?? 50),
                    'y_percent'         => (float) ($layer['y'] ?? 50),
                    'scale_value'       => (float) ($layer['scale'] ?? 1),
                    'rotation'          => (float) ($layer['rotation'] ?? 0),
                    'color'             => substr($layer['color'] ?? '#ffffff', 0, 20),
                    'font'              => substr($layer['font'] ?? 'classic', 0, 30),
                    'z_index'           => (int) ($layer['zIndex'] ?? $idx),
                ]);
            }
        }

        $story->load(['media', 'layers.mentionedUser']);

        /* ── Notify mentioned users (published stories only) ─── */
        if ($status === 'published' && $rawLayers) {
            $this->dispatchMentionNotifications($story, $user);
        }

        // ProfileController's `has_story` is cached for 90s (profile:stats:*)
        // and was never busted here or in destroy() below - unlike the
        // identical pattern VideoObserver/FollowController already use for
        // their own profile-stats-affecting actions - so a freshly-posted
        // story could take up to 90s to show its ring, same as a deleted one
        // taking up to 90s to lose it.
        if ($status === 'published') {
            Cache::forget("profile:stats:{$user->id}");
        }

        return response()->json([
            'success' => true,
            'data'    => $this->formatStory($story),
            'message' => $status === 'draft' ? 'Story saved as draft.' : 'Story published successfully.',
        ], 201);
    }

    /* ── POST /stories/from-video ───────────────────────────── */
    public function fromVideo(Request $request): JsonResponse
    {
        $request->validate([
            'video_id'        => ['required', 'integer', 'exists:videos,id'],
            'visibility'      => ['nullable', 'in:everyone,followers,close_friends,only_me'],
            'allow_replies'   => ['nullable', 'boolean'],
            'allow_resharing' => ['nullable', 'boolean'],
            'save_to_archive' => ['nullable', 'boolean'],
            'layers'          => ['nullable', 'string'],
        ]);

        $user  = $request->user();
        $video = \App\Models\Video::findOrFail($request->integer('video_id'));

        if ($video->status !== 'published') {
            return response()->json([
                'success' => false,
                'message' => 'This video is not ready to share to story.',
            ], 422);
        }

        /*
         * Consent check. This endpoint took ANY published video id and pushed it into the
         * caller's story - someone else's video, regardless of whether that creator had
         * switched sharing off. `allow_sharing` existed on the videos table the whole time
         * and was simply never read here.
         *
         * The owner can always share their own video, whatever the flag says: the flag is
         * about other people resharing, not about the creator's own reach.
         */
        $isOwner = (int) $video->user_id === (int) $user->id;

        if (! $isOwner && ! (bool) ($video->allow_sharing ?? true)) {
            return response()->json([
                'success' => false,
                'message' => 'This creator has turned off sharing for this video.',
            ], 403);
        }
        // Private/unlisted videos are already excluded: `status` must be 'published' above,
        // and that is the only visibility column videos has.

        $story = Story::create([
            'user_id'         => $user->id,
            'visibility'      => $request->input('visibility', 'everyone'),
            'allow_replies'   => $request->boolean('allow_replies', true),
            'allow_resharing' => $request->boolean('allow_resharing', true),
            'save_to_archive' => $request->boolean('save_to_archive', true),
            'status'          => 'published',
            'expires_at'      => now()->addHours(24),
        ]);

        // Reference the video's R2 key without re-uploading the file.
        StoryMedia::create([
            'story_id'         => $story->id,
            'media_type'       => 'video',
            'source_type'      => 'shared_video',
            'shared_video_id'  => $video->id,
            'media_url'        => $video->video_url,
            'thumbnail_url'    => $video->thumbnail_url,
            'duration_seconds' => $video->duration ? (int) $video->duration : null,
            'order_index'      => 0,
        ]);

        $rawLayers = $request->input('layers');
        if ($rawLayers) {
            $layersData = json_decode($rawLayers, true) ?? [];
            foreach ($layersData as $idx => $layer) {
                StoryLayer::create([
                    'story_id'          => $story->id,
                    'slide_index'       => (int) ($layer['slideIndex'] ?? 0),
                    'type'              => substr($layer['type'] ?? 'text', 0, 20),
                    'text'              => $layer['text'] ?? null,
                    'url'               => isset($layer['url']) ? substr($layer['url'], 0, 500) : null,
                    'mentioned_user_id' => $layer['userId'] ?? null,
                    'hashtag'           => isset($layer['hashtag']) ? substr($layer['hashtag'], 0, 200) : null,
                    'location_name'     => isset($layer['locationName']) ? substr($layer['locationName'], 0, 255) : null,
                    'x_percent'         => (float) ($layer['x'] ?? 50),
                    'y_percent'         => (float) ($layer['y'] ?? 50),
                    'scale_value'       => (float) ($layer['scale'] ?? 1),
                    'rotation'          => (float) ($layer['rotation'] ?? 0),
                    'color'             => substr($layer['color'] ?? '#ffffff', 0, 20),
                    'font'              => substr($layer['font'] ?? 'classic', 0, 30),
                    'z_index'           => (int) ($layer['zIndex'] ?? $idx),
                ]);
            }
        }

        $story->load(['media', 'layers.mentionedUser']);

        if ($rawLayers) {
            $this->dispatchMentionNotifications($story, $user);
        }

        // Quietly track as a share on the original video
        try { $video->increment('shares_count'); } catch (\Throwable) {}

        // Same profile:stats bust as store() - this endpoint always
        // publishes immediately, no draft branch to gate on.
        Cache::forget("profile:stats:{$user->id}");

        return response()->json([
            'success' => true,
            'data'    => $this->formatStory($story),
            'message' => 'Story published successfully.',
        ], 201);
    }

    /* ── GET /stories/drafts ─────────────────────────────────── */
    public function drafts(Request $request): JsonResponse
    {
        $stories = Story::with(['media', 'layers.mentionedUser'])
            ->where('user_id', $request->user()->id)
            ->where('status', 'draft')
            ->latest()
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $stories->map(fn ($s) => $this->formatStory($s)),
        ]);
    }

    /* ── GET /stories/{id} ──────────────────────────────────── */
    public function show(Request $request, int $id): JsonResponse
    {
        $story = Story::with(['media', 'user', 'layers.mentionedUser'])->findOrFail($id);

        // SECURITY: enforce per-story visibility, not just published status.
        if (!$this->canViewStory($story, $request->user())) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        return response()->json([
            'success' => true,
            'data'    => $this->formatStory($story),
        ]);
    }

    /**
     * Whether $viewer may see $story. Owner always can. Otherwise the story must
     * be live (published + unexpired) and the viewer must satisfy its visibility:
     *  - everyone       → anyone
     *  - followers      → an accepted follower of the owner
     *  - close_friends  → on the owner's close-friends list
     *  - only_me        → owner-only
     */
    private function canViewStory(Story $story, ?\App\Models\User $viewer): bool
    {
        if ($viewer && $viewer->id === $story->user_id) {
            return true;
        }
        $live = $story->status === 'published'
            && (is_null($story->expires_at) || $story->expires_at->isFuture());
        if (!$live) {
            return false;
        }

        /* Hidden subtracts from whatever visibility allows, so it is checked
           BEFORE the match below rather than inside one of its arms - a hidden
           viewer is refused whether the story was everyone, followers or close
           friends. Checked after the owner test above, because hiding yourself
           should not hide your own story from you. */
        if ($viewer && DB::table('hidden_story_users')
            ->where('user_id', $story->user_id)
            ->where('hidden_user_id', $viewer->id)
            ->exists()) {
            return false;
        }

        /* A block hides stories in BOTH directions, and is checked here for the
           same reason `hidden_story_users` is: it subtracts from whatever the
           visibility allows, so a blocked viewer is refused even on an
           `everyone` story.

           This was genuinely missing rather than delegated. The
           hidden_story_users migration notes that blocks are "enforced
           elsewhere", and they are - FeedService, MessageController,
           MentionController and ProfileSuggestionService all filter on
           blocked_users - but no story path ever did, so a blocked user could
           open a story and have the view recorded against the person who
           blocked them.

           Both directions in one query: whether they blocked me or I blocked
           them, neither should be reading the other's stories. */
        if ($viewer && DB::table('blocked_users')
            ->where(function ($q) use ($story, $viewer) {
                $q->where('blocker_id', $story->user_id)->where('blocked_id', $viewer->id);
            })
            ->orWhere(function ($q) use ($story, $viewer) {
                $q->where('blocker_id', $viewer->id)->where('blocked_id', $story->user_id);
            })
            ->exists()) {
            return false;
        }

        return match ($story->visibility) {
            'everyone'  => true,
            'followers' => $viewer && DB::table('followers')
                ->where('follower_id', $viewer->id)
                ->where('following_id', $story->user_id)
                ->where('status', 'accepted')
                ->exists(),
            // Membership of the OWNER's list, nothing else - not mutual, and not
            // conditional on still following them. The owner put them there.
            'close_friends' => $viewer && DB::table('close_friends')
                ->where('user_id', $story->user_id)
                ->where('friend_id', $viewer->id)
                ->exists(),
            default     => false, // only_me
        };
    }

    /**
     * Find-or-create the 1:1 Conversation between a story viewer and the
     * story's owner. Shared by reply() and react() - both bypass the
     * normal privacy gate (resolveConversationForMessage() in
     * MessageController) by design, same as Instagram: anyone who can see
     * your story can reach your inbox by reacting/replying to it,
     * regardless of your general message-privacy setting. canViewStory()
     * (already checked by both callers before this runs) is what actually
     * gates this - it already respects blocks in both directions.
     */
    private function resolveOrCreateStoryConversation(User $viewer, User $owner): \App\Models\Conversation
    {
        $userA = min($viewer->id, $owner->id);
        $userB = max($viewer->id, $owner->id);

        $conv = \App\Models\Conversation::where('user_a_id', $userA)
            ->where('user_b_id', $userB)
            ->first();

        if (!$conv) {
            $conv = \App\Models\Conversation::create([
                'user_a_id'    => $userA,
                'user_b_id'    => $userB,
                'initiated_by' => $viewer->id,
                'received_by'  => $owner->id,
                'status'       => 'approved',
                'approved_at'  => now(),
            ]);
        } elseif ($conv->status === 'pending_request' && $conv->received_by === $owner->id) {
            // Upgrades a pending request to approved so the owner sees it in inbox.
            $conv->update(['status' => 'approved', 'approved_at' => now()]);
        }

        return $conv;
    }

    /**
     * The thumbnail to attach to a story_reply/story_reaction DirectMessage.
     * Prefers image slides; for videos uses their thumbnail (keyframe). If
     * multiple media exist, picks a random non-text one - same choice
     * reply() always made, now shared with react().
     */
    private function resolveStoryThumbnailUrl(Story $story): ?string
    {
        $allMedia = $story->media()->whereIn('media_type', ['image', 'video'])->get();
        $pick     = $allMedia->isNotEmpty()
            ? $allMedia->random()
            : $story->media()->first();

        $rawPath = ($pick?->media_type === 'video')
            ? ($pick?->thumbnail_url ?? $pick?->media_url)
            : ($pick?->media_url ?? $pick?->thumbnail_url);

        return $rawPath ? Storage::disk($this->disk)->url($rawPath) : null;
    }

    /**
     * Push a freshly-created DirectMessage the same way
     * MessageController::send() already does for every other message type -
     * 'message.new' to the recipient's room, 'message.sent' echoed back to
     * the sender's own room, identical payload shape. reply()/react()
     * create their DirectMessage directly rather than through send()
     * (they bypass its privacy check on purpose - see
     * resolveOrCreateStoryConversation()), so neither ever got this push
     * until now; a story reply/reaction only reached the owner's Inbox on
     * the next manual refetch.
     */
    private function broadcastNewMessage(\App\Models\DirectMessage $msg, User $sender): void
    {
        $payload = [
            'message' => $msg->toArray(),
            'sender'  => [
                'id'          => $sender->id,
                'username'    => $sender->username,
                'name'        => $sender->name,
                'avatar'      => $sender->avatar ? Storage::url($sender->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified' => (bool) $sender->is_verified,
            ],
        ];
        RealtimeBus::publish([RealtimeBus::userRoom($msg->receiver_id)], 'message.new', $payload);
        RealtimeBus::publish([RealtimeBus::userRoom($sender->id)], 'message.sent', $payload);
    }

    /* ── DELETE /stories/{id} ───────────────────────────────── */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $story = Story::where('id', $id)->where('user_id', $request->user()->id)->firstOrFail();
        $story->delete();

        // See the matching comment in store() - without this, deleting a
        // user's only active story left profile:stats' cached has_story:true
        // in place for up to 90s, showing the gradient ring on a profile
        // that no longer has anything behind it.
        Cache::forget("profile:stats:{$story->user_id}");

        return response()->json(['success' => true, 'message' => 'Story deleted.']);
    }

    /* ── GET /stories/active-user-ids ──────────────────────── */
    /**
     * Validate a settings document against config/stories.php.
     *
     * Rejects anything not declared and anything declared-but-disabled, so an
     * unknown or switched-off key cannot be smuggled into the document. Returns
     * only the keys that were actually set - defaults are never written, because
     * a stored default stops tracking the admin default the moment it changes.
     *
     * @return array{0: array<string,mixed>, 1: ?string} [clean, error]
     */
    private function validateSettings(mixed $input): array
    {
        if ($input === null || $input === '') {
            return [[], null];
        }
        if (is_string($input)) {
            $input = json_decode($input, true);
        }
        if (!is_array($input)) {
            return [[], 'settings must be an object.'];
        }

        $schema = config('stories.settings', []);
        $clean  = [];

        foreach ($input as $key => $value) {
            $spec = $schema[$key] ?? null;
            if (!$spec) {
                return [[], "Unknown story setting: {$key}."];
            }
            if (!($spec['enabled'] ?? false)) {
                return [[], "That story setting is not available: {$key}."];
            }

            switch ($spec['type']) {
                case 'boolean':
                    if (!is_bool($value) && !in_array($value, [0, 1, '0', '1', 'true', 'false'], true)) {
                        return [[], "{$key} must be true or false."];
                    }
                    $clean[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN);
                    break;

                case 'integer':
                    if (!is_numeric($value)) {
                        return [[], "{$key} must be a number."];
                    }
                    $n = (int) $value;
                    if (isset($spec['min']) && $n < $spec['min']) {
                        return [[], "{$key} must be at least {$spec['min']}."];
                    }
                    if (isset($spec['max']) && $n > $spec['max']) {
                        return [[], "{$key} must be at most {$spec['max']}."];
                    }
                    $clean[$key] = $n;
                    break;

                default:
                    return [[], "Unsupported setting type for {$key}."];
            }
        }

        return [$clean, null];
    }

    /**
     * One story's effective settings: what it stored, over the current defaults.
     *
     * A disabled setting always reports its default regardless of what the story
     * stored, so switching a feature off in config takes effect everywhere at
     * once rather than only for stories posted afterwards.
     */
    public static function effectiveSettings(?array $stored): array
    {
        $out = [];
        foreach (config('stories.settings', []) as $key => $spec) {
            $out[$key] = ($spec['enabled'] ?? false)
                ? ($stored[$key] ?? $spec['default'])
                : $spec['default'];
        }
        return $out;
    }

    public function activeUserIds(Request $request): JsonResponse
    {
        $me = $request->user()?->id;

        $ids = Story::where('status', 'published')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            /* Everyone for anyone; followers only for an accepted follower of
               that author - a ring must not advertise a story the viewer
               cannot open, and that includes just revealing that a
               followers-only story EXISTS to someone who doesn't follow them.
               Your OWN stories always count, whatever their visibility: you
               can always watch your own, so a close-friends or only-me story
               still earns you a ring on your own profile. Without this the
               ring vanished for exactly the stories the author most expected
               to see. */
            ->where(fn ($q) => $q
                ->where('visibility', 'everyone')
                ->orWhere(fn ($f) => $f->where('visibility', 'followers')
                    ->when(
                        $me,
                        fn ($w) => $w->whereExists(fn ($ex) => $ex->selectRaw('1')
                            ->from('followers')
                            ->whereColumn('followers.following_id', 'stories.user_id')
                            ->where('followers.follower_id', $me)
                            ->where('followers.status', 'accepted')),
                        fn ($w) => $w->whereRaw('1 = 0'),
                    ))
                ->when($me, fn ($w) => $w->orWhere('user_id', $me)))
            ->pluck('user_id')
            ->unique()
            ->values();

        return response()->json(['success' => true, 'data' => $ids]);
    }

    /* ── GET /stories/feed ──────────────────────────────────── */
    public function feed(Request $request): JsonResponse
    {
        $user  = $request->user();
        $limit = (int) min($request->get('limit', 20), 50);

        $followingIds = DB::table('followers')
            ->where('follower_id', $user->id)
            ->where('status', 'accepted')
            ->pluck('following_id')
            ->toArray();

        $userIds = array_unique(array_merge([$user->id], $followingIds));

        $stories = Story::with(['media', 'user', 'layers.mentionedUser'])
            ->whereIn('user_id', $userIds)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            // SECURITY: own stories of any visibility; from others (people you
            // follow) everyone/followers, plus close_friends ONLY where they
            // have put you on their list. Never only_me.
            //
            // The same rule as canViewStory, expressed as a query because the
            // feed cannot afford a per-story check. Both must agree: a story
            // reaching the feed that canViewStory would refuse is a leak, and
            // one it would allow but this hides is simply invisible.
            ->where(fn ($q) => $q->where('user_id', $user->id)
                ->orWhereIn('visibility', ['everyone', 'followers'])
                ->orWhere(fn ($cf) => $cf->where('visibility', 'close_friends')
                    ->whereExists(fn ($ex) => $ex->selectRaw('1')
                        ->from('close_friends')
                        ->whereColumn('close_friends.user_id', 'stories.user_id')
                        ->where('close_friends.friend_id', $user->id))))
            /* Hidden subtracts from all of the above, and from your own stories
               it cannot - hiding yourself is not a thing, and the owner branch
               above has already admitted them. Mirrors canViewStory: the feed
               and the single-story check must agree or one of them is a leak. */
            ->where(fn ($q) => $q->where('user_id', $user->id)
                ->orWhereNotExists(fn ($ex) => $ex->selectRaw('1')
                    ->from('hidden_story_users')
                    ->whereColumn('hidden_story_users.user_id', 'stories.user_id')
                    ->where('hidden_story_users.hidden_user_id', $user->id)))
            ->orderBy('created_at', 'desc')
            ->limit(300)
            ->get();

        if ($stories->isEmpty()) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $viewedIds = StoryView::where('viewer_id', $user->id)
            ->whereIn('story_id', $stories->pluck('id')->toArray())
            ->pluck('story_id')
            ->flip()
            ->all();

        $grouped = $stories->groupBy('user_id');
        $result  = [];

        foreach ($grouped as $userId => $userStories) {
            $author    = $userStories->first()->user;
            $hasUnseen = $userStories->contains(fn ($s) => !isset($viewedIds[$s->id]));

            $result[] = [
                'user' => [
                    'id'           => $author->id,
                    'username'     => $author->username,
                    'display_name' => $author->name,
                    'avatar'       => $author->avatar ? Storage::url($author->avatar) : StorageService::defaultAvatarUrl(),
                    'is_verified'  => (bool) $author->is_verified,
                ],
                'stories'    => $userStories->map(fn ($s) => $this->formatStory($s))->values(),
                'has_unseen' => $hasUnseen,
                'is_own'     => (int) $userId === $user->id,
            ];
        }

        usort($result, function ($a, $b) {
            if ($a['is_own'] !== $b['is_own']) return $a['is_own'] ? -1 : 1;
            if ($a['has_unseen'] !== $b['has_unseen']) return $a['has_unseen'] ? -1 : 1;
            return 0;
        });

        return response()->json(['success' => true, 'data' => array_slice($result, 0, $limit)]);
    }

    /* ── POST /stories/{id}/view ────────────────────────────── */
    public function view(Request $request, int $id): JsonResponse
    {
        /* Every field is optional. This endpoint predates any of them, and the
           shipped clients still call it with an empty body - so a missing
           context must record a plain view rather than fail validation and lose
           the view entirely. */
        $context = $request->validate([
            'platform'       => ['nullable', 'string', 'max:20'],
            'device'         => ['nullable', 'string', 'max:120'],
            // Per app-launch / per browser tab. Used only to attribute
            // concurrent events - never to identify the viewer.
            'session_id'     => ['nullable', 'string', 'max:64'],
            // Capped at a day: a client bug reporting a nonsense duration should
            // not be able to poison the owner's average watch time.
            'watch_duration' => ['nullable', 'integer', 'min:0', 'max:86400'],
            'completed'      => ['nullable', 'boolean'],
            'slide_index'    => ['nullable', 'integer', 'min:0', 'max:1000'],
            'story_media_id' => ['nullable', 'integer', 'exists:story_media,id'],
            // "I am reporting how long the watch I already recorded lasted",
            // not "I watched it again". Without this a client that measures
            // duration on exit would double every viewer's event count.
            'progress_only'  => ['nullable', 'boolean'],
        ]);

        $story = Story::where('id', $id)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->firstOrFail();

        $user = $request->user();

        /* Authorisation BEFORE the write. A view the viewer was never allowed to
           make must not exist at all - previously this method checked only that
           the story was live, so a blocked or hidden user who reached the
           endpoint had their view recorded into the owner's list. react() and
           reply() already gated on this; view() was the one that did not. */
        if (! $this->canViewStory($story, $user)) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        /* The viewer identity is the authenticated user, always. Nothing about
           who viewed is read from the request body - a client can describe HOW
           it watched (platform, duration), never WHO watched. */
        $isFirstView = $this->storyAnalytics->recordView($story, (int) $user->id, $context);

        /* Only a new UNIQUE viewer moves the owner-facing number, so only that
           announces. A rewatch still updates total_view_events in the rollup,
           but pushing an event for it would wake every open analytics panel to
           redraw an unchanged count. */
        if ($isFirstView) {
            RealtimeBus::publish([RealtimeBus::userRoom($story->user_id)], 'story.viewed', [
                'story_id'  => $story->id,
                'viewer_id' => $user->id,
            ]);
            $this->publishAnalytics($story);
        }

        /* Deliberately no counts in this response. The viewer is not the owner,
           and the owner's analytics are owner-only - returning them here would
           hand every viewer the exact numbers /viewers and /analytics are gated
           to keep private. */
        return response()->json(['success' => true]);
    }

    /**
     * Push the authoritative counters to the owner's private room.
     *
     * One event, one shape, fired from every path that can move a number
     * (view / react / unreact / reply / share) - so a web viewer and a mobile
     * viewer produce the same update, and the owner's panel does not need to
     * know which surface caused it.
     */
    private function publishAnalytics(Story $story): void
    {
        RealtimeBus::publish(
            [RealtimeBus::userRoom((int) $story->user_id)],
            'story.analytics.updated',
            array_merge(['story_id' => (int) $story->id], $this->storyAnalytics->analytics($story)),
        );
    }

    /* ── GET /stories/{id}/viewers (own story only) ─────────── */
    public function viewers(Request $request, int $id): JsonResponse
    {
        $user  = $request->user();
        $story = Story::where('id', $id)->where('user_id', $user->id)->firstOrFail();

        $viewers = DB::table('story_views')
            ->where('story_views.story_id', $story->id)
            ->where('story_views.viewer_id', '!=', $story->user_id)
            ->join('users', 'users.id', '=', 'story_views.viewer_id')
            ->leftJoin('story_reactions', function ($join) use ($story) {
                $join->on('story_reactions.user_id', '=', 'story_views.viewer_id')
                     ->where('story_reactions.story_id', '=', $story->id);
            })
            // Who replied, and who follows me back. Both drive the viewer sheet:
            // the row's "Replied ·" line, the "Not following you" filter, and
            // whether a row offers Message or Follow. Done as exists-subqueries
            // so the viewer list stays one round trip however long it gets.
            ->selectSub(
                DB::table('story_messages')
                    ->selectRaw('1')
                    ->whereColumn('story_messages.sender_id', 'story_views.viewer_id')
                    ->where('story_messages.story_id', $story->id)
                    ->limit(1),
                'replied',
            )
            ->selectSub(
                DB::table('followers')
                    ->selectRaw('1')
                    ->whereColumn('followers.follower_id', 'story_views.viewer_id')
                    ->where('followers.following_id', $story->user_id)
                    ->where('followers.status', 'accepted')
                    ->limit(1),
                'follows_me',
            )
            ->select(
                'users.id',
                'users.username',
                'users.name as display_name',
                'users.avatar',
                'users.is_verified',
                'story_views.viewed_at',
                'story_reactions.reaction_type',
            )
            ->orderByDesc('story_views.viewed_at')
            ->get()
            ->map(fn ($v) => [
                'id'            => $v->id,
                'username'      => $v->username,
                'display_name'  => $v->display_name,
                'avatar'        => $v->avatar ? Storage::url($v->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified'   => (bool) $v->is_verified,
                'viewed_at'     => $v->viewed_at,
                'reaction_type' => $v->reaction_type,
                'replied'       => (bool) $v->replied,
                'follows_me'    => (bool) $v->follows_me,
            ]);

        /* The stat cards come from the analytics service, NOT from totalling the
           list above.

           They used to be counted off these rows, which was self-consistent but
           made this endpoint a second implementation of the same numbers - and
           two implementations are exactly how web and mobile drift apart. One
           computed answer, one shape, every surface. `total` stays the unique
           viewer count and keeps its old key so existing clients are unaffected. */
        $analytics = $this->storyAnalytics->analytics($story);

        return response()->json([
            'success' => true,
            'data'    => array_merge($analytics, [
                'total'     => $analytics['unique_viewers'],
                'reactions' => $analytics['reaction_count'],
                'replies'   => $analytics['reply_count'],
                'shares'    => $analytics['share_count'],
                'viewers'   => $viewers->values(),
            ]),
        ]);
    }

    /* ── GET /stories/my ────────────────────────────────────── */
    public function myStories(Request $request): JsonResponse
    {
        $stories = Story::with(['media', 'layers.mentionedUser'])
            ->where('user_id', $request->user()->id)
            ->active()
            ->latest()
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $stories->map(fn ($s) => $this->formatStory($s)),
        ]);
    }

    /* ── GET /stories/search-users (for mentions) ───────────── */
    public function searchUsers(Request $request): JsonResponse
    {
        $query = trim($request->get('q', ''));
        if (strlen($query) < 1) {
            return response()->json(['success' => true, 'users' => []]);
        }

        $users = DB::table('users')
            ->where(function ($q) use ($query) {
                $q->where('username', 'ilike', "%{$query}%")
                  ->orWhere('name', 'ilike', "%{$query}%");
            })
            ->whereNull('deleted_at')
            ->select('id', 'username', 'name', 'avatar', 'is_verified')
            ->limit(8)
            ->get();

        return response()->json([
            'success' => true,
            'users'   => $users->map(fn ($u) => [
                'id'       => $u->id,
                'username' => $u->username,
                'name'     => $u->name,
                'avatar'   => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified' => (bool) $u->is_verified,
            ]),
        ]);
    }

    /* ── GET /users/{username}/stories (public) ──────────────────────── */
    public function userStories(Request $request, string $username): JsonResponse
    {
        $profileUser = User::where('username', $username)->where('is_banned', false)->firstOrFail();
        $authUser    = $request->user();

        // Private accounts: only accepted followers or own profile can view stories
        if ($profileUser->is_private && (!$authUser || ($authUser->id !== $profileUser->id && !DB::table('followers')
            ->where('follower_id', $authUser->id)
            ->where('following_id', $profileUser->id)
            ->where('status', 'accepted')
            ->exists()))) {
            return response()->json(['success' => true, 'data' => null]);
        }

        $stories = Story::with(['media', 'layers.mentionedUser'])
            ->where('user_id', $profileUser->id)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->orderBy('created_at', 'desc')
            ->get()
            // SECURITY: the is_private check above only gates whether ANY of this
            // user's stories may be listed at all - it says nothing about a given
            // story's own visibility. Without this, a followers/close_friends/
            // only_me story from a PUBLIC account (or, for a private account, a
            // close_friends/only_me story seen by a plain accepted follower who
            // isn't on that list) was still returned here, even though
            // canViewStory() - the same rule show()/view() already enforce -
            // would refuse it. The client opened the story anyway, and its
            // /view request then 404'd and silently went uncounted.
            ->filter(fn ($s) => $this->canViewStory($s, $authUser))
            ->values();

        if ($stories->isEmpty()) {
            return response()->json(['success' => true, 'data' => null]);
        }

        $viewedIds = $authUser
            ? StoryView::where('viewer_id', $authUser->id)
                ->whereIn('story_id', $stories->pluck('id')->toArray())
                ->pluck('story_id')->flip()->all()
            : [];

        $hasUnseen = $stories->contains(fn ($s) => !isset($viewedIds[$s->id]));

        return response()->json([
            'success' => true,
            'data'    => [
                'user' => [
                    'id'           => $profileUser->id,
                    'username'     => $profileUser->username,
                    'display_name' => $profileUser->name,
                    'avatar'       => $profileUser->avatar ? Storage::url($profileUser->avatar) : StorageService::defaultAvatarUrl(),
                    'is_verified'  => (bool) $profileUser->is_verified,
                ],
                'stories'    => $stories->map(fn ($s) => $this->formatStory($s))->values(),
                'has_unseen' => $hasUnseen,
                'is_own'     => $authUser && $authUser->id === $profileUser->id,
            ],
        ]);
    }

    /* ── POST /stories/{id}/react ─────────────────────────────────────── */
    public function react(Request $request, int $id): JsonResponse
    {
        // The allowed set comes from the service so the rule, the stored value,
        // the breakdown and both clients cannot drift apart.
        $request->validate([
            'reaction_type' => ['required', 'in:' . implode(',', StoryAnalyticsService::REACTIONS)],
        ]);

        $story = Story::where('id', $id)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->firstOrFail();

        $user = $request->user();

        // SECURITY: can't react to a story you aren't allowed to see.
        if (!$this->canViewStory($story, $user)) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        // allow_reactions lives in the settings JSON document, not a plain
        // column (unlike allow_replies), so it has to be read through the
        // same resolver store() already uses for expires_hours - reading
        // $story->settings directly would treat an unset key as false
        // instead of the configured default. This was never checked here
        // before: the setting existed in config/stories.php and the client
        // even claimed to gate on it, but nothing server-side did.
        if (! self::effectiveSettings($story->settings)['allow_reactions']) {
            return response()->json(['success' => false, 'message' => 'Reactions are turned off for this story.'], 403);
        }

        // One reaction per user per story: swapping ❤️ for 😂 UPDATES the row.
        // The unique (story_id, user_id) constraint is what makes that true, so
        // reacting twice can never produce a count of 2.
        $this->storyAnalytics->setReaction($story, (int) $user->id, $request->input('reaction_type'));

        // Notify story owner (not self-reactions)
        if ($story->user_id !== $user->id) {
            $this->publishAnalytics($story);
            // Same reasoning as story.viewed: the reaction row was always saved
            // and the owner always got a notification, but the viewer sheet's
            // reaction count and emoji list had nothing to invalidate them.
            RealtimeBus::publish([RealtimeBus::userRoom($story->user_id)], 'story.reacted', [
                'story_id'      => $story->id,
                'viewer_id'     => $user->id,
                'reaction_type' => $request->input('reaction_type'),
            ]);

            $owner = User::find($story->user_id);
            if ($owner) {
                try {
                    $this->notifs->notify($owner, 'story_react', [
                        'actor_id'    => $user->id,
                        'entity_type' => 'story',
                        'entity_id'   => $story->id,
                        'message'     => ($user->name ?? $user->username) . ' reacted to your story',
                    ]);
                } catch (\Throwable) {}

                // The notification above is a bell entry only - it never
                // touched the Inbox, so a reaction had nowhere to actually
                // show up for the owner besides the bell. reply() already
                // creates a real DirectMessage for the exact same "viewer
                // interacted with my story" moment; reactions get the same
                // treatment now instead of being the odd one out. Every tap
                // is its own message row (an event, not an edited state) -
                // see share()'s own doc comment on the same distinction.
                $conv = $this->resolveOrCreateStoryConversation($user, $owner);
                $msg  = \App\Models\DirectMessage::create([
                    'conversation_id'     => $conv->id,
                    'sender_id'           => $user->id,
                    'receiver_id'         => $owner->id,
                    'body'                => $request->input('reaction_type'),
                    'message_type'        => 'story_reaction',
                    'story_id'            => $story->id,
                    'story_thumbnail_url' => $this->resolveStoryThumbnailUrl($story),
                ]);
                $this->broadcastNewMessage($msg, $user);
            }
        }

        return response()->json(['success' => true]);
    }

    /* ── DELETE /stories/{id}/reaction ────────────────────────────────── */

    /**
     * Take back a reaction.
     *
     * There was no way to do this before: react() could set or swap a reaction
     * but nothing could remove one, so a mis-tap was permanent and the owner's
     * reaction count could only ever go up.
     *
     * Idempotent - removing a reaction that is not there is a success, not a
     * 404, because the caller's intent ("I should have no reaction on this") is
     * satisfied either way and a retry after a dropped response must not fail.
     */
    public function removeReaction(Request $request, int $id): JsonResponse
    {
        $story = Story::where('id', $id)->firstOrFail();
        $user  = $request->user();

        $removed = $this->storyAnalytics->removeReaction($story, (int) $user->id);

        if ($removed && (int) $story->user_id !== (int) $user->id) {
            $this->publishAnalytics($story);
        }

        return response()->json([
            'success' => true,
            'data'    => ['removed' => $removed],
        ]);
    }

    /* ── GET /stories/{id}/reactions (own story only) ─────────────────── */

    /**
     * Who reacted and with what, plus the per-type totals.
     *
     * Owner-only for the same reason /viewers is: it names the people who
     * interacted with the story.
     */
    public function reactions(Request $request, int $id): JsonResponse
    {
        $user  = $request->user();
        $story = Story::where('id', $id)->where('user_id', $user->id)->firstOrFail();

        $rows = DB::table('story_reactions')
            ->where('story_reactions.story_id', $story->id)
            ->where('story_reactions.user_id', '!=', $story->user_id)
            ->join('users', 'users.id', '=', 'story_reactions.user_id')
            ->select(
                'users.id',
                'users.username',
                'users.name as display_name',
                'users.avatar',
                'users.is_verified',
                'story_reactions.reaction_type',
                'story_reactions.created_at',
            )
            ->orderByDesc('story_reactions.created_at')
            ->get()
            ->map(fn ($r) => [
                'id'            => $r->id,
                'username'      => $r->username,
                'display_name'  => $r->display_name,
                'avatar'        => $r->avatar ? Storage::url($r->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified'   => (bool) $r->is_verified,
                'reaction_type' => $r->reaction_type,
                'reacted_at'    => $r->created_at,
            ]);

        $analytics = $this->storyAnalytics->analytics($story);

        return response()->json([
            'success' => true,
            'data'    => [
                'total'     => $analytics['reaction_count'],
                'breakdown' => $analytics['reactions_breakdown'],
                'reactions' => $rows->values(),
            ],
        ]);
    }

    /* ── GET /stories/{id}/analytics (own story only) ─────────────────── */

    /**
     * The authoritative counters for one story.
     *
     * This is the endpoint both clients render from, which is what makes web
     * and mobile agree: they do not each total up a list, they read the same
     * computed answer. Owner-only.
     */
    public function analytics(Request $request, int $id): JsonResponse
    {
        $user  = $request->user();
        $story = Story::where('id', $id)->where('user_id', $user->id)->firstOrFail();

        return response()->json([
            'success' => true,
            'data'    => array_merge(
                ['story_id' => (int) $story->id],
                $this->storyAnalytics->analytics($story),
            ),
        ]);
    }

    /* ── POST /stories/{id}/share ─────────────────────────────────────── */

    /**
     * Record that someone shared the story.
     *
     * Unlike a view, this is NOT deduplicated: sending a story to three friends
     * is three shares. A view is a state ("has seen it"), a share is an event
     * ("sent it"), so applying view semantics here would report 1 for someone
     * who sent it to a whole group.
     */
    public function share(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'channel'        => ['nullable', 'in:' . implode(',', StoryAnalyticsService::SHARE_CHANNELS)],
            'target_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'platform'       => ['nullable', 'string', 'max:20'],
        ]);

        $story = Story::where('id', $id)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->firstOrFail();

        $user = $request->user();

        // Same authorisation gate as viewing: you cannot share what you were
        // never allowed to see.
        if (! $this->canViewStory($story, $user)) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        // The author's own choice, honoured server-side rather than only being
        // hidden in the UI.
        if ($story->allow_resharing === false) {
            return response()->json(['success' => false, 'message' => 'Resharing is turned off for this story.'], 403);
        }

        $this->storyAnalytics->recordShare(
            $story,
            (int) $user->id,
            $data['channel'] ?? 'copy_link',
            $data['target_user_id'] ?? null,
            $data['platform'] ?? null,
        );

        if ((int) $story->user_id !== (int) $user->id) {
            $this->publishAnalytics($story);
        }

        return response()->json(['success' => true]);
    }

    /* ── POST /stories/{id}/repost ─────────────────────────────────────── */

    /**
     * Repost another user's story to your own story rail. A genuinely
     * independent Story + StoryMedia row, not a duplicate upload: the new
     * StoryMedia points at the ORIGINAL's already-hosted media_url/
     * thumbnail_url verbatim, so nothing is re-uploaded or duplicated in
     * storage - and the repost keeps rendering fine even if the original
     * later expires or is deleted, same reasoning as
     * direct_messages.story_id having no FK (reposted_from_story_id/
     * reposted_from_user_id mirror it: no FK, data resolved live at read
     * time in formatStory()/resolveRepostedFrom() below).
     */
    public function repost(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'visibility'      => ['nullable', 'in:everyone,followers,close_friends,only_me'],
            'allow_replies'   => ['nullable', 'boolean'],
            'allow_resharing' => ['nullable', 'boolean'],
            'is_ai_generated' => ['nullable', 'boolean'],
            'layers'          => ['nullable', 'string'],
        ]);

        $user     = $request->user();
        $original = Story::with('media')->find($id);

        if (! $original) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        // Same authorisation gate as sharing/viewing: you cannot repost what
        // you were never allowed to see.
        if (! $this->canViewStory($original, $user)) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        // The author's own choice, honoured server-side rather than only
        // hidden in the UI - same check, same message share() already uses.
        if ($original->allow_resharing === false) {
            return response()->json(['success' => false, 'message' => 'Resharing is turned off for this story.'], 403);
        }

        // Reposting is for other people's stories - your own story rail
        // already has your own story on it.
        if ((int) $original->user_id === (int) $user->id) {
            return response()->json(['success' => false, 'message' => 'You cannot repost your own story.'], 422);
        }

        $originalMedia = $original->media->first();

        $story = Story::create([
            'user_id'                => $user->id,
            'visibility'             => $request->input('visibility', 'everyone'),
            'allow_replies'          => $request->boolean('allow_replies', true),
            'allow_resharing'        => $request->boolean('allow_resharing', true),
            // OR'd, never overridable by the reposting user - the original
            // AI-generated designation must survive a repost either way.
            'is_ai_generated'        => (bool) $original->is_ai_generated || $request->boolean('is_ai_generated'),
            'save_to_archive'        => true,
            'status'                 => 'published',
            'reposted_from_story_id' => $original->id,
            'reposted_from_user_id'  => $original->user_id,
            'expires_at'             => now()->addHours((int) self::effectiveSettings(null)['expires_hours']),
        ]);

        if ($originalMedia) {
            StoryMedia::create([
                'story_id'         => $story->id,
                'media_type'       => $originalMedia->media_type,
                'media_url'        => $originalMedia->media_url,
                'thumbnail_url'    => $originalMedia->thumbnail_url,
                'duration_seconds' => $originalMedia->duration_seconds,
                'order_index'      => 0,
            ]);
        }

        // Overlays added during the repost edit, saved the same way store()
        // already saves them.
        $rawLayers = $request->input('layers');
        if ($rawLayers) {
            $layersData = json_decode($rawLayers, true) ?? [];
            foreach ($layersData as $idx => $layer) {
                StoryLayer::create([
                    'story_id'          => $story->id,
                    'slide_index'       => (int) ($layer['slideIndex'] ?? 0),
                    'type'              => substr($layer['type'] ?? 'text', 0, 20),
                    'text'              => $layer['text'] ?? null,
                    'url'               => isset($layer['url']) ? substr($layer['url'], 0, 500) : null,
                    'mentioned_user_id' => $layer['userId'] ?? null,
                    'hashtag'           => isset($layer['hashtag']) ? substr($layer['hashtag'], 0, 200) : null,
                    'location_name'     => isset($layer['locationName']) ? substr($layer['locationName'], 0, 255) : null,
                    'x_percent'         => (float) ($layer['x'] ?? 50),
                    'y_percent'         => (float) ($layer['y'] ?? 50),
                    'scale_value'       => (float) ($layer['scale'] ?? 1),
                    'rotation'          => (float) ($layer['rotation'] ?? 0),
                    'color'             => substr($layer['color'] ?? '#ffffff', 0, 20),
                    'font'              => substr($layer['font'] ?? 'classic', 0, 30),
                    'z_index'           => (int) ($layer['zIndex'] ?? $idx),
                ]);
            }
        }

        $story->load(['media', 'layers.mentionedUser']);

        // Same has_story cache-bust store() already does for a freshly
        // published story.
        Cache::forget("profile:stats:{$user->id}");

        $owner = User::find($original->user_id);
        if ($owner) {
            try {
                $this->notifs->notify($owner, 'story_repost', [
                    'actor_id'    => $user->id,
                    'entity_type' => 'story',
                    'entity_id'   => $story->id,
                    'message'     => ($user->name ?? $user->username) . ' reposted your story',
                ]);
            } catch (\Throwable) {}
        }

        return response()->json([
            'success' => true,
            'data'    => $this->formatStory($story),
            'message' => 'Story reposted.',
        ], 201);
    }

    /* ── POST /stories/{id}/reply ─────────────────────────────────────── */
    public function reply(Request $request, int $id): JsonResponse
    {
        $request->validate(['message' => ['required', 'string', 'max:500']]);

        $story = Story::where('id', $id)
            ->where('status', 'published')
            ->where('allow_replies', true)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->firstOrFail();

        $user = $request->user();

        // SECURITY: can't reply to (and force a DM from) a story you can't see.
        if (!$this->canViewStory($story, $user)) {
            return response()->json(['success' => false, 'message' => 'Not found.'], 404);
        }

        DB::table('story_messages')->insert([
            'story_id'    => $story->id,
            'sender_id'   => $user->id,
            'receiver_id' => $story->user_id,
            'message'     => $request->input('message'),
            'created_at'  => now(),
        ]);

        // A reply moves the owner's reply counter, so the rollup has to be
        // rebuilt here too - this row is written directly rather than through
        // the service, because a reply is also a DM (below) and that is not the
        // analytics service's job.
        $this->storyAnalytics->refresh($story);

        // Send a DM so the owner sees the reply in their messages with story context
        if ($story->user_id !== $user->id) {
            $owner = User::find($story->user_id);

            if ($owner) {
                $conv = $this->resolveOrCreateStoryConversation($user, $owner);

                $msg = \App\Models\DirectMessage::create([
                    'conversation_id'     => $conv->id,
                    'sender_id'           => $user->id,
                    'receiver_id'         => $owner->id,
                    'body'                => $request->input('message'),
                    'message_type'        => 'story_reply',
                    'story_id'            => $story->id,
                    'story_thumbnail_url' => $this->resolveStoryThumbnailUrl($story),
                ]);
                // Was missing entirely: the DM above got created but nothing
                // ever told the owner's already-open Inbox it existed - it
                // only appeared on the next manual refetch, unlike every
                // other message type send() already pushes live.
                $this->broadcastNewMessage($msg, $user);

                // Replies feed the same "N reactions · N replies" line as views and
                // reactions, so the owner's sheet needs the same nudge.
                RealtimeBus::publish([RealtimeBus::userRoom($story->user_id)], 'story.replied', [
                    'story_id'  => $story->id,
                    'viewer_id' => $user->id,
                ]);
                $this->publishAnalytics($story);

                try {
                    $this->notifs->notify($owner, 'story_reply', [
                        'actor_id'    => $user->id,
                        'entity_type' => 'story',
                        'entity_id'   => $story->id,
                        'message'     => ($user->name ?? $user->username) . ' replied to your story',
                    ]);
                } catch (\Throwable) {}
            }
        }

        return response()->json(['success' => true, 'message' => 'Reply sent.']);
    }

    /* ── POST /stories/{id}/report ────────────────────────────────────── */
    public function report(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason' => ['required', 'string', 'in:spam,inappropriate,violence,hate_speech,misinformation,other'],
            ...$this->reportEvidence->rules(),
        ]);

        $story = Story::where('id', $id)->where('status', 'published')->firstOrFail();
        $user  = $request->user();

        $evidenceKeys = $this->reportEvidence->store($request);

        DB::table('story_reports')->upsert(
            [
                'story_id'      => $story->id,
                'reporter_id'   => $user->id,
                'reason'        => $request->input('reason'),
                'evidence_keys' => $evidenceKeys ? json_encode($evidenceKeys) : null,
                'status'        => 'pending',
                'created_at'    => now(),
            ],
            ['story_id', 'reporter_id'],
            ['reason', 'evidence_keys', 'status'],
        );

        return response()->json(['success' => true, 'message' => 'Story reported. We will review it shortly.']);
    }

    /* ── Private helpers ────────────────────────────────────── */

    private function dispatchMentionNotifications(Story $story, User $actor): void
    {
        $mentionedUserIds = $story->layers
            ->where('type', 'mention')
            ->pluck('mentioned_user_id')
            ->filter()
            ->unique()
            ->reject(fn ($id) => $id === $actor->id)
            ->values();

        if ($mentionedUserIds->isEmpty()) {
            return;
        }

        $actorName = $actor->name ?? $actor->username;
        $message   = NotificationService::buildMessage('story_mention', $actorName);

        foreach ($mentionedUserIds as $userId) {
            $recipient = User::find($userId);
            if (!$recipient || !$recipient->is_active || $recipient->is_banned) {
                continue;
            }
            try {
                $this->notifs->notify($recipient, 'mention', [
                    'actor_id'    => $actor->id,
                    'entity_type' => 'story',
                    'entity_id'   => $story->id,
                    'message'     => $message,
                ]);
            } catch (\Throwable) {
                // Notification failure must never break the story creation
            }
        }
    }

    private function formatStory(Story $story): array
    {
        return [
            'id'              => $story->id,
            'user_id'         => $story->user_id,
            'caption'         => $story->caption,
            'visibility'      => $story->visibility,
            'allow_replies'   => $story->allow_replies,
            'allow_resharing' => $story->allow_resharing,
            'is_ai_generated' => (bool) $story->is_ai_generated,
            'save_to_archive' => $story->save_to_archive,
            'status'          => $story->status,
            'location'        => $story->location,
            'link'            => $story->link,
            /* Was never actually returned here despite store() taking it and
               both clients' own Story types already declaring it - meaning
               storySetting()/currentStory.settings has silently read as
               "always the default" everywhere, allow_reactions included.
               A client-side "hide this control when its setting is off"
               check is only real once the setting itself is real. */
            'settings'        => $story->settings,
            'expires_at'      => $story->expires_at?->toIso8601String(),
            'created_at'      => $story->created_at->toIso8601String(),
            'reposted_from'   => $this->resolveRepostedFrom($story),
            'media'           => $story->media->map(fn (StoryMedia $m) => [
                'id'               => $m->id,
                'media_type'       => $m->media_type,
                'source_type'      => $m->source_type ?? 'upload',
                'shared_video_id'  => $m->shared_video_id,
                // Shared-video media lives under the videos/ R2 path which the
                // Cloudflare Worker validates with HMAC - sign it the same way.
                'media_url'        => $m->media_url
                    ? ($m->source_type === 'shared_video'
                        ? $this->signedMediaUrl($m->media_url)
                        : Storage::disk($this->disk)->url($m->media_url))
                    : null,
                'thumbnail_url'    => $m->thumbnail_url ? Storage::disk($this->disk)->url($m->thumbnail_url) : null,
                'duration_seconds' => $m->duration_seconds,
                'order_index'      => $m->order_index,
            ])->values(),
            'layers' => $story->relationLoaded('layers')
                ? $story->layers->map(fn (StoryLayer $l) => $this->formatLayer($l))->values()
                : [],
        ];
    }

    /**
     * Attribution for a reposted story, resolved LIVE against the original
     * creator's current profile row rather than a frozen snapshot - so if
     * they change their avatar/name later the repost still shows it
     * correctly. reposted_from_user_id has no FK (see the migration that
     * added it), so this is a plain select, not a relation; memoized per
     * request to avoid re-querying the same original author once per story
     * when a whole feed/list is being formatted.
     */
    private array $repostAuthorCache = [];

    private function resolveRepostedFrom(Story $story): ?array
    {
        if (! $story->reposted_from_story_id || ! $story->reposted_from_user_id) {
            return null;
        }

        $userId = (int) $story->reposted_from_user_id;

        if (! array_key_exists($userId, $this->repostAuthorCache)) {
            $author = User::find($userId);
            $this->repostAuthorCache[$userId] = $author ? [
                'user_id'      => $author->id,
                'username'     => $author->username,
                'name'         => $author->name,
                'avatar'       => $author->avatar ? Storage::url($author->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified'  => (bool) $author->is_verified,
            ] : null;
        }

        $author = $this->repostAuthorCache[$userId];

        return [
            'story_id'    => (int) $story->reposted_from_story_id,
            'user_id'     => $userId,
            // Falls back to a generic placeholder rather than crashing if
            // the original creator's account is gone.
            'username'    => $author['username'] ?? null,
            'name'        => $author['name'] ?? null,
            'avatar'      => $author['avatar'] ?? StorageService::defaultAvatarUrl(),
            'is_verified' => $author['is_verified'] ?? false,
        ];
    }

    /**
     * Sign an object key the same way VideoResource does (24h TTL) - via
     * MediaPresignService, not a hand-rolled signer. This used to reimplement
     * a retired HMAC-SHA256-hex scheme (a stale copy of what VideoResource
     * itself was fixed to stop doing - see its own doc comment), which 403s
     * against nginx's current secure_link_md5 validation and silently broke
     * playback for shared-video media inside stories.
     */
    private function signedMediaUrl(string $key): string
    {
        return MediaPresignService::signedMediaUrl($key, 1440);
    }

    private function formatLayer(StoryLayer $layer): array
    {
        return [
            'id'           => $layer->id,
            'type'         => $layer->type,
            'text'         => $layer->text,
            'url'          => $layer->url,
            'username'     => $layer->mentionedUser?->username,
            'userId'       => $layer->mentioned_user_id,
            'locationName' => $layer->location_name,
            'hashtag'      => $layer->hashtag,
            'slideIndex'   => $layer->slide_index,
            'x'            => (float) $layer->x_percent,
            'y'            => (float) $layer->y_percent,
            'scale'        => (float) $layer->scale_value,
            'rotation'     => (float) $layer->rotation,
            'color'        => $layer->color,
            'font'         => $layer->font,
            'zIndex'       => $layer->z_index,
        ];
    }
}
