<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\PushService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendDirectMessagePush implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public User $recipient,
        public User $sender,
        public int $conversationId,
    ) {}

    /**
     * Push a DM to the recipient's devices.
     *
     * Queued for the same reason SendPushNotification is: sending a message is
     * a user-facing request and must not wait on APNs/FCM. Runs on the
     * `notifications` queue, which the worker already drains
     * (deploy/pm2/ecosystem.worker.config.js).
     *
     * Carries ids rather than the message: the body is never pushed (see
     * PushService::sendDirectMessage), so there is nothing here to leak if the
     * payload is ever logged, and a message deleted before the job runs cannot
     * resurrect its text on a lock screen.
     */
    public function handle(PushService $push): void
    {
        $push->sendDirectMessage($this->recipient, $this->sender, $this->conversationId);
    }
}
