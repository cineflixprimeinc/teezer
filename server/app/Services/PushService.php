<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\User;
use App\Models\UserDevice;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * OS-level push delivery: FCM (Android) and APNs (iOS).
 *
 * Deliberately dependency-free. Both transports need a signed JWT, and both are
 * signed here with ext-openssl rather than pulling in an SDK - the Firebase
 * Admin SDK exists to do rather more than mint one token, and SocialAuthVerifier
 * already set the precedent of avoiding firebase/php-jwt in this codebase.
 *
 * Every notification carries `deep_link` in its data payload. That string is the
 * same one the API returns and the same one the website uses, so a tapped push,
 * a tapped in-app row and a shared URL all resolve through one router on the
 * client. See App\Services\DeepLinkService.
 *
 * Failure is always soft: a dead transport must never break notification
 * creation, which is why this runs from a queued job. Tokens rejected as
 * permanently invalid are pruned so the same dead device is not retried forever.
 */
class PushService
{
    private const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

    /**
     * Which Settings > Notifications toggle governs each notification type.
     *
     * Keys are the `push_*` preferences written by
     * ProfileController::updateNotifications into users.notification_preferences.
     * A type absent from this map is NOT gated - system messages, gifts,
     * request outcomes and the like have no toggle of their own and are always
     * delivered. The settings screen has been live for a while; nothing was
     * reading it, so turning "Likes" off changed nothing.
     */
    private const PREF_BY_TYPE = [
        'like'            => 'push_likes',
        'comment_like'    => 'push_likes',
        'comment'         => 'push_comments',
        'reply'           => 'push_comments',
        'follow'          => 'push_followers',
        'follow_request'  => 'push_followers',
        'mention'         => 'push_mentions',
        'tag_request'     => 'push_mentions',
        'collab_request'  => 'push_mentions',
        'message_request' => 'push_messages',
        'live'            => 'push_live',
        'post'            => 'push_following',
    ];

    /** Defaults must match ProfileController::notifDefaults for these keys. */
    private const PREF_DEFAULTS = [
        'push_likes'     => true,  'push_comments'  => true,
        'push_followers' => true,  'push_mentions'  => true,
        'push_messages'  => true,  'push_live'      => false,
        'push_following' => true,
    ];

    /**
     * Types that always push, however fast they arrive.
     *
     * The debounce below exists for aggregated groups - twenty people liking
     * one video is one buzz, not twenty. These are not that: each is a distinct
     * event the recipient is expected to act on (approve a tag, answer a
     * request) or a one-off the platform sent deliberately, and silently
     * dropping the second one inside a shared window would lose it entirely.
     */
    private const NEVER_DEBOUNCED = [
        'mention', 'tag_request', 'collab_request',
        'tag_request_accepted', 'tag_request_rejected',
        'collab_request_accepted', 'collab_request_rejected',
        'follow_request', 'follow_request_accepted', 'follow_request_rejected',
        'message_request', 'message_request_accepted',
        'gift_received', 'system', 'live', 'verification',
        'report_actioned', 'report_update',
        'restriction_applied', 'restriction_lifted',
    ];

    public function send(User $recipient, AppNotification $notification): void
    {
        if (! config('push.enabled', true)) {
            return;
        }

        if (! $this->allowedByPreferences($recipient, (string) $notification->type)) {
            return;
        }

        if (! $this->allowedByDebounce($notification)) {
            return;
        }

        $link = DeepLinkService::forNotification($notification);

        $this->fanOut(
            $recipient,
            'Teezer',
            (string) ($notification->message ?? 'You have a new notification'),
            [
                'notification_id' => (string) $notification->id,
                'type'            => (string) $notification->type,
                // The client routes from this and nothing else.
                'deep_link'       => $link,
                'url'             => DeepLinkService::absolute($link),
            ],
            // One aggregated row IS one group, so its id is the group identity:
            // a re-push for the same group replaces the earlier alert in the
            // shade rather than stacking a second, near-identical copy of the
            // same sentence on top of it.
            "n-{$notification->id}",
            $this->threadFor($notification),
        );
    }

