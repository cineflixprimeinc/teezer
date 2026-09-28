<?php

namespace App\Http\Resources;

use App\Models\Story;
use App\Services\StorageService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $authUser = $request->user();
        $model = $this->resource;
        $attr = fn (string $key) => $model instanceof \Illuminate\Database\Eloquent\Model
            ? $model->getAttribute($key)
            : null;

        $followersCount = $attr('followers_count') ?? $this->profile?->total_followers ?? 0;
        $followingCount = $attr('following_count') ?? $this->profile?->total_following ?? 0;
        $likesCount = $attr('total_likes_received') ?? $attr('likes_count') ?? $this->profile?->total_likes ?? 0;
        // Prefer the dynamically computed public-published count injected by show().
        // profile.total_videos now only counts published videos (fixed in VideoObserver),
        // so both sources are safe to use as fallback.
        $videosCount = $attr('videos_count') ?? $this->profile?->total_videos ?? 0;
        $totalLikesReceived = $attr('total_likes_received');
        $totalVideoViews = $attr('total_video_views');

        return [
            'id'           => $this->id,
            'name'         => $this->name,
            'username'     => $this->username,
            'avatar'       => $this->avatar ? Storage::url($this->avatar) : StorageService::defaultAvatarUrl(),
            'bio'          => $this->bio,
            'country'      => $this->country,
            'location'     => $this->location,
            'categories'   => $this->categories ?? [],
            'website'      => $this->website,
            'social_links' => $this->whenLoaded('socialLinks', fn () =>
                $this->socialLinks->map(fn ($l) => [
                    'platform' => $l->platform,
                    'url'      => $l->url,
                ])->values()->all(),
                []
            ),
            'is_verified'  => (bool) $this->is_verified,
            'is_private'   => (bool) $this->is_private,
            'role'         => $this->role,

            // Prefer freshly computed profile totals when the endpoint provides them.
            'followers_count'      => (int) $followersCount,
            'following_count'      => (int) $followingCount,
            'likes_count'          => (int) $likesCount,
            'videos_count'         => (int) $videosCount,
            'total_likes_received' => $totalLikesReceived === null ? null : (int) $totalLikesReceived,
            'total_video_views'    => $totalVideoViews === null ? null : (int) $totalVideoViews,

            // Auth-context fields (only when authenticated).
            //
            // is_following = "does the *current logged-in viewer* follow the
            // user this resource represents?". Callers are expected to pre-
            // populate the dynamic `is_following` attribute on each model
            // (single-query for `show`, batch-prepared for list endpoints) to
            // avoid the N+1 a per-row exists() check would incur. We fall back
            // to an exists() lookup if a caller forgets, so the value is never
            // silently wrong.
            'is_following' => $authUser
                ? (isset($this->is_following)
                    ? (bool) $this->is_following
                    : $authUser->following()->where('following_id', $this->id)->exists())
                : false,
            'is_blocked'      => $authUser ? (bool) $this->when(
                isset($this->is_blocked), $this->is_blocked, false) : false,
            'follow_status' => $authUser
                ? ($attr('follow_status') ?? 'none')
                : 'none',
            // The profile page's bell icon - "notify me when this creator
            // posts" (Follower.notify_posts). No exists()-query fallback
            // like is_following above needs, since it is meaningless
            // without an accepted follow and every caller that populates
            // is_following/follow_status already fetches this same row.
            'notify_posts' => $authUser ? (bool) ($attr('notify_posts') ?? false) : false,

            'created_at' => $this->created_at->toIso8601String(),

            // True when the user has at least one active (published + not expired) story
            'has_story' => $attr('has_story') ?? Story::where('user_id', $this->id)
                ->where('status', 'published')
                ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->exists(),

            // The Shop tab/button gate - see ShopController::approvedShop().
            // Server-authoritative: the mobile client shows Shop vs Share off
            // this field alone, never off local/cached shop state.
            'has_approved_shop' => \App\Models\Shop::where('user_id', $this->id)
                ->where('status', \App\Models\Shop::STATUS_APPROVED)
                ->exists(),
        ];
    }
}
