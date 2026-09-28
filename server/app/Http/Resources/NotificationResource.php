<?php

namespace App\Http\Resources;

use App\Services\DeepLinkService;
use App\Services\NotificationService;
use App\Services\StorageService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/**
 * A single (already server-aggregated) notification group. The controller
 * attaches `recent_actors` (latest few actors, one batched query - no N+1) so
 * this resource can render "Rahul, Sita and 3 others liked your video" plus a
 * stack of actor avatars, and expose the running actor_count.
 */
class NotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // Comment-anchored notifications resolve their video in ONE batched
        // query (attachCommentVideoIds). Surfacing it as target_reel_id lets
        // clients open the right reel directly instead of dead-ending on a
        // /comment/{id} link they cannot dereference.
        $reelId = $this->entity_type === 'video'
            ? $this->entity_id
            : ($this->video_id_for_comment ?? null);
        $type   = (string) $this->type;

        // recent_actors is attached by NotificationController::index (latest first).
        $recent = is_array($this->recent_actors) ? $this->recent_actors : [];
        $names  = array_map(static fn ($a) => $a['name'], $recent);
        $count  = (int) ($this->actor_count ?? 1);

        // Aggregatable types get the bundled sentence built from live actor names;
        // everything else (mentions, follow requests, system…) keeps its own copy.
        $aggregated = NotificationService::isAggregatable($type);
        $message = $aggregated
            ? NotificationService::displayMessage($type, $names, $count)
            : (string) ($this->message ?? '');

        return [
            'id'             => $this->id,
            'type'           => $type,
            'message'        => $message,
            'message_preview'=> $message,
            'entity_type'    => $this->entity_type,
            'entity_id'      => $this->entity_id,
            'comment_id'     => $this->comment_id,
            'target_reel_id' => $reelId,
            'thumbnail'      => $this->thumb_url ?? null,

            // Where this notification goes, decided once on the server. Clients
            // route from this string instead of re-deriving a destination from
            // (type, entity_type, entity_id) - three surfaces were each doing
            // that differently. `video_id_for_comment` is attached by the
            // controller in one batched query; null for every other type.
            'deep_link'      => DeepLinkService::forNotification(
                $this->resource,
                $this->video_id_for_comment ?? null,
            ),

            // Aggregation surface for the clients.
            'actor_count'    => $count,
            'is_aggregated'  => $aggregated && $count > 1,
            // Avatar stack (latest actors first) - bounded, no N+1.
            'actors'         => $recent,

            // Each server-side group is its own bundle now, so the client no
            // longer needs to re-bundle; kept for backward compatibility.
            'group_key'      => "n:{$this->id}",
            'is_read'        => (bool) $this->is_read,
            'action_status'  => $this->action_status,
            // Latest actor (drives the leading avatar when `actors` is absent).
            'actor'          => $this->whenLoaded('actor', fn () => [
                'id'          => $this->actor->id,
                'username'    => $this->actor->username,
                'name'        => $this->actor->name,
                'avatar'      => $this->actor->avatar ? Storage::url($this->actor->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified' => (bool) $this->actor->is_verified,
            ]),
            'created_at'     => $this->created_at->toIso8601String(),
            'updated_at'     => optional($this->latest_activity_at ?? $this->updated_at ?? $this->created_at)->toIso8601String(),
        ];
    }
}
