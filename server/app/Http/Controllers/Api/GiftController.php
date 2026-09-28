<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CoinGift;
use App\Models\Gift;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoComment;
use App\Services\GiftCommissionService;
use App\Services\NotificationService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Sending coin-gifts to other users (e.g. from the comments sheet).
 *
 * The money movement is delegated entirely to GiftCommissionService::
 * processReceivedGift(), which runs inside one DB transaction with row locks,
 * a balance check, the configured commission cut, and a duplicate-reference
 * guard. This controller only validates input and maps the service's
 * exceptions to HTTP responses.
 */
class GiftController extends Controller
{
    public function __construct(private readonly NotificationService $notifs) {}

    /**
     * GET /v1/users/{id}/gifts-eligible
     *
     * Whether to SHOW a gift-sending affordance for this user at all - the
     * comments composer, LIVE, wherever a gift icon appears against someone
     * else's content. Cached a few minutes (canUseCached) rather than
     * measured live like send() does - a gift icon can tolerate a little
     * staleness, the actual credit cannot.
     */
    public function eligible(int $id): JsonResponse
    {
        $active = app(\App\Services\MonetizationEligibilityService::class)->canUseCached($id, 'gifts');
        return response()->json(['success' => true, 'data' => ['active' => $active]]);
    }

    /** GET /v1/gifts - the live 200-gift catalog, cheapest first. */
    public function index(): JsonResponse
    {
        // sort_order, not coin_value: the catalog has deliberate price ties (eight
        // gifts at $0.99), and only sort_order keeps them in their designed order.
        $gifts = Gift::active()
            ->orderBy('sort_order')
            ->get(['id', 'slug', 'name', 'icon_url', 'coin_value', 'cash_value']);

        return response()->json(['success' => true, 'data' => $gifts]);
    }

