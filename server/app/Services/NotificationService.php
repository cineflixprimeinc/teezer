<?php

namespace App\Services;

use App\Jobs\SendPushNotification;
use App\Models\AppNotification;
use App\Models\BlockedUser;
use App\Models\NotificationActor;
use App\Models\User;
use App\Http\Resources\NotificationResource;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;

/**
 * Notification aggregation service (Instagram / TikTok-style bundling).
 *
 * Instead of one row per event, repeated events on the same target collapse into
 * a single UNREAD notification group keyed by (user_id, type, entity). Each
 * unique actor is recorded once in `notification_actors`; the group carries the
 * running actor_count + latest actor so the UI can render "Rahul and 17 others
 * liked your video" and open the full actor list.
 *
 * Guarantees:
 *  • No duplicate cards      - one unread group per (receiver, type, target).
 *  • No double counting      - UNIQUE(notification_id, actor_id) + recount.
 *  • Like→Unlike→Like safe    - count is derived from live actor rows, not ++.
 *  • Read = frozen           - once read, the next event opens a NEW group, so
 *                              a viewed notification never silently mutates.
 */
class NotificationService
{
    /**
     * Aggregation rules per type.
     *   entity=true  → group is scoped to the content (entity_type+entity_id),
     *                  e.g. one bundle per video for likes/comments.
     *   entity=false → group ignores the target and bundles ALL of that type for
     *                  the receiver, e.g. "X and 12 others followed you".
     * Types NOT listed here are never aggregated (each is its own row): follow
     * requests, mentions (distinct comment context), gifts, system, etc.
     */
    private const AGG = [
        'like'         => ['entity' => true,  'verb' => 'liked your video'],
        'comment'      => ['entity' => true,  'verb' => 'commented on your video'],
        'reply'        => ['entity' => true,  'verb' => 'replied to your comment'],
        'comment_like' => ['entity' => true,  'verb' => 'liked your comment'],
        'share'        => ['entity' => true,  'verb' => 'shared your video'],
        'repost'       => ['entity' => true,  'verb' => 'reposted your video'],
        'save'         => ['entity' => true,  'verb' => 'saved your video'],
        'follow'       => ['entity' => false, 'verb' => 'started following you'],
        // Story interactions aggregate for the same reason video ones do: five
        // people reacting to a story is ONE card that counts them, not five
        // rows. Aggregation is also what makes a repeat a no-op - swapping ❤️
        // for 🔥 re-notifies nobody - which is how "no duplicate notifications"
        // is actually enforced rather than hoped for.
        'story_react'  => ['entity' => true,  'verb' => 'reacted to your story'],
        'story_reply'  => ['entity' => true,  'verb' => 'replied to your story'],
        'story_repost' => ['entity' => true,  'verb' => 'reposted your story'],
    ];

    /**
     * Record a notification event. Aggregatable types bundle into the existing
     * unread group; everything else creates a standalone row (legacy behaviour).
     */
    public function notify(User $recipient, string $type, array $payload = []): void
    {
        // Global Reelsoo Control - the one place every in-app notification
        // (aggregated or standalone) is created. Push has its own separate
        // gate inside PushService::fanOut(), which this method still calls
        // below when in-app notifications are allowed but push might not be -
        // the two switches are independent on purpose.
        if (! app(\App\Services\GlobalControls\GlobalControlService::class)->isEnabled('in_app_notifications_enabled')) {
            return;
        }

        $actorId = isset($payload['actor_id']) ? (int) $payload['actor_id'] : null;

        // Never notify yourself.
        if ($actorId !== null && $actorId === (int) $recipient->id) {
            return;
        }

        // Never notify across a block, in either direction. A blocked actor's
        // like/comment/follow used to still create a card (and a push) for the
        // person who blocked them - the interaction was hidden everywhere in
        // the app EXCEPT the one place that announces it. Symmetric on purpose:
        // blocking hides both ways, so neither side is told about the other.
        if ($actorId !== null && BlockedUser::existsBetween($actorId, (int) $recipient->id)) {
            return;
        }

        $agg = self::AGG[$type] ?? null;

        if ($agg && $actorId !== null) {
            [$notification, $isNew, $changed] = $this->aggregate($recipient, $type, $agg, $actorId, $payload);
        } else {
            $notification = $this->createStandalone($recipient, $type, $actorId, $payload);
            $isNew = true;
            $changed = true;
        }

        // Push only when the group actually changed (new group, or a genuinely
        // new actor). A repeated like by the same user is a no-op - no push.
        if ($changed) {
            SendPushNotification::dispatch($recipient, $notification)->onQueue('notifications');
        }

        $this->pushRealtime($recipient->id, $notification, $isNew ? 'notification:new' : 'notification:update');
    }

