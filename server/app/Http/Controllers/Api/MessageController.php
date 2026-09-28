<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendDirectMessagePush;
use App\Models\Conversation;
use App\Models\ContentReport;
use App\Models\DirectMessage;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\MediaPresignService;
use App\Services\RealtimeBus;
use App\Services\ReportEvidenceService;
use App\Services\StorageService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class MessageController extends Controller
{
    public function __construct(
        private readonly NotificationService $notifs,
        private readonly \App\Services\GlobalControls\GlobalControlService $globalControls,
    ) {}

    /** Global Teezer Control's standard denial body for voice messages. */
    private function voiceDisabledResponse(): JsonResponse
    {
        return response()->json($this->globalControls->deniedResponse('voice_messages_enabled'), 403);
    }
    /**
     * GET /v1/messages/conversations
     * Approved conversations only (main inbox).
     * Legacy messages (no conversation record) are treated as approved.
     *
     * Pagination is opt-in via ?page=&per_page= (used by the "See all" messages
     * list) - omitting both preserves the original unbounded response so the
     * Inbox home screen and its inline search keep working exactly as before.
     */
    public function conversations(Request $request): JsonResponse
    {
        $me = $request->user()->id;

        $paginate = $request->has('page') || $request->has('per_page');
        $perPage  = min(50, max(1, (int) $request->input('per_page', 20)));
        $page     = max(1, (int) $request->input('page', 1));
        // Over-fetch by one instead of a second COUNT(*) query to detect has_more cheaply.
        $limitSql = $paginate ? 'LIMIT ' . ($perPage + 1) . ' OFFSET ' . (($page - 1) * $perPage) : '';

        $rows = DB::select("
            SELECT
                u.id            AS user_id,
                u.username,
                u.name,
                u.avatar,
                u.is_verified,
                u.last_active_at,
                u.activity_status,
                (EXISTS(SELECT 1 FROM followers f1 WHERE f1.follower_id = ? AND f1.following_id = u.id AND f1.status = 'accepted')
                 AND EXISTS(SELECT 1 FROM followers f2 WHERE f2.follower_id = u.id AND f2.following_id = ? AND f2.status = 'accepted')) AS is_mutual,
                -- Same live-story definition StoryController::canViewStory()
                -- uses (published, not expired) - drives the gradient ring on
                -- this row's own avatar, same ring the profile/story rail
                -- already draw for the identical fact.
                EXISTS(
                    SELECT 1 FROM stories s
                    WHERE s.user_id = u.id AND s.status = 'published'
                      AND (s.expires_at IS NULL OR s.expires_at > NOW())
                ) AS has_story,
                -- Same unseen rule StoryController::feed()/userStories() use
                -- (batched there via a StoryView lookup; expressed here as a
                -- correlated NOT EXISTS since this whole query is already raw
                -- SQL) - at least one of this users active stories has no
                -- story_views row for ME yet. Drives the gradient-vs-seen
                -- ring color on this rows avatar.
                EXISTS(
                    SELECT 1 FROM stories s2
                    WHERE s2.user_id = u.id AND s2.status = 'published'
                      AND (s2.expires_at IS NULL OR s2.expires_at > NOW())
                      AND NOT EXISTS (
                          SELECT 1 FROM story_views sv WHERE sv.story_id = s2.id AND sv.viewer_id = ?
                      )
                ) AS has_unseen,
                lm.body         AS last_message,
                lm.message_type AS last_message_type,
                lm.created_at   AS last_ts,
                lm.sender_id    AS last_sender_id,
                lm.read_at      AS last_read_at,
                lm.delivered_at AS last_delivered_at,
                COALESCE(uc.cnt, 0) AS unread_count
            FROM (
                SELECT LEAST(sender_id, receiver_id) AS u1, GREATEST(sender_id, receiver_id) AS u2
                FROM direct_messages
                WHERE sender_id = ? OR receiver_id = ?
                GROUP BY u1, u2
            ) pairs
            LEFT JOIN conversations c ON c.user_a_id = pairs.u1 AND c.user_b_id = pairs.u2
            JOIN (
                SELECT m.*
                FROM direct_messages m
                INNER JOIN (
                    SELECT LEAST(sender_id, receiver_id) AS u1, GREATEST(sender_id, receiver_id) AS u2,
                           MAX(id) AS max_id
                    FROM direct_messages
                    WHERE sender_id = ? OR receiver_id = ?
                    GROUP BY u1, u2
                ) latest ON m.id = latest.max_id
            ) lm ON LEAST(lm.sender_id, lm.receiver_id) = pairs.u1
                AND GREATEST(lm.sender_id, lm.receiver_id) = pairs.u2
            JOIN users u ON u.id = CASE WHEN pairs.u1 = ? THEN pairs.u2 ELSE pairs.u1 END
            LEFT JOIN (
                SELECT sender_id, COUNT(*) AS cnt
                FROM direct_messages
                WHERE receiver_id = ? AND read_at IS NULL
                GROUP BY sender_id
            ) uc ON uc.sender_id = u.id
            WHERE (c.id IS NULL OR c.status = 'approved')
            ORDER BY lm.created_at DESC
            {$limitSql}
        ", [$me, $me, $me, $me, $me, $me, $me, $me, $me]);

        $hasMore = false;
        if ($paginate && count($rows) > $perPage) {
            $hasMore = true;
            $rows    = array_slice($rows, 0, $perPage);
        }

        // My own setting matters for seeing a "friends"-only contact's status.
        $meStatus = $request->user()->activity_status ?? 'public';
        $rows = $this->normaliseTimestamps($rows);

        foreach ($rows as $row) {
            $row->avatar = $row->avatar ? Storage::url($row->avatar) : StorageService::defaultAvatarUrl();
            $recent = $row->last_active_at && Carbon::parse($row->last_active_at)->gt(now()->subMinutes(5));
            $status = $row->activity_status ?? 'public';
            // public → anyone sees; no_one → hidden; friends → mutual followers (and I'm not no_one).
            $canSee = $status === 'public'
                || ($status === 'friends' && $meStatus !== 'no_one' && (int) $row->is_mutual === 1);
            $row->is_online = (bool) ($recent && $canSee);
            unset($row->last_active_at, $row->activity_status, $row->is_mutual);
        }

        /* My pin / archive / mute for these threads, in one query keyed by the
           other participant - the list is built from user pairs, not
           conversation ids, so this maps back the same way.

           Attached rather than joined into the SQL above: that query already
           paginates over a derived table, and filtering archived rows inside it
           would shorten pages unpredictably. The flags are reported and the
           inbox decides - archived threads are hidden client-side until this
           moves into the query proper. */
        if ($rows) {
            $ids = array_map(fn ($r) => $r->user_id, $rows);
            $settings = DB::table('conversation_settings as cs')
                ->join('conversations as c', 'c.id', '=', 'cs.conversation_id')
                ->where('cs.user_id', $me)
                ->get(['cs.pinned_at', 'cs.archived_at', 'cs.muted_until', 'c.user_a_id', 'c.user_b_id'])
                ->keyBy(fn ($s) => $s->user_a_id === $me ? $s->user_b_id : $s->user_a_id);

            foreach ($rows as $row) {
                $s = $settings[$row->user_id] ?? null;
                $row->pinned   = !is_null($s->pinned_at ?? null);
                $row->archived = !is_null($s->archived_at ?? null);
                $row->muted    = !empty($s->muted_until) && Carbon::parse($s->muted_until)->isFuture();
            }

            // Pinned to the top, their existing recency order kept underneath -
            // usort is not stable in PHP < 8.0 but is from 8.0 on, which this
            // runs. Equal rows therefore keep the SQL's ordering.
            usort($rows, fn ($a, $b) => (int) $b->pinned <=> (int) $a->pinned);
            unset($ids);
        }

        $response = ['success' => true, 'data' => $rows];
        if ($paginate) {
            $response['meta'] = ['current_page' => $page, 'has_more' => $hasMore];
        }

        return response()->json($response);
    }

    /**
     * GET /v1/messages/share-suggestions
     * Powers the feed Share sheet's "Send to friends" list: followed accounts
     * ranked by how much you've chatted with them (message count, either
     * direction). This single count already captures "who you share videos
     * with most" too - a shared_video message is just another direct_messages
     * row, so no separate share-specific tracking is needed. Followed accounts
     * you've never messaged sort to the end (chat_count 0) so the list always
     * has something to show even for a fresh account.
     */
    public function shareSuggestions(Request $request): JsonResponse
    {
        $me    = $request->user()->id;
        $limit = min(50, max(1, (int) $request->input('limit', 30)));

        $rows = DB::select("
            SELECT u.id, u.username, u.name, u.avatar, u.is_verified,
                   COALESCE(msg.cnt, 0) AS chat_count
            FROM followers f
            JOIN users u ON u.id = f.following_id
            LEFT JOIN (
                SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_id,
                       COUNT(*) AS cnt
                FROM direct_messages
                WHERE sender_id = ? OR receiver_id = ?
                GROUP BY other_id
            ) msg ON msg.other_id = u.id
            WHERE f.follower_id = ? AND f.status = 'accepted'
              AND NOT EXISTS (
                  SELECT 1 FROM blocked_users b
                  WHERE (b.blocker_id = ? AND b.blocked_id = u.id)
                     OR (b.blocker_id = u.id AND b.blocked_id = ?)
              )
            ORDER BY chat_count DESC, u.username ASC
            LIMIT ?
        ", [$me, $me, $me, $me, $me, $me, $limit]);

        $rows = $this->normaliseTimestamps($rows);

        foreach ($rows as $row) {
            $row->avatar = $row->avatar ? Storage::url($row->avatar) : StorageService::defaultAvatarUrl();
        }

        return response()->json(['success' => true, 'data' => $rows]);
    }

    /**
     * GET /v1/messages/requests
     * Returns both incoming (received) and sent (initiated) pending requests.
     */
    public function requests(Request $request): JsonResponse
    {
        $me = $request->user()->id;

        $lmSQL = "
            SELECT dm.conversation_id, dm.body, dm.message_type, dm.created_at
            FROM direct_messages dm
            INNER JOIN (
                SELECT conversation_id, MAX(id) AS max_id
                FROM direct_messages
                WHERE conversation_id IS NOT NULL
                GROUP BY conversation_id
            ) latest ON dm.id = latest.max_id
        ";

        $incoming = DB::select("
            SELECT
                u.id            AS user_id,
                u.username,
                u.name,
                u.avatar,
                u.is_verified,
                c.id            AS conversation_id,
                c.status,
                'incoming'      AS direction,
                lm.body         AS last_message,
                lm.message_type AS last_message_type,
                lm.created_at   AS last_ts
            FROM conversations c
            JOIN users u ON u.id = c.initiated_by
            LEFT JOIN ({$lmSQL}) lm ON lm.conversation_id = c.id
            WHERE c.received_by = ? AND c.status = 'pending_request'
            ORDER BY lm.created_at DESC
        ", [$me]);

        $sent = DB::select("
            SELECT
                u.id            AS user_id,
                u.username,
                u.name,
                u.avatar,
                u.is_verified,
                c.id            AS conversation_id,
                c.status,
                'sent'          AS direction,
                lm.body         AS last_message,
                lm.message_type AS last_message_type,
                lm.created_at   AS last_ts
            FROM conversations c
            JOIN users u ON u.id = c.received_by
            LEFT JOIN ({$lmSQL}) lm ON lm.conversation_id = c.id
            WHERE c.initiated_by = ? AND c.status = 'pending_request'
            ORDER BY lm.created_at DESC
        ", [$me]);

        $incoming = $this->normaliseTimestamps($incoming);
        $sent     = $this->normaliseTimestamps($sent);

        foreach ($incoming as $row) {
            $row->avatar = $row->avatar ? Storage::url($row->avatar) : StorageService::defaultAvatarUrl();
        }
        foreach ($sent as $row) {
            $row->avatar = $row->avatar ? Storage::url($row->avatar) : StorageService::defaultAvatarUrl();
        }

        return response()->json(['success' => true, 'data' => [
            'incoming' => $incoming,
            'sent'     => $sent,
        ]]);
    }

    /**
     * GET /v1/messages/conversations/{userId}
     * Message history. Works for approved conversations and for the receiver
     * viewing a pending request before accepting.
     */
    public function history(Request $request, int $userId): JsonResponse
    {
        $me     = $request->user()->id;
        $before = $request->query('before');

        // Determine conversation status
        $userA = min($me, $userId);
        $userB = max($me, $userId);
        $conv  = Conversation::where('user_a_id', $userA)->where('user_b_id', $userB)->first();

        // If a conversation record exists and is rejected/blocked, deny access
        if ($conv && in_array($conv->status, ['rejected', 'blocked'])) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $query = DirectMessage::with([
                // shared_profile/shared_product read live, not a copy (see the
                // send() comment) - so scrollback needs the relation just as
                // much as the initial send's response did.
                'sharedUser:id,username,name,avatar,is_verified',
                'product:id,name,price,currency,image_url,shop_id',
                'product.shop:id,shop_name',
                // The quoted preview inside a reply bubble - enough of the
                // original to render text/thumbnail without a second fetch.
                // thumbnail_url is still re-signed by the model's own accessor
                // on serialization (selecting the column only limits what's
                // fetched from the DB, not what the model does with it).
                'replyToMessage:id,sender_id,body,message_type,thumbnail_url,location_name,deleted_for_everyone_at',
            ])
            ->where(function ($q) use ($me, $userId) {
                $q->where('sender_id', $me)->where('receiver_id', $userId);
            })->orWhere(function ($q) use ($me, $userId) {
                $q->where('sender_id', $userId)->where('receiver_id', $me);
            })
            ->where(function ($q) use ($me) {
                $q->whereNull('deleted_for_user_ids')
                  ->orWhereRaw('NOT (deleted_for_user_ids @> ?::jsonb)', [json_encode($me)]);
            });

        if ($before) {
            $query->where('id', '<', (int) $before);
        }

        $messages = $query->orderByDesc('created_at')->limit(40)->get()->reverse()->values();

        /* Reactions for the whole page in ONE query, then attached in memory.
           Per-message loading here would be 40 round trips for a screen of
           chat, and the thread endpoint is the hottest read in the app. */
        $reactions = DB::table('direct_message_reactions')
            ->whereIn('message_id', $messages->pluck('id'))
            ->get(['message_id', 'user_id', 'emoji'])
            ->groupBy('message_id');

        $messages->each(function ($m) use ($reactions, $me) {
            $m->reactions = ($reactions[$m->id] ?? collect())
                ->groupBy('emoji')
                ->map(fn ($g, $emoji) => [
                    'emoji' => $emoji,
                    'count' => $g->count(),
                    'mine'  => $g->contains('user_id', $me),
                ])
                ->values()
                ->all();
        });

        // Auto-mark incoming as read only for approved conversations
        if (!$conv || $conv->status === 'approved') {
            $this->markMessagesRead(senderId: $userId, readerId: $me);
        }

        return response()->json(['success' => true, 'data' => $messages]);
    }

    /**
     * POST /v1/messages/upload-url
     */
    /** Per-media-type upload caps, in bytes. Images: jpg/jpeg/png only. */
    private const MAX_UPLOAD_BYTES = [
        'image'     => 50 * 1024 * 1024,   // 50 MB
        'video'     => 250 * 1024 * 1024,  // 250 MB
        'voice'     => 25 * 1024 * 1024,
        'audio'     => 25 * 1024 * 1024,
        'document'  => 100 * 1024 * 1024,
        'thumbnail' => 5 * 1024 * 1024,
    ];
    private const IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

    public function uploadUrl(Request $request): JsonResponse
    {
        $request->validate([
            'file_name'  => ['required', 'string', 'max:255'],
            'file_type'  => ['required', 'string', 'max:100'],
            'file_size'  => ['required', 'integer', 'min:1'],
            'media_type' => ['required', 'in:image,video,voice,audio,document,thumbnail'],
        ]);

        $mediaType = $request->input('media_type');

        // Global Teezer Control - voice is a distinct, client-declared
        // media_type value here (not mime-sniffed), so it can be gated
        // separately from the coarser message_attachments_enabled that
        // already covers this whole route via EnsureGlobalControlEnabled.
        if ($mediaType === 'voice' && ! $this->globalControls->isEnabled('voice_messages_enabled')) {
            return $this->voiceDisabledResponse();
        }

        $maxBytes  = self::MAX_UPLOAD_BYTES[$mediaType] ?? (200 * 1024 * 1024);
        if ($request->integer('file_size') > $maxBytes) {
            return response()->json([
                'success' => false,
                'message' => sprintf('File is too large. Max size for %s is %dMB.', $mediaType, intdiv($maxBytes, 1024 * 1024)),
            ], 422);
        }

        if ($mediaType === 'image' && !in_array(strtolower((string) $request->input('file_type')), self::IMAGE_MIME_TYPES, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Photos must be JPG or PNG.',
            ], 422);
        }

        // Object storage, whichever provider. This used to test for 'r2'
        // specifically, which meant every chat attachment upload started
        // returning 503 the moment storage moved to B2 - the check outlived the
        // thing it was checking for.
        if (config('filesystems.default') !== 'b2') {
            return response()->json(['success' => false, 'message' => 'Object storage is not configured.'], 503);
        }

        $directory = match ($request->input('media_type')) {
            'image'     => 'chat/images',
            'video'     => 'chat/videos',
            'voice'     => 'chat/voice',
            'audio'     => 'chat/audio',
            'document'  => 'chat/documents',
            'thumbnail' => 'chat/thumbnails',
            default     => 'chat/files',
        };

        $presign = app(MediaPresignService::class);
        $signed  = $presign->createUploadUrl(
            userId:         $request->user()->id,
            fileName:       $request->input('file_name'),
            contentType:    $request->input('file_type'),
            directory:      $directory,
            expiresMinutes: 15,
        );

        return response()->json(['success' => true, 'data' => $signed]);
    }

    /**
     * POST /v1/messages/conversations/{userId}
     * Send a message. Enforces message privacy rules and conversation status.
     */
    public function send(Request $request, int $userId): JsonResponse
    {
        $request->validate([
            'body'                  => ['nullable', 'string', 'max:4000'],
            'message_type'          => ['sometimes', 'in:text,image,video,voice,audio,document,shared_video,shared_profile,shared_product,shared_story,location'],
            'latitude'              => ['nullable', 'numeric', 'between:-90,90'],
            'longitude'             => ['nullable', 'numeric', 'between:-180,180'],
            'location_name'         => ['nullable', 'string', 'max:255'],
            'r2_key'                => ['nullable', 'string', 'max:500'],
            'r2_url'                => ['nullable', 'string', 'max:1000'],
            'thumbnail_key'         => ['nullable', 'string', 'max:500'],
            'thumbnail_url'         => ['nullable', 'string', 'max:1000'],
            'file_size'             => ['nullable', 'integer', 'min:0'],
            'duration'              => ['nullable', 'integer', 'min:0'],
            'file_name'             => ['nullable', 'string', 'max:255'],
            'mime_type'             => ['nullable', 'string', 'max:100'],
            'reply_to_message_id'   => ['nullable', 'integer', 'exists:direct_messages,id'],
            'video_id'              => ['nullable', 'integer', 'exists:videos,id'],
            'shared_user_id'        => ['nullable', 'integer', 'exists:users,id'],
            'product_id'            => ['nullable', 'integer', 'exists:products,id'],
            'story_id'              => ['nullable', 'integer', 'exists:stories,id'],
        ]);

        $type = $request->input('message_type', 'text');

        if ($type === 'voice' && ! $this->globalControls->isEnabled('voice_messages_enabled')) {
            return $this->voiceDisabledResponse();
        }

        if ($type === 'text' && !$request->filled('body')) {
            return response()->json(['success' => false, 'message' => 'Message body is required for text messages.'], 422);
        }

        // Block messages containing severe/abusive content.
        if ($request->filled('body')
            && app(\App\Services\TextModerationService::class)->check($request->input('body'))['action'] === 'block') {
            return response()->json(['success' => false, 'message' => 'This message may violate our community guidelines and was not sent.'], 422);
        }
        // shared_video references an EXISTING platform video (video_id), not an
        // uploaded chat attachment - it has no r2_key of its own.
        if ($type === 'shared_video' && !$request->filled('video_id')) {
            return response()->json(['success' => false, 'message' => 'video_id is required to share a video.'], 422);
        }
        // shared_profile/shared_product reference an existing user/product by
        // id - the card renders live data from that row (avatar, price, ...),
        // never a copy, so nothing else is required on the request.
        if ($type === 'shared_profile' && !$request->filled('shared_user_id')) {
            return response()->json(['success' => false, 'message' => 'shared_user_id is required to share a profile.'], 422);
        }
        if ($type === 'shared_product' && !$request->filled('product_id')) {
            return response()->json(['success' => false, 'message' => 'product_id is required to share a product.'], 422);
        }
        // shared_story references an existing, still-live story by id, same
        // shape as shared_video - the card renders live story data, not a
        // copy. Same gate the "Share to..." row's own visibility already
        // assumes client-side (owner, or the author allows resharing),
        // enforced again here since the client's gating is only a UI nicety.
        if ($type === 'shared_story') {
            if (!$request->filled('story_id')) {
                return response()->json(['success' => false, 'message' => 'story_id is required to share a story.'], 422);
            }
            $story = \App\Models\Story::where('id', $request->input('story_id'))
                ->where('status', 'published')
                ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->first();
            if (!$story || ($story->user_id !== $request->user()->id && $story->allow_resharing === false)) {
                return response()->json(['success' => false, 'message' => 'This story is no longer available to share.'], 404);
            }
        }
        // A location is a pair of coordinates, not an upload - it has no r2_key
        // to require, and must be excluded from the check below.
        if ($type === 'location' && (!$request->filled('latitude') || !$request->filled('longitude'))) {
            return response()->json(['success' => false, 'message' => 'latitude and longitude are required to share a location.'], 422);
        }
        if (!in_array($type, ['text', 'shared_video', 'shared_profile', 'shared_product', 'shared_story', 'location'], true) && !$request->filled('r2_key')) {
            return response()->json(['success' => false, 'message' => 'r2_key is required for media messages.'], 422);
        }

        $me     = $request->user();
        $target = User::findOrFail($userId);

        if ($me->id === $target->id) {
            return response()->json(['success' => false, 'message' => 'Cannot message yourself.'], 422);
        }

        // Block check
        if ($me->hasBlocked($target) || $target->hasBlocked($me)) {
            return response()->json(['success' => false, 'message' => 'User not found.'], 404);
        }

        // Recipient's word blocklists (Keyword / Hashtag / Not-Interested filters):
        // reject messages containing a word the recipient has chosen to block.
        if ($request->filled('body')
            && \App\Models\UserHiddenWord::firstBlockedWord($target->id, $request->input('body'))) {
            return response()->json(['success' => false, 'message' => 'Your message contains a word this user has blocked.'], 422);
        }

        // ── Global DM block: if admin set "Block New DM" on ANY of this user's
        //    conversations and it hasn't expired, block ALL outgoing messages. ──
        $globalBlock = Conversation::where(function ($q) use ($me) {
                $q->where('user_a_id', $me->id)->orWhere('user_b_id', $me->id);
            })
            ->where('prevent_new_requests', true)
            ->get()
            ->first(function ($c) {
                $exp = ($c->restrictions_config ?? [])['prevent_new_requests'] ?? null;
                return !$exp || now()->lessThan(Carbon::parse($exp));
            });

        if ($globalBlock) {
            return response()->json([
                'success' => false,
                'message' => 'Your ability to send direct messages has been temporarily restricted by the Teezer moderation team.',
            ], 403);
        }

        // Resolve (or create, or refuse) the conversation - the single shared
        // implementation of this, also used by forwardMessage() (see
        // resolveConversationForMessage()'s own docblock for why that matters).
        $result = $this->resolveConversationForMessage($me, $target);
        if ($result instanceof JsonResponse) {
            return $result;
        }
        $conv = $result;

        // Admin restrictions only ever apply to a conversation that already
        // existed - a freshly-created one cannot have any set on it yet.
        // wasRecentlyCreated is Eloquent's own "did create() just make this
        // row, in this request" flag, so this reproduces the original
        // if ($conv) { ... } / else { ... } split exactly.
        if (!$conv->wasRecentlyCreated) {
            if ($err = $this->checkAdminRestrictions($conv, $type, $request->input('body', ''))) {
                return $err;
            }
        }

        $config   = $conv->restrictions_config ?? [];
        $isActive = fn(string $f): bool =>
            (bool) ($conv->$f ?? false) &&
            (empty($config[$f]) || now()->lessThan(Carbon::parse($config[$f])));

        $msg = DirectMessage::create([
            'conversation_id'      => $conv->id,
            'sender_id'            => $me->id,
            'receiver_id'          => $userId,
            'body'                 => $request->input('body', ''),
            'message_type'         => $type,
            'r2_key'               => $request->input('r2_key'),
            'r2_url'               => $request->input('r2_url'),
            'thumbnail_key'        => $request->input('thumbnail_key'),
            'thumbnail_url'        => $request->input('thumbnail_url'),
            'file_size'            => $request->input('file_size'),
            'duration'             => $request->input('duration'),
            'file_name'            => $request->input('file_name'),
            'mime_type'            => $request->input('mime_type'),
            'reply_to_message_id'  => $request->input('reply_to_message_id'),
            'video_id'             => $request->input('video_id'),
            'shared_user_id'       => $request->input('shared_user_id'),
            'product_id'           => $request->input('product_id'),
            // Client-supplied, same as shared_video's own thumbnail_url - the
            // viewer already has the story's media in memory when they tap
            // Share to..., so there is nothing to resolve server-side here.
            'story_id'             => $type === 'shared_story' ? $request->input('story_id') : null,
            'story_thumbnail_url'  => $type === 'shared_story' ? $request->input('thumbnail_url') : null,
            // Only ever set on a location message, so a stray pair of
            // coordinates cannot ride along on an ordinary one.
            'latitude'             => $type === 'location' ? $request->input('latitude') : null,
            'longitude'            => $type === 'location' ? $request->input('longitude') : null,
            'location_name'        => $type === 'location' ? $request->input('location_name') : null,
        ]);

        // Flag as needing approval if admin set message_approval_required.
        // Set via forceFill because flagged_by_admin is intentionally not fillable -
        // otherwise the sender could pass it themselves and self-clear the flag. It
        // used to be passed to create(), where Eloquent silently discarded it, so the
        // approval-required setting never actually flagged anything.
        if ($isActive('message_approval_required')) {
            $msg->forceFill(['flagged_by_admin' => true])->save();
        }

        // Shadow-restricted: hide message from receiver (soft-delete for receiver only)
        if ($isActive('shadow_restricted')) {
            // Mark as deleted_for_everyone so receiver's history query skips it,
            // but sender can still see it was "sent" (returns success to sender).
            $msg->update(['deleted_for_everyone_at' => now()]);
        }

        // Live lookup, not a copy - both the realtime push and the HTTP
        // response below reuse $msg->toArray(), which includes an already-
        // loaded relation under its own key (shared_user / product).
        if ($type === 'shared_profile') {
            $msg->setRelation('sharedUser', $msg->sharedUser()->select('id', 'username', 'name', 'avatar', 'is_verified')->first());
        } elseif ($type === 'shared_product') {
            $msg->setRelation('product', $msg->product()->with('shop:id,shop_name')->select('id', 'name', 'price', 'currency', 'image_url', 'shop_id')->first());
        }
        if ($msg->reply_to_message_id) {
            $msg->setRelation('replyToMessage', $msg->replyToMessage()
                ->select('id', 'sender_id', 'body', 'message_type', 'thumbnail_url', 'location_name', 'deleted_for_everyone_at')->first());
        }

        $status = $isActive('message_approval_required') ? 'pending_approval' : $conv->status;

        // Realtime push (approved conversations only - requests/shadow/approval-gated
        // messages must not surface on the receiver's socket). The receiver's device
        // ACKs delivery back through the chat-server, which stamps delivered_at.
        if ($status === 'approved' && !$isActive('shadow_restricted')) {
            $payload = [
                'message' => $msg->toArray(),
                'sender'  => [
                    'id'          => $me->id,
                    'username'    => $me->username,
                    'name'        => $me->name,
                    'avatar'      => $me->avatar ? Storage::url($me->avatar) : StorageService::defaultAvatarUrl(),
                    'is_verified' => (bool) $me->is_verified,
                ],
            ];
            RealtimeBus::publish([RealtimeBus::userRoom($target->id)], 'message.new', $payload);
            RealtimeBus::publish([RealtimeBus::userRoom($me->id)], 'message.sent', $payload);

            // ...and to the OS, for a receiver who is not currently holding
            // that socket. The app only connects it while a chat screen or a
            // call is open (mobile/src/realtime/socket.ts), so a backgrounded
            // user got no DM notification at all - the publish above reached
            // nobody. Same gating as the realtime publish deliberately: a
            // request, a shadow-restricted message or one held for approval
            // must not announce itself either.
            SendDirectMessagePush::dispatch($target, $me, (int) $conv->id)
                ->onQueue('notifications');
        }

        return response()->json([
            'success'             => true,
            'data'                => $msg,
            'conversation_status' => $status,
        ], 201);
    }

    /**
     * POST /v1/messages/conversations/{userId}/read
     */
    public function markRead(Request $request, int $userId): JsonResponse
    {
        $me = $request->user()->id;

        // Only mark read on approved conversations
        $userA = min($me, $userId);
        $userB = max($me, $userId);
        $conv  = Conversation::where('user_a_id', $userA)->where('user_b_id', $userB)->first();

        if (!$conv || $conv->status === 'approved') {
            $this->markMessagesRead(senderId: $userId, readerId: $me);
        }

        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/messages/delivered  { message_ids: [...] }
     * Device delivery ACK - the Centrifugo replacement for the chat-server's
     * `dm:delivered`. Stamps delivered_at on the receiver's just-arrived messages
     * and pushes a `message.delivered` receipt to each sender (✓ stays single
     * until read). Idempotent via `delivered_at IS NULL`.
     */
    public function markDelivered(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message_ids'   => ['required', 'array', 'max:500'],
            'message_ids.*' => ['integer'],
        ]);

        $me  = $request->user()->id;
        $ids = array_values(array_unique(array_map('intval', $data['message_ids'])));
        if (empty($ids)) {
            return response()->json(['success' => true]);
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $rows = DB::select("
            UPDATE direct_messages
               SET delivered_at = NOW()
             WHERE receiver_id = ? AND delivered_at IS NULL AND id IN ($placeholders)
             RETURNING id, sender_id, delivered_at
        ", array_merge([$me], $ids));

        if (empty($rows)) {
            return response()->json(['success' => true]);
        }

        $deliveredAt = Carbon::parse($rows[0]->delivered_at)->toIso8601String();
        $bySender    = [];
        foreach ($rows as $r) {
            $bySender[(int) $r->sender_id][] = (int) $r->id;
        }
        foreach ($bySender as $senderId => $mids) {
            RealtimeBus::publish([RealtimeBus::userRoom($senderId)], 'message.delivered', [
                'receiver_id'  => $me,
                'message_ids'  => $mids,
                'delivered_at' => $deliveredAt,
            ]);
        }

        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/messages/conversations/{userId}/typing
     *
     * Purely ephemeral - no DB write, no message history. Publishes a
     * fire-and-forget event to the peer's own realtime room, same as every
     * other DM receipt (message.new/delivered/read all use userRoom(), not
     * convRoom() - see RealtimeBus's own docblock - so this matches rather
     * than introducing a second subscription the client would need to join).
     * The client-side debounce is what keeps this off the keystroke path;
     * this endpoint intentionally does no debouncing/rate limiting of its
     * own beyond the standard authenticated-route throttle.
     */
    public function typing(Request $request, int $userId): JsonResponse
    {
        $me = $request->user()->id;
        if ($me === $userId) {
            return response()->json(['success' => true]);
        }

        // Same block check every other DM write path uses - a blocked pair
        // should not learn anything about each other, typing included.
        $blocked = DB::table('blocked_users')
            ->where(fn ($q) => $q->where('blocker_id', $me)->where('blocked_id', $userId))
            ->orWhere(fn ($q) => $q->where('blocker_id', $userId)->where('blocked_id', $me))
            ->exists();
        if ($blocked) {
            return response()->json(['success' => true]);
        }

        RealtimeBus::publish([RealtimeBus::userRoom($userId)], 'message.typing', [
            'from'   => $me,
            'typing' => $request->boolean('typing', true),
        ]);

        return response()->json(['success' => true]);
    }

    /**
     * Mark every unread message from $senderId → $readerId as read (reading also
     * implies delivery) and push a `message.read` receipt to the sender's socket
     * room so their ✓ flips to ✓✓ instantly. Atomic UPDATE…RETURNING: concurrent
     * calls can't double-publish the same receipt.
     */
    private function markMessagesRead(int $senderId, int $readerId): void
    {
        $rows = DB::select("
            UPDATE direct_messages
               SET read_at = NOW(), delivered_at = COALESCE(delivered_at, NOW())
             WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL
             RETURNING id, read_at
        ", [$senderId, $readerId]);

        if (!empty($rows)) {
            RealtimeBus::publish([RealtimeBus::userRoom($senderId)], 'message.read', [
                'reader_id'   => $readerId,
                'message_ids' => array_map(static fn ($r) => (int) $r->id, $rows),
                'read_at'     => Carbon::parse($rows[0]->read_at)->toIso8601String(),
            ]);
        }
    }

    /**
     * GET /v1/messages/unread-count
     */
    /**
     * Timestamp columns a raw DB::select returns on each row shape here.
     * Eloquent serialises dates itself; a raw select does not, which is the
     * whole problem this normalises.
     */
    private const RAW_TIMESTAMP_FIELDS = [
        'last_ts', 'last_read_at', 'last_delivered_at', 'created_at',
    ];

    /**
     * Re-serialises raw DB timestamps into the SAME ISO-8601 UTC string
     * Eloquent produces.
     *
     * Postgres hands a raw DB::select back as "2026-09-05 05:12:30" - no
     * timezone marker at all - while Eloquent gives
     * "2026-09-05T05:12:30.000000Z". JavaScript treats the first as LOCAL
     * time and the second as UTC, so the same instant read one way or the
     * other differs by the whole UTC offset. In Nepal (UTC+05:45) that made a
     * message sent seconds ago read as "5h ago", which is exactly the reported
     * bug and exactly the offset.
     *
     * Normalised here, on the server, rather than taught to each client:
     * the app and the website both parse these, and a timestamp must have one
     * meaning by the time it leaves the API - never be UTC or local depending
     * on which query built it.
     *
     * last_active_at is deliberately NOT in the list: it is consumed on this
     * side by Carbon (see the presence check below), never sent to a client.
     */
    private function normaliseTimestamps(array $rows): array
    {
        foreach ($rows as $row) {
            foreach (self::RAW_TIMESTAMP_FIELDS as $field) {
                if (! isset($row->{$field}) || $row->{$field} === null) {
                    continue;
                }
                // Parsed AS UTC because that is what the column holds -
                // config/app.php sets the app timezone to UTC and the rows
                // were written through it.
                $row->{$field} = Carbon::parse($row->{$field}, 'UTC')->format('Y-m-d\TH:i:s.u\Z');
            }
        }

        return $rows;
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $me = $request->user()->id;

        // Only count unread in approved conversations (not requests)
        $count = DB::select("
            SELECT COUNT(*) AS cnt
            FROM direct_messages dm
            LEFT JOIN conversations c ON c.user_a_id = LEAST(dm.sender_id, dm.receiver_id)
                AND c.user_b_id = GREATEST(dm.sender_id, dm.receiver_id)
            WHERE dm.receiver_id = ?
              AND dm.read_at IS NULL
              AND (c.id IS NULL OR c.status = 'approved')
        ", [$me]);

        // INCOMING requests only.
        //
        // This used to count initiated_by as well, so a request the user SENT
        // raised their own badge - and kept it raised until the other person
        // accepted, which they may never do. A user with nothing unread who had
        // messaged one stranger saw a permanent "1" they could not clear by
        // reading anything, because there was nothing of theirs to read.
        //
        // A badge means "this needs you". A request you sent needs the other
        // person. The requests SCREEN still lists both directions (see
        // requests() above, which returns `incoming` and `sent`) - that is a
        // list, not a count of outstanding work, so it is unchanged.
        $requestCount = DB::table('conversations')
            ->where('status', 'pending_request')
            ->where('received_by', $me)
            ->count();

        return response()->json(['success' => true, 'data' => [
            'count'         => (int) ($count[0]->cnt ?? 0),
            'request_count' => (int) $requestCount,
        ]]);
    }

    /* ── Message Request actions ─────────────────────────────────────── */

    /**
     * POST /v1/messages/requests/{id}/accept
     */
    public function acceptRequest(Request $request, int $id): JsonResponse
    {
        $me = $request->user()->id;

        $conv = Conversation::where('id', $id)
            ->where('received_by', $me)
            ->where('status', 'pending_request')
            ->firstOrFail();

        $conv->update(['status' => 'approved', 'approved_at' => now()]);

        // Notify the original sender that their message request was accepted
        $accepter = request()->user();
        $sender   = User::find($conv->initiated_by);
        if ($sender) {
            $this->notifs->notify($sender, 'message_request_accepted', [
                'actor_id'    => $accepter->id,
                'entity_type' => 'conversation',
                'entity_id'   => $conv->id,
                'message'     => "@{$accepter->username} accepted your message request.",
            ]);
        }

        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/messages/requests/{id}/delete
     */
    public function deleteRequest(Request $request, int $id): JsonResponse
    {
        $me = $request->user()->id;

        $conv = Conversation::where('id', $id)
            ->where('received_by', $me)
            ->whereIn('status', ['pending_request'])
            ->firstOrFail();

        // Mark rejected - prevents re-sending
        $conv->update(['status' => 'rejected']);

        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/messages/requests/{id}/block
     * Block the sender and reject the request.
     */
    public function blockRequest(Request $request, int $id): JsonResponse
    {
        $me = $request->user()->id;

        $conv = Conversation::where('id', $id)
            ->where('received_by', $me)
            ->whereIn('status', ['pending_request'])
            ->firstOrFail();

        // Block the initiating user via BlockController logic
        DB::transaction(function () use ($me, $conv) {
            $conv->update(['status' => 'blocked']);

            // Create a block record if not already blocked
            $exists = DB::table('blocked_users')
                ->where('blocker_id', $me)
                ->where('blocked_id', $conv->initiated_by)
                ->exists();

            if (!$exists) {
                DB::table('blocked_users')->insert([
                    'blocker_id' => $me,
                    'blocked_id' => $conv->initiated_by,
                    'created_at' => now(),
                ]);
            }
        });

        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/messages/requests/{id}/report
     *
     * The pending-request-specific report: reporting an unaccepted request
     * also declines it (the two actions were always paired in the UI - you
     * report a request precisely because you don't want to talk to them).
     * This used to update the conversation's status and nothing else - the
     * report itself was never actually stored anywhere ("TODO: store the
     * report in a reports table if one exists" - one now does).
     */
    public function reportRequest(Request $request, ReportEvidenceService $reportEvidence, int $id): JsonResponse
    {
        $request->validate([
            'reason'  => ['nullable', 'string', 'in:spam,harassment,hate_speech,nudity,scam_fraud,other'],
            'details' => ['nullable', 'string', 'max:500'],
            ...$reportEvidence->rules(),
        ]);

        $me = $request->user()->id;

        $conv = Conversation::where('id', $id)
            ->where('received_by', $me)
            ->whereIn('status', ['pending_request'])
            ->firstOrFail();

        $conv->update(['status' => 'rejected']);
        $this->recordConversationReport($request, $reportEvidence, $conv, $me);

        return response()->json(['success' => true, 'message' => 'Report submitted. The conversation has been removed.']);
    }

    /**
     * POST /v1/messages/conversations/{userId}/report
     *
     * The general case: reporting an ONGOING (already-accepted) conversation,
     * which reportRequest() above never covered - it only ever matched a
     * still-pending request. Unlike reportRequest(), this does not change
     * the conversation's status - reporting an ongoing conversation you may
     * still want to use (block/leave are their own, separate actions) is a
     * different intent than declining a request from a stranger.
     *
     * Keyed by the OTHER user's id, not the conversation's own primary key -
     * matches every other /conversations/{userId}/* route in this file
     * (history, send, mark-read, settings.update), and the (user_a_id,
     * user_b_id) resolution below is copied from history()'s own.
     */
    public function report(Request $request, ReportEvidenceService $reportEvidence, int $userId): JsonResponse
    {
        $request->validate([
            'reason'  => ['required', 'string', 'in:spam,harassment,hate_speech,nudity,scam_fraud,other'],
            'details' => ['nullable', 'string', 'max:500'],
            ...$reportEvidence->rules(),
        ]);

        $me    = $request->user()->id;
        $userA = min($me, $userId);
        $userB = max($me, $userId);
        $conv  = Conversation::where('user_a_id', $userA)->where('user_b_id', $userB)->firstOrFail();

        $this->recordConversationReport($request, $reportEvidence, $conv, $me);

        return response()->json(['success' => true, 'message' => 'Report submitted. Thank you for keeping Teezer safe.']);
    }

    /**
     * Shared by both report entry points above: writes the actual report
     * (reporter/reason/details/evidence - what ContentReport exists for)
     * AND flips the SAME flagged_at/report_status/risk_level columns
     * AdminMessagesController's own moderation queue already filters and
     * displays on (see its 'reported'/'flagged' filters) - so a report
     * surfaces in the admin queue that already existed for this, with no
     * separate admin UI needed for conversations specifically.
     */
    private function recordConversationReport(Request $request, ReportEvidenceService $reportEvidence, Conversation $conv, int $reporterId): void
    {
        $already = ContentReport::type(ContentReport::TYPE_CONVERSATION)
            ->where('reportable_id', $conv->id)
            ->where('reporter_id', $reporterId)
            ->exists();

        if (! $already) {
            ContentReport::create([
                'reportable_type' => ContentReport::TYPE_CONVERSATION,
                'reportable_id'   => $conv->id,
                'reporter_id'     => $reporterId,
                'reason'          => $request->input('reason', 'other'),
                'details'         => $request->input('details'),
                'evidence_keys'   => $reportEvidence->store($request),
            ]);
        }

        if (! $conv->flagged_at) {
            $conv->update(['flagged_at' => now(), 'report_status' => 'open', 'risk_level' => 'medium']);
        }
    }

    /**
     * POST /v1/messages/requests/{id}/cancel
     * Sender cancels their own pending request.
     */
    public function cancelRequest(Request $request, int $id): JsonResponse
    {
        $me = $request->user()->id;

        $conv = Conversation::where('id', $id)
            ->where('initiated_by', $me)
            ->where('status', 'pending_request')
            ->firstOrFail();

        // Remove messages in this conversation
        DirectMessage::where('conversation_id', $id)->delete();

        // Remove the message_request notification from the receiver
        DB::table('notifications')
            ->where('user_id', $conv->received_by)
            ->where('type', 'message_request')
            ->where('entity_type', 'conversation')
            ->where('entity_id', $id)
            ->delete();

        $conv->delete();

        return response()->json(['success' => true]);
    }

    /* ── Conversation settings (pin / archive / mute) ─────────────────── */

    /**
     * PUT /messages/conversations/{userId}/settings
     *
     * Body may carry any of `pinned`, `archived` (booleans) or `mute` (one of
     * off | 8h | 1w | always). Absent keys are left alone, so the inbox can
     * toggle one thing without restating the rest and racing itself.
     *
     * Per-member by construction: the row is keyed on (conversation, ME), so
     * pinning never touches what the other person sees.
     */
    public function updateConversationSettings(Request $request, int $userId): JsonResponse
    {
        $request->validate([
            'pinned'   => ['sometimes', 'boolean'],
            'archived' => ['sometimes', 'boolean'],
            'mute'     => ['sometimes', 'in:off,8h,1w,always'],
        ]);

        $me   = $request->user()->id;
        $userA = min($me, $userId);
        $userB = max($me, $userId);

        $conv = Conversation::where('user_a_id', $userA)->where('user_b_id', $userB)->first();
        if (!$conv) {
            return response()->json(['success' => false, 'message' => 'No conversation yet.'], 404);
        }

        $patch = [];
        if ($request->has('pinned')) {
            $patch['pinned_at'] = $request->boolean('pinned') ? now() : null;
        }
        if ($request->has('archived')) {
            $patch['archived_at'] = $request->boolean('archived') ? now() : null;
        }
        if ($request->has('mute')) {
            // "always" is a date far enough out to be permanent without needing a
            // second column to mean forever.
            $patch['muted_until'] = match ($request->input('mute')) {
                '8h'     => now()->addHours(8),
                '1w'     => now()->addWeek(),
                'always' => now()->addYears(100),
                default  => null,
            };
        }

        if (!$patch) {
            return response()->json(['success' => false, 'message' => 'Nothing to change.'], 422);
        }

        DB::table('conversation_settings')->updateOrInsert(
            ['conversation_id' => $conv->id, 'user_id' => $me],
            $patch + ['updated_at' => now(), 'created_at' => now()],
        );

        $row = DB::table('conversation_settings')
            ->where('conversation_id', $conv->id)->where('user_id', $me)->first();

        return response()->json(['success' => true, 'data' => [
            'pinned'      => !is_null($row->pinned_at ?? null),
            'archived'    => !is_null($row->archived_at ?? null),
            // Reported as still-muted only while it actually is - an expired
            // mute is not a mute, and the client should not have to work that out.
            'muted'       => !empty($row->muted_until) && Carbon::parse($row->muted_until)->isFuture(),
            'muted_until' => $row->muted_until ?? null,
        ]]);
    }

    /* ── Message actions ─────────────────────────────────────────────── */

    public function editMessage(Request $request, int $id): JsonResponse
    {
        $request->validate(['body' => ['required', 'string', 'max:4000']]);

        $me  = $request->user()->id;
        $msg = DirectMessage::where('id', $id)->where('sender_id', $me)
            ->whereNull('deleted_for_everyone_at')
            ->firstOrFail();

        $msg->update(['body' => $request->input('body'), 'edited_at' => now()]);

        return response()->json(['success' => true, 'data' => $msg]);
    }

    public function deleteMessage(Request $request, int $id): JsonResponse
    {
        $request->validate(['scope' => ['required', 'in:me,everyone']]);

        $me  = $request->user()->id;
        $msg = DirectMessage::findOrFail($id);

        if ($msg->sender_id !== $me && $msg->receiver_id !== $me) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        if ($request->input('scope') === 'everyone') {
            if ($msg->sender_id !== $me) {
                return response()->json(['success' => false, 'message' => 'Only the sender can delete for everyone.'], 403);
            }
            $msg->update([
                'deleted_for_everyone_at' => now(),
                'deleted_by_user_id'      => $me,
            ]);
        } else {
            $ids = $msg->deleted_for_user_ids ?? [];
            if (!in_array($me, $ids, true)) {
                $ids[] = $me;
            }
            $msg->update(['deleted_for_user_ids' => $ids]);
        }

        return response()->json(['success' => true]);
    }

    public function pinMessage(Request $request, int $id): JsonResponse
    {
        $request->validate(['duration' => ['nullable', 'in:24h,7d,30d,forever']]);

        $me  = $request->user()->id;
        $msg = DirectMessage::findOrFail($id);

        if ($msg->sender_id !== $me && $msg->receiver_id !== $me) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        // Same "null = forever" convention conversation_settings.muted_until
        // already uses - no cron needed either way, DirectMessage::isPinned()
        // treats an expired pinned_until as unpinned at read time.
        $pinnedUntil = match ($request->input('duration', 'forever')) {
            '24h' => now()->addDay(),
            '7d'  => now()->addDays(7),
            '30d' => now()->addDays(30),
            default => null,
        };

        $msg->update(['is_pinned' => true, 'pinned_at' => now(), 'pinned_by_user_id' => $me, 'pinned_until' => $pinnedUntil]);

        return response()->json(['success' => true, 'data' => $msg]);
    }

    public function unpinMessage(Request $request, int $id): JsonResponse
    {
        $me  = $request->user()->id;
        $msg = DirectMessage::findOrFail($id);

        if ($msg->sender_id !== $me && $msg->receiver_id !== $me) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $msg->update(['is_pinned' => false, 'pinned_at' => null, 'pinned_by_user_id' => null]);

        return response()->json(['success' => true]);
    }

    /**
     * POST /messages/{id}/react   { emoji }
     *
     * One reaction per person per message: reacting again REPLACES it, which is
     * why this is an upsert on (message_id, user_id) rather than an insert. It
     * is also idempotent - the same emoji twice leaves one row, so a retried
     * request cannot double a count.
     *
     * Sending the emoji you already have removes it, the toggle every messenger
     * uses: tapping your own reaction again is how you take it back.
     */
    public function reactMessage(Request $request, int $id): JsonResponse
    {
        $request->validate(['emoji' => ['required', 'string', 'max:32']]);

        $me    = $request->user()->id;
        $emoji = $request->input('emoji');
        $msg   = DirectMessage::findOrFail($id);

        if ($msg->sender_id !== $me && $msg->receiver_id !== $me) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }
        if ($msg->deleted_for_everyone_at) {
            return response()->json(['success' => false, 'message' => 'That message was deleted.'], 422);
        }

        $existing = DB::table('direct_message_reactions')
            ->where('message_id', $id)->where('user_id', $me)->first();

        if ($existing && $existing->emoji === $emoji) {
            DB::table('direct_message_reactions')->where('id', $existing->id)->delete();
        } else {
            DB::table('direct_message_reactions')->updateOrInsert(
                ['message_id' => $id, 'user_id' => $me],
                ['emoji' => $emoji, 'updated_at' => now(), 'created_at' => now()],
            );
        }

        return response()->json(['success' => true, 'data' => $this->reactionsFor($id)]);
    }

    /** DELETE /messages/{id}/react - drop yours outright, whatever it is. */
    public function unreactMessage(Request $request, int $id): JsonResponse
    {
        $me  = $request->user()->id;
        $msg = DirectMessage::findOrFail($id);

        // SECURITY: same participant check as reactMessage()/unpinMessage() -
        // without it, anyone signed in could hit a guessed/enumerated message
        // id and get back reactionsFor() (every reactor's user id + emoji) for
        // a DM they are not part of.
        if ($msg->sender_id !== $me && $msg->receiver_id !== $me) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        DB::table('direct_message_reactions')
            ->where('message_id', $id)
            ->where('user_id', $me)
            ->delete();

        return response()->json(['success' => true, 'data' => $this->reactionsFor($id)]);
    }

    /**
     * Reactions on one message, grouped for rendering: the emoji, how many, and
     * who. `mine` saves the client diffing the list to know whether to fill the
     * chip in.
     */
    private function reactionsFor(int $messageId): array
    {
        $me   = request()->user()?->id;
        $rows = DB::table('direct_message_reactions')
            ->where('message_id', $messageId)
            ->get(['user_id', 'emoji']);

        return $rows->groupBy('emoji')->map(fn ($group, $emoji) => [
            'emoji'    => $emoji,
            'count'    => $group->count(),
            'user_ids' => $group->pluck('user_id')->all(),
            'mine'     => $group->contains('user_id', $me),
        ])->values()->all();
    }

    public function forwardMessage(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'conversation_ids'   => ['required', 'array', 'min:1', 'max:10'],
            'conversation_ids.*' => ['integer'],
        ]);

        $me       = $request->user()->id;
        $original = DirectMessage::findOrFail($id);

        if ($original->sender_id !== $me && $original->receiver_id !== $me) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $forwarded = [];
        foreach ($request->input('conversation_ids') as $targetId) {
            $targetId = (int) $targetId;
            if ($targetId === $me) continue;
            $targetUser = User::findOrFail($targetId);

            // Skip targets who have blocked the sender or vice-versa
            $isBlocked = DB::table('blocked_users')
                ->where(fn ($q) => $q->where('blocker_id', $me)->where('blocked_id', $targetId))
                ->orWhere(fn ($q) => $q->where('blocker_id', $targetId)->where('blocked_id', $me))
                ->exists();
            if ($isBlocked) continue;

            // SECURITY: resolve (or create, or refuse) the target conversation
            // through the EXACT same rules send() uses - private-account follow
            // gate, message_privacy tiers, a rejected/blocked conversation, an
            // un-accepted pending request. Any refusal is skipped rather than
            // surfaced (this is a bulk multi-target action, not a single
            // explicit send), and a genuinely new conversation is created with
            // the correct pending_request/approved status instead of the
            // message floating with no conversation_id at all.
            $result = $this->resolveConversationForMessage($request->user(), $targetUser);
            if ($result instanceof JsonResponse) continue;
            $targetConv = $result;

            $fwd = DirectMessage::create([
                'conversation_id' => $targetConv->id,
                'sender_id'    => $me,
                'receiver_id'  => $targetId,
                'body'         => $original->deleted_for_everyone_at ? 'This message was deleted' : $original->body,
                'message_type' => $original->message_type,
                'r2_key'       => $original->r2_key,
                // getRawOriginal, not the accessor: r2_url/thumbnail_url now RETURN a signed,
                // expiring link. Copying the accessor's output would bake a short-lived token
                // into the forwarded row's stored column. The key is the durable thing; the
                // URL is re-signed on every read.
                'r2_url'       => $original->getRawOriginal('r2_url'),
                'thumbnail_key'=> $original->thumbnail_key,
                'thumbnail_url'=> $original->getRawOriginal('thumbnail_url'),
                'file_size'    => $original->file_size,
                'duration'     => $original->duration,
                'file_name'    => $original->file_name,
                'mime_type'    => $original->mime_type,
                'video_id'     => $original->video_id,
                'shared_user_id' => $original->shared_user_id,
                'product_id'   => $original->product_id,
                'story_id'     => $original->story_id,
                'story_thumbnail_url' => $original->story_thumbnail_url,
            ]);
            if ($fwd->message_type === 'shared_profile') {
                $fwd->setRelation('sharedUser', $original->sharedUser()->select('id', 'username', 'name', 'avatar', 'is_verified')->first());
            } elseif ($fwd->message_type === 'shared_product') {
                $fwd->setRelation('product', $original->product()->with('shop:id,shop_name')->select('id', 'name', 'price', 'currency', 'image_url', 'shop_id')->first());
            }
            $forwarded[] = $fwd;
        }

        return response()->json(['success' => true, 'data' => $forwarded], 201);
    }

    /* ── Helpers ─────────────────────────────────────────────────────── */

    /**
     * Resolve (or create, or refuse) the conversation a message from $me to
     * $target belongs to - every DM-privacy rule EXCEPT self-message and
     * blocking, which callers must already have checked (both send() and
     * forwardMessage() do, with different UX for that case: a hard error for
     * a single explicit send, a silent skip for a bulk forward).
     *
     * The single shared implementation of this, used by both send() and
     * forwardMessage(), so the two can never drift apart again the way they
     * had: forwardMessage() used to reimplement this separately (as
     * messagingBlocked(), now removed), and its grandfathering check was
     * `whereIn('status', ['approved', 'pending_approval'])` - but a
     * Conversation's status is only ever approved/pending_request/rejected/
     * blocked. 'pending_approval' has never been one of them; it's an
     * unrelated per-MESSAGE flag from this class's own flagged_by_admin
     * handling. That typo meant an existing REJECTED (or blocked, or
     * pending-and-not-yet-accepted) conversation was never detected, so
     * forwarding fell straight through to the same rules as a brand new
     * message - silently bypassing both the rejection and the pending-request
     * gate for anyone with an existing conversation in one of those states.
     *
     * Returns the Conversation (existing or newly created) on success, or a
     * ready-to-return JsonResponse explaining the refusal.
     */
    private function resolveConversationForMessage(User $me, User $target): Conversation|JsonResponse
    {
        $userA = min($me->id, $target->id);
        $userB = max($me->id, $target->id);

        $conv = Conversation::where('user_a_id', $userA)->where('user_b_id', $userB)->first();

        if ($conv) {
            if ($conv->status === 'rejected') {
                return response()->json(['success' => false, 'message' => 'Your message request was declined.'], 403);
            }
            if ($conv->status === 'blocked') {
                return response()->json(['success' => false, 'message' => 'You cannot message this user.'], 403);
            }
            if ($conv->status === 'pending_request' && $conv->received_by === $me->id) {
                return response()->json(['success' => false, 'message' => 'Accept the message request to reply.'], 403);
            }
            // approved OR pending_request as the original sender → allow
            return $conv;
        }

        // Check for legacy messages between this pair
        $hasLegacy = DirectMessage::where(function ($q) use ($me, $target) {
            $q->where('sender_id', $me->id)->where('receiver_id', $target->id);
        })->orWhere(function ($q) use ($me, $target) {
            $q->where('sender_id', $target->id)->where('receiver_id', $me->id);
        })->exists();

        if ($hasLegacy) {
            // Legacy relationship → create an approved conversation record
            return Conversation::create([
                'user_a_id'    => $userA,
                'user_b_id'    => $userB,
                'initiated_by' => $me->id,
                'received_by'  => $target->id,
                'status'       => 'approved',
                'approved_at'  => now(),
            ]);
        }

        // No prior conversation - run full privacy check

        // Private account: sender must be an accepted follower
        if ($target->is_private && !$this->followsWithStatus($me->id, $target->id)) {
            return response()->json(['success' => false, 'message' => 'Follow this account and wait for acceptance before messaging.'], 403);
        }

        $privacy  = $target->message_privacy ?? 'everyone';
        $isMutual = $this->areMutual($me->id, $target->id);
        $iFollow  = $this->followsWithStatus($me->id, $target->id);

        $errorMsg = null;

        if ($privacy === 'no_one') {
            $errorMsg = 'This user is not accepting messages right now.';
        } elseif ($privacy === 'friends') {
            if (!$isMutual) {
                $errorMsg = 'This user only accepts messages from mutual friends.';
            }
        } elseif ($privacy === 'followers') {
            if (!$iFollow) {
                $errorMsg = 'Follow this user to send them a message.';
            }
        }
        // 'everyone' → mutual goes to inbox, non-mutual goes to message requests

        if ($errorMsg) {
            return response()->json(['success' => false, 'message' => $errorMsg], 403);
        }

        // Private-account accepted followers always go to main inbox (follow approval = trust approval).
        // Public accounts: mutual → inbox, non-mutual → message requests.
        $convStatus = ($isMutual || $target->is_private) ? 'approved' : 'pending_request';

        $conv = Conversation::create([
            'user_a_id'    => $userA,
            'user_b_id'    => $userB,
            'initiated_by' => $me->id,
            'received_by'  => $target->id,
            'status'       => $convStatus,
            'approved_at'  => $convStatus === 'approved' ? now() : null,
        ]);

        if ($convStatus === 'pending_request') {
            $this->notifs->notify($target, 'message_request', [
                'actor_id'    => $me->id,
                'entity_type' => 'conversation',
                'entity_id'   => $conv->id,
                'message'     => "@{$me->username} sent you a message request.",
            ]);
        }

        return $conv;
    }

    private function areMutual(int $userAId, int $userBId): bool
    {
        $aFollowsB = DB::table('followers')
            ->where('follower_id', $userAId)
            ->where('following_id', $userBId)
            ->where('status', 'accepted')
            ->exists();

        if (!$aFollowsB) return false;

        return DB::table('followers')
            ->where('follower_id', $userBId)
            ->where('following_id', $userAId)
            ->where('status', 'accepted')
            ->exists();
    }

    private function followsWithStatus(int $followerId, int $followingId): bool
    {
        return DB::table('followers')
            ->where('follower_id', $followerId)
            ->where('following_id', $followingId)
            ->where('status', 'accepted')
            ->exists();
    }

    /**
     * Check all admin-set conversation restrictions.
     * Returns a 403 JsonResponse if any active restriction blocks the message, null otherwise.
     */
    private function checkAdminRestrictions(Conversation $conv, string $type, string $body): ?JsonResponse
    {
        $config   = $conv->restrictions_config ?? [];
        $isActive = function (string $field) use ($conv, $config): bool {
            if (!(bool) ($conv->$field ?? false)) return false;
            $exp = $config[$field] ?? null;
            // If expiry is set and has passed, restriction is no longer active
            return !$exp || now()->lessThan(Carbon::parse($exp));
        };

        // Conversation closed by admin - no messages at all
        if ($conv->admin_closed_at) {
            return response()->json([
                'success' => false,
                'message' => 'This conversation has been closed by the Teezer moderation team.',
            ], 403);
        }

        // DM restricted - sender cannot send any message in this conversation
        if ($isActive('dm_restricted')) {
            return response()->json([
                'success' => false,
                'message' => 'Your direct messaging has been temporarily restricted. Please review our community guidelines.',
            ], 403);
        }

        // Media restricted - only text messages are allowed
        if ($isActive('media_restricted') && $type !== 'text') {
            return response()->json([
                'success' => false,
                'message' => 'Sharing media in this conversation has been restricted by the moderation team.',
            ], 403);
        }

        // Links disabled - reject messages that contain URLs
        if ($isActive('links_disabled') && $type === 'text' && trim($body) !== '') {
            $hasLink = preg_match(
                '/https?:\/\/\S+|www\.\S+|\b\S+\.(com|net|org|io|co|me|uk|de|fr|app|dev|ai)\b/i',
                $body
            );
            if ($hasLink) {
                return response()->json([
                    'success' => false,
                    'message' => 'Sharing links in this conversation has been disabled.',
                ], 403);
            }
        }

        return null;
    }
}
