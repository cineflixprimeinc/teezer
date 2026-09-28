<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use App\Services\StorageService;
use Illuminate\Support\Facades\Storage;

class CommentResource extends JsonResource
{
    /**
     * Set once per request in the controller to inject the video owner's ID
     * so is_author can be computed without an extra query per comment.
     * PHP-FPM resets static state per request, so this is safe under concurrency.
     */
    public static ?int $videoOwnerId = null;

    public function toArray(Request $request): array
    {
        $authUser     = $request->user();
        $userReaction = null;

        if ($authUser) {
            $userReaction = $this->reactions()
                ->where('user_id', $authUser->id)
                ->value('reaction_type');
        }

        return [
            'id'                    => $this->id,
            'body'                  => $this->body,
            'love_count'            => (int) ($this->likes_count ?? 0),
            'dislike_count'         => (int) ($this->dislike_count ?? 0),
            'reply_count'           => (int) ($this->reply_count ?? 0),
            'reaction_score'        => (int) ($this->reaction_score ?? 0),
            'is_pinned'             => (bool) $this->is_pinned,
            'pin_order'             => $this->pin_order,
            'parent_id'             => $this->parent_id,
            'root_id'               => $this->root_id,  // Identifies the main comment this reply belongs to
            'comment_rank'          => $this->comment_rank,
            'current_user_reaction' => $userReaction,
            'is_own'                => $authUser ? $this->user_id === $authUser->id : false,
            // True when the commenter is the video/post owner - drives the Author badge.
            'is_author'             => static::$videoOwnerId !== null
                                        && (int) $this->user_id === static::$videoOwnerId,
            'is_edited'             => (bool) ($this->is_edited ?? false),
            'edited_at'             => isset($this->edited_at) ? $this->edited_at->toIso8601String() : null,
            'replies_count'         => $this->whenLoaded('replies', fn () => $this->replies->count(), 0),

            'user' => $this->whenLoaded('user', fn () => [
                'id'          => $this->user->id,
                'username'    => $this->user->username,
                'name'        => $this->user->name,
                'avatar'      => $this->user->avatar ? Storage::url($this->user->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified' => (bool) $this->user->is_verified,
            ]),

            'gif_url'         => $this->gif_url,
            'gif_preview_url' => $this->gif_preview_url,
            'gif_provider'    => $this->gif_provider,
            'gif_provider_id' => $this->gif_provider_id,
            // Uploaded photo: stored as an R2 key, resolved to a URL on the way out.
            'image_url'       => $this->image_path ? Storage::url($this->image_path) : null,

            /*
             * A gift sent on this post. Present only on gift comments, so a
             * client can switch the row to the gift's own animated artwork
             * rather than rendering the body as text. icon_url is site-relative
             * on the web app, which is why it is absolutised here - RN cannot
             * resolve a leading slash.
             */
            'gift'            => $this->gift_id && $this->relationLoaded('gift') && $this->gift ? [
                'id'         => $this->gift->id,
                'name'       => $this->gift->name,
                'slug'       => $this->gift->slug,
                'icon_url'   => $this->gift->icon_url
                    ? (str_starts_with($this->gift->icon_url, '/')
                        ? rtrim(config('app.web_url', 'https://teezer.live'), '/') . $this->gift->icon_url
                        : $this->gift->icon_url)
                    : null,
                'coins'      => (int) ($this->gift_coins ?? $this->gift->coin_value),
            ] : null,
            'created_at'      => $this->created_at->toIso8601String(),
        ];
    }
}