    /**
     * Reverse an aggregatable event (unlike, unfollow, comment/comment-like
     * removed). Removes the actor from the UNREAD group and re-derives the count
     * so it always reflects users with a currently-active interaction. Deletes
     * the group when the last actor leaves. Read groups are left frozen.
     */
    public function withdraw(int $recipientId, string $type, array $payload = []): void
    {
        $agg     = self::AGG[$type] ?? null;
        $actorId = isset($payload['actor_id']) ? (int) $payload['actor_id'] : null;
        if ($agg === null || $actorId === null) {
            return;
        }

        DB::transaction(function () use ($recipientId, $type, $agg, $actorId, $payload) {
            $this->advisoryLock($recipientId, $type, $agg, $payload);
            $notif = $this->lockGroup($recipientId, $type, $agg, $payload);
            if (!$notif) {
                return;
            }

            $removed = NotificationActor::where('notification_id', $notif->id)
                ->where('actor_id', $actorId)
                ->delete();
            if (!$removed) {
                return; // actor wasn't part of this group - nothing to do
            }

            $count = (int) NotificationActor::where('notification_id', $notif->id)->count();

            if ($count <= 0) {
                $notif->delete(); // cascade clears any residual actor rows
                $this->pushRealtime($recipientId, $notif, 'notification:remove');
                return;
            }

            // Promote the most recent remaining actor to "latest".
            $latest = NotificationActor::where('notification_id', $notif->id)
                ->orderByDesc('id')
                ->first();
            $name = $latest ? $this->actorName((int) $latest->actor_id) : '';

            $notif->forceFill([
                'actor_id'    => $latest?->actor_id,
                'actor_count' => $count,
                'message'     => $this->aggregatedMessage($type, $name, $count),
                'updated_at'  => now(),
            ])->save();

            $this->pushRealtime($recipientId, $notif, 'notification:update');
        });
    }

    /* ── internals ──────────────────────────────────────────────────────── */

    /** @return array{0: AppNotification, 1: bool, 2: bool} [notification, isNew, changed] */
    private function aggregate(User $recipient, string $type, array $agg, int $actorId, array $payload): array
    {
        return DB::transaction(function () use ($recipient, $type, $agg, $actorId, $payload) {
            // Serialize find-or-create per group key so two concurrent likers can
            // never create two groups (the advisory lock is held until commit).
            $this->advisoryLock($recipient->id, $type, $agg, $payload);

            $notif = $this->lockGroup($recipient->id, $type, $agg, $payload);

            if ($notif) {
                $inserted = $this->insertActor($notif->id, $actorId);
                if ($inserted) {
                    $count = (int) NotificationActor::where('notification_id', $notif->id)->count();
                    $notif->forceFill([
                        'actor_id'           => $actorId,
                        'actor_count'        => $count,
                        'message'            => $this->aggregatedMessage($type, $this->actorName($actorId), $count),
                        'comment_id'         => $payload['comment_id'] ?? $notif->comment_id,
                        'latest_activity_at' => now(),
                        'updated_at'         => now(),
                    ])->save();
                }
                // `changed` == a genuinely new actor joined the group.
                return [$notif, false, $inserted];
            }

            $notif = AppNotification::create([
                'user_id'            => $recipient->id,
                'actor_id'           => $actorId,
                'actor_count'        => 1,
                'type'               => $type,
                'entity_type'        => $agg['entity'] ? ($payload['entity_type'] ?? null) : null,
                'entity_id'          => $agg['entity'] ? ($payload['entity_id'] ?? null) : null,
                'comment_id'         => $payload['comment_id'] ?? null,
                'message'            => $payload['message'] ?? $this->aggregatedMessage($type, $this->actorName($actorId), 1),
                'is_read'            => false,
                'action_status'      => $payload['action_status'] ?? null,
                'latest_activity_at' => now(),
                'updated_at'         => now(),
            ]);
            $this->insertActor($notif->id, $actorId);
            return [$notif, true, true];
        });
    }

