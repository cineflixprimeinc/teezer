<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use App\Services\StorageService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Shapes a single comment for the Creator-Studio comments inbox. Includes the
 * commenter, a thumbnail-sized summary of the content it was left on, engagement
 * counts, moderation flags and the derived inbox `status`.
 *
 * Expects the query to have selected the aliases `creator_reply_count` and
 * `pending_report_count`, and to have set static::$creatorId for the request.
 */
class StudioCommentResource extends JsonResource
{
    /** Set once per request by the controller (the authenticated creator). */
    public static ?int $creatorId = null;

    public function toArray(Request $request): array
    {
        $creatorId      = static::$creatorId;
        $isOwn          = $creatorId !== null && (int) $this->user_id === $creatorId;
        $creatorReplied = (int) ($this->creator_reply_count ?? 0) > 0;
        $pendingReports = (int) ($this->pending_report_count ?? 0);
        $held           = (bool) $this->held_for_review || $pendingReports > 0;

        return [
            'id'              => $this->id,
            'body'            => $this->body,
            'status'          => $this->resolveStatus($isOwn, $creatorReplied, $held),
            'love_count'      => (int) ($this->likes_count ?? 0),
            'dislike_count'   => (int) ($this->dislike_count ?? 0),
            'reply_count'     => (int) ($this->reply_count ?? 0),
            'is_pinned'       => (bool) $this->is_pinned,
            'is_hidden'       => (bool) $this->is_hidden,
            'is_spam'         => (bool) $this->is_spam,
            'held_for_review' => $held,
            'is_own'          => $isOwn,
            'is_edited'       => (bool) ($this->is_edited ?? false),
            'creator_replied' => $creatorReplied,
            'seen'            => $this->creator_seen_at !== null,
            'pending_reports' => $pendingReports,
            'note'            => $this->creator_note,
            'gif_url'         => $this->gif_url,
            'gif_preview_url' => $this->gif_preview_url,
            /** The creator's own reaction, so the heart on a card can render
             *  filled without being tapped first. Needs the query to have
             *  selected the `viewer_reaction` alias; null when it has not. */
            'current_user_reaction' => $this->viewer_reaction ?: null,
            'image_url'       => $this->image_path ? Storage::url($this->image_path) : null,
            'created_at'      => $this->created_at->toIso8601String(),

            'user' => $this->whenLoaded('user', fn () => [
                'id'              => $this->user->id,
                'username'        => $this->user->username,
                'name'            => $this->user->name,
                'avatar'          => $this->user->avatar ? Storage::url($this->user->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified'     => (bool) $this->user->is_verified,
                'followers_count' => (int) ($this->user->followers_count ?? 0),
                'joined_at'       => $this->user->created_at?->toIso8601String(),
            ]),

            'video' => $this->whenLoaded('video', fn () => $this->videoSummary()),
        ];
    }

    private function resolveStatus(bool $isOwn, bool $creatorReplied, bool $held): string
    {
        if ($this->is_spam)                 return 'spam';
        if ($held)                          return 'held';
        if ($creatorReplied || $isOwn)      return 'replied';
        if ($this->creator_seen_at === null) return 'unread';
        return 'needs_reply';
    }

    private function videoSummary(): array
    {
        $video = $this->video;
        $disk  = config('filesystems.default', 'r2');

        $thumb = null;
        if ($video->thumbnail_url) {
            $thumb = Storage::disk($disk)->url($video->thumbnail_url);
        } elseif (!empty($video->media_items) && isset($video->media_items[0]['object_key'])) {
            $thumb = Storage::disk($disk)->url($video->media_items[0]['object_key']);
        } elseif (Str::startsWith($video->mime_type ?? '', 'image/') && $video->video_url) {
            $thumb = Storage::disk($disk)->url($video->video_url);
        }

        $mediaType = !empty($video->media_items)
            ? 'image_carousel'
            : (Str::startsWith($video->mime_type ?? '', 'image/') ? 'image' : 'video');

        return [
            'id'            => $video->id,
            'title'         => $video->title ?: ($video->caption ?: 'Untitled'),
            'thumbnail_url' => $thumb,
            'media_type'    => $mediaType,
            'status'        => $video->status,
        ];
    }
}
