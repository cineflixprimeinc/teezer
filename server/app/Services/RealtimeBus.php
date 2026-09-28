<?php

namespace App\Services;

/**
 * Realtime event bus (Laravel → clients via Centrifugo).
 *
 * The single publish seam for all Laravel-originated realtime events
 * (video.liked, comment.created, user.followed, message.new, notification:new,
 * screentime.update, …). Publishes to Centrifugo (channel == room name); the
 * publication carries the {event, payload} envelope every client consumes, so
 * all ~12 call sites (VideoInteractionController, CommentController,
 * FollowController, MessageController, UserController, ScreenTimeService, …)
 * stay untouched.
 *
 * Fire-and-forget by design: a transport failure NEVER breaks the originating
 * request - realtime is a best-effort enhancement on top of the authoritative
 * REST response + optimistic UI.
 */
class RealtimeBus
{
    /**
     * Publish an event to one or more channels.
     *
     * @param string[]            $rooms   e.g. ['video:42'] or ['user:7']
     * @param string              $event   e.g. 'video.liked'
     * @param array<string,mixed> $payload JSON-serialisable event data
     */
    public static function publish(array $rooms, string $event, array $payload = []): void
    {
        $rooms = array_values(array_filter($rooms, static fn ($r) => is_string($r) && $r !== ''));
        if (empty($rooms) || $event === '') {
            return;
        }

        CentrifugoClient::broadcast($rooms, ['event' => $event, 'payload' => $payload]);
    }

    /** Channel for everyone currently viewing a given video (public). */
    public static function videoRoom(int $videoId): string
    {
        return "video:{$videoId}";
    }

    /** Per-user channel (private - DMs, notifications, calls, presence, …). */
    public static function userRoom(int $userId): string
    {
        return "user:{$userId}";
    }

    /** Per-conversation channel (private - group chat, typing, receipts). */
    public static function convRoom(int $conversationId): string
    {
        return "conv:{$conversationId}";
    }
}
