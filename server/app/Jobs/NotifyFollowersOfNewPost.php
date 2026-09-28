<?php

namespace App\Jobs;

use App\Models\Follower;
use App\Models\User;
use App\Models\Video;
use App\Services\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Fans a "posted a new video" notification out to every follower who has
 * explicitly turned the bell on for this creator (Follower.notify_posts -
 * see that migration's own doc comment for why this is a per-follow
 * override rather than gated on the global push_creator preference too).
 *
 * Dispatched from VideoObserver on the moment a video's status actually
 * transitions to 'published' (both "born published" and "draft ->
 * published later" - see that observer's created()/updated()), never
 * from a controller directly, so every path that can publish a video
 * triggers this exactly once through one place.
 *
 * Runs on its own queue (not `notifications`, which SendPushNotification
 * - dispatched once per recipient below - already uses) so a creator
 * with a very large notify-on follower base fanning out doesn't compete
 * with the per-recipient push jobs it is itself about to enqueue.
 */
class NotifyFollowersOfNewPost implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $videoId, public int $creatorId) {}

    public function handle(NotificationService $notifs): void
    {
        $video = Video::find($this->videoId);
        // Deleted/unpublished again before the queue got to it - nothing to announce.
        if (!$video || $video->status !== 'published') {
            return;
        }

        $creator = User::find($this->creatorId);
        if (!$creator) {
            return;
        }

        Follower::where('following_id', $this->creatorId)
            ->where('status', 'accepted')
            ->where('notify_posts', true)
            ->chunkById(200, function ($rows) use ($notifs, $creator, $video) {
                $followers = User::whereIn('id', $rows->pluck('follower_id'))->get()->keyBy('id');
                foreach ($rows as $row) {
                    $follower = $followers->get($row->follower_id);
                    if (!$follower) {
                        continue; // deleted account since the query above ran
                    }
                    $notifs->notify($follower, 'post', [
                        'actor_id'    => $creator->id,
                        'entity_type' => 'video',
                        'entity_id'   => $video->id,
                        'message'     => NotificationService::buildMessage('post', $creator->name ?: "@{$creator->username}"),
                    ]);
                }
            });
    }
}