    /**
     * Push for a direct message.
     *
     * DMs are not AppNotification rows - they live in the messaging surface -
     * so they cannot go through send() above. Before this, `push_messages` was
     * a live preference in the settings screen that gated exactly one thing
     * (message_request), and an ordinary DM to a backgrounded user produced no
     * push at all: it published `message.new` to Centrifugo and stopped there,
     * and the app only holds that socket while a chat screen or call is open.
     *
     * The body deliberately does NOT contain the message. A DM is private and
     * this text renders on a locked screen; the sender's name is enough to
     * decide whether to open the app, and the app fetches the real content over
     * an authenticated request once opened.
     */
    public function sendDirectMessage(User $recipient, User $sender, int $conversationId): void
    {
        if (! config('push.enabled', true)) {
            return;
        }

        // Same preference the settings screen has always shown for messages.
        $prefs = $recipient->notification_preferences ?? [];
        if (! (bool) ($prefs['push_messages'] ?? self::PREF_DEFAULTS['push_messages'])) {
            return;
        }

        $link = DeepLinkService::messages();

        $this->fanOut(
            $recipient,
            (string) ($sender->name ?: '@' . $sender->username),
            'Sent you a message',
            [
                'type'            => 'direct_message',
                'conversation_id' => (string) $conversationId,
                'deep_link'       => $link,
                'url'             => DeepLinkService::absolute($link),
            ],
            // Per conversation, not per message: a burst from one person
            // collapses to the latest line instead of a stack of identical
            // "Sent you a message" alerts. Deliberately NOT debounced - unlike
            // an aggregated like group, every message is its own event, and
            // dropping the second one inside a window would lose it silently.
            "dm-{$conversationId}",
            "dm-{$conversationId}",
        );
    }

    /**
     * Deliver one alert to every device the recipient has registered.
     *
     * Shared by both entry points above so the badge, the per-device try/catch
     * and the transport split are written once. Per-device failures are
     * swallowed: one dead token must not stop the rest of the fan-out.
     */
    private function fanOut(
        User $recipient,
        string $title,
        string $body,
        array $data,
        ?string $collapseId = null,
        ?string $threadId = null,
    ): void {
        // Global Reelsoo Control - the single choke point every push (both
        // send() and sendDirectMessage()) passes through. Sits alongside the
        // existing config('push.enabled') check at the top of each of those
        // two methods rather than replacing it - this one is admin-toggleable
        // at runtime, that one is a deploy-time config flag.
        if (! app(\App\Services\GlobalControls\GlobalControlService::class)->isEnabled('push_notifications_enabled')) {
            return;
        }

        $devices = UserDevice::where('user_id', $recipient->id)->get();
        if ($devices->isEmpty()) {
            return;
        }

        // Computed once per push rather than once per device, and soft: a badge
        // that cannot be counted is omitted, which leaves whatever the icon
        // already showed rather than losing the alert over a count.
        $badge = null;
        try {
            $badge = app(UnreadBadgeService::class)->for($recipient->id);
        } catch (\Throwable $e) {
            Log::warning('push.badge_failed', ['user_id' => $recipient->id, 'error' => $e->getMessage()]);
        }

        foreach ($devices as $device) {
            try {
                if ($device->platform === 'android') {
                    $this->sendFcm($device, $title, $body, $data, $collapseId);
                } elseif ($device->platform === 'ios') {
                    $this->sendApns($device, $title, $body, $data, $badge, $collapseId, $threadId);
                }
            } catch (\Throwable $e) {
                Log::warning('push.send_failed', [
                    'device_id' => $device->id,
                    'platform'  => $device->platform,
                    'error'     => $e->getMessage(),
                ]);
            }
        }
    }

    /**
     * APNs thread-id: what the OS groups alerts under in the shade.
     *
     * The entity is the useful grain - every alert about one reel sits
     * together, rather than one thread per notification group, which would
     * group nothing. Types with no entity (a follow, a system notice) fall back
     * to the type so they still group with their own kind.
     */
    private function threadFor(AppNotification $notification): string
    {
        $entityType = (string) ($notification->entity_type ?? '');
        $entityId   = $notification->entity_id !== null ? (int) $notification->entity_id : null;

        if ($entityType !== '' && $entityId !== null) {
            return "{$entityType}-{$entityId}";
        }

        return (string) $notification->type;
    }

    /**
     * Honour the recipient's own push preferences. Only the push transport is
     * gated - the in-app notification row is still created either way, which is
     * what the `push_` prefix on every one of these keys means.
     */
    private function allowedByPreferences(User $recipient, string $type): bool
    {
        $key = self::PREF_BY_TYPE[$type] ?? null;
        if ($key === null) {
            return true;
        }

        $prefs = $recipient->notification_preferences ?? [];

        return (bool) ($prefs[$key] ?? self::PREF_DEFAULTS[$key]);
    }