    /**
     * Serialize all writes to one aggregation group (Postgres advisory xact lock,
     * auto-released at commit/rollback). This is the concurrency guard that keeps
     * two simultaneous events from creating duplicate groups - without a unique
     * index (which couldn't be added over prod's pre-aggregation duplicates).
     * No-op on non-Postgres drivers (dev sqlite/mysql).
     */
    private function advisoryLock(int $userId, string $type, array $agg, array $payload): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }
        $target = $agg['entity']
            ? (($payload['entity_type'] ?? '') . ':' . ($payload['entity_id'] ?? ''))
            : '-';
        $key = "notif:{$userId}:{$type}:{$target}";
        DB::statement('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [$key]);
    }

    /** Standalone (non-aggregated) notification - legacy one-row-per-event path. */
    private function createStandalone(User $recipient, string $type, ?int $actorId, array $payload): AppNotification
    {
        $notif = AppNotification::create([
            'user_id'            => $recipient->id,
            'actor_id'           => $actorId,
            'actor_count'        => 1,
            'type'               => $type,
            'entity_type'        => $payload['entity_type'] ?? null,
            'entity_id'          => $payload['entity_id'] ?? null,
            'comment_id'         => $payload['comment_id'] ?? null,
            'message'            => $payload['message'] ?? '',
            'is_read'            => false,
            'action_status'      => $payload['action_status'] ?? null,
            'latest_activity_at' => now(),
            'updated_at'         => now(),
        ]);

        if ($actorId !== null) {
            $this->insertActor($notif->id, $actorId);
        }

        return $notif;
    }

    /** Lock the current UNREAD group for (user, type, target), or null. */
    private function lockGroup(int $userId, string $type, array $agg, array $payload): ?AppNotification
    {
        $query = AppNotification::where('user_id', $userId)
            ->where('type', $type)
            ->where('is_read', false);

        if ($agg['entity']) {
            $query->where('entity_type', $payload['entity_type'] ?? null)
                  ->where('entity_id', $payload['entity_id'] ?? null);
        } else {
            $query->whereNull('entity_id');
        }

        return $query->lockForUpdate()->first();
    }

    /** Insert an actor, ignoring duplicates. Returns true only if a row was added. */
    private function insertActor(int $notificationId, int $actorId): bool
    {
        return NotificationActor::insertOrIgnore([
            'notification_id' => $notificationId,
            'actor_id'        => $actorId,
            'created_at'      => now(),
        ]) > 0;
    }

    private function actorName(int $actorId): string
    {
        $u = User::select('name', 'username')->find($actorId);
        return $u?->name ?: ($u?->username ? "@{$u->username}" : 'Someone');
    }

    /** Fallback display/push message; the API resource builds the richer version. */
    private function aggregatedMessage(string $type, string $name, int $count): string
    {
        $verb = self::AGG[$type]['verb'] ?? 'interacted with your content';
        if ($count <= 1) {
            return "{$name} {$verb}";
        }
        $others = $count - 1;
        return "{$name} and {$others} " . ($others === 1 ? 'other' : 'others') . " {$verb}";
    }

    /**
     * Fire-and-forget realtime nudge so the recipient's inbox badge + list update
     * instantly. `notification:new` adds a card, `notification:update` patches the
     * existing card in place (no duplicate), `notification:remove` drops it.
     */
    private function pushRealtime(int $userId, AppNotification $notification, string $event): void
    {
        RealtimeBus::publish([RealtimeBus::userRoom($userId)], $event, [
            'notification_id'    => $notification->id,
            'type'               => $notification->type,
            'actor_count'        => (int) $notification->actor_count,
            'is_read'            => (bool) $notification->is_read,
            'latest_activity_at' => optional($notification->latest_activity_at)->toIso8601String(),

            // The whole row, in the exact shape GET /notifications returns.
            //
            // The five scalars above say that SOMETHING happened but not what to
            // draw - no message, no actor, no thumbnail - so every client that
            // received one had to turn around and refetch the list to render it.
            // That is a round trip per event on every open client, and it is why
            // the notification only ever appeared after something else triggered
            // a fetch. Sending the row itself lets a client insert or update in
            // place, which is the entire point of the realtime channel.
            //
            // Null when serialisation fails for any reason: the scalars above
            // still identify the group, so a client can fall back to a refetch
            // rather than lose the event. Realtime must never be able to break
            // notification creation - the row is already committed by here.
            // Skipped for `notification:remove`: the row is being deleted, and a
            // client only needs the id to drop it from its list.
            'notification'       => $event === 'notification:remove' ? null : $this->serialize($notification),
        ]);
    }

    /**
     * One notification in the same shape NotificationController::index returns,
     * via the same presenter and the same resource - one definition of what a
     * notification looks like on the wire, not a second one that drifts.
     */
    private function serialize(AppNotification $notification): ?array
    {
        try {
            $fresh = AppNotification::with('actor')->find($notification->id);
            if (!$fresh) {
                return null;
            }

            NotificationPresenter::enrich([$fresh]);

            return (new NotificationResource($fresh))->toArray(request());
        } catch (\Throwable $e) {
            Log::warning('notification.serialize_failed', [
                'notification_id' => $notification->id,
                'error'           => $e->getMessage(),
            ]);

            return null;
        }
    }

    /** Is this type server-aggregated (vs. one row per event)? */
    public static function isAggregatable(string $type): bool
    {
        return isset(self::AGG[$type]);
    }

    /**
     * The Instagram/TikTok-style bundled sentence for an aggregated group, given
     * the most-recent actor names (latest first) and the total unique count:
     *   1 → "Rahul liked your video"
     *   2 → "Rahul and Sita liked your video"
     *   3 → "Rahul, Sita and Ram liked your video"
     *   n → "Rahul and 17 others liked your video"
     *   (no names) → "20 people liked your video"
     *
     * @param string[] $names up to 3 recent actor display names, latest first
     */
    public static function displayMessage(string $type, array $names, int $count): string
    {
        $verb = self::AGG[$type]['verb'] ?? null;
        if ($verb === null) {
            return '';
        }
        $names = array_values(array_filter($names, static fn ($n) => is_string($n) && $n !== ''));
        $count = max($count, count($names));
        if ($count <= 0) {
            return '';
        }
        if (empty($names)) {
            return "{$count} " . ($count === 1 ? 'person' : 'people') . " {$verb}";
        }

        $a = $names[0];
        if ($count === 1) {
            return "{$a} {$verb}";
        }
        $b = $names[1] ?? null;
        if ($count === 2 && $b !== null) {
            return "{$a} and {$b} {$verb}";
        }
        $c = $names[2] ?? null;
        if ($count === 3 && $b !== null && $c !== null) {
            return "{$a}, {$b} and {$c} {$verb}";
        }
        $others = $count - 1;
        return "{$a} and {$others} " . ($others === 1 ? 'other' : 'others') . " {$verb}";
    }

    /**
     * Build a human-readable message for common notification types.
     */
    public static function buildMessage(string $type, string $actorName, array $extra = []): string
    {
        return match($type) {
            'like'                      => "{$actorName} liked your video",
            'comment'                   => "{$actorName} commented: \"{$extra['preview']}\"",
            'save'                      => "{$actorName} saved your video",
            'sound'                     => isset($extra['audio_title'])
                                            ? "{$actorName} used your sound: {$extra['audio_title']}"
                                            : "{$actorName} used your sound",
            'profile_view'              => "{$actorName} viewed your profile",
            'follow'                    => "{$actorName} started following you",
            'post'                      => "{$actorName} posted a new video",
            'follow_request'            => "{$actorName} requested to follow you",
            'follow_request_accepted'   => "{$actorName} accepted your follow request",
            'tag_request'               => "{$actorName} tagged you in a post",
            'tag_request_accepted'      => "{$actorName} accepted your tag",
            'tag_request_rejected'      => "{$actorName} declined your tag",
            'collab_request'            => "{$actorName} added you as a collab partner on a post",
            'collab_request_accepted'   => "{$actorName} accepted your collab",
            'collab_request_rejected'   => "{$actorName} declined your collab",
            'mention'                   => "{$actorName} mentioned you in " . ($extra['source'] ?? 'a comment'),
            'story_mention'             => "{$actorName} mentioned you in their story",
            'gift'                      => "{$actorName} sent you a {$extra['gift']} gift!",
            'verification'              => 'Your verification request has been ' . ($extra['status'] ?? 'reviewed'),
            'report_actioned'           => 'Action was taken on your report',
            'message_request'           => "{$actorName} sent you a message request",
            'message_request_accepted'  => "{$actorName} accepted your message request",
            'reply'                     => "{$actorName} replied to your comment",
            'comment_like'              => "{$actorName} liked your comment",
            'share'                     => "{$actorName} shared your video",
            'repost'                    => "{$actorName} reposted your video",
            'system'                    => $extra['message'] ?? 'You have a new notification',
            // Names the programme. Without this it fell to the default below and
            // read "You have a new notification" - uninformative for the one
            // notification whose entire job is to say WHICH programme opened.
            // program_label is set by ProgramWaitlistNotifier alongside
            // program_key; the fallback covers a programme deleted between the
            // notification being written and being read.
            'monetization_available'    => isset($extra['program_label'])
                                            ? "{$extra['program_label']} is now available on Teezer"
                                            : 'A monetization feature is now available',
            default                     => 'You have a new notification',
        };
    }
}
