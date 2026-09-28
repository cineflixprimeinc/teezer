<?php

namespace App\Jobs;

use App\Models\User;
use App\Models\AppNotification;
use App\Services\PushService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendPushNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public User $recipient,
        public AppNotification $notification
    ) {}

    /**
     * Fan the notification out to the recipient's registered devices.
     *
     * Runs on the `notifications` queue so a slow or unreachable transport never
     * blocks notification creation - PushService additionally swallows per-device
     * failures so one dead token cannot stop the rest of the fan-out.
     */
    public function handle(PushService $push): void
    {
        $push->send($this->recipient, $this->notification);
    }
}