    /**
     * One buzz per notification group per window.
     *
     * NotificationService already collapses repeat events into a single
     * aggregated row, and already suppresses a repeat by the SAME actor - but a
     * video getting liked by twenty different people still dispatched twenty
     * pushes, each carrying a slightly longer version of the same sentence. The
     * first one goes out immediately; the rest of the burst is dropped, and the
     * card the user opens is up to date anyway because it is one row that keeps
     * counting.
     *
     * Cache::add is the check-and-set: it only succeeds when the key is absent,
     * so concurrent workers cannot both claim the same window. If the cache
     * store is per-box rather than shared, the worst case is one push per box -
     * more pushes than intended, never fewer, and never a lost first push.
     */
    private function allowedByDebounce(AppNotification $notification): bool
    {
        $window = (int) config('push.group_debounce_seconds', 60);
        if ($window <= 0 || in_array((string) $notification->type, self::NEVER_DEBOUNCED, true)) {
            return true;
        }

        return Cache::add("push:debounce:{$notification->id}", 1, $window);
    }

    /* ── FCM (Android) ─────────────────────────────────────────────────────── */

    private function sendFcm(
        UserDevice $device,
        string $title,
        string $body,
        array $data,
        ?string $collapseId = null,
    ): void {
        $projectId = config('push.fcm.project_id');
        $token     = $this->fcmAccessToken();
        if (! $projectId || ! $token) {
            return;
        }

        $android = ['priority' => 'high'];

        // Android's equivalent of apns-collapse-id: `tag` replaces an existing
        // notification carrying the same tag in the shade. Kept in step with
        // the APNs side so one group reads the same way on both platforms.
        if ($collapseId !== null && $collapseId !== '') {
            $android['notification'] = ['tag' => $collapseId];
        }

        $res = Http::withToken($token)
            ->timeout(10)
            ->post("https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send", [
                'message' => [
                    'token'        => $device->device_token,
                    'notification' => ['title' => $title, 'body' => $body],
                    // FCM requires every data value to be a string.
                    'data'         => array_map('strval', $data),
                    'android'      => $android,
                ],
            ]);

        // UNREGISTERED / INVALID_ARGUMENT mean the token will never work again.
        if ($res->status() === 404 || $res->status() === 400) {
            $device->delete();
            return;
        }
        if ($res->failed()) {
            Log::warning('push.fcm_failed', ['status' => $res->status(), 'body' => $res->body()]);
        }
    }