    /**
     * GET /v1/gifts/history - gifts you received or sent, with the other person.
     *
     * Reads `coin_gifts`, not `wallet_transactions`. The ledger only records a
     * description string ("Gift received: Rose"), which is why the app could
     * never name a sender or draw the right gift; coin_gifts has sender_id,
     * receiver_id and gift_name, and is indexed on (sender_id, created_at) and
     * (receiver_id, created_at) for exactly this read.
     */
    public function history(Request $request): JsonResponse
    {
        $data = $request->validate([
            'direction' => ['nullable', Rule::in(['received', 'sent'])],
            'page'      => ['nullable', 'integer', 'min:1'],
            'per_page'  => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $me        = $request->user()->id;
        $direction = $data['direction'] ?? 'received';
        $perPage   = (int) ($data['per_page'] ?? 20);

        // The counterparty is whoever ISN'T you, which flips with direction.
        $mine  = $direction === 'sent' ? 'sender_id' : 'receiver_id';
        $other = $direction === 'sent' ? 'receiver' : 'sender';

        $rows = CoinGift::with([$other . ':id,username,name,avatar,is_verified'])
            ->where($mine, $me)
            ->where('status', 'completed')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $rows->map(function (CoinGift $g) use ($other, $direction) {
                $u = $g->{$other};
                return [
                    'id'        => $g->id,
                    'direction' => $direction,
                    'gift_name' => $g->gift_name,
                    // Sent spends the gross; received lands the net. Both are
                    // returned either way so the row can show the split.
                    'gross_coins'      => (int) $g->gross_coins,
                    'commission_coins' => (int) $g->commission_coins,
                    'net_coins'        => (int) $g->net_coins,
                    'video_id'         => $g->video_id,
                    'created_at'       => $g->created_at?->toIso8601String(),
                    'user'             => $u ? [
                        'id'          => $u->id,
                        'username'    => $u->username,
                        'name'        => $u->name,
                        'avatar'      => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
                        'is_verified' => (bool) $u->is_verified,
                    ] : null,
                ];
            }),
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page'    => $rows->lastPage(),
                'total'        => $rows->total(),
            ],
        ]);
    }

    /**
     * GET /v1/gifts/top-supporters - who has gifted you the most.
     *
     * Ranked by coins RECEIVED (net), because that is what actually reached the
     * creator - ranking on gross would order by what was spent, which is the
     * platform's cut included and not the creator's own ledger.
     */
    public function topSupporters(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period' => ['nullable', Rule::in(['month', 'all'])],
            'limit'  => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $me     = $request->user()->id;
        $limit  = (int) ($data['limit'] ?? 10);
        $period = $data['period'] ?? 'month';

        $q = CoinGift::query()
            ->selectRaw('sender_id, SUM(net_coins) AS coins, COUNT(*) AS gifts')
            ->where('receiver_id', $me)
            ->where('status', 'completed')
            ->groupBy('sender_id')
            ->orderByDesc('coins')
            ->limit($limit);

        if ($period === 'month') {
            $q->where('created_at', '>=', now()->subDays(30));
        }

        $rows  = $q->get();
        $users = User::whereIn('id', $rows->pluck('sender_id'))
            ->get(['id', 'username', 'name', 'avatar', 'is_verified'])
            ->keyBy('id');

        return response()->json([
            'success' => true,
            'data'    => $rows->values()->map(function ($r) use ($users) {
                $u = $users->get($r->sender_id);
                return [
                    'coins' => (int) $r->coins,
                    'gifts' => (int) $r->gifts,
                    'user'  => $u ? [
                        'id'          => $u->id,
                        'username'    => $u->username,
                        'name'        => $u->name,
                        'avatar'      => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
                        'is_verified' => (bool) $u->is_verified,
                    ] : null,
                ];
            })->filter(fn ($r) => $r['user'] !== null)->values(),
        ]);
    }

    /** POST /v1/gifts/send - spend the sender's coins to gift a user. */
    public function send(Request $request): JsonResponse
    {
        $data = $request->validate([
            'receiver_id'     => ['required', 'integer', 'exists:users,id'],
            'gift_id'         => ['required', 'integer', 'exists:gifts,id'],
            'comment_id'      => ['nullable', 'integer'],
            'video_id'        => ['nullable', 'integer'],
            // Not persisted below (the money-movement path this delegates to,
            // GiftCommissionService::processReceivedGift(), is intentionally
            // left untouched) - used only to gate live_gifts_enabled in
            // addition to the general Gifts switch. This is what
            // distinguishes a "live gift" from an ordinary one; nothing else
            // in the request does.
            'live_stream_id'  => ['nullable', 'integer', 'exists:live_streams,id'],
        ]);

        $globalControls = app(\App\Services\GlobalControls\GlobalControlService::class);
        if (! empty($data['live_stream_id']) && ! $globalControls->isEnabled('live_gifts_enabled')) {
            return response()->json($globalControls->deniedResponse('live_gifts_enabled'), 403);
        }

        $sender = $request->user();
        if ((int) $data['receiver_id'] === $sender->id) {
            return response()->json(['success' => false, 'message' => "You can't send a gift to yourself.", 'code' => 'SELF_GIFT'], 422);
        }

        /*
         * The SENDER must have unlocked Gifts & Coins too, same as the
         * receiver check below - sending was previously gated on nothing
         * but a coin balance, so any authenticated account (freshly signed
         * up, banned-from-monetization, whatever) could spend coins on a
         * gift it had never actually unlocked. 403, not 422: this is who is
         * allowed to call this endpoint at all, not a validation failure of
         * the request body.
         */
        if (! app(\App\Services\MonetizationEligibilityService::class)->canUse($sender, 'gifts')) {
            return response()->json([
                'success' => false,
                'message' => 'Join the Gifts & Coins Program to send and receive Gifts.',
                'code'    => 'SENDER_NOT_GIFT_ELIGIBLE',
            ], 403);
        }

        /*
         * The receiver must have actually unlocked Gifts & Coins - every
         * requirement met, admin has the programme on. Gifts always credited
         * ANY existing user before this, whether they had ever completed a
         * single requirement or not; the app's own eligibility gating on
         * "Get Started" (see GiftsIntroScreen) was therefore purely cosmetic
         * on the sending side. Live, uncached - see MonetizationEligibility
         * Service::canUse()'s own docblock on why a gift check can't use the
         * cached/snapshot answer the gift-ICON visibility check (canUseCached)
         * is allowed to.
         */
        $receiver = User::find($data['receiver_id']);
        if (! $receiver || ! app(\App\Services\MonetizationEligibilityService::class)->canUse($receiver, 'gifts')) {
            return response()->json([
                'success' => false,
                'message' => 'Gift receiving is unavailable until this user joins the Gifts & Coins Program.',
                'code'    => 'RECEIVER_NOT_GIFT_ELIGIBLE',
            ], 422);
        }

        /*
         * The admin's Active toggle is what takes a gift off sale, and it has to
         * hold HERE as well as in the catalog. index() already hides retired
         * gifts, but hiding is not preventing: a client holding a sheet it
         * opened before the toggle - or any caller with an old id - could still
         * send one and be charged for it.
         *
         * Retired gifts stay in the table on purpose, so history can still name
         * them. That makes them findable, which is not the same as purchasable,
         * and findOrFail could not tell the two apart.
         */
        $gift = Gift::find($data['gift_id']);
        if (! $gift || ! $gift->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'This gift is no longer available.',
                'code'    => 'GIFT_UNAVAILABLE',
            ], 422);
        }

        /**
         * Idempotency.
         *
         * processReceivedGift already refuses a reference it has seen, but this
         * method minted a fresh UUID on every call - so the guard could never
         * fire and a request that timed out after the coins moved was charged
         * again when the client retried.
         *
         * The key has to come from the CLIENT for that reason: only the client
         * knows that a retry is the same attempt rather than a second gift.
         * Sending two gifts in a row is legitimate and still works - it carries
         * a new key.
         *
         * Optional, so already-shipped clients keep working exactly as they do
         * today; they simply do not get the protection until they send one.
         * Scoped by sender because the reference is unique across all wallet
         * transactions, and two users must not be able to collide by choosing
         * the same key.
         */
        $key = $request->header('Idempotency-Key');
        if ($key !== null && ! preg_match('/^[A-Za-z0-9\-_]{8,64}$/', $key)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid Idempotency-Key.',
                'code'    => 'INVALID_IDEMPOTENCY_KEY',
            ], 422);
        }

        $reference = $key !== null
            ? 'gift_' . $sender->id . '_' . $key
            : 'gift_' . Str::uuid()->toString();

        try {
            $result = app(GiftCommissionService::class)->processReceivedGift(
                $sender->id,
                (int) $data['receiver_id'],
                (int) $gift->coin_value,
                $gift->name,
                $reference,
                isset($data['video_id']) ? (int) $data['video_id'] : null,
            );
        } catch (\Throwable $e) {
            $msg = strtolower($e->getMessage());

            // Expected domain errors → friendly, specific messages.
            if (str_contains($msg, 'insufficient')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Not enough coins. Top up to send this gift.',
                    'code'    => 'INSUFFICIENT_COINS',
                ], 422);
            }
            if (str_contains($msg, 'duplicate gift reference')) {
                return response()->json([
                    'success' => false,
                    'message' => 'This gift was already sent.',
                    'code'    => 'DUPLICATE_GIFT',
                ], 409);
            }

            // Anything else (DB/SQL/lock failures, etc.) is unexpected: log the REAL
            // cause for us, but NEVER expose the raw message / SQLSTATE to the user.
            Log::error('Gift send failed', [
                'sender_id'   => $sender->id,
                'receiver_id' => $data['receiver_id'] ?? null,
                'gift_id'     => $data['gift_id'] ?? null,
                'exception'   => $e,
            ]);
            return response()->json([
                'success' => false,
                'message' => 'Could not send the gift right now. Please try again.',
                'code'    => 'GIFT_FAILED',
            ], 500);
        }

        /*
         * ── Leave the gift on the post ────────────────────────────────────
         *
         * Gifting was invisible to everyone but the receiver: coins moved, a
         * notification went out, and the thread people were actually reading
         * showed nothing. A gift on a post now leaves a real comment carrying
         * the gift, so the client can draw its animated artwork - and because
         * it is a real row it counts, moderates and deletes like any other.
         *
         * Outside the money transaction, and swallowed on failure: a comment
         * that could not be written must never undo a completed payment.
         */
        if (! empty($data['video_id'])) {
            try {
                $video = Video::find((int) $data['video_id']);
                if ($video) {
                    $comment = VideoComment::create([
                        'video_id'   => $video->id,
                        'user_id'    => $sender->id,
                        // Top-level: a gift is addressed to the post, not tucked
                        // under whichever comment happened to be open.
                        'parent_id'  => null,
                        'root_id'    => null,
                        // Read by anything that has not been taught about gifts
                        // yet (search, exports, the web app before it ships).
                        'body'       => "sent a {$gift->name}",
                        'gift_id'    => $gift->id,
                        'gift_coins' => (int) $gift->coin_value,
                    ]);

                    // comments_count counts every visible comment, so a gift has
                    // to move it - recalculated rather than incremented, which is
                    // how the rest of the app keeps the drawer and the feed from
                    // drifting apart after deletes. Same definition of "visible"
                    // the comments endpoint uses, so the two cannot disagree.
                    $video->forceFill([
                        'comments_count' => VideoComment::visibleCountForVideo((int) $video->id),
                    ])->saveQuietly();

                    $comment->load('gift');
                }
            } catch (\Throwable $e) {
                Log::warning('Gift comment failed', [
                    'sender_id' => $sender->id,
                    'video_id'  => $data['video_id'] ?? null,
                    'exception' => $e,
                ]);
            }
        }

        // ── Tell the receiver ─────────────────────────────────────────────
        // The money moved, but until now nothing was ever raised for it: the
        // service writes wallet_transactions only, so a gift arrived silently
        // and the app's Gifts & coins row had nothing to count, list, or name a
        // sender from. Deliberately AFTER the transaction - a notification that
        // failed to send must never roll back a completed payment.
        try {
            $receiver = User::find((int) $data['receiver_id']);
            if ($receiver) {
                $net = (int) ($result['net_coins'] ?? 0);
                $this->notifs->notify($receiver, 'gift_received', [
                    'actor_id'    => $sender->id,
                    // Anchored to the post it was sent from, so DeepLinkService
                    // builds /video/{id} and opening it lands on that reel.
                    //
                    // comment_id is deliberately NOT passed even when the gift
                    // came from the comments sheet: forNotification() checks it
                    // first and would build /comment/{id}, which no client can
                    // open yet. The reel is the closest thing that works.
                    'entity_type' => isset($data['video_id']) ? 'video' : null,
                    'entity_id'   => isset($data['video_id']) ? (int) $data['video_id'] : null,
                    // States what LANDED, not what was spent - the commission is
                    // already taken out by here, and the ledger carries the split.
                    'message'     => "@{$sender->username} sent you a {$gift->name} · +{$net} coins",
                ]);
            }
        } catch (\Throwable $e) {
            // Never fail a paid gift because the notification did.
            Log::warning('Gift notification failed', [
                'sender_id'   => $sender->id,
                'receiver_id' => $data['receiver_id'] ?? null,
                'exception'   => $e,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "{$gift->name} sent!",
            'data'    => [
                'gift'                => ['id' => $gift->id, 'name' => $gift->name, 'coin_value' => (int) $gift->coin_value],
                'sender_coin_balance' => $result['sender_coin_balance'] ?? null,
                // The split, so the sender's client can show what actually
                // reached the creator rather than only what was spent.
                'gross_coins'         => (int) ($result['gross_coins'] ?? 0),
                'commission_coins'    => (int) ($result['commission_coins'] ?? 0),
                'net_coins'           => (int) ($result['net_coins'] ?? 0),
            ],
        ]);
    }
}