    /**
     * Google OAuth token for FCM, cached just under its one-hour lifetime so a
     * burst of notifications mints one token rather than one per message.
     */
    private function fcmAccessToken(): ?string
    {
        $raw = config('push.fcm.credentials');
        if (! $raw) {
            return null;
        }

        return Cache::remember('push:fcm:token', 3300, function () use ($raw) {
            $sa = $this->loadServiceAccount($raw);
            if (! isset($sa['client_email'], $sa['private_key'])) {
                return null;
            }

            $now = time();
            $jwt = $this->jwtRs256([
                'iss'   => $sa['client_email'],
                'scope' => self::FCM_SCOPE,
                'aud'   => 'https://oauth2.googleapis.com/token',
                'iat'   => $now,
                'exp'   => $now + 3600,
            ], $sa['private_key']);

            $res = Http::asForm()->timeout(10)->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $jwt,
            ]);

            return $res->successful() ? ($res->json('access_token') ?: null) : null;
        });
    }

    /**
     * `push.fcm.credentials` is either a filesystem path (FCM_CREDENTIALS in
     * .env - the original, still-supported shape) or the service-account JSON
     * itself (what an admin pastes into Settings > Third-Party Integrations,
     * via IntegrationRegistry - there is no server file path a browser form
     * could meaningfully offer). Trying JSON first is cheap and unambiguous:
     * a real file path never starts with '{'.
     */
    private function loadServiceAccount(string $raw): ?array
    {
        $trimmed = trim($raw);
        if ($trimmed === '') {
            return null;
        }

        if ($trimmed[0] === '{') {
            $decoded = json_decode($trimmed, true);
            return is_array($decoded) ? $decoded : null;
        }

        if (! is_readable($trimmed)) {
            return null;
        }

        $decoded = json_decode((string) file_get_contents($trimmed), true);
        return is_array($decoded) ? $decoded : null;
    }

    /* ── APNs (iOS) ────────────────────────────────────────────────────────── */

    private function sendApns(
        UserDevice $device,
        string $title,
        string $body,
        array $data,
        ?int $badge = null,
        ?string $collapseId = null,
        ?string $threadId = null,
    ): void {
        $jwt = $this->apnsToken();
        if (! $jwt) {
            return;
        }

        $host = config('push.apns.production', true)
            ? 'https://api.push.apple.com'
            : 'https://api.sandbox.push.apple.com';

        $headers = [
            'authorization'   => "bearer {$jwt}",
            'apns-topic'      => (string) config('push.apns.bundle_id'),
            'apns-push-type'  => 'alert',
            'apns-priority'   => '10',
        ];

        // Replaces an earlier alert carrying the same id instead of stacking a
        // second one. Apple caps this at 64 bytes and rejects the request
        // outright if it is longer, so it is truncated rather than trusted.
        if ($collapseId !== null && $collapseId !== '') {
            $headers['apns-collapse-id'] = substr($collapseId, 0, 64);
        }

        $aps = [
            'alert' => ['title' => $title, 'body' => $body],
            'sound' => 'default',
        ];

        // The app has always asked for badges (shouldSetBadge: true in
        // services/push.ts) but the server never sent one, so the icon never
        // counted anything. 0 is meaningful - it clears the badge - so this
        // checks for null rather than truthiness.
        if ($badge !== null) {
            $aps['badge'] = $badge;
        }

        if ($threadId !== null && $threadId !== '') {
            $aps['thread-id'] = $threadId;
        }

        $res = Http::withHeaders($headers)
            ->timeout(10)
            ->withOptions(['version' => 2.0]) // APNs is HTTP/2 only
            ->post("{$host}/3/device/{$device->device_token}", [
                'aps' => $aps,
            ] + $data);

        // 410 Gone = the device unregistered. 400 BadDeviceToken likewise.
        if ($res->status() === 410 || $res->json('reason') === 'BadDeviceToken') {
            $device->delete();
            return;
        }
        if ($res->failed()) {
            Log::warning('push.apns_failed', ['status' => $res->status(), 'body' => $res->body()]);
        }
    }

    /** APNs provider token. Valid an hour; Apple rejects tokens refreshed too often. */
    private function apnsToken(): ?string
    {
        $path   = config('push.apns.key_path');
        $keyId  = config('push.apns.key_id');
        $teamId = config('push.apns.team_id');
        if (! $path || ! $keyId || ! $teamId || ! is_readable($path)) {
            return null;
        }

        return Cache::remember('push:apns:token', 3000, function () use ($path, $keyId, $teamId) {
            return $this->jwtEs256(
                ['iss' => $teamId, 'iat' => time()],
                (string) file_get_contents($path),
                $keyId,
            );
        });
    }

    /* ── JWT signing (no library) ──────────────────────────────────────────── */

    private function jwtRs256(array $claims, string $privateKey): string
    {
        $signing = $this->b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT']))
            . '.' . $this->b64(json_encode($claims));

        openssl_sign($signing, $sig, $privateKey, OPENSSL_ALGO_SHA256);

        return $signing . '.' . $this->b64($sig);
    }

    private function jwtEs256(array $claims, string $privateKey, string $keyId): string
    {
        $signing = $this->b64(json_encode(['alg' => 'ES256', 'kid' => $keyId, 'typ' => 'JWT']))
            . '.' . $this->b64(json_encode($claims));

        openssl_sign($signing, $der, $privateKey, OPENSSL_ALGO_SHA256);

        return $signing . '.' . $this->b64($this->derToRaw($der));
    }

    /**
     * openssl emits an ASN.1 DER signature; JOSE wants raw R||S, 32 bytes each.
     * Getting this wrong produces a token Apple rejects with no useful error,
     * which is the usual reason a hand-rolled ES256 JWT "just doesn't work".
     */
    private function derToRaw(string $der): string
    {
        $pos = 2;   // skip the SEQUENCE tag + length
        $pos++;     // INTEGER tag for R
        $rLen = ord($der[$pos++]);
        $r = ltrim(substr($der, $pos, $rLen), "\x00");
        $pos += $rLen;
        $pos++;     // INTEGER tag for S
        $sLen = ord($der[$pos++]);
        $s = ltrim(substr($der, $pos, $sLen), "\x00");

        return str_pad($r, 32, "\x00", STR_PAD_LEFT) . str_pad($s, 32, "\x00", STR_PAD_LEFT);
    }

    private function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
